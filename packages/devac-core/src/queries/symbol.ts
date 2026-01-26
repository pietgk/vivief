/**
 * Symbol Query Functions
 *
 * Find and explore code symbols (functions, classes, variables, etc.)
 * Priority 1 queries - most commonly used by LLMs for codebase exploration.
 */

import { z } from "zod";
import type { ParsedNode } from "../types/nodes.js";
import { type QueryContext, executeCountQuery, executeQuery } from "./context.js";
import { escapeSqlString, formatEmpty, formatNodes, globToLike } from "./formatters.js";
import {
  type CountsResult,
  NODE_KINDS,
  NodeKindSchema,
  OutputLevelSchema,
  type QueryResult,
  type SymbolDetail,
  type SymbolSummary,
} from "./types.js";

// ============================================================================
// symbol_find - Primary discovery tool
// ============================================================================

/**
 * Parameters for symbolFind query
 */
export const SymbolFindParamsSchema = z.object({
  /** Symbol name or pattern (supports * wildcards) */
  name: z.string().describe("Symbol name or pattern (supports * wildcards)"),

  /** Filter by entity kind */
  kind: NodeKindSchema.optional().describe(`Filter by entity kind: ${NODE_KINDS.join(", ")}`),

  /** Filter by file path pattern */
  file: z.string().optional().describe("Filter by file path (supports * wildcards)"),

  /** Filter by repository */
  repo: z.string().optional().describe("Filter by repository ID"),

  /** Only show exported symbols */
  exported: z.boolean().optional().describe("Only show exported symbols"),

  /** Output level: counts, summary, or details */
  level: OutputLevelSchema.default("summary").describe(
    "Output level: counts (totals only), summary (key fields), details (full records)"
  ),

  /** Maximum number of results */
  limit: z.number().min(1).max(1000).default(50).describe("Maximum results to return"),

  /** Offset for pagination */
  offset: z.number().min(0).default(0).describe("Number of results to skip"),
});

export type SymbolFindParams = z.infer<typeof SymbolFindParamsSchema>;

/**
 * Find symbols by name pattern
 *
 * @example
 * // Find all functions named "handleClick"
 * await symbolFind(ctx, { name: "handleClick", kind: "function" })
 *
 * // Find all exported classes matching "User*"
 * await symbolFind(ctx, { name: "User*", kind: "class", exported: true })
 */
