/**
 * Query Symbol Subcommand
 *
 * Find symbols by name in the code graph.
 * Wraps the find-symbol command functionality.
 */

import * as path from "node:path";
import type { Command } from "commander";
import { findSymbolCommand } from "../find-symbol.js";

/**
 * Register the symbol subcommand under query
 */
export function registerQuerySymbol(parent: Command): void {
  parent
    .command("symbol <name>")
    .description("Find symbols by name")
    .option("-p, --package <path>", "Query single package only")
    .option("-k, --kind <kind>", "Filter by symbol kind (function, class, variable, etc.)")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (name, options) => {
      const result = await findSymbolCommand({
        name,
        kind: options.kind,
        packagePath: options.package ? path.resolve(options.package) : undefined,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
