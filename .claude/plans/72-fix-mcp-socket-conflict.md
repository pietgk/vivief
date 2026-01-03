# Plan: Fix MCP Server Socket Conflict

> **Issue:** [#72](https://github.com/pietgk/vivief/issues/72)
> **Status:** IN_PROGRESS
> **Created:** 2026-01-03

## From Issue

**Problem:** When multiple Claude CLI sessions start in the same workspace, each tries to spawn its own `devac-mcp` process. The second instance fails with socket conflict error.

**Root Cause:** `HubDataProvider.initialize()` always attempts to start a `HubServer`, which throws an error if another server is already listening on the socket.

**Acceptance Criteria:**
- [ ] Second Claude session can start MCP in client mode (no error)
- [ ] Both sessions can use MCP tools
- [ ] When owner shuts down, client auto-promotes to server mode
- [ ] Race conditions handled gracefully

## Implementation Plan

### Task 1: Add dual-mode support to HubDataProvider

**File:** `packages/devac-mcp/src/data-provider.ts`

1. Add new fields:
   - `_hubClient: HubClient | null`
   - `_isClientMode: boolean`

2. Update `initialize()`:
   - Check if MCP server already running via `isMCPRunning()`
   - If yes → client mode, use `HubClient`
   - If no → server mode, start `HubServer`

3. Add imports:
   - `createHubClient, HubClient` from `@pietgk/devac-core`

### Task 2: Add hubOperation() routing helper

Add method to route operations based on mode:
```typescript
private async hubOperation<T>(
  serverOperation: (hub: CentralHub) => Promise<T>,
  clientOperation: (client: HubClient) => Promise<T>
): Promise<T>
```

### Task 3: Add auto-promotion logic

1. Add `promoteToServer()` method
2. Add `isConnectionError()` helper
3. Update `hubOperation()` to catch connection errors and auto-promote

### Task 4: Update hub-dependent methods

Update these methods to use `hubOperation()`:
- `listRepos()`
- `getValidationErrors()`
- `getValidationSummary()`
- `getValidationCounts()`
- `getAllDiagnostics()`
- `getDiagnosticsSummary()`
- `getDiagnosticsCounts()`
- `getPackagePaths()`

### Task 5: Update shutdown()

Handle client mode - no server to stop, just clear client reference.

### Task 6: Add tests

**File:** `packages/devac-mcp/__tests__/data-provider.test.ts`

- Test client mode detection
- Test server mode when no server exists
- Test auto-promotion on connection error

### Task 7: Manual testing

1. Start first Claude session → MCP starts in server mode
2. Start second Claude session → MCP starts in client mode
3. Verify both sessions can use MCP tools
4. Close first session → verify auto-promotion

## Files to Modify

- `packages/devac-mcp/src/data-provider.ts` (main changes)
- `packages/devac-mcp/__tests__/data-provider.test.ts` (new tests)
