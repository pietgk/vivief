/**
 * Query Context Subcommand
 *
 * Discover cross-repository context including CI status and issues.
 * Wraps the context command functionality.
 */

import type { Command } from "commander";
import { contextCICommand, contextCommand, contextIssuesCommand } from "../context.js";

/**
 * Register the context subcommand under query
 */
export function registerQueryContext(parent: Command): void {
  const context = parent.command("context").description("Discover cross-repository context");

  // Main context discovery
  context
    .command("discover")
    .description("Discover current working context")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await contextCommand({
        cwd: process.cwd(),
        format: options.json ? "json" : "text",
      });

      if (result.success) {
        if (options.json) {
          console.log(JSON.stringify(result.context, null, 2));
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });

  // CI status
  context
    .command("ci")
    .description("Get CI status for all repos/worktrees")
    .option("--include-checks", "Include individual check details")
    .option("--sync-to-hub", "Sync CI status to central hub")
    .option("--failing-only", "Only sync failing checks (with --sync-to-hub)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await contextCICommand({
        cwd: process.cwd(),
        format: options.json ? "json" : "text",
        includeChecks: options.includeChecks,
        syncToHub: options.syncToHub,
        failingOnly: options.failingOnly,
      });

      if (result.success) {
        if (options.json) {
          console.log(
            JSON.stringify({ result: result.result, syncResult: result.syncResult }, null, 2)
          );
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });

  // Issues
  context
    .command("issues")
    .description("Get GitHub issues for context")
    .option("--open-only", "Only fetch open issues (default)", true)
    .option("--all", "Fetch all issues (open and closed)")
    .option("-l, --limit <count>", "Maximum issues per repo", "20")
    .option("--sync-to-hub", "Sync issues to central hub")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await contextIssuesCommand({
        cwd: process.cwd(),
        format: options.json ? "json" : "text",
        issuesOptions: {
          openOnly: options.all ? false : options.openOnly,
          limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        },
        syncToHub: options.syncToHub,
      });

      if (result.success) {
        if (options.json) {
          console.log(
            JSON.stringify({ result: result.result, syncResult: result.syncResult }, null, 2)
          );
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });

  // Default action - show discover
  context.action(async () => {
    const result = await contextCommand({
      cwd: process.cwd(),
      format: "text",
    });

    if (result.success) {
      console.log(result.formatted);
    } else {
      console.error(`✗ ${result.error}`);
      process.exit(1);
    }
  });
}
