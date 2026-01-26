/**
 * Query Context
 *
 * Provides the execution context for queries, managing DuckDB connections
 * and package discovery. Used internally by all query functions.
 */

import type { Connection } from "duckdb-async";
import type { DuckDBPool } from "../storage/duckdb-pool.js";
import { executeWithRecovery } from "../storage/duckdb-pool.js";
import { getParquetFilePaths, getSeedPaths } from "../types/config.js";
import { fileExists } from "../utils/atomic-write.js";
import { QueryError, type ReadinessInfo } from "./types.js";

// ============================================================================
// Query Context
// ============================================================================

/**
 * Query execution context - provides access to database and packages
 */
export interface QueryContext {
  /** DuckDB connection pool */
  pool: DuckDBPool;

  /** Package paths to query (absolute paths) */
  packages: string[];

  /** Branch partition (default: "base") */
  branch: string;
}

/**
 * Options for creating a query context
 */
export interface QueryContextOptions {
  /** DuckDB connection pool */
  pool: DuckDBPool;

  /** Package paths to query (absolute paths) */
  packages: string[];

  /** Branch partition (default: "base") */
  branch?: string;
}

/**
 * Create a query context
 */
export function createQueryContext(options: QueryContextOptions): QueryContext {
  return {
    pool: options.pool,
    packages: options.packages,
    branch: options.branch ?? "base",
  };
}

// ============================================================================
// View Management
// ============================================================================

/**
 * Parquet file paths for a package
 */
interface ParquetPaths {
  nodes: string[];
  edges: string[];
  externalRefs: string[];
  effects: string[];
}

/**
 * Collect parquet file paths from packages
 */
async function collectParquetPaths(
  packages: string[],
  branch: string
): Promise<{
  paths: ParquetPaths;
  packagesWithSeeds: string[];
  packagesMissingSeeds: string[];
}> {
  const paths: ParquetPaths = {
    nodes: [],
    edges: [],
    externalRefs: [],
    effects: [],
  };
  const packagesWithSeeds: string[] = [];
  const packagesMissingSeeds: string[] = [];

  for (const pkgPath of packages) {
    const seedPaths = getSeedPaths(pkgPath, branch);
    const parquetPaths = getParquetFilePaths(seedPaths.basePath);

    // Check which files exist
    const hasNodes = await fileExists(parquetPaths.nodes);
    const hasEdges = await fileExists(parquetPaths.edges);
    const hasRefs = await fileExists(parquetPaths.externalRefs);
    const hasEffects = await fileExists(parquetPaths.effects);

    // Add existing files to query paths
    if (hasNodes) paths.nodes.push(parquetPaths.nodes);
    if (hasEdges) paths.edges.push(parquetPaths.edges);
    if (hasRefs) paths.externalRefs.push(parquetPaths.externalRefs);
    if (hasEffects) paths.effects.push(parquetPaths.effects);

    // Track packages with/without seeds
    if (hasNodes || hasEdges || hasRefs || hasEffects) {
      packagesWithSeeds.push(pkgPath);
    } else {
      packagesMissingSeeds.push(pkgPath);
    }
  }

  return { paths, packagesWithSeeds, packagesMissingSeeds };
}

/**
 * Create a DuckDB view from parquet files
 */
