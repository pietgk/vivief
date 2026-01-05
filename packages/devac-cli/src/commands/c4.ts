/**
 * C4 Command Implementation
 *
 * Generates C4 architecture diagrams from domain effects.
 * Part of DevAC v3.0 Foundation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  type C4ContainerDiagram,
  type C4Context,
  type C4ExternalSystem,
  type CodeEffect,
  type DomainBoundary,
  DuckDBPool,
  type QueryResult,
  builtinRules,
  createCentralHub,
  createRuleEngine,
  discoverDomainBoundaries,
  discoverPackagesInRepo,
  executeWithRecovery,
  exportContainersToPlantUML,
  exportContextToPlantUML,
  generateC4Containers,
  generateC4Context,
  queryMultiplePackages,
  setupQueryContext,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { getWorkspaceHubDir } from "../utils/workspace-discovery.js";
import { formatOutput, formatTable } from "./output-formatter.js";

/**
 * Check if a package has effects.parquet file
 */
async function hasEffectsParquet(packagePath: string): Promise<boolean> {
  const effectsPath = path.join(packagePath, ".devac", "seed", "base", "effects.parquet");
  try {
    await fs.promises.access(effectsPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Options for C4 diagram commands
 */
export interface C4CommandOptions {
  /** Package path (for package mode) */
  packagePath?: string;
  /** Use hub mode for federated queries */
  hub?: boolean;
  /** System name for diagrams */
  systemName?: string;
  /** System description */
  systemDescription?: string;
  /** Container grouping strategy */
  grouping?: "directory" | "package" | "flat";
  /** Maximum effects to process */
  limit?: number;
  /** Output file path for PlantUML */
  output?: string;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from C4 context command
 */
export interface C4ContextResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Time taken in milliseconds */
  timeMs: number;
  /** C4 Context data */
  context?: C4Context;
  /** PlantUML output */
  plantUML?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Result from C4 containers command
 */
export interface C4ContainersResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Time taken in milliseconds */
  timeMs: number;
  /** C4 Container diagram data */
  diagram?: C4ContainerDiagram;
  /** PlantUML output */
  plantUML?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Result from C4 domains command
 */
export interface C4DomainsResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Domain boundaries */
  boundaries?: DomainBoundary[];
  /** Error message if failed */
  error?: string;
}

/**
 * Result from C4 externals command
 */
export interface C4ExternalsResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Time taken in milliseconds */
  timeMs: number;
  /** External systems */
  externalSystems?: C4ExternalSystem[];
  /** Error message if failed */
  error?: string;
}

/**
 * Format C4 Context for display
 */
function formatC4Context(context: C4Context, options: { json: boolean }): string {
  if (options.json) {
    return formatOutput(context, { json: true });
  }

  const lines = [
    `C4 Context: ${context.systemName}`,
    context.systemDescription ? `  ${context.systemDescription}` : "",
    "",
    `Total Effects: ${context.effectCount}`,
    "",
    "Domains:",
  ];

  for (const domain of context.domains) {
    lines.push(`  ${domain.domain}: ${domain.count} effects`);
    lines.push(`    Actions: ${domain.actions.join(", ")}`);
  }

  if (context.externalSystems.length > 0) {
    lines.push("");
    lines.push("External Systems:");
    for (const ext of context.externalSystems) {
      lines.push(`  ${ext.name} (${ext.type})`);
    }
  }

  return lines.filter((l) => l !== "").join("\n");
}

/**
 * Format C4 Containers for display
 */
function formatC4Containers(diagram: C4ContainerDiagram, options: { json: boolean }): string {
  if (options.json) {
    return formatOutput(diagram, { json: true });
  }

  const lines = [
    `C4 Containers: ${diagram.systemName}`,
    "",
    `Containers: ${diagram.containers.length}`,
  ];

  for (const container of diagram.containers) {
    lines.push(`  ${container.name}:`);
    lines.push(
      `    Effects: ${container.effects.slice(0, 5).join(", ")}${container.effects.length > 5 ? "..." : ""}`
    );
    lines.push(`    Components: ${container.components.length}`);
  }

  if (diagram.externalSystems.length > 0) {
    lines.push("");
    lines.push("External Systems:");
    for (const ext of diagram.externalSystems) {
      lines.push(`  ${ext.name} (${ext.type})`);
    }
  }

  return lines.join("\n");
}

/**
 * Format domain boundaries for display
 */
function formatDomainBoundaries(boundaries: DomainBoundary[], options: { json: boolean }): string {
  if (options.json) {
    return formatOutput({ boundaries, count: boundaries.length }, { json: true });
  }

  if (boundaries.length === 0) {
    return "No domain boundaries found";
  }

  const rows = boundaries.map((b) => ({
    Domain: b.name,
    Files: String(b.files.length),
    Components: String(b.components.length),
    Cohesion: b.cohesionScore.toFixed(2),
    Actions: b.actions.slice(0, 3).join(", ") + (b.actions.length > 3 ? "..." : ""),
  }));

  return formatTable(rows, { columns: ["Domain", "Files", "Components", "Cohesion", "Actions"] });
}

/**
 * Format external systems for display
 */
function formatExternalSystems(systems: C4ExternalSystem[], options: { json: boolean }): string {
  if (options.json) {
    return formatOutput({ externalSystems: systems, count: systems.length }, { json: true });
  }

  if (systems.length === 0) {
    return "No external systems found";
  }

  const rows = systems.map((s) => ({
    Name: s.name,
    Type: s.type,
    Provider: s.provider ?? "-",
    Relationships: String(s.relationships.length),
  }));

  return formatTable(rows, { columns: ["Name", "Type", "Provider", "Relationships"] });
}

/**
 * Run domain effects through rules engine
 */
async function getDomainEffects(options: C4CommandOptions) {
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    let effectsResult: QueryResult<unknown>;
    const limitClause = options.limit ? `LIMIT ${options.limit}` : "LIMIT 5000";

    if (options.hub) {
      const hubDir = await getWorkspaceHubDir();
      const hub = createCentralHub({ hubDir, readOnly: true });

      try {
        await hub.init();
        const repos = await hub.listRepos();

        if (repos.length === 0) {
          return { effects: [], pool };
        }

        // Discover packages with effects.parquet in each repo
        const packagePaths: string[] = [];
        for (const repo of repos) {
          const packages = await discoverPackagesInRepo(repo.localPath);
          for (const pkg of packages) {
            if (pkg.hasSeeds && (await hasEffectsParquet(pkg.path))) {
              packagePaths.push(pkg.path);
            }
          }
        }

        if (packagePaths.length === 0) {
          return { effects: [], pool };
        }

        const sql = `SELECT * FROM {effects} ${limitClause}`;
        effectsResult = await queryMultiplePackages(pool, packagePaths, sql);
      } finally {
        await hub.close();
      }
    } else {
      const pkgPath = options.packagePath
        ? path.resolve(options.packagePath)
        : path.resolve(process.cwd());

      // Set up query context to create views for effects table
      await setupQueryContext(pool, { packagePath: pkgPath });

      const sql = `SELECT * FROM effects ${limitClause}`;
      const startTime = Date.now();
      effectsResult = await executeWithRecovery(pool, async (conn) => {
        const rows = await conn.all(sql);
        return {
          rows,
          rowCount: rows.length,
          timeMs: Date.now() - startTime,
        };
      });
    }

    // Run rules engine on effects
    const engine = createRuleEngine({ rules: builtinRules });
    const result = engine.process(effectsResult.rows as CodeEffect[]);

    return { effects: result.domainEffects, pool };
  } catch (error) {
    if (pool) {
      await pool.shutdown();
    }
    throw error;
  }
}

/**
 * Run C4 context command - generate C4 Context diagram
 */
export async function c4ContextCommand(options: C4CommandOptions): Promise<C4ContextResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    const { effects, pool: usedPool } = await getDomainEffects(options);
    pool = usedPool;

    if (effects.length === 0) {
      return {
        success: true,
        output: options.json
          ? formatOutput({ message: "No effects found" }, { json: true })
          : "No effects found to generate C4 Context",
        timeMs: Date.now() - startTime,
      };
    }

    const context = generateC4Context(effects, {
      systemName: options.systemName ?? "System",
      systemDescription: options.systemDescription,
    });

    const plantUML = exportContextToPlantUML(context);

    // Write to file if output path specified
    if (options.output) {
      fs.writeFileSync(options.output, plantUML);
    }

    const output = options.output
      ? `PlantUML written to: ${options.output}\n\n${formatC4Context(context, { json: options.json ?? false })}`
      : options.json
        ? formatOutput({ context, plantUML }, { json: true })
        : `${formatC4Context(context, { json: false })}\n\nPlantUML:\n${plantUML}`;

    return {
      success: true,
      output,
      timeMs: Date.now() - startTime,
      context,
      plantUML,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `Error: ${errorMessage}`;

    return {
      success: false,
      output,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Run C4 containers command - generate C4 Container diagram
 */
export async function c4ContainersCommand(options: C4CommandOptions): Promise<C4ContainersResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    const { effects, pool: usedPool } = await getDomainEffects(options);
    pool = usedPool;

    if (effects.length === 0) {
      return {
        success: true,
        output: options.json
          ? formatOutput({ message: "No effects found" }, { json: true })
          : "No effects found to generate C4 Containers",
        timeMs: Date.now() - startTime,
      };
    }

    const diagram = generateC4Containers(effects, {
      systemName: options.systemName ?? "System",
      systemDescription: options.systemDescription,
      containerGrouping: options.grouping ?? "directory",
    });

    const plantUML = exportContainersToPlantUML(diagram);

    // Write to file if output path specified
    if (options.output) {
      fs.writeFileSync(options.output, plantUML);
    }

    const output = options.output
      ? `PlantUML written to: ${options.output}\n\n${formatC4Containers(diagram, { json: options.json ?? false })}`
      : options.json
        ? formatOutput({ diagram, plantUML }, { json: true })
        : `${formatC4Containers(diagram, { json: false })}\n\nPlantUML:\n${plantUML}`;

    return {
      success: true,
      output,
      timeMs: Date.now() - startTime,
      diagram,
      plantUML,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `Error: ${errorMessage}`;

    return {
      success: false,
      output,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Run C4 domains command - discover domain boundaries
 */
export async function c4DomainsCommand(options: C4CommandOptions): Promise<C4DomainsResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    const { effects, pool: usedPool } = await getDomainEffects(options);
    pool = usedPool;

    if (effects.length === 0) {
      return {
        success: true,
        output: options.json
          ? formatOutput({ boundaries: [], count: 0 }, { json: true })
          : "No effects found to discover domain boundaries",
        timeMs: Date.now() - startTime,
        boundaries: [],
      };
    }

    const boundaries = discoverDomainBoundaries(effects);
    const output = formatDomainBoundaries(boundaries, { json: options.json ?? false });

    return {
      success: true,
      output,
      timeMs: Date.now() - startTime,
      boundaries,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `Error: ${errorMessage}`;

    return {
      success: false,
      output,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Run C4 externals command - list external systems
 */
export async function c4ExternalsCommand(options: C4CommandOptions): Promise<C4ExternalsResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    const { effects, pool: usedPool } = await getDomainEffects(options);
    pool = usedPool;

    if (effects.length === 0) {
      return {
        success: true,
        output: options.json
          ? formatOutput({ externalSystems: [], count: 0 }, { json: true })
          : "No effects found to extract external systems",
        timeMs: Date.now() - startTime,
        externalSystems: [],
      };
    }

    const context = generateC4Context(effects, {
      systemName: options.systemName ?? "System",
    });

    const output = formatExternalSystems(context.externalSystems, { json: options.json ?? false });

    return {
      success: true,
      output,
      timeMs: Date.now() - startTime,
      externalSystems: context.externalSystems,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `Error: ${errorMessage}`;

    return {
      success: false,
      output,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Register the C4 command with the CLI program
 */
export function registerC4Command(program: Command): void {
  const c4Cmd = program.command("c4").description("Generate C4 architecture diagrams from effects");

  // c4 context subcommand (also the default when no subcommand given)
  c4Cmd
    .command("context", { isDefault: true })
    .description("Generate C4 Context diagram (default command)")
    .option("-p, --package <path>", "Package path")
    .option("--hub", "Query all registered repos via Hub")
    .option("-n, --name <name>", "System name", "System")
    .option("-d, --description <desc>", "System description")
    .option("-l, --limit <count>", "Maximum effects to process", "5000")
    .option("-o, --output <path>", "Output file for PlantUML")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await c4ContextCommand({
        packagePath,
        hub: options.hub,
        systemName: options.name,
        systemDescription: options.description,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        output: options.output,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // c4 containers subcommand
  c4Cmd
    .command("containers")
    .description("Generate C4 Container diagram")
    .option("-p, --package <path>", "Package path")
    .option("--hub", "Query all registered repos via Hub")
    .option("-n, --name <name>", "System name", "System")
    .option(
      "-g, --grouping <strategy>",
      "Container grouping: directory, package, flat",
      "directory"
    )
    .option("-l, --limit <count>", "Maximum effects to process", "5000")
    .option("-o, --output <path>", "Output file for PlantUML")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await c4ContainersCommand({
        packagePath,
        hub: options.hub,
        systemName: options.name,
        grouping: options.grouping as "directory" | "package" | "flat",
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        output: options.output,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // c4 domains subcommand
  c4Cmd
    .command("domains")
    .description("Discover domain boundaries from effects")
    .option("-p, --package <path>", "Package path")
    .option("--hub", "Query all registered repos via Hub")
    .option("-l, --limit <count>", "Maximum effects to process", "5000")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await c4DomainsCommand({
        packagePath,
        hub: options.hub,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // c4 externals subcommand
  c4Cmd
    .command("externals")
    .description("List external systems detected from effects")
    .option("-p, --package <path>", "Package path")
    .option("--hub", "Query all registered repos via Hub")
    .option("-l, --limit <count>", "Maximum effects to process", "5000")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await c4ExternalsCommand({
        packagePath,
        hub: options.hub,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
