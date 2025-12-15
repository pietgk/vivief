# @devac/mcp

Model Context Protocol (MCP) server for DevAC - enable AI assistants to query and analyze your code graph.

## Installation

```bash
pnpm add @devac/mcp
```

## Overview

This package provides an MCP server that exposes DevAC's code analysis capabilities to AI assistants like Claude. The server implements the Model Context Protocol, allowing seamless integration with MCP-compatible tools.

## Quick Start

### Via CLI

```bash
devac mcp start --package /path/to/your/package
```

### Programmatically

```typescript
import { createMCPServer, DevacMCPServer } from "@devac/mcp";

// Quick start
const server = await createMCPServer({
  packagePath: "/path/to/package",
});

// Or with more control
const server = new DevacMCPServer({
  packagePath: "/path/to/package",
  memoryLimit: "512MB",
});

await server.start();

// Check status
console.log(server.getStatus());
// { isRunning: true, toolCount: 7, uptime: 1234, packagePath: "..." }

// When done
await server.stop();
```

## Available Tools

The MCP server exposes 7 tools:

| Tool | Description |
|------|-------------|
| `find_symbol` | Find symbols by name and optionally filter by kind |
| `get_dependencies` | Get all symbols that an entity depends on |
| `get_dependents` | Get all symbols that depend on an entity |
| `get_file_symbols` | Get all symbols defined in a file |
| `get_affected` | Analyze impact of file changes |
| `get_call_graph` | Get callers/callees of a function |
| `query_sql` | Execute custom SQL queries (SELECT only) |

## Configuration

```typescript
interface MCPServerOptions {
  packagePath: string;     // Path to the analyzed package
  memoryLimit?: string;    // DuckDB memory limit (default: "256MB")
}
```

## Integration with Claude Desktop

Add to your Claude Desktop configuration:

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

## Prerequisites

Before using the MCP server, analyze your package:

```bash
devac analyze /path/to/your/package
```

This creates the `.devac/seed/` directory with Parquet files that the MCP server queries.

## API

### DevacMCPServer

```typescript
class DevacMCPServer {
  constructor(options: MCPServerOptions);
  
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getStatus(): MCPServerStatus;
}
```

### createMCPServer

```typescript
async function createMCPServer(options: MCPServerOptions): Promise<DevacMCPServer>;
```

Convenience function that creates and starts a server in one call.

## Related Packages

- [@devac/core](../devac-core) - Core analysis library
- [@devac/cli](../devac-cli) - Command-line interface

## Documentation

- [MCP Server Guide](../../docs/mcp-server.md) - Full documentation
- [API Reference](../../docs/api-reference.md) - Programmatic API

## License

MIT
