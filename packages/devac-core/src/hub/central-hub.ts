/**
 * Central Hub Implementation
 *
 * Main orchestration class for the federation hub.
 * Based on DevAC v2.0 spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Database } from "duckdb-async";
import { computeStringHash } from "../utils/hash.js";
import { validateHubLocation } from "../workspace/discover.js";
import {
  type CrossRepoEdge,
  type DiagnosticsCategory,
  type DiagnosticsFilter,
  type DiagnosticsSeverity,
  type DiagnosticsSource,
  type DiagnosticsSummary,
  type HubStorage,
  type RepoRegistration,
  type UnifiedDiagnostics,
  type ValidationError,
  type ValidationFilter,
  type ValidationSummary,
  createHubStorage,
} from "./hub-storage.js";
import {
  type ManifestGenerator,
  type RepositoryManifest,
  createManifestGenerator,
} from "./manifest-generator.js";

/**
 * Hub initialization options
 */
export interface HubInitOptions {
  force?: boolean;
  /** Skip hub location validation (for tests only) */
  skipValidation?: boolean;
}

/**
 * Repository registration result
 */
export interface RepoRegistrationResult {
  repoId: string;
  packages: number;
  crossRepoEdges: number;
}

/**
 * Hub status information
 */
export interface HubStatus {
  hubPath: string;
  repoCount: number;
  totalPackages: number;
  crossRepoEdges: number;
  cacheSize: number;
  lastSync: string | null;
}

/**
 * Refresh result
 */
export interface RefreshResult {
  reposRefreshed: number;
  packagesUpdated: number;
  edgesUpdated: number;
  errors: string[];
}

/**
 * Affected analysis result
 */
export interface AffectedResult {
  changedEntities: string[];
  affectedRepos: AffectedRepo[];
  totalAffected: number;
  analysisTimeMs: number;
}

/**
 * Affected repository information
 */
export interface AffectedRepo {
  repoId: string;
  localPath: string;
  affectedEntities: string[];
  impactLevel: "direct" | "transitive";
}

/**
 * Query result
 */
export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  timeMs: number;
}

/**
 * M2M (machine-to-machine) connection between services
 */
export interface M2MConnection {
  /** Source repo making the call */
  sourceRepo: string;
  /** Source entity (function) making the call */
  sourceEntityId: string;
  /** Source file path */
  sourceFile: string;
  /** Source line number */
  sourceLine: number;
  /** HTTP method (GET, POST, etc.) */
  method: string | null;
  /** URL pattern being called */
  urlPattern: string;
  /** Target service name (extracted from URL) */
  targetService: string | null;
  /** Target repo (if matched) */
  targetRepo: string | null;
  /** Target entity (API handler, if matched) */
  targetEntityId: string | null;
  /** Target route pattern (if matched) */
  targetRoute: string | null;
}

/**
 * M2M query result
 */
export interface M2MQueryResult {
  connections: M2MConnection[];
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
  timeMs: number;
}

/**
 * Repository info for listing
 */
export interface RepoInfo {
  repoId: string;
  localPath: string;
  packages: number;
  status: "active" | "stale" | "missing";
  lastSynced: string;
}

/**
 * Central Hub options
 */
export interface CentralHubOptions {
  hubDir: string;
  /** Open hub in read-only mode (prevents lock conflicts, auto-fallback if lock error) */
  readOnly?: boolean;
}

/**
 * Central Hub
 *
 * Main class for managing the federation hub.
 */
export class CentralHub {
  private storage: HubStorage;
  private manifestGenerator: ManifestGenerator;
  private hubPath: string;
  private initialized = false;
  private lastSyncTime: string | null = null;
  private _readOnlyMode = false;

  constructor(private options: CentralHubOptions) {
    this.hubPath = path.join(options.hubDir, "central.duckdb");
    this.storage = createHubStorage(this.hubPath);
    this.manifestGenerator = createManifestGenerator();
  }

  /**
   * Check if hub is in read-only mode
   */
  get isReadOnly(): boolean {
    return this._readOnlyMode;
  }

