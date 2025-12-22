/**
 * Workspace Status Command
 *
 * Shows workspace information including discovered repos,
 * worktrees, and hub status.
 */

import * as path from "node:path";
import {
  type WorkspaceInfo,
  type WorkspaceManagerStats,
  createWorkspaceManager,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { workspaceInit } from "./workspace-init.js";
import { workspaceWatch } from "./workspace-watch.js";

/**
 * Workspace status command options
 */
export interface WorkspaceStatusOptions {
  /** Workspace path (defaults to current directory) */
  workspacePath: string;

  /** Output as JSON */
  json?: boolean;

  /** Include hub details */
  hubDetails?: boolean;
}

/**
 * Workspace status command result
 */
export interface WorkspaceStatusResult {
  /** Whether the command succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Workspace info */
  info?: WorkspaceInfo;

  /** Manager stats */
  stats?: WorkspaceManagerStats;

  /** Formatted output */
  formatted?: string;
}

/**
 * Format workspace info for display
 */
function formatInfo(info: WorkspaceInfo, stats: WorkspaceManagerStats): string {
  const lines: string[] = [];

  if (!info.isWorkspace) {
    lines.push("Not a workspace directory");
    lines.push(`Path: ${info.workspacePath}`);
    lines.push("");
    lines.push("A workspace is a parent directory containing multiple git repositories.");
    return lines.join("\n");
  }

  lines.push("Workspace");
  lines.push(`📁 ${info.workspacePath}`);
  lines.push("");

  // Stats summary
  lines.push("Overview:");
  lines.push(`  Repositories: ${stats.reposDiscovered}`);
  lines.push(`  With seeds: ${stats.reposWithSeeds}`);
  lines.push(`  Registered: ${stats.reposRegistered}`);
  lines.push("");

  // Main repos
  if (info.mainRepos.length > 0) {
    lines.push("Repositories:");
    for (const repo of info.mainRepos) {
      const seedIcon = repo.hasSeeds ? "📦" : "  ";
      const hubIcon =
        repo.hubStatus === "registered" ? "🔗" : repo.hubStatus === "pending" ? "⏳" : "";
      lines.push(`  ${seedIcon} ${repo.name} ${hubIcon}`);
      if (repo.branch) {
        lines.push(`     └ branch: ${repo.branch}`);
      }
    }
    lines.push("");
  }

  // Worktrees by issue
  if (info.worktreesByIssue.size > 0) {
    lines.push("Issue Worktrees:");
    for (const [issueId, worktrees] of info.worktreesByIssue) {
      lines.push(`  Issue ${issueId}:`);
      for (const wt of worktrees) {
        const seedIcon = wt.hasSeeds ? "📦" : "  ";
        lines.push(`    ${seedIcon} ${wt.name}`);
      }
    }
    lines.push("");
  }

  // Hub info
  lines.push(`Hub: ${info.hubPath}`);

  return lines.join("\n");
}

/**
 * Execute workspace status command
 */
export async function workspaceStatus(
  options: WorkspaceStatusOptions
): Promise<WorkspaceStatusResult> {
  const manager = createWorkspaceManager({
    workspacePath: options.workspacePath,
  });

  try {
    const info = await manager.initialize();
    const stats = manager.getStats();

    await manager.dispose();

    if (options.json) {
      return {
        success: true,
        info,
        stats,
      };
    }

    return {
      success: true,
      info,
      stats,
      formatted: formatInfo(info, stats),
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
 * Register the workspace command with all subcommands
 */
export function registerWorkspaceCommand(program: Command): void {
  const workspace = program
    .command("workspace")
    .description("Workspace-level operations for multi-repo development");

  // workspace status
  workspace
    .command("status")
    .description("Show workspace status and discovered repos")
    .option("-w, --workspace <path>", "Workspace path", process.cwd())
    .option("--json", "Output as JSON")
    .option("--hub-details", "Include hub details")
    .action(async (options) => {
      const result = await workspaceStatus({
        workspacePath: path.resolve(options.workspace),
        json: options.json,
        hubDetails: options.hubDetails,
      });

      if (result.success) {
        if (options.json) {
          console.log(JSON.stringify({ info: result.info, stats: result.stats }, null, 2));
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });

  // workspace watch
  workspace
    .command("watch")
    .description("Watch workspace for changes and auto-refresh hub")
    .option("-w, --workspace <path>", "Workspace path", process.cwd())
    .option("--no-auto-refresh", "Disable auto-refresh of hub")
    .option("--debounce <ms>", "Refresh debounce time in ms", "500")
    .action(async (options) => {
      const result = await workspaceWatch({
        workspacePath: path.resolve(options.workspace),
        autoRefresh: options.autoRefresh,
        refreshDebounceMs: Number.parseInt(options.debounce, 10),
      });

      if (result.success && result.controller) {
        // Handle Ctrl+C
        process.on("SIGINT", async () => {
          console.log("\nStopping workspace watch...");
          await result.controller?.stop();
          const status = result.controller?.getStatus();
          if (status) {
            console.log(
              `Processed ${status.eventsProcessed} events, ${status.hubRefreshes} hub refreshes`
            );
          }
          process.exit(0);
        });
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });

  // workspace init
  workspace
    .command("init")
    .description("Initialize workspace configuration and hub")
    .option("-w, --workspace <path>", "Workspace path", process.cwd())
    .option("--auto-refresh", "Enable auto-refresh on seed changes", true)
    .option("--register", "Register all repos with hub")
    .option("--force", "Force overwrite existing config")
    .action(async (options) => {
      const result = await workspaceInit({
        workspacePath: path.resolve(options.workspace),
        autoRefresh: options.autoRefresh,
        registerRepos: options.register,
        force: options.force,
      });

      if (result.success) {
        console.log("✓ Workspace initialized");
        console.log(`  Config: ${result.paths.config}`);
        console.log(`  Hub: ${result.paths.hub}`);
        if (result.reposRegistered > 0) {
          console.log(`  Registered ${result.reposRegistered} repos with hub`);
        }
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });
}
