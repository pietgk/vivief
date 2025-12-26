/**
 * Hub Storage Implementation
 *
 * DuckDB-based storage for the central federation hub.
 * Based on DevAC v2.0 spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Database } from "duckdb-async";

/**
 * Repository registration record
 */
export interface RepoRegistration {
  repo_id: string;
  local_path: string;
  manifest_hash: string | null;
  last_synced: string;
  status: "active" | "stale" | "removed" | "missing";
}

/**
 * Cross-repository edge
 */
export interface CrossRepoEdge {
  source_repo: string;
  source_entity_id: string;
  target_repo: string;
  target_entity_id: string;
  edge_type: string;
  metadata?: Record<string, unknown>;
}

/**
 * Validation error stored in the hub cache
 */
export interface ValidationError {
  repo_id: string;
  package_path: string;
  file: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
  source: "tsc" | "eslint" | "biome" | "test";
  code: string | null;
  updated_at: string;
}

/**
 * Filter for querying validation errors
 */
export interface ValidationFilter {
  repo_id?: string;
  severity?: "error" | "warning";
  source?: "tsc" | "eslint" | "biome" | "test";
  file?: string;
  limit?: number;
}

/**
 * Summary of validation errors
 */
export interface ValidationSummary {
  group_key: string;
  error_count: number;
  warning_count: number;
  total_count: number;
}

// ================== Unified Diagnostics Types ==================

/**
 * Diagnostics source types
 */
export type DiagnosticsSource =
  | "tsc"
  | "eslint"
  | "biome"
  | "test"
  | "coverage"
  | "ci-check"
  | "github-issue"
  | "pr-review";

/**
 * Diagnostics severity levels (ordered from most to least severe)
 */
export type DiagnosticsSeverity = "critical" | "error" | "warning" | "suggestion" | "note";

/**
 * Diagnostics category types
 */
export type DiagnosticsCategory =
  | "compilation"
  | "linting"
  | "testing"
  | "ci-check"
  | "task"
  | "feedback"
  | "code-review";

/**
 * Unified diagnostics record stored in the hub
 * Combines validation errors, CI failures, GitHub issues, and PR reviews
 */
export interface UnifiedDiagnostics {
  /** Unique identifier for the diagnostic */
  diagnostic_id: string;
  /** Repository identifier */
  repo_id: string;
  /** Source of the diagnostic */
  source: DiagnosticsSource;

  // Location (optional for issues)
  /** File path relative to repo root (null for issue-level diagnostics) */
  file_path: string | null;
  /** Line number (1-based, null for issue-level diagnostics) */
  line_number: number | null;
  /** Column number (0-based, null for issue-level diagnostics) */
  column_number: number | null;

  // Severity & Category
  /** Severity level */
  severity: DiagnosticsSeverity;
  /** Category of diagnostic */
  category: DiagnosticsCategory;

  // Content
  /** Short summary (max ~100 chars) */
  title: string;
  /** Full description/message */
  description: string;
  /** Error code (e.g., TS2345, no-unused-vars) */
  code: string | null;
  /** Suggested fix (if available) */
  suggestion: string | null;

  // Status
  /** Whether the diagnostic has been resolved */
  resolved: boolean;
  /** Whether the diagnostic is actionable (can be directly fixed) */
  actionable: boolean;

  // Timestamps
  /** When the diagnostic was first created */
  created_at: string;
  /** When the diagnostic was last updated */
  updated_at: string;

  // Source-specific references
  /** GitHub issue number (for github-issue source) */
  github_issue_number: number | null;
  /** GitHub PR number (for ci-check or pr-review source) */
  github_pr_number: number | null;
  /** Workflow name (for ci-check source) */
  workflow_name: string | null;
  /** URL to CI details (for ci-check source) */
  ci_url: string | null;
}

/**
 * Filter for querying unified diagnostics
 */
export interface DiagnosticsFilter {
  /** Filter by repository ID */
  repo_id?: string;
  /** Filter by source(s) */
  source?: DiagnosticsSource | DiagnosticsSource[];
  /** Filter by severity level(s) */
  severity?: DiagnosticsSeverity | DiagnosticsSeverity[];
  /** Filter by category */
  category?: DiagnosticsCategory | DiagnosticsCategory[];
  /** Filter by file path (partial match) */
  file_path?: string;
  /** Filter by resolved status */
  resolved?: boolean;
  /** Filter by actionable status */
  actionable?: boolean;
  /** Maximum number of results */
  limit?: number;
}

