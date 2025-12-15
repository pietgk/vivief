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

// Re-export everything for library usage
export { DevacMCPServer, createMCPServer } from "./server.js";
export { MCP_TOOLS } from "./tools/index.js";
export type {
  MCPServerOptions,
  MCPServerStatus,
  MCPTool,
  MCPToolResult,
} from "./types.js";

/**
 * Main entry point when run as CLI
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let packagePath = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-p" || args[i] === "--package") {
      packagePath = path.resolve(args[i + 1] || ".");
      i++;
    } else if (args[i] === "-h" || args[i] === "--help") {
      console.error("Usage: devac-mcp [-p <package-path>]");
      console.error("");
      console.error("Options:");
      console.error("  -p, --package <path>  Package path (default: current directory)");
      console.error("  -h, --help            Show this help message");
      console.error("");
      console.error("Available tools:");
      for (const tool of MCP_TOOLS) {
        console.error(`  ${tool.name}: ${tool.description}`);
      }
      process.exit(0);
    }
  }

  // Create and start server
  console.error(`Starting DevAC MCP server for ${packagePath}...`);

  const server = await createMCPServer({ packagePath });

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

// Run main if this is the entry point
const isMainModule =
  process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("devac-mcp");

if (isMainModule) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
