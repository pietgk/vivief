# @pietgk/devac-mcp

Model Context Protocol (MCP) server for DevAC - enable AI assistants to query and analyze your code graph.

## Installation

```bash
pnpm add @pietgk/devac-mcp
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
import { createMCPServer, DevacMCPServer } from "@pietgk/devac-mcp";

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

## Hub Mode Architecture

In hub mode, the MCP server owns the central hub database (`~/.devac/central.duckdb`) exclusively. This is required because DuckDB does not support concurrent read-write access from multiple processes.

### How It Works

When the MCP server starts in hub mode:

1. **Hub Server**: Creates a Unix socket at `~/.devac/mcp.sock`
2. **Exclusive Access**: Opens `central.duckdb` with read-write access
3. **IPC Handler**: Listens for CLI commands via the socket

CLI commands (`devac hub register`, `devac hub query`, etc.) automatically detect whether MCP is running and route requests accordingly:

```
┌─────────┐     Unix Socket IPC       ┌─────────────────┐
│   CLI   │ ────────────────────────► │   MCP Server    │
│ Command │                           │   (Hub Owner)   │
└─────────┘                           │ ┌─────────────┐ │
                                      │ │ CentralHub  │ │
                                      │ │ (RW access) │ │
                                      │ └──────┬──────┘ │
                                      └────────┼────────┘
                                               │
                                               ▼
                                      ┌───────────────┐
                                      │ central.duckdb│
                                      └───────────────┘
```

### Supported Operations

The IPC layer supports all hub operations:

**Write operations:**
- `register` - Register a repository
- `unregister` - Unregister a repository
- `refresh` / `refreshAll` - Refresh manifests
- `pushDiagnostics` - Push validation errors
- `clearDiagnostics` - Clear diagnostics
- `resolveDiagnostics` - Mark diagnostics as resolved

**Read operations:**
- `query` - Execute SQL queries
- `listRepos` - List registered repositories
- `getRepoStatus` - Get hub status
- `getValidationErrors` / `getValidationSummary` / `getValidationCounts`
- `getDiagnostics` / `getDiagnosticsSummary` / `getDiagnosticsCounts`

### Fallback Behavior

When MCP is not running, CLI commands fall back to direct database access. This means:
- Single-developer workflows work without MCP
- Multi-tool workflows (CLI + MCP) work seamlessly together

See [ADR-0024](../../docs/adr/0024-hub-single-writer-ipc.md) for implementation details.

## Related Packages

- [@pietgk/devac-core](../devac-core) - Core analysis library
- [@pietgk/devac-cli](../devac-cli) - Command-line interface

## Documentation

- [MCP Server Guide](../../docs/mcp-server.md) - Full documentation
- [API Reference](../../docs/api-reference.md) - Programmatic API
- [Storage System](../../docs/implementation/storage.md) - Hub IPC architecture

## License

MIT
