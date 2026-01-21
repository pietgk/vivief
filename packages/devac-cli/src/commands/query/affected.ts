/**
 * Query Affected Subcommand
 *
 * Analyze which files are affected by changes to specified files.
 * Wraps the affected command functionality.
 */

import * as path from "node:path";
import type { Command } from "commander";
import { affectedCommand } from "../affected.js";

/**
 * Register the affected subcommand under query
 */
export function registerQueryAffected(parent: Command): void {
  parent
    .command("affected <files...>")
    .description("Find files affected by changes")
    .option("-p, --package <path>", "Package path to analyze", process.cwd())
    .option("-d, --max-depth <depth>", "Maximum traversal depth", "10")
    .option("--format <format>", "Output format (json, list, tree)", "json")
    .option("--json", "Output as JSON (shorthand for --format json)")
    .action(async (files, options) => {
      const format = options.json ? "json" : options.format;
      const result = await affectedCommand({
        packagePath: path.resolve(options.package),
        changedFiles: files,
        maxDepth: options.maxDepth ? Number.parseInt(options.maxDepth, 10) : undefined,
        format,
      });

      if (result.success) {
        switch (format) {
          case "list":
            for (const file of result.affectedFiles) {
              console.log(`${file.filePath} (${file.impactLevel}, depth=${file.depth})`);
            }
            break;
          case "tree":
            console.log(`Changed symbols: ${result.changedSymbols.length}`);
            for (const sym of result.changedSymbols) {
              console.log(`  ${sym.kind} ${sym.name} (${sym.filePath})`);
            }
            console.log(`\nAffected files: ${result.totalAffected}`);
            for (const file of result.affectedFiles) {
              console.log(`  ${"  ".repeat(file.depth)}${file.filePath}`);
            }
            break;
          default:
            console.log(JSON.stringify(result, null, 2));
        }
        console.error(`\n(${result.analysisTimeMs}ms)`);
      } else {
        console.error(`✗ Analysis failed: ${result.error}`);
        process.exit(1);
      }
    });
}
