/**
 * Seed Reader Implementation
 *
 * Query utilities for reading seed data from Parquet files.
 * Based on DevAC v2.0 spec Section 7.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Connection } from "duckdb-async";
import { type SeedPaths, getSeedPaths } from "../types/config.js";
import type { ParsedEdge, ParsedExternalRef, ParsedNode } from "../types/index.js";
import { type DuckDBPool, executeWithRecovery } from "./duckdb-pool.js";
import { getUnifiedQuery } from "./parquet-schemas.js";

/**
 * Query result type
 */
export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
  timeMs: number;
}

/**
 * Integrity check result
 */
export interface IntegrityResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    refCount: number;
    fileCount: number;
    unresolvedRefs: number;
    orphanedEdges: number;
  };
}

/**
 * Seed Reader
 *
 * Provides query utilities for reading Parquet seed data.
 */
export class SeedReader {
  constructor(
    private pool: DuckDBPool,
    private packagePath: string
  ) {}

  /**
   * Read all nodes (unified view of base + branch)
   */
  async readNodes(branch = "base"): Promise<QueryResult<ParsedNode>> {
    const startTime = Date.now();
    const paths = getSeedPaths(this.packagePath, branch);

    const rows = await executeWithRecovery(this.pool, async (conn) => {
      const query = await this.buildUnifiedQuery("nodes", paths, conn);
      if (!query) return [];
      return await conn.all(query);
    });

    return {
      rows: rows as ParsedNode[],
      rowCount: rows.length,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Read all edges (unified view of base + branch)
   */
  async readEdges(branch = "base"): Promise<QueryResult<ParsedEdge>> {
    const startTime = Date.now();
    const paths = getSeedPaths(this.packagePath, branch);

    const rows = await executeWithRecovery(this.pool, async (conn) => {
      const query = await this.buildUnifiedQuery("edges", paths, conn);
      if (!query) return [];
      return await conn.all(query);
    });

    return {
      rows: rows as ParsedEdge[],
      rowCount: rows.length,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Read all external references (unified view of base + branch)
   */
  async readExternalRefs(branch = "base"): Promise<QueryResult<ParsedExternalRef>> {
    const startTime = Date.now();
    const paths = getSeedPaths(this.packagePath, branch);

    const rows = await executeWithRecovery(this.pool, async (conn) => {
      const query = await this.buildUnifiedQuery("external_refs", paths, conn);
      if (!query) return [];
      return await conn.all(query);
    });

    return {
      rows: rows as ParsedExternalRef[],
      rowCount: rows.length,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Execute a custom SQL query on seed data
   *
   * The query can reference:
   * - read_parquet('path/to/nodes.parquet') for nodes
   * - read_parquet('path/to/edges.parquet') for edges
   * - read_parquet('path/to/external_refs.parquet') for refs
   */
  async querySeeds<T = Record<string, unknown>>(sql: string): Promise<QueryResult<T>> {
    const startTime = Date.now();

    const rows = await executeWithRecovery(this.pool, async (conn) => {
      return await conn.all(sql);
    });

    return {
      rows: rows as T[],
      rowCount: rows.length,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Get nodes by entity IDs
   */
  async getNodesByIds(entityIds: string[], branch = "base"): Promise<ParsedNode[]> {
    if (entityIds.length === 0) return [];

    const paths = getSeedPaths(this.packagePath, branch);
    const basePath = path.join(paths.basePath, "nodes.parquet");
    const branchPath = path.join(paths.branchPath, "nodes.parquet");

    return await executeWithRecovery(this.pool, async (conn) => {
      const idList = entityIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
      const baseExists = await this.fileExists(basePath);
      const branchExists = await this.fileExists(branchPath);

      if (!baseExists && !branchExists) return [];

      let query: string;
      if (branch === "base" || !branchExists) {
        query = `SELECT * FROM read_parquet('${basePath}') WHERE entity_id IN (${idList}) AND is_deleted = false`;
      } else {
        query = `
          SELECT * FROM (
            SELECT * FROM read_parquet('${branchPath}')
            WHERE entity_id IN (${idList}) AND is_deleted = false
            UNION ALL
            SELECT base.* FROM read_parquet('${basePath}') base
            WHERE base.entity_id IN (${idList})
              AND base.is_deleted = false
              AND NOT EXISTS (
                SELECT 1 FROM read_parquet('${branchPath}') branch
                WHERE branch.entity_id = base.entity_id
              )
          )
        `;
      }

      return (await conn.all(query)) as ParsedNode[];
    });
  }

  /**
   * Get nodes by file path
   */
  async getNodesByFile(filePath: string, branch = "base"): Promise<ParsedNode[]> {
    const paths = getSeedPaths(this.packagePath, branch);
    const basePath = path.join(paths.basePath, "nodes.parquet");
    const branchPath = path.join(paths.branchPath, "nodes.parquet");

    return await executeWithRecovery(this.pool, async (conn) => {
      const escapedPath = filePath.replace(/'/g, "''");
      const baseExists = await this.fileExists(basePath);
      const branchExists = await this.fileExists(branchPath);

      if (!baseExists && !branchExists) return [];

      let query: string;
      if (branch === "base" || !branchExists) {
        query = `SELECT * FROM read_parquet('${basePath}') WHERE file_path = '${escapedPath}' AND is_deleted = false`;
      } else {
        query = `
          SELECT * FROM (
            SELECT * FROM read_parquet('${branchPath}')
            WHERE file_path = '${escapedPath}' AND is_deleted = false
            UNION ALL
            SELECT base.* FROM read_parquet('${basePath}') base
            WHERE base.file_path = '${escapedPath}'
              AND base.is_deleted = false
              AND NOT EXISTS (
                SELECT 1 FROM read_parquet('${branchPath}') branch
                WHERE branch.file_path = base.file_path
              )
          )
        `;
      }

      return (await conn.all(query)) as ParsedNode[];
    });
  }

  /**
   * Get edges by source entity ID
   */
  async getEdgesBySource(sourceEntityId: string, branch = "base"): Promise<ParsedEdge[]> {
    const paths = getSeedPaths(this.packagePath, branch);
    const basePath = path.join(paths.basePath, "edges.parquet");
    const branchPath = path.join(paths.branchPath, "edges.parquet");

    return await executeWithRecovery(this.pool, async (conn) => {
      const escapedId = sourceEntityId.replace(/'/g, "''");
      const baseExists = await this.fileExists(basePath);
      const branchExists = await this.fileExists(branchPath);

      if (!baseExists && !branchExists) return [];

      let query: string;
      if (branch === "base" || !branchExists) {
        query = `SELECT * FROM read_parquet('${basePath}') WHERE source_entity_id = '${escapedId}' AND is_deleted = false`;
      } else {
        query = `
          SELECT * FROM (
            SELECT * FROM read_parquet('${branchPath}')
            WHERE source_entity_id = '${escapedId}' AND is_deleted = false
            UNION ALL
            SELECT base.* FROM read_parquet('${basePath}') base
            WHERE base.source_entity_id = '${escapedId}'
              AND base.is_deleted = false
              AND NOT EXISTS (
                SELECT 1 FROM read_parquet('${branchPath}') branch
                WHERE branch.source_entity_id = base.source_entity_id
                  AND branch.target_entity_id = base.target_entity_id
                  AND branch.edge_type = base.edge_type
              )
          )
        `;
      }

      return (await conn.all(query)) as ParsedEdge[];
    });
  }

  /**
   * Get edges by target entity ID
   */
  async getEdgesByTarget(targetEntityId: string, branch = "base"): Promise<ParsedEdge[]> {
    const paths = getSeedPaths(this.packagePath, branch);
    const basePath = path.join(paths.basePath, "edges.parquet");
    const branchPath = path.join(paths.branchPath, "edges.parquet");

    return await executeWithRecovery(this.pool, async (conn) => {
      const escapedId = targetEntityId.replace(/'/g, "''");
      const baseExists = await this.fileExists(basePath);
      const branchExists = await this.fileExists(branchPath);

      if (!baseExists && !branchExists) return [];

      let query: string;
      if (branch === "base" || !branchExists) {
        query = `SELECT * FROM read_parquet('${basePath}') WHERE target_entity_id = '${escapedId}' AND is_deleted = false`;
      } else {
        query = `
          SELECT * FROM (
            SELECT * FROM read_parquet('${branchPath}')
            WHERE target_entity_id = '${escapedId}' AND is_deleted = false
            UNION ALL
            SELECT base.* FROM read_parquet('${basePath}') base
            WHERE base.target_entity_id = '${escapedId}'
              AND base.is_deleted = false
              AND NOT EXISTS (
                SELECT 1 FROM read_parquet('${branchPath}') branch
                WHERE branch.source_entity_id = base.source_entity_id
                  AND branch.target_entity_id = base.target_entity_id
                  AND branch.edge_type = base.edge_type
              )
          )
        `;
      }

      return (await conn.all(query)) as ParsedEdge[];
    });
  }

  /**
   * Get external references by file path
   */
  async getExternalRefsByFile(filePath: string, branch = "base"): Promise<ParsedExternalRef[]> {
    const paths = getSeedPaths(this.packagePath, branch);
    const basePath = path.join(paths.basePath, "external_refs.parquet");
    const branchPath = path.join(paths.branchPath, "external_refs.parquet");

    return await executeWithRecovery(this.pool, async (conn) => {
      const escapedPath = filePath.replace(/'/g, "''");
      const baseExists = await this.fileExists(basePath);
      const branchExists = await this.fileExists(branchPath);

      if (!baseExists && !branchExists) return [];

      let query: string;
      if (branch === "base" || !branchExists) {
        query = `SELECT * FROM read_parquet('${basePath}') WHERE source_file_path = '${escapedPath}' AND is_deleted = false`;
      } else {
        query = `
          SELECT * FROM (
            SELECT * FROM read_parquet('${branchPath}')
            WHERE source_file_path = '${escapedPath}' AND is_deleted = false
            UNION ALL
            SELECT base.* FROM read_parquet('${basePath}') base
            WHERE base.source_file_path = '${escapedPath}'
              AND base.is_deleted = false
              AND NOT EXISTS (
                SELECT 1 FROM read_parquet('${branchPath}') branch
                WHERE branch.source_entity_id = base.source_entity_id
                  AND branch.module_specifier = base.module_specifier
                  AND branch.imported_symbol = base.imported_symbol
              )
          )
        `;
      }

      return (await conn.all(query)) as ParsedExternalRef[];
    });
  }

  /**
   * Get unresolved external references
   */
  async getUnresolvedRefs(branch = "base"): Promise<ParsedExternalRef[]> {
    const paths = getSeedPaths(this.packagePath, branch);
    const basePath = path.join(paths.basePath, "external_refs.parquet");
    const branchPath = path.join(paths.branchPath, "external_refs.parquet");

    return await executeWithRecovery(this.pool, async (conn) => {
      const baseExists = await this.fileExists(basePath);
      const branchExists = await this.fileExists(branchPath);

      if (!baseExists && !branchExists) return [];

      let query: string;
      if (branch === "base" || !branchExists) {
        query = `SELECT * FROM read_parquet('${basePath}') WHERE is_resolved = false AND is_deleted = false`;
      } else {
        query = `
          SELECT * FROM (
            SELECT * FROM read_parquet('${branchPath}')
            WHERE is_resolved = false AND is_deleted = false
            UNION ALL
            SELECT base.* FROM read_parquet('${basePath}') base
            WHERE base.is_resolved = false
              AND base.is_deleted = false
              AND NOT EXISTS (
                SELECT 1 FROM read_parquet('${branchPath}') branch
                WHERE branch.source_entity_id = base.source_entity_id
                  AND branch.module_specifier = base.module_specifier
                  AND branch.imported_symbol = base.imported_symbol
              )
          )
        `;
      }

      return (await conn.all(query)) as ParsedExternalRef[];
    });
  }

  /**
   * Get file content hashes from nodes
   */
  async getFileHashes(branch = "base"): Promise<Map<string, string>> {
    const paths = getSeedPaths(this.packagePath, branch);
    const basePath = path.join(paths.basePath, "nodes.parquet");

    return await executeWithRecovery(this.pool, async (conn) => {
      const hashMap = new Map<string, string>();

      if (!(await this.fileExists(basePath))) return hashMap;

      const query = `SELECT DISTINCT file_path, source_file_hash FROM read_parquet('${basePath}') WHERE is_deleted = false`;
      const rows = await conn.all(query);

      for (const row of rows) {
        hashMap.set(row.file_path as string, row.source_file_hash as string);
      }

      return hashMap;
    });
  }

  /**
   * Validate seed integrity
   */
  async validateIntegrity(branch = "base"): Promise<IntegrityResult> {
    const paths = getSeedPaths(this.packagePath, branch);
    const errors: string[] = [];
    const warnings: string[] = [];

    return await executeWithRecovery(this.pool, async (conn) => {
      const basePath = paths.basePath;
      const nodesPath = path.join(basePath, "nodes.parquet");
      const edgesPath = path.join(basePath, "edges.parquet");
      const refsPath = path.join(basePath, "external_refs.parquet");

      let nodeCount = 0;
      let edgeCount = 0;
      let refCount = 0;
      let fileCount = 0;
      let unresolvedRefs = 0;
      let orphanedEdges = 0;

      // Check nodes
      if (await this.fileExists(nodesPath)) {
        try {
          const nodeStats = await conn.all(
            `SELECT COUNT(*) as count, COUNT(DISTINCT file_path) as files FROM read_parquet('${nodesPath}') WHERE is_deleted = false`
          );
          const firstRow = nodeStats[0] as Record<string, unknown> | undefined;
          nodeCount = Number(firstRow?.count ?? 0);
          fileCount = Number(firstRow?.files ?? 0);
        } catch (error) {
          errors.push(
            `Failed to read nodes.parquet: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } else {
        warnings.push("nodes.parquet does not exist");
      }

      // Check edges
      if (await this.fileExists(edgesPath)) {
        try {
          const edgeStats = await conn.all(
            `SELECT COUNT(*) as count FROM read_parquet('${edgesPath}') WHERE is_deleted = false`
          );
          const firstRow = edgeStats[0] as Record<string, unknown> | undefined;
          edgeCount = Number(firstRow?.count ?? 0);

          // Check for orphaned edges (referencing non-existent nodes)
          if (await this.fileExists(nodesPath)) {
            const orphanCheck = await conn.all(`
              SELECT COUNT(*) as count FROM read_parquet('${edgesPath}') e
              WHERE e.is_deleted = false
                AND NOT EXISTS (
                  SELECT 1 FROM read_parquet('${nodesPath}') n
                  WHERE n.entity_id = e.source_entity_id AND n.is_deleted = false
                )
            `);
            const orphanRow = orphanCheck[0] as Record<string, unknown> | undefined;
            orphanedEdges = Number(orphanRow?.count ?? 0);
            if (orphanedEdges > 0) {
              warnings.push(`Found ${orphanedEdges} edges with missing source nodes`);
            }
          }
        } catch (error) {
          errors.push(
            `Failed to read edges.parquet: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Check external refs
      if (await this.fileExists(refsPath)) {
        try {
          const refStats = await conn.all(`
            SELECT
              COUNT(*) as total,
              SUM(CASE WHEN is_resolved = false THEN 1 ELSE 0 END) as unresolved
            FROM read_parquet('${refsPath}')
            WHERE is_deleted = false
          `);
          const firstRow = refStats[0] as Record<string, unknown> | undefined;
          refCount = Number(firstRow?.total ?? 0);
          unresolvedRefs = Number(firstRow?.unresolved ?? 0);
        } catch (error) {
          errors.push(
            `Failed to read external_refs.parquet: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Check meta.json
      const metaPath = paths.metaJson;
      if (!(await this.fileExists(metaPath))) {
        warnings.push("meta.json does not exist");
      } else {
        try {
          const metaContent = await fs.readFile(metaPath, "utf-8");
          const meta = JSON.parse(metaContent);
          if (!meta.schemaVersion) {
            errors.push("meta.json missing schemaVersion");
          }
        } catch (error) {
          errors.push(
            `Invalid meta.json: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        stats: {
          nodeCount,
          edgeCount,
          refCount,
          fileCount,
          unresolvedRefs,
          orphanedEdges,
        },
      };
    });
  }

  /**
   * Get statistics about the seeds
   */
  async getStats(branch = "base"): Promise<IntegrityResult["stats"]> {
    const result = await this.validateIntegrity(branch);
    return result.stats;
  }

  /**
   * Build unified query for base + branch
   */
  private async buildUnifiedQuery(
    tableName: string,
    paths: SeedPaths,
    _conn: Connection
  ): Promise<string | null> {
    const basePath = path.join(paths.basePath, `${tableName}.parquet`);
    const branchPath = path.join(paths.branchPath, `${tableName}.parquet`);

    const baseExists = await this.fileExists(basePath);
    const branchExists = await this.fileExists(branchPath);

    if (!baseExists && !branchExists) {
      return null;
    }

    return getUnifiedQuery(tableName, basePath, branchPath, {
      base: baseExists,
      branch: branchExists,
    });
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a SeedReader instance
 */
export function createSeedReader(pool: DuckDBPool, packagePath: string): SeedReader {
  return new SeedReader(pool, packagePath);
}

/**
 * Query across multiple packages
 */
export async function queryMultiplePackages<T = Record<string, unknown>>(
  pool: DuckDBPool,
  packagePaths: string[],
  sql: string,
  branch = "base"
): Promise<QueryResult<T>> {
  const startTime = Date.now();

  // Build paths for all packages
  const nodePaths: string[] = [];
  const edgePaths: string[] = [];
  const refPaths: string[] = [];

  for (const pkgPath of packagePaths) {
    const paths = getSeedPaths(pkgPath, branch);
    nodePaths.push(path.join(paths.basePath, "nodes.parquet"));
    edgePaths.push(path.join(paths.basePath, "edges.parquet"));
    refPaths.push(path.join(paths.basePath, "external_refs.parquet"));
  }

  // Replace placeholders in SQL
  const processedSql = sql
    .replace(/{nodes}/g, `read_parquet([${nodePaths.map((p) => `'${p}'`).join(", ")}])`)
    .replace(/{edges}/g, `read_parquet([${edgePaths.map((p) => `'${p}'`).join(", ")}])`)
    .replace(/{external_refs}/g, `read_parquet([${refPaths.map((p) => `'${p}'`).join(", ")}])`);

  const rows = await executeWithRecovery(pool, async (conn) => {
    return await conn.all(processedSql);
  });

  return {
    rows: rows as T[],
    rowCount: rows.length,
    timeMs: Date.now() - startTime,
  };
}
