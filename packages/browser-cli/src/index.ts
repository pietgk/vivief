#!/usr/bin/env node
/**
 * Browser CLI Entry Point
 *
 * Command-line interface for browser automation.
 */

import { Command } from "commander";
import {
  registerFindCommands,
  registerInteractCommands,
  registerNavigateCommands,
  registerReadCommands,
  registerScanStorybookCommand,
  registerScreenshotCommands,
  registerSessionCommands,
} from "./commands/index.js";
import { VERSION } from "./version.js";

// Export types and utilities for programmatic use
export { VERSION } from "./version.js";
export {
  registerSessionCommands,
  registerNavigateCommands,
  registerReadCommands,
  registerInteractCommands,
  registerScreenshotCommands,
  registerFindCommands,
  registerScanStorybookCommand,
} from "./commands/index.js";
export type { CommandRegister, CommandResult, CommonOptions } from "./commands/index.js";

/**
 * Create and configure the CLI program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name("browser")
    .version(VERSION)
    .description(
      "Browser automation CLI - control browser sessions, navigate pages, and interact with elements"
    );

  // Register all commands
  registerSessionCommands(program);
  registerNavigateCommands(program);
  registerReadCommands(program);
  registerInteractCommands(program);
  registerScreenshotCommands(program);
  registerFindCommands(program);
  registerScanStorybookCommand(program);

  return program;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if called directly
main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
