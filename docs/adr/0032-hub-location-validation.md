# ADR-0032: Hub Location Validation

## Status

Accepted

## Context

The DevAC hub (`central.duckdb`) can be accidentally created inside individual git repositories (e.g., `/ws/myrepo/.devac/`) when it should only exist at the workspace level (e.g., `/ws/.devac/`). This causes several problems:

1. **Wrong hub connection**: MCP server may connect to an empty/incorrect hub
2. **Confusing errors**: Users see "table doesn't exist" instead of clear guidance
3. **Silent failures**: No warning when a misplaced hub is detected
4. **Duplicate hubs**: Multiple hubs can exist, leading to inconsistent query results

The previous CLI design used a `--hub` flag to switch between "package mode" (single package) and "hub mode" (federated queries). This added complexity and allowed users to accidentally create hubs in wrong locations.

## Decision

### 1. Hub Location Validation

Add `validateHubLocation()` function to prevent hubs inside git repositories:

```typescript
export async function validateHubLocation(hubDir: string): Promise<{
  valid: boolean;
  reason?: string;
  suggestedPath?: string;
}>;
```

**Rules:**
- Hub is **invalid** if its parent directory contains a `.git` folder (hub is inside a git repo)
- Hub is **invalid** if its parent directory is not a valid workspace (doesn't contain any git repos)
- Validation runs during `CentralHub.init()` unless in read-only mode

### 2. Make Hub Mode the Default

Remove the `--hub` flag from all CLI commands. All commands now default to hub/workspace mode:

- `devac find-symbol` → queries workspace hub
- `devac deps` → queries workspace hub
- `devac query` → queries workspace hub
- etc.

Users no longer need to think about "package mode" vs "hub mode". Query scope is determined by the query itself (WHERE clauses), not by flags.

### 3. Clear Error Messages

When validation fails, provide actionable guidance:

```
Invalid hub location: Hub is inside git repo "myrepo".
Hubs should only exist at workspace level.

Correct hub location: /ws/.devac
```

### 4. Warnings for Empty/Misplaced Hubs

MCP server startup warns when:
- Hub location is not a valid workspace
- Hub has no registered repositories

### 5. Doctor Checks

Add `devac doctor` checks for:
- **hub-location**: Verify hub is at workspace level
- **duplicate-hubs**: Scan for hub databases inside git repos

### 6. Test Isolation

Add `skipValidation` option for tests that create hubs in temporary directories:

```typescript
await hub.init({ skipValidation: true });
```

## Consequences

### Positive

- **Prevents misconfiguration**: Users can't accidentally create hubs in wrong locations
- **Simpler CLI**: No need to remember `--hub` flag
- **Clear errors**: Actionable messages instead of cryptic database errors
- **Self-healing**: `devac doctor` can detect and fix misplaced hubs

### Negative

- **Breaking change**: Users who relied on `--hub` flag need to update scripts
- **Test complexity**: Tests need `skipValidation` option for temp directories

### Neutral

- **No package mode**: Single-package queries can still be done via WHERE clauses
- **Workspace required**: DevAC now requires a workspace context for all operations

## Migration

For users with hubs in wrong locations:

1. `devac doctor` will detect misplaced hubs
2. MCP will warn on startup if connected to wrong hub
3. Manual cleanup: `rm -rf <repo>/.devac/central.duckdb`
4. Workspace-level hub remains intact with all data

## References

- [ADR-0007: Federation with Central Hub](0007-federation-central-hub.md) - Hub architecture
- [ADR-0016: Workspace Module Architecture](0016-workspace-module.md) - Workspace concepts
- [ADR-0024: Hub Single Writer IPC](0024-hub-single-writer-ipc.md) - Hub concurrency model
