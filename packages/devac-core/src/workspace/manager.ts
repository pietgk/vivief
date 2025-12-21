/**
 * Workspace Manager
 *
 * Main orchestration class for workspace-level operations.
 * Coordinates discovery, watching, and hub auto-refresh.
 *
 * Usage:
 * ```ts
 * const manager = createWorkspaceManager({ workspacePath: "~/ws" });
 * await manager.initialize();
 * await manager.startWatch();
 * // ... later
 * await manager.dispose();
 * ```
 */

import { EventEmitter } from "node:events";
import * as path from "node:path";
import { type CentralHub, createCentralHub } from "../hub/central-hub.js";
import { type AutoRefresher, createAutoRefresher } from "./auto-refresh.js";
import { discoverWorkspace, discoverWorkspaceRepos, formatWorkspaceInfo } from "./discover.js";
import { type SeedDetector, createSeedDetector } from "./seed-detector.js";
import {
  loadWorkspaceState,
  markReposAsRegistered,
  mergeStateIntoRepos,
  syncStateWithDiscovery,
} from "./state.js";
import type {
  WorkspaceEvent,
  WorkspaceEventHandler,
  WorkspaceInfo,
  WorkspaceManagerOptions,
  WorkspaceRepoInfo,
} from "./types.js";
import { type WorkspaceWatcher, createWorkspaceWatcher } from "./watcher.js";

/**
 * Workspace manager statistics
 */
export interface WorkspaceManagerStats {
  /** Workspace path */
  workspacePath: string;

  /** Number of repos discovered */
  reposDiscovered: number;

  /** Number of repos with seeds */
  reposWithSeeds: number;

  /** Number of repos registered with hub */
  reposRegistered: number;

  /** Is watcher running */
  isWatching: boolean;

  /** Is auto-refresh active */
  autoRefreshActive: boolean;

  /** Hub path */
  hubPath: string;
}

/**
 * Workspace manager interface
 */
export interface WorkspaceManager {
  /** Initialize the workspace (discover repos, setup hub) */
  initialize(): Promise<WorkspaceInfo>;

  /** Start watching for changes */
  startWatch(): Promise<void>;

  /** Stop watching */
  stopWatch(): Promise<void>;

  /** Get current workspace info */
  getInfo(): WorkspaceInfo;

  /** Register all discovered repos with hub */
  registerAllWithHub(): Promise<number>;

  /** Register event handler */
  on(handler: WorkspaceEventHandler): () => void;

  /** Get statistics */
  getStats(): WorkspaceManagerStats;

  /** Dispose and cleanup */
  dispose(): Promise<void>;

  /** Get the hub instance */
  getHub(): CentralHub;

  /** Refresh discovery */
  refresh(): Promise<WorkspaceInfo>;

  /** Format workspace info for display */
  formatInfo(): string;
}

/**
 * Workspace manager implementation
 */
class WorkspaceManagerImpl implements WorkspaceManager {
  private options: Required<WorkspaceManagerOptions>;
  private emitter = new EventEmitter();
  private hub: CentralHub;
  private watcher: WorkspaceWatcher | null = null;
  private seedDetector: SeedDetector | null = null;
  private autoRefresher: AutoRefresher | null = null;
  private workspaceInfo: WorkspaceInfo | null = null;
  private initialized = false;

  constructor(options: WorkspaceManagerOptions) {
    const workspacePath = path.resolve(options.workspacePath);
    const hubDir = options.hubDir ?? path.join(workspacePath, ".devac");

    this.options = {
      workspacePath,
      hubDir,
      autoRegister: options.autoRegister ?? true,
      autoRefresh: options.autoRefresh ?? true,
      refreshDebounceMs: options.refreshDebounceMs ?? 500,
    };

    this.hub = createCentralHub({ hubDir: this.options.hubDir });
  }

