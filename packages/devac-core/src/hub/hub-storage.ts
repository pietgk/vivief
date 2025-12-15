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
 * Hub Storage
 *
 * Manages the central DuckDB database for federation.
 */
export class HubStorage {
  private db: Database | null = null;
  private initialized = false;

  constructor(private hubPath: string) {}

  /**
   * Initialize the hub database
   */
  async init(): Promise<void> {
    if (this.initialized && this.db) {
      return;
    }

    // Ensure directory exists
    const dir = path.dirname(this.hubPath);
    await fs.mkdir(dir, { recursive: true });

    // Open or create database
    this.db = await Database.create(this.hubPath);

    // Create tables
    await this.createTables();

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
}

/**
 * Create a HubStorage instance
 */
export function createHubStorage(hubPath: string): HubStorage {
  return new HubStorage(hubPath);
}
