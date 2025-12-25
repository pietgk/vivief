/**
 * Hub Init Command Implementation
 *
 * Initializes the central federation hub for DevAC v2.0.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createCentralHub } from "@pietgk/devac-core";
import type { Command } from "commander";
import { hubDiagnosticsCommand } from "./hub-diagnostics.js";
import { hubErrorsCommand } from "./hub-errors.js";
import { hubList } from "./hub-list.js";
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

      return {
        success: true,
        hubPath,
        created: true,
        message,
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
 * Get the default hub directory path
 */
export function getDefaultHubDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(home, ".devac");
}

/**
 * Register the hub command with all subcommands
 */
export function registerHubCommand(program: Command): void {
  const hub = program.command("hub").description("Central hub for cross-repository federation");

  // hub init
  hub
    .command("init")
    .description("Initialize the central hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("--force", "Force reinitialization")
    .action(async (options) => {
      const result = await hubInit({
        hubDir: options.hubDir,
        force: options.force,
      });
      console.log(result.message);
      if (!result.success) {
        process.exit(1);
      }
    });

  // hub register
  hub
    .command("register <path>")
    .description("Register a repository with the hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .action(async (repoPath, options) => {
      const result = await hubRegister({
        hubDir: options.hubDir,
        repoPath: path.resolve(repoPath),
      });
      console.log(result.message);
      if (!result.success) {
        process.exit(1);
      }
    });

  // hub unregister
  hub
    .command("unregister <repoId>")
    .description("Unregister a repository from the hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .action(async (repoId, options) => {
      const result = await hubUnregister({ hubDir: options.hubDir, repoId });
      console.log(result.message);
      if (!result.success) {
        process.exit(1);
      }
    });

  // hub list
  hub
    .command("list")
    .description("List registered repositories")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Verbose output")
    .action(async (options) => {
      const result = await hubList({
        hubDir: options.hubDir,
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
    });

  // hub status
  hub
    .command("status")
    .description("Show hub status")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await hubStatus({ hubDir: options.hubDir });
      if (options.json && result.status) {
        console.log(JSON.stringify(result.status, null, 2));
      } else {
        console.log(result.message);
      }
      if (!result.success) {
        process.exit(1);
      }
    });

  // hub refresh
  hub
    .command("refresh [repoId]")
    .description("Refresh repository manifests")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("--force", "Force regenerate all manifests")
    .action(async (repoId, options) => {
      const result = await hubRefresh({
        hubDir: options.hubDir,
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
      if (result.success) {
        if (result.ciSync) console.log(`CI: ${result.ciSync.pushed} items synced`);
        if (result.issuesSync) console.log(`Issues: ${result.issuesSync.pushed} items synced`);
        if (result.reviewsSync) console.log(`Reviews: ${result.reviewsSync.pushed} items synced`);
      } else {
        console.error(`✗ Sync failed: ${result.error}`);
        process.exit(1);
      }
    });

  // hub errors
  hub
    .command("errors")
    .description("Query validation errors from the hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("--repo <id>", "Filter by repository")
    .option("--severity <level>", "Filter by severity (error, warning)")
    .option("--source <source>", "Filter by source (tsc, eslint, test)")
    .option("--file <path>", "Filter by file path")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await hubErrorsCommand({
        hubDir: options.hubDir,
        repoId: options.repo,
        severity: options.severity,
        source: options.source,
        file: options.file,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });
      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // hub diagnostics (legacy alias: feedback)
  hub
    .command("diagnostics")
    .alias("feedback")
    .description("Query unified diagnostics from the hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
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
      const result = await hubDiagnosticsCommand({
        hubDir: options.hubDir,
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
      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // hub summary
  hub
    .command("summary <type>")
    .description("Get summary/counts (validation, diagnostics, counts)")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("--group-by <field>", "Group by field")
    .option("--json", "Output as JSON")
    .action(async (type, options) => {
      const result = await hubSummaryCommand({
        hubDir: options.hubDir,
        type: type as "validation" | "diagnostics" | "counts",
        groupBy: options.groupBy,
        json: options.json,
      });
      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
