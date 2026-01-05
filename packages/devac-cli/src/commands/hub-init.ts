/**
 * Hub Init Command Implementation
 *
 * Initializes the central federation hub for DevAC v2.0.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createCentralHub, getWorkspaceStatus } from "@pietgk/devac-core";
import type { Command } from "commander";
import { displayCommandResult } from "../utils/cli-output.js";
import { getWorkspaceHubDir } from "../utils/workspace-discovery.js";
import { hubDiagnosticsCommand } from "./hub-diagnostics.js";
import { hubErrorsCommand } from "./hub-errors.js";
import { hubList } from "./hub-list.js";
import { hubQueryCommand } from "./hub-query.js";
import { hubRefresh } from "./hub-refresh.js";
import { hubRegister } from "./hub-register.js";
import { hubStatus } from "./hub-status.js";
import { hubSummaryCommand } from "./hub-summary.js";
import { hubSyncCommand } from "./hub-sync.js";
import { hubUnregister } from "./hub-unregister.js";

/**
 * Hub init command options
 */
export interface HubInitOptions {
  /** Directory to create hub in (default: ~/.devac) */
  hubDir: string;
  /** Force reinitialization if hub exists */
  force?: boolean;
}

/**
 * Hub init command result
 */
export interface HubInitResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Path to the hub database */
  hubPath: string;
  /** Whether a new hub was created */
  created: boolean;
  /** User-facing message */
  message: string;
  /** Error message if failed */
  error?: string;
  /** Hints about next steps */
  hints?: string[];
}

/**
 * Initialize the central federation hub
 */
