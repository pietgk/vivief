/**
 * File Symbols Command Implementation
 *
 * Gets all symbols defined in a specific file.
 * Based on MCP get_file_symbols tool.
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
 * Options for file-symbols command
 */
export interface FileSymbolsCommandOptions {
  /** File path to get symbols from */
  filePath: string;
  /** Package path (for package-only queries, overrides hub mode) */
  packagePath?: string;
  /** Filter by kind (function, class, variable, etc.) */
  kind?: string;
  /** Maximum results to return */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from file-symbols command
 */
export interface FileSymbolsCommandResult {
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
 * Run file-symbols command
 */
export async function fileSymbolsCommand(
  options: FileSymbolsCommandOptions
): Promise<FileSymbolsCommandResult> {
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

      if (options.kind || options.limit) {
        // Use SQL query for filtering
        let sql = `SELECT * FROM nodes WHERE source_file = '${options.filePath.replace(
          /'/g,
          "''"
        )}'`;
        if (options.kind) {
          sql += ` AND kind = '${options.kind.replace(/'/g, "''")}'`;
        }
        if (options.limit) {
          sql += ` LIMIT ${options.limit}`;
        }
        result = await seedReader.querySeeds(sql);
      } else {
        // Use optimized getNodesByFile
        const nodes = await seedReader.getNodesByFile(options.filePath);
        result = {
          rows: nodes as unknown[],
          rowCount: nodes.length,
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
              ? formatOutput({ symbols: [], count: 0 }, { json: true })
              : "No repositories registered in hub",
            count: 0,
            timeMs: Date.now() - startTime,
            symbols: [],
          };
        }

        let sql = `SELECT * FROM {nodes} WHERE source_file = '${options.filePath.replace(
          /'/g,
          "''"
        )}'`;
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
    }

    const symbols = result.rows as unknown[];
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
 * Register the file-symbols command with the CLI program
 */
export function registerFileSymbolsCommand(program: Command): void {
  program
    .command("file-symbols <filePath>")
    .description("Get all symbols defined in a file (queries all repos by default)")
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
