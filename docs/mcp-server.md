# MCP Server Integration

DevAC provides a Model Context Protocol (MCP) server that enables AI assistants to query and analyze your codebase's code graph.

## Overview

The MCP server exposes DevAC's code analysis capabilities through the Model Context Protocol, allowing AI tools like Claude to:

- Find symbols by name or kind
- Navigate dependency relationships
- Analyze call graphs
- Determine affected files from changes
- Execute custom SQL queries against the code graph
- Query validation errors (type errors, lint issues, test failures)

## Installation

The MCP server is part of the `@pietgk/devac-mcp` package:

```bash
pnpm add @pietgk/devac-mcp
```

## Starting the Server

### Via CLI

The MCP server supports two modes:

**Package Mode** - Query a single package:
```bash
devac mcp start --package /path/to/your/package
```

**Hub Mode (default)** - Query across all registered repositories:
```bash
devac mcp start
```

Hub mode is the default. Use `--package` to query a single package instead.

### Programmatically

```typescript
import { createMCPServer } from "@pietgk/devac-mcp";

const server = await createMCPServer({
  packagePath: "/path/to/your/package",
  memoryLimit: "512MB", // Optional, defaults to 256MB
});

// Server is now running and accepting MCP requests

// When done
await server.stop();
```

## Available Tools

The MCP server exposes 15 tools for code analysis, context discovery, validation, and unified feedback:

### find_symbol

Find symbols (functions, classes, etc.) by name.

**Parameters:**
- `name` (string, required): The symbol name to search for
- `kind` (string, optional): Filter by symbol kind (e.g., "class", "function", "method")

**Example:**
```json
{
  "name": "find_symbol",
  "arguments": {
    "name": "UserService",
    "kind": "class"
  }
}
```

### get_dependencies

Get all symbols that the specified entity depends on.

**Parameters:**
- `entityId` (string, required): The entity ID of the symbol

**Example:**
```json
{
  "name": "get_dependencies",
  "arguments": {
    "entityId": "pkg:class:UserService"
  }
}
```

### get_dependents

Get all symbols that depend on the specified entity.

**Parameters:**
- `entityId` (string, required): The entity ID of the symbol

**Example:**
```json
{
  "name": "get_dependents",
  "arguments": {
    "entityId": "pkg:function:validateUser"
  }
}
```

### get_file_symbols

Get all symbols defined in a specific file.

**Parameters:**
- `filePath` (string, required): The file path to analyze

**Example:**
```json
{
  "name": "get_file_symbols",
  "arguments": {
    "filePath": "src/services/user.ts"
  }
}
```

### get_affected

Analyze which files and symbols are affected by changes to specified files.

**Parameters:**
- `changedFiles` (string[], required): Array of changed file paths
- `maxDepth` (number, optional): Maximum dependency depth to traverse (default: 10)

**Example:**
```json
{
  "name": "get_affected",
  "arguments": {
    "changedFiles": ["src/models/user.ts", "src/utils/validation.ts"],
    "maxDepth": 5
  }
}
```

### get_call_graph

Get the call graph for a function or method.

**Parameters:**
- `entityId` (string, required): The entity ID of the function/method
- `direction` (string, optional): "callers", "callees", or "both" (default: "both")
- `maxDepth` (number, optional): Maximum depth to traverse (default: 3)

**Example:**
```json
{
  "name": "get_call_graph",
  "arguments": {
    "entityId": "pkg:method:UserService.createUser",
    "direction": "callees",
    "maxDepth": 2
  }
}
```

### query_sql

Execute a custom SQL query against the code graph (SELECT only).

**Parameters:**
- `sql` (string, required): The SQL query to execute

**Example:**
```json
{
  "name": "query_sql",
  "arguments": {
    "sql": "SELECT name, kind, source_file FROM nodes WHERE is_exported = true LIMIT 10"
  }
}
```

**Security Note:** Only SELECT queries are allowed. INSERT, UPDATE, DELETE, DROP, and other modifying queries are rejected.

### get_context

Discover the current working context including sibling repositories and issue worktrees. Uses intelligent caching with automatic refresh.