  /**
   * Initialize the hub
   */
  async init(options: HubInitOptions = {}): Promise<void> {
    const { force = false, skipValidation = false } = options;
    const readOnly = this.options.readOnly ?? false;

    // Validate hub location before creating/opening
    // Only validate when NOT in read-only mode (we allow reading from any hub)
    // and when not explicitly skipped (for tests)
    if (!readOnly && !skipValidation) {
      const validation = await validateHubLocation(this.options.hubDir);
      if (!validation.valid) {
        const suggestion = validation.suggestedPath
          ? `\n\nCorrect hub location: ${validation.suggestedPath}`
          : "";
        throw new Error(`Invalid hub location: ${validation.reason}${suggestion}`);
      }
    }

    if (force && !readOnly) {
      // Remove existing hub
      try {
        await fs.rm(this.hubPath, { force: true });
      } catch {
        // Ignore if doesn't exist
      }
    }

    try {
      await this.storage.init({ readOnly });
      this._readOnlyMode = readOnly;
    } catch (err) {
      // If write mode failed due to lock, auto-fallback to read-only
      if (!readOnly && this.isLockError(err)) {
        await this.storage.init({ readOnly: true });
        this._readOnlyMode = true;
      } else {
        throw err;
      }
    }

    this.initialized = true;
  }

