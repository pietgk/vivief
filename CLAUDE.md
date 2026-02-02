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
│   ├── devac-worktree/ # Git worktree + Claude workflow for GitHub issues
│   ├── devac-eval/     # Evaluation framework for testing analysis quality
│   ├── browser-core/   # Browser automation core (Playwright wrapper)
│   ├── browser-mcp/    # MCP server for browser automation
│   └── browser-cli/    # CLI for browser automation
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

@pietgk/browser-cli  ────┐
                         ├──> @pietgk/browser-core
@pietgk/browser-mcp  ────┘
```

- **@pietgk/devac-core**: Standalone, no internal dependencies
- **@pietgk/devac-cli**: Depends on @pietgk/devac-core
- **@pietgk/devac-mcp**: Depends on @pietgk/devac-core
- **@pietgk/devac-worktree**: Standalone CLI for issue-based workflows
- **@pietgk/browser-core**: Standalone Playwright wrapper
- **@pietgk/browser-cli**: Depends on @pietgk/browser-core
- **@pietgk/browser-mcp**: Depends on @pietgk/browser-core

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
# Link DevAC CLIs globally (run once after build)
(cd packages/devac-cli && pnpm link --global)
(cd packages/devac-mcp && pnpm link --global)
(cd packages/devac-worktree && pnpm link --global)

# Link Browser CLIs globally
(cd packages/browser-cli && pnpm link --global)
(cd packages/browser-mcp && pnpm link --global)

# Or use the workflow command (builds + links + verifies)
devac workflow install-local

# Verify DevAC installation
devac --version
devac-mcp --version
devac-worktree --version

# Verify Browser installation
browser --version
browser-mcp --version
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
3. **Workspace Hub**: `<workspace>/.devac/central.duckdb` for cross-repo queries within a workspace

### Hub Concurrency Model

The Workspace Hub uses a **Single Writer Architecture** due to DuckDB's concurrency constraints:

- **When MCP is running**: MCP server owns the hub database exclusively. CLI commands (`devac hub query`, etc.) communicate via Unix socket IPC (`<workspace>/.devac/mcp.sock`).
- **When MCP is not running**: CLI commands access the hub directly.

This is transparent to users - CLI commands work the same regardless of whether MCP is running. The `HubClient` class handles routing automatically.

```typescript
// In CLI commands, use HubClient (not CentralHub directly)
import { createHubClient } from "@pietgk/devac-core";

const client = createHubClient();
const repos = await client.listRepos();  // Auto-discovers repos with seeds
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

DevAC uses three primary commands:

| Command | Description |
|---------|-------------|
| `devac sync` | Analyze packages, register repos, sync CI/issues |
| `devac status` | Show health, diagnostics, doctor, seeds |
| `devac query <subcommand>` | Query the code graph |

### Sync Options

```bash
devac sync              # Analyze current package
devac sync --validate   # Run validation after analysis
devac sync --watch      # Continuous mode (watch for changes)
devac sync --force      # Force full resync
devac sync --ci         # Sync CI status
devac sync --issues     # Sync GitHub issues
```

### Status Options

```bash
devac status              # Show basic status
devac status --diagnostics # Show validation errors
devac status --doctor     # Run health checks
devac status --doctor --fix # Auto-fix issues
```

### Query Subcommands

```bash
devac query sql <sql>      # Execute raw SQL against seeds
devac query symbol <name>  # Find symbols by name
devac query deps <entity>  # Get dependencies
devac query affected <files> # Impact analysis
devac query repos          # List registered repos
```

### Other Commands

| Command | Description |
|---------|-------------|
| `devac mcp` | Start MCP server |
| `devac workflow plugin-dev` | Switch to local plugin development mode |
| `devac workflow plugin-global` | Revert to global/marketplace plugin mode |

## Browser CLI Commands

The browser CLI provides browser automation for AI agents and command-line users.

### Session Management

| Command | Description |
|---------|-------------|
| `browser session start` | Start new browser session |
| `browser session stop [id]` | Stop browser session |
| `browser session list` | List active sessions |

Options for `session start`:
- `--headed` - Run with visible browser window
- `--viewport <WxH>` - Set viewport size (e.g., `1280x720`)
- `--json` - Output as JSON

### Navigation

| Command | Description |
|---------|-------------|
| `browser navigate <url>` | Navigate to URL |
| `browser reload` | Reload current page |
| `browser back` | Go back in history |
| `browser forward` | Go forward in history |

