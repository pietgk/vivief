/**
 * Schema Query Functions
 *
 * Discover available data before querying. Essential for understanding
 * the code graph structure and available tables/columns.
 */

import { z } from "zod";
import { type QueryContext, executeQuery } from "./context.js";
import type { QueryResult } from "./types.js";

// ============================================================================
// schema_tables - Available tables and columns
// ============================================================================

/**
 * Parameters for schemaTables query
 */
export const SchemaTablesParamsSchema = z.object({
  /** Include column details */
  includeColumns: z
    .boolean()
    .default(true)
    .describe("Whether to include column details for each table"),
});

export type SchemaTablesParams = z.infer<typeof SchemaTablesParamsSchema>;

/**
 * Table schema information
 */
export interface TableSchema {
  name: string;
  rowCount?: number;
  columns?: ColumnSchema[];
}

/**
 * Column schema information
 */
export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
}

/**
 * Get available tables and columns in the code graph
 *
 * @example
 * const tables = await schemaTables(ctx, { includeColumns: true })
 */
export async function schemaTables(
  ctx: QueryContext,
  params: SchemaTablesParams
): Promise<QueryResult<TableSchema[]>> {
  const startTime = Date.now();
  const { includeColumns } = params;

  const tables: TableSchema[] = [];
  const warnings: string[] = [];

  // Define the standard tables and their schemas
  const standardTables = [
    {
      name: "nodes",
      columns: [
        { name: "entity_id", type: "VARCHAR", nullable: false },
        { name: "name", type: "VARCHAR", nullable: false },
        { name: "qualified_name", type: "VARCHAR", nullable: false },
        { name: "kind", type: "VARCHAR", nullable: false },
        { name: "file_path", type: "VARCHAR", nullable: false },
        { name: "start_line", type: "INTEGER", nullable: false },
        { name: "end_line", type: "INTEGER", nullable: false },
        { name: "start_column", type: "INTEGER", nullable: false },
        { name: "end_column", type: "INTEGER", nullable: false },
        { name: "is_exported", type: "BOOLEAN", nullable: false },
        { name: "is_default_export", type: "BOOLEAN", nullable: false },
        { name: "visibility", type: "VARCHAR", nullable: false },
        { name: "is_async", type: "BOOLEAN", nullable: false },
        { name: "is_generator", type: "BOOLEAN", nullable: false },
        { name: "is_static", type: "BOOLEAN", nullable: false },
        { name: "is_abstract", type: "BOOLEAN", nullable: false },
        { name: "type_signature", type: "VARCHAR", nullable: true },
        { name: "documentation", type: "VARCHAR", nullable: true },
        { name: "decorators", type: "VARCHAR[]", nullable: false },
        { name: "type_parameters", type: "VARCHAR[]", nullable: false },
        { name: "properties", type: "JSON", nullable: false },
        { name: "source_file_hash", type: "VARCHAR", nullable: false },
        { name: "branch", type: "VARCHAR", nullable: false },
        { name: "is_deleted", type: "BOOLEAN", nullable: false },
        { name: "updated_at", type: "VARCHAR", nullable: false },
      ],
    },
    {
      name: "edges",
      columns: [
        { name: "source_entity_id", type: "VARCHAR", nullable: false },
        { name: "target_entity_id", type: "VARCHAR", nullable: false },
        { name: "edge_type", type: "VARCHAR", nullable: false },
        { name: "source_file_path", type: "VARCHAR", nullable: false },
        { name: "source_line", type: "INTEGER", nullable: false },
        { name: "source_column", type: "INTEGER", nullable: false },
        { name: "properties", type: "JSON", nullable: false },
        { name: "source_file_hash", type: "VARCHAR", nullable: false },
        { name: "branch", type: "VARCHAR", nullable: false },
        { name: "is_deleted", type: "BOOLEAN", nullable: false },
        { name: "updated_at", type: "VARCHAR", nullable: false },
      ],
    },
    {
      name: "external_refs",
      columns: [
        { name: "source_entity_id", type: "VARCHAR", nullable: false },
        { name: "import_path", type: "VARCHAR", nullable: false },
        { name: "import_name", type: "VARCHAR", nullable: true },
        { name: "alias", type: "VARCHAR", nullable: true },
        { name: "is_type_only", type: "BOOLEAN", nullable: false },
        { name: "source_file_path", type: "VARCHAR", nullable: false },
        { name: "source_line", type: "INTEGER", nullable: false },
        { name: "source_file_hash", type: "VARCHAR", nullable: false },
        { name: "branch", type: "VARCHAR", nullable: false },
        { name: "is_deleted", type: "BOOLEAN", nullable: false },
        { name: "updated_at", type: "VARCHAR", nullable: false },
      ],
    },
    {
      name: "effects",
      columns: [
        { name: "effect_id", type: "VARCHAR", nullable: false },
        { name: "source_entity_id", type: "VARCHAR", nullable: false },
        { name: "effect_type", type: "VARCHAR", nullable: false },
        { name: "target_name", type: "VARCHAR", nullable: false },
        { name: "target_module", type: "VARCHAR", nullable: true },
        { name: "is_external", type: "BOOLEAN", nullable: false },
        { name: "is_async", type: "BOOLEAN", nullable: false },
        { name: "arguments", type: "JSON", nullable: true },
        { name: "source_file_path", type: "VARCHAR", nullable: false },
        { name: "source_line", type: "INTEGER", nullable: false },
        { name: "source_column", type: "INTEGER", nullable: false },
        { name: "source_file_hash", type: "VARCHAR", nullable: false },
        { name: "branch", type: "VARCHAR", nullable: false },
        { name: "is_deleted", type: "BOOLEAN", nullable: false },
        { name: "updated_at", type: "VARCHAR", nullable: false },
      ],
    },
  ];

  // Try to get row counts for each table
  for (const table of standardTables) {
    const tableInfo: TableSchema = { name: table.name };

    try {
      const countResult = await executeQuery<{ count: number | bigint }>(
        ctx,
        `SELECT COUNT(*) as count FROM ${table.name}`
      );
      if (countResult.rows.length > 0) {
        const count = countResult.rows[0]?.count;
        tableInfo.rowCount = typeof count === "bigint" ? Number(count) : (count ?? 0);
      }
      warnings.push(...(countResult.warnings ?? []));
    } catch {
      // Table may not exist in this context
      tableInfo.rowCount = 0;
    }

    if (includeColumns) {
      tableInfo.columns = table.columns;
    }

    tables.push(tableInfo);
  }

  return {
    data: tables,
    total: tables.length,
    hasMore: false,
    queryTimeMs: Date.now() - startTime,
    warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
  };
}

