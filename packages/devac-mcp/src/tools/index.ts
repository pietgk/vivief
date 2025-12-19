/**
 * MCP Tool Definitions
 */

import type { MCPTool } from "../types.js";

/**
 * All available MCP tools
 */
export const MCP_TOOLS: MCPTool[] = [
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
    name: "get_file_symbols",
    description: "Get all symbols defined in a file",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to the file" },
      },
      required: ["filePath"],
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
    name: "get_call_graph",
    description: "Get the call graph for a function",
    inputSchema: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Entity ID of the function" },
        direction: {
          type: "string",
          enum: ["callers", "callees", "both"],
          description: "Direction of call graph traversal",
        },
        maxDepth: { type: "number", description: "Maximum traversal depth" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "query_sql",
    description:
      "Execute a read-only SQL query against the code graph. In hub mode, queries all seeds from registered repositories.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL query (SELECT only)" },
      },
      required: ["sql"],
    },
  },
  {
    name: "list_repos",
    description:
      "List all registered repositories in the hub. Only available in hub mode. Returns repository metadata including path, package count, status, and last sync time.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_context",
    description:
      "Discover the current working context including sibling repositories and issue worktrees. Returns information about the current directory, parent directory containing repos, and any issue-related worktrees.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to discover context from. Defaults to current working directory.",
        },
        checkSeeds: {
          type: "boolean",
          description: "Whether to check for DevAC seeds in discovered repos. Defaults to true.",
        },
        refresh: {
          type: "boolean",
          description: "Force refresh the cached context. Defaults to false.",
        },
      },
      required: [],
    },
  },
];

export { MCP_TOOLS as default };
