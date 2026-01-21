/**
 * Query Call-Graph Subcommand
 *
 * Get call graph (callers and/or callees) for a function.
 * Wraps the call-graph command functionality.
 */

import * as path from "node:path";
import type { Command } from "commander";
import { callGraphCommand } from "../call-graph.js";

/**
 * Register the call-graph subcommand under query
 */
export function registerQueryCallGraph(parent: Command): void {
  parent
    .command("call-graph <entityId>")
    .description("Get call graph for a function")
    .option("-p, --package <path>", "Query single package only")
    .option("-d, --direction <dir>", "Direction (callers, callees, both)", "both")
    .option("--max-depth <depth>", "Maximum traversal depth", "3")
    .option("-l, --limit <count>", "Maximum results per direction", "100")
    .option("--json", "Output as JSON")
    .action(async (entityId, options) => {
      const result = await callGraphCommand({
        entityId,
        direction: options.direction as "callers" | "callees" | "both",
        packagePath: options.package ? path.resolve(options.package) : undefined,
        maxDepth: options.maxDepth ? Number.parseInt(options.maxDepth, 10) : undefined,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
