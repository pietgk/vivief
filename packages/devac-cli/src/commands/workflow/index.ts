/**
 * Workflow Commands
 *
 * CLI commands for deterministic development workflow operations.
 * These commands do mechanical, repeatable work while leaving reasoning to the LLM.
 */

import type { Command } from "commander";
import { checkChangesetCommand } from "./check-changeset.js";
import { checkDocsCommand } from "./check-docs.js";
import { diffSummaryCommand } from "./diff-summary.js";
import { installLocalCommand } from "./install-local.js";
import { preCommitCommand } from "./pre-commit.js";
import { prepareShipCommand } from "./prepare-ship.js";

// Re-export types
export type { CheckChangesetOptions, CheckChangesetResult } from "./check-changeset.js";
export type { CheckDocsOptions, CheckDocsResult, DocIssue } from "./check-docs.js";
export type { DiffSummaryOptions, DiffSummaryResult } from "./diff-summary.js";
export type { InstallLocalOptions, InstallLocalResult } from "./install-local.js";
export type { PreCommitOptions, PreCommitResult } from "./pre-commit.js";
export type { PrepareShipOptions, PrepareShipResult } from "./prepare-ship.js";

// Re-export command functions
export { checkChangesetCommand } from "./check-changeset.js";
export { checkDocsCommand } from "./check-docs.js";
export { diffSummaryCommand } from "./diff-summary.js";
export { installLocalCommand } from "./install-local.js";
export { preCommitCommand } from "./pre-commit.js";
export { prepareShipCommand } from "./prepare-ship.js";

/**
 * Register the workflow command group with all subcommands
 */
export function registerWorkflowCommand(program: Command): void {
  const workflow = program
    .command("workflow")
    .description("Deterministic development workflow operations");

  // workflow check-changeset
  workflow
    .command("check-changeset")
    .description("Check if a changeset is needed based on changed packages")
    .option("-p, --path <path>", "Path to repository root")
    .option("-b, --base <branch>", "Base branch to compare against")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await checkChangesetCommand({
        path: options.path,
        base: options.base,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.formatted) {
        console.log(result.formatted);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }

      if (!result.success) {
        process.exit(1);
      }
    });

  // workflow check-docs
  workflow
    .command("check-docs")
    .description("Check documentation health (ADR index, format, package READMEs)")
    .option("-p, --path <path>", "Path to repository root")
    .option("-b, --base <branch>", "Base branch to compare against")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await checkDocsCommand({
        path: options.path,
        base: options.base,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.formatted) {
        console.log(result.formatted);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }

      // Note: check-docs does NOT exit with error on issues
      // It's a soft check - issues are reported but don't block
      if (!result.success) {
        process.exit(1);
      }
    });

  // workflow pre-commit
  workflow
    .command("pre-commit")
    .description("Validate commit readiness (staged files, lint, types)")
    .option("-p, --path <path>", "Path to repository root")
    .option("--skip-lint", "Skip lint check")
    .option("--skip-types", "Skip typecheck")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await preCommitCommand({
        path: options.path,
        skipLint: options.skipLint,
        skipTypes: options.skipTypes,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.formatted) {
        console.log(result.formatted);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }

      if (!result.success || !result.ready) {
        process.exit(1);
      }
    });

  // workflow prepare-ship
  workflow
    .command("prepare-ship")
    .description("Full pre-ship validation (build, test, lint, changeset)")
    .option("-p, --path <path>", "Path to repository root")
    .option("--skip-validation", "Skip all validation steps")
    .option("--skip-tests", "Skip test run")
    .option("--skip-build", "Skip build step")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await prepareShipCommand({
        path: options.path,
        skipValidation: options.skipValidation,
        skipTests: options.skipTests,
        skipBuild: options.skipBuild,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.formatted) {
        console.log(result.formatted);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }

      if (!result.success || !result.ready) {
        process.exit(1);
      }
    });

  // workflow diff-summary
  workflow
    .command("diff-summary")
    .description("Get structured diff information for LLM drafting")
    .option("-p, --path <path>", "Path to repository root")
    .option("-b, --base <branch>", "Base branch to compare against")
    .option("--staged", "Use staged changes instead of branch diff")
    .option("--include-content", "Include full diff content")
    .option("--max-diff-size <chars>", "Maximum diff size to include", "50000")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await diffSummaryCommand({
        path: options.path,
        base: options.base,
        staged: options.staged,
        includeContent: options.includeContent,
        maxDiffSize: options.maxDiffSize ? Number.parseInt(options.maxDiffSize, 10) : undefined,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.formatted) {
        console.log(result.formatted);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }

      if (!result.success) {
        process.exit(1);
      }
    });

  // workflow install-local
  workflow
    .command("install-local")
    .description("Build and link CLI packages globally for local testing")
    .option("-p, --path <path>", "Path to repository root")
    .option("--skip-build", "Skip build step (just link)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await installLocalCommand({
        path: options.path,
        skipBuild: options.skipBuild,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.formatted) {
        console.log(result.formatted);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }

      if (!result.success) {
        process.exit(1);
      }
    });
}
