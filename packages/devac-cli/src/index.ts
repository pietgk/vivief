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
  registerCallGraphCommand,
  registerCleanCommand,
  registerContextCommand,
  registerDependentsCommand,
  registerDepsCommand,
  registerFileSymbolsCommand,
  registerFindSymbolCommand,
  registerHubCommand,
  registerLintCommand,
  registerMcpCommand,
  registerQueryCommand,
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
registerAnalyzeCommand(program);
registerQueryCommand(program);
registerVerifyCommand(program);
registerCleanCommand(program);
registerWatchCommand(program);
registerTypecheckCommand(program);
registerLintCommand(program);
registerTestCommand(program);
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

// Parse and run
program.parse();
