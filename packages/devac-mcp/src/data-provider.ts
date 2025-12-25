/**
 * Data Provider Abstraction
 *
 * Provides a unified interface for querying code graph data
 * in both package mode (single package) and hub mode (federated).
 */

import * as os from "node:os";
import * as path from "node:path";
import {
  type CentralHub,
  type DiagnosticsFilter,
  type DiagnosticsSummary,
  DuckDBPool,
  type SeedReader,
  type SymbolAffectedAnalyzer,
  type UnifiedDiagnostics,
  type ValidationError,
  type ValidationFilter,
  type ValidationSummary,
  createCentralHub,
  createSeedReader,
  createSymbolAffectedAnalyzer,
  queryMultiplePackages,
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

    const sql = `SELECT * FROM nodes WHERE source_file = '${filePath.replace(/'/g, "''")}'`;
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
    _maxDepth = 3
  ): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const results: { callers?: unknown[]; callees?: unknown[] } = {};

    if (direction === "callers" || direction === "both") {
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
}

/**
 * Hub Data Provider
 *
 * Provides federated data from all registered repositories.
 */
export class HubDataProvider implements DataProvider {
  readonly mode = "hub" as const;
  private _pool: DuckDBPool | null = null;
  private _hub: CentralHub | null = null;

  constructor(
    private hubDir: string = path.join(os.homedir(), ".devac"),
    private memoryLimit = "256MB"
  ) {}

  private get pool(): DuckDBPool {
    if (!this._pool) throw new Error("Provider not initialized");
    return this._pool;
  }

  private get hub(): CentralHub {
    if (!this._hub) throw new Error("Provider not initialized");
    return this._hub;
  }

  async initialize(): Promise<void> {
    this._pool = new DuckDBPool({ memoryLimit: this.memoryLimit });
    await this._pool.initialize();

    this._hub = createCentralHub({ hubDir: this.hubDir });
    await this._hub.init();
  }

  async shutdown(): Promise<void> {
    if (this._hub) {
      await this._hub.close();
      this._hub = null;
    }
    if (this._pool) {
      await this._pool.shutdown();
      this._pool = null;
    }
  }

  /**
   * Get all package paths from registered repos
   */
  private async getPackagePaths(): Promise<string[]> {
    const repos = await this.hub.listRepos();
    // For now, return the repo paths as package paths
    // In a full implementation, we'd read manifests to get actual package paths
    return repos.map((r) => r.localPath);
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

    const sql = `SELECT * FROM {nodes} WHERE source_file = '${filePath.replace(/'/g, "''")}'`;
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
    _maxDepth = 3
  ): Promise<ProviderQueryResult> {
    const startTime = Date.now();

    const packagePaths = await this.getPackagePaths();
    if (packagePaths.length === 0) {
      return { rows: [], rowCount: 0, timeMs: Date.now() - startTime };
    }

    const results: { callers?: unknown[]; callees?: unknown[] } = {};

    if (direction === "callers" || direction === "both") {
      const sql = `
        SELECT e.*, n.name, n.kind, n.source_file
        FROM {edges} e
        JOIN {nodes} n ON e.source_entity_id = n.entity_id
        WHERE e.target_entity_id = '${entityId.replace(/'/g, "''")}'
        AND e.edge_type = 'CALLS'
        LIMIT 100
      `;
      const queryResult = await queryMultiplePackages(this.pool, packagePaths, sql);
      results.callers = queryResult.rows;
    }

    if (direction === "callees" || direction === "both") {
      const sql = `
        SELECT e.*, n.name, n.kind, n.source_file
        FROM {edges} e
        JOIN {nodes} n ON e.target_entity_id = n.entity_id
        WHERE e.source_entity_id = '${entityId.replace(/'/g, "''")}'
        AND e.edge_type = 'CALLS'
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
      .replace(/\bJOIN\s+nodes\b/gi, "JOIN {nodes}")
      .replace(/\bJOIN\s+edges\b/gi, "JOIN {edges}")
      .replace(/\bJOIN\s+external_refs\b/gi, "JOIN {external_refs}");

    const result = await queryMultiplePackages(this.pool, packagePaths, processedSql);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      timeMs: Date.now() - startTime,
    };
  }

  async listRepos(): Promise<RepoListItem[]> {
    const repos = await this.hub.listRepos();
    return repos.map((repo) => ({
      repoId: repo.repoId,
      localPath: repo.localPath,
      packages: repo.packages,
      status: repo.status,
      lastSynced: repo.lastSynced,
    }));
  }

  async getValidationErrors(filter: ValidationFilter): Promise<ValidationError[]> {
    return await this.hub.getValidationErrors(filter);
  }

  async getValidationSummary(
    groupBy: "repo" | "file" | "source" | "severity"
  ): Promise<ValidationSummary[]> {
    return await this.hub.getValidationSummary(groupBy);
  }

  async getValidationCounts(): Promise<{
    errors: number;
    warnings: number;
    total: number;
  }> {
    return await this.hub.getValidationCounts();
  }

  // ================== Unified Diagnostics Methods ==================

  async getAllDiagnostics(filter?: DiagnosticsFilter): Promise<UnifiedDiagnostics[]> {
    return await this.hub.getDiagnostics(filter);
  }

  async getDiagnosticsSummary(
    groupBy: "repo" | "source" | "severity" | "category"
  ): Promise<DiagnosticsSummary[]> {
    return await this.hub.getDiagnosticsSummary(groupBy);
  }

  async getDiagnosticsCounts(): Promise<{
    critical: number;
    error: number;
    warning: number;
    suggestion: number;
    note: number;
    total: number;
  }> {
    return await this.hub.getDiagnosticsCounts();
  }
}

/**
 * Create a data provider based on mode
 */
export function createDataProvider(
  mode: "package" | "hub",
  options: {
    packagePath?: string;
    hubDir?: string;
    memoryLimit?: string;
  }
): DataProvider {
  if (mode === "package") {
    if (!options.packagePath) {
      throw new Error("packagePath is required in package mode");
    }
    return new PackageDataProvider(options.packagePath, options.memoryLimit);
  }
  return new HubDataProvider(options.hubDir, options.memoryLimit);
}
