/**
 * Query Effects Subcommand
 *
 * Query code effects (function calls, store operations, etc.) extracted during analysis.
 * Wraps the effects command functionality.
 */

import * as path from "node:path";
import type { Command } from "commander";
import { effectsCommand } from "../effects.js";

/**
 * Register the effects subcommand under query
 */
export function registerQueryEffects(parent: Command): void {
  parent
    .command("effects")
    .description("Query code effects (function calls, store operations, etc.)")
    .option("-p, --package <path>", "Query single package only")
    .option("-t, --type <type>", "Filter by effect type (FunctionCall, Store, etc.)")
    .option("-f, --file <path>", "Filter by file path (partial match)")
    .option("-e, --entity <id>", "Filter by source entity ID")
    .option("--external", "Show only external calls")
    .option("--async", "Show only async calls")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await effectsCommand({
        packagePath: options.package ? path.resolve(options.package) : undefined,
        type: options.type,
        file: options.file,
        entity: options.entity,
        externalOnly: options.external,
        asyncOnly: options.async,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