  /**
   * Check if an error is a DuckDB lock error
   */
  private isLockError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes("locked") || msg.includes("Conflicting lock") || msg.includes("lock on file")
    );
  }

  /**
   * Close the hub
   */
  async close(): Promise<void> {
    await this.storage.close();
    this.initialized = false;
  }

  /**
   * Register a repository with the hub
   */
  async registerRepo(repoPath: string): Promise<RepoRegistrationResult> {
    this.ensureInitialized();

    // Check if repo has seed data
    const hasSeed = await this.repoHasSeeds(repoPath);
    if (!hasSeed) {
      throw new Error(
        `Repository at ${repoPath} has no .devac/seed/ directory. Run 'devac analyze' first.`
      );
    }

    // Generate or update manifest
    const manifest = await this.manifestGenerator.generate(repoPath);

    // Check if already registered
    const _existingRepo = await this.storage.getRepo(manifest.repo_id);

    // Register with storage
    const registration: RepoRegistration = {
      repo_id: manifest.repo_id,
      local_path: path.resolve(repoPath),
      manifest_hash: computeStringHash(JSON.stringify(manifest)),
      last_synced: new Date().toISOString(),
      status: "active",
    };

    await this.storage.addRepo(registration);

    // Extract and store cross-repo edges
    const crossRepoEdges = await this.extractCrossRepoEdges(repoPath, manifest);
    if (crossRepoEdges.length > 0) {
      // Remove old edges first
      await this.storage.removeCrossRepoEdges(manifest.repo_id);
      await this.storage.addCrossRepoEdges(crossRepoEdges);
    }

    // Clear query cache since we have new data
    await this.storage.clearCache();

    return {
      repoId: manifest.repo_id,
      packages: manifest.packages.length,
      crossRepoEdges: crossRepoEdges.length,
    };
  }

  /**
   * Unregister a repository
   */
  async unregisterRepo(repoId: string): Promise<void> {
    this.ensureInitialized();

    await this.storage.removeCrossRepoEdges(repoId);
    await this.storage.removeRepo(repoId);
    await this.storage.clearCache();
  }

  /**
   * List all registered repositories
   */
  async listRepos(): Promise<RepoInfo[]> {
    this.ensureInitialized();

    const registrations = await this.storage.listRepos();
    const repoInfos: RepoInfo[] = [];

    for (const reg of registrations) {
      // Get package count from manifest
      let packageCount = 0;
      try {
        const manifestPath = path.join(reg.local_path, ".devac", "manifest.json");
        const content = await fs.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(content) as RepositoryManifest;
        packageCount = manifest.packages.length;
      } catch {
        // Manifest not readable
      }

      repoInfos.push({
        repoId: reg.repo_id,
        localPath: reg.local_path,
        packages: packageCount,
        status: reg.status as "active" | "stale" | "missing",
        lastSynced: reg.last_synced,
      });
    }

    return repoInfos;
  }

  /**
   * Refresh a single repository
   */
  async refreshRepo(repoId: string): Promise<RefreshResult> {
    this.ensureInitialized();

    const repo = await this.storage.getRepo(repoId);
    if (!repo) {
      return {
        reposRefreshed: 0,
        packagesUpdated: 0,
        edgesUpdated: 0,
        errors: [`Repository ${repoId} not found`],
      };
    }

    // Validate repository path exists before attempting refresh
    const pathExists = await this.pathExists(repo.local_path);
    if (!pathExists) {
      return {
        reposRefreshed: 0,
        packagesUpdated: 0,
        edgesUpdated: 0,
        errors: [`Repository path does not exist: ${repo.local_path}`],
      };
    }

    try {
      // Regenerate manifest
      const manifest = await this.manifestGenerator.generate(repo.local_path);

      // Update registration
      await this.storage.updateRepoSync(repoId, computeStringHash(JSON.stringify(manifest)));

      // Update cross-repo edges
      const edges = await this.extractCrossRepoEdges(repo.local_path, manifest);
      await this.storage.removeCrossRepoEdges(repoId);
      if (edges.length > 0) {
        await this.storage.addCrossRepoEdges(edges);
      }

      // Clear cache
      await this.storage.clearCache();

      this.lastSyncTime = new Date().toISOString();

      return {
        reposRefreshed: 1,
        packagesUpdated: manifest.packages.length,
        edgesUpdated: edges.length,
        errors: [],
      };
    } catch (error) {
      return {
        reposRefreshed: 0,
        packagesUpdated: 0,
        edgesUpdated: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Refresh all repositories
   */
  async refreshAll(): Promise<RefreshResult> {
    this.ensureInitialized();

    const repos = await this.storage.listRepos();
    let totalRefreshed = 0;
    let totalPackages = 0;
    let totalEdges = 0;
    const allErrors: string[] = [];

    for (const repo of repos) {
      const result = await this.refreshRepo(repo.repo_id);
      totalRefreshed += result.reposRefreshed;
      totalPackages += result.packagesUpdated;
      totalEdges += result.edgesUpdated;
      allErrors.push(...result.errors);
    }

    return {
      reposRefreshed: totalRefreshed,
      packagesUpdated: totalPackages,
      edgesUpdated: totalEdges,
      errors: allErrors,
    };
  }

  /**
   * Get hub status
   */
  async getStatus(): Promise<HubStatus> {
    this.ensureInitialized();

    const repos = await this.listRepos();
    const totalPackages = repos.reduce((sum, r) => sum + r.packages, 0);

    // Count cross-repo edges (simplified - would need a method on storage)
    let crossRepoEdges = 0;
    try {
      // This is a workaround - we'd ideally have a count method on storage
      crossRepoEdges = 0; // Would need to implement edge counting
    } catch {
      // Ignore
    }

    return {
      hubPath: this.hubPath,
      repoCount: repos.length,
      totalPackages,
      crossRepoEdges,
      cacheSize: 0, // Cache is cleared on operations, so typically 0
      lastSync: this.lastSyncTime,
    };
  }

  /**
   * Sync hub state with filesystem
   */
  async sync(): Promise<void> {
    this.ensureInitialized();

    const repos = await this.storage.listRepos();

    for (const repo of repos) {
      // Check if repo path still exists
      const exists = await this.pathExists(repo.local_path);

      if (!exists) {
        // Mark as missing
        const updated: RepoRegistration = {
          ...repo,
          status: "missing",
        };
        await this.storage.addRepo(updated);
      }
    }

    this.lastSyncTime = new Date().toISOString();
  }

  /**
   * Execute a query across registered repositories
   *
   * The SQL can reference tables directly (nodes, edges, external_refs, effects)
   * which are created as views pointing to all seed parquet files.
   *
   * Also supports placeholders for explicit control:
   * - {nodes} - union of all nodes.parquet files
   * - {edges} - union of all edges.parquet files
   * - {external_refs} - union of all external_refs.parquet files
   * - {effects} - union of all effects.parquet files (only those that exist)
   */
  async query(sql: string): Promise<QueryResult> {
    this.ensureInitialized();

    const startTime = Date.now();

    // Check cache
    const queryHash = computeStringHash(sql);
    const cached = await this.storage.getCachedQuery(queryHash);
    if (cached) {
      return cached as unknown as QueryResult;
    }

    // Get all registered repos and their packages
    const repos = await this.storage.listRepos();
    const nodePaths: string[] = [];
    const edgePaths: string[] = [];
    const refPaths: string[] = [];
    const effectsPaths: string[] = [];

    for (const repo of repos) {
      const manifest = await this.loadManifest(repo.local_path);
      if (!manifest) continue;

      for (const pkg of manifest.packages) {
        const seedPath = path.join(repo.local_path, pkg.seed_path);

        // Check which parquet files exist for this package
        const nodesFile = path.join(seedPath, "nodes.parquet");
        const edgesFile = path.join(seedPath, "edges.parquet");
        const refsFile = path.join(seedPath, "external_refs.parquet");
        const effectsFile = path.join(seedPath, "effects.parquet");

        // Only add paths that exist
        if (await this.pathExists(nodesFile)) {
          nodePaths.push(`'${nodesFile.replace(/'/g, "''")}'`);
        }
        if (await this.pathExists(edgesFile)) {
          edgePaths.push(`'${edgesFile.replace(/'/g, "''")}'`);
        }
        if (await this.pathExists(refsFile)) {
          refPaths.push(`'${refsFile.replace(/'/g, "''")}'`);
        }
        if (await this.pathExists(effectsFile)) {
          effectsPaths.push(`'${effectsFile.replace(/'/g, "''")}'`);
        }
      }
    }

    // Execute query with views created for seed tables
    const db = await Database.create(":memory:");
    try {
      // Create views for each table type (silently ignore if no files)
      if (nodePaths.length > 0) {
        try {
          await db.run(
            `CREATE OR REPLACE VIEW nodes AS SELECT * FROM read_parquet([${nodePaths.join(", ")}], union_by_name=true, filename=true)`
          );
        } catch {
          // Some files may not exist or have schema issues
        }
      }

      if (edgePaths.length > 0) {
        try {
          await db.run(
            `CREATE OR REPLACE VIEW edges AS SELECT * FROM read_parquet([${edgePaths.join(", ")}], union_by_name=true, filename=true)`
          );
        } catch {
          // Some files may not exist or have schema issues
        }
      }

      if (refPaths.length > 0) {
        try {
          await db.run(
            `CREATE OR REPLACE VIEW external_refs AS SELECT * FROM read_parquet([${refPaths.join(", ")}], union_by_name=true, filename=true)`
          );
        } catch {
          // Some files may not exist or have schema issues
        }
      }

      if (effectsPaths.length > 0) {
        try {
          await db.run(
            `CREATE OR REPLACE VIEW effects AS SELECT * FROM read_parquet([${effectsPaths.join(", ")}], union_by_name=true, filename=true)`
          );
        } catch {
          // Effects files may not exist yet - this is expected until parsers emit effects
        }
      }

      // Also support placeholder syntax for explicit control
      const buildReadParquet = (paths: string[]): string => {
        if (paths.length === 0) {
          return "(SELECT NULL as _empty WHERE 1=0)";
        }
        return `read_parquet([${paths.join(", ")}], union_by_name=true, filename=true)`;
      };

      const processedSql = sql
        .replace(/{nodes}/g, buildReadParquet(nodePaths))
        .replace(/{edges}/g, buildReadParquet(edgePaths))
        .replace(/{external_refs}/g, buildReadParquet(refPaths))
        .replace(/{effects}/g, buildReadParquet(effectsPaths));

      const rows = await db.all(processedSql);
      const result: QueryResult = {
        rows: rows as Record<string, unknown>[],
        rowCount: rows.length,
        timeMs: Date.now() - startTime,
      };

      // Cache the result (skip in read-only mode)
      if (!this._readOnlyMode) {
        await this.storage.cacheQuery(queryHash, result as unknown as Record<string, unknown>);
      }

      return result;
    } finally {
      await db.close();
    }
  }

  // ================== M2M Connection APIs ==================

  /**
   * Find M2M (machine-to-machine) connections across registered repositories.
   *
   * This queries all repos for:
   * - Send effects with send_type = "m2m" (outgoing M2M calls)
   * - Request effects (API endpoints)
   *
   * Then matches them by service name to find cross-service dependencies.
   *
   * @param options Query options
   * @returns M2M connections found across repos
   */
  async findM2MConnections(options?: {
    /** Filter by source repo */
    sourceRepo?: string;
    /** Filter by target service name */
    targetService?: string;
    /** Filter by URL pattern (supports LIKE patterns with %) */
    urlPattern?: string;
    /** Include unmatched connections (no target found) */
    includeUnmatched?: boolean;
  }): Promise<M2MQueryResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const connections: M2MConnection[] = [];

    // Get all registered repos
    const repos = await this.storage.listRepos();

    // Collect Send effects (M2M calls) from all repos
    interface SendEffectRow {
      repo_id: string;
      source_entity_id: string;
      source_file_path: string;
      source_line: number;
      method: string | null;
      target: string;
      service_name: string | null;
    }
    const sendEffects: SendEffectRow[] = [];

    // Collect Request effects (API endpoints) from all repos
    interface RequestEffectRow {
      repo_id: string;
      source_entity_id: string;
      route_pattern: string;
      method: string | null;
    }
    const requestEffects: RequestEffectRow[] = [];

    // Query effects from each repo's seed files
    for (const repo of repos) {
      if (options?.sourceRepo && repo.repo_id !== options.sourceRepo) {
        continue; // Skip if filtering by source repo
      }

      const manifest = await this.loadManifest(repo.local_path);
      if (!manifest) continue;

      for (const pkg of manifest.packages) {
        const effectsPath = path.join(repo.local_path, pkg.seed_path, "effects.parquet");

        try {
          await fs.access(effectsPath);
        } catch {
          continue; // No effects file
        }

        const db = await Database.create(":memory:");
        try {
          // Query Send effects with send_type = "m2m"
          let sendQuery = `
            SELECT
              '${repo.repo_id}' as repo_id,
              source_entity_id,
              source_file_path,
              source_line,
              method,
              target,
              service_name
            FROM read_parquet('${effectsPath}')
            WHERE effect_type = 'Send'
              AND send_type = 'm2m'
              AND is_deleted = false
          `;

          if (options?.urlPattern) {
            sendQuery += ` AND target LIKE '${options.urlPattern}'`;
          }
          if (options?.targetService) {
            sendQuery += ` AND service_name = '${options.targetService}'`;
          }

          const sendRows = await db.all(sendQuery);
          for (const row of sendRows) {
            sendEffects.push({
              repo_id: row.repo_id as string,
              source_entity_id: row.source_entity_id as string,
              source_file_path: row.source_file_path as string,
              source_line: row.source_line as number,
              method: row.method as string | null,
              target: row.target as string,
              service_name: row.service_name as string | null,
            });
          }

          // Query Request effects (API endpoints)
          const requestQuery = `
            SELECT
              '${repo.repo_id}' as repo_id,
              source_entity_id,
              route_pattern,
              method
            FROM read_parquet('${effectsPath}')
            WHERE effect_type = 'Request'
              AND is_deleted = false
          `;

          const requestRows = await db.all(requestQuery);
          for (const row of requestRows) {
            requestEffects.push({
              repo_id: row.repo_id as string,
              source_entity_id: row.source_entity_id as string,
              route_pattern: row.route_pattern as string,
              method: row.method as string | null,
            });
          }
        } finally {
          await db.close();
        }
      }
    }

    // Build index of Request effects by repo for matching
    const requestsByRepo = new Map<string, RequestEffectRow[]>();
    for (const req of requestEffects) {
      const existing = requestsByRepo.get(req.repo_id) || [];
      existing.push(req);
      requestsByRepo.set(req.repo_id, existing);
    }

    // Match Send effects to Request effects
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const send of sendEffects) {
      let matched = false;
      let targetRepo: string | null = null;
      let targetEntityId: string | null = null;
      let targetRoute: string | null = null;

      // Try to match by service name to repo
      if (send.service_name) {
        // Look for repos that might match this service
        for (const [repoId, requests] of requestsByRepo) {
          // Skip same repo
          if (repoId === send.repo_id) continue;

          // Check if repo name contains service name (flexible matching)
          const repoLower = repoId.toLowerCase();
          const serviceLower = send.service_name.toLowerCase();

          if (repoLower.includes(serviceLower) || serviceLower.includes(repoLower)) {
            // Found potential match, look for matching routes
            for (const req of requests) {
              // Simple route matching - the URL pattern should contain the route
              if (
                send.target.includes(req.route_pattern) ||
                this.routesMatch(send.target, req.route_pattern)
              ) {
                matched = true;
                targetRepo = repoId;
                targetEntityId = req.source_entity_id;
                targetRoute = req.route_pattern;
                break;
              }
            }

            // If no exact route match, still mark as matched to repo
            if (!matched && requests.length > 0) {
              matched = true;
              targetRepo = repoId;
            }
          }

          if (matched) break;
        }
      }

      if (matched) {
        matchedCount++;
      } else {
        unmatchedCount++;
        if (!options?.includeUnmatched) {
          continue; // Skip unmatched if not requested
        }
      }

      connections.push({
        sourceRepo: send.repo_id,
        sourceEntityId: send.source_entity_id,
        sourceFile: send.source_file_path,
        sourceLine: send.source_line,
        method: send.method,
        urlPattern: send.target,
        targetService: send.service_name,
        targetRepo,
        targetEntityId,
        targetRoute,
      });
    }

    return {
      connections,
      totalCount: sendEffects.length,
      matchedCount,
      unmatchedCount,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Check if a URL pattern matches a route pattern
   */
  private routesMatch(urlPattern: string, routePattern: string): boolean {
    // Extract path from URL pattern (remove protocol, host, query params)
    const urlPath = urlPattern
      .replace(/^https?:\/\/[^\/]+/, "")
      .replace(/\?.*$/, "")
      .replace(/\$\{[^}]+\}/g, ":param"); // Replace template vars with :param

    // Normalize route pattern
    const normalizedRoute = routePattern.replace(/:[\w]+/g, ":param");
    const normalizedUrl = urlPath.replace(/\/+/g, "/").replace(/\/$/, "");
    const normalizedRouteClean = normalizedRoute.replace(/\/+/g, "/").replace(/\/$/, "");

    // Check if URL ends with the route
    return (
      normalizedUrl.endsWith(normalizedRouteClean) || normalizedRouteClean.endsWith(normalizedUrl)
    );
  }

  /**
   * Load manifest from a repository path
   */
  private async loadManifest(repoPath: string): Promise<RepositoryManifest | null> {
    const manifestPath = path.join(repoPath, ".devac", "manifest.json");
    try {
      const content = await fs.readFile(manifestPath, "utf-8");
      return JSON.parse(content) as RepositoryManifest;
    } catch {
      return null;
    }
  }

  // ================== Validation Error APIs ==================
  // These methods now write to and read from the unified_diagnostics table
  // for consistency with CI status and GitHub issues.

  /**
   * Push validation errors from a repository to the hub
   * Replaces existing errors for the same repo/package
   *
   * Note: This now writes to unified_diagnostics table (not validation_errors)
   */
  async pushValidationErrors(
    repoId: string,
    packagePath: string,
    errors: Array<{
      file: string;
      line: number;
      column: number;
      message: string;
      severity: "error" | "warning";
      source: "tsc" | "eslint" | "biome" | "test" | "coverage";
      code: string | null;
    }>
  ): Promise<void> {
    this.ensureInitialized();

    // Clear existing validation diagnostics for this repo (all validation sources)
    await this.storage.clearDiagnostics(repoId, "tsc");
    await this.storage.clearDiagnostics(repoId, "eslint");
    await this.storage.clearDiagnostics(repoId, "test");
    await this.storage.clearDiagnostics(repoId, "coverage");

    if (errors.length === 0) return;

    // Convert to UnifiedDiagnostics format
    const now = new Date().toISOString();
    const diagnostics: UnifiedDiagnostics[] = errors.map((error, index) => ({
      diagnostic_id: `val-${repoId}-${packagePath}-${error.file}-${error.line}-${error.source}-${index}`,
      repo_id: repoId,
      source: error.source as DiagnosticsSource,
      file_path: error.file,
      line_number: error.line,
      column_number: error.column,
      severity: error.severity as DiagnosticsSeverity,
      category: this.sourceToCategory(error.source),
      title: this.extractTitle(error.message),
      description: error.message,
      code: error.code,
      suggestion: null,
      resolved: false,
      actionable: true,
      created_at: now,
      updated_at: now,
      github_issue_number: null,
      github_pr_number: null,
      workflow_name: null,
      ci_url: null,
    }));

    await this.storage.upsertDiagnostics(diagnostics);
  }

  /**
   * Clear all validation errors for a repository
   */
  async clearValidationErrors(repoId: string): Promise<void> {
    this.ensureInitialized();

    // Clear all validation sources from unified_diagnostics
    await this.storage.clearDiagnostics(repoId, "tsc");
    await this.storage.clearDiagnostics(repoId, "eslint");
    await this.storage.clearDiagnostics(repoId, "biome");
    await this.storage.clearDiagnostics(repoId, "test");
  }

  /**
   * Get validation errors with optional filters
   * Reads from unified_diagnostics with validation sources
   */
  async getValidationErrors(filter?: ValidationFilter): Promise<ValidationError[]> {
    this.ensureInitialized();

    // Convert ValidationFilter to DiagnosticsFilter
    const diagnosticsFilter: DiagnosticsFilter = {
      repo_id: filter?.repo_id,
      source: filter?.source ? [filter.source] : ["tsc", "eslint", "biome", "test"],
      severity: filter?.severity ? [filter.severity] : undefined,
      file_path: filter?.file,
      limit: filter?.limit,
    };

    const diagnostics = await this.storage.queryDiagnostics(diagnosticsFilter);

    // Convert back to ValidationError format for backward compatibility
    return diagnostics.map((d) => ({
      repo_id: d.repo_id,
      package_path: "", // Not stored in unified_diagnostics
      file: d.file_path || "",
      line: d.line_number || 0,
      column: d.column_number || 0,
      message: d.description,
      severity: d.severity as "error" | "warning",
      source: d.source as "tsc" | "eslint" | "biome" | "test",
      code: d.code,
      updated_at: d.updated_at,
    }));
  }

  /**
   * Get validation error summary grouped by specified field
   */
  async getValidationSummary(
    groupBy: "repo" | "file" | "source" | "severity"
  ): Promise<ValidationSummary[]> {
    this.ensureInitialized();

    // Use diagnostics summary with validation sources filter
    const groupByMap: Record<
      "repo" | "file" | "source" | "severity",
      "repo" | "source" | "severity" | "category"
    > = {
      repo: "repo",
      file: "category", // Can't group by file in diagnostics summary, use category
      source: "source",
      severity: "severity",
    };

    const diagnosticsSummary = await this.storage.getDiagnosticsSummaryFiltered(
      groupByMap[groupBy],
      ["tsc", "eslint", "test"]
    );

    return diagnosticsSummary.map((s) => ({
      group_key: s.group_key,
      error_count: s.error_count + s.critical_count,
      warning_count: s.warning_count,
      total_count: s.count,
    }));
  }

  /**
   * Get total validation error counts
   */
  async getValidationCounts(): Promise<{
    errors: number;
    warnings: number;
    total: number;
  }> {
    this.ensureInitialized();

    const counts = await this.storage.getDiagnosticsCountsFiltered([
      "tsc",
      "eslint",
      "biome",
      "test",
    ]);

    return {
      errors: counts.critical + counts.error,
      warnings: counts.warning,
      total: counts.total,
    };
  }

  /**
   * Map source to category
   */
  private sourceToCategory(
    source: "tsc" | "eslint" | "biome" | "test" | "coverage"
  ): DiagnosticsCategory {
    switch (source) {
      case "tsc":
        return "compilation";
      case "eslint":
      case "biome":
        return "linting";
      case "test":
        return "testing";
      case "coverage":
        return "testing";
    }
  }

  /**
   * Extract a short title from a message (first ~80 chars)
   */
  private extractTitle(message: string): string {
    const firstLine = message.split("\n")[0] || message;
    if (firstLine.length <= 80) return firstLine;
    return `${firstLine.slice(0, 77)}...`;
  }

  // ================== Unified Diagnostics APIs ==================

  /**
   * Push unified diagnostics to the hub
   * Can be used for any diagnostics type: validation, CI, issues, PR reviews
   */
  async pushDiagnostics(diagnostics: UnifiedDiagnostics[]): Promise<void> {
    this.ensureInitialized();

    await this.storage.upsertDiagnostics(diagnostics);
  }

  /**
   * Clear diagnostics with optional filters
   * @param repoId - Filter by repository
   * @param source - Filter by source type
   */
  async clearDiagnostics(repoId?: string, source?: DiagnosticsSource): Promise<void> {
    this.ensureInitialized();

    await this.storage.clearDiagnostics(repoId, source);
  }

  /**
   * Get diagnostics with optional filters
   */
  async getDiagnostics(filter?: DiagnosticsFilter): Promise<UnifiedDiagnostics[]> {
    this.ensureInitialized();

    return this.storage.queryDiagnostics(filter);
  }

  /**
   * Get diagnostics summary grouped by specified field
   */
  async getDiagnosticsSummary(
    groupBy: "repo" | "source" | "severity" | "category"
  ): Promise<DiagnosticsSummary[]> {
    this.ensureInitialized();

    return this.storage.getDiagnosticsSummary(groupBy);
  }

  /**
   * Get diagnostics counts by severity
   */
  async getDiagnosticsCounts(): Promise<{
    critical: number;
    error: number;
    warning: number;
    suggestion: number;
    note: number;
    total: number;
  }> {
    this.ensureInitialized();

    return this.storage.getDiagnosticsCounts();
  }

  /**
   * Mark diagnostics as resolved
   */
  async resolveDiagnostics(diagnosticIds: string[]): Promise<void> {
    this.ensureInitialized();

    await this.storage.resolveDiagnostics(diagnosticIds);
  }

  // ================== Affected Analysis ==================

  /**
   * Get repositories affected by changes to given entities
   */
  async getAffectedRepos(changedEntityIds: string[]): Promise<AffectedResult> {
    this.ensureInitialized();

    const startTime = Date.now();

    if (changedEntityIds.length === 0) {
      return {
        changedEntities: [],
        affectedRepos: [],
        totalAffected: 0,
        analysisTimeMs: Date.now() - startTime,
      };
    }

    // Find cross-repo dependents
    const dependents = await this.storage.getCrossRepoDependents(changedEntityIds);

    // Group by repo
    const repoMap = new Map<string, Set<string>>();
    for (const edge of dependents) {
      const set = repoMap.get(edge.source_repo) || new Set();
      set.add(edge.source_entity_id);
      repoMap.set(edge.source_repo, set);
    }

    // Build result
    const affectedRepos: AffectedRepo[] = [];
    for (const [repoId, entities] of repoMap) {
      const repo = await this.storage.getRepo(repoId);
      affectedRepos.push({
        repoId,
        localPath: repo?.local_path || "",
        affectedEntities: Array.from(entities),
        impactLevel: "direct",
      });
    }

    return {
      changedEntities: changedEntityIds,
      affectedRepos,
      totalAffected: affectedRepos.reduce((sum, r) => sum + r.affectedEntities.length, 0),
      analysisTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Check if a repository has seed data
   */
  private async repoHasSeeds(repoPath: string): Promise<boolean> {
    // Check for any .devac/seed directory at repo root
    const seedPath = path.join(repoPath, ".devac", "seed");
    if (await this.pathExists(seedPath)) {
      return true;
    }

    // Check subdirectories for packages with seeds (one level deep)
    try {
      const entries = await fs.readdir(repoPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
          const subSeedPath = path.join(repoPath, entry.name, ".devac", "seed");
          if (await this.pathExists(subSeedPath)) {
            return true;
          }

          // Check two levels deep (e.g., packages/api/.devac/seed)
          try {
            const subEntries = await fs.readdir(path.join(repoPath, entry.name), {
              withFileTypes: true,
            });
            for (const subEntry of subEntries) {
              if (
                subEntry.isDirectory() &&
                subEntry.name !== "node_modules" &&
                subEntry.name !== ".git"
              ) {
                const deepSeedPath = path.join(
                  repoPath,
                  entry.name,
                  subEntry.name,
                  ".devac",
                  "seed"
                );
                if (await this.pathExists(deepSeedPath)) {
                  return true;
                }
              }
            }
          } catch {
            // Can't read subdirectory
          }
        }
      }
    } catch {
      // Can't read directory
    }

    return false;
  }

  /**
   * Extract cross-repo edges from manifest
   */
  private async extractCrossRepoEdges(
    _repoPath: string,
    manifest: RepositoryManifest
  ): Promise<CrossRepoEdge[]> {
    const edges: CrossRepoEdge[] = [];

    // Get all registered repos to match against
    const registeredRepos = await this.storage.listRepos();
    const repoIdMap = new Map<string, RepoRegistration>();
    for (const repo of registeredRepos) {
      repoIdMap.set(repo.repo_id, repo);
    }

    // Check external dependencies for cross-repo matches
    for (const dep of manifest.external_dependencies) {
      if (dep.repo_id && repoIdMap.has(dep.repo_id)) {
        // This is a cross-repo dependency
        // In a full implementation, we would extract actual entity IDs
        // For now, we create a placeholder edge
        edges.push({
          source_repo: manifest.repo_id,
          source_entity_id: `${manifest.repo_id}:root:package:dep`,
          target_repo: dep.repo_id,
          target_entity_id: `${dep.repo_id}:root:package:export`,
          edge_type: "DEPENDS_ON",
          metadata: { package: dep.package, version: dep.version },
        });
      }
    }

    return edges;
  }

  /**
   * Check if a path exists
   */
  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure hub is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("Hub not initialized. Call init() first.");
    }
  }
}

/**
 * Create a CentralHub instance
 */
export function createCentralHub(options: CentralHubOptions): CentralHub {
  return new CentralHub(options);
}
