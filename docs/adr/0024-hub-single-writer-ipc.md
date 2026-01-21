# ADR-0024: Hub Single Writer Architecture with IPC

## Status

Accepted

## Context

DuckDB does not support concurrent read-write access from multiple processes. When the MCP server (`devac-mcp`) is running with a read-write connection to the central hub (`central.duckdb`), CLI commands like `devac hub register` fail with:

```
Invalid Input Error: Cannot execute statement of type "INSERT" on database "central"
which is attached in read-only mode!
```

The issue occurs because:
1. MCP server opens hub with read-write access (to handle diagnostics updates, etc.)
2. CLI commands attempt their own read-write connections
3. DuckDB prevents ANY concurrent connections when one process has read-write access

This breaks the expected workflow where developers use CLI commands while MCP is running in the background.

## Decision

Implement a **Single Writer Architecture** where the MCP server is the exclusive owner of the hub database when running. CLI commands delegate all hub operations to MCP via Unix socket IPC.

### Architecture

```
                          ALL operations via IPC
    ┌─────────────────┐     when MCP running        ┌─────────────────────────┐
    │   CLI Command   │ ───────────────────────────►│      MCP Server         │
    │                 │     Unix socket IPC         │     (devac-mcp)         │
    │  hub register   │                             │                         │
    │  hub query      │     IPC Response            │  ┌─────────────────┐    │
    │  hub status     │ ◄───────────────────────────│  │   HubServer     │    │
    └────────┬────────┘                             │  │   (IPC handler) │    │
             │                                      │  └────────┬────────┘    │
             │                                      │           │             │
             │  HubClient                           │  ┌────────▼────────┐    │
             │  ├─ isMCPRunning()                   │  │   CentralHub    │    │
             │  ├─ if MCP: delegate via IPC         │  │   (RW mode)     │    │
             │  └─ else: direct connection          │  └────────┬────────┘    │
             │                                      └───────────┼─────────────┘
             │                                                  │
             │ Fallback (MCP not running)                       │ SOLE OWNER
             └──────────────────────────────────────────────────┤
                  Direct connection (RW or RO)                  ▼
                                                   ┌─────────────────────────┐
                                                   │     central.duckdb      │
                                                   │     ✓ No lock issues    │
                                                   └─────────────────────────┘
```

### Components

#### 1. IPC Protocol (`devac-core/src/hub/ipc-protocol.ts`)

Defines the message format for CLI-MCP communication:

```typescript
export type HubMethod =
  // Write operations
  | "register" | "unregister" | "refresh" | "refreshAll"
  | "pushDiagnostics" | "clearDiagnostics" | "resolveDiagnostics"
  // Read operations
  | "query" | "listRepos" | "getRepoStatus"
  | "getValidationErrors" | "getValidationSummary" | "getValidationCounts"
  | "getDiagnostics" | "getDiagnosticsSummary" | "getDiagnosticsCounts";

export interface HubRequest {
  id: string;        // UUID for correlation
  method: HubMethod;
  params: unknown;
}

export interface HubResponse<T = unknown> {
  id: string;
  result?: T;
  error?: { code: number; message: string };
}
```

#### 2. HubServer (`devac-core/src/hub/hub-server.ts`)

Unix socket server that runs within the MCP process:

- Creates socket at `~/.devac/mcp.sock`
- Handles incoming IPC requests from CLI
- Routes requests to CentralHub methods
- Returns JSON-encoded responses

#### 3. HubClient (`devac-core/src/hub/hub-client.ts`)

Client used by CLI commands with automatic dispatch:

```typescript
class HubClient {
  async isMCPRunning(): Promise<boolean>;      // Check socket exists & accepts connections
  private async sendToMCP<T>(): Promise<T>;    // IPC to MCP server
  private async sendToHub<T>(): Promise<T>;    // Direct hub access (fallback)
  private async dispatch<T>(): Promise<T>;     // Route to MCP or direct

  // Public API (same interface as before)
  async registerRepo(repoPath: string): Promise<RepoRegistrationResult>;
  async query(sql: string): Promise<QueryResult>;
  async getStatus(): Promise<HubStatus>;
  // ... etc
}
```

### Socket Protocol

- **Location**: `~/.devac/mcp.sock` (Unix socket)
- **Format**: Newline-delimited JSON
- **Timeout**: 30 seconds for operations, 100ms for connection probe
- **Permissions**: `0o600` (owner only)

### MCP Detection

```typescript
async isMCPRunning(): Promise<boolean> {
  // 1. Check if socket file exists
  // 2. Attempt connection with 100ms timeout
  // 3. Return true only if connection succeeds
}
```

### Fallback Behavior

When MCP is not running:
- Read operations use read-only direct connection
- Write operations use read-write direct connection
- No lock contention since only one process accesses the database

## Consequences

### Positive

- **No lock conflicts**: Single writer eliminates DuckDB concurrency issues
- **Seamless CLI/MCP coexistence**: CLI commands work regardless of MCP state
- **Lower CLI latency**: IPC (~5ms) faster than opening DuckDB (~50-100ms)
- **Graceful fallback**: CLI works without MCP for simple setups
- **Backward compatible**: Same CLI commands, same results

### Negative

- **MCP dependency for writes when running**: MCP must be running for writes when it owns the hub
- **Socket cleanup**: Stale sockets need cleanup on MCP crash
- **IPC overhead**: Small latency for message serialization
- **Complexity**: Additional layer in the architecture

### Neutral

- **Data consistency**: Still single source of truth (hub database)
- **Protocol simplicity**: JSON over Unix socket is debuggable
- **No schema changes**: Hub database schema unchanged

## Implementation Details

### Files Created

| File | Purpose |
|------|---------|
| `packages/devac-core/src/hub/ipc-protocol.ts` | Message types, constants |
| `packages/devac-core/src/hub/hub-server.ts` | Unix socket server for MCP |
| `packages/devac-core/src/hub/hub-client.ts` | Client with IPC + fallback |

### Files Modified

| File | Change |
|------|--------|
| `packages/devac-mcp/src/server.ts` | Start/stop HubServer lifecycle |
| `packages/devac-mcp/src/data-provider.ts` | Uses HubServer's hub instance |
| `packages/devac-cli/src/commands/hub-*.ts` | Use HubClient instead of direct CentralHub |

### Socket Lifecycle

```
MCP Start:
  1. Clean up stale socket file (if exists)
  2. Ensure ~/.devac directory exists
  3. Initialize CentralHub with read-write access
  4. Create and listen on Unix socket
  5. Set socket permissions to 0o600

MCP Stop:
  1. Close all client connections
  2. Close Unix socket server
  3. Close CentralHub
  4. Remove socket file
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| MCP crashes | Socket file remains; CLI detects stale socket and uses fallback |
| IPC timeout | CLI returns timeout error |
| Invalid JSON | Server returns INVALID_PARAMS error |
| Hub not ready | Server returns HUB_NOT_READY error |
| Operation fails | Server returns OPERATION_FAILED with message |

## Testing

```bash
# With MCP running
devac-mcp &
devac sync  # Uses IPC to register repo with hub

# Without MCP
pkill devac-mcp
devac sync  # Falls back to direct access
```

## References

- [ADR-0007](0007-federation-central-hub.md) - Federation with Central Hub (original design)
- [ADR-0001](0001-replace-neo4j-with-duckdb.md) - DuckDB choice and concurrency model
- [DuckDB Concurrency Documentation](https://duckdb.org/docs/stable/connect/concurrency)
