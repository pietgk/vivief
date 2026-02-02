#!/usr/bin/env node

/**
 * DevAC CLI Entry Point
 *
 * Command-line interface for analyzing TypeScript, Python, and C# packages
 * and querying seed data.
 */

import { runHealthCheck, setGlobalLogLevel } from "@pietgk/devac-core";
import { Command } from "commander";
import {
  registerCleanupCommand,
  registerMcpCommand,
  registerQueryCommand,
  registerStatusCommand,
  registerSyncCommand,
  registerWorkflowCommand,
} from "./commands/index.js";
import {
  applyFixesWithProgress,
  promptForRecovery,
  warnNonInteractive,
} from "./utils/recovery-prompt.js";
import { findWorkspaceHubDir } from "./utils/workspace-discovery.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("devac")
  .description("DevAC - Code analysis with DuckDB + Parquet")
  .version(VERSION)
  .option("--verbose", "Enable verbose logging (shows debug messages)")
  .option("--debug", "Enable debug logging (maximum verbosity)")
  .option("--heal", "Auto-fix health issues without prompting")
  .option("--skip-health", "Skip health check entirely")
  .hook("preAction", async (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();

    // Set log level
    if (opts.debug) {
      setGlobalLogLevel("debug");
    } else if (opts.verbose) {
      setGlobalLogLevel("verbose");
    }

    // Skip health check if requested
    if (opts.skipHealth) {
      return;
    }

    // Try to find the hub directory
    const hubDir = await findWorkspaceHubDir();
    if (!hubDir) {
      // Not in a workspace - skip health check
      return;
    }

    // Run health check
    const health = await runHealthCheck({ hubDir });

    if (!health.healthy) {
      if (opts.heal) {
        // Auto-fix mode: apply fixes without prompting
        await applyFixesWithProgress(health.issues);
      } else if (process.stdin.isTTY && process.stderr.isTTY) {
        // Interactive mode: prompt user
        const shouldFix = await promptForRecovery(health.issues);
        if (shouldFix) {
          await applyFixesWithProgress(health.issues);
        }
      } else {
        // Non-interactive mode: warn and continue
        warnNonInteractive(health.issues);
      }
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Three Core Commands (v4.0 reorganization)
// ─────────────────────────────────────────────────────────────────────────────

// Sync: analyze packages, register repos, sync CI/issues/docs
registerSyncCommand(program);

// Status: workspace health, seeds, diagnostics, doctor
registerStatusCommand(program);

// Query: all code graph queries (symbol, deps, sql, etc.)
registerQueryCommand(program);

// ─────────────────────────────────────────────────────────────────────────────
// Utility Commands
// ─────────────────────────────────────────────────────────────────────────────

// MCP: start MCP server for AI assistants
registerMcpCommand(program);

// Workflow: CI/git integration (pre-commit, prepare-ship, etc.)
registerWorkflowCommand(program);

// Cleanup: remove stale branches and worktrees
registerCleanupCommand(program);

// Default action: show status one-liner when no command is provided
program.action(async () => {
  // If no command provided, show status
  const { statusCommand } = await import("./commands/status.js");
  try {
    const result = await statusCommand({
      path: process.cwd(),
      level: "summary",
      groupBy: "type",
    });
    if (result.formatted) {
      console.log(result.formatted);
    }
  } catch {
    // If status fails, show help instead
    program.help();
  }
});

// Parse and run
program.parse();