/**
 * Schema tables definition for adapter generation
 */
export const schemaTablesDef = {
  name: "schema_tables",
  description:
    "Get available tables and columns in the code graph database. " +
    "Useful for understanding the schema before writing SQL queries.",
  params: SchemaTablesParamsSchema,
  execute: schemaTables,
};

// ============================================================================
// schema_kinds - Entity kinds with counts
// ============================================================================

/**
 * Parameters for schemaKinds query (no parameters needed)
 */
export const SchemaKindsParamsSchema = z.object({});

export type SchemaKindsParams = z.infer<typeof SchemaKindsParamsSchema>;

/**
 * Kind count information
 */
export interface KindCount {
  kind: string;
  count: number;
  exported: number;
}

/**
 * Get entity kinds with counts
 *
 * @example
 * const kinds = await schemaKinds(ctx, {})
 * // Returns: [{ kind: "function", count: 500, exported: 200 }, ...]
 */
export async function schemaKinds(
  ctx: QueryContext,
  _params: SchemaKindsParams
): Promise<QueryResult<KindCount[]>> {
  const startTime = Date.now();

  const sql = `
    SELECT
      kind,
      COUNT(*) as count,
      SUM(CASE WHEN is_exported THEN 1 ELSE 0 END) as exported
    FROM nodes
    GROUP BY kind
    ORDER BY count DESC
  `;

  try {
    const result = await executeQuery<{
      kind: string;
      count: number | bigint;
      exported: number | bigint;
    }>(ctx, sql);

    const kinds: KindCount[] = result.rows.map((row) => ({
      kind: row.kind,
      count: typeof row.count === "bigint" ? Number(row.count) : row.count,
      exported: typeof row.exported === "bigint" ? Number(row.exported) : row.exported,
    }));

    return {
      data: kinds,
      total: kinds.length,
      hasMore: false,
      queryTimeMs: Date.now() - startTime,
      warnings: result.warnings,
    };
  } catch {
    return {
      data: [],
      total: 0,
      hasMore: false,
      queryTimeMs: Date.now() - startTime,
      warnings: ["No nodes table available. Run 'devac sync' to analyze the codebase."],
    };
  }
}

/**
 * Schema kinds definition for adapter generation
 */
export const schemaKindsDef = {
  name: "schema_kinds",
  description:
    "Get entity kinds (function, class, etc.) with counts. " +
    "Useful for understanding the composition of the codebase.",
  params: SchemaKindsParamsSchema,
  execute: schemaKinds,
};

// ============================================================================
// schema_edges - Relationship types with counts
// ============================================================================

/**
 * Parameters for schemaEdges query (no parameters needed)
 */
export const SchemaEdgesParamsSchema = z.object({});

export type SchemaEdgesParams = z.infer<typeof SchemaEdgesParamsSchema>;

/**
 * Edge type count information
 */
export interface EdgeTypeCount {
  edgeType: string;
  count: number;
}

/**
 * Get relationship types with counts
 *
 * @example
 * const edges = await schemaEdges(ctx, {})
 * // Returns: [{ edgeType: "CALLS", count: 1000 }, ...]
 */
