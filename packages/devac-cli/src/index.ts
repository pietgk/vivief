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
  registerAffectedCommand,
  registerAnalyzeCommand,
  registerC4Command,
  registerCallGraphCommand,
  registerCleanCommand,
  registerContextCommand,
  registerCoverageCommand,
  registerDependentsCommand,
  registerDepsCommand,
  registerDiagnosticsCommand,
  registerEffectsCommand,
  registerFileSymbolsCommand,
  registerFindSymbolCommand,
  registerHubCommand,
  registerLintCommand,
  registerMcpCommand,
  registerQueryCommand,
  registerRulesCommand,
  registerStatusCommand,
  registerTestCommand,
  registerTypecheckCommand,
  registerValidateCommand,
  registerVerifyCommand,
  registerWatchCommand,
  registerWorkspaceCommand,
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

// Register all commands
registerStatusCommand(program);
registerAnalyzeCommand(program);
registerQueryCommand(program);
registerVerifyCommand(program);
registerCleanCommand(program);
registerWatchCommand(program);
registerTypecheckCommand(program);
registerLintCommand(program);
registerTestCommand(program);
registerCoverageCommand(program);
registerValidateCommand(program);
registerAffectedCommand(program);
registerFindSymbolCommand(program);
registerDepsCommand(program);
registerDependentsCommand(program);
registerFileSymbolsCommand(program);
registerCallGraphCommand(program);
registerContextCommand(program);
registerMcpCommand(program);
registerHubCommand(program);
registerWorkspaceCommand(program);
registerDiagnosticsCommand(program);

// v3.0 Effects, Rules, C4 commands
registerEffectsCommand(program);
registerRulesCommand(program);
registerC4Command(program);

// Default action: show status one-liner when no command is provided
program.action(async () => {
  // If no command provided, show status
  const { statusCommand } = await import("./commands/status.js");
  try {
    const result = await statusCommand({
      path: process.cwd(),
      format: "oneline",
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
