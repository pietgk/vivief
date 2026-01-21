/**
 * Query Dependents Subcommand
 *
 * Get incoming dependencies (reverse edges) to an entity.
 * Wraps the dependents command functionality.
 */

import * as path from "node:path";
import type { Command } from "commander";
import { dependentsCommand } from "../dependents.js";

/**
 * Register the dependents subcommand under query
 */
export function registerQueryDependents(parent: Command): void {
  parent
    .command("dependents <entityId>")
    .description("Get dependents of an entity (reverse dependencies)")
    .option("-p, --package <path>", "Query single package only")
    .option("-t, --type <type>", "Filter by edge type (CALLS, IMPORTS, EXTENDS, etc.)")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (entityId, options) => {
      const result = await dependentsCommand({
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
