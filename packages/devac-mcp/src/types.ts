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
 * MCP Server options
 */
export interface MCPServerOptions {
  /** Path to the package to analyze */
  packagePath: string;
  /** Memory limit for DuckDB (default: 256MB) */
  memoryLimit?: string;
}

/**
 * MCP Server status
 */
export interface MCPServerStatus {
  isRunning: boolean;
  packagePath: string;
  toolCount: number;
  uptime: number;
}
