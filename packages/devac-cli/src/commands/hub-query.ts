/**
 * Hub Query Command Implementation
 *
 * Executes SQL queries across all registered repositories in the hub.
 * Implements federated queries without copying seed data.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  DuckDBPool,
  createHubClient,
  discoverPackagesInRepo,
  executeWithRecovery,
  preprocessSql,
} from "@pietgk/devac-core";

/**
 * Hub query command options
 */
export interface HubQueryOptions {
  /** Hub directory path */
  hubDir: string;
  /** SQL query to execute */
  sql: string;
  /** Output format */
  json?: boolean;
  /** Branch to query (default: "base") */
  branch?: string;
}

/**
 * Hub query command result
 */
export interface HubQueryResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Query results */
  rows?: Record<string, unknown>[];
  /** Row count */
  rowCount?: number;
  /** Execution time in ms */
  timeMs?: number;
  /** Formatted output */
  output?: string;
  /** User-facing message */
  message: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Execute a federated SQL query across all registered repositories
 */
export async function hubQueryCommand(options: HubQueryOptions): Promise<HubQueryResult> {
  const { hubDir, sql, json = false, branch = "base" } = options;
  const startTime = Date.now();

  // Use HubClient to get registered repos (delegates to MCP if running)
  const client = createHubClient({ hubDir });
  let pool: DuckDBPool | null = null;

  try {
    // Get all registered repositories (lazy registration will auto-discover repos with seeds)
    const repos = await client.listRepos();

    if (repos.length === 0) {
      return {
        success: false,
        message: "No repositories with seeds found",
        error:
          "No repositories with seed data found in workspace. Run 'devac sync' in a repository first.",
      };
    }

    // Build combined package map from all repos
    // packageMap is for @package syntax preprocessing
    // uniquePackagePaths is for federated view creation (avoids duplicates)
    const packageMap = new Map<string, string>();
    const uniquePackagePaths = new Set<string>();

    for (const repo of repos) {
      try {
        const packages = await discoverPackagesInRepo(repo.localPath);

        for (const pkg of packages) {
          if (pkg.hasSeeds) {
            // Add to unique paths set (for view creation)
            uniquePackagePaths.add(pkg.path);

            // Add to package map with repo prefix for @package syntax
            const globalKey = `${repo.repoId}:${pkg.name}`;
            packageMap.set(globalKey, pkg.path);

            // Add short name (may override if duplicate across repos)
            packageMap.set(pkg.name, pkg.path);
          }
        }
      } catch {
        // Skip repos that can't be read
      }
    }

    if (uniquePackagePaths.size === 0) {
      return {
        success: false,
        message: "No packages with seeds found",
        error:
          "Registered repositories have no seed data. Run 'devac sync' in each repository first.",
      };
    }

    // Create DuckDB pool for query execution
    pool = new DuckDBPool({ memoryLimit: "512MB" });
    await pool.initialize();

    // Preprocess SQL to expand @package and @* syntax
    const { sql: processedSql, errors: preprocessErrors } = preprocessSql(sql, packageMap, branch);

    if (preprocessErrors.length > 0) {
      return {
        success: false,
        message: "SQL preprocessing failed",
        error: preprocessErrors.join("; "),
      };
    }

    // Create federated views for convenient querying
    await executeWithRecovery(pool, async (conn) => {
      // Create UNION ALL views across all unique package paths
      const allNodesPaths: string[] = [];
      const allEdgesPaths: string[] = [];
      const allRefsPaths: string[] = [];
      const allEffectsPaths: string[] = [];

      for (const pkgPath of uniquePackagePaths) {
        const nodesPath = path.join(pkgPath, ".devac", "seed", branch, "nodes.parquet");
        const edgesPath = path.join(pkgPath, ".devac", "seed", branch, "edges.parquet");
        const refsPath = path.join(pkgPath, ".devac", "seed", branch, "external_refs.parquet");
        const effectsPath = path.join(pkgPath, ".devac", "seed", branch, "effects.parquet");

        allNodesPaths.push(`'${nodesPath.replace(/'/g, "''")}'`);
        allEdgesPaths.push(`'${edgesPath.replace(/'/g, "''")}'`);
        allRefsPaths.push(`'${refsPath.replace(/'/g, "''")}'`);
        // Only add effects.parquet if it exists - not all packages have effects yet
        if (fs.existsSync(effectsPath)) {
          allEffectsPaths.push(`'${effectsPath.replace(/'/g, "''")}'`);
        }
      }

      // Create views - silently ignore missing files
      if (allNodesPaths.length > 0) {
        try {
          await conn.run(
            `CREATE OR REPLACE VIEW nodes AS SELECT * FROM read_parquet([${allNodesPaths.join(", ")}], union_by_name=true, filename=true)`
          );
        } catch {
          // Some files may not exist
        }
      }

      if (allEdgesPaths.length > 0) {
        try {
          await conn.run(
            `CREATE OR REPLACE VIEW edges AS SELECT * FROM read_parquet([${allEdgesPaths.join(", ")}], union_by_name=true, filename=true)`
          );
        } catch {
          // Some files may not exist
        }
      }

      if (allRefsPaths.length > 0) {
        try {
          await conn.run(
            `CREATE OR REPLACE VIEW external_refs AS SELECT * FROM read_parquet([${allRefsPaths.join(", ")}], union_by_name=true, filename=true)`
          );
        } catch {
          // Some files may not exist
        }
      }

      // Create effects view (v3.0 foundation) - silently ignore if no effects exist yet
      if (allEffectsPaths.length > 0) {
        try {
          await conn.run(
            `CREATE OR REPLACE VIEW effects AS SELECT * FROM read_parquet([${allEffectsPaths.join(", ")}], union_by_name=true, filename=true)`
          );
        } catch {
          // Effects files may not exist yet - this is expected until parsers emit effects
        }
      }
    });

    // Execute the query
    const rows = await executeWithRecovery(pool, async (conn) => {
      return await conn.all(processedSql);
    });

    const timeMs = Date.now() - startTime;

    // Format output
    let output: string;
    if (json) {
      output = JSON.stringify(rows, null, 2);
    } else {
      output = formatQueryResults(rows as Record<string, unknown>[]);
    }

    return {
      success: true,
      rows: rows as Record<string, unknown>[],
      rowCount: rows.length,
      timeMs,
      output,
      message: `Query returned ${rows.length} row(s) in ${timeMs}ms`,
    };
  } catch (error) {
    return {
      success: false,
      message: "Query failed",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Format query results as a table
 */
function formatQueryResults(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "(no results)";
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return "(no results)";
  }

  const columns = Object.keys(firstRow);

  // Calculate column widths
  const widths = columns.map((col) => {
    const headerWidth = col.length;
    const maxDataWidth = rows.reduce((max, row) => {
      const value = row[col];
      const strValue = value === null ? "NULL" : String(value);
      return Math.max(max, strValue.length);
    }, 0);
    return Math.min(Math.max(headerWidth, maxDataWidth), 50); // Cap at 50 chars
  });

  // Build header
  const header = columns.map((col, i) => col.padEnd(widths[i] ?? 10)).join(" | ");
  const separator = widths.map((w) => "-".repeat(w)).join("-+-");

  // Build rows
  const dataRows = rows.map((row) => {
    return columns
      .map((col, i) => {
        const value = row[col];
        let strValue = value === null ? "NULL" : String(value);
        const width = widths[i] ?? 10;
        if (strValue.length > width) {
          strValue = `${strValue.slice(0, width - 3)}...`;
        }
        return strValue.padEnd(width);
      })
      .join(" | ");
  });

  return [header, separator, ...dataRows].join("\n");
}
