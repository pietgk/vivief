/**
 * Query Command Implementation
 *
 * Execute SQL queries against seed files.
 * Based on spec Section 11.2: Query Commands
 *
 * Query UX Features:
 * - Auto-creates views for nodes, edges, external_refs
 * - Supports @package syntax: nodes@core, edges@*, etc.
 */

import * as path from "node:path";
import {
  DuckDBPool,
  buildPackageMap,
  discoverPackagesInRepo,
  executeWithRecovery,
  preprocessSql,
  setupQueryContext,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import type { QueryOptions, QueryResult } from "./types.js";

/**
 * Find the repository root by looking for .git directory
 */
async function findRepoRoot(startPath: string): Promise<string | null> {
  const fs = await import("node:fs/promises");
  let currentPath = startPath;

  while (currentPath !== path.dirname(currentPath)) {
    try {
      const gitPath = path.join(currentPath, ".git");
      await fs.access(gitPath);
      return currentPath;
    } catch {
      currentPath = path.dirname(currentPath);
    }
  }

  return null;
}

/**
 * Execute a SQL query against seed files
 */
export async function queryCommand(options: QueryOptions): Promise<QueryResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    // Initialize DuckDB pool
    pool = new DuckDBPool({ memoryLimit: "512MB" });
    await pool.initialize();

    // Discover packages for @package syntax
    const repoRoot = await findRepoRoot(options.packagePath);
    const packages = repoRoot
      ? await discoverPackagesInRepo(repoRoot)
      : await discoverPackagesInRepo(options.packagePath);
    const packageMap = buildPackageMap(packages);

    // Set up query context with views
    const contextResult = await setupQueryContext(pool, {
      packagePath: options.packagePath,
      packages: packageMap,
    });

    // Log warnings (but don't fail)
    if (contextResult.warnings.length > 0 && !contextResult.viewsCreated.length) {
      // Only warn if no views were created at all
      return {
        success: false,
        error: `No seed files found. Run 'devac analyze' first. (${contextResult.warnings.join(", ")})`,
        timeMs: Date.now() - startTime,
      };
    }

    // Preprocess SQL to expand @package syntax
    const { sql: processedSql, errors: preprocessErrors } = preprocessSql(options.sql, packageMap);
    if (preprocessErrors.length > 0) {
      return {
        success: false,
        error: `SQL preprocessing failed: ${preprocessErrors.join(", ")}`,
        timeMs: Date.now() - startTime,
      };
    }

    // Execute query
    const rows = await executeWithRecovery(pool, async (conn) => {
      return await conn.all(processedSql);
    });

    const rowCount = rows.length;
    const timeMs = Date.now() - startTime;

    // Format output based on requested format
    switch (options.format) {
      case "csv":
        return {
          success: true,
          csv: formatAsCsv(rows as Record<string, unknown>[]),
          rowCount,
          timeMs,
        };

      case "table":
        return {
          success: true,
          table: formatAsTable(rows as Record<string, unknown>[]),
          rowCount,
          timeMs,
        };
      default:
        return {
          success: true,
          rows: rows as Record<string, unknown>[],
          rowCount,
          timeMs,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timeMs: Date.now() - startTime,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Format rows as CSV string
 */
function formatAsCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "";
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return "";
  }

  const headers = Object.keys(firstRow);
  const lines: string[] = [];

  // Header row
  lines.push(headers.map(escapeCsvField).join(","));

  // Data rows
  for (const row of rows) {
    const values = headers.map((h) => escapeCsvField(String(row[h] ?? "")));
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

/**
 * Escape a field for CSV
 */
function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format rows as ASCII table
 */
function formatAsTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "(no results)";
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return "(no results)";
  }

  const headers = Object.keys(firstRow);

  // Calculate column widths using Map for type safety
  const widths = new Map<string, number>();
  for (const header of headers) {
    widths.set(header, header.length);
  }

  for (const row of rows) {
    for (const header of headers) {
      const value = String(row[header] ?? "");
      const currentWidth = widths.get(header) ?? 0;
      widths.set(header, Math.max(currentWidth, value.length));
    }
  }

  // Cap widths at reasonable max
  const maxWidth = 50;
  for (const header of headers) {
    const currentWidth = widths.get(header) ?? 0;
    widths.set(header, Math.min(currentWidth, maxWidth));
  }

  // Helper to get width safely
  const getWidth = (h: string): number => widths.get(h) ?? 0;

  // Build table
  const lines: string[] = [];

  // Header separator
  const sep = `+${headers.map((h) => "-".repeat(getWidth(h) + 2)).join("+")}+`;

  // Header
  lines.push(sep);
  lines.push(`| ${headers.map((h) => h.padEnd(getWidth(h)).slice(0, getWidth(h))).join(" | ")} |`);
  lines.push(sep);

  // Rows
  for (const row of rows) {
    const cells = headers.map((h) => {
      const value = String(row[h] ?? "");
      const width = getWidth(h);
      return value.padEnd(width).slice(0, width);
    });
    lines.push(`| ${cells.join(" | ")} |`);
  }

  lines.push(sep);

  return lines.join("\n");
}

/**
 * Register the query command with the CLI program
 */
export function registerQueryCommand(program: Command): void {
  program
    .command("query <sql>")
    .description("Execute SQL query against seed files")
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("-f, --format <type>", "Output format (json, csv, table)", "json")
    .option("--json", "Output as JSON (shorthand for --format json)")
    .action(async (sql, options) => {
      const format = options.json ? "json" : options.format;
      const result = await queryCommand({
        sql,
        packagePath: path.resolve(options.package),
        format,
      });

      if (result.success) {
        switch (format) {
          case "csv":
            console.log(result.csv);
            break;
          case "table":
            console.log(result.table);
            break;
          default:
            console.log(JSON.stringify(result.rows, null, 2));
        }

        if (result.timeMs !== undefined) {
          console.error(`\n(${result.rowCount} rows, ${result.timeMs}ms)`);
        }
      } else {
        console.error(`✗ Query failed: ${result.error}`);
        process.exit(1);
      }
    });
}
