import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type CentralHub,
  type CodeEffect,
  type DiagnosticsFilter,
  type DiagnosticsSummary,
  type DomainEffect,
  DuckDBPool,
  type HubClient,
  type HubServer,
  type RepositoryManifest,
  type Rule,
  type SeedReader,
  type SymbolAffectedAnalyzer,
  type UnifiedDiagnostics,
  type ValidationError,
  type ValidationFilter,
  type ValidationSummary,
  builtinRules,
  createHubClient,
  createHubServer,
  createRuleEngine,
  createSeedReader,
  createSymbolAffectedAnalyzer,
  discoverDomainBoundaries,
  exportContainersToPlantUML,
  exportContextToPlantUML,
  findWorkspaceHubDir,
  generateC4Containers,
  generateC4Context,
  getRulesByDomain,
  getRulesByProvider,
  queryMultiplePackages,
  validateHubLocation,
} from "@pietgk/devac-core";

/**
 * Common query result type
 */
export interface ProviderQueryResult {
  rows: unknown[];
  rowCount: number;
  timeMs: number;
}

/**
 * Filter for effects query
 */
export interface EffectsFilter {
  type?: string;
  file?: string;
  entity?: string;
  externalOnly?: boolean;
  asyncOnly?: boolean;
  limit?: number;
}

/**
 * Filter for rules listing
 */
export interface RulesFilter {
  domain?: string;
  provider?: string;
}

/**
 * Options for running rules engine
 */
export interface RunRulesOptions {
  domain?: string;
  limit?: number;
  includeStats?: boolean;
}

/**
 * Result from running rules engine
 */
export interface RunRulesResult {
  domainEffects: DomainEffect[];
  matchedCount: number;
  unmatchedCount: number;
  ruleStats?: Record<string, number>;
}

/**
 * Options for C4 generation
 */
export interface C4Options {
  level?: "context" | "containers" | "domains" | "externals";
  systemName?: string;
  systemDescription?: string;
  outputFormat?: "json" | "plantuml" | "both";
  limit?: number;
}

/**
 * Result from C4 generation
 */
export interface C4Result {
  level: string;
  model: unknown;
  plantuml?: string;
}

/**
 * Repository info for hub mode
 */
export interface RepoListItem {
  repoId: string;
  localPath: string;
  packages: number;
  status: "active" | "stale" | "missing";
  lastSynced: string;
}

/**
 * Data Provider Interface
 *
 * Common interface for both package and hub modes.
 */
export interface DataProvider {
  /** Provider mode */
  readonly mode: "package" | "hub";

  /** Initialize the provider */
  initialize(): Promise<void>;

  /** Shutdown the provider */
  shutdown(): Promise<void>;

  /** Find symbols by name */
  findSymbol(name: string, kind?: string): Promise<ProviderQueryResult>;

  /** Get dependencies of an entity */
  getDependencies(entityId: string): Promise<ProviderQueryResult>;

  /** Get dependents of an entity */
  getDependents(entityId: string): Promise<ProviderQueryResult>;

  /** Get symbols in a file */
  getFileSymbols(filePath: string): Promise<ProviderQueryResult>;

  /** Get affected files from changes */
  getAffected(changedFiles: string[], maxDepth?: number): Promise<ProviderQueryResult>;

  /** Get call graph for a function */
  getCallGraph(
    entityId: string,
    direction: "callers" | "callees" | "both",
    maxDepth?: number
  ): Promise<ProviderQueryResult>;

  /** Execute SQL query (SELECT only) */
  querySql(sql: string): Promise<ProviderQueryResult>;

  /** List registered repositories (hub mode only) */
  listRepos(): Promise<RepoListItem[]>;

  /** Get validation errors from hub (hub mode only) */
  getValidationErrors(filter: ValidationFilter): Promise<ValidationError[]>;

  /** Get validation error summary (hub mode only) */
  getValidationSummary(
    groupBy: "repo" | "file" | "source" | "severity"
  ): Promise<ValidationSummary[]>;

  /** Get validation error counts (hub mode only) */
  getValidationCounts(): Promise<{
    errors: number;
    warnings: number;
    total: number;
  }>;

  // ================== Unified Diagnostics Methods ==================

  /** Get all diagnostics (unified view, hub mode only) */
  getAllDiagnostics(filter?: DiagnosticsFilter): Promise<UnifiedDiagnostics[]>;

  /** Get diagnostics summary (hub mode only) */
  getDiagnosticsSummary(
    groupBy: "repo" | "source" | "severity" | "category"
  ): Promise<DiagnosticsSummary[]>;