/**
 * Summary of diagnostics grouped by a dimension
 */
export interface DiagnosticsSummary {
  group_key: string;
  count: number;
  critical_count: number;
  error_count: number;
  warning_count: number;
  suggestion_count: number;
  note_count: number;
}

/**
 * Hub Storage initialization options
 */
export interface HubStorageInitOptions {
  /** Open database in read-only mode (no writes, no table creation) */
  readOnly?: boolean;
}

/**
 * Hub Storage
 *
 * Manages the central DuckDB database for federation.
 */
export class HubStorage {
  private db: Database | null = null;
  private initialized = false;
  private _readOnlyMode = false;

  constructor(private hubPath: string) {}

  /**
   * Check if storage is in read-only mode
   */
  get isReadOnly(): boolean {
    return this._readOnlyMode;
  }

  /**
   * Initialize the hub database
   */
  async init(options: HubStorageInitOptions = {}): Promise<void> {
    if (this.initialized && this.db) {
      return;
    }

    const { readOnly = false } = options;
    this._readOnlyMode = readOnly;

    // Ensure directory exists (only for write mode)
    if (!readOnly) {
      const dir = path.dirname(this.hubPath);
      await fs.mkdir(dir, { recursive: true });
    }

    // Open or create database with access mode
    const accessMode = readOnly ? "READ_ONLY" : "READ_WRITE";
    this.db = await Database.create(this.hubPath, { access_mode: accessMode });

    // Create tables only in write mode
    if (!readOnly) {
      await this.createTables();
    }

    this.initialized = true;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  /**
   * Create the required tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    // Repository registry
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS repo_registry (
        repo_id VARCHAR PRIMARY KEY,
        local_path VARCHAR NOT NULL,
        manifest_hash VARCHAR,
        last_synced TIMESTAMP,
        status VARCHAR DEFAULT 'active'
      )
    `);

    // Cross-repository edges
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS cross_repo_edges (
        source_repo VARCHAR NOT NULL,
        source_entity_id VARCHAR NOT NULL,
        target_repo VARCHAR NOT NULL,
        target_entity_id VARCHAR NOT NULL,
        edge_type VARCHAR NOT NULL,
        metadata JSON,
        PRIMARY KEY (source_entity_id, target_entity_id, edge_type)
      )
    `);

    // Query cache
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS query_cache (
        query_hash VARCHAR PRIMARY KEY,
        result_json JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ttl_seconds INTEGER DEFAULT 300
      )
    `);

    // Validation errors cache
    // Note: code can be NULL, so we use COALESCE in the unique constraint via a computed column
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS validation_errors (
        repo_id VARCHAR NOT NULL,
        package_path VARCHAR NOT NULL,
        file VARCHAR NOT NULL,
        line INTEGER NOT NULL,
        column_num INTEGER NOT NULL,
        message VARCHAR NOT NULL,
        severity VARCHAR NOT NULL,
        source VARCHAR NOT NULL,
        code VARCHAR,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (repo_id, package_path, file, line, column_num, source)
      )
    `);

    // Create indexes for validation_errors
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_validation_repo ON validation_errors(repo_id)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_validation_severity ON validation_errors(severity)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_validation_source ON validation_errors(source)
    `);

    // Unified diagnostics table
    // Combines validation errors, CI failures, GitHub issues, and PR reviews
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS unified_diagnostics (
        diagnostic_id VARCHAR PRIMARY KEY,
        repo_id VARCHAR NOT NULL,
        source VARCHAR NOT NULL,

        -- Location (nullable for issues)
        file_path VARCHAR,
        line_number INTEGER,
        column_number INTEGER,

        -- Severity & Category
        severity VARCHAR NOT NULL,
        category VARCHAR NOT NULL,

        -- Content
        title VARCHAR NOT NULL,
        description VARCHAR NOT NULL,
        code VARCHAR,
        suggestion VARCHAR,

        -- Status
        resolved BOOLEAN DEFAULT FALSE,
        actionable BOOLEAN DEFAULT TRUE,

        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Source-specific references
        github_issue_number INTEGER,
        github_pr_number INTEGER,
        workflow_name VARCHAR,
        ci_url VARCHAR
      )
    `);

    // Create indexes for unified_diagnostics
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_diagnostics_repo ON unified_diagnostics(repo_id)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_diagnostics_source ON unified_diagnostics(source)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_diagnostics_severity ON unified_diagnostics(severity)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_diagnostics_resolved ON unified_diagnostics(resolved)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_diagnostics_file ON unified_diagnostics(file_path)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_diagnostics_category ON unified_diagnostics(category)
    `);
  }

  /**
   * Add a repository to the registry
   */
  async addRepo(repo: RepoRegistration): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    // Use INSERT OR REPLACE to handle duplicates
    await this.db.run(
      `
      INSERT OR REPLACE INTO repo_registry (repo_id, local_path, manifest_hash, last_synced, status)
      VALUES (?, ?, ?, ?, ?)
    `,
      repo.repo_id,
      repo.local_path,
      repo.manifest_hash,
      repo.last_synced,
      repo.status
    );
  }