Options for `navigate`:
- `--wait-until <event>` - Wait until event (`load`, `domcontentloaded`, `networkidle`)

### Page Reading

| Command | Description |
|---------|-------------|
| `browser read` | Read page accessibility tree with element refs |

Options:
- `--selector <css>` - Limit to elements matching selector
- `--interactive-only` - Show only interactive elements
- `--max-elements <n>` - Limit number of elements
- `--json` - Output as JSON

### Element Interaction

| Command | Description |
|---------|-------------|
| `browser click <ref>` | Click element by ref |
| `browser type <ref> <text>` | Type text into element |
| `browser fill <ref> <value>` | Fill input field (clears first) |
| `browser select <ref> <value>` | Select dropdown option |
| `browser scroll <direction>` | Scroll page (up/down/left/right) |
| `browser hover <ref>` | Hover over element |

Options for `type`:
- `--delay <ms>` - Delay between keystrokes
- `--clear` - Clear field before typing

Options for `scroll`:
- `--amount <px>` - Scroll distance in pixels
- `--ref <ref>` - Scroll specific element

Options for `select`:
- `--by <method>` - Select by `value`, `label`, or `index`

### Screenshots

| Command | Description |
|---------|-------------|
| `browser screenshot` | Capture page screenshot |

Options:
- `--full-page` - Capture full scrollable page
- `--name <name>` - Custom filename
- `--selector <css>` - Capture specific element

### Element Finding

| Command | Description |
|---------|-------------|
| `browser find` | Find elements by various strategies |
| `browser eval <script>` | Execute JavaScript in page |

Find options:
- `--selector <css>` - Find by CSS selector
- `--text <text>` - Find by text content
- `--role <role>` - Find by ARIA role
- `--name <name>` - Filter by accessible name (with --role)
- `--label <text>` - Find by label text
- `--placeholder <text>` - Find by placeholder
- `--test-id <id>` - Find by data-testid

### Example Workflow

```bash
# Start a browser session
browser session start --headed

# Navigate to a page
browser navigate https://example.com

# Read the page to get element refs
browser read --interactive-only --json

# Interact with elements using refs
browser click "button:Sign In"
browser fill "email-input" "user@example.com"
browser fill "password-input" "secret123"
browser click "button:Submit"

# Take a screenshot
browser screenshot --name login-complete

# Stop the session
browser session stop
```

## Browser MCP Server

The browser-mcp server exposes browser automation tools for AI assistants.

### Running Browser MCP Server

```bash
# Start the MCP server
browser-mcp
```

### Browser MCP Tools

| Tool | Description |
|------|-------------|
| `browser_session_start` | Start new browser session |
| `browser_session_stop` | Stop browser session |
| `browser_session_list` | List active sessions |
| `browser_navigate` | Navigate to URL |
| `browser_reload` | Reload current page |
| `browser_back` | Go back in history |
| `browser_forward` | Go forward in history |
| `browser_read_page` | Get accessibility tree with element refs |
| `browser_get_text` | Get text content of element |
| `browser_click` | Click element by ref |
| `browser_type` | Type text into element |
| `browser_fill` | Fill input field |
| `browser_select` | Select dropdown option |
| `browser_scroll` | Scroll page or element |
| `browser_scroll_into_view` | Scroll element into viewport |
| `browser_hover` | Hover over element |
| `browser_screenshot` | Capture screenshot |
| `browser_find` | Find elements by strategy |
| `browser_evaluate` | Execute JavaScript |

### Element Reference System

Element refs are the primary way to identify and interact with page elements. The system uses a hybrid strategy that prioritizes deterministic identifiers:

1. **testId** - `data-testid` attribute (most stable)
2. **ariaLabel** - Unique `aria-label` attribute
3. **role:name** - Semantic ref from ARIA role + accessible name (e.g., `button:Submit`)
4. **fallback** - Context-aware sequential ref (e.g., `form_1:button_2`)

**Example refs:**
- `email-input` - From data-testid
- `button:Sign In` - From role:name
- `link:Forgot Password` - From role:name
- `form_1:checkbox_1` - Fallback ref

**Important:** Refs are scoped to page state and invalidated on navigation. Always call `browser_read_page` after navigation to get fresh refs.

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
- **Hub mode** (default): Query across all repos with seeds via the central hub (auto-discovered)
- **Package mode**: Query a single package

### Running MCP Server

```bash
# Hub mode (default) - federated queries across all repos with seeds
devac-mcp

# Package mode - single package queries
devac-mcp --package ./my-project
```

Use `--package` to query a single package instead of all workspace repos.

