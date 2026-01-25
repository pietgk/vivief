/**
 * DevAC MCP Server Implementation
 *
 * Provides MCP server for AI assistant integration using
 * the Model Context Protocol SDK.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * JSON.stringify that safely handles BigInt values by converting them to Numbers.
 * DuckDB returns BigInt for COUNT(*) and SUM() aggregates which JSON.stringify cannot handle.
 */
function safeJsonStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => (typeof value === "bigint" ? Number(value) : value));
}
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  type DiagnosticsCategory,
  type DiagnosticsFilter,
  type DiagnosticsSeverity,
  type DiagnosticsSource,
  type GroupBy,
  type OutputLevel,
  type RepoContext,
  checkQueryPrerequisites,
  discoverContext,
  getWorkspaceStatus,
  isCanonicalURI,
  parseCanonicalURI,
} from "@pietgk/devac-core";
import { type DataProvider, createDataProvider } from "./data-provider.js";
import { MCP_TOOLS } from "./tools/index.js";
import type {
  MCPReadinessMeta,
  MCPServerOptions,
  MCPServerStatus,
  MCPToolResult,
} from "./types.js";

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
 * Resolve a file path or devac:// URI to a file path
 *
 * Supports both legacy file paths and devac:// URIs for backwards compatibility.
 * If the input is a URI, extracts the file path portion.
 *
 * @param input - File path or devac:// URI
 * @returns Resolved file path
 */
function resolveToFilePath(input: string): string {
  if (isCanonicalURI(input)) {
    const { uri } = parseCanonicalURI(input);
    // Combine package path + file path
    if (uri.file) {
      return uri.package === "." ? uri.file : `${uri.package}/${uri.file}`;
    }
    // Package-only URI
    return uri.package;
  }
  return input;
}

/**
 * Resolve an entity ID or devac:// URI to an entity identifier
 *
 * Supports both legacy entity IDs and devac:// URIs for backwards compatibility.
 * For Phase 2, URIs are passed through - full resolution via symbol index is Phase 3+.
 *
 * @param input - Entity ID or devac:// URI
 * @returns Resolved entity identifier
 */
