/**
 * Query Deps Subcommand
 *
 * Get outgoing dependencies (edges) from an entity.
 * Wraps the deps command functionality.
 */

import * as path from "node:path";
import type { Command } from "commander";
import { depsCommand } from "../deps.js";

/**
 * Register the deps subcommand under query
 */
export function registerQueryDeps(parent: Command): void {
  parent
    .command("deps <entityId>")
    .description("Get dependencies of an entity")
    .option("-p, --package <path>", "Query single package only")
    .option("-t, --type <type>", "Filter by edge type (CALLS, IMPORTS, EXTENDS, etc.)")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (entityId, options) => {
      const result = await depsCommand({
        entityId,
        packagePath: options.package ? path.resolve(options.package) : undefined,
        edgeType: options.type,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
