#!/usr/bin/env node

/**
 * DevAC CLI Entry Point
 *
 * Command-line interface for analyzing TypeScript, Python, and C# packages
 * and querying seed data.
 */

import * as path from "node:path";
import { Command } from "commander";
import { getDefaultHubDir } from "./commands/hub-init.js";
import {
  affectedCommand,
  analyzeCommand,
  cleanCommand,
  hubInitCommand,
  hubListCommand,
  hubRefreshCommand,
  hubRegisterCommand,
  hubStatusCommand,
  hubUnregisterCommand,
  mcpCommand,
  queryCommand,
  validateCommand,
  verifyCommand,
  watchCommand,
} from "./commands/index.js";

const program = new Command();

program
  .name("devac")
  .description("DevAC - Code analysis with DuckDB + Parquet")
  .version("0.1.0");

// ─────────────────────────────────────────────────────────────────────────────
// ANALYZE COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("analyze")
  .description("Analyze package and generate seed files")
  .option("-p, --package <path>", "Package path to analyze", process.cwd())
  .option("-r, --repo <name>", "Repository name", "repo")
  .option("-b, --branch <name>", "Git branch name", "main")
  .option("--if-changed", "Only analyze if source files changed")
  .option("--force", "Force full reanalysis")
  .option("--all", "Analyze all packages in repository")
  .option("--resolve", "Run semantic resolution after structural analysis")
  .option("--verbose", "Enable verbose output")
  .action(async (options) => {
    const result = await analyzeCommand({
      packagePath: path.resolve(options.package),
      repoName: options.repo,
      branch: options.branch,
      ifChanged: options.ifChanged,
      force: options.force,
      all: options.all,
      resolve: options.resolve,
      verbose: options.verbose,
    });

    if (result.success) {
      if (result.skipped) {
        console.log("No changes detected - skipped analysis");
      } else {
        console.log(
          `✓ Analyzed ${result.filesAnalyzed} files in ${result.timeMs}ms`
        );
        console.log(`  Nodes: ${result.nodesCreated}`);
        console.log(`  Edges: ${result.edgesCreated}`);
        console.log(`  External refs: ${result.refsCreated}`);
        if (result.refsResolved !== undefined) {
          console.log(`  Refs resolved: ${result.refsResolved}`);
        }
      }
    } else {
      console.error(`✗ Analysis failed: ${result.error}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// QUERY COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("query <sql>")
  .description("Execute SQL query against seed files")
  .option("-p, --package <path>", "Package path", process.cwd())
  .option("-f, --format <type>", "Output format (json, csv, table)", "json")
  .action(async (sql, options) => {
    const result = await queryCommand({
      sql,
      packagePath: path.resolve(options.package),
      format: options.format,
    });

    if (result.success) {
      switch (options.format) {
        case "csv":
          console.log(result.csv);
          break;
        case "table":
          console.log(result.table);
          break;
        default:
          console.log(JSON.stringify(result.rows, null, 2));
      }

      if (result.timeMs !== undefined) {
        console.error(`\n(${result.rowCount} rows, ${result.timeMs}ms)`);
      }
    } else {
      console.error(`✗ Query failed: ${result.error}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("verify")
  .description("Verify seed file integrity")
  .option("-p, --package <path>", "Package path to verify", process.cwd())
  .option("-b, --branch <name>", "Git branch name", "base")
  .action(async (options) => {
    const result = await verifyCommand({
      packagePath: path.resolve(options.package),
      branch: options.branch,
    });

    if (result.valid) {
      console.log("✓ Seeds verified successfully");

      if (result.stats) {
        console.log(`  Nodes: ${result.stats.nodeCount}`);
        console.log(`  Edges: ${result.stats.edgeCount}`);
        console.log(`  External refs: ${result.stats.refCount}`);
        console.log(`  Files: ${result.stats.fileCount}`);

        if (result.stats.unresolvedRefs > 0) {
          console.log(`  Unresolved refs: ${result.stats.unresolvedRefs}`);
        }
        if (result.stats.orphanedEdges > 0) {
          console.log(`  Orphaned edges: ${result.stats.orphanedEdges}`);
        }
      }

      if (result.warnings.length > 0) {
        console.log("\nWarnings:");
        for (const warning of result.warnings) {
          console.log(`  ⚠ ${warning}`);
        }
      }
    } else {
      console.error("✗ Verification failed:");
      for (const error of result.errors) {
        console.error(`  • ${error}`);
      }
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// CLEAN COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("clean")
  .description("Remove seed files (forces regeneration)")
  .option("-p, --package <path>", "Package path to clean", process.cwd())
  .option("--config", "Also remove .devac configuration")
  .action(async (options) => {
    const result = await cleanCommand({
      packagePath: path.resolve(options.package),
      cleanConfig: options.config,
    });

    if (result.success) {
      if (result.filesRemoved > 0) {
        const sizeKb = Math.round(result.bytesFreed / 1024);
        console.log(`✓ Cleaned ${result.filesRemoved} files (${sizeKb} KB)`);
      } else {
        console.log("✓ Nothing to clean");
      }
    } else {
      console.error(`✗ Clean failed: ${result.error}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// WATCH COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("watch")
  .description("Watch package for changes and update seeds incrementally")
  .option("-p, --package <path>", "Package path to watch", process.cwd())
  .option("-r, --repo <name>", "Repository name", "repo")
  .option("-b, --branch <name>", "Git branch name", "main")
  .option("--verbose", "Enable verbose logging")
  .option("--debug", "Enable debug logging")
  .option("--debounce <ms>", "Debounce interval in milliseconds", "100")
  .option("--force", "Force initial analysis")
  .action(async (options) => {
    console.log(`Watching ${path.resolve(options.package)}...`);
    console.log("Press Ctrl+C to stop\n");

    const controller = await watchCommand({
      packagePath: path.resolve(options.package),
      repoName: options.repo,
      branch: options.branch,
      verbose: options.verbose,
      debug: options.debug,
      debounceMs: Number.parseInt(options.debounce, 10),
      force: options.force,
    });

    // Handle shutdown signals
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, stopping watch...`);
      await controller.stop();
      const status = controller.getStatus();
      console.log(
        `\nProcessed ${status.changesProcessed} changes, ${status.errors} errors`
      );
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  });

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATE COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("validate")
  .description("Validate code changes and run affected tests")
  .option("-p, --package <path>", "Package path", process.cwd())
  .option("-f, --files <files...>", "Changed files to validate")
  .option("--quick", "Run quick validation (1-hop, no tests)")
  .option("--full", "Run full validation (N-hop, with tests)")
  .action(async (options) => {
    const mode = options.full ? "full" : options.quick ? "quick" : "quick";
    const result = await validateCommand({
      packagePath: path.resolve(options.package),
      changedFiles: options.files || [],
      mode,
    });

    if (result.success) {
      console.log(`✓ Validation passed (${mode} mode)`);
      console.log(`  Affected files: ${result.affected.affectedFiles.length}`);
      console.log(`  Total time: ${result.totalTimeMs}ms`);
    } else {
      console.error(`✗ Validation failed: ${result.totalIssues} issues`);
      if (result.typecheck?.issues) {
        for (const issue of result.typecheck.issues) {
          console.error(`  ${issue.file}:${issue.line} - ${issue.message}`);
        }
      }
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// AFFECTED COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("affected <files...>")
  .description("Find files affected by changes")
  .option("-p, --package <path>", "Package path", process.cwd())
  .option("--depth <n>", "Maximum traversal depth", "10")
  .option("--json", "Output as JSON")
  .action(async (files, options) => {
    const result = await affectedCommand({
      packagePath: path.resolve(options.package),
      changedFiles: files,
      maxDepth: Number.parseInt(options.depth, 10),
    });

    if (result.success) {
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Found ${result.affectedFiles.length} affected files:`);
        for (const file of result.affectedFiles) {
          console.log(
            `  ${file.impactLevel === "direct" ? "→" : "⤳"} ${file.filePath}`
          );
        }
        console.log(`\nAnalysis time: ${result.analysisTimeMs}ms`);
      }
    } else {
      console.error(`✗ Affected analysis failed: ${result.error}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// MCP COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("mcp")
  .description("Start MCP server for AI assistant integration")
  .option("-p, --package <path>", "Package path", process.cwd())
  .action(async (options) => {
    console.log("Starting MCP server...");

    const result = await mcpCommand({
      packagePath: path.resolve(options.package),
      action: "start",
    });

    if (!result.success) {
      console.error(`✗ Failed to start MCP server: ${result.error}`);
      process.exit(1);
    }

    const controller = result.controller;
    if (!controller) {
      console.error("✗ No controller returned");
      process.exit(1);
    }

    console.log(`MCP server running with ${result.toolCount} tools`);

    // Handle shutdown signals
    const shutdown = async (signal: string) => {
      console.error(`${signal} received, stopping MCP server...`);
      await controller.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  });

// ─────────────────────────────────────────────────────────────────────────────
// HUB COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

const hub = program.command("hub").description("Central hub management");

hub
  .command("init")
  .description("Initialize central hub")
  .option("--force", "Overwrite existing hub")
  .option("--path <path>", "Custom hub location")
  .action(async (options) => {
    const hubDir = options.path || getDefaultHubDir();
    const result = await hubInitCommand({
      hubDir,
      force: options.force,
    });

    if (result.created) {
      console.log(`✓ Hub initialized at ${result.hubPath}`);
    } else {
      console.log(`Hub already exists at ${result.hubPath}`);
    }
  });

hub
  .command("register <path>")
  .description("Register a repository with the hub")
  .action(async (repoPath) => {
    const result = await hubRegisterCommand({
      hubDir: getDefaultHubDir(),
      repoPath: path.resolve(repoPath),
    });

    if (result.success) {
      console.log(`✓ Registered ${result.repoId}`);
      console.log(`  Packages: ${result.packages}`);
      console.log(`  Cross-repo edges: ${result.crossRepoEdges}`);
    } else {
      console.error(`✗ Registration failed: ${result.error}`);
      process.exit(1);
    }
  });

hub
  .command("list")
  .description("List registered repositories")
  .option("--verbose", "Show detailed information")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const result = await hubListCommand({
      hubDir: getDefaultHubDir(),
      verbose: options.verbose,
      json: options.json,
    });

    if (options.json) {
      console.log(JSON.stringify(result.repos, null, 2));
    } else {
      if (result.repos.length === 0) {
        console.log("No repositories registered");
      } else {
        console.log(`Registered repositories (${result.repos.length}):\n`);
        for (const repo of result.repos) {
          const statusIcon =
            repo.status === "active"
              ? "✓"
              : repo.status === "stale"
              ? "⚠"
              : "✗";
          console.log(`  ${statusIcon} ${repo.repoId}`);
          console.log(`    Path: ${repo.localPath}`);
          console.log(`    Packages: ${repo.packages}`);
          if (options.verbose) {
            console.log(`    Last synced: ${repo.lastSynced}`);
          }
          console.log();
        }
      }
    }
  });

hub
  .command("unregister <repo-id>")
  .description("Unregister a repository from the hub")
  .action(async (repoId) => {
    const result = await hubUnregisterCommand({
      hubDir: getDefaultHubDir(),
      repoId,
    });

    if (result.success) {
      console.log(`✓ Unregistered ${repoId}`);
    } else {
      console.error(`✗ Unregister failed: ${result.error}`);
      process.exit(1);
    }
  });

hub
  .command("status")
  .description("Show hub status")
  .action(async () => {
    const result = await hubStatusCommand({
      hubDir: getDefaultHubDir(),
    });

    if (!result.success || !result.status) {
      console.error(`✗ ${result.error || "Failed to get hub status"}`);
      process.exit(1);
    }

    const status = result.status;
    console.log("Hub Status:");
    console.log(`  Path: ${status.hubPath}`);
    console.log(`  Repositories: ${status.repoCount}`);
    console.log(`  Total packages: ${status.totalPackages}`);
    console.log(`  Cross-repo edges: ${status.crossRepoEdges}`);
    console.log(`  Cache size: ${status.cacheSize}`);
    console.log(`  Last sync: ${status.lastSync}`);
  });

hub
  .command("refresh [repo-id]")
  .description("Refresh repository manifests")
  .option("--force", "Force regeneration of all manifests")
  .action(async (repoId, options) => {
    const result = await hubRefreshCommand({
      hubDir: getDefaultHubDir(),
      repoId,
      force: options.force,
    });

    if (result.success) {
      console.log(`✓ Refreshed ${result.reposRefreshed} repositories`);
      console.log(`  Packages updated: ${result.packagesUpdated}`);
      console.log(`  Edges updated: ${result.edgesUpdated}`);
      if (result.errors.length > 0) {
        console.log("\nWarnings:");
        for (const error of result.errors) {
          console.log(`  ⚠ ${error}`);
        }
      }
    } else {
      console.error("✗ Refresh failed");
      for (const error of result.errors) {
        console.error(`  • ${error}`);
      }
      process.exit(1);
    }
  });

// Parse and run
program.parse();
