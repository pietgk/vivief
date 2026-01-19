import * as path from "node:path";
import {
  type WorkspaceInfo,
  type WorkspaceManagerStats,
  createWorkspaceManager,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { getWorkspaceHubDir } from "../utils/workspace-discovery.js";
import { contextCICommand, contextIssuesCommand, contextReviewCommand } from "./context.js";
import { hubList } from "./hub-list.js";
import { hubRefresh } from "./hub-refresh.js";
import { hubRegister } from "./hub-register.js";
import { hubSyncCommand } from "./hub-sync.js";
import { hubUnregister } from "./hub-unregister.js";
import { mcpCommand } from "./mcp.js";
import { workspaceInit } from "./workspace-init.js";
import { registerWorkspaceRepoCommands } from "./workspace-repo/index.js";
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
 *
 * This is the unified command that merges:
 * - Original workspace commands (status, watch, init)
 * - Hub commands (register, unregister, list, refresh, sync)
 * - Context commands (ci, issues, review)
 * - MCP command
 */
export function registerWorkspaceCommand(program: Command): void {
  const workspace = program
    .command("workspace")
    .alias("ws")
    .description("Workspace-level operations for multi-repo development");

  // ─────────────────────────────────────────────────────────────────────────
  // Original Workspace Commands
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // Workspace Repo Commands (for managing workspace configuration repo)
  // ─────────────────────────────────────────────────────────────────────────

  registerWorkspaceRepoCommands(workspace);

  // ─────────────────────────────────────────────────────────────────────────
  // Hub Commands (merged from `devac hub`)
  // ─────────────────────────────────────────────────────────────────────────

  // workspace register (was: hub register)
  workspace
    .command("register <path>")
    .description("Register a repository with the hub")
    .action(async (repoPath) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubRegister({
          hubDir,
          repoPath: path.resolve(repoPath),
        });
        console.log(result.message);
        if (!result.success) {
          process.exit(1);
        }
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // workspace unregister (was: hub unregister)
  workspace
    .command("unregister <repoId>")
    .description("Unregister a repository from the hub")
    .action(async (repoId) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubUnregister({ hubDir, repoId });
        console.log(result.message);
        if (!result.success) {
          process.exit(1);
        }
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // workspace list (was: hub list)
  workspace
    .command("list")
    .description("List registered repositories")
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Verbose output")
    .action(async (options) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubList({
          hubDir,
          json: options.json,
          verbose: options.verbose,
        });
        if (options.json) {
          console.log(JSON.stringify(result.repos, null, 2));
        } else {
          console.log(result.message);
          for (const repo of result.repos) {
            console.log(`  ${repo.repoId}: ${repo.localPath} (${repo.packages} packages)`);
          }
        }
        if (!result.success) {
          process.exit(1);
        }
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // workspace refresh (was: hub refresh)
  workspace
    .command("refresh [repoId]")
    .description("Refresh repository manifests")
    .option("--force", "Force regenerate all manifests")
    .action(async (repoId, options) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubRefresh({
          hubDir,
          repoId,
          force: options.force,
        });
        console.log(result.message);
        if (result.errors.length > 0) {
          console.log("Errors:");
          for (const error of result.errors) {
            console.log(`  ${error}`);
          }
        }
        if (!result.success) {
          process.exit(1);
        }
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // workspace sync (was: hub sync)
  workspace
    .command("sync")
    .description("Sync external data (CI, issues, reviews) to the hub")
    .option("--ci", "Sync CI status")
    .option("--issues", "Sync GitHub issues")
    .option("--reviews", "Sync PR reviews")
    .option("--failing-only", "Only sync failing CI checks")
    .option("--pending-only", "Only sync pending reviews")
    .option("--clear", "Clear existing data before syncing")
    .action(async (options) => {
      const result = await hubSyncCommand({
        cwd: process.cwd(),
        ci: options.ci,
        issues: options.issues,
        reviews: options.reviews,
        failingOnly: options.failingOnly,
        pendingOnly: options.pendingOnly,
        clearExisting: options.clear,
      });
      if (result.success) {
        if (result.ciSync) console.log(`CI: ${result.ciSync.pushed} items synced`);
        if (result.issuesSync) console.log(`Issues: ${result.issuesSync.pushed} items synced`);
        if (result.reviewsSync) console.log(`Reviews: ${result.reviewsSync.pushed} items synced`);
      } else {
        console.error(`✗ Sync failed: ${result.error}`);
        process.exit(1);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Context Commands (merged from `devac context`)
  // ─────────────────────────────────────────────────────────────────────────

  // workspace ci (was: context ci)
  workspace
    .command("ci")
    .description("Get CI status for repos in context")
    .option("--json", "Output as JSON")
    .option("--include-checks", "Include individual check details")
    .option("--sync-to-hub", "Sync CI status to central Hub")
    .option("--failing-only", "Only sync failing checks to Hub")
    .action(async (options) => {
      const result = await contextCICommand({
        cwd: process.cwd(),
        format: options.json ? "json" : "text",
        includeChecks: options.includeChecks,
        syncToHub: options.syncToHub,
        failingOnly: options.failingOnly,
      });

      if (result.success) {
        if (options.json) {
          console.log(
            JSON.stringify({ result: result.result, syncResult: result.syncResult }, null, 2)
          );
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ CI status failed: ${result.error}`);
        process.exit(1);
      }
    });

  // workspace issues (was: context issues)
  workspace
    .command("issues")
    .description("Get GitHub issues for repos in context")
    .option("--json", "Output as JSON")
    .option("--all", "Include closed issues")
    .option("-l, --limit <count>", "Maximum issues per repo", "50")
    .option("--labels <labels...>", "Filter by labels")
    .option("--sync-to-hub", "Sync issues to central Hub")
    .action(async (options) => {
      const result = await contextIssuesCommand({
        cwd: process.cwd(),
        format: options.json ? "json" : "text",
        openOnly: !options.all,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        labels: options.labels,
        syncToHub: options.syncToHub,
      });

      if (result.success) {
        if (options.json) {
          console.log(
            JSON.stringify({ result: result.result, syncResult: result.syncResult }, null, 2)
          );
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ Issues fetch failed: ${result.error}`);
        process.exit(1);
      }
    });

  // workspace review (was: context review)
  workspace
    .command("review")
    .description("Generate LLM review prompt for changes")
    .option("--json", "Output as JSON")
    .option("--focus <area>", "Focus area (security, performance, tests, all)", "all")
    .option("--base <branch>", "Base branch to diff against", "main")
    .option("--create-sub-issues", "Create sub-issues for follow-up work")
    .action(async (options) => {
      const result = await contextReviewCommand({
        cwd: process.cwd(),
        format: options.json ? "json" : "text",
        focus: options.focus as "security" | "performance" | "tests" | "all",
        baseBranch: options.base,
        createSubIssues: options.createSubIssues,
      });

      if (result.success) {
        if (options.json) {
          console.log(JSON.stringify({ prompt: result.prompt, result: result.result }, null, 2));
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ Review generation failed: ${result.error}`);
        process.exit(1);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // MCP Command (merged from `devac mcp`)
  // ─────────────────────────────────────────────────────────────────────────

  // workspace mcp (was: devac mcp)
  workspace
    .command("mcp")
    .description("Start MCP server for LLM integration")
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("-a, --action <action>", "Action (start, stop)", "start")
    .action(async (options) => {
      const result = await mcpCommand({
        packagePath: path.resolve(options.package),
        action: options.action as "start" | "stop",
      });

      if (!result.success) {
        console.error(`✗ MCP server failed: ${result.error}`);
        process.exit(1);
      }
    });
}