export async function symbolFind(
  ctx: QueryContext,
  params: SymbolFindParams
): Promise<QueryResult<CountsResult | SymbolSummary[] | SymbolDetail[]>> {
  const startTime = Date.now();
  const { name, kind, file, repo, exported, level, limit, offset } = params;

  // Build WHERE conditions
  const conditions: string[] = [];

  // Name matching - exact or pattern
  if (name.includes("*")) {
    const pattern = globToLike(name);
    conditions.push(`name LIKE '${escapeSqlString(pattern)}'`);
  } else {
    conditions.push(`name = '${escapeSqlString(name)}'`);
  }

  // Kind filter
  if (kind) {
    conditions.push(`kind = '${escapeSqlString(kind)}'`);
  }

  // File path filter
  if (file) {
    if (file.includes("*")) {
      const pattern = globToLike(file);
      conditions.push(`file_path LIKE '${escapeSqlString(pattern)}'`);
    } else {
      conditions.push(`file_path = '${escapeSqlString(file)}'`);
    }
  }

  // Repository filter (entity_id starts with repo:)
  if (repo) {
    conditions.push(`entity_id LIKE '${escapeSqlString(repo)}:%'`);
  }

  // Exported filter
  if (exported === true) {
    conditions.push("is_exported = true");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // For counts level, we just need the count
  if (level === "counts") {
    const countSql = `SELECT COUNT(*) as count FROM nodes ${whereClause}`;
    const countResult = await executeCountQuery(ctx, countSql);

    // Get counts by kind
    const kindSql = `SELECT kind, COUNT(*) as count FROM nodes ${whereClause} GROUP BY kind`;
    const kindResult = await executeQuery<{ kind: string; count: number | bigint }>(ctx, kindSql);

    const byCategory: Record<string, number> = {};
    for (const row of kindResult.rows) {
      byCategory[row.kind] = typeof row.count === "bigint" ? Number(row.count) : row.count;
    }

    return {
      data: { total: countResult.count, byCategory },
      total: countResult.count,
      hasMore: false,
      queryTimeMs: Date.now() - startTime,
      warnings: countResult.warnings,
    };
  }

  // For summary and details, get the actual rows
  // First get total count for pagination info
  const countSql = `SELECT COUNT(*) as count FROM nodes ${whereClause}`;
  const countResult = await executeCountQuery(ctx, countSql);
  const total = countResult.count;

  // Then get the rows with pagination
  const dataSql = `
    SELECT * FROM nodes
    ${whereClause}
    ORDER BY file_path, start_line
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const result = await executeQuery<ParsedNode>(ctx, dataSql);

  return formatNodes(result.rows, level, total, limit, Date.now() - startTime, result.warnings);
}

/**
 * Symbol find definition for adapter generation
 */
export const symbolFindDef = {
  name: "symbol_find",
  description:
    "Find symbols by name pattern. Supports exact match and glob patterns (* wildcards). " +
    "Use this to locate where specific functions, classes, or variables are defined. " +
    "Returns summary by default; use level='details' for full information.",
  params: SymbolFindParamsSchema,
  execute: symbolFind,
};

// ============================================================================
// symbol_get - Get single symbol details
// ============================================================================

/**
 * Parameters for symbolGet query
 */
export const SymbolGetParamsSchema = z.object({
  /** Entity ID or devac:// URI of the symbol */
  entity: z.string().describe("Entity ID (repo:pkg:kind:hash) or devac:// URI of the symbol"),
});

export type SymbolGetParams = z.infer<typeof SymbolGetParamsSchema>;

/**
 * Get full details of a specific symbol by entity ID
 *
 * @example
 * await symbolGet(ctx, { entity: "myrepo:packages/api:function:abc123" })
 */
export async function symbolGet(
  ctx: QueryContext,
  params: SymbolGetParams
): Promise<QueryResult<SymbolDetail | null>> {
  const startTime = Date.now();
  const { entity } = params;

  // TODO: Handle devac:// URI parsing
  const entityId = entity;

  const sql = `
    SELECT * FROM nodes
    WHERE entity_id = '${escapeSqlString(entityId)}'
    LIMIT 1
  `;

  const result = await executeQuery<ParsedNode>(ctx, sql);

  if (result.rows.length === 0) {
    return formatEmpty(null, Date.now() - startTime, [`Symbol not found: ${entityId}`]);
  }

  const node = result.rows[0]!;
  const formatted = formatNodes([node], "details", 1, 1, Date.now() - startTime);

  return {
    data: (formatted.data as SymbolDetail[])[0] ?? null,
    total: 1,
    hasMore: false,
    queryTimeMs: Date.now() - startTime,
    warnings: result.warnings,
  };
}

/**
 * Symbol get definition for adapter generation
 */
export const symbolGetDef = {
  name: "symbol_get",
  description:
    "Get full details of a specific symbol by its entity ID. " +
    "Returns complete information including documentation, type signature, and location.",
  params: SymbolGetParamsSchema,
  execute: symbolGet,
};

// ============================================================================
// symbol_file - Get all symbols in a file
// ============================================================================

/**
 * Parameters for symbolFile query
 */
export const SymbolFileParamsSchema = z.object({
  /** File path or devac:// URI */
  file: z.string().describe("File path (e.g., 'src/index.ts') or devac:// URI"),

  /** Filter by entity kind */
  kind: NodeKindSchema.optional().describe(`Filter by entity kind: ${NODE_KINDS.join(", ")}`),

  /** Only show exported symbols */
  exported: z.boolean().optional().describe("Only show exported symbols"),

  /** Output level: counts, summary, or details */
  level: OutputLevelSchema.default("summary").describe(
    "Output level: counts (totals only), summary (key fields), details (full records)"
  ),

  /** Maximum number of results */
  limit: z.number().min(1).max(1000).default(100).describe("Maximum results to return"),
});

export type SymbolFileParams = z.infer<typeof SymbolFileParamsSchema>;

/**
 * Get all symbols defined in a file
 *
 * @example
 * // Get all symbols in a file
 * await symbolFile(ctx, { file: "src/components/Button.tsx" })
 *
 * // Get only exported functions
 * await symbolFile(ctx, { file: "src/utils.ts", kind: "function", exported: true })
 */
export async function symbolFile(
  ctx: QueryContext,
  params: SymbolFileParams
): Promise<QueryResult<CountsResult | SymbolSummary[] | SymbolDetail[]>> {
  const startTime = Date.now();
  const { file, kind, exported, level, limit } = params;

  // TODO: Handle devac:// URI parsing
  const filePath = file;

  // Build WHERE conditions
  const conditions: string[] = [`file_path = '${escapeSqlString(filePath)}'`];

  if (kind) {
    conditions.push(`kind = '${escapeSqlString(kind)}'`);
  }

  if (exported === true) {
    conditions.push("is_exported = true");
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // For counts level
  if (level === "counts") {
    const countSql = `SELECT COUNT(*) as count FROM nodes ${whereClause}`;
    const countResult = await executeCountQuery(ctx, countSql);

    const kindSql = `SELECT kind, COUNT(*) as count FROM nodes ${whereClause} GROUP BY kind`;
    const kindResult = await executeQuery<{ kind: string; count: number | bigint }>(ctx, kindSql);

    const byCategory: Record<string, number> = {};
    for (const row of kindResult.rows) {
      byCategory[row.kind] = typeof row.count === "bigint" ? Number(row.count) : row.count;
    }

    return {
      data: { total: countResult.count, byCategory },
      total: countResult.count,
      hasMore: false,
      queryTimeMs: Date.now() - startTime,
      warnings: countResult.warnings,
    };
  }

  // Get total count
  const countSql = `SELECT COUNT(*) as count FROM nodes ${whereClause}`;
  const countResult = await executeCountQuery(ctx, countSql);
  const total = countResult.count;

  // Get rows ordered by line number
  const dataSql = `
    SELECT * FROM nodes
    ${whereClause}
    ORDER BY start_line
    LIMIT ${limit}
  `;

  const result = await executeQuery<ParsedNode>(ctx, dataSql);

  return formatNodes(result.rows, level, total, limit, Date.now() - startTime, result.warnings);
}

/**
 * Symbol file definition for adapter generation
 */
export const symbolFileDef = {
  name: "symbol_file",
  description:
    "Get all symbols defined in a file. Useful for understanding file contents " +
    "and navigating to specific symbols. Returns symbols ordered by line number.",
  params: SymbolFileParamsSchema,
  execute: symbolFile,
};