  /** Get diagnostics counts by severity (hub mode only) */
  getDiagnosticsCounts(): Promise<{
    critical: number;
    error: number;
    warning: number;
    suggestion: number;
    note: number;
    total: number;
  }>;

  // ================== Effects, Rules, C4 Methods (v3.0) ==================

  /** Query code effects from seeds */
  queryEffects(filter?: EffectsFilter): Promise<ProviderQueryResult>;

  /** Run rules engine on effects */
  runRules(options?: RunRulesOptions): Promise<RunRulesResult>;

  /** List available rules */
  listRules(filter?: RulesFilter): Promise<Rule[]>;

  /** Generate C4 diagram */
  generateC4(options?: C4Options): Promise<C4Result>;
}

/**
 * Package Data Provider
 *
 * Provides data from a single package using SeedReader.
 */
export class PackageDataProvider implements DataProvider {
  readonly mode = "package" as const;
  private _pool: DuckDBPool | null = null;
  private _seedReader: SeedReader | null = null;
  private _analyzer: SymbolAffectedAnalyzer | null = null;

  constructor(
    private packagePath: string,
    private memoryLimit = "256MB"
  ) {}

  private get pool(): DuckDBPool {
    if (!this._pool) throw new Error("Provider not initialized");
    return this._pool;
  }

  private get seedReader(): SeedReader {
    if (!this._seedReader) throw new Error("Provider not initialized");
    return this._seedReader;
  }

  private get analyzer(): SymbolAffectedAnalyzer {
    if (!this._analyzer) throw new Error("Provider not initialized");
    return this._analyzer;
  }

  async initialize(): Promise<void> {
    this._pool = new DuckDBPool({ memoryLimit: this.memoryLimit });
    await this._pool.initialize();

    this._seedReader = createSeedReader(this._pool, this.packagePath);
    this._analyzer = createSymbolAffectedAnalyzer(this._pool, this.packagePath, this._seedReader);
  }

  async shutdown(): Promise<void> {
    if (this._pool) {
      await this._pool.shutdown();
      this._pool = null;
    }
    this._seedReader = null;
    this._analyzer = null;
  }

  async findSymbol(name: string, kind?: string): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    let sql = `SELECT * FROM nodes WHERE name = '${name.replace(/'/g, "''")}'`;
    if (kind) {
      sql += ` AND kind = '${kind.replace(/'/g, "''")}'`;
    }

