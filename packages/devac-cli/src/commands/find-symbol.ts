/**
 * Find Symbol Command Implementation
 *
 * Finds symbols by name in the code graph.
 * Based on MCP find_symbol tool.
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
import { formatOutput, formatSymbols } from "./output-formatter.js";

/**
 * Options for find-symbol command
 */
export interface FindSymbolOptions {
  /** Symbol name to find */
  name: string;
  /** Optional kind filter (function, class, variable, etc.) */
  kind?: string;
  /** Package path (for package mode) */
  packagePath?: string;
  /** Use hub mode for federated queries */
  hub?: boolean;
  /** Maximum results to return */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from find-symbol command
 */
export interface FindSymbolResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of symbols found */
  count: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw symbols data */
  symbols?: unknown[];
  /** Error message if failed */
  error?: string;
}

/**
 * Run find-symbol command
 */
export async function findSymbolCommand(options: FindSymbolOptions): Promise<FindSymbolResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    let result: QueryResult<unknown>;

    if (options.hub) {
      // Hub mode: query all registered repos
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
              ? formatOutput({ symbols: [], count: 0 }, { json: true })
              : "No repositories registered in hub",
            count: 0,
            timeMs: Date.now() - startTime,
            symbols: [],
          };
        }

        let sql = `SELECT * FROM {nodes} WHERE name = '${options.name.replace(/'/g, "''")}'`;
        if (options.kind) {
          sql += ` AND kind = '${options.kind.replace(/'/g, "''")}'`;
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

      let sql = `SELECT * FROM nodes WHERE name = '${options.name.replace(/'/g, "''")}'`;
      if (options.kind) {
        sql += ` AND kind = '${options.kind.replace(/'/g, "''")}'`;
      }
      if (options.limit) {
        sql += ` LIMIT ${options.limit}`;
      }

      result = await seedReader.querySeeds(sql);
    }

    const symbols = result.rows;
    const output = options.json
      ? formatOutput({ symbols, count: symbols.length }, { json: true })
      : formatSymbols(symbols, { json: false });

    return {
      success: true,
      output,
      count: symbols.length,
      timeMs: Date.now() - startTime,
      symbols,
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
 * Register the find-symbol command with the CLI program
 */
export function registerFindSymbolCommand(program: Command): void {
  program
    .command("find-symbol <name>")
    .description("Find symbol by name")
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("-k, --kind <kind>", "Symbol kind filter")
    .option("--hub", "Query all registered repos via Hub")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (name, options) => {
      const result = await findSymbolCommand({
        name,
        kind: options.kind,
        packagePath: options.package ? path.resolve(options.package) : undefined,
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
