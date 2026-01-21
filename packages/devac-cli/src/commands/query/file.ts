/**
 * Query File Subcommand
 *
 * Get all symbols defined in a specific file.
 * Wraps the file-symbols command functionality.
 */

import * as path from "node:path";
import type { Command } from "commander";
import { fileSymbolsCommand } from "../file-symbols.js";

/**
 * Register the file subcommand under query
 */
export function registerQueryFile(parent: Command): void {
  parent
    .command("file <filePath>")
    .description("Get all symbols defined in a file")
    .option("-p, --package <path>", "Query single package only")
    .option("-k, --kind <kind>", "Filter by symbol kind")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (filePath, options) => {
      const result = await fileSymbolsCommand({
        filePath,
        packagePath: options.package ? path.resolve(options.package) : undefined,
        kind: options.kind,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
