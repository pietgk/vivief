# MCP Server Integration

DevAC provides a Model Context Protocol (MCP) server that enables AI assistants to query and analyze your codebase's code graph.

## Overview

The MCP server exposes DevAC's code analysis capabilities through the Model Context Protocol, allowing AI tools like Claude to:

- Find symbols by name or kind
- Navigate dependency relationships
- Analyze call graphs
- Determine affected files from changes
- Execute custom SQL queries against the code graph

## Installation

The MCP server is part of the `@pietgk/devac-mcp` package:

```bash
pnpm add @pietgk/devac-mcp
```

## Starting the Server

### Via CLI

```bash
devac mcp start --package /path/to/your/package
```

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

The MCP server exposes 9 tools for code analysis and context discovery:

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

## Server Configuration

### MCPServerOptions

```typescript
interface MCPServerOptions {
  packagePath: string;     // Path to the package to analyze
  memoryLimit?: string;    // DuckDB memory limit (default: "256MB")
}
```

### Server Status

```typescript
const status = server.getStatus();
// Returns:
// {
//   isRunning: boolean;
//   packagePath: string;
//   toolCount: number;
//   uptime: number;  // milliseconds since start
// }
```

## Integration with AI Assistants

### Claude Desktop

Add the following to your Claude Desktop configuration:

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

const server = new DevacMCPServer({
  packagePath: "/path/to/package"
});

await server.start();
// Server now accepts MCP messages via stdin/stdout
```

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
- [Data Model](./data-model.md) - Understanding nodes, edges, and refs
- [Architecture Overview](./architecture-overview.md) - System design
