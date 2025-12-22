/**
 * Seed Change Detector
 *
 * Watches for changes to seed files in .devac/seed/ directories
 * across all repositories in a workspace.
 *
 * Emits events when seeds are updated, enabling automatic
 * hub refresh and other downstream processing.
 */

import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import * as chokidar from "chokidar";
import { getRepoId } from "./discover.js";
import type { SeedChangeEvent } from "./types.js";

/**
 * Seed detector options
 */
export interface SeedDetectorOptions {
  /** Debounce time in ms (default: 200) */
  debounceMs?: number;

  /** Ignore initial scan (default: true) */
  ignoreInitial?: boolean;
}

/**
 * Seed change handler
 */
export type SeedChangeHandler = (event: SeedChangeEvent) => void;

/**
 * Seed detector statistics
 */
export interface SeedDetectorStats {
  /** Number of repos being watched */
  reposWatched: number;

  /** Total seed changes detected */
  changesDetected: number;

  /** Last change timestamp */
  lastChangeTime: number | null;

  /** Is currently watching */
  isWatching: boolean;
}

/**
 * Seed detector interface
 */
export interface SeedDetector {
  /** Start watching for seed changes */
  start(): Promise<void>;

  /** Stop watching */
  stop(): Promise<void>;

  /** Add a repository to watch */
  addRepo(repoPath: string): Promise<void>;

  /** Remove a repository from watch */
  removeRepo(repoPath: string): void;

  /** Register handler for seed changes */
  on(event: "seed-change", handler: SeedChangeHandler): void;

  /** Remove handler */
  off(event: "seed-change", handler: SeedChangeHandler): void;

  /** Check if watching */
  isWatching(): boolean;

  /** Get statistics */
  getStats(): SeedDetectorStats;
}

/**
 * Pending seed change info
 */
interface PendingChange {
  repoPath: string;
  repoId: string;
  files: Set<string>;
  firstSeen: number;
}

/**
 * Seed detector implementation
 */
class SeedDetectorImpl implements SeedDetector {
  private workspacePath: string;
  private options: Required<SeedDetectorOptions>;
  private watcher: chokidar.FSWatcher | null = null;
  private emitter = new EventEmitter();
  private watching = false;
  private repoPaths = new Set<string>();
  private repoIdCache = new Map<string, string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private pendingChanges = new Map<string, PendingChange>();
  private stats: SeedDetectorStats = {
    reposWatched: 0,
    changesDetected: 0,
    lastChangeTime: null,
    isWatching: false,
  };

  constructor(workspacePath: string, options: SeedDetectorOptions = {}) {
    this.workspacePath = workspacePath;
    this.options = {
      debounceMs: options.debounceMs ?? 200,
      ignoreInitial: options.ignoreInitial ?? true,
    };
  }

