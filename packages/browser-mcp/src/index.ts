#!/usr/bin/env node
/**
 * Browser MCP Server Entry Point
 *
 * Starts the MCP server for browser automation tools.
 */

import { BrowserMCPServer } from "./server.js";
import { VERSION } from "./version.js";

// Export types and classes for programmatic use
export { BrowserMCPServer } from "./server.js";
export { MCP_TOOLS } from "./tools/index.js";
export type { MCPTool, MCPToolResult, PropertySchema } from "./types.js";
export { VERSION } from "./version.js";

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle version flag
  if (args.includes("--version") || args.includes("-v")) {
    console.log(`browser-mcp ${VERSION}`);
    process.exit(0);
  }

  // Handle help flag
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  // Start the server
  const server = new BrowserMCPServer();

  // Handle shutdown signals
  const cleanup = async () => {
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    await server.start();
  } catch (error) {
    console.error("Failed to start server:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
Browser MCP Server - Browser automation tools for AI assistants

Usage: browser-mcp [options]

Options:
  -v, --version  Show version number
  -h, --help     Show help

Description:
  Starts an MCP (Model Context Protocol) server that exposes browser
  automation tools. The server communicates via stdio and provides
  tools for browser session management, navigation, page reading,
  interactions, and more.

Available Tools:
  Session Management:
    - browser_session_start   Start a new browser session
    - browser_session_stop    Stop a browser session
    - browser_session_list    List active sessions

  Navigation:
    - browser_navigate        Navigate to a URL
    - browser_reload          Reload the current page
    - browser_back            Go back in history
    - browser_forward         Go forward in history

  Page Reading:
    - browser_read_page       Get page content with element refs
    - browser_get_text        Get element text by ref
    - browser_get_value       Get input value by ref

  Actions:
    - browser_click           Click an element
    - browser_type            Type text into an element
    - browser_fill            Fill an input field
    - browser_select          Select a dropdown option
    - browser_scroll          Scroll the page
    - browser_hover           Hover over an element

  Finding Elements:
    - browser_find            Find elements by various strategies

  Utilities:
    - browser_screenshot      Take a screenshot
    - browser_evaluate        Execute JavaScript
    - browser_wait            Wait for a condition

Example MCP Configuration (claude_desktop_config.json):
  {
    "mcpServers": {
      "browser": {
        "command": "browser-mcp"
      }
    }
  }

For more information, visit: https://github.com/pietgk/vivief
`);
}

// Run if called directly
main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