  /**
   * Remove a repository from the registry
   */
  async removeRepo(repoId: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    // Also remove associated edges
    await this.removeCrossRepoEdges(repoId);

    await this.db.run("DELETE FROM repo_registry WHERE repo_id = ?", repoId);
  }

  /**
   * Get a repository by ID
   */
  async getRepo(repoId: string): Promise<RepoRegistration | null> {
    if (!this.db) throw new Error("Database not initialized");

    const rows = await this.db.all("SELECT * FROM repo_registry WHERE repo_id = ?", repoId);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as Record<string, unknown>;
    return {
      repo_id: row.repo_id as string,
      local_path: row.local_path as string,
      manifest_hash: row.manifest_hash as string | null,
      last_synced: this.formatTimestamp(row.last_synced),
      status: row.status as "active" | "stale" | "removed",
    };
  }

  /**
   * List all registered repositories
   */
  async listRepos(): Promise<RepoRegistration[]> {
    if (!this.db) throw new Error("Database not initialized");

    const rows = await this.db.all("SELECT * FROM repo_registry");

    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        repo_id: r.repo_id as string,
        local_path: r.local_path as string,
        manifest_hash: r.manifest_hash as string | null,
        last_synced: this.formatTimestamp(r.last_synced),
        status: r.status as "active" | "stale" | "removed",
      };
    });
  }

  /**
   * Update repository sync information
   */
  async updateRepoSync(repoId: string, manifestHash: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const now = new Date().toISOString();
    await this.db.run(
      "UPDATE repo_registry SET manifest_hash = ?, last_synced = ? WHERE repo_id = ?",
      manifestHash,
      now,
      repoId
    );
  }

  /**
   * Add cross-repository edges
   */
  async addCrossRepoEdges(edges: CrossRepoEdge[]): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
    if (edges.length === 0) return;

    for (const edge of edges) {
      await this.db.run(
        `
        INSERT OR REPLACE INTO cross_repo_edges
        (source_repo, source_entity_id, target_repo, target_entity_id, edge_type, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        edge.source_repo,
        edge.source_entity_id,
        edge.target_repo,
        edge.target_entity_id,
        edge.edge_type,
        edge.metadata ? JSON.stringify(edge.metadata) : null
      );
    }
  }

  /**
   * Remove all cross-repo edges for a repository
   */
  async removeCrossRepoEdges(repoId: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    await this.db.run(
      "DELETE FROM cross_repo_edges WHERE source_repo = ? OR target_repo = ?",
      repoId,
      repoId
    );
  }

  /**
   * Get entities that depend on the given target entity IDs
   */
  async getCrossRepoDependents(targetEntityIds: string[]): Promise<CrossRepoEdge[]> {
    if (!this.db) throw new Error("Database not initialized");
    if (targetEntityIds.length === 0) return [];

    const placeholders = targetEntityIds.map(() => "?").join(", ");
    const rows = await this.db.all(
      `SELECT * FROM cross_repo_edges WHERE target_entity_id IN (${placeholders})`,
      ...targetEntityIds
    );

    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        source_repo: r.source_repo as string,
        source_entity_id: r.source_entity_id as string,
        target_repo: r.target_repo as string,
        target_entity_id: r.target_entity_id as string,
        edge_type: r.edge_type as string,
        metadata: r.metadata
          ? (JSON.parse(r.metadata as string) as Record<string, unknown>)
          : undefined,
      };
    });
  }

  /**
   * Get edges targeting a specific repo with optional file path filter
   */
  async getEdgesTargetingRepo(
    targetRepoId: string,
    filePathPattern?: string
  ): Promise<CrossRepoEdge[]> {
    if (!this.db) throw new Error("Database not initialized");

    let sql = "SELECT * FROM cross_repo_edges WHERE target_repo = ?";
    const params: string[] = [targetRepoId];

    if (filePathPattern) {
      sql += " AND target_entity_id LIKE ?";
      params.push(`%${filePathPattern}%`);
    }

    const rows = await this.db.all(sql, ...params);

    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        source_repo: r.source_repo as string,
        source_entity_id: r.source_entity_id as string,
        target_repo: r.target_repo as string,
        target_entity_id: r.target_entity_id as string,
        edge_type: r.edge_type as string,
        metadata: r.metadata
          ? (JSON.parse(r.metadata as string) as Record<string, unknown>)
          : undefined,
      };
    });
  }

  /**
   * Get a cached query result
   */
  async getCachedQuery(queryHash: string): Promise<Record<string, unknown> | null> {
    if (!this.db) throw new Error("Database not initialized");

    // Query with TTL check using epoch for reliable timestamp comparison
    // For ttl_seconds = 0, the entry expires immediately (< not <=)
    const rows = await this.db.all(
      `
      SELECT result_json, created_at, ttl_seconds
      FROM query_cache
      WHERE query_hash = ?
        AND (ttl_seconds > 0 AND (epoch(CURRENT_TIMESTAMP) - epoch(created_at)) < ttl_seconds)
    `,
      queryHash
    );

    if (rows.length === 0) {
      // Clean up expired entry if it exists
      await this.db.run("DELETE FROM query_cache WHERE query_hash = ?", queryHash);
      return null;
    }

    const row = rows[0] as Record<string, unknown>;
    return JSON.parse(row.result_json as string) as Record<string, unknown>;
  }

  /**
   * Cache a query result
   */
  async cacheQuery(
    queryHash: string,
    result: Record<string, unknown>,
    ttlSeconds = 300
  ): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    await this.db.run(
      `
      INSERT OR REPLACE INTO query_cache (query_hash, result_json, created_at, ttl_seconds)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?)
    `,
      queryHash,
      JSON.stringify(result),
      ttlSeconds
    );
  }

  /**
   * Clear all cached queries
   */
  async clearCache(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    await this.db.run("DELETE FROM query_cache");
  }

  // ================== Validation Errors ==================

  /**
   * Upsert validation errors for a repository
   * Clears existing errors for the repo first, then inserts new ones
   */
  async upsertValidationErrors(
    repoId: string,
    packagePath: string,
    errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[]
  ): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    // Clear existing errors for this repo/package
    await this.db.run(
      "DELETE FROM validation_errors WHERE repo_id = ? AND package_path = ?",
      repoId,
      packagePath
    );

    if (errors.length === 0) return;

    const now = new Date().toISOString();

    // Insert new errors
    for (const error of errors) {
      await this.db.run(
        `
        INSERT INTO validation_errors
        (repo_id, package_path, file, line, column_num, message, severity, source, code, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        repoId,
        packagePath,
        error.file,
        error.line,
        error.column,
        error.message,
        error.severity,
        error.source,
        error.code ?? null,
        now
      );
    }
  }

  /**
   * Clear all validation errors for a repository
   */
  async clearValidationErrors(repoId: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    await this.db.run("DELETE FROM validation_errors WHERE repo_id = ?", repoId);
  }

  /**
   * Query validation errors with optional filters
   */
  async queryValidationErrors(filter: ValidationFilter = {}): Promise<ValidationError[]> {
    if (!this.db) throw new Error("Database not initialized");

    let sql = "SELECT * FROM validation_errors WHERE 1=1";
    const params: (string | number)[] = [];

    if (filter.repo_id) {
      sql += " AND repo_id = ?";
      params.push(filter.repo_id);
    }

    if (filter.severity) {
      sql += " AND severity = ?";
      params.push(filter.severity);
    }

    if (filter.source) {
      sql += " AND source = ?";
      params.push(filter.source);
    }

    if (filter.file) {
      sql += " AND file LIKE ?";
      params.push(`%${filter.file}%`);
    }

    sql += " ORDER BY repo_id, file, line, column_num";

    if (filter.limit) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }

    const rows = await this.db.all(sql, ...params);

    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        repo_id: r.repo_id as string,
        package_path: r.package_path as string,
        file: r.file as string,
        line: r.line as number,
        column: r.column_num as number,
        message: r.message as string,
        severity: r.severity as "error" | "warning",
        source: r.source as "tsc" | "eslint" | "biome" | "test",
        code: r.code as string | null,
        updated_at: this.formatTimestamp(r.updated_at),
      };
    });
  }

  /**
   * Get validation error summary grouped by repo, file, source, or severity
   */
  async getValidationSummary(
    groupBy: "repo" | "file" | "source" | "severity"
  ): Promise<ValidationSummary[]> {
    if (!this.db) throw new Error("Database not initialized");

    const columnMap: Record<string, string> = {
      repo: "repo_id",
      file: "file",
      source: "source",
      severity: "severity",
    };

    const column = columnMap[groupBy];

    const sql = `
      SELECT
        ${column} as group_key,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning_count,
        COUNT(*) as total_count
      FROM validation_errors
      GROUP BY ${column}
      ORDER BY total_count DESC
    `;

    const rows = await this.db.all(sql);

    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        group_key: r.group_key as string,
        error_count: Number(r.error_count),
        warning_count: Number(r.warning_count),
        total_count: Number(r.total_count),
      };
    });
  }

  /**
   * Get total validation error counts
   */
  async getValidationCounts(): Promise<{
    errors: number;
    warnings: number;
    total: number;
  }> {
    if (!this.db) throw new Error("Database not initialized");

    const rows = await this.db.all(`
      SELECT
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as errors,
        SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warnings,
        COUNT(*) as total
      FROM validation_errors
    `);

    if (rows.length === 0) {
      return { errors: 0, warnings: 0, total: 0 };
    }

    const r = rows[0] as Record<string, unknown>;
    return {
      errors: Number(r.errors ?? 0),
      warnings: Number(r.warnings ?? 0),
      total: Number(r.total ?? 0),
    };
  }

  /**
   * Format a timestamp value to ISO string
   */
  private formatTimestamp(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date().toISOString();
  }

  // ================== Unified Diagnostics ==================

  /**
   * Upsert diagnostics items
   * Uses INSERT OR REPLACE based on diagnostic_id
   */
  async upsertDiagnostics(diagnostics: UnifiedDiagnostics[]): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
    if (diagnostics.length === 0) return;

    const now = new Date().toISOString();

    for (const item of diagnostics) {
      await this.db.run(
        `
        INSERT OR REPLACE INTO unified_diagnostics (
          diagnostic_id, repo_id, source,
          file_path, line_number, column_number,
          severity, category,
          title, description, code, suggestion,
          resolved, actionable,
          created_at, updated_at,
          github_issue_number, github_pr_number, workflow_name, ci_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        item.diagnostic_id,
        item.repo_id,
        item.source,
        item.file_path,
        item.line_number,
        item.column_number,
        item.severity,
        item.category,
        item.title,
        item.description,
        item.code,
        item.suggestion,
        item.resolved,
        item.actionable,
        item.created_at || now,
        now,
        item.github_issue_number,
        item.github_pr_number,
        item.workflow_name,
        item.ci_url
      );
    }
  }

  /**
   * Clear diagnostics, optionally filtered by repository and/or source
   */
  async clearDiagnostics(repoId?: string, source?: DiagnosticsSource): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    if (repoId && source) {
      await this.db.run(
        "DELETE FROM unified_diagnostics WHERE repo_id = ? AND source = ?",
        repoId,
        source
      );
    } else if (repoId) {
      await this.db.run("DELETE FROM unified_diagnostics WHERE repo_id = ?", repoId);
    } else if (source) {
      await this.db.run("DELETE FROM unified_diagnostics WHERE source = ?", source);
    } else {
      // Clear all diagnostics - use with caution
      await this.db.run("DELETE FROM unified_diagnostics");
    }
  }

  /**
   * Query diagnostics with filters
   */
  async queryDiagnostics(filter: DiagnosticsFilter = {}): Promise<UnifiedDiagnostics[]> {
    if (!this.db) throw new Error("Database not initialized");

    let sql = "SELECT * FROM unified_diagnostics WHERE 1=1";
    const params: (string | number | boolean)[] = [];

    if (filter.repo_id) {
      sql += " AND repo_id = ?";
      params.push(filter.repo_id);
    }

    if (filter.source) {
      const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
      sql += ` AND source IN (${sources.map(() => "?").join(", ")})`;
      params.push(...sources);
    }

    if (filter.severity) {
      const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
      sql += ` AND severity IN (${severities.map(() => "?").join(", ")})`;
      params.push(...severities);
    }

    if (filter.category) {
      const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
      sql += ` AND category IN (${categories.map(() => "?").join(", ")})`;
      params.push(...categories);
    }

    if (filter.file_path) {
      sql += " AND file_path LIKE ?";
      params.push(`%${filter.file_path}%`);
    }

    if (filter.resolved !== undefined) {
      sql += " AND resolved = ?";
      params.push(filter.resolved);
    }

    if (filter.actionable !== undefined) {
      sql += " AND actionable = ?";
      params.push(filter.actionable);
    }

    // Order by severity (critical first), then by updated_at
    sql += `
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'error' THEN 2
          WHEN 'warning' THEN 3
          WHEN 'suggestion' THEN 4
          WHEN 'note' THEN 5
        END,
        updated_at DESC
    `;

    if (filter.limit) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }

    const rows = await this.db.all(sql, ...params);

    return rows.map((row) => this.rowToDiagnostics(row as Record<string, unknown>));
  }

  /**
   * Get diagnostics summary grouped by a dimension
   */
  async getDiagnosticsSummary(
    groupBy: "source" | "severity" | "category" | "repo"
  ): Promise<DiagnosticsSummary[]> {
    if (!this.db) throw new Error("Database not initialized");

    const columnMap: Record<string, string> = {
      source: "source",
      severity: "severity",
      category: "category",
      repo: "repo_id",
    };

    const column = columnMap[groupBy];

    const sql = `
      SELECT
        ${column} as group_key,
        COUNT(*) as count,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_count,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning_count,
        SUM(CASE WHEN severity = 'suggestion' THEN 1 ELSE 0 END) as suggestion_count,
        SUM(CASE WHEN severity = 'note' THEN 1 ELSE 0 END) as note_count
      FROM unified_diagnostics
      WHERE resolved = FALSE
      GROUP BY ${column}
      ORDER BY count DESC
    `;

    const rows = await this.db.all(sql);

    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        group_key: r.group_key as string,
        count: Number(r.count),
        critical_count: Number(r.critical_count ?? 0),
        error_count: Number(r.error_count ?? 0),
        warning_count: Number(r.warning_count ?? 0),
        suggestion_count: Number(r.suggestion_count ?? 0),
        note_count: Number(r.note_count ?? 0),
      };
    });
  }

  /**
   * Get total diagnostics counts
   */
  async getDiagnosticsCounts(): Promise<{
    total: number;
    unresolved: number;
    critical: number;
    error: number;
    warning: number;
    suggestion: number;
    note: number;
  }> {
    if (!this.db) throw new Error("Database not initialized");

    const rows = await this.db.all(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN resolved = FALSE THEN 1 ELSE 0 END) as unresolved,
        SUM(CASE WHEN severity = 'critical' AND resolved = FALSE THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'error' AND resolved = FALSE THEN 1 ELSE 0 END) as error,
        SUM(CASE WHEN severity = 'warning' AND resolved = FALSE THEN 1 ELSE 0 END) as warning,
        SUM(CASE WHEN severity = 'suggestion' AND resolved = FALSE THEN 1 ELSE 0 END) as suggestion,
        SUM(CASE WHEN severity = 'note' AND resolved = FALSE THEN 1 ELSE 0 END) as note
      FROM unified_diagnostics
    `);

    if (rows.length === 0) {
      return {
        total: 0,
        unresolved: 0,
        critical: 0,
        error: 0,
        warning: 0,
        suggestion: 0,
        note: 0,
      };
    }

    const r = rows[0] as Record<string, unknown>;
    return {
      total: Number(r.total ?? 0),
      unresolved: Number(r.unresolved ?? 0),
      critical: Number(r.critical ?? 0),
      error: Number(r.error ?? 0),
      warning: Number(r.warning ?? 0),
      suggestion: Number(r.suggestion ?? 0),
      note: Number(r.note ?? 0),
    };
  }

  /**
   * Mark diagnostics as resolved
   */
  async resolveDiagnostics(diagnosticIds: string[]): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
    if (diagnosticIds.length === 0) return;

    const placeholders = diagnosticIds.map(() => "?").join(", ");
    const now = new Date().toISOString();

    await this.db.run(
      `UPDATE unified_diagnostics SET resolved = TRUE, updated_at = ? WHERE diagnostic_id IN (${placeholders})`,
      now,
      ...diagnosticIds
    );
  }

  /**
   * Get diagnostics summary filtered by sources
   * Used by validation API to get summary for only validation sources
   */
  async getDiagnosticsSummaryFiltered(
    groupBy: "source" | "severity" | "category" | "repo",
    sources: DiagnosticsSource[]
  ): Promise<DiagnosticsSummary[]> {
    if (!this.db) throw new Error("Database not initialized");

    const columnMap: Record<string, string> = {
      source: "source",
      severity: "severity",
      category: "category",
      repo: "repo_id",
    };

    const column = columnMap[groupBy];
    const sourcePlaceholders = sources.map(() => "?").join(", ");

    const sql = `
      SELECT
        ${column} as group_key,
        COUNT(*) as count,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_count,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning_count,
        SUM(CASE WHEN severity = 'suggestion' THEN 1 ELSE 0 END) as suggestion_count,
        SUM(CASE WHEN severity = 'note' THEN 1 ELSE 0 END) as note_count
      FROM unified_diagnostics
      WHERE resolved = FALSE AND source IN (${sourcePlaceholders})
      GROUP BY ${column}
      ORDER BY count DESC
    `;

    const rows = await this.db.all(sql, ...sources);

    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        group_key: r.group_key as string,
        count: Number(r.count),
        critical_count: Number(r.critical_count ?? 0),
        error_count: Number(r.error_count ?? 0),
        warning_count: Number(r.warning_count ?? 0),
        suggestion_count: Number(r.suggestion_count ?? 0),
        note_count: Number(r.note_count ?? 0),
      };
    });
  }

  /**
   * Get diagnostics counts filtered by sources
   * Used by validation API to get counts for only validation sources
   */
  async getDiagnosticsCountsFiltered(sources: DiagnosticsSource[]): Promise<{
    total: number;
    critical: number;
    error: number;
    warning: number;
    suggestion: number;
    note: number;
  }> {
    if (!this.db) throw new Error("Database not initialized");

    const sourcePlaceholders = sources.map(() => "?").join(", ");

    const rows = await this.db.all(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error,
        SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning,
        SUM(CASE WHEN severity = 'suggestion' THEN 1 ELSE 0 END) as suggestion,
        SUM(CASE WHEN severity = 'note' THEN 1 ELSE 0 END) as note
      FROM unified_diagnostics
      WHERE resolved = FALSE AND source IN (${sourcePlaceholders})
    `,
      ...sources
    );

    if (rows.length === 0) {
      return {
        total: 0,
        critical: 0,
        error: 0,
        warning: 0,
        suggestion: 0,
        note: 0,
      };
    }

    const r = rows[0] as Record<string, unknown>;
    return {
      total: Number(r.total ?? 0),
      critical: Number(r.critical ?? 0),
      error: Number(r.error ?? 0),
      warning: Number(r.warning ?? 0),
      suggestion: Number(r.suggestion ?? 0),
      note: Number(r.note ?? 0),
    };
  }

  /**
   * Convert a database row to UnifiedDiagnostics
   */
  private rowToDiagnostics(r: Record<string, unknown>): UnifiedDiagnostics {
    return {
      diagnostic_id: r.diagnostic_id as string,
      repo_id: r.repo_id as string,
      source: r.source as DiagnosticsSource,
      file_path: r.file_path as string | null,
      line_number: r.line_number as number | null,
      column_number: r.column_number as number | null,
      severity: r.severity as DiagnosticsSeverity,
      category: r.category as DiagnosticsCategory,
      title: r.title as string,
      description: r.description as string,
      code: r.code as string | null,
      suggestion: r.suggestion as string | null,
      resolved: Boolean(r.resolved),
      actionable: Boolean(r.actionable),
      created_at: this.formatTimestamp(r.created_at),
      updated_at: this.formatTimestamp(r.updated_at),
      github_issue_number: r.github_issue_number as number | null,
      github_pr_number: r.github_pr_number as number | null,
      workflow_name: r.workflow_name as string | null,
      ci_url: r.ci_url as string | null,
    };
  }
}

/**
 * Create a HubStorage instance
 */
export function createHubStorage(hubPath: string): HubStorage {
  return new HubStorage(hubPath);
}
