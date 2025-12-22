/**
 * Find Symbol Command Implementation
 *
 * Finds symbols by name in the code graph.
 * Based on MCP find_symbol tool.
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
import { formatOutput, formatSymbols } from "./output-formatter.js";

function getDefaultHubDir(): string {
  return path.join(os.homedir(), ".devac");
}

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
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Maximum results to return */
  limit?: number;
  /** Output in human-readable format */
  pretty?: boolean;
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
              : formatOutput({ symbols: [], count: 0 }, { pretty: false }),
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
    const output = options.pretty
      ? formatSymbols(symbols, { pretty: true })
      : formatOutput({ symbols, count: symbols.length }, { pretty: false });

    return {
      success: true,
      output,
      count: symbols.length,
      timeMs: Date.now() - startTime,
      symbols,
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
