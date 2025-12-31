/**
 * Effects Command Implementation
 *
 * Queries effects extracted during analysis.
 * Part of DevAC v3.0 Foundation.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DuckDBPool,
  type QueryResult,
  createCentralHub,
  discoverPackagesInRepo,
  executeWithRecovery,
  queryMultiplePackages,
  setupQueryContext,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { formatOutput, formatTable } from "./output-formatter.js";

function getDefaultHubDir(): string {
  return path.join(os.homedir(), ".devac");
}

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
 * Options for effects command
 */
export interface EffectsCommandOptions {
  /** Package path (for package mode) */
  packagePath?: string;
  /** Use hub mode for federated queries */
  hub?: boolean;
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Filter by effect type */
  type?: string;
  /** Filter by file path */
  file?: string;
  /** Filter by source entity ID */
  entity?: string;
  /** Show only external calls */
  externalOnly?: boolean;
  /** Show only async calls */
  asyncOnly?: boolean;
  /** Maximum results to return */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from effects command
 */
export interface EffectsCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of effects found */
  count: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw effects data */
  effects?: unknown[];
  /** Error message if failed */
  error?: string;
}

/**
 * Format effects for display
 */
function formatEffects(effects: unknown[], options: { json: boolean }): string {
  if (options.json) {
    return formatOutput({ effects, count: effects.length }, { json: true });
  }

  if (effects.length === 0) {
    return "No effects found";
  }

  const rows = effects.map((effect: unknown) => {
    const e = effect as Record<string, unknown>;
    const callee = (e.callee_name as string) || (e.target_resource as string) || "-";
    const location = `${e.source_file_path}:${e.source_line}`;
    return {
      "Effect Type": e.effect_type as string,
      Callee: callee,
      Location: location,
    };
  });

  return formatTable(rows, { columns: ["Effect Type", "Callee", "Location"] });
}

/**
 * Run effects command
 */
