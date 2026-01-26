/**
 * Shared Query Tools for MCP
 *
 * These tools use the shared query layer from devac-core, providing
 * a single source of truth for query behavior between CLI and MCP.
 *
 * New tools defined here should be added to the MCP_TOOLS array in index.ts.
 */

import {
  type GraphCallsParams,
  GraphCallsParamsSchema,
  type GraphDependentsParams,
  GraphDependentsParamsSchema,
  type GraphDepsParams,
  GraphDepsParamsSchema,
  type GraphImportsParams,
  GraphImportsParamsSchema,
  // Adapter utilities
  type McpToolDefinition,
  // Context and execution
  type QueryContext,
  SchemaEdgesParamsSchema,
  SchemaKindsParamsSchema,
  SchemaStatsParamsSchema,
  type SchemaTablesParams,
  SchemaTablesParamsSchema,
  type SymbolFileParams,
  SymbolFileParamsSchema,
  // Param types (for validation)
  type SymbolFindParams,
  // Param schemas (for generating tool definitions)
  SymbolFindParamsSchema,
  type SymbolGetParams,
  SymbolGetParamsSchema,
  createQueryContext,
  graphCalls,
  graphCallsDef,
  graphDependents,
  graphDependentsDef,
  graphDeps,
  graphDepsDef,
  graphImports,
  graphImportsDef,
  schemaEdges,
  schemaEdgesDef,
  schemaKinds,
  schemaKindsDef,
  schemaStats,
  schemaStatsDef,
  schemaTables,
  schemaTablesDef,
  symbolFile,
  symbolFileDef,
  // Query functions
  symbolFind,
  // Query definitions (for descriptions)
  symbolFindDef,
  symbolGet,
  symbolGetDef,
  zodToJsonSchema,
} from "@pietgk/devac-core";

import type { DuckDBPool } from "@pietgk/devac-core";

// ============================================================================
// Tool Definitions from Shared Query Layer
// ============================================================================

/**
 * Generate MCP tool definitions from the shared query layer.
 * These tools have consistent parameter naming with CLI commands.
 */