**Parameters:**
- `path` (string, optional): Path to discover context from (default: current working directory)
- `checkSeeds` (boolean, optional): Whether to check for DevAC seeds in discovered repos (default: true)
- `refresh` (boolean, optional): Force refresh the cached context (default: false)

**Example:**
```json
{
  "name": "get_context",
  "arguments": {
    "path": "/Users/dev/projects/api-123-auth",
    "checkSeeds": true
  }
}
```

**Response includes:**
- Current directory and parent directory
- List of sibling repositories with seed status
- Issue number (if in an issue worktree)
- Related worktrees for the same issue
- Main repos associated with worktrees

### list_repos

List all repositories registered with the central hub (hub mode only).

**Parameters:**
- None

**Example:**
```json
{
  "name": "list_repos",
  "arguments": {}
}
```

**Response:**
Returns an array of registered repositories with their paths and package information.

### get_validation_errors

Get validation errors (type errors, lint issues, test failures) from the hub cache. Only available in hub mode.

**Parameters:**
- `repo_id` (string, optional): Filter by repository ID (e.g., "github.com/org/repo")
- `severity` (string, optional): Filter by severity ("error" or "warning")
- `source` (string, optional): Filter by source ("tsc", "eslint", or "test")
- `file` (string, optional): Filter by file path (partial match)
- `limit` (number, optional): Maximum number of errors to return

**Example:**
```json
{
  "name": "get_validation_errors",
  "arguments": {
    "severity": "error",
    "source": "tsc",
    "limit": 10
  }
}
```

**Response:**
Returns an array of validation errors with file, line, column, message, severity, source, and code.

### get_validation_summary

Get a summary of validation errors grouped by repository, file, source, or severity. Only available in hub mode.

**Parameters:**
- `groupBy` (string, required): How to group error counts ("repo", "file", "source", or "severity")

**Example:**
```json
{
  "name": "get_validation_summary",
  "arguments": {
    "groupBy": "source"
  }
}
```

**Response:**
Returns grouped counts like `{ "tsc": 15, "eslint": 3, "test": 0 }`.

### get_validation_counts

Get total counts of validation errors and warnings across all repositories. Only available in hub mode.

**Parameters:**
- None

**Example:**
```json
{
  "name": "get_validation_counts",
  "arguments": {}
}
```

**Response:**
Returns `{ "errors": 18, "warnings": 7 }`.

### get_all_diagnostics

Get all diagnostics (validation errors, CI failures, GitHub issues, PR reviews) from a unified view. Use this to answer "What do I need to fix?" across all diagnostics types. Only available in hub mode.

**Parameters:**
- `repo_id` (string, optional): Filter by repository ID
- `source` (string[], optional): Filter by sources ("tsc", "eslint", "test", "ci-check", "github-issue", "pr-review")
- `severity` (string[], optional): Filter by severity ("critical", "error", "warning", "suggestion", "note")
- `category` (string[], optional): Filter by category ("compilation", "linting", "testing", "ci-check", "task", "feedback", "code-review")
- `file_path` (string, optional): Filter by file path (partial match)
- `resolved` (boolean, optional): Filter by resolution status
- `limit` (number, optional): Maximum number of items to return

**Example:**
```json
{
  "name": "get_all_diagnostics",
  "arguments": {
    "severity": ["error", "critical"],
    "source": ["tsc", "eslint"],
    "limit": 20
  }
}
```

### get_diagnostics_summary

Get a summary of all diagnostics grouped by source, severity, category, or repository. Only available in hub mode.

**Parameters:**
- `groupBy` (string, required): How to group counts ("repo", "source", "severity", or "category")

**Example:**
```json
{
  "name": "get_diagnostics_summary",
  "arguments": {
    "groupBy": "category"
  }
}
```

**Response:**
Returns grouped counts like `{ "compilation": 5, "linting": 3, "testing": 2 }`.

### get_diagnostics_counts

Get total counts of diagnostics by severity level. Only available in hub mode.

**Parameters:**
- None

**Example:**
```json
{
  "name": "get_diagnostics_counts",
  "arguments": {}
}
```

**Response:**
Returns `{ "critical": 0, "error": 18, "warning": 7, "suggestion": 2, "note": 1 }`.

## Server Configuration

