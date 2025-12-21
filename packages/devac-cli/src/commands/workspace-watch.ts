/**
 * Workspace Watch Command
 *
 * Starts workspace-level file watching with automatic
 * hub refresh when seeds change.
 */

import { type WorkspaceEvent, createWorkspaceManager } from "@pietgk/devac-core";

/**
 * Workspace watch command options
 */
export interface WorkspaceWatchOptions {
  /** Workspace path (defaults to current directory) */
  workspacePath: string;

  /** Whether to auto-refresh hub when seeds change */
  autoRefresh?: boolean;

  /** Debounce time in ms for hub refresh */
  refreshDebounceMs?: number;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Workspace watch controller
 */
export interface WorkspaceWatchController {
  /** Stop watching */
  stop(): Promise<void>;

  /** Get current status */
  getStatus(): {
    isWatching: boolean;
    reposWatched: number;
    eventsProcessed: number;
    hubRefreshes: number;
  };
}

/**
 * Workspace watch command result
 */
export interface WorkspaceWatchResult {
  /** Whether the command started successfully */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Watch controller */
  controller?: WorkspaceWatchController;
}

/**
 * Execute workspace watch command
 */
export async function workspaceWatch(
  options: WorkspaceWatchOptions
): Promise<WorkspaceWatchResult> {
  const manager = createWorkspaceManager({
    workspacePath: options.workspacePath,
    autoRefresh: options.autoRefresh ?? true,
    refreshDebounceMs: options.refreshDebounceMs ?? 500,
  });

  try {
    // Initialize and start watching
    const info = await manager.initialize();

    if (!info.isWorkspace) {
      await manager.dispose();
      return {
        success: false,
        error:
          "Not a workspace directory. Run from a parent directory containing git repositories.",
      };
    }

    // Track stats
    let eventsProcessed = 0;
    let hubRefreshes = 0;

    // Subscribe to events
    manager.on((event: WorkspaceEvent) => {
      eventsProcessed++;

      if (options.verbose) {
        const timestamp = new Date().toISOString().substring(11, 19);
        formatEvent(event, timestamp);
      }

      if (event.type === "hub-refresh") {
        hubRefreshes++;
        if (!options.verbose) {
          console.log(`🔄 Hub refreshed: ${event.refreshedRepos.join(", ")}`);
        }
      }
    });

    // Start watching
    await manager.startWatch();

    console.log(`\n✓ Watching workspace: ${info.workspacePath}`);
    console.log(`  Repositories: ${info.repos.length}`);
    console.log(`  Auto-refresh: ${options.autoRefresh ?? true}`);
    console.log("\nPress Ctrl+C to stop\n");

    // Create controller
    const controller: WorkspaceWatchController = {
      stop: async () => {
        await manager.dispose();
      },
      getStatus: () => ({
        isWatching: true,
        reposWatched: info.repos.length,
        eventsProcessed,
        hubRefreshes,
      }),
    };

    return {
      success: true,
      controller,
    };
  } catch (error) {
    await manager.dispose().catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format and print an event
 */
function formatEvent(event: WorkspaceEvent, timestamp: string): void {
  switch (event.type) {
    case "file-change":
      console.log(`[${timestamp}] 📄 ${event.changeType}: ${event.filePath}`);
      break;
    case "seed-change":
      console.log(`[${timestamp}] 📦 Seeds changed: ${event.repoId}`);
      break;
    case "hub-refresh":
      if (event.errors.length > 0) {
        console.log(`[${timestamp}] ⚠️ Hub refresh with errors: ${event.errors.join(", ")}`);
      } else {
        console.log(`[${timestamp}] 🔄 Hub refreshed: ${event.refreshedRepos.join(", ")}`);
      }
      break;
    case "repo-discovery":
      console.log(
        `[${timestamp}] ${event.action === "added" ? "➕" : "➖"} Repo ${event.action}: ${event.repo.name}`
      );
      break;
    case "watcher-state":
      console.log(`[${timestamp}] 👁️ Watcher ${event.state}`);
      break;
  }
}
