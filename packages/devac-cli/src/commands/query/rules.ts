/**
 * Query Rules Subcommand
 *
 * Run the rules engine on effects to produce domain effects.
 * Wraps the rules command functionality.
 */

import * as path from "node:path";
import type { Command } from "commander";
import { rulesListCommand, rulesRunCommand, rulesStatsCommand } from "../rules.js";

/**
 * Register the rules subcommand under query
 */
export function registerQueryRules(parent: Command): void {
  const rules = parent.command("rules").description("Run rules engine on effects");

  // Run rules
  rules
    .command("run")
    .description("Process effects through rules engine")
    .option("-p, --package <path>", "Package path")
    .option("-d, --domain <domain>", "Filter output by domain")
    .option("-l, --limit <count>", "Maximum effects to process", "1000")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await rulesRunCommand({
        packagePath: options.package ? path.resolve(options.package) : undefined,
        domain: options.domain,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // List rules
  rules
    .command("list")
    .description("List available rules")
    .option("-d, --domain <domain>", "Filter by domain (e.g., Payment, Auth)")
    .option("--provider <provider>", "Filter by provider (e.g., stripe, aws)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await rulesListCommand({
        domain: options.domain,
        provider: options.provider,
        json: options.json,
      });

      console.log(result.output);
    });

  // Stats
  rules
    .command("stats")
    .description("Show rule match statistics")
    .option("-p, --package <path>", "Package path")
    .option("-l, --limit <count>", "Maximum effects to process", "1000")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await rulesStatsCommand({
        packagePath: options.package ? path.resolve(options.package) : undefined,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // Default action - run rules
  rules.action(async () => {
    const result = await rulesRunCommand({
      limit: 1000,
      json: false,
    });

    console.log(result.output);
    if (!result.success) {
      process.exit(1);
    }
  });
}