### MCPServerOptions

```typescript
interface MCPServerOptions {
  /** Server mode: "package" for single package, "hub" for federated queries */
  mode: "package" | "hub";
  /** Path to the package to analyze (required in package mode) */
  packagePath?: string;
  /** Hub directory path (default: auto-detected from workspace, used in hub mode) */
  hubDir?: string;
  /** DuckDB memory limit (default: "256MB") */
  memoryLimit?: string;
}
```

### Server Status

```typescript
const status = server.getStatus();
// Returns:
// {
//   isRunning: boolean;
//   mode: "package" | "hub";
//   packagePath?: string;
//   hubDir?: string;
//   toolCount: number;
//   uptime: number;  // milliseconds since start
// }
```

## Integration with AI Assistants

### Claude Desktop

Add the following to your Claude Desktop configuration:

**Hub Mode (recommended for multi-repo):**
```json
{
  "mcpServers": {
    "devac": {
      "command": "npx",
      "args": ["devac", "mcp", "start"]
    }
  }
}
```

**Package Mode (single package):**
```json
{
  "mcpServers": {
    "devac": {
      "command": "npx",
      "args": ["devac", "mcp", "start", "--package", "/path/to/your/package"]
    }
  }
}
```

### Custom Integration

The server uses stdio transport by default, making it compatible with any MCP-compliant client:

```typescript
import { DevacMCPServer } from "@pietgk/devac-mcp";

// Hub mode - federated queries across registered repos
const hubServer = new DevacMCPServer({
  mode: "hub"
});

// Package mode - single package queries
const packageServer = new DevacMCPServer({
  mode: "package",
  packagePath: "/path/to/package"
});

await hubServer.start();
// Server now accepts MCP messages via stdin/stdout
```

## Hub Mode Architecture

In hub mode, the MCP server owns the central hub database (`~/.devac/central.duckdb`) exclusively. This is required because DuckDB does not support concurrent read-write access from multiple processes.

### Single Writer Architecture

When the MCP server starts in hub mode:

1. **Creates IPC Socket**: Unix socket at `~/.devac/mcp.sock`
2. **Opens Hub Exclusively**: Read-write access to `central.duckdb`
3. **Handles CLI Commands**: Routes CLI requests via IPC

CLI commands (`devac hub register`, `devac hub query`, etc.) automatically detect whether MCP is running:

- **MCP running**: Commands route through IPC socket
- **MCP not running**: Commands access hub directly

This is transparent to users - CLI commands work identically in both scenarios.

### IPC Operations

The MCP server handles all hub operations via IPC:

| Operation Type | Methods |
|----------------|---------|
| **Write** | `register`, `unregister`, `refresh`, `refreshAll`, `pushDiagnostics`, `clearDiagnostics`, `resolveDiagnostics` |
| **Read** | `query`, `listRepos`, `getRepoStatus`, `getValidationErrors`, `getValidationSummary`, `getValidationCounts`, `getDiagnostics`, `getDiagnosticsSummary`, `getDiagnosticsCounts` |

For implementation details, see [ADR-0024: Hub Single Writer Architecture](./adr/0024-hub-single-writer-ipc.md).

## Prerequisites

Before using the MCP server, ensure your package has been analyzed:

```bash
devac analyze /path/to/your/package
```

This creates the seed files (`.devac/seed/`) that the MCP server queries.

## Error Handling

The server handles errors gracefully and returns them in the MCP response format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"error\": \"Server not initialized\"}"
    }
  ],
  "isError": true
}
```

Common errors:
- "Server not initialized" - Call `start()` before making requests
- "Unknown tool: X" - The requested tool name is not recognized
- "Only SELECT queries are allowed" - query_sql received a non-SELECT query

## Related Documentation

- [CLI Reference](./cli-reference.md) - Full CLI documentation
- [API Reference](./api-reference.md) - Programmatic API
- [Data Model](./implementation/data-model.md) - Understanding nodes, edges, and refs
- [Architecture Overview](./implementation/overview.md) - System design
- [Storage System](./implementation/storage.md) - Hub IPC architecture details
- [ADR-0024](./adr/0024-hub-single-writer-ipc.md) - Hub Single Writer Architecture decision
