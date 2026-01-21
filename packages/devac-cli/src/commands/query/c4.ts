/**
 * Query C4 Subcommand
 *
 * Generate C4 architecture diagrams from domain effects.
 * Wraps the c4 command functionality.
 */

import * as path from "node:path";
import type { Command } from "commander";
import {
  c4ContainersCommand,
  c4ContextCommand,
  c4DomainsCommand,
  c4ExternalsCommand,
} from "../c4.js";

/**
 * Register the c4 subcommand under query
 */
export function registerQueryC4(parent: Command): void {
  const c4 = parent.command("c4").description("Generate C4 architecture diagrams");

  // Context level
  c4.command("context")
    .description("Generate C4 Context diagram")
    .option("-p, --package <path>", "Package path")
    .option("--system-name <name>", "System name for diagram", "System")
    .option("--system-description <desc>", "System description")
    .option("-l, --limit <count>", "Maximum effects to process", "1000")
    .option("-o, --output <file>", "Output file for PlantUML")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await c4ContextCommand({
        packagePath: options.package ? path.resolve(options.package) : undefined,
        systemName: options.systemName,
        systemDescription: options.systemDescription,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        output: options.output,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // Containers level
  c4.command("containers")
    .description("Generate C4 Container diagram")
    .option("-p, --package <path>", "Package path")
    .option("--system-name <name>", "System name for diagram", "System")
    .option("--grouping <strategy>", "Grouping strategy (directory, package, flat)", "directory")
    .option("-l, --limit <count>", "Maximum effects to process", "1000")
    .option("-o, --output <file>", "Output file for PlantUML")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await c4ContainersCommand({
        packagePath: options.package ? path.resolve(options.package) : undefined,
        systemName: options.systemName,
        grouping: options.grouping,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        output: options.output,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // Domains
  c4.command("domains")
    .description("Discover domain boundaries from effects")
    .option("-p, --package <path>", "Package path")
    .option("-l, --limit <count>", "Maximum effects to process", "1000")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await c4DomainsCommand({
        packagePath: options.package ? path.resolve(options.package) : undefined,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // External systems
  c4.command("externals")
    .description("List external systems from effects")
    .option("-p, --package <path>", "Package path")
    .option("-l, --limit <count>", "Maximum effects to process", "1000")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await c4ExternalsCommand({
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
