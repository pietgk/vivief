/**
 * Graph Query Functions
 *
 * Understand code relationships: dependencies, dependents, call graphs, imports.
 * Priority 1 queries - essential for understanding code connections.
 */

import { z } from "zod";
import type { ParsedEdge } from "../types/edges.js";
import type { ParsedNode } from "../types/nodes.js";
import { type QueryContext, executeCountQuery, executeQuery } from "./context.js";
import { escapeSqlString, formatCounts, formatEdges } from "./formatters.js";
import {
  type CountsResult,
  EDGE_TYPES,
  type EdgeDetail,
  type EdgeSummary,
  EdgeTypeSchema,
  OutputLevelSchema,
  type QueryResult,
} from "./types.js";

// ============================================================================
// graph_deps - Outgoing dependencies
// ============================================================================

/**
 * Parameters for graphDeps query
 */
export const GraphDepsParamsSchema = z.object({
  /** Entity ID or devac:// URI of the symbol */
  entity: z.string().describe("Entity ID (repo:pkg:kind:hash) or devac:// URI of the symbol"),

  /** Filter by edge type */
  edgeType: EdgeTypeSchema.optional().describe(
    `Filter by relationship type: ${EDGE_TYPES.join(", ")}`
  ),

  /** Traversal depth (1 = direct only) */
  depth: z
    .number()
    .min(1)
    .max(10)
    .default(1)
    .describe("Traversal depth: 1 = direct dependencies, >1 = transitive"),

  /** Output level: counts, summary, or details */
  level: OutputLevelSchema.default("summary").describe(
    "Output level: counts (totals only), summary (key fields), details (full records)"
  ),

  /** Maximum number of results */
  limit: z.number().min(1).max(1000).default(100).describe("Maximum results to return"),
});

export type GraphDepsParams = z.infer<typeof GraphDepsParamsSchema>;

/**
 * Get what a symbol depends on (outgoing edges)
 *
 * @example
 * // Get all dependencies of a function
 * await graphDeps(ctx, { entity: "repo:pkg:function:hash" })
 *
 * // Get only CALLS relationships
 * await graphDeps(ctx, { entity: "...", edgeType: "CALLS" })
 */