function resolveToEntityId(input: string): string {
  // For Phase 2, we pass through URIs as-is
  // Full URI -> entity ID resolution requires symbol index (Phase 3+)
  // The data provider will handle both formats
  return input;
}

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
            text: safeJsonStringify(result.data ?? { error: result.error }),
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
    // query_context doesn't require the data provider
    if (toolName === "query_context") {
      return await this.executeGetContext(input);
    }

    if (!this.provider) {
      return { success: false, error: "Server not initialized" };
    }

    try {
      switch (toolName) {
        // Query tools
        case "query_symbol":
          return await this.executeFindSymbol(input);

        case "query_deps":
          return await this.executeGetDependencies(input);

        case "query_dependents":
          return await this.executeGetDependents(input);

        case "query_file":
          return await this.executeGetFileSymbols(input);

        case "query_affected":
          return await this.executeGetAffected(input);

        case "query_call_graph":
          return await this.executeGetCallGraph(input);

        case "query_sql":
          return await this.executeQuerySql(input);

        case "query_schema":
          return await this.executeGetSchema();

        case "query_repos":
          return await this.executeListRepos();

        case "query_context":
          return await this.executeGetContext(input);

        // Status tools
        case "status":
          return await this.executeGetWorkspaceStatus(input);

        case "status_diagnostics":
          return await this.executeGetValidationErrors(input);

        case "status_diagnostics_summary":
          return await this.executeGetValidationSummary(input);

        case "status_diagnostics_counts":
          return await this.executeGetValidationCounts();

        // Unified Diagnostics tools
        case "status_all_diagnostics":
          return await this.executeGetAllDiagnostics(input);

        case "status_all_diagnostics_summary":
          return await this.executeGetDiagnosticsSummary(input);

        case "status_all_diagnostics_counts":
          return await this.executeGetDiagnosticsCounts();

        // Query: Effects, Rules, C4 tools (v3.0)
        case "query_effects":
          return await this.executeQueryEffects(input);

        case "query_rules":
          return await this.executeRunRules(input);

        case "query_rules_list":
          return await this.executeListRules(input);

        case "query_c4":
          return await this.executeGenerateC4(input);

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
   * Get readiness metadata for inclusion in query results.
   * Used to explain why queries return empty results.
   */
  private async getReadinessMeta(): Promise<MCPReadinessMeta | undefined> {
    try {
      const readiness = await checkQueryPrerequisites();
      if (!readiness.ready) {
        const blocker = readiness.blockers[0];
        return {
          ready: false,
          state: readiness.state,
          reason: blocker?.message || readiness.summary,
          fix: blocker?.fixCommand,
        };
      }
      return undefined; // Don't include metadata when ready
    } catch {
      return undefined; // Silently skip if check fails
    }
  }

  /**
   * Helper to include readiness info in results when data is empty.
   */
  private async withReadiness(
    result: MCPToolResult,
    checkEmpty: (data: unknown) => boolean = (data) => Array.isArray(data) && data.length === 0
  ): Promise<MCPToolResult> {
    if (result.success && checkEmpty(result.data)) {
      const readiness = await this.getReadinessMeta();
      if (readiness) {
        return { ...result, readiness };
      }
    }
    return result;
  }

  /**
   * Find symbol by name
   */
  private async executeFindSymbol(input: Record<string, unknown>): Promise<MCPToolResult> {
    const name = input.name as string;
    const kind = input.kind as string | undefined;

    const result = await this.provider.findSymbol(name, kind);
    return this.withReadiness({ success: true, data: result.rows });
  }

  /**
   * Get dependencies of a symbol
   *
   * Accepts both entity IDs and devac:// URIs for backwards compatibility.
   */
  private async executeGetDependencies(input: Record<string, unknown>): Promise<MCPToolResult> {
    if (typeof input.entityId !== "string" || input.entityId.trim() === "") {
      return {
        success: false,
        error:
          "Missing or invalid 'entityId' parameter. Expected a non-empty string or devac:// URI.",
      };
    }
    const entityId = resolveToEntityId(input.entityId);
    const result = await this.provider.getDependencies(entityId);
    return this.withReadiness({ success: true, data: result.rows });
  }

  /**
   * Get dependents of a symbol
   *
   * Accepts both entity IDs and devac:// URIs for backwards compatibility.
   */
  private async executeGetDependents(input: Record<string, unknown>): Promise<MCPToolResult> {
    if (typeof input.entityId !== "string" || input.entityId.trim() === "") {
      return {
        success: false,
        error:
          "Missing or invalid 'entityId' parameter. Expected a non-empty string or devac:// URI.",
      };
    }
    const entityId = resolveToEntityId(input.entityId);
    const result = await this.provider.getDependents(entityId);
    return this.withReadiness({ success: true, data: result.rows });
  }

  /**
   * Get all symbols in a file
   *
   * Accepts both file paths and devac:// URIs for backwards compatibility.
   */
  private async executeGetFileSymbols(input: Record<string, unknown>): Promise<MCPToolResult> {
    if (typeof input.filePath !== "string" || input.filePath.trim() === "") {
      return {
        success: false,
        error:
          "Missing or invalid 'filePath' parameter. Expected a non-empty string or devac:// URI.",
      };
    }
    const filePath = resolveToFilePath(input.filePath);
    const result = await this.provider.getFileSymbols(filePath);
    return this.withReadiness({ success: true, data: result.rows });
  }

  /**
   * Get affected files from changes
   *
   * Accepts both file paths and devac:// URIs for backwards compatibility.
   */
  private async executeGetAffected(input: Record<string, unknown>): Promise<MCPToolResult> {
    if (!Array.isArray(input.changedFiles)) {
      return {
        success: false,
        error:
          "Missing or invalid 'changedFiles' parameter. Expected an array of file paths or devac:// URIs.",
      };
    }
    // Resolve each entry - supports both file paths and URIs
    const changedFiles = (input.changedFiles as string[]).map(resolveToFilePath);
    const maxDepth = (input.maxDepth as number) ?? 10;

    const result = await this.provider.getAffected(changedFiles, maxDepth);
    return { success: true, data: result.rows[0] };
  }

  /**
   * Get call graph for a function
   *
   * Accepts both entity IDs and devac:// URIs for backwards compatibility.
   */
  private async executeGetCallGraph(input: Record<string, unknown>): Promise<MCPToolResult> {
    if (typeof input.entityId !== "string" || input.entityId.trim() === "") {
      return {
        success: false,
        error:
          "Missing or invalid 'entityId' parameter. Expected a non-empty string or devac:// URI.",
      };
    }
    const entityId = resolveToEntityId(input.entityId);
    const direction = (input.direction as "callers" | "callees" | "both") ?? "both";
    const maxDepth = (input.maxDepth as number) ?? 3;

    const result = await this.provider.getCallGraph(entityId, direction, maxDepth);
    return { success: true, data: result.rows[0] };
  }

  /**
   * Execute SQL query (SELECT only)
   */
  private async executeQuerySql(input: Record<string, unknown>): Promise<MCPToolResult> {
    // Validate required parameter
    if (typeof input.sql !== "string" || input.sql.trim() === "") {
      return {
        success: false,
        error: "Missing or invalid 'sql' parameter. Expected a non-empty string.",
      };
    }
    const sql = input.sql;

    // Safety check: only allow SELECT queries
    const trimmedSql = sql.trim().toLowerCase();
    if (!trimmedSql.startsWith("select")) {
      return { success: false, error: "Only SELECT queries are allowed" };
    }

    const result = await this.provider.querySql(sql);
    return this.withReadiness({ success: true, data: result.rows });
  }

  /**
   * Get database schema information
   */
  private async executeGetSchema(): Promise<MCPToolResult> {
    // Return a static schema description since table structure is known
    const schema = {
      seedTables: {
        nodes: {
          description: "Code entities (functions, classes, variables, interfaces, etc.)",
          columns: [
            "entity_id",
            "name",
            "qualified_name",
            "kind",
            "file_path",
            "start_line",
            "end_line",
            "start_column",
            "end_column",
            "is_exported",
            "is_default_export",
            "visibility",
            "is_async",
            "is_generator",
            "is_static",
            "is_abstract",
            "type_signature",
            "documentation",
            "decorators",
            "type_parameters",
            "properties",
            "source_file_hash",
            "branch",
            "is_deleted",
            "updated_at",
          ],
        },
        edges: {
          description: "Relationships between entities (CALLS, IMPORTS, EXTENDS, etc.)",
          columns: [
            "source_entity_id",
            "target_entity_id",
            "edge_type",
            "source_file_path",
            "source_line",
            "source_column",
            "properties",
            "source_file_hash",
            "branch",
            "is_deleted",
            "updated_at",
          ],
        },
        external_refs: {
          description: "Import references to external packages",
          columns: [
            "source_entity_id",
            "module_specifier",
            "imported_symbol",
            "local_alias",
            "import_style",
            "is_type_only",
            "source_file_path",
            "source_line",
            "source_column",
            "target_entity_id",
            "is_resolved",
            "is_reexport",
            "export_alias",
            "source_file_hash",
            "branch",
            "is_deleted",
            "updated_at",
          ],
        },
        effects: {
          description: "Code behaviors and execution patterns (v3.0)",
          columns: [
            "effect_id",
            "effect_type",
            "timestamp",
            "source_entity_id",
            "source_file_path",
            "source_line",
            "source_column",
            "branch",
            "properties",
            "target_entity_id",
            "callee_name",
            "callee_qualified_name",
            "is_method_call",
            "is_async",
            "is_constructor",
            "argument_count",
            "is_external",
            "external_module",
            "store_type",
            "retrieve_type",
            "send_type",
            "operation",
            "target_resource",
            "provider",
            "request_type",
            "response_type",
            "method",
            "route_pattern",
            "framework",
            "target",
            "is_third_party",
            "service_name",
            "status_code",
            "content_type",
            "condition_type",
            "branch_count",
            "has_default",
            "loop_type",
            "group_type",
            "group_name",
            "description",
            "technology",
            "parent_group_id",
            "source_file_hash",
            "is_deleted",
            "updated_at",
          ],
        },
      },
      hubTables: {
        repo_registry: {
          description:
            "Registered repositories and their metadata. NOT SQL-queryable - use list_repos tool instead.",
          columns: ["repo_id", "local_path", "packages", "status", "last_synced"],
        },
        validation_errors: {
          description:
            "Type errors, lint issues from validators. NOT SQL-queryable - use get_validation_errors tool instead.",
          columns: ["error_id", "repo_id", "source", "severity", "file_path", "line", "message"],
        },
        unified_diagnostics: {
          description:
            "All diagnostics unified (validation + CI + GitHub issues). NOT SQL-queryable - use get_all_diagnostics tool instead.",
          columns: [
            "diagnostic_id",
            "repo_id",
            "source",
            "severity",
            "category",
            "title",
            "description",
            "resolved",
          ],
        },
      },
      tips: [
        "Use COUNT(*)::INT to avoid BigInt serialization errors",
        "Prefer dedicated MCP tools (get_diagnostics_counts, etc.) over raw SQL when available",
        "In hub mode, seed tables (nodes, edges, etc.) query across all registered repositories",
        "Hub tables (repo_registry, validation_errors, unified_diagnostics) are NOT SQL-queryable - use their dedicated MCP tools",
      ],
    };

    return { success: true, data: schema };
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
   * Supports level parameter: 'counts' | 'summary' | 'details' (default)
   */
  private async executeGetAllDiagnostics(input: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      const level = (input.level as string) ?? "details";

      // Route based on level for progressive disclosure
      if (level === "counts") {
        // Fast path: just return totals by severity
        const counts = await this.provider.getDiagnosticsCounts();
        return { success: true, data: counts };
      }

      if (level === "summary") {
        // Medium detail: return grouped counts by source
        const summary = await this.provider.getDiagnosticsSummary("source");
        return { success: true, data: summary };
      }

      // Full details (default): return diagnostic records with filters
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

  // ================== Effects, Rules, C4 Tool Handlers (v3.0) ==================

  /**
   * Query code effects from seeds
   *
   * Accepts both file paths and devac:// URIs for backwards compatibility.
   */
  private async executeQueryEffects(input: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      // Resolve file and entity parameters if they are URIs
      const fileInput = input.file as string | undefined;
      const entityInput = input.entity as string | undefined;

      const filter = {
        type: input.type as string | undefined,
        file: fileInput ? resolveToFilePath(fileInput) : undefined,
        entity: entityInput ? resolveToEntityId(entityInput) : undefined,
        externalOnly: input.externalOnly as boolean | undefined,
        asyncOnly: input.asyncOnly as boolean | undefined,
        limit: input.limit as number | undefined,
      };

      const result = await this.provider.queryEffects(filter);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run rules engine on effects
   */
  private async executeRunRules(input: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      const options = {
        domain: input.domain as string | undefined,
        limit: input.limit as number | undefined,
        includeStats: input.includeStats as boolean | undefined,
      };

      const result = await this.provider.runRules(options);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List available rules
   */
  private async executeListRules(input: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      const filter = {
        domain: input.domain as string | undefined,
        provider: input.provider as string | undefined,
      };

      const rules = await this.provider.listRules(filter);
      return { success: true, data: rules };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate C4 diagrams from effects
   */
  private async executeGenerateC4(input: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      const options = {
        level: input.level as "context" | "containers" | "domains" | "externals" | undefined,
        systemName: input.systemName as string | undefined,
        systemDescription: input.systemDescription as string | undefined,
        outputFormat: input.outputFormat as "json" | "plantuml" | "both" | undefined,
        limit: input.limit as number | undefined,
      };

      const result = await this.provider.generateC4(options);
      return { success: true, data: result };
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
   * Get workspace status including seed states
   */
  private async executeGetWorkspaceStatus(input: Record<string, unknown>): Promise<MCPToolResult> {
    const targetPath = (input.path as string) ?? process.cwd();
    const level = (input.level as OutputLevel) ?? "brief";
    const json = (input.json as boolean) ?? false;
    const groupBy = (input.groupBy as GroupBy) ?? "type";

    // Map level to full flag for backwards compatibility with getWorkspaceStatus
    const full = level === "full";

    try {
      const status = await getWorkspaceStatus({ path: targetPath, full });

      // If JSON format requested, return the raw status object
      // (caller can format as DevACStatusJSON if needed)
      if (json) {
        return { success: true, data: { ...status, _meta: { level, groupBy } } };
      }

      return { success: true, data: status };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Callback for when shutdown is requested via IPC */
  private shutdownCallback?: () => void;

  /**
   * Register a callback to be called when shutdown is requested via IPC
   */
  onShutdownRequested(callback: () => void): void {
    this.shutdownCallback = callback;
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    // Create the appropriate data provider based on mode
    // In hub mode, hubDir is auto-detected from workspace by findWorkspaceHubDir()
    this._provider = await createDataProvider(this.options.mode, {
      packagePath: this.options.packagePath,
      memoryLimit: this.options.memoryLimit,
    });

    await this._provider.initialize();

    // Wire up IPC shutdown callback if in hub mode with server ownership
    if (this._provider.mode === "hub") {
      const hubDataProvider = this._provider as import("./data-provider.js").HubDataProvider;
      const hubServer = hubDataProvider.getHubServer();
      if (hubServer) {
        hubServer.onShutdownRequested(() => {
          console.error("Shutdown requested via IPC");
          this.shutdownCallback?.();
        });
      }
    }

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
