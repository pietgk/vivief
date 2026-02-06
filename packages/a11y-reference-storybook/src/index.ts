#!/usr/bin/env node
/**
 * A11y Reference Storybook CLI Entry Point
 *
 * Command-line interface for generating accessibility reference stories
 * from axe-core rules and fixtures.
 */

import { Command } from "commander";
import { registerGenerateCommand } from "./commands/index.js";
import { VERSION } from "./version.js";

// Export types and utilities for programmatic use
export { VERSION } from "./version.js";
export { registerGenerateCommand } from "./commands/index.js";
export type {
  CommandRegister,
  CommandResult,
  CommonOptions,
  GenerateOptions,
  AxeRuleMetadata,
  A11yReferenceMetadata,
  StoryEntry,
  RuleManifestEntry,
  A11yRuleManifest,
} from "./commands/index.js";

/**
 * Create and configure the CLI program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name("a11y-stories")
    .version(VERSION)
    .description(
      "Generate reference Storybook stories from axe-core rules for accessibility testing validation"
    );

  // Register all commands
  registerGenerateCommand(program);

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
