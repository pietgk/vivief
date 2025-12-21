/**
 * Workspace Watcher
 *
 * Single workspace-level watcher that monitors file changes
 * across all repositories in the workspace.
 *
 * Replaces per-package watchers with a unified approach:
 * - One chokidar instance for entire workspace
 * - Routes events to correct repo based on path
 * - Integrates with SeedDetector for auto-refresh
 * - Emits workspace-level events
 */

import { EventEmitter } from "node:events";
import * as path from "node:path";
import * as chokidar from "chokidar";
import { discoverWorkspaceRepos, isGitRepo } from "./discover.js";
import type {
  FileChangeEvent,
  RepoDiscoveryEvent,
  WorkspaceEvent,
  WorkspaceEventHandler,
  WorkspaceRepoInfo,
  WorkspaceWatcherOptions,
} from "./types.js";

/**
 * Watcher statistics
 */
export interface WorkspaceWatcherStats {
  /** Number of file events processed */
  eventsProcessed: number;

  /** Number of repos being watched */
  reposWatched: number;

  /** Last event timestamp */
  lastEventTime: number | null;

  /** Is currently watching */
  isWatching: boolean;

  /** Time watching started */
  startedAt: number | null;
}

/**
 * Workspace watcher interface
 */
export interface WorkspaceWatcher {
  /** Start watching the workspace */
  start(): Promise<void>;

  /** Stop watching */
  stop(): Promise<void>;

  /** Check if watching */
  isWatching(): boolean;

  /** Get statistics */
  getStats(): WorkspaceWatcherStats;

  /** Register event handler */
  on(handler: WorkspaceEventHandler): () => void;

  /** Get watched repos */
  getWatchedRepos(): string[];
}

/**
 * Default patterns to ignore
 */
const DEFAULT_IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/*.d.ts",
  "**/*.min.js",
  "**/*.map",
];

/**
 * Extensions to watch for code changes
 */
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".cs", ".json"];

/**
 * Workspace watcher implementation
 */
class WorkspaceWatcherImpl implements WorkspaceWatcher {
  private options: Required<WorkspaceWatcherOptions>;
  private watcher: chokidar.FSWatcher | null = null;
  private emitter = new EventEmitter();
  private watching = false;
  private repoPaths = new Set<string>();
  private repoByPath = new Map<string, WorkspaceRepoInfo>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private pendingEvents = new Map<string, FileChangeEvent>();
  private stats: WorkspaceWatcherStats = {
    eventsProcessed: 0,
    reposWatched: 0,
    lastEventTime: null,
    isWatching: false,
    startedAt: null,
  };

  constructor(options: WorkspaceWatcherOptions) {
    this.options = {
      workspacePath: path.resolve(options.workspacePath),
      debounceMs: options.debounceMs ?? 100,
      watchSeeds: options.watchSeeds ?? true,
      ignorePatterns: options.ignorePatterns ?? [],
    };
  }

  async start(): Promise<void> {
    if (this.watching) {
      return;
    }

    // Discover repos in workspace
    const repos = await discoverWorkspaceRepos(this.options.workspacePath);
    for (const repo of repos) {
      this.repoPaths.add(repo.path);
      this.repoByPath.set(repo.path, repo);
    }
    this.stats.reposWatched = this.repoPaths.size;

    // Build ignore patterns
    const ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...this.options.ignorePatterns];

    // Don't ignore .devac if we're watching seeds
    if (!this.options.watchSeeds) {
      ignorePatterns.push("**/.devac/**");
    }

    // Create workspace-level watcher
    this.watcher = chokidar.watch(this.options.workspacePath, {
      ignored: ignorePatterns,
      ignoreInitial: true,
      persistent: true,
      usePolling: false,
      atomic: true,
      depth: 10, // Reasonable depth limit
    });

    // Handle file events
    this.watcher.on("add", (filePath) => this.handleFileEvent("add", filePath));
    this.watcher.on("change", (filePath) => this.handleFileEvent("change", filePath));
    this.watcher.on("unlink", (filePath) => this.handleFileEvent("unlink", filePath));

    // Handle directory events for repo discovery
    this.watcher.on("addDir", (dirPath) => this.handleDirAdd(dirPath));
    this.watcher.on("unlinkDir", (dirPath) => this.handleDirRemove(dirPath));

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      this.watcher?.on("ready", () => {
        this.watching = true;
        this.stats.isWatching = true;
        this.stats.startedAt = Date.now();

        // Emit started event
        this.emitEvent({
          type: "watcher-state",
          timestamp: new Date().toISOString(),
          state: "started",
        });

        resolve();
      });