export async function graphDeps(
  ctx: QueryContext,
  params: GraphDepsParams
): Promise<QueryResult<CountsResult | EdgeSummary[] | EdgeDetail[]>> {
  const startTime = Date.now();
  const { entity, edgeType, depth, level, limit } = params;

  // Build WHERE conditions
  const conditions: string[] = [`source_entity_id = '${escapeSqlString(entity)}'`];

  if (edgeType) {
    conditions.push(`edge_type = '${escapeSqlString(edgeType)}'`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // For depth > 1, we need a recursive CTE
  if (depth > 1) {
    return graphDepsRecursive(ctx, params, startTime);
  }

  // For counts level
  if (level === "counts") {
    const countSql = `SELECT COUNT(*) as count FROM edges ${whereClause}`;
    const countResult = await executeCountQuery(ctx, countSql);

    const typeSql = `SELECT edge_type, COUNT(*) as count FROM edges ${whereClause} GROUP BY edge_type`;
    const typeResult = await executeQuery<{ edge_type: string; count: number | bigint }>(
      ctx,
      typeSql
    );

    const byCategory: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byCategory[row.edge_type] = typeof row.count === "bigint" ? Number(row.count) : row.count;
    }

    return formatCounts(
      countResult.count,
      byCategory,
      Date.now() - startTime,
      countResult.warnings
    );
  }

  // Get total count
  const countSql = `SELECT COUNT(*) as count FROM edges ${whereClause}`;
  const countResult = await executeCountQuery(ctx, countSql);
  const total = countResult.count;

  // Get edges
  const edgeSql = `SELECT * FROM edges ${whereClause} LIMIT ${limit}`;
  const edgeResult = await executeQuery<ParsedEdge>(ctx, edgeSql);

  // For summary level, get node names
  let nodeMap: Map<string, ParsedNode> | undefined;
  if (level === "summary" && edgeResult.rows.length > 0) {
    const targetIds = edgeResult.rows.map((e) => `'${escapeSqlString(e.target_entity_id)}'`);
    const nodesSql = `SELECT * FROM nodes WHERE entity_id IN (${targetIds.join(", ")})`;
    const nodesResult = await executeQuery<ParsedNode>(ctx, nodesSql);
    nodeMap = new Map(nodesResult.rows.map((n) => [n.entity_id, n]));
  }

  return formatEdges(
    edgeResult.rows,
    level,
    total,
    limit,
    Date.now() - startTime,
    nodeMap,
    edgeResult.warnings
  );
}

/**
 * Recursive depth traversal for dependencies
 */
async function graphDepsRecursive(
  ctx: QueryContext,
  params: GraphDepsParams,
  startTime: number
): Promise<QueryResult<CountsResult | EdgeSummary[] | EdgeDetail[]>> {
  const { entity, edgeType, depth, level, limit } = params;

  const edgeTypeFilter = edgeType ? `AND e.edge_type = '${escapeSqlString(edgeType)}'` : "";

  const sql = `
    WITH RECURSIVE dep_chain AS (
      -- Base case: direct dependencies
      SELECT
        e.source_entity_id,
        e.target_entity_id,
        e.edge_type,
        e.source_file_path,
        e.source_line,
        e.source_column,
        e.properties,
        1 as depth,
        ARRAY[e.target_entity_id] as path
      FROM edges e
      WHERE e.source_entity_id = '${escapeSqlString(entity)}'
      ${edgeTypeFilter}

      UNION ALL

      -- Recursive case: dependencies of dependencies
      SELECT
        e.source_entity_id,
        e.target_entity_id,
        e.edge_type,
        e.source_file_path,
        e.source_line,
        e.source_column,
        e.properties,
        dc.depth + 1,
        array_append(dc.path, e.target_entity_id)
      FROM edges e
      JOIN dep_chain dc ON e.source_entity_id = dc.target_entity_id
      WHERE dc.depth < ${depth}
      ${edgeTypeFilter}
      AND NOT array_contains(dc.path, e.target_entity_id)
    )
    SELECT DISTINCT
      source_entity_id,
      target_entity_id,
      edge_type,
      source_file_path,
      source_line,
      source_column,
      properties
    FROM dep_chain
    ORDER BY depth
    LIMIT ${limit}
  `;

  const result = await executeQuery<ParsedEdge>(ctx, sql);

  // For counts
  if (level === "counts") {
    const byCategory: Record<string, number> = {};
    for (const edge of result.rows) {
      byCategory[edge.edge_type] = (byCategory[edge.edge_type] ?? 0) + 1;
    }
    return formatCounts(result.rowCount, byCategory, Date.now() - startTime, result.warnings);
  }

  // For summary, get node names
  let nodeMap: Map<string, ParsedNode> | undefined;
  if (level === "summary" && result.rows.length > 0) {
    const entityIds = new Set<string>();
    for (const e of result.rows) {
      entityIds.add(e.source_entity_id);
      entityIds.add(e.target_entity_id);
    }
    const nodesSql = `SELECT * FROM nodes WHERE entity_id IN (${[...entityIds].map((id) => `'${escapeSqlString(id)}'`).join(", ")})`;
    const nodesResult = await executeQuery<ParsedNode>(ctx, nodesSql);
    nodeMap = new Map(nodesResult.rows.map((n) => [n.entity_id, n]));
  }

  return formatEdges(
    result.rows,
    level,
    result.rowCount,
    limit,
    Date.now() - startTime,
    nodeMap,
    result.warnings
  );
}

/**
 * Graph deps definition for adapter generation
 */
export const graphDepsDef = {
  name: "graph_deps",
  description:
    "Get what a symbol depends on (outgoing edges). Use this to understand what a function calls, " +
    "what a class extends, or what a module imports. Set depth > 1 for transitive dependencies.",
  params: GraphDepsParamsSchema,
  execute: graphDeps,
};

// ============================================================================
// graph_dependents - Incoming dependencies (reverse)
// ============================================================================

/**
 * Parameters for graphDependents query
 */
export const GraphDependentsParamsSchema = z.object({
  /** Entity ID or devac:// URI of the symbol */
  entity: z.string().describe("Entity ID (repo:pkg:kind:hash) or devac:// URI of the symbol"),

  /** Filter by edge type */
  edgeType: EdgeTypeSchema.optional().describe(
    `Filter by relationship type: ${EDGE_TYPES.join(", ")}`
  ),

  /** Traversal depth (1 = direct only) */
  depth: z
    .number()
    .min(1)
    .max(10)
    .default(1)
    .describe("Traversal depth: 1 = direct dependents, >1 = transitive"),

  /** Output level: counts, summary, or details */
  level: OutputLevelSchema.default("summary").describe(
    "Output level: counts (totals only), summary (key fields), details (full records)"
  ),

  /** Maximum number of results */
  limit: z.number().min(1).max(1000).default(100).describe("Maximum results to return"),
});

export type GraphDependentsParams = z.infer<typeof GraphDependentsParamsSchema>;

/**
 * Get what depends on a symbol (incoming edges)
 *
 * @example
 * // Get all callers of a function
 * await graphDependents(ctx, { entity: "repo:pkg:function:hash", edgeType: "CALLS" })
 */
export async function graphDependents(
  ctx: QueryContext,
  params: GraphDependentsParams
): Promise<QueryResult<CountsResult | EdgeSummary[] | EdgeDetail[]>> {
  const startTime = Date.now();
  const { entity, edgeType, depth, level, limit } = params;

  const conditions: string[] = [`target_entity_id = '${escapeSqlString(entity)}'`];

  if (edgeType) {
    conditions.push(`edge_type = '${escapeSqlString(edgeType)}'`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // For depth > 1, use recursive CTE
  if (depth > 1) {
    return graphDependentsRecursive(ctx, params, startTime);
  }

  // For counts level
  if (level === "counts") {
    const countSql = `SELECT COUNT(*) as count FROM edges ${whereClause}`;
    const countResult = await executeCountQuery(ctx, countSql);

    const typeSql = `SELECT edge_type, COUNT(*) as count FROM edges ${whereClause} GROUP BY edge_type`;
    const typeResult = await executeQuery<{ edge_type: string; count: number | bigint }>(
      ctx,
      typeSql
    );

    const byCategory: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byCategory[row.edge_type] = typeof row.count === "bigint" ? Number(row.count) : row.count;
    }

    return formatCounts(
      countResult.count,
      byCategory,
      Date.now() - startTime,
      countResult.warnings
    );
  }

  // Get total count
  const countSql = `SELECT COUNT(*) as count FROM edges ${whereClause}`;
  const countResult = await executeCountQuery(ctx, countSql);
  const total = countResult.count;

  // Get edges
  const edgeSql = `SELECT * FROM edges ${whereClause} LIMIT ${limit}`;
  const edgeResult = await executeQuery<ParsedEdge>(ctx, edgeSql);

  // For summary level, get node names
  let nodeMap: Map<string, ParsedNode> | undefined;
  if (level === "summary" && edgeResult.rows.length > 0) {
    const sourceIds = edgeResult.rows.map((e) => `'${escapeSqlString(e.source_entity_id)}'`);
    const nodesSql = `SELECT * FROM nodes WHERE entity_id IN (${sourceIds.join(", ")})`;
    const nodesResult = await executeQuery<ParsedNode>(ctx, nodesSql);
    nodeMap = new Map(nodesResult.rows.map((n) => [n.entity_id, n]));
  }

  return formatEdges(
    edgeResult.rows,
    level,
    total,
    limit,
    Date.now() - startTime,
    nodeMap,
    edgeResult.warnings
  );
}

/**
 * Recursive depth traversal for dependents
 */
async function graphDependentsRecursive(
  ctx: QueryContext,
  params: GraphDependentsParams,
  startTime: number
): Promise<QueryResult<CountsResult | EdgeSummary[] | EdgeDetail[]>> {
  const { entity, edgeType, depth, level, limit } = params;

  const edgeTypeFilter = edgeType ? `AND e.edge_type = '${escapeSqlString(edgeType)}'` : "";

  const sql = `
    WITH RECURSIVE dependent_chain AS (
      -- Base case: direct dependents
      SELECT
        e.source_entity_id,
        e.target_entity_id,
        e.edge_type,
        e.source_file_path,
        e.source_line,
        e.source_column,
        e.properties,
        1 as depth,
        ARRAY[e.source_entity_id] as path
      FROM edges e
      WHERE e.target_entity_id = '${escapeSqlString(entity)}'
      ${edgeTypeFilter}

      UNION ALL

      -- Recursive case: dependents of dependents
      SELECT
        e.source_entity_id,
        e.target_entity_id,
        e.edge_type,
        e.source_file_path,
        e.source_line,
        e.source_column,
        e.properties,
        dc.depth + 1,
        array_append(dc.path, e.source_entity_id)
      FROM edges e
      JOIN dependent_chain dc ON e.target_entity_id = dc.source_entity_id
      WHERE dc.depth < ${depth}
      ${edgeTypeFilter}
      AND NOT array_contains(dc.path, e.source_entity_id)
    )
    SELECT DISTINCT
      source_entity_id,
      target_entity_id,
      edge_type,
      source_file_path,
      source_line,
      source_column,
      properties
    FROM dependent_chain
    ORDER BY depth
    LIMIT ${limit}
  `;

  const result = await executeQuery<ParsedEdge>(ctx, sql);

  // For counts
  if (level === "counts") {
    const byCategory: Record<string, number> = {};
    for (const edge of result.rows) {
      byCategory[edge.edge_type] = (byCategory[edge.edge_type] ?? 0) + 1;
    }
    return formatCounts(result.rowCount, byCategory, Date.now() - startTime, result.warnings);
  }

  // For summary, get node names
  let nodeMap: Map<string, ParsedNode> | undefined;
  if (level === "summary" && result.rows.length > 0) {
    const entityIds = new Set<string>();
    for (const e of result.rows) {
      entityIds.add(e.source_entity_id);
      entityIds.add(e.target_entity_id);
    }
    const nodesSql = `SELECT * FROM nodes WHERE entity_id IN (${[...entityIds].map((id) => `'${escapeSqlString(id)}'`).join(", ")})`;
    const nodesResult = await executeQuery<ParsedNode>(ctx, nodesSql);
    nodeMap = new Map(nodesResult.rows.map((n) => [n.entity_id, n]));
  }

  return formatEdges(
    result.rows,
    level,
    result.rowCount,
    limit,
    Date.now() - startTime,
    nodeMap,
    result.warnings
  );
}

/**
 * Graph dependents definition for adapter generation
 */
export const graphDependentsDef = {
  name: "graph_dependents",
  description:
    "Get what depends on a symbol (incoming edges). Use this for impact analysis - " +
    "what will break if I change this? Set depth > 1 for transitive dependents.",
  params: GraphDependentsParamsSchema,
  execute: graphDependents,
};

// ============================================================================
// graph_calls - Call graph (callers/callees)
// ============================================================================

/**
 * Parameters for graphCalls query
 */
export const GraphCallsParamsSchema = z.object({
  /** Entity ID or devac:// URI of the function */
  entity: z.string().describe("Entity ID (repo:pkg:function:hash) or devac:// URI of the function"),

  /** Direction of traversal */
  direction: z
    .enum(["callers", "callees", "both"])
    .default("both")
    .describe("Direction: callers (who calls this), callees (what this calls), or both"),

  /** Traversal depth */
  depth: z.number().min(1).max(10).default(3).describe("Maximum traversal depth for call chain"),

  /** Output level: counts, summary, or details */
  level: OutputLevelSchema.default("summary").describe(
    "Output level: counts (totals only), summary (key fields), details (full records)"
  ),

  /** Maximum number of results per direction */
  limit: z.number().min(1).max(500).default(100).describe("Maximum results per direction"),
});

export type GraphCallsParams = z.infer<typeof GraphCallsParamsSchema>;

/**
 * Call graph result structure
 */
export interface CallGraphResult {
  callers?: EdgeSummary[] | EdgeDetail[];
  callees?: EdgeSummary[] | EdgeDetail[];
  callerCount?: number;
  calleeCount?: number;
}

/**
 * Get call graph for a function
 *
 * @example
 * // Get all callers of a function
 * await graphCalls(ctx, { entity: "...", direction: "callers" })
 *
 * // Get full call graph (both directions)
 * await graphCalls(ctx, { entity: "...", direction: "both", depth: 5 })
 */
export async function graphCalls(
  ctx: QueryContext,
  params: GraphCallsParams
): Promise<QueryResult<CountsResult | CallGraphResult>> {
  const startTime = Date.now();
  const { entity, direction, depth, level, limit } = params;

  const result: CallGraphResult = {};
  const warnings: string[] = [];

  // Get callers
  if (direction === "callers" || direction === "both") {
    const callersResult = await graphDependents(ctx, {
      entity,
      edgeType: "CALLS",
      depth,
      level,
      limit,
    });

    if (level === "counts") {
      result.callerCount = callersResult.total;
    } else {
      result.callers = callersResult.data as EdgeSummary[] | EdgeDetail[];
      result.callerCount = callersResult.total;
    }

    if (callersResult.warnings) {
      warnings.push(...callersResult.warnings);
    }
  }

  // Get callees
  if (direction === "callees" || direction === "both") {
    const calleesResult = await graphDeps(ctx, {
      entity,
      edgeType: "CALLS",
      depth,
      level,
      limit,
    });

    if (level === "counts") {
      result.calleeCount = calleesResult.total;
    } else {
      result.callees = calleesResult.data as EdgeSummary[] | EdgeDetail[];
      result.calleeCount = calleesResult.total;
    }

    if (calleesResult.warnings) {
      warnings.push(...calleesResult.warnings);
    }
  }

  // For counts level, return a simplified result
  if (level === "counts") {
    const total = (result.callerCount ?? 0) + (result.calleeCount ?? 0);
    return {
      data: {
        total,
        byCategory: {
          callers: result.callerCount ?? 0,
          callees: result.calleeCount ?? 0,
        },
      },
      total,
      hasMore: false,
      queryTimeMs: Date.now() - startTime,
      warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
    };
  }

  const total = (result.callerCount ?? 0) + (result.calleeCount ?? 0);
  return {
    data: result,
    total,
    hasMore: total > limit * 2,
    queryTimeMs: Date.now() - startTime,
    warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
  };
}

/**
 * Graph calls definition for adapter generation
 */
export const graphCallsDef = {
  name: "graph_calls",
  description:
    "Get the call graph for a function. Returns callers (who calls this function) " +
    "and/or callees (what this function calls). Essential for understanding code flow.",
  params: GraphCallsParamsSchema,
  execute: graphCalls,
};

// ============================================================================
// graph_imports - Import/export relationships
// ============================================================================

/**
 * Parameters for graphImports query
 */
export const GraphImportsParamsSchema = z.object({
  /** File path or module to query */
  file: z.string().describe("File path (e.g., 'src/index.ts') to query imports for"),

  /** Direction: imports (what this file imports) or exports (what this file exports) */
  direction: z
    .enum(["imports", "exports", "both"])
    .default("imports")
    .describe("Direction: imports (what this imports), exports (what this exports), or both"),

  /** Output level: counts, summary, or details */
  level: OutputLevelSchema.default("summary").describe(
    "Output level: counts (totals only), summary (key fields), details (full records)"
  ),

  /** Maximum number of results */
  limit: z.number().min(1).max(500).default(100).describe("Maximum results to return"),
});

export type GraphImportsParams = z.infer<typeof GraphImportsParamsSchema>;

/**
 * Import/export result structure
 */
export interface ImportsResult {
  imports?: EdgeSummary[] | EdgeDetail[];
  exports?: EdgeSummary[] | EdgeDetail[];
  importCount?: number;
  exportCount?: number;
}

/**
 * Get import/export relationships for a file
 *
 * @example
 * // Get what a file imports
 * await graphImports(ctx, { file: "src/index.ts", direction: "imports" })
 */
export async function graphImports(
  ctx: QueryContext,
  params: GraphImportsParams
): Promise<QueryResult<CountsResult | ImportsResult>> {
  const startTime = Date.now();
  const { file, direction, level, limit } = params;

  const result: ImportsResult = {};
  const warnings: string[] = [];

  // Get imports (edges where source_file_path = file and edge_type in (IMPORTS, RE_EXPORTS))
  if (direction === "imports" || direction === "both") {
    const importSql = `
      SELECT * FROM edges
      WHERE source_file_path = '${escapeSqlString(file)}'
      AND edge_type IN ('IMPORTS', 'RE_EXPORTS')
      LIMIT ${limit}
    `;

    const importResult = await executeQuery<ParsedEdge>(ctx, importSql);
    warnings.push(...(importResult.warnings ?? []));

    if (level === "counts") {
      result.importCount = importResult.rowCount;
    } else {
      // Get node names for summary
      let nodeMap: Map<string, ParsedNode> | undefined;
      if (level === "summary" && importResult.rows.length > 0) {
        const entityIds = new Set<string>();
        for (const e of importResult.rows) {
          entityIds.add(e.source_entity_id);
          entityIds.add(e.target_entity_id);
        }
        const nodesSql = `SELECT * FROM nodes WHERE entity_id IN (${[...entityIds].map((id) => `'${escapeSqlString(id)}'`).join(", ")})`;
        const nodesResult = await executeQuery<ParsedNode>(ctx, nodesSql);
        nodeMap = new Map(nodesResult.rows.map((n) => [n.entity_id, n]));
      }

      const formatted = formatEdges(
        importResult.rows,
        level,
        importResult.rowCount,
        limit,
        0,
        nodeMap
      );
      result.imports = formatted.data as EdgeSummary[] | EdgeDetail[];
      result.importCount = importResult.rowCount;
    }
  }

  // Get exports (edges where source_file_path = file and edge_type = EXPORTS)
  if (direction === "exports" || direction === "both") {
    const exportSql = `
      SELECT * FROM edges
      WHERE source_file_path = '${escapeSqlString(file)}'
      AND edge_type = 'EXPORTS'
      LIMIT ${limit}
    `;

    const exportResult = await executeQuery<ParsedEdge>(ctx, exportSql);
    warnings.push(...(exportResult.warnings ?? []));

    if (level === "counts") {
      result.exportCount = exportResult.rowCount;
    } else {
      // Get node names for summary
      let nodeMap: Map<string, ParsedNode> | undefined;
      if (level === "summary" && exportResult.rows.length > 0) {
        const entityIds = new Set<string>();
        for (const e of exportResult.rows) {
          entityIds.add(e.source_entity_id);
          entityIds.add(e.target_entity_id);
        }
        const nodesSql = `SELECT * FROM nodes WHERE entity_id IN (${[...entityIds].map((id) => `'${escapeSqlString(id)}'`).join(", ")})`;
        const nodesResult = await executeQuery<ParsedNode>(ctx, nodesSql);
        nodeMap = new Map(nodesResult.rows.map((n) => [n.entity_id, n]));
      }

      const formatted = formatEdges(
        exportResult.rows,
        level,
        exportResult.rowCount,
        limit,
        0,
        nodeMap
      );
      result.exports = formatted.data as EdgeSummary[] | EdgeDetail[];
      result.exportCount = exportResult.rowCount;
    }
  }

  // For counts level
  if (level === "counts") {
    const total = (result.importCount ?? 0) + (result.exportCount ?? 0);
    return {
      data: {
        total,
        byCategory: {
          imports: result.importCount ?? 0,
          exports: result.exportCount ?? 0,
        },
      },
      total,
      hasMore: false,
      queryTimeMs: Date.now() - startTime,
      warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
    };
  }

  const total = (result.importCount ?? 0) + (result.exportCount ?? 0);
  return {
    data: result,
    total,
    hasMore: total > limit * 2,
    queryTimeMs: Date.now() - startTime,
    warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
  };
}

/**
 * Graph imports definition for adapter generation
 */
export const graphImportsDef = {
  name: "graph_imports",
  description:
    "Get import/export relationships for a file. Shows what a file imports from other modules " +
    "and what it exports. Useful for understanding module dependencies.",
  params: GraphImportsParamsSchema,
  execute: graphImports,
};
