# CLI Reference

Complete reference for all DevAC v2 commands.

## Global Options

```bash
devac [command] [options]

Options:
  --help, -h       Show help
  --version, -v    Show version
  --verbose        Enable verbose logging
  --quiet          Suppress output except errors
```

## Package Commands

### devac analyze

Parse source files and generate seed Parquet files.

```bash
devac analyze [options]

Options:
  --package <path>    Analyze specific package (default: current directory)
  --all               Analyze all packages in repository
  --if-changed        Only analyze if source files changed (hash-based)
  --force             Force full re-analysis, ignore cache
  --structural-only   Skip semantic resolution pass

Examples:
  devac analyze                        # Analyze current package
  devac analyze --package ./packages/auth
  devac analyze --all                  # Analyze entire monorepo
  devac analyze --if-changed           # Smart incremental
  devac analyze --force                # Full regeneration
```

**Output:**
```
✓ Analyzed 156 files
  Nodes: 2,341
  Edges: 1,892
  External refs: 423
  Time: 3.2s
  Seeds: .devac/seed/
```

### devac query

Run DuckDB SQL queries against seed files.

```bash
devac query "<sql>" [options]

Options:
  --package <path>    Query specific package
  --format <format>   Output format: table (default), json, csv
  --output <file>     Write output to file

Examples:
  devac query "SELECT * FROM nodes LIMIT 10"
  devac query "SELECT name FROM nodes WHERE kind='function'" --format json
  devac query "SELECT * FROM edges" --output edges.csv --format csv
```

### devac watch

Watch for file changes and update seeds incrementally.

```bash
devac watch [options]

Options:
  --package <path>    Watch specific package
  --validate          Run validation on changes

Examples:
  devac watch                          # Watch current package
  devac watch --package ./packages/auth
  devac watch --validate               # Watch + validate
```

**Output:**
```
👀 Watching ./packages/auth for changes...

[10:32:15] src/auth.ts changed → updated in 145ms
[10:32:18] src/utils.ts changed → updated in 132ms
^C Stopping watch...
```

### devac verify

Check seed file integrity.

```bash
devac verify [options]

Options:
  --package <path>    Verify specific package

Checks:
  • All Parquet files readable
  • Edge references point to existing nodes
  • Source files have corresponding seed data
  • No orphan temp files
```

**Output:**
```
✓ Seed integrity verified
  Nodes: 2,341 (valid)
  Edges: 1,892 (valid)
  Refs: 423 (valid)
  Orphans: 0
```

### devac clean

Remove all seed files (forces regeneration on next analyze).

```bash
devac clean [options]

Options:
  --package <path>    Clean specific package
  --all               Clean all packages in repository
  --dry-run           Show what would be deleted

Examples:
  devac clean                          # Clean current package
  devac clean --all                    # Clean entire repo
  devac clean --dry-run                # Preview
```

## Validation Commands

### devac typecheck

Run TypeScript type checking on a package.

```bash
devac typecheck [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  --tsconfig <path>       Path to tsconfig.json
  --timeout <ms>          Timeout in milliseconds (default: 60000)
  --pretty                Human-readable output

Examples:
  devac typecheck                          # Check current package
  devac typecheck -p ./packages/auth       # Check specific package
  devac typecheck --pretty                 # Human-readable output
```

### devac lint

Run ESLint on a package.

```bash
devac lint [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  --config <path>         Path to ESLint config
  --fix                   Auto-fix issues
  --timeout <ms>          Timeout in milliseconds (default: 60000)
  --pretty                Human-readable output

Examples:
  devac lint                               # Lint current package
  devac lint --fix                         # Auto-fix issues
  devac lint --pretty                      # Human-readable output
```

### devac test

Run test suite on a package.

```bash
devac test [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  --runner <type>         Test runner: vitest, jest, npm-test
  --update-snapshots      Update test snapshots
  --timeout <ms>          Timeout in milliseconds (default: 300000)
  --pretty                Human-readable output

Examples:
  devac test                               # Run tests
  devac test --runner vitest               # Use specific runner
  devac test --update-snapshots            # Update snapshots
```

## Code Graph Commands

### devac find-symbol

Find symbols by name.

```bash
devac find-symbol <name> [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  --hub                   Query all registered repos (hub mode)
  --hub-dir <path>        Hub directory
  --kind <type>           Filter by kind (function, class, variable, etc.)
  --limit <n>             Maximum results (default: 100)
  --pretty                Human-readable output

Examples:
  devac find-symbol handleLogin                # Find in current package
  devac find-symbol User --kind class          # Filter by kind
  devac find-symbol auth --hub                 # Search all repos
  devac find-symbol login --pretty             # Human-readable output
```