  async start(): Promise<void> {
    if (this.watching) {
      return;
    }

    // Watch for parquet files in .devac/seed directories
    // Pattern: **/.devac/seed/**/*.parquet
    const watchPattern = path.join(this.workspacePath, "**", ".devac", "seed", "**", "*.parquet");

    this.watcher = chokidar.watch(watchPattern, {
      ignoreInitial: this.options.ignoreInitial,
      persistent: true,
      usePolling: false,
      atomic: true,
      // Ignore common non-seed directories
      ignored: ["**/node_modules/**", "**/.git/**"],
    });

    this.watcher.on("add", (filePath) => this.handleSeedChange(filePath, "add"));
    this.watcher.on("change", (filePath) => this.handleSeedChange(filePath, "change"));
    this.watcher.on("unlink", (filePath) => this.handleSeedChange(filePath, "unlink"));

    await new Promise<void>((resolve, reject) => {
      this.watcher?.on("ready", () => {
        this.watching = true;
        this.stats.isWatching = true;
        resolve();
      });

      this.watcher?.on("error", (error) => {
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.watching) {
      return;
    }

    // Cancel all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.pendingChanges.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.watching = false;
    this.stats.isWatching = false;
  }

  async addRepo(repoPath: string): Promise<void> {
    const absolutePath = path.resolve(repoPath);
    if (this.repoPaths.has(absolutePath)) {
      return;
    }

    this.repoPaths.add(absolutePath);
    this.stats.reposWatched = this.repoPaths.size;

    // Pre-cache the repo ID
    const repoId = await getRepoId(absolutePath);
    this.repoIdCache.set(absolutePath, repoId);

    // If already watching, add the new path
    if (this.watching && this.watcher) {
      const seedPattern = path.join(absolutePath, ".devac", "seed", "**", "*.parquet");
      this.watcher.add(seedPattern);
    }
  }

  removeRepo(repoPath: string): void {
    const absolutePath = path.resolve(repoPath);
    this.repoPaths.delete(absolutePath);
    this.repoIdCache.delete(absolutePath);
    this.stats.reposWatched = this.repoPaths.size;

    // Cancel any pending changes for this repo
    const timer = this.debounceTimers.get(absolutePath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(absolutePath);
    }
    this.pendingChanges.delete(absolutePath);

    // Note: chokidar doesn't have a way to unwatch specific patterns
    // The watcher will just ignore changes from removed paths
  }

  on(event: "seed-change", handler: SeedChangeHandler): void {
    this.emitter.on(event, handler);
  }

  off(event: "seed-change", handler: SeedChangeHandler): void {
    this.emitter.off(event, handler);
  }

  isWatching(): boolean {
    return this.watching;
  }

  getStats(): SeedDetectorStats {
    return { ...this.stats };
  }

  /**
   * Handle a seed file change
   */
  private async handleSeedChange(
    filePath: string,
    _changeType: "add" | "change" | "unlink"
  ): Promise<void> {
    // Extract repo path from file path
    // File path is like: /workspace/repo/.devac/seed/nodes.parquet
    const repoPath = this.extractRepoPath(filePath);
    if (!repoPath) {
      return;
    }

    // Get or fetch repo ID
    let repoId = this.repoIdCache.get(repoPath);
    if (!repoId) {
      repoId = await getRepoId(repoPath);
      this.repoIdCache.set(repoPath, repoId);
    }

    // Get relative seed file path
    const seedFile = filePath.substring(repoPath.length + 1);

    // Add to pending changes
    let pending = this.pendingChanges.get(repoPath);
    if (!pending) {
      pending = {
        repoPath,
        repoId,
        files: new Set(),
        firstSeen: Date.now(),
      };
      this.pendingChanges.set(repoPath, pending);
    }
    pending.files.add(seedFile);

    // Reset debounce timer for this repo
    const existingTimer = this.debounceTimers.get(repoPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.debounceTimers.set(
      repoPath,
      setTimeout(() => this.flushRepoChanges(repoPath), this.options.debounceMs)
    );
  }

  /**
   * Extract the repo path from a seed file path
   *
   * In a monorepo, seeds may be stored at package level (e.g., packages/foo/.devac/seed/)
   * but the repo root is the parent containing .git. We walk up to find the actual git root.
   */
  private extractRepoPath(filePath: string): string | null {
    // Find .devac/seed in the path
    const devacIndex = filePath.indexOf("/.devac/seed/");
    if (devacIndex === -1) {
      return null;
    }

    // Start from the directory containing .devac and walk up to find git root
    let currentPath = filePath.substring(0, devacIndex);

    while (currentPath && currentPath !== "/" && currentPath !== path.parse(currentPath).root) {
      // Check if this is a git root
      const gitPath = path.join(currentPath, ".git");
      try {
        fs.accessSync(gitPath);
        return currentPath; // Found git root
      } catch {
        // Not a git root, walk up
        currentPath = path.dirname(currentPath);
      }
    }

    // Fallback to original behavior if no git root found
    return filePath.substring(0, devacIndex);
  }

  /**
   * Flush pending changes for a repo
   */
  private flushRepoChanges(repoPath: string): void {
    const pending = this.pendingChanges.get(repoPath);
    if (!pending) {
      return;
    }

    this.pendingChanges.delete(repoPath);
    this.debounceTimers.delete(repoPath);

    // Build event
    const event: SeedChangeEvent = {
      type: "seed-change",
      timestamp: new Date().toISOString(),
      repoPath: pending.repoPath,
      repoId: pending.repoId,
      seedFiles: Array.from(pending.files),
    };

    // Update stats
    this.stats.changesDetected++;
    this.stats.lastChangeTime = Date.now();

    // Emit event
    this.emitter.emit("seed-change", event);
  }
}

/**
 * Create a new seed detector
 *
 * @param workspacePath Path to the workspace directory
 * @param options Detector options
 * @returns Seed detector instance
 */
export function createSeedDetector(
  workspacePath: string,
  options: SeedDetectorOptions = {}
): SeedDetector {
  return new SeedDetectorImpl(workspacePath, options);
}
