/**
 * Shared Query Types
 *
 * Unified types for the query layer used by both CLI and MCP.
 * Single source of truth for parameter naming and result structures.
 */

import { z } from "zod";
import type { EdgeType } from "../types/edges.js";
import type { NodeKind } from "../types/nodes.js";

// ============================================================================
// Output Level System
// ============================================================================

/**
 * Output level for progressive disclosure:
 * - counts: Just totals (fastest, smallest)
 * - summary: Grouped aggregates with identifiers
 * - details: Full records with all fields
 */
export type QueryOutputLevel = "counts" | "summary" | "details";

export const OutputLevelSchema = z.enum(["counts", "summary", "details"]);

// ============================================================================
// Node Kind Constants
// ============================================================================

export const NODE_KINDS = [
  "function",
  "class",
  "method",
  "property",
  "variable",
  "constant",
  "interface",
  "type",
  "enum",
  "enum_member",
  "namespace",
  "module",
  "parameter",
  "decorator",
  "jsx_component",
  "html_element",
  "hook",
  "unknown",
] as const;

export const NodeKindSchema = z.enum(NODE_KINDS);

// ============================================================================
// Edge Type Constants
// ============================================================================

export const EDGE_TYPES = [
  "CONTAINS",
  "CALLS",
  "IMPORTS",
  "EXTENDS",
  "IMPLEMENTS",
  "RETURNS",
  "PARAMETER_OF",
  "TYPE_OF",
  "DECORATES",
  "OVERRIDES",
  "REFERENCES",
  "EXPORTS",
  "RE_EXPORTS",
  "INSTANTIATES",
  "USES_TYPE",
  "ACCESSES",
  "THROWS",
  "AWAITS",
  "YIELDS",
  "RENDERS",
  "PASSES_PROPS",
] as const;

export const EdgeTypeSchema = z.enum(EDGE_TYPES);

// ============================================================================
// Unified Query Result
// ============================================================================

/**
 * Standard query result structure used by all query functions.
 * Consistent across CLI and MCP.
 */
export interface QueryResult<T = unknown> {
  /** Result data - type depends on output level and query */
  data: T;

  /** Total count of items (may be larger than items returned) */
  total: number;

  /** Whether more results exist beyond limit */
  hasMore: boolean;

  /** Query execution time in milliseconds */
  queryTimeMs: number;

  /** Warnings (e.g., missing seeds, no packages) */
  warnings?: string[];
}

/**
 * Counts-level result structure
 */
export interface CountsResult {
  total: number;
  byCategory?: Record<string, number>;
}

/**
 * Summary-level item for symbols
 */
export interface SymbolSummary {
  entityId: string;
  name: string;
  kind: NodeKind;
  file: string;
  line: number;
  exported: boolean;
}

/**
 * Summary-level item for edges/relationships
 */
export interface EdgeSummary {
  sourceEntityId: string;
  targetEntityId: string;
  edgeType: EdgeType;
  sourceName?: string;
  targetName?: string;
  sourceFile: string;
  sourceLine: number;
}

/**
 * Detail-level symbol (full node record)
 */
export interface SymbolDetail {
  entityId: string;
  name: string;
  qualifiedName: string;
  kind: NodeKind;
  file: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  exported: boolean;
  defaultExport: boolean;
  visibility: string;
  isAsync: boolean;
  isGenerator: boolean;
  isStatic: boolean;
  isAbstract: boolean;
  typeSignature: string | null;
  documentation: string | null;
  decorators: string[];
  typeParameters: string[];
}

/**
 * Detail-level edge (full edge record)
 */
export interface EdgeDetail {
  sourceEntityId: string;
  targetEntityId: string;
  edgeType: EdgeType;
  sourceFilePath: string;
  sourceLine: number;
  sourceColumn: number;
  properties: Record<string, unknown>;
}

// ============================================================================
// Query Definition Helper
// ============================================================================

/**
 * Query definition structure for defining query functions with:
 * - name: Tool/command name
 * - description: Shared description for CLI help and MCP tool description
 * - params: Zod schema for parameter validation
 * - execute: The actual query implementation
 */
export interface QueryDefinition<TParams extends z.ZodType, TResult> {
  /** Query name (e.g., "symbol_find") */
  name: string;

  /** Description for CLI --help and MCP tool description */
  description: string;

  /** Zod schema for parameter validation and type inference */
  params: TParams;

  /** Execute the query */
  execute: (params: z.infer<TParams>) => Promise<QueryResult<TResult>>;
}

/**
 * Helper to create a query definition with proper typing
 */
export function defineQuery<TParams extends z.ZodType, TResult>(
  def: QueryDefinition<TParams, TResult>
): QueryDefinition<TParams, TResult> {
  return def;
}

// ============================================================================
// Readiness Metadata
// ============================================================================

/**
 * Readiness info explaining why results may be empty or incomplete
 */
export interface ReadinessInfo {
  /** Whether the query context is ready */
  ready: boolean;

  /** Human-readable explanation if not ready */
  reason?: string;

  /** Suggested action to fix */
  suggestion?: string;

  /** Number of packages available for query */
  packagesAvailable: number;

  /** Number of packages missing seeds */
  packagesMissingSeeds: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Query error with actionable information
 */
export class QueryError extends Error {
  constructor(
    message: string,
    public readonly code: QueryErrorCode,
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = "QueryError";
  }
}

export type QueryErrorCode =
  | "NO_PACKAGES"
  | "NO_SEEDS"
  | "INVALID_PARAMS"
  | "ENTITY_NOT_FOUND"
  | "SQL_ERROR"
  | "TIMEOUT"
  | "INTERNAL";
