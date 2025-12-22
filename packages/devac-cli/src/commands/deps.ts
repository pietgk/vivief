/**
 * Dependencies Command Implementation
 *
 * Gets outgoing dependencies (edges) from an entity.
 * Based on MCP get_dependencies tool.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
  DuckDBPool,
  type QueryResult,
  createCentralHub,
  createSeedReader,
  queryMultiplePackages,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { formatDependencies, formatOutput } from "./output-formatter.js";

function getDefaultHubDir(): string {
  return path.join(os.homedir(), ".devac");
}

/**
 * Options for deps command
 */
export interface DepsCommandOptions {
  /** Entity ID to get dependencies for */
  entityId: string;
  /** Package path (for package mode) */
  packagePath?: string;
  /** Use hub mode for federated queries */
  hub?: boolean;
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Filter by edge type (CALLS, IMPORTS, EXTENDS, etc.) */
  edgeType?: string;
  /** Maximum results to return */
  limit?: number;
  /** Output in human-readable format */
  pretty?: boolean;
}

/**
 * Result from deps command
 */
export interface DepsCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of dependencies found */
  count: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw edges data */
  edges?: unknown[];
  /** Error message if failed */
  error?: string;
}

/**
 * Run deps command
 */
export async function depsCommand(options: DepsCommandOptions): Promise<DepsCommandResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    let result: QueryResult<unknown>;

    if (options.hub) {
      // Hub mode: query all registered repos
      const hubDir = options.hubDir || getDefaultHubDir();
      const hub = createCentralHub({ hubDir });

      try {
        await hub.init();
        const repos = await hub.listRepos();
        const packagePaths = repos.map((r) => r.localPath);

        if (packagePaths.length === 0) {
          return {
            success: true,
            output: options.pretty
              ? "No repositories registered in hub"
              : formatOutput({ edges: [], count: 0 }, { pretty: false }),
            count: 0,
            timeMs: Date.now() - startTime,
            edges: [],
          };
        }

        let sql = `SELECT * FROM {edges} WHERE source_entity_id = '${options.entityId.replace(/'/g, "''")}'`;
        if (options.edgeType) {
          sql += ` AND edge_type = '${options.edgeType.replace(/'/g, "''")}'`;
        }
        if (options.limit) {
          sql += ` LIMIT ${options.limit}`;
        }

        result = await queryMultiplePackages(pool, packagePaths, sql);
      } finally {
        await hub.close();
      }
    } else {
      // Package mode: query single package
      const pkgPath = options.packagePath
        ? path.resolve(options.packagePath)
        : path.resolve(process.cwd());
      const seedReader = createSeedReader(pool, pkgPath);

      if (options.edgeType || options.limit) {
        // Use SQL query for filtering
        let sql = `SELECT * FROM edges WHERE source_entity_id = '${options.entityId.replace(/'/g, "''")}'`;
        if (options.edgeType) {
          sql += ` AND edge_type = '${options.edgeType.replace(/'/g, "''")}'`;
        }
        if (options.limit) {
          sql += ` LIMIT ${options.limit}`;
        }
        result = await seedReader.querySeeds(sql);
      } else {
        // Use optimized getEdgesBySource
        const edges = await seedReader.getEdgesBySource(options.entityId);
        result = { rows: edges as unknown[], rowCount: edges.length, timeMs: 0 };
      }
    }

    const edges = result.rows as unknown[];
    const output = options.pretty
      ? formatDependencies(edges, { pretty: true, direction: "outgoing" })
      : formatOutput({ edges, count: edges.length }, { pretty: false });

    return {
      success: true,
      output,
      count: edges.length,
      timeMs: Date.now() - startTime,
      edges,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.pretty
      ? `Error: ${errorMessage}`
      : formatOutput({ success: false, error: errorMessage }, { pretty: false });

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
 * Register the deps command with the CLI program
 */
export function registerDepsCommand(program: Command): void {
  program
    .command("deps <entityId>")
    .description("Get dependencies of an entity")
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("-t, --type <type>", "Filter by edge type (CALLS, IMPORTS, etc.)")
    .option("--hub", "Query all registered repos via Hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--pretty", "Human-readable output", true)
    .action(async (entityId, options) => {
      const result = await depsCommand({
        entityId,
        packagePath: options.package ? path.resolve(options.package) : undefined,
        hub: options.hub,
        hubDir: options.hubDir,
        edgeType: options.type,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        pretty: options.pretty,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
