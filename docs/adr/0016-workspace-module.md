# ADR-0016: Workspace Module Architecture

## Status

Accepted

## Context

DevAC supports multi-repo workflows through hub federation and worktree management. However, there was no unified orchestration layer for:
- Discovering all repos in a parent directory (workspace)
- Coordinating file watching across repos
- Auto-refreshing the hub when seeds change
- Tracking workspace-level state

Users had to manually:
1. Run `devac analyze` in each repo
2. Run `devac hub register` for each repo
3. Manually refresh the hub after changes

We needed a workspace-level abstraction that provides:
- Automatic repo discovery
- Unified monitoring
- Hub synchronization
- State persistence

## Decision

Implement a **Workspace Module** with a two-tier watching architecture:

### Two-Tier Watching

```
┌─────────────────────────────────────────────────────────────────────┐
│  Per-Repo (devac watch)              Workspace (workspace watch)    │
│                                                                     │
│  Source Files ──► Seeds              Seeds ──► Hub                  │
│  *.ts, *.py, *.cs                    *.parquet                      │
│                                                                     │
│  Runs inside each repo               Runs from parent directory     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

### 1. Seed-Watching (Not Source-Watching)

The workspace watcher monitors `.devac/seed/**/*.parquet` files, not source files.

**Context:** In DevAC's Three Pillars model (see [concepts.md](../vision/concepts.md)), **Extractors** produce **Seeds** from source files. The workspace watcher operates at the seed level, not the source level.

**Rationale:**
- Per-repo watchers already handle source→seed transformation (Extractor responsibility)
- Workspace watch only needs to know when seeds are updated
- Avoids duplicating file watching logic across packages
- Clear separation of concerns between Extractors and Infra

### 2. State Persistence

Workspace state persists to `.devac/state.json` at the workspace root.

```json
{
  "version": "1.0",
  "lastDiscovery": "2024-12-21T10:00:00Z",
  "repos": [
    {
      "path": "/Users/me/ws/api",
      "repoId": "api",
      "hubStatus": "registered"
    }
  ]
}
```

**Rationale:**
- Enables incremental discovery (only scan changed dirs)
- Tracks hub registration state
- Survives process restarts

### 3. Event-Driven Architecture

WorkspaceManager uses event subscription pattern:

```typescript
type WorkspaceEvent =
  | { type: "repo-discovered"; repo: WorkspaceRepoInfo }
  | { type: "repo-removed"; path: string }
  | { type: "seed-changed"; repoPath: string }
  | { type: "hub-refreshed"; reposRefreshed: string[] }
  | { type: "watcher-state"; state: "started" | "stopped" };
```

**Rationale:**
- Enables reactive UIs and logging
- Decouples components
- Testable subscription pattern

### 4. IssueId Parsing

Worktree directories follow pattern `{repo}-{issueId}-{slug}` where issueId is `{source}{originRepo}-{number}`.

Parse by splitting on **last dash** to handle repos with dashes in their names:
- `api-ghapi-123-auth` → issueId: `ghapi-123`, repo: `api`, slug: `auth`
- `monorepo-3.0-ghmonorepo-456-fix` → issueId: `ghmonorepo-456`, repo: `monorepo-3.0`

## Consequences

### Positive

- **Clear workflow**: Users run `devac watch` per-repo, `devac workspace watch` from parent
- **Separation of concerns**: Source analysis vs federation are independent
- **State preservation**: Workspace state survives restarts
- **Hub always current**: Auto-refresh ensures cross-repo queries reflect latest state
- **Worktree grouping**: Issues automatically group related worktrees

### Negative

- **Two commands needed**: Users must understand the two-tier model
- **Seeds required first**: Workspace watch won't detect repos without seeds
- **State file maintenance**: Another file to manage in workspace

### Neutral

- **Event-driven complexity**: More abstraction but enables future features
- **chokidar dependency**: Already used by per-repo watcher

## Implementation

**Files:** `packages/devac-core/src/workspace/`

| File | Purpose |
|------|---------|
| `types.ts` | WorkspaceInfo, WorkspaceRepoInfo, WorkspaceState |
| `discover.ts` | Repo scanning, issueId parsing, worktree detection |
| `state.ts` | State persistence to `.devac/state.json` |
| `seed-detector.ts` | Watch `.devac/seed/**/*.parquet` |
| `watcher.ts` | Unified workspace-level file watcher |
| `auto-refresh.ts` | Debounced hub refresh on seed changes |
| `manager.ts` | WorkspaceManager orchestration |

**CLI Commands:**

| Command | Purpose |
|---------|---------|
| `devac workspace status` | Show repos, seeds, hub status |
| `devac workspace watch` | Monitor seeds, auto-refresh hub |
| `devac workspace init` | Initialize workspace configuration |

## References

- [DevAC Concepts](../vision/concepts.md) - Three Pillars, Extractors, Seeds terminology
- [Foundation Document](../vision/foundation.md) - Workspace topology concepts (Section 2.3-2.4)
- [Foundation Visual](../vision/foundation-visual.md) - Component diagram (Section 6.4)
- [Foundation Implementation Guide](../vision/foundation-impl-guide.md) - Implementation status
- [ADR-0007: Federation Central Hub](0007-federation-central-hub.md) - Hub architecture
- [ADR-0014: Worktree Claude Workflow](0014-worktree-claude-workflow.md) - Worktree naming convention

---

## Amendment: Convention-Based Discovery (January 2026)

### Context

The original design specified `.devac/state.json` for state persistence. In practice, convention-based auto-discovery has proven sufficient and simpler for most use cases.

Additionally, teams working in multi-repo environments needed a way to:
- Share workspace configuration via version control
- Auto-generate documentation from per-repo files
- Onboard new team members with a single command

### Changes

1. **State persistence is optional** - Workspace discovery now works without `.devac/state.json`. The filesystem-based auto-discovery scans for `.git` directories and detects repositories automatically.

2. **Auto-discovery is default** - Repositories are discovered by scanning the parent directory for git repositories, rather than requiring explicit registration.

3. **Workspace Repository Pattern** - Added `devac workspace repo` commands for teams that need versioned workspace configuration:
   - `devac workspace repo init` - Create a workspace repository
   - `devac workspace repo sync` - Sync CLAUDE.md from AGENTS.md files
   - `devac workspace repo install` - Clone repos and set up workspace
   - `devac workspace repo status` - Show workspace repository status

### Impact

- **Section "State Persistence"** is now optional, not required. Workspaces function correctly without persistent state.
- **All other architectural decisions** remain unchanged.
- **New capability**: Teams can now use versioned workspace configuration via the workspace repository pattern. See [ADR-0044](0044-workspace-repo-pattern.md).
