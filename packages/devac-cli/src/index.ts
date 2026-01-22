#!/usr/bin/env node

/**
 * DevAC CLI Entry Point
 *
 * Command-line interface for analyzing TypeScript, Python, and C# packages
 * and querying seed data.
 */

import { setGlobalLogLevel } from "@pietgk/devac-core";
import { Command } from "commander";
import {
  registerMcpCommand,
  registerQueryCommand,
  registerStatusCommand,
  registerSyncCommand,
  registerWorkflowCommand,
} from "./commands/index.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("devac")
  .description("DevAC - Code analysis with DuckDB + Parquet")
  .version(VERSION)
  .option("--verbose", "Enable verbose logging (shows debug messages)")
  .option("--debug", "Enable debug logging (maximum verbosity)")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.debug) {
      setGlobalLogLevel("debug");
    } else if (opts.verbose) {
      setGlobalLogLevel("verbose");
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
