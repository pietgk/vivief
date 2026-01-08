# CLAUDE.md

This file provides guidance to AI coding agents working with the DevAC monorepo.

## Project Overview

DevAC is a code analysis tool that uses DuckDB + Parquet for fast, local code graph storage. It supports TypeScript, Python, and C# with incremental updates and cross-repository federation.

## Repository Structure

```
devac/
├── packages/
│   ├── devac-core/     # Core analysis engine (DuckDB, parsers, storage)
│   ├── devac-cli/      # Command-line interface
│   ├── devac-mcp/      # MCP server for AI assistants
│   └── devac-worktree/ # Git worktree + Claude workflow for GitHub issues
├── turbo.json          # Turborepo configuration
├── biome.json          # Linting and formatting
└── pnpm-workspace.yaml # Workspace definition
```

## Package Dependencies

```
@pietgk/devac-cli  ────┐
                       ├──> @pietgk/devac-core
@pietgk/devac-mcp  ────┘

@pietgk/devac-worktree  (standalone)
```

- **@pietgk/devac-core**: Standalone, no internal dependencies
- **@pietgk/devac-cli**: Depends on @pietgk/devac-core
- **@pietgk/devac-mcp**: Depends on @pietgk/devac-core
- **@pietgk/devac-worktree**: Standalone CLI for issue-based workflows

## Essential Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting and formatting
pnpm lint
pnpm lint:fix
pnpm format

# Clean build artifacts
pnpm clean
```

## Working with Packages

### Link CLIs Globally (First-Time Setup)

After building, link all CLI packages globally for local development:

```bash
# Link all CLIs globally (run once after build)
(cd packages/devac-cli && pnpm link --global)
(cd packages/devac-mcp && pnpm link --global)
(cd packages/devac-worktree && pnpm link --global)

# Or use the workflow command (builds + links + verifies)
devac workflow install-local

# Verify installation
devac --version
devac-mcp --version
devac-worktree --version
```

### Package-Specific Commands

```bash
# Build specific package
pnpm --filter @pietgk/devac-core build

# Run tests for specific package
pnpm --filter @pietgk/devac-cli test

# Run CLI locally (alternative to global linking)
pnpm --filter @pietgk/devac-cli exec devac --help

# Run MCP server locally
pnpm --filter @pietgk/devac-mcp exec devac-mcp --help
```

## Code Standards

- **Language**: TypeScript with strict mode
- **Module System**: ESM with NodeNext resolution
- **Formatting**: Biome (double quotes, semicolons, 2-space indent)
- **Testing**: Vitest
- **Package Manager**: pnpm with workspaces

## Key Technical Concepts

### Storage Architecture

DevAC uses a three-layer storage model:
1. **Package Seeds**: Parquet files in `.devac/seed/` per package
2. **Repository Manifest**: `.devac/manifest.json` aggregates packages
3. **Central Hub**: `~/.devac/central.duckdb` for cross-repo queries

### Hub Concurrency Model

The Central Hub uses a **Single Writer Architecture** due to DuckDB's concurrency constraints:

- **When MCP is running**: MCP server owns the hub database exclusively. CLI commands (`devac hub register`, `devac hub query`, etc.) communicate via Unix socket IPC (`~/.devac/mcp.sock`).
- **When MCP is not running**: CLI commands access the hub directly.

This is transparent to users - CLI commands work the same regardless of whether MCP is running. The `HubClient` class handles routing automatically.

```typescript
// In CLI commands, use HubClient (not CentralHub directly)
import { createHubClient } from "@pietgk/devac-core";

const client = createHubClient();
await client.registerRepo("/path/to/repo");  // Works with or without MCP
```

See [ADR-0024](docs/adr/0024-hub-single-writer-ipc.md) for details.

### Data Model

- **Nodes**: Code entities (functions, classes, variables, etc.)
- **Edges**: Relationships (CALLS, IMPORTS, EXTENDS, etc.)
- **External Refs**: Import references to external packages

### Entity IDs

Format: `{repo}:{package_path}:{kind}:{scope_hash}`

Example: `myrepo:packages/api:function:abc123`

## CLI Commands

| Command | Description |
|---------|-------------|
| `devac analyze` | Analyze package and generate seeds |
| `devac query <sql>` | Execute SQL against seeds |
| `devac watch` | Watch for changes and update incrementally |
| `devac validate` | Validate code changes |
| `devac affected <files>` | Find affected files |
| `devac hub init` | Initialize central hub |
| `devac hub register` | Register repository |
| `devac doctor` | Check system health and fix issues |
| `devac mcp` | Start MCP server |
| `devac workflow plugin-dev` | Switch to local plugin development mode |
| `devac workflow plugin-global` | Revert to global/marketplace plugin mode |

## Plugin Development

When developing Claude Code skills/commands in `plugins/devac/`, use these workflow commands to manage the plugin cache:

### Development Mode (Local Changes)

```bash
# Symlink cache to local plugin - changes are immediately reflected
devac workflow plugin-dev