  async initialize(): Promise<WorkspaceInfo> {
    // Initialize hub
    await this.hub.init();
    this.initialized = true;

    // Discover workspace
    const info = await discoverWorkspace(this.options.workspacePath);

    // Load persisted state and merge
    const state = await loadWorkspaceState(this.options.workspacePath);
    const mergedRepos = mergeStateIntoRepos(info.repos, state);

    // Update info with merged repos
    this.workspaceInfo = {
      ...info,
      repos: mergedRepos,
      mainRepos: mergedRepos.filter((r) => !r.isWorktree),
    };

    // Sync state with discovery
    await syncStateWithDiscovery(this.options.workspacePath, mergedRepos);

    // Auto-register repos with seeds if enabled
    if (this.options.autoRegister) {
      await this.registerAllWithHub();
    }

    return this.workspaceInfo;
  }

  async startWatch(): Promise<void> {
    if (!this.initialized) {
      throw new Error("Workspace not initialized. Call initialize() first.");
    }

    if (this.watcher) {
      return; // Already watching
    }

    // Create seed detector
    this.seedDetector = createSeedDetector(this.options.workspacePath);

    // Add repos to detector
    for (const repo of this.workspaceInfo?.repos ?? []) {
      if (repo.hasSeeds) {
        await this.seedDetector.addRepo(repo.path);
      }
    }

    // Start seed detector
    await this.seedDetector.start();

    // Create auto-refresher if enabled
    if (this.options.autoRefresh) {
      this.autoRefresher = createAutoRefresher(this.hub, {
        debounceMs: this.options.refreshDebounceMs,
      });

      // Subscribe to refresh events and re-emit as workspace events
      this.autoRefresher.on("refresh", (event) => {
        this.emitter.emit("event", event);
      });

      // Start auto-refresh
      this.autoRefresher.start(this.seedDetector);
    }

    // Create workspace watcher
    this.watcher = createWorkspaceWatcher({
      workspacePath: this.options.workspacePath,
      watchSeeds: true,
    });

    // Subscribe to watcher events and re-emit
    this.watcher.on((event) => {
      this.emitter.emit("event", event);

      // Handle repo discovery events
      if (event.type === "repo-discovery") {
        this.handleRepoDiscovery(event);
      }
    });

    // Start watcher
    await this.watcher.start();
  }

