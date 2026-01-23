/**
 * MCP Command Implementation
 *
 * Starts/stops the MCP (Model Context Protocol) server
 * for AI assistant integration.
 * Based on Phase 5 plan.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  DuckDBPool,
  SeedReader,
  type SymbolAffectedAnalyzer,
  createHubClient,
  createSymbolAffectedAnalyzer,
  executeWithRecovery,
  findWorkspaceHubDir,
} from "@pietgk/devac-core";
import type { Command } from "commander";

/**
 * MCP Tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP Tool result
 */
export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * MCP Server Controller
 */
export interface MCPController {
  /** Stop the MCP server */
  stop(): Promise<void>;
  /** Check if server is running */
  isRunning(): boolean;
  /** Get list of available tools */
  getTools(): MCPTool[];
  /** Execute a tool */
  executeTool(toolName: string, input: Record<string, unknown>): Promise<MCPToolResult>;
}

/**
 * Options for mcp command
 */
export interface MCPCommandOptions {
  /** Path to the package */
  packagePath: string;
  /** Action to perform */
  action: "start" | "stop";
  /** Transport type (default: stdio) */
  transport?: "stdio";
}

/**
 * Options for mcp stop command
 */
export interface MCPStopOptions {
  /** Force kill using PID file if IPC shutdown fails */
  force?: boolean;
}

/**
 * Result from mcp stop command
 */
export interface MCPStopResult {
  success: boolean;
  method?: "ipc" | "pid" | "none";
  error?: string;
}

/**
 * Result from mcp command
 */
export interface MCPCommandResult {
  success: boolean;
  controller?: MCPController;
  toolCount: number;
  error?: string;
}

/**
 * Available MCP tools
 */
