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
# Hub mode (default) - federated queries across all repos
devac mcp

# Package mode - single package queries
devac mcp --package /path/to/your/package
```

### Programmatically

```typescript
import { createMCPServer, DevacMCPServer } from "@pietgk/devac-mcp";

// Quick start in hub mode
const server = await createMCPServer({ mode: "hub" });

// Or package mode
const server = await createMCPServer({
  mode: "package",
  packagePath: "/path/to/package",
});

// Check status
console.log(server.getStatus());
// { isRunning: true, mode: "hub", toolCount: 21, uptime: 1234 }

// When done
await server.stop();
```

## Available Tools

The MCP server exposes 21 tools organized by category:

### Query Tools (10)

Tools for querying the code graph, prefixed with `query_`:

| Tool | Description |
|------|-------------|
| `query_symbol` | Find symbols by name and optionally filter by kind |
| `query_deps` | Get dependencies of a symbol |
| `query_dependents` | Get symbols that depend on the target |
| `query_file` | Get all symbols defined in a file |
| `query_affected` | Get files affected by changes |
| `query_call_graph` | Get call graph for a function |
| `query_sql` | Execute read-only SQL queries against the code graph |
| `query_schema` | Get available tables and columns in the database |
| `query_repos` | List all registered repositories (hub mode only) |
| `query_context` | Discover workspace context and sibling repos |

### Status Tools (7)

Tools for status and diagnostics, prefixed with `status_`:

| Tool | Description |
|------|-------------|
| `status` | Get workspace status including seed states |
| `status_diagnostics` | Get validation errors (type errors, lint issues) |
| `status_diagnostics_summary` | Get validation error summary by group |
| `status_diagnostics_counts` | Get total counts of errors and warnings |
| `status_all_diagnostics` | Get all diagnostics (validation + CI + issues) |
| `status_all_diagnostics_summary` | Get all diagnostics summary |
| `status_all_diagnostics_counts` | Get all diagnostics counts |

### Effects/Rules/C4 Tools (4)

Tools for code effects and architecture, prefixed with `query_`:

| Tool | Description |
|------|-------------|
| `query_effects` | Query code effects (calls, stores, requests) |
| `query_rules` | Run rules engine on effects |
| `query_rules_list` | List available rules |
| `query_c4` | Generate C4 architecture diagrams |

## Configuration

```typescript
interface MCPServerOptions {
  mode: "hub" | "package";   // Operating mode
  packagePath?: string;      // Required for package mode
  memoryLimit?: string;      // DuckDB memory limit (default: "256MB")
}
```

## Integration with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "devac": {
      "command": "npx",
      "args": ["devac-mcp"]
    }
  }
}
```

## Prerequisites

Before using the MCP server, analyze your packages:

```bash
devac sync
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

CLI commands (`devac sync`, `devac query`, etc.) automatically detect whether MCP is running and route requests accordingly:

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

## License

MIT
