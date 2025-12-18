#!/usr/bin/env node

/**
 * DevAC MCP Server Entry Point
 *
 * Standalone MCP server for AI assistant integration.
 * Can be run directly or used as a library.
 */

import * as path from "node:path";
import { createMCPServer } from "./server.js";
import { MCP_TOOLS } from "./tools/index.js";
import type { MCPServerMode } from "./types.js";

// Re-export everything for library usage
export { DevacMCPServer, createMCPServer } from "./server.js";
export { MCP_TOOLS } from "./tools/index.js";
export type {
  MCPServerMode,
  MCPServerOptions,
  MCPServerStatus,
  MCPTool,
  MCPToolResult,
} from "./types.js";
export type { DataProvider, RepoListItem } from "./data-provider.js";

/**
 * Main entry point when run as CLI
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let packagePath: string | undefined;
  let hubDir: string | undefined;
  let mode: MCPServerMode = "hub"; // Default to hub mode
  let explicitMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-p" || args[i] === "--package") {
      if (explicitMode && mode === "hub") {
        console.error("Error: --package and --hub are mutually exclusive");
        process.exit(1);
      }
      packagePath = path.resolve(args[i + 1] || ".");
      mode = "package";
      explicitMode = true;
      i++;
    } else if (args[i] === "--hub") {
      if (explicitMode && mode === "package") {
        console.error("Error: --package and --hub are mutually exclusive");
        process.exit(1);
      }
      mode = "hub";
      explicitMode = true;
    } else if (args[i] === "--hub-dir") {
      hubDir = path.resolve(args[i + 1] || "~/.devac");
      i++;
    } else if (args[i] === "-h" || args[i] === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  // Validate mode-specific requirements
  if (mode === "package" && !packagePath) {
    console.error("Error: --package requires a path argument");
    process.exit(1);
  }

  // Create and start server
  const modeDescription =
    mode === "hub" ? "hub mode (federated)" : `package mode for ${packagePath}`;
  console.error(`Starting DevAC MCP server in ${modeDescription}...`);

  const server = await createMCPServer({
    mode,
    packagePath,
    hubDir,
  });

  // Handle shutdown signals
  const shutdown = async (signal: string) => {
    console.error(`${signal} received, stopping MCP server...`);
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.error(`MCP server running with ${MCP_TOOLS.length} tools`);
}

/**
 * Print help message
 */
function printHelp(): void {
  console.error("Usage: devac-mcp [options]");
  console.error("");
  console.error("Modes (mutually exclusive):");
  console.error("  --hub                 Hub mode - query across all registered repos (default)");
  console.error("  -p, --package <path>  Package mode - query a single package");
  console.error("");
  console.error("Options:");
  console.error("  --hub-dir <path>      Hub directory (default: ~/.devac)");
  console.error("  -h, --help            Show this help message");
  console.error("");
  console.error("Examples:");
  console.error("  devac-mcp                     # Start in hub mode (default)");
  console.error("  devac-mcp --hub               # Explicitly start in hub mode");
  console.error("  devac-mcp -p ./my-project     # Start in package mode");
  console.error("  devac-mcp --package ~/code    # Start in package mode");
  console.error("");
  console.error("Available tools:");
  for (const tool of MCP_TOOLS) {
    console.error(`  ${tool.name}: ${tool.description}`);
  }
}

// Run main if this is the entry point
const isMainModule =
  process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("devac-mcp");

if (isMainModule) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