export async function hubInit(options: HubInitOptions): Promise<HubInitResult> {
  const { hubDir, force = false } = options;
  const hubPath = path.join(hubDir, "central.duckdb");

  try {
    // Check if hub already exists
    const hubExists = await fs
      .access(hubPath)
      .then(() => true)
      .catch(() => false);

    if (hubExists && !force) {
      return {
        success: true,
        hubPath,
        created: false,
        message: `Hub already exists at ${hubPath}. Use --force to reinitialize.`,
      };
    }

    // Create the hub
    const hub = createCentralHub({ hubDir });

    try {
      await hub.init({ force });

      const message =
        force && hubExists ? `Hub reinitialized at ${hubPath}` : `Hub initialized at ${hubPath}`;

      // Get workspace status for hints
      const hints: string[] = [];
      try {
        const workspaceDir = path.dirname(hubDir);
        const status = await getWorkspaceStatus({ path: workspaceDir });

        if (status.repos.length > 0) {
          const reposWithSeeds = status.summary.reposWithSeeds;
          const reposNeedingAnalysis = status.repos.length - reposWithSeeds;

          hints.push("");
          hints.push(`Workspace contains ${status.repos.length} repositories:`);

          if (reposWithSeeds > 0) {
            hints.push(`  ${reposWithSeeds} ready to register (have seeds)`);
          }
          if (reposNeedingAnalysis > 0) {
            hints.push(`  ${reposNeedingAnalysis} need analysis first`);
          }

          hints.push("");
          hints.push("Run: devac hub register --all");
        }
      } catch {
        // Workspace status detection failed, continue without hints
      }

      return {
        success: true,
        hubPath,
        created: true,
        message,
        hints: hints.length > 0 ? hints : undefined,
      };
    } finally {
      await hub.close();
    }
  } catch (error) {
    return {
      success: false,
      hubPath,
      created: false,
      message: "Failed to initialize hub",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Register the hub command with all subcommands
 */
export function registerHubCommand(program: Command): void {
  const hub = program.command("hub").description("Central hub for cross-repository federation");

  // hub init
  hub
    .command("init")
    .description("Initialize the workspace hub")
    .option("--force", "Force reinitialization")
    .action(async (options) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubInit({
          hubDir,
          force: options.force,
        });
        displayCommandResult(result);
        // Show hints if available
        if (result.hints && result.hints.length > 0) {
          for (const hint of result.hints) {
            console.log(hint);
          }
        }
      } catch (err) {
        displayCommandResult({
          success: false,
          message: "Failed to initialize hub",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

  // hub register
  hub
    .command("register [path]")
    .description("Register a repository with the hub (use 'devac sync' to analyze + register)")
    .option("--all", "Register all repositories in workspace")
    .action(async (repoPath, options) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const resolvedPath = repoPath ? path.resolve(repoPath) : process.cwd();
        const result = await hubRegister({
          hubDir,
          repoPath: resolvedPath,
          all: options.all,
          onProgress: (msg) => console.log(msg),
        });
        displayCommandResult(result);
      } catch (err) {
        displayCommandResult({
          success: false,
          message: "Failed to register repository",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

  // hub unregister
  hub
    .command("unregister <repoId>")
    .description("Unregister a repository from the hub")
    .action(async (repoId) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubUnregister({ hubDir, repoId });
        displayCommandResult(result);
      } catch (err) {
        displayCommandResult({
          success: false,
          message: "Failed to unregister repository",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

  // hub list
  hub
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
        if (!result.success) {
          displayCommandResult(result);
          return;
        }
        if (options.json) {
          console.log(JSON.stringify(result.repos, null, 2));
        } else {
          console.log(result.message);
          for (const repo of result.repos) {
            console.log(`  ${repo.repoId}: ${repo.localPath} (${repo.packages} packages)`);
          }
        }
      } catch (err) {
        displayCommandResult({
          success: false,
          message: "Failed to list repositories",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

  // hub status
  hub
    .command("status")
    .description("Show hub status")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubStatus({ hubDir });
        if (!result.success) {
          displayCommandResult(result);
          return;
        }
        if (options.json && result.status) {
          console.log(JSON.stringify(result.status, null, 2));
        } else {
          console.log(result.message);
        }
      } catch (err) {
        displayCommandResult({
          success: false,
          message: "Failed to get hub status",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

  // hub refresh
  hub
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
        if (!result.success) {
          displayCommandResult(result);
          return;
        }
        console.log(result.message);
        if (result.errors.length > 0) {
          console.log("Errors:");
          for (const error of result.errors) {
            console.log(`  ${error}`);
          }
        }
      } catch (err) {
        displayCommandResult({
          success: false,
          message: "Failed to refresh manifests",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

  // hub sync
  hub
    .command("sync")
    .description("Sync external diagnostics to the hub")
    .option("--ci", "Sync CI status")
    .option("--issues", "Sync GitHub issues")
    .option("--reviews", "Sync PR reviews")
    .option("--failing-only", "Only sync failing CI checks")
    .option("--pending-only", "Only sync pending reviews")
    .option("--clear", "Clear existing diagnostics before syncing")
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
      if (!result.success) {
        displayCommandResult({ success: false, message: "Sync failed", error: result.error });
        return;
      }
      if (result.ciSync) console.log(`CI: ${result.ciSync.pushed} items synced`);
      if (result.issuesSync) console.log(`Issues: ${result.issuesSync.pushed} items synced`);
      if (result.reviewsSync) console.log(`Reviews: ${result.reviewsSync.pushed} items synced`);
    });

  // hub errors
  hub
    .command("errors")
    .description("Query validation errors from the hub")
    .option("--repo <id>", "Filter by repository")
    .option("--severity <level>", "Filter by severity (error, warning)")
    .option("--source <source>", "Filter by source (tsc, eslint, test)")
    .option("--file <path>", "Filter by file path")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubErrorsCommand({
          hubDir,
          repoId: options.repo,
          severity: options.severity,
          source: options.source,
          file: options.file,
          limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
          json: options.json,
        });
        if (!result.success) {
          if (options.json) {
            console.log(result.output);
          } else {
            displayCommandResult({
              success: false,
              message: "Failed to query errors",
              error: result.error,
            });
          }
          return;
        }
        console.log(result.output);
      } catch (err) {
        if (options.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          );
        } else {
          displayCommandResult({
            success: false,
            message: "Failed to query errors",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });

  // hub diagnostics (legacy alias: feedback)
  hub
    .command("diagnostics")
    .alias("feedback")
    .description("Query unified diagnostics from the hub")
    .option("--repo <id>", "Filter by repository")
    .option("--source <source>", "Filter by source")
    .option("--severity <level>", "Filter by severity")
    .option("--category <cat>", "Filter by category")
    .option("--file <path>", "Filter by file path")
    .option("--resolved", "Show only resolved items")
    .option("--actionable", "Show only actionable items")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubDiagnosticsCommand({
          hubDir,
          repoId: options.repo,
          source: options.source,
          severity: options.severity,
          category: options.category,
          filePath: options.file,
          resolved: options.resolved,
          actionable: options.actionable,
          limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
          json: options.json,
        });
        if (!result.success) {
          if (options.json) {
            console.log(result.output);
          } else {
            displayCommandResult({
              success: false,
              message: "Failed to query diagnostics",
              error: result.error,
            });
          }
          return;
        }
        console.log(result.output);
      } catch (err) {
        if (options.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          );
        } else {
          displayCommandResult({
            success: false,
            message: "Failed to query diagnostics",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });

  // hub summary
  hub
    .command("summary <type>")
    .description("Get summary/counts (validation, diagnostics, counts)")
    .option("--group-by <field>", "Group by field")
    .option("--json", "Output as JSON")
    .action(async (type, options) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubSummaryCommand({
          hubDir,
          type: type as "validation" | "diagnostics" | "counts",
          groupBy: options.groupBy,
          json: options.json,
        });
        if (!result.success) {
          if (options.json) {
            console.log(result.output);
          } else {
            displayCommandResult({
              success: false,
              message: "Failed to get summary",
              error: result.error,
            });
          }
          return;
        }
        console.log(result.output);
      } catch (err) {
        if (options.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          );
        } else {
          displayCommandResult({
            success: false,
            message: "Failed to get summary",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });

  // hub query
  hub
    .command("query <sql>")
    .description("Execute SQL query across all registered repositories")
    .option("--branch <branch>", "Branch to query (default: base)", "base")
    .option("--json", "Output as JSON")
    .action(async (sql, options) => {
      try {
        const hubDir = await getWorkspaceHubDir();
        const result = await hubQueryCommand({
          hubDir,
          sql,
          branch: options.branch,
          json: options.json,
        });
        if (!result.success) {
          if (options.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: result.error,
              })
            );
          } else {
            displayCommandResult({
              success: false,
              message: "Query failed",
              error: result.error,
            });
          }
          return;
        }
        console.log(result.output);
        if (!options.json) {
          console.log(`\n${result.message}`);
        }
      } catch (err) {
        if (options.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          );
        } else {
          displayCommandResult({
            success: false,
            message: "Query failed",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
}
