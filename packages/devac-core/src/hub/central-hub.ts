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
import {
  type CrossRepoEdge,
  type FeedbackCategory,
  type FeedbackFilter,
  type FeedbackSeverity,
  type FeedbackSource,
  type FeedbackSummary,
  type HubStorage,
  type RepoRegistration,
  type UnifiedFeedback,
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

  constructor(private options: CentralHubOptions) {
    this.hubPath = path.join(options.hubDir, "central.duckdb");
    this.storage = createHubStorage(this.hubPath);
    this.manifestGenerator = createManifestGenerator();
  }

  /**
   * Initialize the hub
   */
  async init(options: HubInitOptions = {}): Promise<void> {
    const { force = false } = options;

    if (force) {
      // Remove existing hub
      try {
        await fs.rm(this.hubPath, { force: true });
      } catch {
        // Ignore if doesn't exist
      }
    }

    await this.storage.init();
    this.initialized = true;
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

    // For now, just execute the SQL directly
    // In production, we would build UNION queries across parquet files
    const db = await Database.create(":memory:");
    try {
      const rows = await db.all(sql);
      const result: QueryResult = {
        rows: rows as Record<string, unknown>[],
        rowCount: rows.length,
        timeMs: Date.now() - startTime,
      };

      // Cache the result
      await this.storage.cacheQuery(queryHash, result as unknown as Record<string, unknown>);

      return result;
    } finally {
      await db.close();
    }
  }

  // ================== Validation Error APIs ==================
  // These methods now write to and read from the unified_feedback table
  // for consistency with CI status and GitHub issues.

  /**
   * Push validation errors from a repository to the hub
   * Replaces existing errors for the same repo/package
   *
   * Note: This now writes to unified_feedback table (not validation_errors)
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
      source: "tsc" | "eslint" | "test";
      code: string | null;
    }>
  ): Promise<void> {
    this.ensureInitialized();

    // Clear existing validation feedback for this repo (all validation sources)
    await this.storage.clearFeedback(repoId, "tsc");
    await this.storage.clearFeedback(repoId, "eslint");
    await this.storage.clearFeedback(repoId, "test");

    if (errors.length === 0) return;

    // Convert to UnifiedFeedback format
    const now = new Date().toISOString();
    const feedback: UnifiedFeedback[] = errors.map((error, index) => ({
      feedback_id: `val-${repoId}-${packagePath}-${error.file}-${error.line}-${error.source}-${index}`,
      repo_id: repoId,
      source: error.source as FeedbackSource,
      file_path: error.file,
      line_number: error.line,
      column_number: error.column,
      severity: error.severity as FeedbackSeverity,
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

    await this.storage.upsertFeedback(feedback);
  }

  /**
   * Clear all validation errors for a repository
   */
  async clearValidationErrors(repoId: string): Promise<void> {
    this.ensureInitialized();

    // Clear all validation sources from unified_feedback
    await this.storage.clearFeedback(repoId, "tsc");
    await this.storage.clearFeedback(repoId, "eslint");
    await this.storage.clearFeedback(repoId, "test");
  }

  /**
   * Get validation errors with optional filters
   * Reads from unified_feedback with validation sources
   */
  async getValidationErrors(filter?: ValidationFilter): Promise<ValidationError[]> {
    this.ensureInitialized();

    // Convert ValidationFilter to FeedbackFilter
    const feedbackFilter: FeedbackFilter = {
      repo_id: filter?.repo_id,
      source: filter?.source ? [filter.source] : ["tsc", "eslint", "test"],
      severity: filter?.severity ? [filter.severity] : undefined,
      file_path: filter?.file,
      limit: filter?.limit,
    };

    const feedback = await this.storage.queryFeedback(feedbackFilter);

    // Convert back to ValidationError format for backward compatibility
    return feedback.map((f) => ({
      repo_id: f.repo_id,
      package_path: "", // Not stored in unified_feedback
      file: f.file_path || "",
      line: f.line_number || 0,
      column: f.column_number || 0,
      message: f.description,
      severity: f.severity as "error" | "warning",
      source: f.source as "tsc" | "eslint" | "test",
      code: f.code,
      updated_at: f.updated_at,
    }));
  }

  /**
   * Get validation error summary grouped by specified field
   */
  async getValidationSummary(
    groupBy: "repo" | "file" | "source" | "severity"
  ): Promise<ValidationSummary[]> {
    this.ensureInitialized();

    // Use feedback summary with validation sources filter
    const groupByMap: Record<
      "repo" | "file" | "source" | "severity",
      "repo" | "source" | "severity" | "category"
    > = {
      repo: "repo",
      file: "category", // Can't group by file in feedback summary, use category
      source: "source",
      severity: "severity",
    };

    const feedbackSummary = await this.storage.getFeedbackSummaryFiltered(groupByMap[groupBy], [
      "tsc",
      "eslint",
      "test",
    ]);

    return feedbackSummary.map((s) => ({
      group_key: s.group_key,
      error_count: s.error_count + s.critical_count,
      warning_count: s.warning_count,
      total_count: s.count,
    }));
  }

  /**
   * Get total validation error counts
   */
  async getValidationCounts(): Promise<{ errors: number; warnings: number; total: number }> {
    this.ensureInitialized();

    const counts = await this.storage.getFeedbackCountsFiltered(["tsc", "eslint", "test"]);

    return {
      errors: counts.critical + counts.error,
      warnings: counts.warning,
      total: counts.total,
    };
  }

  /**
   * Map source to category
   */
  private sourceToCategory(source: "tsc" | "eslint" | "test"): FeedbackCategory {
    switch (source) {
      case "tsc":
        return "compilation";
      case "eslint":
        return "linting";
      case "test":
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

  // ================== Unified Feedback APIs ==================

  /**
   * Push unified feedback to the hub
   * Can be used for any feedback type: validation, CI, issues, PR reviews
   */
  async pushFeedback(feedback: UnifiedFeedback[]): Promise<void> {
    this.ensureInitialized();

    await this.storage.upsertFeedback(feedback);
  }

  /**
   * Clear feedback with optional filters
   * @param repoId - Filter by repository
   * @param source - Filter by source type
   */
  async clearFeedback(repoId?: string, source?: FeedbackSource): Promise<void> {
    this.ensureInitialized();

    await this.storage.clearFeedback(repoId, source);
  }

  /**
   * Get feedback with optional filters
   */
  async getFeedback(filter?: FeedbackFilter): Promise<UnifiedFeedback[]> {
    this.ensureInitialized();

    return this.storage.queryFeedback(filter);
  }

  /**
   * Get feedback summary grouped by specified field
   */
  async getFeedbackSummary(
    groupBy: "repo" | "source" | "severity" | "category"
  ): Promise<FeedbackSummary[]> {
    this.ensureInitialized();

    return this.storage.getFeedbackSummary(groupBy);
  }

  /**
   * Get feedback counts by severity
   */
  async getFeedbackCounts(): Promise<{
    critical: number;
    error: number;
    warning: number;
    suggestion: number;
    note: number;
    total: number;
  }> {
    this.ensureInitialized();

    return this.storage.getFeedbackCounts();
  }

  /**
   * Mark feedback as resolved
   */
  async resolveFeedback(feedbackIds: string[]): Promise<void> {
    this.ensureInitialized();

    await this.storage.resolveFeedback(feedbackIds);
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
