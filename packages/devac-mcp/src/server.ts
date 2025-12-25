/**
 * DevAC MCP Server Implementation
 *
 * Provides MCP server for AI assistant integration using
 * the Model Context Protocol SDK.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  type DiagnosticsCategory,
  type DiagnosticsFilter,
  type DiagnosticsSeverity,
  type DiagnosticsSource,
  type RepoContext,
  discoverContext,
} from "@pietgk/devac-core";
import { type DataProvider, createDataProvider } from "./data-provider.js";
import { MCP_TOOLS } from "./tools/index.js";
import type { MCPServerOptions, MCPServerStatus, MCPToolResult } from "./types.js";

/**
 * Context cache entry
 */
interface CachedContext {
  context: RepoContext;
  timestamp: number;
}

/** Context cache TTL in milliseconds (30 seconds) */
const CONTEXT_CACHE_TTL = 30_000;

/**
 * DevAC MCP Server
 */
export class DevacMCPServer {
  private server: Server;
  private _provider: DataProvider | null = null;
  private options: MCPServerOptions;
  private startTime = 0;
  private running = false;
  private contextCache: Map<string, CachedContext> = new Map();

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
    // get_context doesn't require the data provider
    if (toolName === "get_context") {
      return await this.executeGetContext(input);
    }

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

        case "get_context":
          return await this.executeGetContext(input);

        case "get_validation_errors":
          return await this.executeGetValidationErrors(input);

        case "get_validation_summary":
          return await this.executeGetValidationSummary(input);

        case "get_validation_counts":
          return await this.executeGetValidationCounts();

        // Unified Diagnostics tools
        case "get_all_diagnostics":
          return await this.executeGetAllDiagnostics(input);

        case "get_diagnostics_summary":
          return await this.executeGetDiagnosticsSummary(input);

        case "get_diagnostics_counts":
          return await this.executeGetDiagnosticsCounts();

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
   * Get validation errors from hub
   */
  private async executeGetValidationErrors(input: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      const filter = {
        repo_id: input.repo_id as string | undefined,
        severity: input.severity as "error" | "warning" | undefined,
        source: input.source as "tsc" | "eslint" | "test" | undefined,
        file: input.file as string | undefined,
        limit: input.limit as number | undefined,
      };

      const errors = await this.provider.getValidationErrors(filter);
      return { success: true, data: errors };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get validation error summary
   */
  private async executeGetValidationSummary(
    input: Record<string, unknown>
  ): Promise<MCPToolResult> {
    try {
      const groupBy = input.groupBy as "repo" | "file" | "source" | "severity";
      if (!groupBy) {
        return { success: false, error: "groupBy is required" };
      }

      const summary = await this.provider.getValidationSummary(groupBy);
      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get validation error counts
   */
  private async executeGetValidationCounts(): Promise<MCPToolResult> {
    try {
      const counts = await this.provider.getValidationCounts();
      return { success: true, data: counts };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ================== Unified Diagnostics Tool Handlers ==================

  /**
   * Get all diagnostics (unified view)
   */
  private async executeGetAllDiagnostics(input: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      const filter: DiagnosticsFilter = {
        repo_id: input.repo_id as string | undefined,
        source: input.source as DiagnosticsSource[] | undefined,
        severity: input.severity as DiagnosticsSeverity[] | undefined,
        category: input.category as DiagnosticsCategory[] | undefined,
        file_path: input.file_path as string | undefined,
        resolved: input.resolved as boolean | undefined,
        limit: input.limit as number | undefined,
      };

      const diagnostics = await this.provider.getAllDiagnostics(filter);
      return { success: true, data: diagnostics };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get diagnostics summary grouped by a field
   */
  private async executeGetDiagnosticsSummary(
    input: Record<string, unknown>
  ): Promise<MCPToolResult> {
    try {
      const groupBy = input.groupBy as "repo" | "source" | "severity" | "category";
      if (!groupBy) {
        return { success: false, error: "groupBy is required" };
      }

      const summary = await this.provider.getDiagnosticsSummary(groupBy);
      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get diagnostics counts by severity
   */
  private async executeGetDiagnosticsCounts(): Promise<MCPToolResult> {
    try {
      const counts = await this.provider.getDiagnosticsCounts();
      return { success: true, data: counts };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get context with caching
   */
  private async executeGetContext(input: Record<string, unknown>): Promise<MCPToolResult> {
    const targetPath = (input.path as string) ?? process.cwd();
    const checkSeeds = (input.checkSeeds as boolean) ?? true;
    const refresh = (input.refresh as boolean) ?? false;

    // Check cache if not forcing refresh
    if (!refresh) {
      const cached = this.contextCache.get(targetPath);
      if (cached && Date.now() - cached.timestamp < CONTEXT_CACHE_TTL) {
        return {
          success: true,
          data: {
            ...cached.context,
            cached: true,
            cacheAge: Date.now() - cached.timestamp,
          },
        };
      }
    }

    try {
      const context = await discoverContext(targetPath, { checkSeeds });

      // Update cache
      this.contextCache.set(targetPath, {
        context,
        timestamp: Date.now(),
      });

      // Clean up stale cache entries
      this.cleanupContextCache();

      return {
        success: true,
        data: {
          ...context,
          cached: false,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Clean up stale context cache entries
   */
  private cleanupContextCache(): void {
    const now = Date.now();
    for (const [path, entry] of this.contextCache.entries()) {
      if (now - entry.timestamp > CONTEXT_CACHE_TTL * 2) {
        this.contextCache.delete(path);
      }
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