async function createView(
  conn: Connection,
  viewName: string,
  parquetPaths: string[]
): Promise<void> {
  if (parquetPaths.length === 0) return;

  if (parquetPaths.length === 1) {
    const firstPath = parquetPaths[0];
    if (firstPath) {
      const escapedPath = firstPath.replace(/'/g, "''");
      await conn.run(
        `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_parquet('${escapedPath}')`
      );
    }
  } else {
    const escapedPaths = parquetPaths.map((p) => `'${p.replace(/'/g, "''")}'`).join(", ");
    await conn.run(
      `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_parquet([${escapedPaths}])`
    );
  }
}

// ============================================================================
// Query Execution
// ============================================================================

/**
 * Execute a SQL query against the query context
 */
export async function executeQuery<T = Record<string, unknown>>(
  ctx: QueryContext,
  sql: string
): Promise<{
  rows: T[];
  rowCount: number;
  viewsCreated: string[];
  warnings: string[];
}> {
  const viewsCreated: string[] = [];
  const warnings: string[] = [];

  if (ctx.packages.length === 0) {
    throw new QueryError(
      "No packages to query",
      "NO_PACKAGES",
      "Run 'devac sync' to analyze packages"
    );
  }

  const { paths, packagesWithSeeds, packagesMissingSeeds } = await collectParquetPaths(
    ctx.packages,
    ctx.branch
  );

  // Generate warnings for missing seeds
  if (packagesMissingSeeds.length > 0) {
    const pkgNames = packagesMissingSeeds.map((p) => {
      const parts = p.split("/");
      return parts[parts.length - 1] ?? p;
    });

    if (packagesMissingSeeds.length === ctx.packages.length) {
      warnings.push(
        `No seed files found. Run 'devac sync' to analyze the codebase. Packages without seeds: ${pkgNames.join(", ")}`
      );
    } else {
      warnings.push(
        `${packagesMissingSeeds.length}/${ctx.packages.length} packages have no seeds: ${pkgNames.join(", ")}`
      );
    }
  }

  // If no packages have seeds, return empty result
  if (packagesWithSeeds.length === 0) {
    return {
      rows: [],
      rowCount: 0,
      viewsCreated: [],
      warnings,
    };
  }

  const rows = await executeWithRecovery(ctx.pool, async (conn) => {
    // Create views for available tables
    if (paths.nodes.length > 0) {
      await createView(conn, "nodes", paths.nodes);
      viewsCreated.push("nodes");
    }
    if (paths.edges.length > 0) {
      await createView(conn, "edges", paths.edges);
      viewsCreated.push("edges");
    }
    if (paths.externalRefs.length > 0) {
      await createView(conn, "external_refs", paths.externalRefs);
      viewsCreated.push("external_refs");
    }
    if (paths.effects.length > 0) {
      await createView(conn, "effects", paths.effects);
      viewsCreated.push("effects");
    }

    // Execute query
    return await conn.all(sql);
  });

  return {
    rows: rows as T[],
    rowCount: rows.length,
    viewsCreated,
    warnings,
  };
}

/**
 * Execute a SQL query and get count
 */
export async function executeCountQuery(
  ctx: QueryContext,
  sql: string
): Promise<{
  count: number;
  warnings: string[];
}> {
  const result = await executeQuery<{ count: number | bigint }>(ctx, sql);

  const count = result.rows[0]?.count;
  return {
    count: typeof count === "bigint" ? Number(count) : (count ?? 0),
    warnings: result.warnings,
  };
}

// ============================================================================
// Readiness Checking
// ============================================================================

/**
 * Check if query context is ready for queries
 */
export async function checkReadiness(ctx: QueryContext): Promise<ReadinessInfo> {
  if (ctx.packages.length === 0) {
    return {
      ready: false,
      reason: "No packages available to query",
      suggestion: "Run 'devac sync' to analyze packages",
      packagesAvailable: 0,
      packagesMissingSeeds: 0,
    };
  }

  const { packagesWithSeeds, packagesMissingSeeds } = await collectParquetPaths(
    ctx.packages,
    ctx.branch
  );

  if (packagesWithSeeds.length === 0) {
    return {
      ready: false,
      reason: "No packages have been analyzed",
      suggestion: "Run 'devac sync' to analyze packages",
      packagesAvailable: ctx.packages.length,
      packagesMissingSeeds: packagesMissingSeeds.length,
    };
  }

  return {
    ready: true,
    packagesAvailable: packagesWithSeeds.length,
    packagesMissingSeeds: packagesMissingSeeds.length,
  };
}
