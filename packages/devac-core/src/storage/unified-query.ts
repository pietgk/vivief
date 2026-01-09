/**
 * Unified Query System
 *
 * Single entry point for all DevAC queries regardless of level (package/repo/workspace).
 * The query level is implicit from the packages array:
 * - 1 package → package-level query
 * - Multiple packages from same repo → repo-level query
 * - Packages from multiple repos → workspace-level query
 */

import type { Connection } from "duckdb-async";
import { getParquetFilePaths, getSeedPaths } from "../types/config.js";
import { fileExists } from "../utils/atomic-write.js";
import { type DuckDBPool, executeWithRecovery } from "./duckdb-pool.js";

/**
 * Query configuration - packages array is the key abstraction
 */
export interface QueryConfig {
  /** Package paths to query (absolute paths) */
  packages: string[];

  /** SQL query to execute */
  sql: string;

  /** Branch partition (default: "base") */
  branch?: string;
}

/**
 * Query result with metadata
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  timeMs: number;
  viewsCreated: string[];
  packagesQueried: string[];
  warnings: string[];
}

/**
 * Execute a query across specified packages
 *
 * @example
 * // Package level - 1 package
 * await query(pool, {
 *   packages: ["/repo/packages/core"],
 *   sql: "SELECT * FROM nodes"
 * });
 *
 * // Repo level - multiple packages
 * const pkgs = await discoverPackagesInRepo("/repo");
 * await query(pool, {
 *   packages: pkgs.map(p => p.path),
 *   sql: "SELECT * FROM nodes"
 * });
 *
 * // Workspace level - packages from all repos
 * const allPkgs = await getAllPackagesFromHub();
 * await query(pool, {
 *   packages: allPkgs,
 *   sql: "SELECT * FROM nodes"
 * });
 */
export async function query<T = Record<string, unknown>>(
  pool: DuckDBPool,
  config: QueryConfig
): Promise<QueryResult<T>> {
  const { packages, sql, branch = "base" } = config;
  const startTime = Date.now();
  const viewsCreated: string[] = [];
  const warnings: string[] = [];
  const packagesQueried: string[] = [];

  if (packages.length === 0) {
    return {
      rows: [],
      rowCount: 0,
      timeMs: Date.now() - startTime,
      viewsCreated: [],
      packagesQueried: [],
      warnings: ["No packages provided to query"],
    };
  }

  // All provided packages are trusted (from manifest)
  packagesQueried.push(...packages);

  const rows = await executeWithRecovery(pool, async (conn) => {
    // Collect parquet paths from all valid packages
    const nodePaths: string[] = [];
    const edgePaths: string[] = [];
    const refPaths: string[] = [];
    const effectPaths: string[] = [];

    for (const pkgPath of packagesQueried) {
      const seedPaths = getSeedPaths(pkgPath, branch);
      const parquetPaths = getParquetFilePaths(seedPaths.basePath);

      if (await fileExists(parquetPaths.nodes)) nodePaths.push(parquetPaths.nodes);
      if (await fileExists(parquetPaths.edges)) edgePaths.push(parquetPaths.edges);
      if (await fileExists(parquetPaths.externalRefs)) refPaths.push(parquetPaths.externalRefs);
      if (await fileExists(parquetPaths.effects)) effectPaths.push(parquetPaths.effects);
    }

    // Create views (single file or aggregate based on count)
    if (nodePaths.length > 0) {
      await createView(conn, "nodes", nodePaths);
      viewsCreated.push("nodes");
    }
    if (edgePaths.length > 0) {
      await createView(conn, "edges", edgePaths);
      viewsCreated.push("edges");
    }
    if (refPaths.length > 0) {
      await createView(conn, "external_refs", refPaths);
      viewsCreated.push("external_refs");
    }
    if (effectPaths.length > 0) {
      await createView(conn, "effects", effectPaths);
      viewsCreated.push("effects");
    }

    // Execute query
    return await conn.all(sql);
  });

  return {
    rows: rows as T[],
    rowCount: rows.length,
    timeMs: Date.now() - startTime,
    viewsCreated,
    packagesQueried,
    warnings,
  };
}

/**
 * Create a DuckDB view from one or more parquet files
 *
 * Uses read_parquet('path') for single files and read_parquet([paths]) for multiple.
 */
async function createView(
  conn: Connection,
  viewName: string,
  parquetPaths: string[]
): Promise<void> {
  if (parquetPaths.length === 1) {
    // Single file - simple view
    const firstPath = parquetPaths[0];
    if (firstPath) {
      const escapedPath = firstPath.replace(/'/g, "''");
      await conn.run(
        `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_parquet('${escapedPath}')`
      );
    }
  } else {
    // Multiple files - aggregate view
    const escapedPaths = parquetPaths.map((p) => `'${p.replace(/'/g, "''")}'`).join(", ");
    await conn.run(
      `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_parquet([${escapedPaths}])`
    );
  }
}
