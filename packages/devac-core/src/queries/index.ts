/**
 * Shared Query Layer
 *
 * Single source of truth for all DevAC query functions.
 * Used by both CLI and MCP to ensure consistent behavior.
 *
 * @example
 * import { symbolFind, createQueryContext } from "@pietgk/devac-core/queries";
 *
 * const ctx = createQueryContext({ pool, packages });
 * const result = await symbolFind(ctx, { name: "handleClick", kind: "function" });
 */

// ============================================================================
// Types
// ============================================================================

export {
  // Output levels
  type QueryOutputLevel,
  OutputLevelSchema,
  // Node/Edge kind constants
  NODE_KINDS,
  NodeKindSchema,
  EDGE_TYPES,
  EdgeTypeSchema,
  // Result types
  type QueryResult,
  type CountsResult,
  type SymbolSummary,
  type SymbolDetail,
  type EdgeSummary,
  type EdgeDetail,
  // Query definition helpers
  type QueryDefinition,
  defineQuery,
  // Readiness and errors
  type ReadinessInfo,
  QueryError,
  type QueryErrorCode,
} from "./types.js";

// ============================================================================
// Context
// ============================================================================

export {
  type QueryContext,
  type QueryContextOptions,
  createQueryContext,
  executeQuery,
  executeCountQuery,
  checkReadiness,
} from "./context.js";

// ============================================================================
// Formatters
// ============================================================================

export {
  formatNodes,
  formatEdges,
  formatCounts,
  formatEmpty,
  formatNodeSummary,
  formatNodeDetail,
  formatEdgeSummary,
  formatEdgeDetail,
  escapeSqlString,
  escapeSqlLike,
  globToLike,
} from "./formatters.js";

// ============================================================================
// Adapters (for generating MCP tools and CLI commands from definitions)
// ============================================================================

export {
  // MCP adapter
  zodToJsonSchema,
  toMcpTool,
  generateMcpTools,
  type McpInputSchema,
  type McpPropertySchema,
  type McpToolDefinition,
  // CLI adapter
  toCliCommand,
  generateCliCommands,
  getDefaultValue,
  type CliOption,
  type CliCommandDefinition,
} from "./adapters.js";

// ============================================================================
// Symbol Queries (Category 1 - Priority)
// ============================================================================

export {
  // Functions
  symbolFind,
  symbolGet,
  symbolFile,
  // Params schemas (for adapters)
  SymbolFindParamsSchema,
  SymbolGetParamsSchema,
  SymbolFileParamsSchema,
  // Param types
  type SymbolFindParams,
  type SymbolGetParams,
  type SymbolFileParams,
  // Definitions (for adapter generation)
  symbolFindDef,
  symbolGetDef,
  symbolFileDef,
} from "./symbol.js";

// ============================================================================
// Graph Queries (Category 2 - Priority)
// ============================================================================

export {
  // Functions
  graphDeps,
  graphDependents,
  graphCalls,
  graphImports,
  // Params schemas
  GraphDepsParamsSchema,
  GraphDependentsParamsSchema,
  GraphCallsParamsSchema,
  GraphImportsParamsSchema,
  // Param types
  type GraphDepsParams,
  type GraphDependentsParams,
  type GraphCallsParams,
  type GraphImportsParams,
  // Result types
  type CallGraphResult,
  type ImportsResult,
  // Definitions
  graphDepsDef,
  graphDependentsDef,
  graphCallsDef,
  graphImportsDef,
} from "./graph.js";

// ============================================================================
// Schema Queries (Category 3)
// ============================================================================

export {
  // Functions
  schemaTables,
  schemaKinds,
  schemaEdges,
  schemaStats,
  // Params schemas
  SchemaTablesParamsSchema,
  SchemaKindsParamsSchema,
  SchemaEdgesParamsSchema,
  SchemaStatsParamsSchema,
  // Param types
  type SchemaTablesParams,
  type SchemaKindsParams,
  type SchemaEdgesParams,
  type SchemaStatsParams,
  // Result types
  type TableSchema,
  type ColumnSchema,
  type KindCount,
  type EdgeTypeCount,
  type CodeGraphStats,
  // Definitions
  schemaTablesDef,
  schemaKindsDef,
  schemaEdgesDef,
  schemaStatsDef,
} from "./schema.js";

// ============================================================================
// All Query Definitions (for adapter generation)
// ============================================================================

import { graphCallsDef, graphDependentsDef, graphDepsDef, graphImportsDef } from "./graph.js";
import { schemaEdgesDef, schemaKindsDef, schemaStatsDef, schemaTablesDef } from "./schema.js";
import { symbolFileDef, symbolFindDef, symbolGetDef } from "./symbol.js";

/**
 * All query definitions for adapter generation
 */
export const allQueryDefinitions = [
  // Symbol queries
  symbolFindDef,
  symbolGetDef,
  symbolFileDef,

  // Graph queries
  graphDepsDef,
  graphDependentsDef,
  graphCallsDef,
  graphImportsDef,

  // Schema queries
  schemaTablesDef,
  schemaKindsDef,
  schemaEdgesDef,
  schemaStatsDef,
];
