/**
 * MCP Tool Definitions
 *
 * Tool naming follows the CLI command pattern:
 * - query_* for querying the code graph
 * - status_* for status/diagnostics
 */

import type { MCPTool } from "../types.js";

/**
 * All available MCP tools
 */
export const MCP_TOOLS: MCPTool[] = [
  // ================== Query Tools ==================
  {
    name: "query_symbol",
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
    name: "query_deps",
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
    name: "query_dependents",
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
    name: "query_file",
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
    name: "query_affected",
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
    name: "query_call_graph",
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
    name: "query_schema",
    description:
      "Get available tables and columns in the code graph database. Useful for discovering the schema before writing SQL queries. Returns seed tables (nodes, edges, external_refs, effects) and hub tables (repo_registry, validation_errors, unified_diagnostics).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "query_repos",
    description:
      "List all registered repositories in the hub. Only available in hub mode. Returns repository metadata including path, package count, status, and last sync time.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "query_context",
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
  // ================== Status Tools ==================
  {
    name: "status",
    description:
      "Get workspace status including seed states for all repositories and packages. Shows which packages are analyzed (have base seeds), need analysis, or have delta changes. Use this to understand what needs to be analyzed or registered with the hub.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to check (defaults to current working directory)",
        },
        level: {
          type: "string",
          enum: ["summary", "brief", "full"],
          description:
            "Output detail level: summary (1-line), brief (sectioned), full (detailed). Default: brief",
        },
        json: {
          type: "boolean",
          description: "Return DevACStatusJSON format for structured consumption",
        },
        groupBy: {
          type: "string",
          enum: ["type", "repo", "status"],
          description: "Grouping mode for output",
        },
      },
      required: [],
    },
  },
  {
    name: "status_diagnostics",
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
    name: "status_diagnostics_summary",
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
    name: "status_diagnostics_counts",
    description:
      "Get total counts of validation errors and warnings across all repositories. Only available in hub mode.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  // ================== Unified Diagnostics Tools ==================
  {
    name: "status_all_diagnostics",
    description:
      "Get all diagnostics (validation errors, CI failures, GitHub issues, PR reviews) from a unified view. Filter by source, severity, category, and more. Use this to answer 'What do I need to fix?' across all diagnostics types. Only available in hub mode.",
    inputSchema: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["counts", "summary", "details"],
          description:
            "Level of detail: 'counts' returns totals by severity, 'summary' returns grouped counts, 'details' returns full diagnostic records (default)",
        },
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
          description: "Filter by diagnostics sources (validation, CI, issues, reviews)",
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
          description: "Filter by diagnostics categories",
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
          description: "Maximum number of diagnostics items to return",
        },
      },
      required: [],
    },
  },
  {
    name: "status_all_diagnostics_summary",
    description:
      "Get a summary of all diagnostics grouped by source, severity, category, or repository. Provides an overview of what needs attention. Only available in hub mode.",
    inputSchema: {
      type: "object",
      properties: {
        groupBy: {
          type: "string",
          enum: ["repo", "source", "severity", "category"],
          description: "How to group the diagnostics counts",
        },
      },
      required: ["groupBy"],
    },
  },
  {
    name: "status_all_diagnostics_counts",
    description:
      "Get total counts of diagnostics by severity (critical, error, warning, suggestion, note). Only available in hub mode.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  // ================== Query Effects, Rules, C4 Tools (v3.0) ==================
  {
    name: "query_effects",
    description:
      "Query code effects (function calls, store operations, external requests, etc.) extracted during analysis. Effects represent observable behaviors in code that can be classified by the rules engine.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["FunctionCall", "Store", "Retrieve", "Send", "Request", "Response"],
          description: "Filter by effect type",
        },
        file: {
          type: "string",
          description: "Filter by file path (partial match)",
        },
        entity: {
          type: "string",
          description: "Filter by source entity ID",
        },
        externalOnly: {
          type: "boolean",
          description: "Show only external calls",
        },
        asyncOnly: {
          type: "boolean",
          description: "Show only async calls",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 100)",
        },
      },
      required: [],
    },
  },
  {
    name: "query_rules",
    description:
      "Run the rules engine on effects to produce domain effects. Domain effects are high-level classifications like 'Payment:Charge', 'Auth:TokenVerify', 'Database:Query'. Returns matched domain effects and statistics about rule matches.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Filter results by domain (e.g., Payment, Auth, Database)",
        },
        limit: {
          type: "number",
          description: "Maximum effects to process (default: 1000)",
        },
        includeStats: {
          type: "boolean",
          description: "Include rule match statistics in response",
        },
      },
      required: [],
    },
  },
  {
    name: "query_rules_list",
    description:
      "List available rules in the rules engine. Rules define patterns for classifying code effects into domain effects.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Filter by domain (e.g., Payment, Auth)",
        },
        provider: {
          type: "string",
          description: "Filter by provider (e.g., stripe, aws)",
        },
      },
      required: [],
    },
  },
  {
    name: "query_c4",
    description:
      "Generate C4 architecture diagrams from code effects. Returns C4 model data and optionally PlantUML diagram code. Supports Context, Container, and Component levels.",
    inputSchema: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["context", "containers", "domains", "externals"],
          description: "C4 diagram level to generate",
        },
        systemName: {
          type: "string",
          description: "Name for the system in the diagram",
        },
        systemDescription: {
          type: "string",
          description: "Description for the system",
        },
        outputFormat: {
          type: "string",
          enum: ["json", "plantuml", "both"],
          description: "Output format: json (model data), plantuml (diagram code), or both",
        },
        limit: {
          type: "number",
          description: "Maximum effects to process (default: 1000)",
        },
      },
      required: [],
    },
  },
];

export { MCP_TOOLS as default };
