/**
 * Query Graph Subcommands (v2 - Using Shared Query Layer)
 *
 * Graph queries: deps, dependents, calls, imports
 * Demonstrates the "thin adapter" pattern for relationship queries.
 */

import * as path from "node:path";
import {
  DuckDBPool,
  type GraphCallsParams,
  type GraphDependentsParams,
  type GraphDepsParams,
  createHubClient,
  createQueryContext,
  graphCalls,
  graphDependents,
  graphDeps,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { getWorkspaceHubDir } from "../../utils/workspace-discovery.js";
import { formatOutput } from "../output-formatter.js";

/**
 * Result from graph query command
 */
export interface GraphQueryResult {
  success: boolean;
  output: string;
  count: number;
  timeMs: number;
  data?: unknown;
  error?: string;
}

/**
 * CLI options for graph queries
 */
interface GraphCliOptions {
  package?: string;
  edgeType?: string;
  depth?: string;
  level?: "counts" | "summary" | "details";
  limit?: string;
  json?: boolean;
}

/**
 * Get packages for query context
 */
async function getPackages(packagePath?: string): Promise<string[]> {
  if (packagePath) {
    return [path.resolve(packagePath)];
  }

  const hubDir = await getWorkspaceHubDir();
  const client = createHubClient({ hubDir });
  const repos = await client.listRepos();
  return repos.map((r) => r.localPath);
}

/**
 * Format edges for terminal display
 */
function formatEdges(data: unknown, level: string, json: boolean): string {
  if (json) {
    return formatOutput(data, { json: true });
  }

  if (level === "counts") {
    const counts = data as { total: number; byCategory?: Record<string, number> };
    let output = `Total: ${counts.total}\n`;
    if (counts.byCategory) {
      output += "By type:\n";
      for (const [type, count] of Object.entries(counts.byCategory)) {
        output += `  ${type}: ${count}\n`;
      }
    }
    return output;
  }

  // Summary or details - format as table
  const items = data as Array<{
    sourceEntityId?: string;
    targetEntityId?: string;
    edgeType?: string;
    sourceName?: string;
    targetName?: string;
  }>;

  if (items.length === 0) {
    return "No relationships found.";
  }

  let output = "";
  for (const item of items) {
    const sourceName = item.sourceName ?? item.sourceEntityId?.split(":").pop() ?? "?";
    const targetName = item.targetName ?? item.targetEntityId?.split(":").pop() ?? "?";
    output += `${sourceName} --[${item.edgeType}]--> ${targetName}\n`;
  }
  return output;
}

// ============================================================================
// graph-deps - What a symbol depends on (outgoing)
// ============================================================================

/**
 * Run graph deps query
 */
export async function graphDepsCommand(
  entity: string,
  options: GraphCliOptions
): Promise<GraphQueryResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    const packages = await getPackages(options.package);
    if (packages.length === 0) {
      return {
        success: true,
        output: options.json
          ? formatOutput({ data: [], total: 0 }, { json: true })
          : "No repositories registered in hub",
        count: 0,
        timeMs: Date.now() - startTime,
        data: [],
      };
    }

    const ctx = createQueryContext({ pool, packages });

    // Map CLI options to shared params
    const params: GraphDepsParams = {
      entity,
      edgeType: options.edgeType as GraphDepsParams["edgeType"],
      depth: options.depth ? Number.parseInt(options.depth, 10) : 1,
      level: (options.level ?? "summary") as GraphDepsParams["level"],
      limit: options.limit ? Number.parseInt(options.limit, 10) : 100,
    };

    const result = await graphDeps(ctx, params);

    const output = formatEdges(result.data, params.level, options.json ?? false);

    return {
      success: true,
      output,
      count: result.total,
      timeMs: result.queryTimeMs,
      data: result.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: options.json
        ? formatOutput({ error: errorMessage }, { json: true })
        : `Error: ${errorMessage}`,
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
 * Register graph-deps command
 */
export function registerGraphDepsV2(parent: Command): void {
  parent
    .command("graph-deps <entity>")
    .description(
      "Get what a symbol depends on (outgoing edges). " +
        "Shows what functions it calls, classes it extends, modules it imports."
    )
    .option("-p, --package <path>", "Query single package only")
    .option("-t, --edge-type <type>", "Filter by edge type (CALLS, IMPORTS, EXTENDS, etc.)")
    .option("-d, --depth <n>", "Traversal depth (1 = direct only, >1 = transitive)", "1")
    .option("-l, --level <level>", "Output level: counts, summary, details", "summary")
    .option("--limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (entity: string, options: GraphCliOptions) => {
      const result = await graphDepsCommand(entity, options);
      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}

// ============================================================================
// graph-dependents - What depends on a symbol (incoming)
// ============================================================================

/**
 * Run graph dependents query
 */
export async function graphDependentsCommand(
  entity: string,
  options: GraphCliOptions
): Promise<GraphQueryResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    const packages = await getPackages(options.package);
    if (packages.length === 0) {
      return {
        success: true,
        output: options.json
          ? formatOutput({ data: [], total: 0 }, { json: true })
          : "No repositories registered in hub",
        count: 0,
        timeMs: Date.now() - startTime,
        data: [],
      };
    }

    const ctx = createQueryContext({ pool, packages });

    const params: GraphDependentsParams = {
      entity,
      edgeType: options.edgeType as GraphDependentsParams["edgeType"],
      depth: options.depth ? Number.parseInt(options.depth, 10) : 1,
      level: (options.level ?? "summary") as GraphDependentsParams["level"],
      limit: options.limit ? Number.parseInt(options.limit, 10) : 100,
    };

    const result = await graphDependents(ctx, params);

    const output = formatEdges(result.data, params.level, options.json ?? false);

    return {
      success: true,
      output,
      count: result.total,
      timeMs: result.queryTimeMs,
      data: result.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: options.json
        ? formatOutput({ error: errorMessage }, { json: true })
        : `Error: ${errorMessage}`,
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
 * Register graph-dependents command
 */
export function registerGraphDependentsV2(parent: Command): void {
  parent
    .command("graph-dependents <entity>")
    .description(
      "Get what depends on a symbol (incoming edges). " +
        "Essential for impact analysis - what breaks if I change this?"
    )
    .option("-p, --package <path>", "Query single package only")
    .option("-t, --edge-type <type>", "Filter by edge type (CALLS, IMPORTS, EXTENDS, etc.)")
    .option("-d, --depth <n>", "Traversal depth (1 = direct only, >1 = transitive)", "1")
    .option("-l, --level <level>", "Output level: counts, summary, details", "summary")
    .option("--limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (entity: string, options: GraphCliOptions) => {
      const result = await graphDependentsCommand(entity, options);
      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}

// ============================================================================
// graph-calls - Call graph (callers/callees)
// ============================================================================

/**
 * CLI options for call graph query
 */
interface CallGraphCliOptions extends GraphCliOptions {
  direction?: "callers" | "callees" | "both";
}

/**
 * Format call graph result
 */
function formatCallGraph(data: unknown, level: string, json: boolean): string {
  if (json) {
    return formatOutput(data, { json: true });
  }

  if (level === "counts") {
    const counts = data as {
      total: number;
      byCategory?: { callers?: number; callees?: number };
    };
    let output = `Total: ${counts.total}\n`;
    if (counts.byCategory) {
      output += `  Callers: ${counts.byCategory.callers ?? 0}\n`;
      output += `  Callees: ${counts.byCategory.callees ?? 0}\n`;
    }
    return output;
  }

  const result = data as {
    callers?: unknown[];
    callees?: unknown[];
    callerCount?: number;
    calleeCount?: number;
  };

  let output = "";

  if (result.callers && result.callers.length > 0) {
    output += `\nCallers (${result.callerCount ?? result.callers.length}):\n`;
    output += formatEdges(result.callers, "summary", false);
  }

  if (result.callees && result.callees.length > 0) {
    output += `\nCallees (${result.calleeCount ?? result.callees.length}):\n`;
    output += formatEdges(result.callees, "summary", false);
  }

  if (!output) {
    output = "No call relationships found.";
  }

  return output;
}

/**
 * Run call graph query
 */
export async function graphCallsCommand(
  entity: string,
  options: CallGraphCliOptions
): Promise<GraphQueryResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    const packages = await getPackages(options.package);
    if (packages.length === 0) {
      return {
        success: true,
        output: options.json
          ? formatOutput({ data: { callers: [], callees: [] }, total: 0 }, { json: true })
          : "No repositories registered in hub",
        count: 0,
        timeMs: Date.now() - startTime,
        data: { callers: [], callees: [] },
      };
    }

    const ctx = createQueryContext({ pool, packages });

    const params: GraphCallsParams = {
      entity,
      direction: options.direction ?? "both",
      depth: options.depth ? Number.parseInt(options.depth, 10) : 3,
      level: (options.level ?? "summary") as GraphCallsParams["level"],
      limit: options.limit ? Number.parseInt(options.limit, 10) : 100,
    };

    const result = await graphCalls(ctx, params);

    const output = formatCallGraph(result.data, params.level, options.json ?? false);

    return {
      success: true,
      output,
      count: result.total,
      timeMs: result.queryTimeMs,
      data: result.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: options.json
        ? formatOutput({ error: errorMessage }, { json: true })
        : `Error: ${errorMessage}`,
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
 * Register graph-calls command
 */
export function registerGraphCallsV2(parent: Command): void {
  parent
    .command("graph-calls <entity>")
    .description(
      "Get call graph for a function. " + "Shows who calls this function and what it calls."
    )
    .option("-p, --package <path>", "Query single package only")
    .option("--direction <dir>", "Direction: callers, callees, or both", "both")
    .option("-d, --depth <n>", "Maximum call chain depth", "3")
    .option("-l, --level <level>", "Output level: counts, summary, details", "summary")
    .option("--limit <count>", "Maximum results per direction", "100")
    .option("--json", "Output as JSON")
    .action(async (entity: string, options: CallGraphCliOptions) => {
      const result = await graphCallsCommand(entity, options);
      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}

// ============================================================================
// Register all graph commands
// ============================================================================

/**
 * Register all v2 graph query commands
 */
export function registerAllGraphQueriesV2(parent: Command): void {
  registerGraphDepsV2(parent);
  registerGraphDependentsV2(parent);
  registerGraphCallsV2(parent);
}
