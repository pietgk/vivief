/**
 * Shared Query Formatters
 *
 * Utility functions for formatting query results at different output levels.
 * Used by both CLI and MCP to ensure consistent output structure.
 */

import type { ParsedEdge } from "../types/edges.js";
import type { ParsedNode } from "../types/nodes.js";
import type {
  CountsResult,
  EdgeDetail,
  EdgeSummary,
  QueryOutputLevel,
  QueryResult,
  SymbolDetail,
  SymbolSummary,
} from "./types.js";

// ============================================================================
// Path Enrichment Utilities
// ============================================================================

/**
 * Extract repo name from entity_id (format: repo:package:kind:hash)
 */
function extractRepoFromEntityId(entityId: string): string {
  const firstColon = entityId.indexOf(":");
  return firstColon > 0 ? entityId.substring(0, firstColon) : "";
}

/**
 * Create workspace-relative file path by prepending repo name
 */
function toWorkspacePath(entityId: string, filePath: string): string {
  const repo = extractRepoFromEntityId(entityId);
  return repo ? `${repo}/${filePath}` : filePath;
}

// ============================================================================
// Node/Symbol Formatters
// ============================================================================

/**
 * Convert raw node rows to summary format
 */
export function formatNodeSummary(node: ParsedNode): SymbolSummary {
  return {
    entityId: node.entity_id,
    name: node.name,
    kind: node.kind,
    file: toWorkspacePath(node.entity_id, node.file_path),
    line: node.start_line,
    exported: node.is_exported,
  };
}

/**
 * Convert raw node rows to detail format
 */
export function formatNodeDetail(node: ParsedNode): SymbolDetail {
  return {
    entityId: node.entity_id,
    name: node.name,
    qualifiedName: node.qualified_name,
    kind: node.kind,
    file: toWorkspacePath(node.entity_id, node.file_path),
    startLine: node.start_line,
    endLine: node.end_line,
    startColumn: node.start_column,
    endColumn: node.end_column,
    exported: node.is_exported,
    defaultExport: node.is_default_export,
    visibility: node.visibility,
    isAsync: node.is_async,
    isGenerator: node.is_generator,
    isStatic: node.is_static,
    isAbstract: node.is_abstract,
    typeSignature: node.type_signature,
    documentation: node.documentation,
    decorators: node.decorators ?? [],
    typeParameters: node.type_parameters ?? [],
  };
}

/**
 * Format nodes based on output level
 */
export function formatNodes(
  nodes: ParsedNode[],
  level: QueryOutputLevel,
  total: number,
  limit: number,
  queryTimeMs: number,
  warnings?: string[]
): QueryResult<CountsResult | SymbolSummary[] | SymbolDetail[]> {
  const hasMore = total > limit;

  switch (level) {
    case "counts": {
      const byCategory: Record<string, number> = {};
      for (const node of nodes) {
        byCategory[node.kind] = (byCategory[node.kind] ?? 0) + 1;
      }
      return {
        data: { total, byCategory },
        total,
        hasMore,
        queryTimeMs,
        warnings,
      };
    }

    case "summary":
      return {
        data: nodes.map(formatNodeSummary),
        total,
        hasMore,
        queryTimeMs,
        warnings,
      };

    case "details":
      return {
        data: nodes.map(formatNodeDetail),
        total,
        hasMore,
        queryTimeMs,
        warnings,
      };
  }
}

// ============================================================================
// Edge/Relationship Formatters
// ============================================================================

/**
 * Convert raw edge rows to summary format
 */
export function formatEdgeSummary(
  edge: ParsedEdge,
  sourceNode?: ParsedNode,
  targetNode?: ParsedNode
): EdgeSummary {
  return {
    sourceEntityId: edge.source_entity_id,
    targetEntityId: edge.target_entity_id,
    edgeType: edge.edge_type,
    sourceName: sourceNode?.name,
    targetName: targetNode?.name,
    sourceFile: toWorkspacePath(edge.source_entity_id, edge.source_file_path),
    sourceLine: edge.source_line,
  };
}

/**
 * Convert raw edge rows to detail format
 */
export function formatEdgeDetail(edge: ParsedEdge): EdgeDetail {
  return {
    sourceEntityId: edge.source_entity_id,
    targetEntityId: edge.target_entity_id,
    edgeType: edge.edge_type,
    sourceFilePath: toWorkspacePath(edge.source_entity_id, edge.source_file_path),
    sourceLine: edge.source_line,
    sourceColumn: edge.source_column,
    properties: edge.properties ?? {},
  };
}

/**
 * Format edges based on output level
 */
export function formatEdges(
  edges: ParsedEdge[],
  level: QueryOutputLevel,
  total: number,
  limit: number,
  queryTimeMs: number,
  nodeMap?: Map<string, ParsedNode>,
  warnings?: string[]
): QueryResult<CountsResult | EdgeSummary[] | EdgeDetail[]> {
  const hasMore = total > limit;

  switch (level) {
    case "counts": {
      const byCategory: Record<string, number> = {};
      for (const edge of edges) {
        byCategory[edge.edge_type] = (byCategory[edge.edge_type] ?? 0) + 1;
      }
      return {
        data: { total, byCategory },
        total,
        hasMore,
        queryTimeMs,
        warnings,
      };
    }

    case "summary":
      return {
        data: edges.map((edge) =>
          formatEdgeSummary(
            edge,
            nodeMap?.get(edge.source_entity_id),
            nodeMap?.get(edge.target_entity_id)
          )
        ),
        total,
        hasMore,
        queryTimeMs,
        warnings,
      };

    case "details":
      return {
        data: edges.map(formatEdgeDetail),
        total,
        hasMore,
        queryTimeMs,
        warnings,
      };
  }
}

// ============================================================================
// Generic Formatters
// ============================================================================

/**
 * Create a counts-only result
 */
export function formatCounts(
  total: number,
  byCategory?: Record<string, number>,
  queryTimeMs = 0,
  warnings?: string[]
): QueryResult<CountsResult> {
  return {
    data: { total, byCategory },
    total,
    hasMore: false,
    queryTimeMs,
    warnings,
  };
}

/**
 * Create an empty result with warnings
 */
export function formatEmpty<T>(
  defaultData: T,
  queryTimeMs = 0,
  warnings?: string[]
): QueryResult<T> {
  return {
    data: defaultData,
    total: 0,
    hasMore: false,
    queryTimeMs,
    warnings,
  };
}

// ============================================================================
// SQL Escaping Utilities
// ============================================================================

/**
 * Escape a string value for SQL (prevent SQL injection)
 */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Escape a LIKE pattern (escape %, _, and backslash)
 */
export function escapeSqlLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Convert a glob pattern (with * wildcards) to SQL LIKE pattern
 */
export function globToLike(pattern: string): string {
  // First escape SQL LIKE special characters
  const escaped = escapeSqlLike(pattern);
  // Then convert * to %
  return escaped.replace(/\*/g, "%");
}
