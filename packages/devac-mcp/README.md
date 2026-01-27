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

## Multi-Session Proxy Architecture

When multiple Claude Code sessions connect to the same workspace, the MCP server uses a transparent stdio-to-IPC proxy architecture that enables concurrent access without conflicts.

### How It Works

Each Claude Code session spawns its own `devac-mcp` process with stdio transport. The MCP server automatically detects whether a backend HubServer is already running:

1. **First Session (Server Mode)**: Starts the HubServer with exclusive database access
2. **Additional Sessions (Client Mode)**: Detect the existing backend and delegate hub operations via IPC

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Workspace                                   │
│                                                                          │
│  ┌───────────────┐     ┌───────────────┐     ┌───────────────┐          │
│  │ Claude Code #1│     │ Claude Code #2│     │ Claude Code #3│          │
│  └───────┬───────┘     └───────┬───────┘     └───────┬───────┘          │
│          │ stdio               │ stdio               │ stdio            │
│          ▼                     ▼                     ▼                   │
│  ┌───────────────┐     ┌───────────────┐     ┌───────────────┐          │
│  │  devac-mcp    │     │  devac-mcp    │     │  devac-mcp    │          │
│  │(server mode)  │     │(client mode)  │     │(client mode)  │          │
│  │               │     │               │     │               │          │
│  │  HubServer    │◄────│  HubClient    │     │  HubClient    │          │
│  │     │         │     │       │       │     │       │       │          │
│  │     ▼         │     └───────┼───────┘     └───────┼───────┘          │
│  │ CentralHub    │             │                     │                   │
│  │     │         │◄────────────┴─────────────────────┘                   │
│  │     ▼         │              IPC (~/.devac/mcp.sock)                  │
│  │ central.duckdb│                                                       │
│  └───────────────┘                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Client Mode Auto-Detection

When `devac-mcp` starts, it checks if a HubServer is already running:

```typescript
// Pseudo-code from HubDataProvider.initialize()
const client = createHubClient({ hubDir });
if (await client.isMCPRunning()) {
  // Client mode: delegate hub operations to existing server
  this._hubClient = client;
  this._isClientMode = true;
} else {
  // Server mode: start our own HubServer
  this._hubServer = createHubServer({ hubDir });
  await this._hubServer.start();
}
```

### Request Isolation

Each Claude session has complete isolation:
- **Separate stdio pairs**: Each session has its own stdin/stdout to Claude
- **Independent client instances**: Each MCP process has its own HubClient
- **Shared backend**: All clients connect to the same HubServer via IPC

This means multiple Claude sessions can query the code graph simultaneously without interference.

### Auto-Promotion

When the backend HubServer shuts down (e.g., the first Claude session ends), client-mode MCP processes automatically attempt to promote to server mode:

1. **Detection**: First failed IPC request triggers connection error detection
2. **Promotion attempt**: Client tries to start its own HubServer
3. **Race handling**: If another client wins the race, stays in client mode

This ensures continuous service even when the original server exits.

### Connection Error Patterns

The following error patterns trigger auto-promotion:
- `ECONNREFUSED` - Socket connection refused
- `ENOENT` - Socket file doesn't exist
- `IPC timeout` - Request timed out

Regular application errors (e.g., "Query failed") do not trigger promotion.

## Related Packages

- [@pietgk/devac-core](../devac-core) - Core analysis library
- [@pietgk/devac-cli](../devac-cli) - Command-line interface

## Documentation

- [MCP Server Guide](../../docs/mcp-server.md) - Full documentation
- [API Reference](../../docs/api-reference.md) - Programmatic API

## License

MIT