export const SHARED_QUERY_TOOLS: McpToolDefinition[] = [
  {
    name: symbolFindDef.name,
    description: symbolFindDef.description,
    inputSchema: zodToJsonSchema(SymbolFindParamsSchema),
  },
  {
    name: symbolGetDef.name,
    description: symbolGetDef.description,
    inputSchema: zodToJsonSchema(SymbolGetParamsSchema),
  },
  {
    name: symbolFileDef.name,
    description: symbolFileDef.description,
    inputSchema: zodToJsonSchema(SymbolFileParamsSchema),
  },
  {
    name: graphDepsDef.name,
    description: graphDepsDef.description,
    inputSchema: zodToJsonSchema(GraphDepsParamsSchema),
  },
  {
    name: graphDependentsDef.name,
    description: graphDependentsDef.description,
    inputSchema: zodToJsonSchema(GraphDependentsParamsSchema),
  },
  {
    name: graphCallsDef.name,
    description: graphCallsDef.description,
    inputSchema: zodToJsonSchema(GraphCallsParamsSchema),
  },
  {
    name: graphImportsDef.name,
    description: graphImportsDef.description,
    inputSchema: zodToJsonSchema(GraphImportsParamsSchema),
  },
  {
    name: schemaTablesDef.name,
    description: schemaTablesDef.description,
    inputSchema: zodToJsonSchema(SchemaTablesParamsSchema),
  },
  {
    name: schemaKindsDef.name,
    description: schemaKindsDef.description,
    inputSchema: zodToJsonSchema(SchemaKindsParamsSchema),
  },
  {
    name: schemaEdgesDef.name,
    description: schemaEdgesDef.description,
    inputSchema: zodToJsonSchema(SchemaEdgesParamsSchema),
  },
  {
    name: schemaStatsDef.name,
    description: schemaStatsDef.description,
    inputSchema: zodToJsonSchema(SchemaStatsParamsSchema),
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Handler function type for shared query tools
 */
export type SharedQueryHandler = (
  ctx: QueryContext,
  params: Record<string, unknown>
) => Promise<unknown>;

/**
 * Create handlers for all shared query tools
 */
export function createSharedQueryHandlers(
  pool: DuckDBPool,
  packages: string[]
): Map<string, SharedQueryHandler> {
  const handlers = new Map<string, SharedQueryHandler>();

  // Helper to create context for each request
  const getContext = (): QueryContext => createQueryContext({ pool, packages });

  // Symbol queries
  handlers.set("symbol_find", async (_, params) => {
    const ctx = getContext();
    return symbolFind(ctx, params as SymbolFindParams);
  });

  handlers.set("symbol_get", async (_, params) => {
    const ctx = getContext();
    return symbolGet(ctx, params as SymbolGetParams);
  });

  handlers.set("symbol_file", async (_, params) => {
    const ctx = getContext();
    return symbolFile(ctx, params as SymbolFileParams);
  });

  // Graph queries
  handlers.set("graph_deps", async (_, params) => {
    const ctx = getContext();
    return graphDeps(ctx, params as GraphDepsParams);
  });

  handlers.set("graph_dependents", async (_, params) => {
    const ctx = getContext();
    return graphDependents(ctx, params as GraphDependentsParams);
  });

  handlers.set("graph_calls", async (_, params) => {
    const ctx = getContext();
    return graphCalls(ctx, params as GraphCallsParams);
  });

  handlers.set("graph_imports", async (_, params) => {
    const ctx = getContext();
    return graphImports(ctx, params as GraphImportsParams);
  });

  // Schema queries
  handlers.set("schema_tables", async (_, params) => {
    const ctx = getContext();
    return schemaTables(ctx, params as SchemaTablesParams);
  });

  handlers.set("schema_kinds", async () => {
    const ctx = getContext();
    return schemaKinds(ctx, {});
  });

  handlers.set("schema_edges", async () => {
    const ctx = getContext();
    return schemaEdges(ctx, {});
  });

  handlers.set("schema_stats", async () => {
    const ctx = getContext();
    return schemaStats(ctx, {});
  });

  return handlers;
}

// ============================================================================
// Integration Helper
// ============================================================================

/**
 * Check if a tool name is a shared query tool
 */
export function isSharedQueryTool(toolName: string): boolean {
  return SHARED_QUERY_TOOLS.some((tool) => tool.name === toolName);
}

/**
 * Get list of shared query tool names
 */
export function getSharedQueryToolNames(): string[] {
  return SHARED_QUERY_TOOLS.map((tool) => tool.name);
}

// ============================================================================
// Example Usage (for documentation)
// ============================================================================

/*

To integrate shared query tools into the MCP server:

1. Import the shared tools and handlers:

   import {
     SHARED_QUERY_TOOLS,
     createSharedQueryHandlers,
     isSharedQueryTool,
   } from "./tools/shared-queries.js";

2. Add shared tools to the tool list in ListToolsRequestSchema handler:

   const allTools = [...MCP_TOOLS, ...SHARED_QUERY_TOOLS];
   return {
     tools: allTools.map((tool) => ({
       name: tool.name,
       description: tool.description,
       inputSchema: tool.inputSchema,
     })),
   };

3. Create handlers when initializing the server:

   private sharedQueryHandlers: Map<string, SharedQueryHandler> | null = null;

   async initialize() {
     // ... existing initialization ...

     // Get package paths from data provider
     const packages = await this.getPackagePaths();
     this.sharedQueryHandlers = createSharedQueryHandlers(pool, packages);
   }

4. Route shared query tools in executeTool:

   private async executeTool(toolName: string, input: Record<string, unknown>) {
     // Check if this is a shared query tool
     if (isSharedQueryTool(toolName) && this.sharedQueryHandlers) {
       const handler = this.sharedQueryHandlers.get(toolName);
       if (handler) {
         const result = await handler(this.queryContext, input);
         return { success: true, data: result };
       }
     }

     // Fall through to existing tool handling...
   }

The shared query tools provide:
- Consistent parameter naming with CLI (e.g., "entity" instead of "entityId")
- Unified output levels (counts/summary/details)
- Progressive disclosure pattern
- Type-safe parameter validation via Zod schemas

*/
