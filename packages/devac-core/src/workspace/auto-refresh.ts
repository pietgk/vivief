/**
 * Hub Auto-Refresh
 *
 * Subscribes to seed change events and automatically refreshes
 * the hub when seeds are updated.
 *
 * Features:
 * - Debounces per-repo changes
 * - Batches multiple repo changes together
 * - Configurable timing and behavior
 * - Emits refresh events for monitoring
 */

import { EventEmitter } from "node:events";
import type { CentralHub } from "../hub/central-hub.js";
import type { SeedDetector } from "./seed-detector.js";
import type { AutoRefreshOptions, HubRefreshEvent, SeedChangeEvent } from "./types.js";

/**
 * Auto-refresh handler
 */
export type RefreshEventHandler = (event: HubRefreshEvent) => void;

/**
 * Auto-refresh statistics
 */
export interface AutoRefreshStats {
  /** Number of refreshes triggered */
  refreshCount: number;

  /** Number of repos refreshed */
  reposRefreshed: number;

  /** Last refresh timestamp */
  lastRefreshTime: number | null;

  /** Is currently active */
  isActive: boolean;

  /** Pending repos waiting for refresh */
  pendingRepos: number;
}

/**
 * Auto-refresh interface
 */
export interface AutoRefresher {
  /** Start auto-refresh subscription */
  start(seedDetector: SeedDetector): void;

  /** Stop auto-refresh */
  stop(): void;

  /** Check if active */
  isActive(): boolean;

  /** Get statistics */
  getStats(): AutoRefreshStats;

  /** Register handler for refresh events */
  on(event: "refresh", handler: RefreshEventHandler): void;

  /** Remove handler */
  off(event: "refresh", handler: RefreshEventHandler): void;

  /** Force refresh for specific repos */
  refreshRepos(repoIds: string[]): Promise<HubRefreshEvent>;
}

/**
 * Pending refresh info
 */
interface PendingRefresh {
  repoId: string;
  repoPath: string;
  firstSeen: number;
}

/**
 * Auto-refresh implementation
 */
class AutoRefresherImpl implements AutoRefresher {
  private hub: CentralHub;
  private options: Required<AutoRefreshOptions>;
  private emitter = new EventEmitter();
  private active = false;
  private unsubscribe: (() => void) | null = null;
  private pendingRefreshes = new Map<string, PendingRefresh>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private batchTimer: NodeJS.Timeout | null = null;
  private stats: AutoRefreshStats = {
    refreshCount: 0,
    reposRefreshed: 0,
    lastRefreshTime: null,
    isActive: false,
    pendingRepos: 0,
  };

  constructor(hub: CentralHub, options: AutoRefreshOptions = {}) {
    this.hub = hub;
    this.options = {
      debounceMs: options.debounceMs ?? 500,
      batchChanges: options.batchChanges ?? true,
      maxBatchWaitMs: options.maxBatchWaitMs ?? 1000,
    };
  }

  start(seedDetector: SeedDetector): void {
    if (this.active) {
      return;
    }

    // Subscribe to seed changes
    const handler = (event: SeedChangeEvent) => this.handleSeedChange(event);
    seedDetector.on("seed-change", handler);

    this.unsubscribe = () => seedDetector.off("seed-change", handler);
    this.active = true;
    this.stats.isActive = true;
  }

  stop(): void {
    if (!this.active) {
      return;
    }

    // Unsubscribe
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Cancel timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.pendingRefreshes.clear();
    this.active = false;
    this.stats.isActive = false;
    this.stats.pendingRepos = 0;
  }

  isActive(): boolean {
    return this.active;
  }

  getStats(): AutoRefreshStats {
    return {
      ...this.stats,
      pendingRepos: this.pendingRefreshes.size,
    };
  }

  on(event: "refresh", handler: RefreshEventHandler): void {
    this.emitter.on(event, handler);
  }

  off(event: "refresh", handler: RefreshEventHandler): void {
    this.emitter.off(event, handler);
  }

  async refreshRepos(repoIds: string[]): Promise<HubRefreshEvent> {
    const errors: string[] = [];
    let packagesUpdated = 0;
    const refreshedRepos: string[] = [];

    for (const repoId of repoIds) {
      try {
        const result = await this.hub.refreshRepo(repoId);
        if (result.reposRefreshed > 0) {
          refreshedRepos.push(repoId);
          packagesUpdated += result.packagesUpdated;
        }
        if (result.errors.length > 0) {
          errors.push(...result.errors);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const event: HubRefreshEvent = {
      type: "hub-refresh",
      timestamp: new Date().toISOString(),
      refreshedRepos,
      packagesUpdated,
      errors,
    };

    // Update stats
    this.stats.refreshCount++;
    this.stats.reposRefreshed += refreshedRepos.length;
    this.stats.lastRefreshTime = Date.now();

    // Emit event
    this.emitter.emit("refresh", event);

    return event;
  }

  /**
   * Handle a seed change event
   */
  private handleSeedChange(event: SeedChangeEvent): void {
    // Add to pending refreshes
    if (!this.pendingRefreshes.has(event.repoId)) {
      this.pendingRefreshes.set(event.repoId, {
        repoId: event.repoId,
        repoPath: event.repoPath,
        firstSeen: Date.now(),
      });

      // Start batch timer if this is the first pending change
      if (this.pendingRefreshes.size === 1 && this.options.batchChanges) {
        this.batchTimer = setTimeout(() => this.flushRefreshes(), this.options.maxBatchWaitMs);
      }
    }

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => this.flushRefreshes(), this.options.debounceMs);
  }

  /**
   * Flush all pending refreshes
   */
  private async flushRefreshes(): Promise<void> {
    // Cancel timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Get pending repos
    const pending = Array.from(this.pendingRefreshes.values());
    this.pendingRefreshes.clear();

    if (pending.length === 0) {
      return;
    }

    // Refresh all pending repos
    const repoIds = pending.map((p) => p.repoId);
    await this.refreshRepos(repoIds);
  }
}

/**
 * Create a new auto-refresher
 *
 * @param hub Central hub instance
 * @param options Refresh options
 * @returns Auto-refresher instance
 */
export function createAutoRefresher(
  hub: CentralHub,
  options: AutoRefreshOptions = {}
): AutoRefresher {
  return new AutoRefresherImpl(hub, options);
}