  async stopWatch(): Promise<void> {
    // Stop auto-refresh
    if (this.autoRefresher) {
      this.autoRefresher.stop();
      this.autoRefresher = null;
    }

    // Stop seed detector
    if (this.seedDetector) {
      await this.seedDetector.stop();
      this.seedDetector = null;
    }

    // Stop watcher
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }
  }

  getInfo(): WorkspaceInfo {
    if (!this.workspaceInfo) {
      throw new Error("Workspace not initialized. Call initialize() first.");
    }
    return this.workspaceInfo;
  }

  async registerAllWithHub(): Promise<number> {
    if (!this.workspaceInfo) {
      throw new Error("Workspace not initialized. Call initialize() first.");
    }

    const reposWithSeeds = this.workspaceInfo.repos.filter(
      (r) => r.hasSeeds && r.hubStatus !== "registered"
    );

    let registered = 0;
    const registeredPaths: string[] = [];

    for (const repo of reposWithSeeds) {
      try {
        await this.hub.registerRepo(repo.path);
        repo.hubStatus = "registered";
        registeredPaths.push(repo.path);
        registered++;
      } catch (error) {
        // Log but continue with other repos
        console.error(`Failed to register ${repo.name}: ${error}`);
      }
    }

    // Update state
    if (registeredPaths.length > 0) {
      await markReposAsRegistered(this.options.workspacePath, registeredPaths);
    }

    return registered;
  }

  on(handler: WorkspaceEventHandler): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  getStats(): WorkspaceManagerStats {
    const repos = this.workspaceInfo?.repos ?? [];

    return {
      workspacePath: this.options.workspacePath,
      reposDiscovered: repos.length,
      reposWithSeeds: repos.filter((r) => r.hasSeeds).length,
      reposRegistered: repos.filter((r) => r.hubStatus === "registered").length,
      isWatching: this.watcher?.isWatching() ?? false,
      autoRefreshActive: this.autoRefresher?.isActive() ?? false,
      hubPath: path.join(this.options.hubDir, "central.duckdb"),
    };
  }

  async dispose(): Promise<void> {
    await this.stopWatch();

    if (this.initialized) {
      await this.hub.close();
      this.initialized = false;
    }

    this.workspaceInfo = null;
  }

  getHub(): CentralHub {
    return this.hub;
  }

  async refresh(): Promise<WorkspaceInfo> {
    // Re-discover repos
    const repos = await discoverWorkspaceRepos(this.options.workspacePath);

    // Load state and merge
    const state = await loadWorkspaceState(this.options.workspacePath);
    const mergedRepos = mergeStateIntoRepos(repos, state);

    // Update workspace info
    if (this.workspaceInfo) {
      this.workspaceInfo.repos = mergedRepos;
      this.workspaceInfo.mainRepos = mergedRepos.filter((r) => !r.isWorktree);

      // Rebuild worktrees by issue
      const worktreesByIssue = new Map<string, WorkspaceRepoInfo[]>();
      for (const repo of mergedRepos) {
        if (repo.isWorktree && repo.issueId) {
          const existing = worktreesByIssue.get(repo.issueId) ?? [];
          existing.push(repo);
          worktreesByIssue.set(repo.issueId, existing);
        }
      }
      this.workspaceInfo.worktreesByIssue = worktreesByIssue;
    }

    // Sync state
    await syncStateWithDiscovery(this.options.workspacePath, mergedRepos);

    // Update seed detector if running
    if (this.seedDetector) {
      for (const repo of mergedRepos) {
        if (repo.hasSeeds) {
          await this.seedDetector.addRepo(repo.path);
        }
      }
    }

    return this.workspaceInfo!;
  }

  formatInfo(): string {
    if (!this.workspaceInfo) {
      return "Workspace not initialized";
    }
    return formatWorkspaceInfo(this.workspaceInfo);
  }

  /**
   * Handle repo discovery events
   */
  private async handleRepoDiscovery(event: WorkspaceEvent): Promise<void> {
    if (event.type !== "repo-discovery") {
      return;
    }

    if (event.action === "added") {
      // Add new repo to info
      if (this.workspaceInfo) {
        this.workspaceInfo.repos.push(event.repo);
        if (!event.repo.isWorktree) {
          this.workspaceInfo.mainRepos.push(event.repo);
        } else if (event.repo.issueId) {
          const existing = this.workspaceInfo.worktreesByIssue.get(event.repo.issueId) ?? [];
          existing.push(event.repo);
          this.workspaceInfo.worktreesByIssue.set(event.repo.issueId, existing);
        }
      }

      // Auto-register if has seeds and auto-register enabled
      if (this.options.autoRegister && event.repo.hasSeeds) {
        try {
          await this.hub.registerRepo(event.repo.path);
          event.repo.hubStatus = "registered";
        } catch {
          // Log but don't fail
        }
      }

      // Add to seed detector
      if (this.seedDetector && event.repo.hasSeeds) {
        await this.seedDetector.addRepo(event.repo.path);
      }
    } else if (event.action === "removed") {
      // Remove from info
      if (this.workspaceInfo) {
        this.workspaceInfo.repos = this.workspaceInfo.repos.filter(
          (r) => r.path !== event.repo.path
        );
        this.workspaceInfo.mainRepos = this.workspaceInfo.mainRepos.filter(
          (r) => r.path !== event.repo.path
        );
        if (event.repo.issueId) {
          const existing = this.workspaceInfo.worktreesByIssue.get(event.repo.issueId) ?? [];
          this.workspaceInfo.worktreesByIssue.set(
            event.repo.issueId,
            existing.filter((r) => r.path !== event.repo.path)
          );
        }
      }

      // Remove from seed detector
      if (this.seedDetector) {
        this.seedDetector.removeRepo(event.repo.path);
      }
    }
  }
}

/**
 * Create a new workspace manager
 *
 * @param options Manager options
 * @returns Workspace manager instance
 */
export function createWorkspaceManager(options: WorkspaceManagerOptions): WorkspaceManager {
  return new WorkspaceManagerImpl(options);
}
