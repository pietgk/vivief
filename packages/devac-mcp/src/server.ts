/**
 * DevAC MCP Server Implementation
 *
 * Provides MCP server for AI assistant integration using
 * the Model Context Protocol SDK.
 */

import {
  DuckDBPool,
  SeedReader,
  type SymbolAffectedAnalyzer,
  createSymbolAffectedAnalyzer,
  executeWithRecovery,
} from "@devac/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MCP_TOOLS } from "./tools/index.js";
import type { MCPServerOptions, MCPServerStatus, MCPToolResult } from "./types.js";

/**
 * DevAC MCP Server
 */
export class DevacMCPServer {
  private server: Server;
  private _pool: DuckDBPool | null = null;
  private _seedReader: SeedReader | null = null;
  private _analyzer: SymbolAffectedAnalyzer | null = null;
  private options: MCPServerOptions;
  private startTime = 0;
  private running = false;

  /** Get pool or throw if not initialized */
  private get pool(): DuckDBPool {
    if (!this._pool) throw new Error("DuckDB pool not initialized");
    return this._pool;
  }

  /** Get seedReader or throw if not initialized */
  private get seedReader(): SeedReader {
    if (!this._seedReader) throw new Error("SeedReader not initialized");
    return this._seedReader;
  }

  /** Get analyzer or throw if not initialized */
  private get analyzer(): SymbolAffectedAnalyzer {
    if (!this._analyzer) throw new Error("Analyzer not initialized");
    return this._analyzer;
  }

  constructor(options: MCPServerOptions) {
    this.options = options;
    this.server = new Server(
      {
        name: "devac-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: MCP_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this._pool || !this._seedReader) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Server not initialized" }),
            },
          ],
          isError: true,
        };
      }

      const result = await this.executeTool(name, args || {});

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.data ?? { error: result.error }),
          },
        ],
        isError: !result.success,
      };
    });
  }

  /**
   * Execute a tool by name
   */
  private async executeTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<MCPToolResult> {
    if (!this.pool || !this.seedReader || !this.analyzer) {
      return { success: false, error: "Server not initialized" };
    }

    try {
      switch (toolName) {
        case "find_symbol":
          return await this.executeFindSymbol(input);

        case "get_dependencies":
          return await this.executeGetDependencies(input);

        case "get_dependents":
          return await this.executeGetDependents(input);

        case "get_file_symbols":
          return await this.executeGetFileSymbols(input);

        case "get_affected":
          return await this.executeGetAffected(input);

        case "get_call_graph":
          return await this.executeGetCallGraph(input);

        case "query_sql":
          return await this.executeQuerySql(input);

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Find symbol by name
   */
  private async executeFindSymbol(input: Record<string, unknown>): Promise<MCPToolResult> {
    const name = input.name as string;
    const kind = input.kind as string | undefined;

    let sql = `SELECT * FROM nodes WHERE name = '${name.replace(/'/g, "''")}'`;
    if (kind) {
      sql += ` AND kind = '${kind.replace(/'/g, "''")}'`;
    }

    const result = await this.seedReader.querySeeds(sql);
    return { success: true, data: result.rows };
  }

  /**
   * Get dependencies of a symbol
   */
  private async executeGetDependencies(input: Record<string, unknown>): Promise<MCPToolResult> {
    const entityId = input.entityId as string;
    const edges = await this.seedReader.getEdgesBySource(entityId);
    return { success: true, data: edges };
  }

  /**
   * Get dependents of a symbol
   */
  private async executeGetDependents(input: Record<string, unknown>): Promise<MCPToolResult> {
    const entityId = input.entityId as string;
    const edges = await this.seedReader.getEdgesByTarget(entityId);
    return { success: true, data: edges };
  }

  /**
   * Get all symbols in a file
   */
  private async executeGetFileSymbols(input: Record<string, unknown>): Promise<MCPToolResult> {
    const filePath = input.filePath as string;
    const sql = `SELECT * FROM nodes WHERE source_file = '${filePath.replace(/'/g, "''")}'`;
    const result = await this.seedReader.querySeeds(sql);
    return { success: true, data: result.rows };
  }

  /**
   * Get affected files from changes
   */
  private async executeGetAffected(input: Record<string, unknown>): Promise<MCPToolResult> {
    const changedFiles = input.changedFiles as string[];
    const maxDepth = (input.maxDepth as number) ?? 10;

    const result = await this.analyzer.analyzeFileChanges(changedFiles, {}, { maxDepth });

    return { success: true, data: result };
  }

  /**
   * Get call graph for a function
   */
  private async executeGetCallGraph(input: Record<string, unknown>): Promise<MCPToolResult> {
    const entityId = input.entityId as string;
    const direction = (input.direction as string) ?? "both";
    const _maxDepth = (input.maxDepth as number) ?? 3;

    const results: { callers?: unknown[]; callees?: unknown[] } = {};

    if (direction === "callers" || direction === "both") {
      // Get incoming CALLS edges
      const sql = `
        SELECT e.*, n.name, n.kind, n.source_file
        FROM edges e
        JOIN nodes n ON e.source_entity_id = n.entity_id
        WHERE e.target_entity_id = '${entityId.replace(/'/g, "''")}'
        AND e.edge_type = 'CALLS'
        LIMIT 100
      `;
      const queryResult = await this.seedReader.querySeeds(sql);
      results.callers = queryResult.rows;
    }

    if (direction === "callees" || direction === "both") {
      // Get outgoing CALLS edges
      const sql = `
        SELECT e.*, n.name, n.kind, n.source_file
        FROM edges e
        JOIN nodes n ON e.target_entity_id = n.entity_id
        WHERE e.source_entity_id = '${entityId.replace(/'/g, "''")}'
        AND e.edge_type = 'CALLS'
        LIMIT 100
      `;
      const queryResult = await this.seedReader.querySeeds(sql);
      results.callees = queryResult.rows;
    }

    return { success: true, data: results };
  }

  /**
   * Execute SQL query (SELECT only)
   */
  private async executeQuerySql(input: Record<string, unknown>): Promise<MCPToolResult> {
    const sql = input.sql as string;

    // Safety check: only allow SELECT queries
    const trimmedSql = sql.trim().toLowerCase();
    if (!trimmedSql.startsWith("select")) {
      return { success: false, error: "Only SELECT queries are allowed" };
    }

    const result = await executeWithRecovery(this.pool, async (conn) => {
      return await conn.all(sql);
    });

    return { success: true, data: result };
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    // Initialize DuckDB pool
    this._pool = new DuckDBPool({
      memoryLimit: this.options.memoryLimit ?? "256MB",
    });
    await this._pool.initialize();

    // Create seed reader and analyzer
    this._seedReader = new SeedReader(this._pool, this.options.packagePath);
    this._analyzer = createSymbolAffectedAnalyzer(
      this._pool,
      this.options.packagePath,
      this._seedReader
    );

    // Start server with stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.startTime = Date.now();
    this.running = true;
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    this.running = false;
    await this.server.close();
    if (this._pool) {
      await this._pool.shutdown();
      this._pool = null;
    }
    this._seedReader = null;
    this._analyzer = null;
  }

  /**
   * Get server status
   */
  getStatus(): MCPServerStatus {
    return {
      isRunning: this.running,
      packagePath: this.options.packagePath,
      toolCount: MCP_TOOLS.length,
      uptime: this.running ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.running;
  }
}

/**
 * Create and start an MCP server
 */
export async function createMCPServer(options: MCPServerOptions): Promise<DevacMCPServer> {
  const server = new DevacMCPServer(options);
  await server.start();
  return server;
}