export async function effectsCommand(
  options: EffectsCommandOptions
): Promise<EffectsCommandResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    let result: QueryResult<unknown>;

    // Build SQL query with filters
    const conditions: string[] = [];
    if (options.type) {
      conditions.push(`effect_type = '${options.type.replace(/'/g, "''")}'`);
    }
    if (options.file) {
      conditions.push(
        `source_file_path LIKE '%${options.file.replace(/'/g, "''").replace(/%/g, "\\%")}%'`
      );
    }
    if (options.entity) {
      conditions.push(`source_entity_id = '${options.entity.replace(/'/g, "''")}'`);
    }
    if (options.externalOnly) {
      conditions.push("is_external = true");
    }
    if (options.asyncOnly) {
      conditions.push("is_async = true");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = options.limit ? `LIMIT ${options.limit}` : "LIMIT 100";

    if (options.hub) {
      // Hub mode: query all registered repos
      const hubDir = options.hubDir || getDefaultHubDir();
      const hub = createCentralHub({ hubDir, readOnly: true });

      try {
        await hub.init();
        const repos = await hub.listRepos();

        if (repos.length === 0) {
          return {
            success: true,
            output: options.json
              ? formatOutput({ effects: [], count: 0 }, { json: true })
              : "No repositories registered in hub",
            count: 0,
            timeMs: Date.now() - startTime,
            effects: [],
          };
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
          return {
            success: true,
            output: options.json
              ? formatOutput({ effects: [], count: 0 }, { json: true })
              : "No packages with effects found in registered repos (run 'devac analyze' first)",
            count: 0,
            timeMs: Date.now() - startTime,
            effects: [],
          };
        }

        const sql = `SELECT * FROM {effects} ${whereClause} ${limitClause}`;
        result = await queryMultiplePackages(pool, packagePaths, sql);
      } finally {
        await hub.close();
      }
    } else {
      // Package mode: query single package
      const pkgPath = options.packagePath
        ? path.resolve(options.packagePath)
        : path.resolve(process.cwd());

      // Set up query context to create views for effects table
      await setupQueryContext(pool, { packagePath: pkgPath });

      const sql = `SELECT * FROM effects ${whereClause} ${limitClause}`;
      const queryStartTime = Date.now();
      result = await executeWithRecovery(pool, async (conn) => {
        const rows = await conn.all(sql);
        return {
          rows,
          rowCount: rows.length,
          timeMs: Date.now() - queryStartTime,
        };
      });
    }

    const effects = result.rows;
    const output = formatEffects(effects, { json: options.json ?? false });

    return {
      success: true,
      output,
      count: effects.length,
      timeMs: Date.now() - startTime,
      effects,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `Error: ${errorMessage}`;

    return {
      success: false,
      output,
      count: 0,
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
 * Options for effects summary command
 */
export interface EffectsSummaryOptions {
  /** Package path (for package mode) */
  packagePath?: string;
  /** Use hub mode for federated queries */
  hub?: boolean;
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Group by field: type, file, entity */
  groupBy?: "type" | "file" | "entity";
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from effects summary command
 */
export interface EffectsSummaryResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw summary data */
  summary?: unknown[];
  /** Error message if failed */
  error?: string;
}

/**
 * Run effects summary command
 */
export async function effectsSummaryCommand(
  options: EffectsSummaryOptions
): Promise<EffectsSummaryResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    const groupBy = options.groupBy || "type";
    const groupField =
      groupBy === "type"
        ? "effect_type"
        : groupBy === "file"
          ? "source_file_path"
          : "source_entity_id";

    let result: QueryResult<unknown>;

    if (options.hub) {
      const hubDir = options.hubDir || getDefaultHubDir();
      const hub = createCentralHub({ hubDir, readOnly: true });

      try {
        await hub.init();
        const repos = await hub.listRepos();

        if (repos.length === 0) {
          return {
            success: true,
            output: options.json
              ? formatOutput({ summary: [], total: 0 }, { json: true })
              : "No repositories registered in hub",
            timeMs: Date.now() - startTime,
            summary: [],
          };
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
          return {
            success: true,
            output: options.json
              ? formatOutput({ summary: [], total: 0 }, { json: true })
              : "No packages with effects found in registered repos (run 'devac analyze' first)",
            timeMs: Date.now() - startTime,
            summary: [],
          };
        }

        const sql = `SELECT ${groupField} as group_key, COUNT(*) as count FROM {effects} GROUP BY ${groupField} ORDER BY count DESC`;
        result = await queryMultiplePackages(pool, packagePaths, sql);
      } finally {
        await hub.close();
      }
    } else {
      const pkgPath = options.packagePath
        ? path.resolve(options.packagePath)
        : path.resolve(process.cwd());

      // Set up query context to create views for effects table
      await setupQueryContext(pool, { packagePath: pkgPath });

      const sql = `SELECT ${groupField} as group_key, COUNT(*) as count FROM effects GROUP BY ${groupField} ORDER BY count DESC`;
      const queryStartTime = Date.now();
      result = await executeWithRecovery(pool, async (conn) => {
        const rows = await conn.all(sql);
        return {
          rows,
          rowCount: rows.length,
          timeMs: Date.now() - queryStartTime,
        };
      });
    }

    const summary = result.rows as Array<{ group_key: string; count: number }>;
    const total = summary.reduce((acc: number, row) => acc + Number(row.count), 0);

    const output = options.json
      ? formatOutput({ summary, total }, { json: true })
      : formatEffectsSummary(summary, groupBy, total);

    return {
      success: true,
      output,
      timeMs: Date.now() - startTime,
      summary,
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

function formatEffectsSummary(summary: unknown[], groupBy: string, total: number): string {
  if (summary.length === 0) {
    return "No effects found";
  }

  const lines = [`Effects Summary (grouped by ${groupBy})`, `Total: ${total}`, ""];
  for (const row of summary) {
    const r = row as Record<string, unknown>;
    lines.push(`  ${r.group_key}: ${r.count}`);
  }
  return lines.join("\n");
}

/**
 * Register the effects command with the CLI program
 */
export function registerEffectsCommand(program: Command): void {
  const effectsCmd = program
    .command("effects")
    .description("Query effects extracted during analysis");

  // effects list subcommand (also the default when no subcommand given)
  effectsCmd
    .command("list", { isDefault: true })
    .description("List effects (default command)")
    .option("-p, --package <path>", "Package path")
    .option("--hub", "Query all registered repos via Hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("-t, --type <type>", "Filter by effect type (FunctionCall, Store, etc.)")
    .option("-f, --file <path>", "Filter by file path")
    .option("-e, --entity <id>", "Filter by source entity ID")
    .option("--external-only", "Show only external calls")
    .option("--async-only", "Show only async calls")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await effectsCommand({
        packagePath,
        hub: options.hub,
        hubDir: options.hubDir,
        type: options.type,
        file: options.file,
        entity: options.entity,
        externalOnly: options.externalOnly,
        asyncOnly: options.asyncOnly,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // effects summary subcommand
  effectsCmd
    .command("summary")
    .description("Get summary statistics for effects")
    .option("-p, --package <path>", "Package path")
    .option("--hub", "Query all registered repos via Hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("-g, --group-by <field>", "Group by: type, file, entity", "type")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await effectsSummaryCommand({
        packagePath,
        hub: options.hub,
        hubDir: options.hubDir,
        groupBy: options.groupBy as "type" | "file" | "entity",
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
