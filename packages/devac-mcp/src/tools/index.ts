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
  {
    name: "get_validation_errors",
    description:
      "Get validation errors (type errors, lint issues, test failures) from the hub cache. Returns errors that need to be fixed. Only available in hub mode.",
    inputSchema: {
      type: "object",
      properties: {
        repo_id: {
          type: "string",
          description: "Filter by repository ID (e.g., 'github.com/org/repo')",
        },
        severity: {
          type: "string",
          enum: ["error", "warning"],
          description: "Filter by severity level",
        },
        source: {
          type: "string",
          enum: ["tsc", "eslint", "test"],
          description: "Filter by error source (TypeScript, ESLint, or tests)",
        },
        file: {
          type: "string",
          description: "Filter by file path (partial match)",
        },
        limit: {
          type: "number",
          description: "Maximum number of errors to return",
        },
      },
      required: [],
    },
  },
  {
    name: "get_validation_summary",
    description:
      "Get a summary of validation errors grouped by repository, file, source, or severity. Useful for getting an overview of issues. Only available in hub mode.",
    inputSchema: {
      type: "object",
      properties: {
        groupBy: {
          type: "string",
          enum: ["repo", "file", "source", "severity"],
          description: "How to group the error counts",
        },
      },
      required: ["groupBy"],
    },
  },
  {
    name: "get_validation_counts",
    description:
      "Get total counts of validation errors and warnings across all repositories. Only available in hub mode.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  // ================== Unified Feedback Tools ==================
  {
    name: "get_all_feedback",
    description:
      "Get all feedback (validation errors, CI failures, GitHub issues, PR reviews) from a unified view. Filter by source, severity, category, and more. Use this to answer 'What do I need to fix?' across all feedback types. Only available in hub mode.",
    inputSchema: {
      type: "object",
      properties: {
        repo_id: {
          type: "string",
          description: "Filter by repository ID (e.g., 'github.com/org/repo')",
        },
        source: {
          type: "array",
          items: {
            type: "string",
            enum: ["tsc", "eslint", "test", "ci-check", "github-issue", "pr-review"],
          },
          description: "Filter by feedback sources (validation, CI, issues, reviews)",
        },
        severity: {
          type: "array",
          items: {
            type: "string",
            enum: ["critical", "error", "warning", "suggestion", "note"],
          },
          description: "Filter by severity levels",
        },
        category: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "compilation",
              "linting",
              "testing",
              "ci-check",
              "task",
              "feedback",
              "code-review",
            ],
          },
          description: "Filter by feedback categories",
        },
        file_path: {
          type: "string",
          description: "Filter by file path (partial match)",
        },
        resolved: {
          type: "boolean",
          description: "Filter by resolution status (true = resolved, false = unresolved)",
        },
        limit: {
          type: "number",
          description: "Maximum number of feedback items to return",
        },
      },
      required: [],
    },
  },
  {
    name: "get_feedback_summary",
    description:
      "Get a summary of all feedback grouped by source, severity, category, or repository. Provides an overview of what needs attention. Only available in hub mode.",
    inputSchema: {
      type: "object",
      properties: {
        groupBy: {
          type: "string",
          enum: ["repo", "source", "severity", "category"],
          description: "How to group the feedback counts",
        },
      },
      required: ["groupBy"],
    },
  },
  {
    name: "get_feedback_counts",
    description:
      "Get total counts of feedback by severity (critical, error, warning, suggestion, note). Only available in hub mode.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

export { MCP_TOOLS as default };
