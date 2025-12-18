/**
 * Query Command Implementation
 *
 * Execute SQL queries against seed files.
 * Based on spec Section 11.2: Query Commands
 */

import { DuckDBPool, executeWithRecovery } from "@pietgk/devac-core";
import type { QueryOptions, QueryResult } from "./types.js";

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

    // Execute query
    const rows = await executeWithRecovery(pool, async (conn) => {
      return await conn.all(options.sql);
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
