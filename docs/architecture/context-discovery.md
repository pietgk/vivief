# Context Discovery Architecture

> Design document for the DevAC context discovery feature
> Version: 1.0.0
> Status: Implemented (Issue #19)

## Overview

Context discovery enables DevAC tools to automatically detect and work with multi-repository setups. When working on an issue that spans multiple repositories, the system discovers sibling repos and related worktrees from the parent directory.

## Problem Statement

When working on cross-repository features, developers create multiple git worktrees (one per repo) for the same issue. These worktrees follow a naming convention but there's no automated way to:

1. Discover which repos are involved in the same issue
2. Track status across all worktrees for an issue
3. Set up all necessary worktrees at once
4. Provide AI assistants with full context

## Solution

### Parent Directory Workflow

The context discovery system assumes a "parent directory" workflow where:

1. All repositories are cloned as siblings in a common parent directory
2. Issue worktrees follow the naming pattern: `{repo}-{issue#}-{slug}`
3. The current working directory provides context

```
~/projects/              # Parent directory
├── vivief/              # Main repo
├── vivief-19-context/   # Issue #19 worktree for vivief
├── other-repo/          # Another repo
└── other-repo-19-auth/  # Issue #19 worktree for other-repo
```

### Worktree Naming Convention

Worktrees are named with three components:
- **repo**: Original repository name
- **issue#**: GitHub issue number
- **slug**: Short description (kebab-case)

Pattern: `^(.+)-(\d+)-(.+)$`

Examples:
- `vivief-123-auth` → repo: vivief, issue: 123, slug: auth
- `my-app-45-fix-bug` → repo: my-app, issue: 45, slug: fix-bug

## Architecture

### Core Module: `devac-core/src/context/`

```
packages/devac-core/src/context/
├── types.ts      # Type definitions
├── discovery.ts  # Discovery logic
└── index.ts      # Public exports
```

#### Types (`types.ts`)

```typescript
interface RepoInfo {
  path: string;           // Absolute path
  name: string;           // Directory name
  hasSeeds: boolean;      // Has .devac/seed/
  isWorktree: boolean;    // Is git worktree
  issueNumber?: number;   // Issue number if worktree
  slug?: string;          // Slug if worktree
}

interface WorktreeInfo extends RepoInfo {
  issueNumber: number;    // Always present
  slug: string;           // Always present
  mainRepoPath: string;   // Path to main repo
  mainRepoName: string;   // Name of main repo
  branch: string;         // Git branch name
}

interface RepoContext {
  currentDir: string;     // CWD
  parentDir: string;      // Parent directory
  repos: RepoInfo[];      // All sibling repos
  issueNumber?: number;   // Current issue (if in worktree)
  worktrees?: WorktreeInfo[];  // Worktrees for issue
  mainRepos?: RepoInfo[];      // Main repos involved
}
```

#### Discovery Logic (`discovery.ts`)

The discovery process:

1. **Read parent directory** - List all entries in `path.dirname(cwd)`
2. **Classify each directory** - Check if it's a git repo or worktree
3. **Parse worktree names** - Extract issue numbers and slugs
4. **Detect current context** - If CWD is a worktree, find related worktrees
5. **Enrich with metadata** - Add branch names, seed status, main repo paths

```typescript
async function discoverContext(
  cwd: string,
  options?: DiscoveryOptions
): Promise<RepoContext>
```

### CLI Integration: `devac context`

The `devac context` command exposes discovery to users:

```bash
# Show current context
devac context

# Output as JSON
devac context --json
```

### Worktree CLI: `devac-worktree`

#### `devac-worktree start --also`

Creates worktrees in multiple repos simultaneously:

```bash
# Start issue 123 in current repo AND sibling-repo
devac-worktree start 123 --also sibling-repo --also another-repo
```

Implementation:
1. Create worktree in current repo (existing behavior)
2. For each `--also` repo, create worktree in sibling directory
3. Run dependency installation in each worktree

#### `devac-worktree status --issue-wide`

Shows status across all worktrees for the current issue:

```bash
devac-worktree status --issue-wide
```

When run from a worktree, automatically detects the issue and shows all related worktrees.

### MCP Server: `get_context` Tool

The MCP server exposes context discovery to AI assistants:

```json
{
  "name": "get_context",
  "description": "Discover current working context including sibling repos and issue worktrees",
  "inputSchema": {
    "properties": {
      "path": { "type": "string" },
      "checkSeeds": { "type": "boolean" },
      "refresh": { "type": "boolean" }
    }
  }
}
```

#### Caching

Context is cached with a 30-second TTL to avoid repeated filesystem scans:

```typescript
interface CachedContext {
  context: RepoContext;
  timestamp: number;
}

const CONTEXT_CACHE_TTL = 30_000;
```

Cache behavior:
- Cache key: target path
- Force refresh with `refresh: true` parameter
- Stale entries cleaned up after 2x TTL

## Data Flow

```
                    ┌─────────────────┐
                    │  Parent Dir     │
                    │  ~/projects/    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ discoverContext │
                    │   (devac-core)  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐    ┌───────▼───────┐    ┌───────▼───────┐
│  devac CLI    │    │   worktree    │    │  MCP Server   │
│  `context`    │    │   CLI         │    │  get_context  │
└───────────────┘    └───────────────┘    └───────────────┘
```

## Performance Considerations

1. **Filesystem operations** - Minimized by checking `.git` existence first
2. **Seed checking** - Optional via `checkSeeds: false`
3. **Caching** - 30-second TTL prevents repeated scans
4. **Parallel operations** - Could be added for large directories

## Future Enhancements

1. **PR status integration** - Fetch PR status for worktrees via `gh` CLI
2. **Remote discovery** - Discover worktrees on other machines
3. **Event-driven updates** - Use file watchers instead of polling
4. **Cross-machine context** - Sync context via central hub

## Testing

### Unit Tests (`__tests__/context/discovery.test.ts`)

- Worktree name parsing
- Issue number extraction
- Git repo/worktree detection
- Context discovery with fixtures

### Integration Points

- CLI commands tested via subprocess
- MCP server tested via mock transport

## Related Documents

- [Vivief Workflow](../vivief-workflow.md) - Overall development workflow
- [MCP Server](../mcp-server.md) - MCP integration details
- [CLI Reference](../cli-reference.md) - Command documentation