### MCP Tools

The MCP server provides 21 tools for AI assistants (see [ADR-0042](docs/adr/0042-mcp-tool-naming-conventions.md) for naming conventions):

**Query Tools:**
- `query_symbol`: Find symbols by name
- `query_deps`: Get symbol dependencies
- `query_dependents`: Get reverse dependencies (who uses this?)
- `query_file`: Get all symbols in a file
- `query_affected`: Find files affected by changes
- `query_call_graph`: Get call graph for a function
- `query_sql`: Execute read-only SQL queries
- `query_schema`: Get database schema information
- `query_repos`: List registered repositories
- `query_context`: Discover workspace context (repos, worktrees)
- `query_effects`: Query code effects (function calls, stores, etc.)
- `query_rules`: Run rules engine on effects
- `query_rules_list`: List available rules
- `query_c4`: Generate C4 architecture diagrams

**Status Tools:**
- `status`: Get workspace status (seeds, health, diagnostics summary)
- `status_diagnostics`: Get validation errors (tsc, eslint, test)
- `status_diagnostics_summary`: Get error counts grouped by field
- `status_diagnostics_counts`: Get total error/warning counts
- `status_all_diagnostics`: Get unified diagnostics (validation + CI + issues + reviews)
- `status_all_diagnostics_summary`: Get unified diagnostics grouped counts
- `status_all_diagnostics_counts`: Get unified diagnostics totals by severity

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
2. Validation runs automatically via hooks (see below)
3. Fix any errors reported by the Stop hook
4. Build with `pnpm build` when needed

## Validation Pipeline

DevAC's validation hooks run automatically in Claude Code sessions:

| Hook Event | Command | What It Does |
|------------|---------|--------------|
| **UserPromptSubmit** | `devac status --inject` | Injects diagnostic counts into context when errors exist |
| **Stop** | `devac validate --on-stop --mode quick` | Validates changed files (TypeScript + ESLint) |

### How It Works

1. **On every prompt**: If errors exist in the hub, you'll see a `<system-reminder>` with diagnostic counts
2. **After code changes**: When Claude stops, validation runs on git-changed files (~5s)
3. **If errors found**: Hook output shows what needs fixing
4. **Query details**: Use MCP tool `status_all_diagnostics` to see full error details

### Validation Modes

| Mode | Duration | Runs |
|------|----------|------|
| Quick (`--mode quick`) | ~5s | TypeScript + ESLint on changed files |
| Full (`--mode full`) | ~5m | TypeScript + ESLint + Tests + Coverage |

### MCP Tools for Diagnostics

| Tool | Purpose |
|------|---------|
| `status_all_diagnostics` | Get all diagnostics (validation + CI + issues + reviews) |
| `status_diagnostics` | Get validation errors only |
| `status_all_diagnostics_counts` | Get counts by severity |

**You don't need to manually run validation.** The hooks handle it automatically.

## Commit and Push Rules

**CRITICAL: Never bypass validation hooks.**

- The Stop hook validates changed files automatically after edits
- Pre-push hooks run full `pnpm typecheck && pnpm test`
- Never use `--no-verify` to bypass hooks
- If validation fails, fix the errors before committing
- If there is ever a legitimate reason to bypass validation (rare), ask the user first and explain why

**Manual validation** (only needed if hooks aren't working):
```bash
pnpm typecheck && pnpm test && pnpm lint
```

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

## Critical Safety Rules

### Never Use sed on Git Config (macOS)

**NEVER use `sed -i ''` to edit `.git/config` on macOS.** BSD sed behaves differently than GNU sed and can **empty the entire file** if the pattern doesn't match exactly.

```bash
# DANGEROUS - can destroy .git/config:
sed -i '' 's/bare = true/bare = false/' .git/config  # DON'T DO THIS

# SAFE - always use git config commands:
git config core.bare false
git config core.repositoryformatversion 0
git config core.filemode true
```

If `.git/config` gets corrupted, restore with:
```bash
git config core.repositoryformatversion 0
git config core.filemode true
git config core.bare false
git config core.logallrefupdates true
git config core.ignorecase true
git config core.precomposeunicode true
git remote add origin <url>
```

### Never Overwrite Plan Files Without Permission

When in plan mode with an existing plan file:
1. **Always read the existing plan first** to check if it has valuable content
2. **Ask permission before overwriting** if the existing plan is for a different task
3. **Save existing content to a new file** before replacing with different content
4. Plan files can contain hours of research and design work - treat them as valuable artifacts

---

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