export async function schemaEdges(
  ctx: QueryContext,
  _params: SchemaEdgesParams
): Promise<QueryResult<EdgeTypeCount[]>> {
  const startTime = Date.now();

  const sql = `
    SELECT
      edge_type,
      COUNT(*) as count
    FROM edges
    GROUP BY edge_type
    ORDER BY count DESC
  `;

  try {
    const result = await executeQuery<{
      edge_type: string;
      count: number | bigint;
    }>(ctx, sql);

    const edges: EdgeTypeCount[] = result.rows.map((row) => ({
      edgeType: row.edge_type,
      count: typeof row.count === "bigint" ? Number(row.count) : row.count,
    }));

    return {
      data: edges,
      total: edges.length,
      hasMore: false,
      queryTimeMs: Date.now() - startTime,
      warnings: result.warnings,
    };
  } catch {
    return {
      data: [],
      total: 0,
      hasMore: false,
      queryTimeMs: Date.now() - startTime,
      warnings: ["No edges table available. Run 'devac sync' to analyze the codebase."],
    };
  }
}

/**
 * Schema edges definition for adapter generation
 */
export const schemaEdgesDef = {
  name: "schema_edges",
  description:
    "Get relationship types (CALLS, IMPORTS, etc.) with counts. " +
    "Useful for understanding how code elements relate to each other.",
  params: SchemaEdgesParamsSchema,
  execute: schemaEdges,
};

// ============================================================================
// schema_stats - Overall statistics
// ============================================================================

/**
 * Parameters for schemaStats query (no parameters needed)
 */
export const SchemaStatsParamsSchema = z.object({});

export type SchemaStatsParams = z.infer<typeof SchemaStatsParamsSchema>;

/**
 * Overall code graph statistics
 */
export interface CodeGraphStats {
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
  packageCount: number;
  topKinds: KindCount[];
  topEdgeTypes: EdgeTypeCount[];
}

/**
 * Get overall code graph statistics
 *
 * @example
 * const stats = await schemaStats(ctx, {})
 */
export async function schemaStats(
  ctx: QueryContext,
  _params: SchemaStatsParams
): Promise<QueryResult<CodeGraphStats>> {
  const startTime = Date.now();
  const warnings: string[] = [];

  let nodeCount = 0;
  let edgeCount = 0;
  let fileCount = 0;
  const topKinds: KindCount[] = [];
  const topEdgeTypes: EdgeTypeCount[] = [];

  // Get node count
  try {
    const nodeResult = await executeQuery<{ count: number | bigint }>(
      ctx,
      "SELECT COUNT(*) as count FROM nodes"
    );
    if (nodeResult.rows[0]) {
      nodeCount =
        typeof nodeResult.rows[0].count === "bigint"
          ? Number(nodeResult.rows[0].count)
          : nodeResult.rows[0].count;
    }
    warnings.push(...(nodeResult.warnings ?? []));
  } catch {
    // Ignore
  }

  // Get edge count
  try {
    const edgeResult = await executeQuery<{ count: number | bigint }>(
      ctx,
      "SELECT COUNT(*) as count FROM edges"
    );
    if (edgeResult.rows[0]) {
      edgeCount =
        typeof edgeResult.rows[0].count === "bigint"
          ? Number(edgeResult.rows[0].count)
          : edgeResult.rows[0].count;
    }
  } catch {
    // Ignore
  }

  // Get unique file count
  try {
    const fileResult = await executeQuery<{ count: number | bigint }>(
      ctx,
      "SELECT COUNT(DISTINCT file_path) as count FROM nodes"
    );
    if (fileResult.rows[0]) {
      fileCount =
        typeof fileResult.rows[0].count === "bigint"
          ? Number(fileResult.rows[0].count)
          : fileResult.rows[0].count;
    }
  } catch {
    // Ignore
  }

  // Get top kinds
  try {
    const kindsResult = await schemaKinds(ctx, {});
    topKinds.push(...kindsResult.data.slice(0, 5));
  } catch {
    // Ignore
  }

  // Get top edge types
  try {
    const edgesResult = await schemaEdges(ctx, {});
    topEdgeTypes.push(...edgesResult.data.slice(0, 5));
  } catch {
    // Ignore
  }

  return {
    data: {
      nodeCount,
      edgeCount,
      fileCount,
      packageCount: ctx.packages.length,
      topKinds,
      topEdgeTypes,
    },
    total: 1,
    hasMore: false,
    queryTimeMs: Date.now() - startTime,
    warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
  };
}

/**
 * Schema stats definition for adapter generation
 */
export const schemaStatsDef = {
  name: "schema_stats",
  description:
    "Get overall code graph statistics including node count, edge count, " +
    "file count, and top entity/relationship types.",
  params: SchemaStatsParamsSchema,
  execute: schemaStats,
};
