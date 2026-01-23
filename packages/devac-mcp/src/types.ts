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
 * Readiness metadata for query results.
 * Included when queries return empty/no data to explain why.
 */
export interface MCPReadinessMeta {
  /** Whether the query can proceed */
  ready: boolean;
  /** Current system state */
  state: "first-run" | "ready" | "partial" | "broken" | "locked";
  /** Human-readable explanation */
  reason?: string;
  /** Suggested fix command */
  fix?: string;
}

/**
 * MCP Tool result
 */
export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** Readiness metadata - included when results are empty to explain why */
  readiness?: MCPReadinessMeta;
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
  toolCount: number;
  uptime: number;
}
