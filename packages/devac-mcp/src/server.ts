/**
 * DevAC MCP Server Implementation
 *
 * Provides MCP server for AI assistant integration using
 * the Model Context Protocol SDK.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { type DataProvider, createDataProvider } from "./data-provider.js";
import { MCP_TOOLS } from "./tools/index.js";
import type { MCPServerOptions, MCPServerStatus, MCPToolResult } from "./types.js";

/**
 * DevAC MCP Server
 */
export class DevacMCPServer {
  private server: Server;
  private _provider: DataProvider | null = null;
  private options: MCPServerOptions;
  private startTime = 0;
  private running = false;

  /** Get provider or throw if not initialized */
  private get provider(): DataProvider {
    if (!this._provider) throw new Error("Data provider not initialized");
    return this._provider;
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

      if (!this._provider) {
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
    if (!this.provider) {
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

        case "list_repos":
          return await this.executeListRepos();

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

    const result = await this.provider.findSymbol(name, kind);
    return { success: true, data: result.rows };
  }

  /**
   * Get dependencies of a symbol
   */
  private async executeGetDependencies(input: Record<string, unknown>): Promise<MCPToolResult> {
    const entityId = input.entityId as string;
    const result = await this.provider.getDependencies(entityId);
    return { success: true, data: result.rows };
  }

  /**
   * Get dependents of a symbol
   */
  private async executeGetDependents(input: Record<string, unknown>): Promise<MCPToolResult> {
    const entityId = input.entityId as string;
    const result = await this.provider.getDependents(entityId);
    return { success: true, data: result.rows };
  }

  /**
   * Get all symbols in a file
   */
  private async executeGetFileSymbols(input: Record<string, unknown>): Promise<MCPToolResult> {
    const filePath = input.filePath as string;
    const result = await this.provider.getFileSymbols(filePath);
    return { success: true, data: result.rows };
  }

  /**
   * Get affected files from changes
   */
  private async executeGetAffected(input: Record<string, unknown>): Promise<MCPToolResult> {
    const changedFiles = input.changedFiles as string[];
    const maxDepth = (input.maxDepth as number) ?? 10;

    const result = await this.provider.getAffected(changedFiles, maxDepth);
    return { success: true, data: result.rows[0] };
  }

  /**
   * Get call graph for a function
   */
  private async executeGetCallGraph(input: Record<string, unknown>): Promise<MCPToolResult> {
    const entityId = input.entityId as string;
    const direction = (input.direction as "callers" | "callees" | "both") ?? "both";
    const maxDepth = (input.maxDepth as number) ?? 3;

    const result = await this.provider.getCallGraph(entityId, direction, maxDepth);
    return { success: true, data: result.rows[0] };
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

    const result = await this.provider.querySql(sql);
    return { success: true, data: result.rows };
  }

  /**
   * List registered repositories (hub mode only)
   */
  private async executeListRepos(): Promise<MCPToolResult> {
    try {
      const repos = await this.provider.listRepos();
      return { success: true, data: repos };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    // Create the appropriate data provider based on mode
    this._provider = createDataProvider(this.options.mode, {
      packagePath: this.options.packagePath,
      hubDir: this.options.hubDir,
      memoryLimit: this.options.memoryLimit,
    });

    await this._provider.initialize();

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
    if (this._provider) {
      await this._provider.shutdown();
      this._provider = null;
    }
  }

  /**
   * Get server status
   */
  getStatus(): MCPServerStatus {
    return {
      isRunning: this.running,
      mode: this.options.mode,
      packagePath: this.options.packagePath,
      hubDir: this.options.hubDir,
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
