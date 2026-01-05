/**
 * Call Graph Command Implementation
 *
 * Gets call graph (callers and/or callees) for a function.
 * Based on MCP get_call_graph tool.
 */

import * as path from "node:path";
import {
  DuckDBPool,
  createCentralHub,
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
  /** Package path (for package mode) */
  packagePath?: string;
  /** Use hub mode for federated queries */
  hub?: boolean;
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
        const name = c.name || c.source_entity_id || "unknown";
        const file = c.source_file || "";
        const kind = c.kind || "";
        lines.push(`  ${name} (${kind}) - ${file}`);
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
        const name = c.name || c.target_entity_id || "unknown";
        const file = c.source_file || "";
        const kind = c.kind || "";
        lines.push(`  ${name} (${kind}) - ${file}`);
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

    if (options.hub) {
      // Hub mode: query all registered repos
      const hubDir = await getWorkspaceHubDir();
      const hub = createCentralHub({ hubDir, readOnly: true });

      try {
        await hub.init();
        const repos = await hub.listRepos();
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
          const sql = `
            SELECT e.*, n.name, n.kind, n.source_file
            FROM {edges} e
            JOIN {nodes} n ON e.source_entity_id = n.entity_id
            WHERE e.target_entity_id = '${options.entityId.replace(/'/g, "''")}'
            AND e.edge_type = 'CALLS'
            LIMIT ${limit}
          `;
          const result = await queryMultiplePackages(pool, packagePaths, sql);
          callers = result.rows;
        }

        if (options.direction === "callees" || options.direction === "both") {
          const sql = `
            SELECT e.*, n.name, n.kind, n.source_file
            FROM {edges} e
            JOIN {nodes} n ON e.target_entity_id = n.entity_id
            WHERE e.source_entity_id = '${options.entityId.replace(/'/g, "''")}'
            AND e.edge_type = 'CALLS'
            LIMIT ${limit}
          `;
          const result = await queryMultiplePackages(pool, packagePaths, sql);
          callees = result.rows;
        }
      } finally {
        await hub.close();
      }
    } else {
      // Package mode: query single package
      const pkgPath = options.packagePath
        ? path.resolve(options.packagePath)
        : path.resolve(process.cwd());
      const seedReader = createSeedReader(pool, pkgPath);

      if (options.direction === "callers" || options.direction === "both") {
        const sql = `
          SELECT e.*, n.name, n.kind, n.source_file
          FROM edges e
          JOIN nodes n ON e.source_entity_id = n.entity_id
          WHERE e.target_entity_id = '${options.entityId.replace(/'/g, "''")}'
          AND e.edge_type = 'CALLS'
          LIMIT ${limit}
        `;
        const result = await seedReader.querySeeds(sql);
        callers = result.rows;
      }

      if (options.direction === "callees" || options.direction === "both") {
        const sql = `
          SELECT e.*, n.name, n.kind, n.source_file
          FROM edges e
          JOIN nodes n ON e.target_entity_id = n.entity_id
          WHERE e.source_entity_id = '${options.entityId.replace(/'/g, "''")}'
          AND e.edge_type = 'CALLS'
          LIMIT ${limit}
        `;
        const result = await seedReader.querySeeds(sql);
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
    .description("Get call graph for a function")
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("-d, --direction <dir>", "Direction (callers, callees, both)", "both")
    .option("--hub", "Query all registered repos via Hub")
    .option("--max-depth <depth>", "Maximum depth", "3")
    .option("-l, --limit <count>", "Maximum results per direction", "100")
    .option("--json", "Output as JSON")
    .action(async (entityId, options) => {
      const result = await callGraphCommand({
        entityId,
        direction: options.direction as "callers" | "callees" | "both",
        packagePath: options.package ? path.resolve(options.package) : undefined,
        hub: options.hub,
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
