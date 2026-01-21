/**
 * Query Schema Subcommand
 *
 * Get available tables and columns in the code graph database.
 * Useful for discovering the schema before writing SQL queries.
 */

import * as path from "node:path";
import {
  DuckDBPool,
  discoverPackagesInRepo,
  executeWithRecovery,
  setupQueryContext,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { formatOutput, formatTable } from "../output-formatter.js";

interface SchemaTable {
  name: string;
  type: "seed" | "hub";
  columns: Array<{
    name: string;
    type: string;
  }>;
}

interface SchemaResult {
  success: boolean;
  tables: SchemaTable[];
  skippedTables: string[];
  output: string;
  error?: string;
}

/**
 * Find the repository root by looking for .git directory
 */
async function findRepoRoot(startPath: string): Promise<string | null> {
  const fs = await import("node:fs/promises");
  let currentPath = startPath;

  while (currentPath !== path.dirname(currentPath)) {
    try {
      const gitPath = path.join(currentPath, ".git");
      await fs.access(gitPath);
      return currentPath;
    } catch {
      currentPath = path.dirname(currentPath);
    }
  }

  return null;
}

/**
 * Get schema information
 */
async function getSchemaCommand(options: {
  packagePath?: string;
  json?: boolean;
}): Promise<SchemaResult> {
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    const packagePath = options.packagePath || process.cwd();

    // Discover packages for view setup
    const repoRoot = await findRepoRoot(packagePath);
    const packages = repoRoot
      ? await discoverPackagesInRepo(repoRoot)
      : await discoverPackagesInRepo(packagePath);

    // Set up query context with views
    const contextResult = await setupQueryContext(pool, {
      packagePath,
      packages: new Map(packages.map((p) => [p.name, p.path])),
    });

    // Get list of available views/tables
    const tables: SchemaTable[] = [];
    const skippedTables: string[] = [];

    // Seed tables (always available)
    const seedTables = ["nodes", "edges", "external_refs", "effects"];
    for (const tableName of seedTables) {
      if (contextResult.viewsCreated.includes(tableName)) {
        try {
          const columnsResult = await executeWithRecovery(pool, async (conn) => {
            return await conn.all(`DESCRIBE ${tableName}`);
          });

          tables.push({
            name: tableName,
            type: "seed",
            columns: (columnsResult as Array<{ column_name: string; column_type: string }>).map(
              (col) => ({
                name: col.column_name,
                type: col.column_type,
              })
            ),
          });
        } catch (_error) {
          // Table exists in views but failed to describe - track for reporting
          skippedTables.push(tableName);
        }
      }
    }

    // Format output
    let output: string;
    if (options.json) {
      output = formatOutput({ tables, skippedTables }, { json: true });
    } else {
      const lines = ["Available Tables:", ""];

      for (const table of tables) {
        lines.push(`${table.name} (${table.type}):`);

        const rows = table.columns.map((col) => ({
          Column: col.name,
          Type: col.type,
        }));

        lines.push(formatTable(rows, { columns: ["Column", "Type"] }));
        lines.push("");
      }

      if (tables.length === 0) {
        lines.push("No tables found. Run 'devac sync' first to generate seeds.");
      }

      if (skippedTables.length > 0) {
        lines.push(
          `Note: ${skippedTables.length} table(s) could not be described: ${skippedTables.join(", ")}`
        );
      }

      output = lines.join("\n");
    }

    return {
      success: true,
      tables,
      skippedTables,
      output,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      tables: [],
      skippedTables: [],
      output: options.json
        ? formatOutput({ success: false, error: errorMessage }, { json: true })
        : `Error: ${errorMessage}`,
      error: errorMessage,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Register the schema subcommand under query
 */
export function registerQuerySchema(parent: Command): void {
  parent
    .command("schema")
    .description("Get available tables and columns in the code graph database")
    .option("-p, --package <path>", "Package path")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await getSchemaCommand({
        packagePath: options.package ? path.resolve(options.package) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
