/**
 * Call Graph Command Implementation
 *
 * Gets call graph (callers and/or callees) for a function.
 * Based on MCP get_call_graph tool.
 */

import * as path from "node:path";
import {
  DuckDBPool,
  createHubClient,
  createSeedReader,
  queryMultiplePackages,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { getWorkspaceHubDir } from "../utils/workspace-discovery.js";
import { formatOutput } from "./output-formatter.js";

/**
 * Options for call-graph command
 */
export interface CallGraphCommandOptions {
  /** Entity ID of the function */
  entityId: string;
  /** Direction of the call graph */
  direction: "callers" | "callees" | "both";
  /** Package path (for package-only queries, overrides hub mode) */
  packagePath?: string;
  /** Maximum depth for recursive queries (default: 3) */
  maxDepth?: number;
  /** Maximum results per direction */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from call-graph command
 */
export interface CallGraphCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Total number of callers/callees found */
  count: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Callers if requested */
  callers?: unknown[];
  /** Callees if requested */
  callees?: unknown[];
  /** Error message if failed */
  error?: string;
}

/**
 * Format call graph for pretty output
 */
function formatCallGraph(
  callers: unknown[] | undefined,
  callees: unknown[] | undefined,
  options: { json: boolean }
): string {
  if (options.json) {
    return formatOutput({ callers, callees }, { json: true });
  }

  const lines: string[] = [];

  if (callers !== undefined) {
    lines.push(`Callers (${callers.length}):`);
    if (callers.length === 0) {
      lines.push("  No callers found");
    } else {
      for (const caller of callers) {
        const c = caller as Record<string, unknown>;
        const name = c.name || c.entity_id || c.source_entity_id || "unknown";
        const file = c.source_file || "";
        const kind = c.kind || "";
        const depth = c.depth !== undefined ? ` [depth: ${c.depth}]` : "";
        lines.push(`  ${name} (${kind}) - ${file}${depth}`);
      }
    }
  }

  if (callees !== undefined) {
    if (lines.length > 0) lines.push("");
    lines.push(`Callees (${callees.length}):`);
    if (callees.length === 0) {
      lines.push("  No callees found");
    } else {
      for (const callee of callees) {
        const c = callee as Record<string, unknown>;
        const name = c.name || c.entity_id || c.target_entity_id || "unknown";
        const file = c.source_file || "";
        const kind = c.kind || "";
        const depth = c.depth !== undefined ? ` [depth: ${c.depth}]` : "";
        lines.push(`  ${name} (${kind}) - ${file}${depth}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Run call-graph command
 */
export async function callGraphCommand(
  options: CallGraphCommandOptions
): Promise<CallGraphCommandResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    const limit = options.limit || 100;
    let callers: unknown[] | undefined;
    let callees: unknown[] | undefined;

    const maxDepth = options.maxDepth ?? 3;
    const escapedEntityId = options.entityId.replace(/'/g, "''");

    if (options.packagePath) {
      // Package mode: query single package (only when explicitly requested)
      const pkgPath = path.resolve(options.packagePath);
      const seedReader = createSeedReader(pool, pkgPath);

      if (options.direction === "callers" || options.direction === "both") {
        // Recursive CTE to find transitive callers up to maxDepth
        const sql = `
          WITH RECURSIVE caller_chain AS (
            -- Base case: direct callers
            SELECT
              e.source_entity_id,
              1 as depth,
              ARRAY[e.target_entity_id, e.source_entity_id] as path
            FROM edges e
            WHERE e.target_entity_id = '${escapedEntityId}'
            AND e.edge_type = 'CALLS'

            UNION ALL

            -- Recursive case: callers of callers
            SELECT
              e.source_entity_id,
              cc.depth + 1,
              array_append(cc.path, e.source_entity_id)
            FROM edges e
            JOIN caller_chain cc ON e.target_entity_id = cc.source_entity_id
            WHERE e.edge_type = 'CALLS'
            AND cc.depth < ${maxDepth}
            AND NOT array_contains(cc.path, e.source_entity_id)
          )
          SELECT DISTINCT
            cc.source_entity_id as entity_id,
            cc.depth,
            n.name,
            n.kind,
            n.source_file
          FROM caller_chain cc
          JOIN nodes n ON cc.source_entity_id = n.entity_id
          ORDER BY cc.depth, n.name
          LIMIT ${limit}
        `;
        const result = await seedReader.querySeeds(sql);
        callers = result.rows;
      }

      if (options.direction === "callees" || options.direction === "both") {
        // Recursive CTE to find transitive callees up to maxDepth
        const sql = `
          WITH RECURSIVE call_chain AS (
            -- Base case: direct callees
            SELECT
              e.target_entity_id,
              1 as depth,
              ARRAY[e.source_entity_id, e.target_entity_id] as path
            FROM edges e
            WHERE e.source_entity_id = '${escapedEntityId}'
            AND e.edge_type = 'CALLS'

            UNION ALL

            -- Recursive case: callees of callees
            SELECT
              e.target_entity_id,
              cc.depth + 1,
              array_append(cc.path, e.target_entity_id)
            FROM edges e
            JOIN call_chain cc ON e.source_entity_id = cc.target_entity_id
            WHERE e.edge_type = 'CALLS'
            AND cc.depth < ${maxDepth}
            AND NOT array_contains(cc.path, e.target_entity_id)
          )
          SELECT DISTINCT
            cc.target_entity_id as entity_id,
            cc.depth,
            n.name,
            n.kind,
            n.source_file
          FROM call_chain cc
          JOIN nodes n ON cc.target_entity_id = n.entity_id
          ORDER BY cc.depth, n.name
          LIMIT ${limit}
        `;
        const result = await seedReader.querySeeds(sql);
        callees = result.rows;
      }
    } else {
      // Hub mode (default): query all registered repos
      const hubDir = await getWorkspaceHubDir();
      const client = createHubClient({ hubDir });

      const repos = await client.listRepos();
      const packagePaths = repos.map((r) => r.localPath);

      if (packagePaths.length === 0) {
        return {
          success: true,
          output: options.json
            ? formatOutput({ callers: [], callees: [] }, { json: true })
            : "No repositories registered in hub",
          count: 0,
          timeMs: Date.now() - startTime,
          callers: [],
          callees: [],
        };
      }

      if (options.direction === "callers" || options.direction === "both") {
        // Recursive CTE to find transitive callers up to maxDepth
        const sql = `
          WITH RECURSIVE caller_chain AS (
            -- Base case: direct callers
            SELECT
              e.source_entity_id,
              1 as depth,
              ARRAY[e.target_entity_id, e.source_entity_id] as path
            FROM {edges} e
            WHERE e.target_entity_id = '${escapedEntityId}'
            AND e.edge_type = 'CALLS'

            UNION ALL

            -- Recursive case: callers of callers
            SELECT
              e.source_entity_id,
              cc.depth + 1,
              array_append(cc.path, e.source_entity_id)
            FROM {edges} e
            JOIN caller_chain cc ON e.target_entity_id = cc.source_entity_id
            WHERE e.edge_type = 'CALLS'
            AND cc.depth < ${maxDepth}
            AND NOT array_contains(cc.path, e.source_entity_id)
          )
          SELECT DISTINCT
            cc.source_entity_id as entity_id,
            cc.depth,
            n.name,
            n.kind,
            n.source_file
          FROM caller_chain cc
          JOIN {nodes} n ON cc.source_entity_id = n.entity_id
          ORDER BY cc.depth, n.name
          LIMIT ${limit}
        `;
        const result = await queryMultiplePackages(pool, packagePaths, sql);
        callers = result.rows;
      }

      if (options.direction === "callees" || options.direction === "both") {
        // Recursive CTE to find transitive callees up to maxDepth
        const sql = `
          WITH RECURSIVE call_chain AS (
            -- Base case: direct callees
            SELECT
              e.target_entity_id,
              1 as depth,
              ARRAY[e.source_entity_id, e.target_entity_id] as path
            FROM {edges} e
            WHERE e.source_entity_id = '${escapedEntityId}'
            AND e.edge_type = 'CALLS'

            UNION ALL

            -- Recursive case: callees of callees
            SELECT
              e.target_entity_id,
              cc.depth + 1,
              array_append(cc.path, e.target_entity_id)
            FROM {edges} e
            JOIN call_chain cc ON e.source_entity_id = cc.target_entity_id
            WHERE e.edge_type = 'CALLS'
            AND cc.depth < ${maxDepth}
            AND NOT array_contains(cc.path, e.target_entity_id)
          )
          SELECT DISTINCT
            cc.target_entity_id as entity_id,
            cc.depth,
            n.name,
            n.kind,
            n.source_file
          FROM call_chain cc
          JOIN {nodes} n ON cc.target_entity_id = n.entity_id
          ORDER BY cc.depth, n.name
          LIMIT ${limit}
        `;
        const result = await queryMultiplePackages(pool, packagePaths, sql);
        callees = result.rows;
      }
    }

    const count = (callers?.length || 0) + (callees?.length || 0);
    const output = formatCallGraph(callers, callees, {
      json: options.json || false,
    });

    return {
      success: true,
      output,
      count,
      timeMs: Date.now() - startTime,
      callers,
      callees,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `Error: ${errorMessage}`;

    return {
      success: false,
      output,
      count: 0,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Register the call-graph command with the CLI program
 */
export function registerCallGraphCommand(program: Command): void {
  program
    .command("call-graph <entityId>")
    .description("Get call graph for a function (queries all repos by default)")
    .option("-p, --package <path>", "Query single package only")
    .option("-d, --direction <dir>", "Direction (callers, callees, both)", "both")
    .option("--max-depth <depth>", "Maximum depth", "3")
    .option("-l, --limit <count>", "Maximum results per direction", "100")
    .option("--json", "Output as JSON")
    .action(async (entityId, options) => {
      const result = await callGraphCommand({
        entityId,
        direction: options.direction as "callers" | "callees" | "both",
        packagePath: options.package ? path.resolve(options.package) : undefined,
        maxDepth: options.maxDepth ? Number.parseInt(options.maxDepth, 10) : undefined,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
