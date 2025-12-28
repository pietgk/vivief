/**
 * MCP Server Types
 */

/**
 * MCP Tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
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
 * MCP Server mode
 */
export type MCPServerMode = "package" | "hub";

/**
 * MCP Server options
 */
export interface MCPServerOptions {
  /** Server mode: "package" for single package, "hub" for federated queries */
  mode: MCPServerMode;
  /** Path to the package to analyze (required in package mode) */
  packagePath?: string;
  /** Hub directory path (default: auto-detected from workspace, used in hub mode) */
  hubDir?: string;
  /** Memory limit for DuckDB (default: 256MB) */
  memoryLimit?: string;
}

/**
 * MCP Server status
 */
export interface MCPServerStatus {
  isRunning: boolean;
  mode: MCPServerMode;
  packagePath?: string;
  hubDir?: string;
  toolCount: number;
  uptime: number;
}
