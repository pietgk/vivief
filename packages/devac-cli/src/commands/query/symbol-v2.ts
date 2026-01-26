/**
 * Query Symbol Subcommand (v2 - Using Shared Query Layer)
 *
 * This is the new version using the shared query layer from devac-core.
 * Demonstrates the "thin adapter" pattern where CLI just maps flags to params.
 */

import * as path from "node:path";
import {
  DuckDBPool,
  type SymbolFindParams,
  createHubClient,
  createQueryContext,
  symbolFind,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { getWorkspaceHubDir } from "../../utils/workspace-discovery.js";
import { formatOutput, formatSymbols } from "../output-formatter.js";

/**
 * Result from symbol query command
 */
export interface SymbolQueryResult {
  success: boolean;
  output: string;
  count: number;
  timeMs: number;
  data?: unknown;
  error?: string;
}

/**
 * CLI options mapped to SymbolFindParams
 */
interface CliOptions {
  package?: string;
  kind?: string;
  file?: string;
  exported?: boolean;
  level?: "counts" | "summary" | "details";
  limit?: string;
  json?: boolean;
}

/**
 * Run symbol find query using shared query layer
 */
export async function symbolQueryCommand(
  name: string,
  options: CliOptions
): Promise<SymbolQueryResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Get package paths for query context
    let packages: string[];

    if (options.package) {
      // Package mode: single package
      packages = [path.resolve(options.package)];
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
            ? formatOutput({ data: [], total: 0 }, { json: true })
            : "No repositories registered in hub",
          count: 0,
          timeMs: Date.now() - startTime,
          data: [],
        };
      }
    }

    // Create query context
    const ctx = createQueryContext({ pool, packages });

    // Map CLI options to shared params
    const params: SymbolFindParams = {
      name,
      kind: options.kind as SymbolFindParams["kind"],
      file: options.file,
      exported: options.exported,
      level: options.level ?? "summary",
      limit: options.limit ? Number.parseInt(options.limit, 10) : 50,
      offset: 0,
    };

    // Execute shared query
    const result = await symbolFind(ctx, params);

    // Format output based on CLI preferences
    let output: string;
    if (options.json) {
      output = formatOutput(result, { json: true });
    } else if (params.level === "counts") {
      // Format counts nicely
      const data = result.data as { total: number; byCategory?: Record<string, number> };
      output = `Total: ${data.total}\n`;
      if (data.byCategory) {
        output += "By kind:\n";
        for (const [kind, count] of Object.entries(data.byCategory)) {
          output += `  ${kind}: ${count}\n`;
        }
      }
    } else {
      // Format summary/details as table
      output = formatSymbols(result.data as unknown[], { json: false });
    }

    // Add warnings if present
    if (result.warnings && result.warnings.length > 0 && !options.json) {
      output = `Warnings:\n${result.warnings.map((w) => `  ⚠️ ${w}`).join("\n")}\n\n${output}`;
    }

    return {
      success: true,
      output,
      count: result.total,
      timeMs: result.queryTimeMs,
      data: result.data,
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
 * Register the symbol subcommand (v2) under query
 *
 * Uses the shared query layer for consistent behavior with MCP.
 * This is the "thin adapter" pattern - CLI just maps flags to shared params.
 */
export function registerQuerySymbolV2(parent: Command): void {
  parent
    .command("symbol-find <name>")
    .description(
      "Find symbols by name pattern. " + "Supports * wildcards (e.g., 'handle*', '*Click')."
    )
    .option("-p, --package <path>", "Query single package only")
    .option("-k, --kind <kind>", "Filter by symbol kind (function, class, method, variable, etc.)")
    .option("-f, --file <path>", "Filter by file path (supports * wildcards)")
    .option("-e, --exported", "Only show exported symbols")
    .option(
      "-l, --level <level>",
      "Output level: counts (totals), summary (key fields), details (full)",
      "summary"
    )
    .option("--limit <count>", "Maximum results", "50")
    .option("--json", "Output as JSON")
    .action(async (name: string, options: CliOptions) => {
      const result = await symbolQueryCommand(name, options);
      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}

/**
 * Note: This v2 command demonstrates the migration path.
 *
 * To fully migrate:
 * 1. Test that v2 produces equivalent results to v1
 * 2. Mark v1 as deprecated (add deprecation notice)
 * 3. Update CLI help to point users to new command
 * 4. Remove v1 in next major version
 *
 * Benefits of shared query layer:
 * - Consistent behavior between CLI and MCP
 * - Unified output levels (counts/summary/details)
 * - Unified parameter names (name, kind, file, level, limit)
 * - Type-safe params via Zod validation
 * - Single source of truth for query logic
 */