### devac deps

Get dependencies (outgoing edges) for an entity.

```bash
devac deps <entity-id> [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  --hub                   Query all registered repos (hub mode)
  --hub-dir <path>        Hub directory
  --edge-type <type>      Filter by edge type (CALLS, IMPORTS, EXTENDS, etc.)
  --limit <n>             Maximum results (default: 100)
  --pretty                Human-readable output

Examples:
  devac deps myrepo:pkg:function:abc123        # Get dependencies
  devac deps entity-id --edge-type CALLS       # Filter by edge type
  devac deps entity-id --hub                   # Cross-repo query
```

### devac dependents

Get dependents (incoming edges) for an entity.

```bash
devac dependents <entity-id> [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  --hub                   Query all registered repos (hub mode)
  --hub-dir <path>        Hub directory
  --edge-type <type>      Filter by edge type (CALLS, IMPORTS, EXTENDS, etc.)
  --limit <n>             Maximum results (default: 100)
  --pretty                Human-readable output

Examples:
  devac dependents entity-id                   # Who uses this?
  devac dependents entity-id --edge-type IMPORTS
  devac dependents entity-id --hub             # Cross-repo query
```

### devac file-symbols

Get symbols defined in a file.

```bash
devac file-symbols <file-path> [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  --hub                   Query all registered repos (hub mode)
  --hub-dir <path>        Hub directory
  --kind <type>           Filter by kind (function, class, variable, etc.)
  --limit <n>             Maximum results (default: 100)
  --pretty                Human-readable output

Examples:
  devac file-symbols src/auth.ts               # All symbols in file
  devac file-symbols src/auth.ts --kind function
  devac file-symbols src/auth.ts --pretty      # Human-readable
```

### devac call-graph

Get call graph for a function.

```bash
devac call-graph <entity-id> [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  --hub                   Query all registered repos (hub mode)
  --hub-dir <path>        Hub directory
  --direction <dir>       Direction: callers, callees, or both (default: both)
  --max-depth <n>         Maximum depth (default: 3)
  --limit <n>             Maximum results per direction (default: 100)
  --pretty                Human-readable output

Examples:
  devac call-graph entity-id                   # Both callers and callees
  devac call-graph entity-id --direction callers
  devac call-graph entity-id --max-depth 5     # Deeper traversal
```

## Hub Commands

### devac hub register

Register a repository with the central hub.

```bash
devac hub register [path]

Arguments:
  path               Repository path (default: current directory)

Examples:
  devac hub register                   # Register current repo
  devac hub register ~/code/repo-api   # Register another repo
```

### devac hub unregister

Remove a repository from the central hub.

```bash
devac hub unregister <name>

Arguments:
  name               Repository name

Examples:
  devac hub unregister repo-api
```

### devac hub list

List registered repositories.

```bash
devac hub list

Output:
┌────────────────┬───────────────────────────┬────────────────┐
│ Name           │ Path                      │ Packages       │
├────────────────┼───────────────────────────┼────────────────┤
│ repo-api       │ ~/code/repo-api           │ 4              │
│ repo-web       │ ~/code/repo-web           │ 2              │
└────────────────┴───────────────────────────┴────────────────┘
```

### devac hub query

Query across all registered repositories.

```bash
devac hub query "<sql>" [options]

Options:
  --format <format>   Output format: table (default), json, csv

Examples:
  devac hub query "SELECT * FROM nodes WHERE name = 'handleLogin'"
  devac hub query "SELECT DISTINCT module_specifier FROM external_refs"
```

### devac hub status

Show hub status and statistics.

```bash
devac hub status

Output:
Central Hub: ~/.devac/
Repositories: 3
Total Packages: 9
Total Nodes: 45,231
Last Refresh: 2025-01-15T10:30:00Z
```

### devac hub refresh

Rebuild cross-repo edge cache.

```bash
devac hub refresh

Output:
Refreshing hub cache...
  Scanning 3 repositories...
  Computing cross-repo edges...
✓ Hub refreshed
  Cross-repo edges: 234
  Time: 4.2s
```

### devac hub init

Initialize the central hub (first-time setup).

```bash
devac hub init [options]

Options:
  --path <path>       Hub location (default: ~/.devac/)
```