      this.watcher?.on("error", (error) => {
        this.emitEvent({
          type: "watcher-state",
          timestamp: new Date().toISOString(),
          state: "error",
          error: error.message,
        });
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.watching) {
      return;
    }

    // Cancel pending timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.pendingEvents.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.watching = false;
    this.stats.isWatching = false;

    // Emit stopped event
    this.emitEvent({
      type: "watcher-state",
      timestamp: new Date().toISOString(),
      state: "stopped",
    });
  }

  isWatching(): boolean {
    return this.watching;
  }

  getStats(): WorkspaceWatcherStats {
    return { ...this.stats };
  }

  on(handler: WorkspaceEventHandler): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  getWatchedRepos(): string[] {
    return Array.from(this.repoPaths);
  }

  /**
   * Handle a file change event
   */
  private handleFileEvent(changeType: "add" | "change" | "unlink", filePath: string): void {
    // Check if this is a code file we care about
    const ext = path.extname(filePath);
    if (!CODE_EXTENSIONS.includes(ext) && !filePath.includes(".devac/seed/")) {
      return;
    }

    // Find which repo this file belongs to
    const repoPath = this.findRepoPath(filePath);
    if (!repoPath) {
      return;
    }

    // Create file change event
    const event: FileChangeEvent = {
      type: "file-change",
      timestamp: new Date().toISOString(),
      repoPath,
      filePath: path.relative(repoPath, filePath),
      changeType,
    };

    // Debounce per-file
    const key = filePath;
    this.pendingEvents.set(key, event);

    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.debounceTimers.set(
      key,
      setTimeout(() => this.flushEvent(key), this.options.debounceMs)
    );
  }

  /**
   * Handle directory addition (potential new repo)
   */
  private async handleDirAdd(dirPath: string): Promise<void> {
    // Only interested in direct children of workspace
    const parent = path.dirname(dirPath);
    if (parent !== this.options.workspacePath) {
      return;
    }

    // Check if it's a new git repo
    if (await isGitRepo(dirPath)) {
      // Get repo info
      const repos = await discoverWorkspaceRepos(this.options.workspacePath);
      const newRepo = repos.find((r) => r.path === dirPath);

      if (newRepo && !this.repoPaths.has(dirPath)) {
        this.repoPaths.add(dirPath);
        this.repoByPath.set(dirPath, newRepo);
        this.stats.reposWatched = this.repoPaths.size;

        // Emit discovery event
        const event: RepoDiscoveryEvent = {
          type: "repo-discovery",
          timestamp: new Date().toISOString(),
          action: "added",
          repo: newRepo,
        };
        this.emitEvent(event);
      }
    }
  }

  /**
   * Handle directory removal (potential removed repo)
   */
  private handleDirRemove(dirPath: string): void {
    if (!this.repoPaths.has(dirPath)) {
      return;
    }

    const repo = this.repoByPath.get(dirPath);
    this.repoPaths.delete(dirPath);
    this.repoByPath.delete(dirPath);
    this.stats.reposWatched = this.repoPaths.size;

    if (repo) {
      // Emit discovery event
      const event: RepoDiscoveryEvent = {
        type: "repo-discovery",
        timestamp: new Date().toISOString(),
        action: "removed",
        repo,
      };
      this.emitEvent(event);
    }
  }

  /**
   * Find which repo a file path belongs to
   */
  private findRepoPath(filePath: string): string | null {
    for (const repoPath of this.repoPaths) {
      if (filePath.startsWith(repoPath + path.sep)) {
        return repoPath;
      }
    }
    return null;
  }

  /**
   * Flush a pending event
   */
  private flushEvent(key: string): void {
    const event = this.pendingEvents.get(key);
    if (!event) {
      return;
    }

    this.pendingEvents.delete(key);
    this.debounceTimers.delete(key);

    // Update stats
    this.stats.eventsProcessed++;
    this.stats.lastEventTime = Date.now();

    // Emit event
    this.emitEvent(event);
  }

  /**
   * Emit a workspace event
   */
  private emitEvent(event: WorkspaceEvent): void {
    this.emitter.emit("event", event);
  }
}

/**
 * Create a new workspace watcher
 *
 * @param options Watcher options
 * @returns Workspace watcher instance
 */
export function createWorkspaceWatcher(options: WorkspaceWatcherOptions): WorkspaceWatcher {
  return new WorkspaceWatcherImpl(options);
}
