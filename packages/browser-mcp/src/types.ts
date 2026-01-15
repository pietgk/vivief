/**
 * MCP Tool Type Definitions
 */

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, PropertySchema>;
    required: string[];
  };
}

export interface PropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  minimum?: number;
}

/**
 * Internal tool result type - transformed to SDK format in request handler
 */
export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