### devac hub sync

Sync external feedback (CI status, GitHub issues, PR reviews) to the Hub's unified feedback table. This enables AI assistants to query all feedback via MCP tools.

```bash
devac hub sync [options]

Options:
  --ci                Sync CI status
  --issues            Sync GitHub issues
  --reviews           Sync PR reviews
  --failing-only      Only sync failing CI checks (with --ci)
  --pending-only      Only sync pending/changes_requested reviews (with --reviews)
  --changes-requested-only  Only sync changes_requested reviews (with --reviews)
  --open-only         Only sync open issues (with --issues, default: true)
  --issue-limit <n>   Maximum issues per repo (default: 50)
  --include-comments  Include review comments with file locations (default: true)
  --clear-existing    Clear existing feedback before syncing (default: true)

Examples:
  devac hub sync --ci                    # Sync CI status to Hub
  devac hub sync --issues                # Sync GitHub issues to Hub
  devac hub sync --reviews               # Sync PR reviews to Hub
  devac hub sync --ci --issues --reviews # Sync all feedback types
  devac hub sync --ci --failing-only     # Only sync failing CI checks
```

**Sync Patterns:**

There are two ways to sync feedback to the Hub:

| Method | Use Case |
|--------|----------|
| `devac context X --sync-to-hub` | View feedback AND sync in one step |
| `devac hub sync --X` | Sync without viewing (e.g., in CI/automation) |

```bash
# View CI status and sync to Hub
devac context ci --sync-to-hub

# Just sync (no output) - useful for cron jobs
devac hub sync --ci --issues --reviews
```

### devac hub errors

Query validation errors from the hub.

```bash
devac hub errors [options]

Options:
  --repo <id>           Filter by repository ID
  --severity <level>    Filter by severity (error, warning)
  --source <type>       Filter by source (tsc, eslint, test)
  --file <path>         Filter by file path
  --limit <n>           Maximum results (default: 100)
  --pretty              Human-readable output

Examples:
  devac hub errors                          # All validation errors
  devac hub errors --severity error         # Only errors
  devac hub errors --source tsc --pretty    # TypeScript errors, pretty
  devac hub errors --file auth.ts           # Errors in specific file
```

### devac hub feedback

Query unified feedback from the hub. Includes validation errors, CI checks, GitHub issues, and PR reviews.

```bash
devac hub feedback [options]

Options:
  --repo <id>           Filter by repository ID
  --source <type>       Filter by source (tsc, eslint, test, ci-check, github-issue, pr-review)
  --severity <level>    Filter by severity (critical, error, warning, suggestion, note)
  --category <cat>      Filter by category (compilation, linting, testing, ci-check, task, code-review)
  --file <path>         Filter by file path (partial match)
  --resolved            Show only resolved items
  --actionable          Show only actionable items
  --limit <n>           Maximum results (default: 100)
  --pretty              Human-readable output

Examples:
  devac hub feedback                        # All feedback
  devac hub feedback --source ci-check      # Only CI failures
  devac hub feedback --severity error       # All errors from any source
  devac hub feedback --actionable --pretty  # What needs fixing?
```

### devac hub summary

Get summary counts from the hub.

```bash
devac hub summary [options]

Options:
  --type <type>         Summary type: validation, feedback, or counts (default: counts)
  --group-by <field>    Group by: repo, file, source, severity, category
  --pretty              Human-readable output

Examples:
  devac hub summary                         # Total counts
  devac hub summary --type validation       # Validation summary
  devac hub summary --type feedback --group-by source
  devac hub summary --pretty                # Human-readable counts
```

**Output (counts mode):**
```
{
  "validation": { "errors": 5, "warnings": 12, "total": 17 },
  "feedback": { "critical": 0, "error": 8, "warning": 15, "suggestion": 3, "note": 2, "total": 28 }
}
```

## Integrated Validation Commands

### devac validate

Run validation on affected files.

```bash
devac validate [options]

Options:
  --quick             Quick mode: changed + direct importers (1 hop)
  --full              Full mode: all transitively affected
  --package <path>    Validate specific package
  --skip-typecheck    Skip TypeScript type checking
  --skip-lint         Skip ESLint linting
  --force-tests       Force running tests (even in quick mode)
  --push-to-hub       Push validation results to central hub cache
  --repo-id <id>      Repository ID for hub push (required with --push-to-hub)
  --hub-dir <path>    Hub directory (default: ~/.devac/)

Examples:
  devac validate --quick               # Fast validation
  devac validate --full                # Thorough validation
  devac validate --push-to-hub --repo-id myorg/myrepo
                                       # Push results to hub for LLM queries
  devac validate --skip-lint           # Skip linting, run typecheck only
```