const MCP_TOOLS: MCPTool[] = [
  {
    name: "find_symbol",
    description: "Find a symbol by name in the codebase",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Symbol name to find" },
        kind: { type: "string", description: "Optional symbol kind filter" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_dependencies",
    description: "Get dependencies of a symbol",
    inputSchema: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Entity ID of the symbol" },
        maxDepth: { type: "number", description: "Maximum traversal depth" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "get_dependents",
    description: "Get symbols that depend on the target",
    inputSchema: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Entity ID of the symbol" },
        maxDepth: { type: "number", description: "Maximum traversal depth" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "get_affected",
    description: "Get files affected by changes",
    inputSchema: {
      type: "object",
      properties: {
        changedFiles: {
          type: "array",
          items: { type: "string" },
          description: "List of changed file paths",
        },
        maxDepth: { type: "number", description: "Maximum traversal depth" },
      },
      required: ["changedFiles"],
    },
  },
  {
    name: "query_sql",
    description: "Execute a read-only SQL query against the code graph",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL query (SELECT only)" },
      },
      required: ["sql"],
    },
  },
];

/**
 * Create an MCP server controller
 */
function createMCPController(
  pool: DuckDBPool,
  packagePath: string,
  seedReader: SeedReader
): MCPController {
  let running = true;
  const analyzer = createSymbolAffectedAnalyzer(pool, packagePath, seedReader);

  return {
    async stop(): Promise<void> {
      running = false;
      await pool.shutdown();
    },

    isRunning(): boolean {
      return running;
    },

    getTools(): MCPTool[] {
      return [...MCP_TOOLS];
    },

    async executeTool(toolName: string, input: Record<string, unknown>): Promise<MCPToolResult> {
      try {
        switch (toolName) {
          case "find_symbol":
            return await executeFindSymbol(seedReader, input);

          case "get_dependencies":
            return await executeGetDependencies(seedReader, input);

          case "get_dependents":
            return await executeGetDependents(seedReader, input);

          case "get_affected":
            return await executeGetAffected(analyzer, input);

          case "query_sql":
            return await executeQuerySql(pool, input);

          default:
            return {
              success: false,
              error: `Unknown tool: ${toolName}`,
            };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Execute find_symbol tool
 */
async function executeFindSymbol(
  seedReader: SeedReader,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  const name = input.name as string;
  const kind = input.kind as string | undefined;

  // Use querySeeds to find nodes by name
  let sql = `SELECT * FROM nodes WHERE name = '${name.replace(/'/g, "''")}'`;
  if (kind) {
    sql += ` AND kind = '${kind.replace(/'/g, "''")}'`;
  }

  const nodes = await seedReader.querySeeds(sql);

  return {
    success: true,
    data: nodes,
  };
}

/**
 * Execute get_dependencies tool
 */
async function executeGetDependencies(
  seedReader: SeedReader,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  const entityId = input.entityId as string;

  // Use getEdgesBySource to find dependencies
  const edges = await seedReader.getEdgesBySource(entityId);

  return {
    success: true,
    data: edges,
  };
}

/**
 * Execute get_dependents tool
 */
async function executeGetDependents(
  seedReader: SeedReader,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  const entityId = input.entityId as string;

  // Use getEdgesByTarget to find dependents
  const edges = await seedReader.getEdgesByTarget(entityId);

  return {
    success: true,
    data: edges,
  };
}

/**
 * Execute get_affected tool
 */
async function executeGetAffected(
  analyzer: SymbolAffectedAnalyzer,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  const changedFiles = input.changedFiles as string[];
  const maxDepth = (input.maxDepth as number) ?? 10;

  const result = await analyzer.analyzeFileChanges(changedFiles, {}, { maxDepth });

  return {
    success: true,
    data: result,
  };
}

/**
 * Execute query_sql tool
 */
async function executeQuerySql(
  pool: DuckDBPool,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  const sql = input.sql as string;

  // Safety check: only allow SELECT queries
  const trimmedSql = sql.trim().toLowerCase();
  if (!trimmedSql.startsWith("select")) {
    return {
      success: false,
      error: "Only SELECT queries are allowed",
    };
  }

  // Use executeWithRecovery to run the query with proper connection handling
  const result = await executeWithRecovery(pool, async (conn) => {
    return await conn.all(sql);
  });

  return {
    success: true,
    data: result,
  };
}

/**
 * Start or stop MCP server
 */
export async function mcpCommand(options: MCPCommandOptions): Promise<MCPCommandResult> {
  // Validate package path exists
  try {
    await fs.access(options.packagePath);
  } catch {
    return {
      success: false,
      toolCount: 0,
      error: `Path does not exist: ${options.packagePath}`,
    };
  }

  if (options.action === "stop") {
    // Stop action handled by controller
    return {
      success: true,
      toolCount: 0,
    };
  }

  // Start action
  let pool: DuckDBPool | null = null;

  try {
    // Initialize DuckDB pool
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Create seed reader
    const seedReader = new SeedReader(pool, options.packagePath);

    // Create controller
    const controller = createMCPController(pool, options.packagePath, seedReader);

    return {
      success: true,
      controller,
      toolCount: MCP_TOOLS.length,
    };
  } catch (error) {
    if (pool) {
      await pool.shutdown();
    }

    return {
      success: false,
      toolCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stop a running MCP server
 */
export async function mcpStopCommand(options: MCPStopOptions = {}): Promise<MCPStopResult> {
  // Find the workspace hub directory
  const hubDir = await findWorkspaceHubDir();
  if (!hubDir) {
    return {
      success: false,
      error: "Could not find workspace hub directory. Are you in a DevAC workspace?",
    };
  }

  const client = createHubClient({ hubDir });

  // First try IPC shutdown
  if (await client.isMCPRunning()) {
    try {
      await client.shutdown();
      // Wait a moment for server to stop
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify it's stopped
      if (!(await client.isMCPRunning())) {
        return { success: true, method: "ipc" };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`IPC shutdown failed: ${message}`);
      // Fall through to PID fallback if --force
    }
  }

  // If --force, try PID file fallback
  if (options.force) {
    const pid = await client.getMCPPid();
    if (pid) {
      try {
        process.kill(pid, "SIGTERM");
        // Wait for process to die
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check if still running
        try {
          process.kill(pid, 0); // Check if process exists
          // Still running, try SIGKILL
          process.kill(pid, "SIGKILL");
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch {
          // Process doesn't exist anymore
        }

        return { success: true, method: "pid" };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          method: "pid",
          error: `Failed to kill process ${pid}: ${message}`,
        };
      }
    }
  }

  // Check if MCP is even running
  if (!(await client.isMCPRunning())) {
    return { success: true, method: "none" };
  }

  return {
    success: false,
    error: "Failed to stop MCP server. Try 'devac mcp stop --force' to force kill.",
  };
}

/**
 * Register the mcp command with the CLI program
 */
export function registerMcpCommand(program: Command): void {
  const mcpCmd = program
    .command("mcp")
    .description("MCP server management for AI assistant integration");

  // Start subcommand (default action when running 'devac mcp')
  mcpCmd
    .command("start", { isDefault: true })
    .description("Start MCP server for AI assistant integration")
    .option("-p, --package <path>", "Package path", process.cwd())
    .action(async (options) => {
      const result = await mcpCommand({
        packagePath: path.resolve(options.package),
        action: "start",
      });

      if (result.success) {
        if (result.controller) {
          console.log(`✓ MCP server started with ${result.toolCount} tools`);
          console.log("Available tools:");
          for (const tool of result.controller.getTools()) {
            console.log(`  - ${tool.name}: ${tool.description}`);
          }
          console.log("\nPress Ctrl+C to stop.\n");

          process.on("SIGINT", async () => {
            console.log("\nStopping MCP server...");
            await result.controller?.stop();
            console.log("MCP server stopped.");
            process.exit(0);
          });
        } else {
          console.log("MCP server stopped.");
        }
      } else {
        console.error(`✗ MCP failed: ${result.error}`);
        process.exit(1);
      }
    });

  // Stop subcommand
  mcpCmd
    .command("stop")
    .description("Stop the running MCP server")
    .option("-f, --force", "Force kill using PID if IPC shutdown fails")
    .action(async (options) => {
      const result = await mcpStopCommand({ force: options.force });

      if (result.success) {
        switch (result.method) {
          case "ipc":
            console.log("✓ MCP server stopped gracefully via IPC");
            break;
          case "pid":
            console.log("✓ MCP server stopped via SIGTERM");
            break;
          case "none":
            console.log("✓ MCP server was not running");
            break;
        }
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });

  // Status subcommand
  mcpCmd
    .command("status")
    .description("Check if MCP server is running")
    .action(async () => {
      const hubDir = await findWorkspaceHubDir();
      if (!hubDir) {
        console.log("Not in a DevAC workspace");
        return;
      }

      const client = createHubClient({ hubDir });
      const running = await client.isMCPRunning();

      if (running) {
        console.log("✓ MCP server is running");
        try {
          const pingResponse = await client.ping();
          console.log(`  Version: ${pingResponse.serverVersion}`);
          console.log(`  Protocol: ${pingResponse.protocolVersion}`);
        } catch {
          console.log("  (version info unavailable)");
        }
      } else {
        console.log("✗ MCP server is not running");
      }
    });
}
