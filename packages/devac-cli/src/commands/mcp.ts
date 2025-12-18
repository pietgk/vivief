/**
 * MCP Command Implementation
 *
 * Starts/stops the MCP (Model Context Protocol) server
 * for AI assistant integration.
 * Based on Phase 5 plan.
 */

import * as fs from "node:fs/promises";
import {
  DuckDBPool,
  SeedReader,
  type SymbolAffectedAnalyzer,
  createSymbolAffectedAnalyzer,
  executeWithRecovery,
} from "@pietgk/devac-core";

/**
 * MCP Tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP Tool result
 */
export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * MCP Server Controller
 */
export interface MCPController {
  /** Stop the MCP server */
  stop(): Promise<void>;
  /** Check if server is running */
  isRunning(): boolean;
  /** Get list of available tools */
  getTools(): MCPTool[];
  /** Execute a tool */
  executeTool(toolName: string, input: Record<string, unknown>): Promise<MCPToolResult>;
}

/**
 * Options for mcp command
 */
export interface MCPCommandOptions {
  /** Path to the package */
  packagePath: string;
  /** Action to perform */
  action: "start" | "stop";
  /** Transport type (default: stdio) */
  transport?: "stdio";
}

/**
 * Result from mcp command
 */
export interface MCPCommandResult {
  success: boolean;
  controller?: MCPController;
  toolCount: number;
  error?: string;
}

/**
 * Available MCP tools
 */
const MCP_TOOLS: MCPTool[] = [
  {
    name: "find_symbol",
    description: "Find a symbol by name in the codebase",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Symbol name to find" },
        kind: { type: "string", description: "Optional symbol kind filter" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_dependencies",
    description: "Get dependencies of a symbol",
    inputSchema: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Entity ID of the symbol" },
        maxDepth: { type: "number", description: "Maximum traversal depth" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "get_dependents",
    description: "Get symbols that depend on the target",
    inputSchema: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Entity ID of the symbol" },
        maxDepth: { type: "number", description: "Maximum traversal depth" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "get_affected",
    description: "Get files affected by changes",
    inputSchema: {
      type: "object",
      properties: {
        changedFiles: {
          type: "array",
          items: { type: "string" },
          description: "List of changed file paths",
        },
        maxDepth: { type: "number", description: "Maximum traversal depth" },
      },
      required: ["changedFiles"],
    },
  },
  {
    name: "query_sql",
    description: "Execute a read-only SQL query against the code graph",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL query (SELECT only)" },
      },
      required: ["sql"],
    },
  },
];

/**
 * Create an MCP server controller
 */
function createMCPController(
  pool: DuckDBPool,
  packagePath: string,
  seedReader: SeedReader
): MCPController {
  let running = true;
  const analyzer = createSymbolAffectedAnalyzer(pool, packagePath, seedReader);

  return {
    async stop(): Promise<void> {
      running = false;
      await pool.shutdown();
    },

    isRunning(): boolean {
      return running;
    },

    getTools(): MCPTool[] {
      return [...MCP_TOOLS];
    },

    async executeTool(toolName: string, input: Record<string, unknown>): Promise<MCPToolResult> {
      try {
        switch (toolName) {
          case "find_symbol":
            return await executeFindSymbol(seedReader, input);

          case "get_dependencies":
            return await executeGetDependencies(seedReader, input);

          case "get_dependents":
            return await executeGetDependents(seedReader, input);

          case "get_affected":
            return await executeGetAffected(analyzer, input);

          case "query_sql":
            return await executeQuerySql(pool, input);

          default:
            return {
              success: false,
              error: `Unknown tool: ${toolName}`,
            };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Execute find_symbol tool
 */
async function executeFindSymbol(
  seedReader: SeedReader,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  const name = input.name as string;
  const kind = input.kind as string | undefined;

  // Use querySeeds to find nodes by name
  let sql = `SELECT * FROM nodes WHERE name = '${name.replace(/'/g, "''")}'`;
  if (kind) {
    sql += ` AND kind = '${kind.replace(/'/g, "''")}'`;
  }

  const nodes = await seedReader.querySeeds(sql);

  return {
    success: true,
    data: nodes,
  };
}

/**
 * Execute get_dependencies tool
 */
async function executeGetDependencies(
  seedReader: SeedReader,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  const entityId = input.entityId as string;

  // Use getEdgesBySource to find dependencies
  const edges = await seedReader.getEdgesBySource(entityId);

  return {
    success: true,
    data: edges,
  };
}

/**
 * Execute get_dependents tool
 */
async function executeGetDependents(
  seedReader: SeedReader,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  const entityId = input.entityId as string;

  // Use getEdgesByTarget to find dependents
  const edges = await seedReader.getEdgesByTarget(entityId);

  return {
    success: true,
    data: edges,
  };
}

/**
 * Execute get_affected tool
 */
async function executeGetAffected(
  analyzer: SymbolAffectedAnalyzer,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  const changedFiles = input.changedFiles as string[];
  const maxDepth = (input.maxDepth as number) ?? 10;

  const result = await analyzer.analyzeFileChanges(changedFiles, {}, { maxDepth });

  return {
    success: true,
    data: result,
  };
}

/**
 * Execute query_sql tool
 */
async function executeQuerySql(
  pool: DuckDBPool,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  const sql = input.sql as string;

  // Safety check: only allow SELECT queries
  const trimmedSql = sql.trim().toLowerCase();
  if (!trimmedSql.startsWith("select")) {
    return {
      success: false,
      error: "Only SELECT queries are allowed",
    };
  }

  // Use executeWithRecovery to run the query with proper connection handling
  const result = await executeWithRecovery(pool, async (conn) => {
    return await conn.all(sql);
  });

  return {
    success: true,
    data: result,
  };
}

/**
 * Start or stop MCP server
 */
export async function mcpCommand(options: MCPCommandOptions): Promise<MCPCommandResult> {
  // Validate package path exists
  try {
    await fs.access(options.packagePath);
  } catch {
    return {
      success: false,
      toolCount: 0,
      error: `Path does not exist: ${options.packagePath}`,
    };
  }

  if (options.action === "stop") {
    // Stop action handled by controller
    return {
      success: true,
      toolCount: 0,
    };
  }

  // Start action
  let pool: DuckDBPool | null = null;

  try {
    // Initialize DuckDB pool
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Create seed reader
    const seedReader = new SeedReader(pool, options.packagePath);

    // Create controller
    const controller = createMCPController(pool, options.packagePath, seedReader);

    return {
      success: true,
      controller,
      toolCount: MCP_TOOLS.length,
    };
  } catch (error) {
    if (pool) {
      await pool.shutdown();
    }

    return {
      success: false,
      toolCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
