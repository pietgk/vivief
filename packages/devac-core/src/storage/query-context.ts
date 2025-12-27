/**
 * Query Context Implementation
 *
 * Sets up DuckDB views for ergonomic queries against seed files.
 * Enables `FROM nodes` instead of `FROM read_parquet('/full/path/...')`.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Connection } from "duckdb-async";
import { getSeedPaths } from "../types/config.js";
import type { DuckDBPool } from "./duckdb-pool.js";
import { executeWithRecovery } from "./duckdb-pool.js";

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
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Set up query context with views for a package
 *
 * Creates views:
 * - nodes: All nodes from the package
 * - edges: All edges from the package
 * - external_refs: All external references from the package
 */
export async function setupQueryContext(
  pool: DuckDBPool,
  config: QueryContextConfig
): Promise<QueryContextResult> {
  const { packagePath, branch = "base" } = config;
  const viewsCreated: string[] = [];
  const warnings: string[] = [];

  try {
    const paths = getSeedPaths(packagePath, branch);

    await executeWithRecovery(pool, async (conn) => {
      // Create view for nodes
      const nodesPath = path.join(paths.basePath, "nodes.parquet");
      if (await fileExists(nodesPath)) {
        await createView(conn, "nodes", nodesPath);
        viewsCreated.push("nodes");
      } else {
        warnings.push(`nodes.parquet not found at ${nodesPath}`);
      }

      // Create view for edges
      const edgesPath = path.join(paths.basePath, "edges.parquet");
      if (await fileExists(edgesPath)) {
        await createView(conn, "edges", edgesPath);
        viewsCreated.push("edges");
      } else {
        warnings.push(`edges.parquet not found at ${edgesPath}`);
      }

      // Create view for external_refs
      const refsPath = path.join(paths.basePath, "external_refs.parquet");
      if (await fileExists(refsPath)) {
        await createView(conn, "external_refs", refsPath);
        viewsCreated.push("external_refs");
      } else {
        warnings.push(`external_refs.parquet not found at ${refsPath}`);
      }

      // Set up additional package views if provided
      if (config.packages) {
        for (const [pkgName, pkgPath] of config.packages) {
          const pkgPaths = getSeedPaths(pkgPath, branch);

          // Create package-specific views (e.g., nodes_core, edges_core)
          const pkgNodesPath = path.join(pkgPaths.basePath, "nodes.parquet");
          if (await fileExists(pkgNodesPath)) {
            await createView(conn, `nodes_${pkgName}`, pkgNodesPath);
            viewsCreated.push(`nodes_${pkgName}`);
          }

          const pkgEdgesPath = path.join(pkgPaths.basePath, "edges.parquet");
          if (await fileExists(pkgEdgesPath)) {
            await createView(conn, `edges_${pkgName}`, pkgEdgesPath);
            viewsCreated.push(`edges_${pkgName}`);
          }

          const pkgRefsPath = path.join(pkgPaths.basePath, "external_refs.parquet");
          if (await fileExists(pkgRefsPath)) {
            await createView(conn, `external_refs_${pkgName}`, pkgRefsPath);
            viewsCreated.push(`external_refs_${pkgName}`);
          }
        }
      }
    });

    return {
      success: true,
      viewsCreated,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      viewsCreated,
      warnings,
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

  // Pattern: table@package where table is nodes, edges, or external_refs
  // Note: Can't use \b at end because * is not a word character
  const pattern = /\b(nodes|edges|external_refs)@(\w+|\*)/g;

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