**Hub Integration:**

When using `--push-to-hub`, validation results are stored in the central hub's DuckDB for fast querying via MCP tools. This enables AI assistants to answer questions like "what errors do I need to fix?" without re-running validation.

```bash
# Push validation errors to hub
devac validate --push-to-hub --repo-id github.com/org/repo

# Query errors via MCP
# (get_validation_errors, get_validation_summary, get_validation_counts)
```

### devac affected

Show files affected by recent changes.

```bash
devac affected [options]

Options:
  --since <ref>       Git ref to compare against (default: HEAD~1)
  --package <path>    Scope to specific package

Examples:
  devac affected
  devac affected --since main
```

## Workspace Commands

Commands for managing multi-repo workspaces with federated code analysis.

### devac workspace status

Show status of all repositories in a workspace, including seed state and hub registration.

```bash
devac workspace status [options]

Options:
  --json              Output as JSON
  --path <path>       Workspace path (default: current directory)

Examples:
  devac workspace status              # Show workspace status
  devac workspace status --json       # Output as JSON
```

**Output includes:**
- List of discovered repos (main repos and worktrees)
- Seed status for each repo (present/missing, last modified)
- Hub registration status
- Worktree groupings by issue

### devac workspace watch

Start a workspace-level watcher that monitors seed files and auto-refreshes the hub.

```bash
devac workspace watch [options]

Options:
  --path <path>           Workspace path (default: current directory)
  --no-auto-refresh       Disable automatic hub refresh
  --debounce-ms <ms>      Hub refresh debounce (default: 500)

Examples:
  devac workspace watch                     # Start watching
  devac workspace watch --debounce-ms 1000  # Longer debounce
```

**How it works:**
1. Watches `.devac/seed/**/*.parquet` files in all repos
2. When seeds change, triggers hub refresh
3. Enables cross-repo queries to stay up-to-date

> **Note:** This watches seed files, not source files. Run `devac watch` per-repo to monitor source changes and update seeds.

### devac workspace init

Initialize workspace configuration at the parent directory level.

```bash
devac workspace init [options]

Options:
  --path <path>       Workspace path (default: current directory)
  --force             Overwrite existing configuration

Examples:
  devac workspace init              # Initialize workspace
  devac workspace init --force      # Reinitialize
```

**Creates:**
- `.devac/` directory at workspace root
- Hub database for federated queries
- State file for tracking repo discovery

## Context Commands

### devac context

Discover cross-repository context from the current directory. Detects sibling repositories, worktrees, and issue groupings.

```bash
devac context [options]

Options:
  --json              Output as JSON

Examples:
  devac context                        # Show context in text format
  devac context --json                 # Output as JSON
```

**Output (in a regular repo):**
```
Context

Sibling Repos:
  📦 api
  📦 web
     shared
```

**Output (in an issue worktree):**
```
Issue #123 Context

Worktrees:
  📦 api-123-auth (123-auth)
     web-123-auth (123-auth)

Main Repos:
  📦 api
  📦 web
```

**Output (in parent directory):**
```
Parent Directory Context
📁 /Users/dev/projects

Repositories:
  📦 api
  📦 web
     shared

Worktrees:
  📦 api-123-auth (#123)

Use: devac worktree start <issue> --repos api,web,shared
```

### devac context ci

Check CI status for all PRs in the current context. Requires `gh` CLI to be installed and authenticated.

```bash
devac context ci [options]

Options:
  --json              Output as JSON
  --checks            Include individual check details
  --sync-to-hub       Sync CI status to the Hub
  --failing-only      Only sync failing checks (with --sync-to-hub)

Examples:
  devac context ci                     # Show CI status for all PRs
  devac context ci --checks            # Include individual check details
  devac context ci --json              # Output as JSON
  devac context ci --sync-to-hub       # Check CI and sync to Hub
```

**Output:**
```
CI Status for Issue #123

  api-123-auth: PR #45 ✓ passing
    https://github.com/org/api/pull/45

  web-123-auth: PR #46 ⏳ pending
    https://github.com/org/web/pull/46

Summary: 1 passing, 0 failing, 1 pending
```

### devac context issues

List GitHub issues for all repositories in the current context.