    const result = await this.seedReader.querySeeds(sql);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async getDependencies(entityId: string): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const edges = await this.seedReader.getEdgesBySource(entityId);
    return {
      rows: edges,
      rowCount: edges.length,
      timeMs: Date.now() - startTime,
    };
  }

  async getDependents(entityId: string): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const edges = await this.seedReader.getEdgesByTarget(entityId);
    return {
      rows: edges,
      rowCount: edges.length,
      timeMs: Date.now() - startTime,
    };
  }

  async getFileSymbols(filePath: string): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const sql = `SELECT * FROM nodes WHERE file_path = '${filePath.replace(/'/g, "''")}'`;
    const result = await this.seedReader.querySeeds(sql);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async getAffected(changedFiles: string[], maxDepth = 10): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const result = await this.analyzer.analyzeFileChanges(changedFiles, {}, { maxDepth });
    return {
      rows: [result],
      rowCount: 1,
      timeMs: Date.now() - startTime,
    };
  }

  async getCallGraph(
    entityId: string,
    direction: "callers" | "callees" | "both",
    maxDepth = 3
  ): Promise<ProviderQueryResult> {
    const startTime = Date.now();
    const escapedEntityId = entityId.replace(/'/g, "''");

    const results: { callers?: unknown[]; callees?: unknown[] } = {};

    if (direction === "callers" || direction === "both") {
      // Recursive CTE to find transitive callers up to maxDepth
      const sql = `
        WITH RECURSIVE caller_chain AS (
          -- Base case: direct callers
          SELECT
            e.source_entity_id,
            1 as depth,
            ARRAY[e.target_entity_id, e.source_entity_id] as path
          FROM edges e
          WHERE e.target_entity_id = '${escapedEntityId}'
          AND e.edge_type = 'CALLS'

          UNION ALL

          -- Recursive case: callers of callers
          SELECT
            e.source_entity_id,
            cc.depth + 1,
            array_append(cc.path, e.source_entity_id)
          FROM edges e
          JOIN caller_chain cc ON e.target_entity_id = cc.source_entity_id
          WHERE e.edge_type = 'CALLS'
          AND cc.depth < ${maxDepth}
          AND NOT array_contains(cc.path, e.source_entity_id)
        )
        SELECT DISTINCT
          cc.source_entity_id as entity_id,
          cc.depth,
          n.name,
          n.kind,
          n.file_path
        FROM caller_chain cc
        JOIN nodes n ON cc.source_entity_id = n.entity_id
        ORDER BY cc.depth, n.name
        LIMIT 100
      `;
      const queryResult = await this.seedReader.querySeeds(sql);
      results.callers = queryResult.rows;
    }

    if (direction === "callees" || direction === "both") {
      // Recursive CTE to find transitive callees up to maxDepth
      const sql = `
        WITH RECURSIVE call_chain AS (
          -- Base case: direct callees
          SELECT
            e.target_entity_id,
            1 as depth,
            ARRAY[e.source_entity_id, e.target_entity_id] as path
          FROM edges e
          WHERE e.source_entity_id = '${escapedEntityId}'
          AND e.edge_type = 'CALLS'

          UNION ALL

          -- Recursive case: callees of callees
          SELECT
            e.target_entity_id,
            cc.depth + 1,
            array_append(cc.path, e.target_entity_id)
          FROM edges e
          JOIN call_chain cc ON e.source_entity_id = cc.target_entity_id
          WHERE e.edge_type = 'CALLS'
          AND cc.depth < ${maxDepth}
          AND NOT array_contains(cc.path, e.target_entity_id)
        )
        SELECT DISTINCT
          cc.target_entity_id as entity_id,
          cc.depth,
          n.name,
          n.kind,
          n.file_path
        FROM call_chain cc
        JOIN nodes n ON cc.target_entity_id = n.entity_id
        ORDER BY cc.depth, n.name
        LIMIT 100
      `;
      const queryResult = await this.seedReader.querySeeds(sql);
      results.callees = queryResult.rows;
    }

    return {
      rows: [results],
      rowCount: 1,
      timeMs: Date.now() - startTime,
    };
  }

  async querySql(sql: string): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const result = await this.seedReader.querySeeds(sql);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async listRepos(): Promise<RepoListItem[]> {
    throw new Error("list_repos is only available in hub mode");
  }

  async getValidationErrors(_filter: ValidationFilter): Promise<ValidationError[]> {
    throw new Error("get_validation_errors is only available in hub mode");
  }

  async getValidationSummary(
    _groupBy: "repo" | "file" | "source" | "severity"
  ): Promise<ValidationSummary[]> {
    throw new Error("get_validation_summary is only available in hub mode");
  }

  async getValidationCounts(): Promise<{
    errors: number;
    warnings: number;
    total: number;
  }> {
    throw new Error("get_validation_counts is only available in hub mode");
  }

  async getAllDiagnostics(_filter?: DiagnosticsFilter): Promise<UnifiedDiagnostics[]> {
    throw new Error("get_all_diagnostics is only available in hub mode");
  }

  async getDiagnosticsSummary(
    _groupBy: "repo" | "source" | "severity" | "category"
  ): Promise<DiagnosticsSummary[]> {
    throw new Error("get_diagnostics_summary is only available in hub mode");
  }

  async getDiagnosticsCounts(): Promise<{
    critical: number;
    error: number;
    warning: number;
    suggestion: number;
    note: number;
    total: number;
  }> {
    throw new Error("get_diagnostics_counts is only available in hub mode");
  }

  // ================== Effects, Rules, C4 Methods (v3.0) ==================

  async queryEffects(filter?: EffectsFilter): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const conditions: string[] = [];
    if (filter?.type) {
      conditions.push(`effect_type = '${filter.type.replace(/'/g, "''")}'`);
    }
    if (filter?.file) {
      conditions.push(
        `source_file_path LIKE '%${filter.file.replace(/'/g, "''").replace(/%/g, "\\%")}%'`
      );
    }
    if (filter?.entity) {
      conditions.push(`source_entity_id = '${filter.entity.replace(/'/g, "''")}'`);
    }
    if (filter?.externalOnly) {
      conditions.push("is_external = true");
    }
    if (filter?.asyncOnly) {
      conditions.push("is_async = true");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = `LIMIT ${filter?.limit ?? 100}`;

    const sql = `SELECT * FROM effects ${whereClause} ${limitClause}`;
    const result = await this.seedReader.querySeeds(sql);

    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async runRules(options?: RunRulesOptions): Promise<RunRulesResult> {
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : "LIMIT 1000";
    const sql = `SELECT * FROM effects ${limitClause}`;
    const effectsResult = await this.seedReader.querySeeds(sql);

    const engine = createRuleEngine({ rules: builtinRules });
    const result = engine.process(effectsResult.rows as CodeEffect[]);

    let domainEffects = result.domainEffects;
    if (options?.domain) {
      domainEffects = domainEffects.filter(
        (e) => e.domain.toLowerCase() === options.domain?.toLowerCase()
      );
    }

    const runResult: RunRulesResult = {
      domainEffects,
      matchedCount: result.matchedCount,
      unmatchedCount: result.unmatchedCount,
    };

    if (options?.includeStats) {
      const ruleStats: Record<string, number> = {};
      for (const [ruleId, count] of result.ruleStats) {
        ruleStats[ruleId] = count;
      }
      runResult.ruleStats = ruleStats;
    }

    return runResult;
  }

  listRules(filter?: RulesFilter): Promise<Rule[]> {
    let rules: Rule[] = [...builtinRules];

    if (filter?.domain) {
      rules = getRulesByDomain(filter.domain);
    }

    if (filter?.provider) {
      rules = getRulesByProvider(filter.provider);
    }

    return Promise.resolve(rules);
  }

  async generateC4(options?: C4Options): Promise<C4Result> {
    // First get code effects and run rules engine to get domain effects
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : "LIMIT 1000";
    const sql = `SELECT * FROM effects ${limitClause}`;
    const effectsResult = await this.seedReader.querySeeds(sql);
    const codeEffects = effectsResult.rows as CodeEffect[];

    // Run rules engine to get domain effects
    const engine = createRuleEngine({ rules: builtinRules });
    const rulesResult = engine.process(codeEffects);
    const domainEffects = rulesResult.domainEffects;

    const level = options?.level ?? "context";
    const outputFormat = options?.outputFormat ?? "both";
    let model: unknown;
    let plantuml: string | undefined;

    switch (level) {
      case "context": {
        const context = generateC4Context(domainEffects, {
          systemName: options?.systemName ?? "System",
          systemDescription: options?.systemDescription,
        });
        model = context;
        if (outputFormat === "plantuml" || outputFormat === "both") {
          plantuml = exportContextToPlantUML(context);
        }
        break;
      }
      case "containers": {
        const containers = generateC4Containers(domainEffects, {
          systemName: options?.systemName ?? "System",
        });
        model = containers;
        if (outputFormat === "plantuml" || outputFormat === "both") {
          plantuml = exportContainersToPlantUML(containers);
        }
        break;
      }
      case "domains": {
        model = discoverDomainBoundaries(domainEffects);
        break;
      }
      case "externals": {
        // Extract externals from C4 context
        const context = generateC4Context(domainEffects, {
          systemName: options?.systemName ?? "System",
        });
        model = context.externalSystems;
        break;
      }
    }

    const result: C4Result = { level, model };
    if (plantuml && outputFormat !== "json") {
      result.plantuml = plantuml;
    }

    return result;
  }
}

/**
 * Hub Data Provider
 *
 * Provides federated data from all registered repositories.
 * Supports dual-mode operation:
 * - Server mode: Starts HubServer if no MCP is running
 * - Client mode: Uses HubClient to delegate to existing MCP server
 */
export class HubDataProvider implements DataProvider {
  readonly mode = "hub" as const;
  private _pool: DuckDBPool | null = null;
  private _hubServer: HubServer | null = null;
  private _hubClient: HubClient | null = null;
  private _isClientMode = false;

  constructor(
    private hubDir: string,
    private memoryLimit = "256MB"
  ) {}

  private get pool(): DuckDBPool {
    if (!this._pool) throw new Error("Provider not initialized");
    return this._pool;
  }

  private get hub(): CentralHub {
    const hub = this._hubServer?.getHub();
    if (!hub) throw new Error("Hub not initialized");
    return hub;
  }

  /**
   * Get the HubServer instance (for external access to IPC server)
   */
  getHubServer(): HubServer | null {
    return this._hubServer;
  }

  async initialize(): Promise<void> {
    this._pool = new DuckDBPool({ memoryLimit: this.memoryLimit });
    await this._pool.initialize();

    // Validate hub location and warn if misplaced
    const validation = await validateHubLocation(this.hubDir);
    if (!validation.valid) {
      console.error(`WARNING: ${validation.reason}`);
      if (validation.suggestedPath) {
        console.error(`Expected hub location: ${validation.suggestedPath}`);
        console.error("Run 'devac status --doctor' to diagnose and fix hub issues.");
      }
    }

    // Check if another MCP server is already running
    const client = createHubClient({ hubDir: this.hubDir });
    if (await client.isMCPRunning()) {
      // Client mode: delegate hub operations to existing server
      console.error("[MCP] Backend detected, running in client mode");
      this._hubClient = client;
      this._isClientMode = true;
    } else {
      // Server mode: start our own HubServer
      // MCP server owns the hub in read-write mode via HubServer
      // This allows CLI commands to delegate operations via IPC
      this._hubServer = createHubServer({ hubDir: this.hubDir });
      await this._hubServer.start();
    }

    // Check if hub has any registered repositories
    try {
      const repos = await this.listRepos();
      if (repos.length === 0) {
        console.error(
          "WARNING: Hub has no registered repositories.\n" +
            "Run 'devac sync' to analyze and register repositories."
        );
      }
    } catch {
      // Hub may not have tables yet - this is expected for fresh hubs
      console.error(
        "WARNING: Hub has no code graph data.\n" +
          "This may indicate you're connected to the wrong hub or it's not initialized.\n" +
          "Run 'devac sync' to analyze and register repositories."
      );
    }
  }

  async shutdown(): Promise<void> {
    // Only stop hub server if we're in server mode
    if (this._hubServer) {
      await this._hubServer.stop();
      this._hubServer = null;
    }
    // Clear client reference in client mode
    if (this._hubClient) {
      this._hubClient = null;
    }
    this._isClientMode = false;
    if (this._pool) {
      await this._pool.shutdown();
      this._pool = null;
    }
  }

  /**
   * Check if an error indicates the owner MCP server has disconnected
   */
  private isConnectionError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return (
      message.includes("ECONNREFUSED") ||
      message.includes("ENOENT") ||
      message.includes("IPC timeout") ||
      message.includes("connect ENOENT")
    );
  }

  /**
   * Promote from client mode to server mode when owner MCP shuts down
   */
  private async promoteToServer(): Promise<void> {
    if (!this._isClientMode) return; // Already a server

    console.error("[MCP] Backend disconnected, promoting to server mode...");

    // Close client connection
    this._hubClient = null;

    // Try to start as server
    try {
      this._hubServer = createHubServer({ hubDir: this.hubDir });
      await this._hubServer.start();
      this._isClientMode = false;
      console.error("[MCP] Successfully promoted to server mode");
    } catch {
      // Another client may have won the race - stay in client mode and retry
      console.error(
        "[MCP] Promotion failed (another process may have promoted), staying in client mode"
      );
      this._hubClient = createHubClient({ hubDir: this.hubDir });
    }
  }

  /**
   * Route hub operations based on current mode (server vs client)
   * Handles auto-promotion if owner MCP server shuts down
   */
  private async hubOperation<T>(
    serverOperation: (hub: CentralHub) => Promise<T>,
    clientOperation: (client: HubClient) => Promise<T>
  ): Promise<T> {
    if (this._isClientMode && this._hubClient) {
      try {
        return await clientOperation(this._hubClient);
      } catch (err) {
        // Check if this is a connection error (owner died)
        if (this.isConnectionError(err)) {
          await this.promoteToServer();
          // Retry after promotion
          return this.hubOperation(serverOperation, clientOperation);
        }
        throw err;
      }
    }
    return serverOperation(this.hub);
  }

  /**
   * Get all package paths from registered repos by reading manifests
   */
  private async getPackagePaths(): Promise<string[]> {
    const repos = await this.hubOperation(
      async (hub) => hub.listRepos(),
      async (client) => client.listRepos()
    );

    const packagePaths: string[] = [];

    for (const repo of repos) {
      try {
        const manifestPath = path.join(repo.localPath, ".devac", "manifest.json");
        const content = await fs.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(content) as RepositoryManifest;

        for (const pkg of manifest.packages) {
          // pkg.path is relative to repo root (e.g., "packages/devac-cli" or ".")
          // We need the absolute package path where .devac/seed/ exists
          const pkgPath = pkg.path === "." ? repo.localPath : path.join(repo.localPath, pkg.path);
          packagePaths.push(pkgPath);
        }
      } catch {
        // Skip repos with unreadable manifests
      }
    }

    return packagePaths;
  }

  async findSymbol(name: string, kind?: string): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return { rows: [], rowCount: 0, timeMs: Date.now() - startTime };
    }

    let sql = `SELECT * FROM {nodes} WHERE name = '${name.replace(/'/g, "''")}'`;
    if (kind) {
      sql += ` AND kind = '${kind.replace(/'/g, "''")}'`;
    }

    const result = await queryMultiplePackages(this.pool, packagePaths, sql);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async getDependencies(entityId: string): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return { rows: [], rowCount: 0, timeMs: Date.now() - startTime };
    }

    const sql = `SELECT * FROM {edges} WHERE source_entity_id = '${entityId.replace(/'/g, "''")}'`;
    const result = await queryMultiplePackages(this.pool, packagePaths, sql);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async getDependents(entityId: string): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return { rows: [], rowCount: 0, timeMs: Date.now() - startTime };
    }

    const sql = `SELECT * FROM {edges} WHERE target_entity_id = '${entityId.replace(/'/g, "''")}'`;
    const result = await queryMultiplePackages(this.pool, packagePaths, sql);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async getFileSymbols(filePath: string): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return { rows: [], rowCount: 0, timeMs: Date.now() - startTime };
    }

    const sql = `SELECT * FROM {nodes} WHERE file_path = '${filePath.replace(/'/g, "''")}'`;
    const result = await queryMultiplePackages(this.pool, packagePaths, sql);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async getAffected(changedFiles: string[], _maxDepth = 10): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    // For hub mode, we use the CentralHub's getAffectedRepos
    // First, we need to find entity IDs from the changed files
    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return { rows: [], rowCount: 0, timeMs: Date.now() - startTime };
    }

    // Find entity IDs from changed files
    const fileList = changedFiles.map((f) => `'${f.replace(/'/g, "''")}'`).join(", ");
    const sql = `SELECT entity_id FROM {nodes} WHERE source_file IN (${fileList})`;
    const nodeResult = await queryMultiplePackages<{ entity_id: string }>(
      this.pool,
      packagePaths,
      sql
    );

    const entityIds = nodeResult.rows.map((r) => r.entity_id);
    if (entityIds.length === 0) {
      return { rows: [], rowCount: 0, timeMs: Date.now() - startTime };
    }

    // getAffectedRepos is not available via HubClient IPC
    // In client mode, we can't perform this operation
    if (this._isClientMode) {
      return {
        rows: [],
        rowCount: 0,
        timeMs: Date.now() - startTime,
      };
    }

    const result = await this.hub.getAffectedRepos(entityIds);
    return {
      rows: [result],
      rowCount: 1,
      timeMs: Date.now() - startTime,
    };
  }

  async getCallGraph(
    entityId: string,
    direction: "callers" | "callees" | "both",
    maxDepth = 3
  ): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return { rows: [], rowCount: 0, timeMs: Date.now() - startTime };
    }

    const escapedEntityId = entityId.replace(/'/g, "''");
    const results: { callers?: unknown[]; callees?: unknown[] } = {};

    if (direction === "callers" || direction === "both") {
      // Recursive CTE to find transitive callers up to maxDepth
      const sql = `
        WITH RECURSIVE caller_chain AS (
          -- Base case: direct callers
          SELECT
            e.source_entity_id,
            1 as depth,
            ARRAY[e.target_entity_id, e.source_entity_id] as path
          FROM {edges} e
          WHERE e.target_entity_id = '${escapedEntityId}'
          AND e.edge_type = 'CALLS'

          UNION ALL

          -- Recursive case: callers of callers
          SELECT
            e.source_entity_id,
            cc.depth + 1,
            array_append(cc.path, e.source_entity_id)
          FROM {edges} e
          JOIN caller_chain cc ON e.target_entity_id = cc.source_entity_id
          WHERE e.edge_type = 'CALLS'
          AND cc.depth < ${maxDepth}
          AND NOT array_contains(cc.path, e.source_entity_id)
        )
        SELECT DISTINCT
          cc.source_entity_id as entity_id,
          cc.depth,
          n.name,
          n.kind,
          n.file_path
        FROM caller_chain cc
        JOIN {nodes} n ON cc.source_entity_id = n.entity_id
        ORDER BY cc.depth, n.name
        LIMIT 100
      `;
      const queryResult = await queryMultiplePackages(this.pool, packagePaths, sql);
      results.callers = queryResult.rows;
    }

    if (direction === "callees" || direction === "both") {
      // Recursive CTE to find transitive callees up to maxDepth
      const sql = `
        WITH RECURSIVE call_chain AS (
          -- Base case: direct callees
          SELECT
            e.target_entity_id,
            1 as depth,
            ARRAY[e.source_entity_id, e.target_entity_id] as path
          FROM {edges} e
          WHERE e.source_entity_id = '${escapedEntityId}'
          AND e.edge_type = 'CALLS'

          UNION ALL

          -- Recursive case: callees of callees
          SELECT
            e.target_entity_id,
            cc.depth + 1,
            array_append(cc.path, e.target_entity_id)
          FROM {edges} e
          JOIN call_chain cc ON e.source_entity_id = cc.target_entity_id
          WHERE e.edge_type = 'CALLS'
          AND cc.depth < ${maxDepth}
          AND NOT array_contains(cc.path, e.target_entity_id)
        )
        SELECT DISTINCT
          cc.target_entity_id as entity_id,
          cc.depth,
          n.name,
          n.kind,
          n.file_path
        FROM call_chain cc
        JOIN {nodes} n ON cc.target_entity_id = n.entity_id
        ORDER BY cc.depth, n.name
        LIMIT 100
      `;
      const queryResult = await queryMultiplePackages(this.pool, packagePaths, sql);
      results.callees = queryResult.rows;
    }

    return {
      rows: [results],
      rowCount: 1,
      timeMs: Date.now() - startTime,
    };
  }

  async querySql(sql: string): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return { rows: [], rowCount: 0, timeMs: Date.now() - startTime };
    }

    // Replace table references with placeholders for multi-package query
    const processedSql = sql
      .replace(/\bFROM\s+nodes\b/gi, "FROM {nodes}")
      .replace(/\bFROM\s+edges\b/gi, "FROM {edges}")
      .replace(/\bFROM\s+external_refs\b/gi, "FROM {external_refs}")
      .replace(/\bFROM\s+effects\b/gi, "FROM {effects}")
      .replace(/\bJOIN\s+nodes\b/gi, "JOIN {nodes}")
      .replace(/\bJOIN\s+edges\b/gi, "JOIN {edges}")
      .replace(/\bJOIN\s+external_refs\b/gi, "JOIN {external_refs}")
      .replace(/\bJOIN\s+effects\b/gi, "JOIN {effects}");

    const result = await queryMultiplePackages(this.pool, packagePaths, processedSql);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async listRepos(): Promise<RepoListItem[]> {
    const repos = await this.hubOperation(
      async (hub) => hub.listRepos(),
      async (client) => client.listRepos()
    );
    return repos.map((repo) => ({
      repoId: repo.repoId,
      localPath: repo.localPath,
      packages: repo.packages,
      status: repo.status,
      lastSynced: repo.lastSynced,
    }));
  }

  async getValidationErrors(filter: ValidationFilter): Promise<ValidationError[]> {
    return this.hubOperation(
      async (hub) => hub.getValidationErrors(filter),
      async (client) => client.getValidationErrors(filter)
    );
  }

  async getValidationSummary(
    groupBy: "repo" | "file" | "source" | "severity"
  ): Promise<ValidationSummary[]> {
    return this.hubOperation(
      async (hub) => hub.getValidationSummary(groupBy),
      async (client) => client.getValidationSummary(groupBy)
    );
  }

  async getValidationCounts(): Promise<{
    errors: number;
    warnings: number;
    total: number;
  }> {
    return this.hubOperation(
      async (hub) => hub.getValidationCounts(),
      async (client) => client.getValidationCounts()
    );
  }

  // ================== Unified Diagnostics Methods ==================

  async getAllDiagnostics(filter?: DiagnosticsFilter): Promise<UnifiedDiagnostics[]> {
    return this.hubOperation(
      async (hub) => hub.getDiagnostics(filter),
      async (client) => client.getDiagnostics(filter)
    );
  }

  async getDiagnosticsSummary(
    groupBy: "repo" | "source" | "severity" | "category"
  ): Promise<DiagnosticsSummary[]> {
    return this.hubOperation(
      async (hub) => hub.getDiagnosticsSummary(groupBy),
      async (client) => client.getDiagnosticsSummary(groupBy)
    );
  }

  async getDiagnosticsCounts(): Promise<{
    critical: number;
    error: number;
    warning: number;
    suggestion: number;
    note: number;
    total: number;
  }> {
    return this.hubOperation(
      async (hub) => hub.getDiagnosticsCounts(),
      async (client) => client.getDiagnosticsCounts()
    );
  }

  // ================== Effects, Rules, C4 Methods (v3.0) ==================

  async queryEffects(filter?: EffectsFilter): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return { rows: [], rowCount: 0, timeMs: Date.now() - startTime };
    }

    const conditions: string[] = [];
    if (filter?.type) {
      conditions.push(`effect_type = '${filter.type.replace(/'/g, "''")}'`);
    }
    if (filter?.file) {
      conditions.push(
        `source_file_path LIKE '%${filter.file.replace(/'/g, "''").replace(/%/g, "\\%")}%'`
      );
    }
    if (filter?.entity) {
      conditions.push(`source_entity_id = '${filter.entity.replace(/'/g, "''")}'`);
    }
    if (filter?.externalOnly) {
      conditions.push("is_external = true");
    }
    if (filter?.asyncOnly) {
      conditions.push("is_async = true");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = `LIMIT ${filter?.limit ?? 100}`;

    const sql = `SELECT * FROM {effects} ${whereClause} ${limitClause}`;
    const result = await queryMultiplePackages(this.pool, packagePaths, sql);

    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async runRules(options?: RunRulesOptions): Promise<RunRulesResult> {
    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return {
        domainEffects: [],
        matchedCount: 0,
        unmatchedCount: 0,
      };
    }

    const limitClause = options?.limit ? `LIMIT ${options.limit}` : "LIMIT 1000";
    const sql = `SELECT * FROM {effects} ${limitClause}`;
    const effectsResult = await queryMultiplePackages(this.pool, packagePaths, sql);

    const engine = createRuleEngine({ rules: builtinRules });
    const result = engine.process(effectsResult.rows as CodeEffect[]);

    let domainEffects = result.domainEffects;
    if (options?.domain) {
      domainEffects = domainEffects.filter(
        (e) => e.domain.toLowerCase() === options.domain?.toLowerCase()
      );
    }

    const runResult: RunRulesResult = {
      domainEffects,
      matchedCount: result.matchedCount,
      unmatchedCount: result.unmatchedCount,
    };

    if (options?.includeStats) {
      const ruleStats: Record<string, number> = {};
      for (const [ruleId, count] of result.ruleStats) {
        ruleStats[ruleId] = count;
      }
      runResult.ruleStats = ruleStats;
    }

    return runResult;
  }

  listRules(filter?: RulesFilter): Promise<Rule[]> {
    let rules: Rule[] = [...builtinRules];

    if (filter?.domain) {
      rules = getRulesByDomain(filter.domain);
    }

    if (filter?.provider) {
      rules = getRulesByProvider(filter.provider);
    }

    return Promise.resolve(rules);
  }

  async generateC4(options?: C4Options): Promise<C4Result> {
    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return {
        level: options?.level ?? "context",
        model: {},
      };
    }

    // First get code effects
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : "LIMIT 1000";
    const sql = `SELECT * FROM {effects} ${limitClause}`;
    const effectsResult = await queryMultiplePackages(this.pool, packagePaths, sql);
    const codeEffects = effectsResult.rows as CodeEffect[];

    // Run rules engine to get domain effects
    const engine = createRuleEngine({ rules: builtinRules });
    const rulesResult = engine.process(codeEffects);
    const domainEffects = rulesResult.domainEffects;

    const level = options?.level ?? "context";
    const outputFormat = options?.outputFormat ?? "both";
    let model: unknown;
    let plantuml: string | undefined;

    switch (level) {
      case "context": {
        const context = generateC4Context(domainEffects, {
          systemName: options?.systemName ?? "System",
          systemDescription: options?.systemDescription,
        });
        model = context;
        if (outputFormat === "plantuml" || outputFormat === "both") {
          plantuml = exportContextToPlantUML(context);
        }
        break;
      }
      case "containers": {
        const containers = generateC4Containers(domainEffects, {
          systemName: options?.systemName ?? "System",
        });
        model = containers;
        if (outputFormat === "plantuml" || outputFormat === "both") {
          plantuml = exportContainersToPlantUML(containers);
        }
        break;
      }
      case "domains": {
        model = discoverDomainBoundaries(domainEffects);
        break;
      }
      case "externals": {
        // Extract externals from C4 context
        const context = generateC4Context(domainEffects, {
          systemName: options?.systemName ?? "System",
        });
        model = context.externalSystems;
        break;
      }
    }

    const result: C4Result = { level, model };
    if (plantuml && outputFormat !== "json") {
      result.plantuml = plantuml;
    }

    return result;
  }
}

/**
 * Create a data provider based on mode
 *
 * In hub mode, if hubDir is not provided, it will be auto-detected from the
 * current working directory by finding the workspace root.
 */
export async function createDataProvider(
  mode: "package" | "hub",
  options: {
    packagePath?: string;
    hubDir?: string;
    memoryLimit?: string;
  }
): Promise<DataProvider> {
  if (mode === "package") {
    if (!options.packagePath) {
      throw new Error("packagePath is required in package mode");
    }
    return new PackageDataProvider(options.packagePath, options.memoryLimit);
  }

  // Hub mode: discover workspace hub dir if not provided
  let hubDir = options.hubDir;
  if (!hubDir) {
    const discoveredHubDir = await findWorkspaceHubDir();
    if (!discoveredHubDir) {
      throw new Error(
        "Could not find workspace hub.\n" +
          "Make sure you're running from within a workspace (directory containing git repos)\n" +
          "or from within a git repository that's part of a workspace."
      );
    }
    hubDir = discoveredHubDir;
  }

  return new HubDataProvider(hubDir, options.memoryLimit);
}
