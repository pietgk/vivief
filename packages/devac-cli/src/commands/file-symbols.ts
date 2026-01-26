/**
 * File Symbols Command Implementation
 *
 * Gets all symbols defined in a specific file.
 * Uses the shared query layer for consistent behavior with other commands.
 */

import * as path from "node:path";
import {
  DuckDBPool,
  type SymbolFileParams,
  createHubClient,
  createQueryContext,
  symbolFile,
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

    // Get package paths for query context
    let packages: string[];

    if (options.packagePath) {
      // Package mode: single package
      packages = [path.resolve(options.packagePath)];
    } else {
      // Hub mode (default): all registered repos
      const hubDir = await getWorkspaceHubDir();
      const client = createHubClient({ hubDir });
      const repos = await client.listRepos();
      packages = repos.map((r) => r.localPath);

      if (packages.length === 0) {
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
    }

    // Create query context (same as symbol query)
    const ctx = createQueryContext({ pool, packages });

    // Map CLI options to shared params
    const params: SymbolFileParams = {
      file: options.filePath,
      kind: options.kind as SymbolFileParams["kind"],
      level: "summary",
      limit: options.limit ?? 100,
    };

    // Execute shared query
    const result = await symbolFile(ctx, params);

    // Format output
    const symbols = result.data as unknown[];
    const output = options.json
      ? formatOutput({ symbols, count: result.total }, { json: true })
      : formatSymbols(symbols, { json: false });

    return {
      success: true,
      output,
      count: result.total,
      timeMs: result.queryTimeMs,
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