```bash
devac context issues [options]

Options:
  --json              Output as JSON
  --open-only         Only show open issues (default: true)
  --limit <n>         Maximum issues per repo (default: 50)
  --labels <labels>   Filter by labels (comma-separated)
  --sync-to-hub       Sync issues to the Hub

Examples:
  devac context issues                  # List issues for all repos
  devac context issues --labels bug     # Filter by label
  devac context issues --sync-to-hub    # List and sync to Hub
```

**Output:**
```
GitHub Issues:

  api: 5 issues
    #123 Add user authentication (open)
    #124 Fix login timeout (open)

  web: 3 issues
    #45 Update dashboard (open)

Total: 8 issues across 2 repos
```

### devac context reviews

Get PR reviews for all repositories in the current context.

```bash
devac context reviews [options]

Options:
  --json                     Output as JSON
  --pending-only             Only show pending/changes_requested reviews (default: true)
  --include-comments         Include review comments with file locations (default: true)
  --sync-to-hub              Sync reviews to the Hub
  --changes-requested-only   Only sync changes_requested reviews (with --sync-to-hub)

Examples:
  devac context reviews                 # List PR reviews
  devac context reviews --sync-to-hub   # List and sync to Hub
```

**Output:**
```
PR Reviews:

  api-123-auth: PR #45 - 2 reviews, 3 comments
    ✗ reviewer1: CHANGES_REQUESTED - Please add tests...
    💬 reviewer2: COMMENTED - Looks good overall

  web-123-auth: PR #46 - 1 reviews, 0 comments
    ⏳ reviewer1: PENDING

Total: 3 reviews, 3 comments
```

### devac context review

Generate an LLM review prompt for changes in the current context. Gathers diffs from all repositories/worktrees and formats them for AI review.

```bash
devac context review [options]

Options:
  --json              Output as JSON
  --focus <area>      Focus area: security, performance, tests, all (default: all)
  --base <branch>     Base branch to diff against (default: main)

Examples:
  devac context review                 # Review all changes
  devac context review --focus security
  devac context review --base develop
```

**Output:**
```
# Review Prompt Generated

Gathered changes from 2 repositories:

  - api-123-auth: 5 files
  - web-123-auth: 3 files

Total: 8 files, 245 changes

---

## Prompt (copy and paste to an LLM)

```
[Generated review prompt with diffs and instructions]
```

---

After getting a response, you can process it with:
  devac context review --process-response <response-file>
```

---

## MCP Server

### devac mcp start

Start the MCP server for AI assistant integration.

```bash
devac mcp start [options]

Options:
  --hub               Hub mode: federated queries across all registered repos (default)
  --package <path>    Package mode: query a single package

Examples:
  devac mcp start                      # Start in hub mode (default)
  devac mcp start --hub                # Explicit hub mode
  devac mcp start --package ./pkg      # Start in package mode
```

**Modes:**

| Mode | Description |
|------|-------------|
| Hub | Queries across all registered repos via central hub. Use `get_context`, `query_sql`, `list_repos`, validation tools, and unified feedback tools. |
| Package | Queries a single package. Useful for isolated analysis. |

The `--hub` and `--package` flags are mutually exclusive. Hub mode is the default if neither is specified.

**MCP Tools Available:**
- Code analysis: `find_symbol`, `get_dependencies`, `get_dependents`, `get_file_symbols`, `get_affected`, `get_call_graph`, `query_sql`
- Context discovery: `get_context`, `list_repos`
- Validation: `get_validation_errors`, `get_validation_summary`, `get_validation_counts`
- Unified feedback: `get_all_feedback`, `get_feedback_summary`, `get_feedback_counts`

See [MCP Server documentation](./mcp-server.md) for full tool reference.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVAC_HUB_PATH` | `~/.devac/` | Central hub location |
| `DEVAC_DUCKDB_MEMORY` | `512MB` | DuckDB memory limit per connection |
| `DEVAC_DUCKDB_TEMP` | System temp | Spill directory for large operations |
| `DEVAC_LOG_LEVEL` | `info` | Log level: debug, info, warn, error |
| `DEBUG` | - | Enable debug namespaces (e.g., `devac:*`) |

**Note:** Pool size and thread count are not configurable via environment variables. They use sensible defaults:
- `maxConnections`: 4
- `threads`: `Math.floor(os.cpus().length / 2)`

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 130 | Interrupted (Ctrl+C) |

---

*Next: [API Reference](./api-reference.md) for programmatic usage*
