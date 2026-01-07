/**
 * Query Context Implementation
 *
 * Sets up DuckDB views for ergonomic queries against seed files.
 * Enables `FROM nodes` instead of `FROM read_parquet('/full/path/...')`.
 *
 * @deprecated Use query() from unified-query.ts instead for new code.
 * This module is maintained for backwards compatibility.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Connection } from "duckdb-async";
import { getParquetFilePaths, getSeedPaths } from "../types/config.js";
import { fileExists } from "../utils/atomic-write.js";
import { type DuckDBPool, executeWithRecovery } from "./duckdb-pool.js";
import { query as unifiedQuery } from "./unified-query.js";

/**
 * Query context configuration
 */
export interface QueryContextConfig {
  /** Primary package path (for default views) */
  packagePath: string;
  /** Branch to query (default: "base") */
  branch?: string;
  /** Additional packages for @package syntax */
  packages?: Map<string, string>;
}

/**
 * Result of setting up query context
 */
export interface QueryContextResult {
  /** Whether context was set up successfully */
  success: boolean;
  /** Views that were created */
  viewsCreated: string[];
  /** Warnings (e.g., missing parquet files) */
  warnings: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Package discovery result
 */
export interface DiscoveredPackage {
  /** Short name (e.g., "core", "cli") */
  name: string;
  /** Full path to package */
  path: string;
  /** Whether seeds exist */
  hasSeeds: boolean;
}

/**
 * Set up query context with views for a package or repository
 *
 * @deprecated Use query() from unified-query.ts instead.
 * This function is maintained for backwards compatibility.
 *
 * Query hierarchy (seeds only exist at package level):
 * - Package level: Query that package's seeds directly
 * - Repo level: Aggregate all packages' seeds in the repo
 * - Workspace level (hub mode): Use query() with all packages
 *
 * Creates views:
 * - nodes: All nodes (from package or aggregated across packages)
 * - edges: All edges
 * - external_refs: All external references
 * - effects: All effects (v3.0 foundation)
 * - nodes_{pkgName}: Package-specific views when packages map provided
 */
export async function setupQueryContext(
  pool: DuckDBPool,
  config: QueryContextConfig
): Promise<QueryContextResult> {
  const { packagePath, branch = "base" } = config;

  try {
    // Collect package paths for unified query
    const packagePaths: string[] = [];
    const paths = getSeedPaths(packagePath, branch);
    const parquetPaths = getParquetFilePaths(paths.basePath);

    // Check if packagePath itself has seeds (is a package)
    const hasDirectSeeds = await fileExists(parquetPaths.nodes);
    if (hasDirectSeeds) {
      packagePaths.push(packagePath);
    }

    // Add packages from map (if provided)
    if (config.packages) {
      for (const [, pkgPath] of config.packages) {
        if (!packagePaths.includes(pkgPath)) {
          packagePaths.push(pkgPath);
        }
      }
    }

    // Use unified query to set up views (run a no-op query)
    const result = await unifiedQuery(pool, {
      packages: packagePaths,
      sql: "SELECT 1", // Just to set up views
      branch,
    });

    // For backwards compatibility, also create package-specific views
    // (e.g., nodes_core, edges_core) if packages map was provided
    const viewsCreated = [...result.viewsCreated];
    const packages = config.packages;
    if (packages) {
      await executeWithRecovery(pool, async (conn) => {
        for (const [pkgName, pkgPath] of packages) {
          const pkgPaths = getSeedPaths(pkgPath, branch);
          const pkgParquetPaths = getParquetFilePaths(pkgPaths.basePath);

          // Create package-specific views (e.g., nodes_core, edges_core)
          if (await fileExists(pkgParquetPaths.nodes)) {
            await createView(conn, `nodes_${pkgName}`, pkgParquetPaths.nodes);
            viewsCreated.push(`nodes_${pkgName}`);
          }

          if (await fileExists(pkgParquetPaths.edges)) {
            await createView(conn, `edges_${pkgName}`, pkgParquetPaths.edges);
            viewsCreated.push(`edges_${pkgName}`);
          }

          if (await fileExists(pkgParquetPaths.externalRefs)) {
            await createView(conn, `external_refs_${pkgName}`, pkgParquetPaths.externalRefs);
            viewsCreated.push(`external_refs_${pkgName}`);
          }

          if (await fileExists(pkgParquetPaths.effects)) {
            await createView(conn, `effects_${pkgName}`, pkgParquetPaths.effects);
            viewsCreated.push(`effects_${pkgName}`);
          }
        }
      });
    }

    return {
      success: true,
      viewsCreated,
      warnings: result.warnings,
    };
  } catch (error) {
    return {
      success: false,
      viewsCreated: [],
      warnings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Create a DuckDB view for a parquet file
 */
async function createView(conn: Connection, viewName: string, parquetPath: string): Promise<void> {
  const escapedPath = parquetPath.replace(/'/g, "''");
  await conn.run(
    `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_parquet('${escapedPath}')`
  );
}

/**
 * Preprocess SQL to expand @package syntax
 *
 * Transforms:
 * - `FROM nodes@core` -> `FROM read_parquet('/path/to/core/.devac/seed/base/nodes.parquet')`
 * - `FROM nodes@*` -> `FROM read_parquet(['/path/to/pkg1/...', '/path/to/pkg2/...'])`
 */
export function preprocessSql(
  sql: string,
  packages: Map<string, string>,
  branch = "base"
): { sql: string; errors: string[] } {
  const errors: string[] = [];

  // Pattern: table@package where table is nodes, edges, external_refs, or effects
  // Note: Can't use \b at end because * is not a word character
  const pattern = /\b(nodes|edges|external_refs|effects)@(\w+|\*)/g;

  const processedSql = sql.replace(pattern, (match, table: string, pkgName: string) => {
    if (pkgName === "*") {
      // Expand to all packages
      if (packages.size === 0) {
        errors.push(`No packages available for ${table}@*`);
        return match;
      }

      const paths: string[] = [];
      for (const [, pkgPath] of packages) {
        const seedPaths = getSeedPaths(pkgPath, branch);
        const parquetPath = path.join(seedPaths.basePath, `${table}.parquet`);
        paths.push(`'${parquetPath.replace(/'/g, "''")}'`);
      }

      return `read_parquet([${paths.join(", ")}])`;
    }

    // Expand to specific package
    const pkgPath = packages.get(pkgName);
    if (!pkgPath) {
      errors.push(`Unknown package: ${pkgName}`);
      return match;
    }

    const seedPaths = getSeedPaths(pkgPath, branch);
    const parquetPath = path.join(seedPaths.basePath, `${table}.parquet`);
    return `read_parquet('${parquetPath.replace(/'/g, "''")}')`;
  });

  return { sql: processedSql, errors };
}

/**
 * Discover packages in a repository
 *
 * Finds all directories with .devac/seed/base/ and returns their names and paths.
 */
export async function discoverPackagesInRepo(repoPath: string): Promise<DiscoveredPackage[]> {
  const packages: DiscoveredPackage[] = [];

  // Check if repo root has seeds
  const rootSeedPath = path.join(repoPath, ".devac", "seed", "base");
  if (await directoryExists(rootSeedPath)) {
    const name = await getPackageShortName(repoPath, repoPath);
    packages.push({
      name,
      path: repoPath,
      hasSeeds: true,
    });
  }

  // Recursively find packages
  await findPackagesRecursive(repoPath, repoPath, packages);

  return packages;
}

/**
 * Recursively find packages with seed directories
 */
async function findPackagesRecursive(
  repoPath: string,
  currentPath: string,
  packages: DiscoveredPackage[]
): Promise<void> {
  try {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip common non-package directories
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".devac" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === "coverage" ||
        entry.name === "__pycache__" ||
        entry.name === ".venv" ||
        entry.name === "venv"
      ) {
        continue;
      }

      const entryPath = path.join(currentPath, entry.name);
      const seedPath = path.join(entryPath, ".devac", "seed", "base");

      if (await directoryExists(seedPath)) {
        const name = await getPackageShortName(repoPath, entryPath);
        packages.push({
          name,
          path: entryPath,
          hasSeeds: true,
        });
      }

      // Continue recursively
      await findPackagesRecursive(repoPath, entryPath, packages);
    }
  } catch {
    // Directory not readable, skip
  }
}

/**
 * Get a short name for a package
 *
 * Tries to extract from package.json name, falls back to directory name.
 */
async function getPackageShortName(repoPath: string, packagePath: string): Promise<string> {
  // Try to read package.json
  try {
    const packageJsonPath = path.join(packagePath, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);

    if (packageJson.name) {
      // Extract short name from scoped package (e.g., "@pietgk/devac-core" -> "devac-core")
      const name = packageJson.name as string;
      const match = name.match(/^@[^/]+\/(.+)$/);
      if (match?.[1]) {
        return match[1];
      }
      return name;
    }
  } catch {
    // No package.json or invalid
  }

  // Fall back to directory name
  const relativePath = path.relative(repoPath, packagePath);
  if (relativePath === "" || relativePath === ".") {
    return path.basename(path.resolve(packagePath));
  }

  return path.basename(relativePath);
}

/**
 * Check if a directory exists
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Build a package map from discovered packages
 */
export function buildPackageMap(packages: DiscoveredPackage[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const pkg of packages) {
    if (pkg.hasSeeds) {
      map.set(pkg.name, pkg.path);
    }
  }
  return map;
}

/**
 * Query result from context-aware query execution
 */
export interface ContextQueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  timeMs: number;
  viewsCreated: string[];
}

/**
 * Execute a SQL query with views pre-configured for a package
 *
 * This is the canonical way to run queries against package seeds.
 * It creates views (nodes, edges, external_refs, effects) in the same
 * connection context as the query, ensuring views are available.
 *
 * @example
 * ```typescript
 * const result = await queryWithContext(pool, {
 *   packagePath: "/path/to/package",
 *   sql: "SELECT * FROM nodes WHERE kind = 'function'",
 * });
 * ```
 */
export async function queryWithContext<T = Record<string, unknown>>(
  pool: DuckDBPool,
  options: {
    packagePath: string;
    sql: string;
    branch?: string;
  }
): Promise<ContextQueryResult<T>> {
  const { packagePath, sql, branch = "base" } = options;
  const startTime = Date.now();
  const viewsCreated: string[] = [];

  const rows = await executeWithRecovery(pool, async (conn) => {
    const paths = getSeedPaths(packagePath, branch);
    const parquetPaths = getParquetFilePaths(paths.basePath);

    // Create views for all seed tables
    if (await fileExists(parquetPaths.nodes)) {
      await createView(conn, "nodes", parquetPaths.nodes);
      viewsCreated.push("nodes");
    }

    if (await fileExists(parquetPaths.edges)) {
      await createView(conn, "edges", parquetPaths.edges);
      viewsCreated.push("edges");
    }

    if (await fileExists(parquetPaths.externalRefs)) {
      await createView(conn, "external_refs", parquetPaths.externalRefs);
      viewsCreated.push("external_refs");
    }

    if (await fileExists(parquetPaths.effects)) {
      await createView(conn, "effects", parquetPaths.effects);
      viewsCreated.push("effects");
    }

    // Execute the query
    return await conn.all(sql);
  });

  return {
    rows: rows as T[],
    rowCount: rows.length,
    timeMs: Date.now() - startTime,
    viewsCreated,
  };
}