# Note: Restart Claude Code to pick up the symlink
```

### Global Mode (Marketplace Version)

```bash
# Revert to marketplace version (copy from ~/.claude/plugins/marketplaces/)
devac workflow plugin-global
```

### Why This Is Needed

Claude Code caches installed plugins at `~/.claude/plugins/cache/`. Without the symlink:
- Edits to `plugins/devac/commands/*.md` are not reflected
- You'd need to manually sync or clear cache after each change

The `plugin-dev` command creates a symlink so your local edits are used immediately (after restarting Claude).

## MCP Server

The MCP server supports two modes:
- **Hub mode** (default): Query across all registered repositories via the central hub
- **Package mode**: Query a single package

### Running MCP Server

```bash
# Hub mode (default) - federated queries across all registered repos
devac-mcp

# Package mode - single package queries
devac-mcp --package ./my-project
```

Use `--package` to query a single package instead of all registered repos.

### MCP Tools

The MCP server provides these tools for AI assistants:
- `find_symbol`: Find symbols by name
- `get_dependencies`: Get symbol dependencies
- `get_dependents`: Get reverse dependencies
- `get_file_symbols`: Get symbols in a file
- `get_affected`: Find affected files from changes
- `get_call_graph`: Get call graph for a function
- `query_sql`: Execute read-only SQL queries (in hub mode, queries ALL seeds from registered repos)
- `list_repos`: List registered repositories (hub mode only)

## Worktree CLI (devac-worktree)

Issue-based workflow using git worktrees and Claude CLI.

### Worktree Commands

| Command | Description |
|---------|-------------|
| `devac-worktree start <issue>` | Create worktree for issue, install deps, launch Claude |
| `devac-worktree list` | List active worktrees |
| `devac-worktree status` | Show worktrees with issue/PR state |
| `devac-worktree resume <issue>` | Resume work on existing worktree |
| `devac-worktree clean <issue>` | Remove worktree after PR merged |
| `devac-worktree clean-merged` | Clean all merged worktrees |

### Worktree Naming Convention

Worktrees are created with the pattern: `{repo}-{issue#}-{slug}`

Example: `vivief-123-add-auth` for issue #123 "Add authentication"

## Development Workflow

1. Make changes in the appropriate package
2. Run `pnpm typecheck` to verify types
3. Run `pnpm test` to run tests
4. Run `pnpm lint` to check formatting
5. Build with `pnpm build`

## Commit and Push Rules

**CRITICAL: Never bypass validation hooks.**

- Always wait for `pnpm typecheck`, `pnpm test`, and `pnpm lint` to complete before committing
- Never use `git push --no-verify` or `git commit --no-verify` to bypass hooks
- If validation fails, fix the errors before committing
- If validation times out, wait or investigate - do not bypass
- If there is ever a legitimate reason to bypass validation (rare), ask the user first and explain why

**Before every commit:**
```bash
pnpm typecheck && pnpm test && pnpm lint
```

If any of these fail, fix the issues before committing. No exceptions.

## Adding New Features

When adding features:
1. Start with @pietgk/devac-core if it's core functionality
2. Export from the package's `src/index.ts`
3. Add tests alongside the implementation
4. Update CLI commands if user-facing

## Test Discovery

**IMPORTANT: Before adding tests to a package, always verify existing test coverage first.**

Glob patterns from the workspace root may fail to find tests in nested packages. Use this workflow:

```bash
# 1. Check package.json for test script and framework
cat packages/<pkg>/package.json | grep -A2 '"test"'

# 2. Check test config (vitest.config.ts, jest.config.js, etc.)
cat packages/<pkg>/vitest.config.ts

# 3. List the test directory structure
ls -la packages/<pkg>/__tests__/
# or
ls -la packages/<pkg>/src/__tests__/
```

### Test File Conventions

All packages use Vitest with this structure:

| Package | Test Location | Config |
|---------|---------------|--------|
| devac-core | `__tests__/*.test.ts` | `vitest.config.ts` |
| devac-cli | `__tests__/*.test.ts` | `vitest.config.ts` |
| devac-worktree | `__tests__/*.test.ts` | `vitest.config.ts` |
| devac-mcp | `__tests__/*.test.ts` | `vitest.config.ts` |

### Before Adding Tests

1. **List existing test files** - Don't assume "no tests exist"
2. **Read existing tests** - Understand coverage before adding
3. **Avoid duplicates** - Check if functionality is already tested
4. **Follow existing patterns** - Match mock setup, assertions style

## Troubleshooting

### DuckDB Issues
- Ensure Node.js 20+ is installed
- Check memory limits in DuckDBPool options
- Seeds are stored in `.devac/seed/` directory

### Build Issues
- Run `pnpm clean && pnpm install` for fresh start
- Check that all .js extensions are in imports
- Verify tsconfig.json settings match NodeNext

## Parent Directory Workflow

When working from a parent directory (e.g., `~/ws/`) that contains multiple repos or worktrees, use these patterns:

### Git Commands from Parent Directory

```bash
# Use -C flag to run git in a specific repo
git -C vivief status
git -C vivief add . && git -C vivief commit -m "feat: add feature"
git -C vivief-123-auth push origin HEAD
```

### pnpm Commands from Parent Directory

```bash
# Use --prefix flag (note: different from npm)
# For pnpm, use --dir or cd into the directory
(cd vivief && pnpm typecheck)
(cd vivief && pnpm test)
(cd vivief-123-auth && pnpm build)
```

### When to Use Parent Directory

- **Multi-repo issues**: Working on changes that span multiple repositories
- **Cross-repo context**: Need visibility into sibling repos
- **Issue worktrees**: Multiple worktrees for the same issue across repos

### Directory Structure Example

```
~/ws/                         # Parent directory - Claude starts here
├── vivief/                   # Main repo
├── vivief-123-auth/          # Issue 123 worktree
├── other-repo/               # Sibling repo
└── other-repo-123-auth/      # Issue 123 worktree in sibling
```

## See Also

- `README.md` - Project documentation
- `README-CodeGraph.md` - Tree-sitter patterns from v1
