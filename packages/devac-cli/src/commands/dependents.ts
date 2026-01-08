/**
 * Dependents Command Implementation
 *
 * Gets incoming dependencies (reverse edges) to an entity.
 * Based on MCP get_dependents tool.
 */

import * as path from "node:path";
import {
  DuckDBPool,
  type QueryResult,
  createCentralHub,
  createSeedReader,
  queryMultiplePackages,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { getWorkspaceHubDir } from "../utils/workspace-discovery.js";
import { formatDependencies, formatOutput } from "./output-formatter.js";

/**
 * Options for dependents command
 */
export interface DependentsCommandOptions {
  /** Entity ID to get dependents for */
  entityId: string;
  /** Package path (for package-only queries, overrides hub mode) */
  packagePath?: string;
  /** Filter by edge type (CALLS, IMPORTS, EXTENDS, etc.) */
  edgeType?: string;
  /** Maximum results to return */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from dependents command
 */
export interface DependentsCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of dependents found */
  count: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw edges data */
  edges?: unknown[];
  /** Error message if failed */
  error?: string;
}

/**
 * Run dependents command
 */
export async function dependentsCommand(
  options: DependentsCommandOptions
): Promise<DependentsCommandResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    let result: QueryResult<unknown>;

    if (options.packagePath) {
      // Package mode: query single package (only when explicitly requested)
      const pkgPath = path.resolve(options.packagePath);
      const seedReader = createSeedReader(pool, pkgPath);

      if (options.edgeType || options.limit) {
        // Use SQL query for filtering
        let sql = `SELECT * FROM edges WHERE target_entity_id = '${options.entityId.replace(
          /'/g,
          "''"
        )}'`;
        if (options.edgeType) {
          sql += ` AND edge_type = '${options.edgeType.replace(/'/g, "''")}'`;
        }
        if (options.limit) {
          sql += ` LIMIT ${options.limit}`;
        }
        result = await seedReader.querySeeds(sql);
      } else {
        // Use optimized getEdgesByTarget
        const edges = await seedReader.getEdgesByTarget(options.entityId);
        result = {
          rows: edges as unknown[],
          rowCount: edges.length,
          timeMs: 0,
        };
      }
    } else {
      // Hub mode (default): query all registered repos
      const hubDir = await getWorkspaceHubDir();
      const hub = createCentralHub({ hubDir, readOnly: true });

      try {
        await hub.init();
        const repos = await hub.listRepos();
        const packagePaths = repos.map((r) => r.localPath);

        if (packagePaths.length === 0) {
          return {
            success: true,
            output: options.json
              ? formatOutput({ edges: [], count: 0 }, { json: true })
              : "No repositories registered in hub",
            count: 0,
            timeMs: Date.now() - startTime,
            edges: [],
          };
        }

        let sql = `SELECT * FROM {edges} WHERE target_entity_id = '${options.entityId.replace(
          /'/g,
          "''"
        )}'`;
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
    }

    const edges = result.rows as unknown[];
    const output = options.json
      ? formatOutput({ edges, count: edges.length }, { json: true })
      : formatDependencies(edges, { json: false, direction: "incoming" });

    return {
      success: true,
      output,
      count: edges.length,
      timeMs: Date.now() - startTime,
      edges,
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
 * Register the dependents command with the CLI program
 */
export function registerDependentsCommand(program: Command): void {
  program
    .command("dependents <entityId>")
    .description("Get dependents of an entity (queries all repos by default)")
    .option("-p, --package <path>", "Query single package only")
    .option("-t, --type <type>", "Filter by edge type (CALLS, IMPORTS, etc.)")
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
