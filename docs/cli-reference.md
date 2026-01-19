# CLI Reference

Complete reference for all DevAC commands.

## Related Documentation

- [vivief Workflow Guide](./vivief-workflow.md) - Complete development workflow with CLI integration
- [vivief Workflow Guide - Conceptual Model](./vivief-workflow.md#conceptual-model) - How CLI fits in the architecture

**Note:** The CLI is the preferred access method for all DevAC operations. It provides lower context overhead compared to MCP tools and is used by skills, commands, and automation. Both CLI and MCP share the same `devac-core` implementation.

## Global Options

```bash
devac [command] [options]

Options:
  --help, -h       Show help
  --version, -v    Show version
  --verbose        Enable verbose logging
  --quiet          Suppress output except errors
```

## Default Action

When running `devac` with no arguments, it displays the status command output (brief format):

```bash
devac                    # Equivalent to: devac status --brief
```

## Status Command

### devac status

Show current DevAC status including context, health, diagnostics, and next steps.

```bash
devac status [options]

Options:
  --brief              Show brief summary (default)
  --full               Show full detailed status
  --json               Output as JSON
  --seeds-only         Show only seed status (skip diagnostics)

Formats:
  brief (default)  Summary per category
  full             Detailed breakdown with individual items
  json             Machine-readable JSON output

Examples:
  devac                              # Brief status (default action)
  devac status                       # Same as above
  devac status --brief               # Summary view (explicit)
  devac status --full                # Detailed view
  devac status --json                # JSON output
```

**Output (brief, default):**
```
DevAC Status
  Context:      api-gh123-auth (issue #123)
  DevAC Health: watch:inactive  hub:connected  mcp:ready
  Diagnostics:  errors:5  lint:3  tests:ok  coverage:45%
  Activity:     pr:#456 open  reviews:0
  Next:         Fix 5 type errors in src/auth/*
```

**Output (full):**
```
DevAC Full Status Report

CONTEXT
  Worktree:   api-gh123-auth
  Issue:      gh:org/api:123 "Add OAuth support"
  Branch:     feature/oauth
  Related:    web-gh123-auth (same issue)

DEVAC HEALTH
  Watch:      Inactive
  Hub:        Connected ({workspace}/.devac/)
  MCP:        Ready

DIAGNOSTICS
  Type Errors:    5
    - src/auth/oauth.ts:45 - Property 'token' missing
    - src/auth/oauth.ts:67 - Type 'string' not assignable
    - ... (3 more)
  Lint Issues:    3
    - src/auth/oauth.ts:12 - Unexpected 'any'
  Tests:          OK (45 passed)
  Coverage:       45% (threshold: 80%)

ACTIVITY
  Open PRs:       1 (#456 "Add OAuth")
  Reviews:        0 pending
  CI:             Passing

NEXT STEPS
  1. Fix 5 type errors in src/auth/*
  2. Improve coverage in src/auth/oauth.ts
  3. Address 3 lint issues
```

**Status Categories:**

| Category | What It Shows |
|----------|---------------|
| Context | Current worktree, issue, branch, related worktrees |
| DevAC Health | Watch status, hub connection, MCP readiness |
| Diagnostics | Type errors, lint issues, test results, coverage |
| Activity | Open PRs, pending reviews, CI status |
| Next | Suggested next actions based on diagnostics |

## Diagnostics Command

### devac diagnostics

Query all diagnostics from the hub. Provides a unified view of validation results across all registered repositories.

```bash
devac diagnostics [options]

Options:
  --repo <id>           Filter by repository ID
  --source <type>       Filter by source (tsc, eslint, vitest, jest, coverage)
  --severity <level>    Filter by severity (error, warning, suggestion, note)
  --file <path>         Filter by file path (partial match)
  --actionable          Show only actionable items (items that need fixing)
  --limit <n>           Maximum results (default: 100)
  --format <format>     Output format: table (default), json, summary
  --pretty              Human-readable output (alias for --format table)

Examples:
  devac diagnostics                        # All diagnostics
  devac diagnostics --source tsc           # Only TypeScript errors
  devac diagnostics --severity error       # All errors
  devac diagnostics --actionable           # What needs fixing?
  devac diagnostics --format summary       # Summary counts only
  devac diagnostics --format json          # JSON output
```

**Output (table):**
```
┌────────────┬──────────┬────────────────────────────────────────────┐
│ Severity   │ Source   │ Message                                    │
├────────────┼──────────┼────────────────────────────────────────────┤
│ error      │ tsc      │ Property 'token' does not exist on type... │
│ error      │ tsc      │ Type 'string' is not assignable to type... │
│ warning    │ eslint   │ Unexpected 'any'. Specify a different...   │
└────────────┴──────────┴────────────────────────────────────────────┘
```

**Output (summary):**
```
Diagnostics Summary:
  Errors:     5
  Warnings:   3
  Total:      8

By Source:
  tsc:        5
  eslint:     3
```

## Command Aliases

DevAC provides command aliases for improved discoverability and consistency with the Three Pillars model.

### Extractor Aliases

```bash
devac extract                    # Alias for: devac analyze
devac extract --package ./pkg    # Alias for: devac analyze --package ./pkg
devac extract --force            # Alias for: devac analyze --force
```

### Validator Aliases

```bash
devac check                      # Alias for: devac validate
devac check --quick              # Alias for: devac validate --quick
devac check --full               # Alias for: devac validate --full
```

### Workspace Alias

The `ws` command is an alias for `workspace`:

```bash
devac ws status                  # Alias for: devac workspace status
devac ws watch                   # Alias for: devac workspace watch
devac ws init                    # Alias for: devac workspace init
devac ws register                # Alias for: devac workspace register
devac ws list                    # Alias for: devac workspace list
devac ws sync                    # Alias for: devac workspace sync
devac ws ci                      # Alias for: devac workspace ci
devac ws issues                  # Alias for: devac workspace issues
devac ws review                  # Alias for: devac workspace review
devac ws mcp                     # Alias for: devac workspace mcp
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
  -p, --package <path>    Query single package only (otherwise queries all repos)
  --kind <type>           Filter by kind (function, class, variable, etc.)
  --limit <n>             Maximum results (default: 100)
  --pretty                Human-readable output

Examples:
  devac find-symbol handleLogin                # Search all repos
  devac find-symbol User --kind class          # Filter by kind
  devac find-symbol login -p ./my-pkg          # Search single package
  devac find-symbol login --pretty             # Human-readable output
```

### devac deps

Get dependencies (outgoing edges) for an entity. Queries all repos by default.

```bash
devac deps <entity-id> [options]

Options:
  -p, --package <path>    Query single package only (otherwise queries all repos)
  --edge-type <type>      Filter by edge type (CALLS, IMPORTS, EXTENDS, etc.)
  --limit <n>             Maximum results (default: 100)
  --pretty                Human-readable output

Examples:
  devac deps myrepo:pkg:function:abc123        # Get dependencies (all repos)
  devac deps entity-id --edge-type CALLS       # Filter by edge type
  devac deps entity-id -p ./my-pkg             # Single package query
```

### devac dependents

Get dependents (incoming edges) for an entity. Queries all repos by default.

```bash
devac dependents <entity-id> [options]

Options:
  -p, --package <path>    Query single package only (otherwise queries all repos)
  --edge-type <type>      Filter by edge type (CALLS, IMPORTS, EXTENDS, etc.)
  --limit <n>             Maximum results (default: 100)
  --pretty                Human-readable output

Examples:
  devac dependents entity-id                   # Who uses this? (all repos)
  devac dependents entity-id --edge-type IMPORTS
  devac dependents entity-id -p ./my-pkg       # Single package query
```

### devac file-symbols

Get symbols defined in a file. Queries all repos by default.

```bash
devac file-symbols <file-path> [options]

Options:
  -p, --package <path>    Query single package only (otherwise queries all repos)
  --kind <type>           Filter by kind (function, class, variable, etc.)
  --limit <n>             Maximum results (default: 100)
  --pretty                Human-readable output

Examples:
  devac file-symbols src/auth.ts               # All symbols in file
  devac file-symbols src/auth.ts --kind function
  devac file-symbols src/auth.ts --pretty      # Human-readable
```

### devac call-graph

Get call graph for a function. Queries all repos by default.

```bash
devac call-graph <entity-id> [options]

Options:
  -p, --package <path>    Query single package only (otherwise queries all repos)
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
Central Hub: /path/to/workspace/.devac/
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
  --path <path>       Hub location (default: auto-detected from workspace)
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

### devac workspace register

Register a repository with the workspace hub. (Alias: `devac ws register`)

```bash
devac workspace register [path]

Arguments:
  path               Repository path (default: current directory)

Examples:
  devac workspace register                   # Register current repo
  devac workspace register ~/code/repo-api   # Register another repo
  devac ws register                          # Using alias
```

### devac workspace unregister

Remove a repository from the workspace hub. (Alias: `devac ws unregister`)

```bash
devac workspace unregister <name>

Arguments:
  name               Repository name

Examples:
  devac workspace unregister repo-api
  devac ws unregister repo-api               # Using alias
```

### devac workspace list

List registered repositories in the workspace. (Alias: `devac ws list`)

```bash
devac workspace list

Examples:
  devac workspace list
  devac ws list                              # Using alias
```

**Output:**
```
┌────────────────┬───────────────────────────┬────────────────┐
│ Name           │ Path                      │ Packages       │
├────────────────┼───────────────────────────┼────────────────┤
│ repo-api       │ ~/code/repo-api           │ 4              │
│ repo-web       │ ~/code/repo-web           │ 2              │
└────────────────┴───────────────────────────┴────────────────┘
```

### devac workspace refresh

Rebuild cross-repo edge cache. (Alias: `devac ws refresh`)

```bash
devac workspace refresh

Examples:
  devac workspace refresh
  devac ws refresh                           # Using alias
```

**Output:**
```
Refreshing hub cache...
  Scanning 3 repositories...
  Computing cross-repo edges...
✓ Hub refreshed
  Cross-repo edges: 234
  Time: 4.2s
```

### devac workspace sync

Sync external feedback (CI status, GitHub issues, PR reviews) to the Hub. (Alias: `devac ws sync`)

```bash
devac workspace sync [options]

Options:
  --ci                Sync CI status
  --issues            Sync GitHub issues
  --reviews           Sync PR reviews
  --failing-only      Only sync failing CI checks (with --ci)
  --pending-only      Only sync pending/changes_requested reviews (with --reviews)
  --open-only         Only sync open issues (with --issues, default: true)
  --issue-limit <n>   Maximum issues per repo (default: 50)
  --clear-existing    Clear existing feedback before syncing (default: true)

Examples:
  devac workspace sync --ci                    # Sync CI status
  devac workspace sync --issues                # Sync GitHub issues
  devac workspace sync --reviews               # Sync PR reviews
  devac workspace sync --ci --issues --reviews # Sync all
  devac ws sync --ci --failing-only            # Using alias
```

### devac workspace ci

Check CI status for all PRs in the workspace. (Alias: `devac ws ci`)

```bash
devac workspace ci [options]

Options:
  --json              Output as JSON
  --checks            Include individual check details
  --sync-to-hub       Sync CI status to the Hub
  --failing-only      Only sync failing checks (with --sync-to-hub)

Examples:
  devac workspace ci                     # Show CI status
  devac workspace ci --checks            # Include check details
  devac workspace ci --sync-to-hub       # Sync to Hub
  devac ws ci                            # Using alias
```

### devac workspace issues

List GitHub issues for all repositories in the workspace. (Alias: `devac ws issues`)

```bash
devac workspace issues [options]

Options:
  --json              Output as JSON
  --open-only         Only show open issues (default: true)
  --limit <n>         Maximum issues per repo (default: 50)
  --labels <labels>   Filter by labels (comma-separated)
  --sync-to-hub       Sync issues to the Hub

Examples:
  devac workspace issues                  # List issues
  devac workspace issues --labels bug     # Filter by label
  devac workspace issues --sync-to-hub    # Sync to Hub
  devac ws issues                         # Using alias
```

### devac workspace review

Generate an LLM review prompt for changes in the workspace. (Alias: `devac ws review`)

```bash
devac workspace review [options]

Options:
  --json              Output as JSON
  --focus <area>      Focus area: security, performance, tests, all (default: all)
  --base <branch>     Base branch to diff against (default: main)

Examples:
  devac workspace review                 # Review all changes
  devac workspace review --focus security
  devac ws review                        # Using alias
```

### devac workspace mcp

Start the MCP server for AI assistant integration. (Alias: `devac ws mcp`)

```bash
devac workspace mcp [options]

Options:
  --package <path>    Package mode: query a single package instead of hub

Examples:
  devac workspace mcp                    # Start in hub mode (default)
  devac workspace mcp --package ./pkg    # Start in package mode
  devac ws mcp                           # Using alias
```

**MCP Tools Available:**
- Code analysis: `find_symbol`, `get_dependencies`, `get_dependents`, `get_file_symbols`, `get_affected`, `get_call_graph`, `query_sql`
- Context discovery: `get_context`, `list_repos`
- Validation: `get_validation_errors`, `get_validation_summary`, `get_validation_counts`
- Unified diagnostics: `get_all_diagnostics`, `get_diagnostics_summary`, `get_diagnostics_counts`

### Workspace Repository Commands

Commands for managing workspace repositories with versioned configuration. See [Workspace Repository Pattern](./workspace-repo.md) for concepts.

#### devac workspace repo init

Initialize a new workspace repository.

```bash
devac workspace repo init [options]

Options:
  --name <name>     Custom workspace name (default: parent directory name)
  --path <path>     Parent directory path (default: current directory)
  --force           Overwrite existing workspace repository

Examples:
  devac workspace repo init
  devac workspace repo init --name platform
  devac workspace repo init --path ~/projects
```

**Creates:**
- `<name>-workspace/` directory
- `workspace.yaml` with repository registry
- `CLAUDE.md` with auto-generated sections
- `.gitignore` for local state files

#### devac workspace repo sync

Synchronize `CLAUDE.md` from per-repo `AGENTS.md` files.

```bash
devac workspace repo sync [options]

Options:
  --dry-run         Show what would be synced without making changes
  --force           Overwrite manual changes in auto-generated sections

Examples:
  devac workspace repo sync
  devac workspace repo sync --dry-run
```

**Behavior:**
1. Reads `workspace.yaml` for repository list
2. Scans each repo for `AGENTS.md`
3. Updates auto-generated sections in `CLAUDE.md`
4. Preserves manual sections outside markers

#### devac workspace repo install

Install a workspace by cloning repositories and setting up links.

```bash
devac workspace repo install [options]

Options:
  --skip-clone      Skip cloning repositories (use existing)
  --skip-symlink    Skip symlinking CLAUDE.md
  --shallow         Use shallow clones for repositories

Examples:
  devac workspace repo install
  devac workspace repo install --skip-clone
```

**Behavior:**
1. Reads `workspace.yaml` for repository list
2. Clones missing repositories to parent directory
3. Creates symlink from parent `CLAUDE.md` to workspace `CLAUDE.md`
4. Initializes DevAC hub if needed

#### devac workspace repo status

Show status of workspace repository and registered repos.

```bash
devac workspace repo status [options]

Options:
  --json            Output as JSON

Examples:
  devac workspace repo status
  devac workspace repo status --json
```

**Output:**
```
Workspace: acme-workspace
Path: /Users/you/ws/acme-workspace

Repositories (3):
  api        ✓ cloned  ✓ AGENTS.md  git:clean
  web        ✓ cloned  ✓ AGENTS.md  git:modified (2 files)
  shared     ✓ cloned  ✗ AGENTS.md  git:clean

CLAUDE.md:
  Auto-generated: 2026-01-15T10:30:00Z
  Manual sections: 2
  Repos synced: 2/3
```

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

## Effects Commands (v3.0)

Commands for querying and analyzing code effects.

### devac effects

Query effects extracted during analysis. Queries all repos by default.

```bash
devac effects [options]

Options:
  -p, --package <path>    Query single package only (otherwise queries all repos)
  --type <type>           Filter by effect type (FunctionCall, Store, Retrieve, Send)
  --file <path>           Filter by file path
  --entity <id>           Filter by source entity ID
  --external-only         Show only external calls
  --async-only            Show only async calls
  --limit <n>             Maximum results (default: 100)
  --format <format>       Output format: table (default), json, csv
  --pretty                Human-readable output

Examples:
  devac effects                              # All effects (all repos)
  devac effects --type FunctionCall          # Only function calls
  devac effects --external-only              # External API calls
  devac effects -p ./my-pkg                  # Query single package
  devac effects --pretty                     # Human-readable output
```

**Output (table):**
```
┌─────────────────────────┬───────────────┬────────────────────────────────┐
│ Effect Type             │ Callee        │ Location                       │
├─────────────────────────┼───────────────┼────────────────────────────────┤
│ FunctionCall            │ stripe.create │ src/payment.ts:45              │
│ FunctionCall            │ db.query      │ src/user.ts:23                 │
└─────────────────────────┴───────────────┴────────────────────────────────┘
```

### devac effects summary

Get summary statistics for effects. Queries all repos by default.

```bash
devac effects summary [options]

Options:
  -p, --package <path>    Query single package only (otherwise queries all repos)
  --group-by <field>      Group by: type, file, entity (default: type)
  --format <format>       Output format: table (default), json

Examples:
  devac effects summary                      # Summary by effect type
  devac effects summary --group-by file      # Summary by file
```

### devac effects init

Generate initial `docs/package-effects.md` from AST analysis. Discovers function call patterns in the codebase and creates a draft effect documentation file.

```bash
devac effects init [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  -o, --output <path>     Output file path (default: docs/package-effects.md)
  --threshold <n>         Minimum occurrences for a pattern (default: 2)
  --json                  Output as JSON

Examples:
  devac effects init                         # Generate package-effects.md
  devac effects init -p ./packages/auth      # For specific package
  devac effects init --threshold 5           # Only patterns with 5+ occurrences
```

**Output:**
Creates `docs/package-effects.md` with discovered patterns in tables:
```markdown
# Package Effects: my-package

## Store Operations
| Pattern | Store Type | Operation | Provider | Target |
|---------|------------|-----------|----------|--------|
| `userRepo.create` | database | insert | mysql | users |

## External Calls
| Pattern | Send Type | Service | Third Party |
|---------|-----------|---------|-------------|
| `stripeClient.*` | external | stripe | true |
```

### devac effects verify

Compare documented patterns in `docs/package-effects.md` against actual extracted effects. Reports gaps and stale patterns.

```bash
devac effects verify [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  -f, --file <path>       Path to package-effects.md (default: docs/package-effects.md)
  --json                  Output as JSON

Examples:
  devac effects verify                       # Verify current package
  devac effects verify -p ./packages/auth    # For specific package
  devac effects verify --json                # JSON output for CI
```

**Output:**
```
Effects Verification Report

Documented patterns: 15
Matched patterns: 12
Unmapped patterns: 5
Stale patterns: 3

Unmapped (in code but not documented):
  - sendgrid.send (8 occurrences)
  - redis.set (5 occurrences)

Stale (documented but not in code):
  - legacyApi.call
  - oldDb.query
```

### devac effects sync

Generate `.devac/effect-mappings.ts` from `docs/package-effects.md`. Creates TypeScript extraction rules for custom effect classification during analysis.

```bash
devac effects sync [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  -f, --file <path>       Path to package-effects.md (default: docs/package-effects.md)
  -o, --output <path>     Output path for effect-mappings.ts (default: .devac/effect-mappings.ts)
  --json                  Output as JSON

Examples:
  devac effects sync                         # Generate effect-mappings.ts
  devac effects sync -p ./packages/auth      # For specific package
```

**Output:**
Creates `.devac/effect-mappings.ts`:
```typescript
/**
 * Effect mappings for my-package
 * Generated by: devac effects sync
 */
export const effectMappings = [
  {
    pattern: "userRepo.create",
    effectType: "Store",
    storeType: "database",
    operation: "insert",
    provider: "mysql",
    target: "users",
  },
  // ...
];
```

**Workflow:**
1. Run `devac effects init` to create initial `docs/package-effects.md`
2. Review and refine the documented patterns
3. Run `devac effects verify` to check for gaps
4. Run `devac effects sync` to generate TypeScript mappings

### devac doc-sync

Generate documentation from code analysis seeds. Produces effects documentation and C4 diagrams at package, repo, and workspace levels.

```bash
devac doc-sync [options]

Options:
  -p, --package <path>    Sync specific package
  -r, --repo <path>       Sync all packages in repo (generates repo-level docs)
  -w, --workspace         Sync entire workspace (generates workspace-level docs)
  --effects               Effects documentation only
  --c4                    C4 diagrams only
  --all                   All documentation (default)
  --format <format>       C4 output format: likec4 (default), plantuml, both
  --force                 Regenerate even if unchanged
  --check                 CI mode: verify docs are in sync
  --json                  Output as JSON
  -v, --verbose           Detailed progress

Examples:
  devac doc-sync                           # Sync current package (LikeC4 format)
  devac doc-sync -p ./packages/auth        # Sync specific package
  devac doc-sync --repo                    # Sync all packages + repo-level docs
  devac doc-sync --workspace               # Sync workspace-level docs
  devac doc-sync --check                   # CI mode: verify docs are in sync
  devac doc-sync --effects                 # Only effects documentation
  devac doc-sync --c4                      # Only C4 diagrams
  devac doc-sync --c4 --format plantuml    # C4 diagrams in PlantUML format
  devac doc-sync --c4 --format both        # C4 diagrams in both formats
  devac doc-sync --force                   # Regenerate all docs
```

**Output Files:**

| Level | LikeC4 (default) | PlantUML (legacy) |
|-------|------------------|-------------------|
| Package | `docs/c4/context.c4`, `docs/c4/containers.c4` | `docs/c4/context.puml`, `docs/c4/containers.puml` |
| Repo | `docs/c4/context.c4`, `docs/c4/containers.c4` | `docs/c4/context.puml`, `docs/c4/containers.puml` |
| Workspace | `docs/c4/workspace.c4` | `docs/c4/context.puml`, `docs/c4/containers.puml` |

Effects documentation is always generated as Markdown: `docs/package-effects.md`, `docs/repo-effects.md`, `docs/workspace-effects.md`.

**Format Options:**

| Format | Description |
|--------|-------------|
| `likec4` | LikeC4 DSL with source links, tags, dynamic views (default) |
| `plantuml` | PlantUML C4 macros for static diagrams |
| `both` | Generate both LikeC4 and PlantUML files |

See [ADR-0027](./adr/0027-likec4-primary-format.md) for the decision to use LikeC4 as the primary format.

**Change Detection:**

Documents include a seed hash in their metadata. On subsequent runs, doc-sync compares the current seed hash against the embedded hash and only regenerates if seeds have changed. Use `--force` to bypass this check.

**CI Integration:**

Use `--check` in CI pipelines to verify documentation is in sync without regenerating:

```bash
devac doc-sync --check || echo "Docs out of sync, run: devac doc-sync"
```

## Rules Commands (v3.0)

Commands for running the Rules Engine on effects.

### devac rules

Run the Rules Engine to transform effects into domain effects. Queries all repos by default.

```bash
devac rules [options]

Options:
  -p, --package <path>    Query single package only (otherwise queries all repos)
  --config <path>         Custom rules configuration file
  --builtin               Include builtin rules (default: true)
  --domain <name>         Filter output by domain (e.g., Payment, Auth)
  --show-unmatched        Include effects that didn't match any rule
  --format <format>       Output format: table (default), json
  --pretty                Human-readable output

Examples:
  devac rules                                # Run builtin rules (all repos)
  devac rules --domain Payment               # Show Payment domain only
  devac rules --show-unmatched               # Show unmatched effects
  devac rules --config rules.json            # Use custom rules
```

**Output (table):**
```
┌────────────────┬────────────────┬───────────────────────────────────────┐
│ Domain         │ Action         │ Location                              │
├────────────────┼────────────────┼───────────────────────────────────────┤
│ Payment        │ Charge         │ src/payment.ts:45 (stripe.create)     │
│ Database       │ Read           │ src/user.ts:23 (prisma.findMany)      │
│ Auth           │ TokenVerify    │ src/auth.ts:12 (jwt.verify)           │
└────────────────┴────────────────┴───────────────────────────────────────┘
```

### devac rules list

List available rules.

```bash
devac rules list [options]

Options:
  --config <path>         Custom rules configuration file
  --domain <name>         Filter by domain
  --provider <name>       Filter by provider (e.g., stripe, dynamodb)
  --format <format>       Output format: table (default), json

Examples:
  devac rules list                           # All builtin rules
  devac rules list --domain Payment          # Payment rules only
  devac rules list --provider aws            # AWS-related rules
```

### devac rules stats

Show rule match statistics from the last run.

```bash
devac rules stats [options]

Options:
  -p, --package <path>    Package path (default: current directory)
  --format <format>       Output format: table (default), json

Examples:
  devac rules stats
```

**Output:**
```
Rules Engine Statistics
  Total effects processed: 1,234
  Matched: 987 (80%)
  Unmatched: 247 (20%)
  Processing time: 45ms

Top Rules:
  db-prisma-read: 234 matches
  http-fetch: 189 matches
  logging-console: 156 matches
```

## C4 Diagram Commands (v3.0)

Commands for generating C4 architecture diagrams.

### devac c4

Generate C4 diagrams from domain effects. Queries all repos by default.

```bash
devac c4 [options]

Options:
  -p, --package <path>    Query single package only (otherwise queries all repos)
  --level <level>         C4 level: context, container, component (default: context)
  --name <name>           System name for the diagram
  --output <file>         Output file path (default: stdout)
  --format <format>       Output format: plantuml (default), json

Examples:
  devac c4                                   # Generate context diagram (all repos)
  devac c4 --level container                 # Container diagram
  devac c4 --name "Payment Service"          # Custom system name
  devac c4 --output c4-context.puml          # Save to file
```

**Output (PlantUML):**
```plantuml
@startuml C4_Context
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml

title Payment Service - System Context Diagram

System(system, "Payment Service", "Handles payment processing")

System_Ext(external_Payment_stripe, "Stripe (Payment)", "payment")
System_Ext(external_Database_dynamodb, "DynamoDB (Database)", "database")

Rel(system, external_Payment_stripe, "Charge, Refund...")
Rel(system, external_Database_dynamodb, "Read, Write...")

@enduml
```

### devac c4 domains

Discover domain boundaries from effects. Queries all repos by default.

```bash
devac c4 domains [options]

Options:
  -p, --package <path>    Query single package only (otherwise queries all repos)
  --format <format>       Output format: table (default), json

Examples:
  devac c4 domains                           # Show domain boundaries (all repos)
  devac c4 domains -p ./my-pkg               # Single package boundaries
```

**Output:**
```
Domain Boundaries

  Payment (cohesion: 0.85)
    Files: 5
    Components: 3
    Actions: Charge, Refund, Subscription
    External: stripe

  Auth (cohesion: 1.00)
    Files: 4
    Components: 4
    Actions: TokenCreate, TokenVerify, PasswordHash
    External: aws-cognito

  Database (cohesion: 0.60)
    Files: 12
    Components: 8
    Actions: Read, Write
    External: dynamodb, prisma
```

### devac c4 externals

List external systems detected from effects. Queries all repos by default.

```bash
devac c4 externals [options]

Options:
  -p, --package <path>    Query single package only (otherwise queries all repos)
  --format <format>       Output format: table (default), json

Examples:
  devac c4 externals                         # List external systems (all repos)
```

**Output:**
```
External Systems

  Stripe (Payment)
    Provider: stripe
    Relationships: 23
    Actions: Charge, Refund, Subscription

  DynamoDB (Database)
    Provider: aws-dynamodb
    Relationships: 156
    Actions: Read, Write

  Cognito (Auth)
    Provider: aws-cognito
    Relationships: 8
    Actions: CognitoAuth
```

---

## Doctor - System Health Check

Diagnose and fix common issues with the DevAC CLI/MCP setup.

### devac doctor

Check system health and optionally fix issues.

```bash
devac doctor [options]

Options:
  --fix               Execute fixes (default: dry-run only)
  --json              Output as JSON
  --verbose           Show additional details

Examples:
  devac doctor                    # Check health (dry-run)
  devac doctor --fix              # Execute fixes automatically
  devac doctor --json             # JSON output for scripting
  devac doctor --verbose          # Show additional details
```

**Checks Performed:**

| Category | Checks |
|----------|--------|
| CLI Installation | devac, devac-mcp, devac-worktree availability and version consistency |
| Hub Health | Database initialization and queryability |
| MCP Status | Socket file presence and responsiveness |
| Workspace Builds* | Package dist/index.js existence |
| Plugin Config* | plugin.json and .mcp.json validity |
| Version Updates | Check if newer version is available via GitHub Releases |
| Release Preparation* | Detect unreleased changesets that need `changeset version` |

*Only run when inside the devac workspace

**Output:**
```
DevAC Doctor - Checking system health...

CLI Installation
  ✓ devac: 0.11.0
  ✓ devac-mcp: 0.11.0
  ✓ devac-worktree: 0.11.0
  ✓ Version consistency: all at v0.11.0

Hub Health
  ✓ Hub initialized: ~/.devac/central.duckdb
  ✓ Hub queryable: 5 repos registered

MCP Status
  ✓ MCP server: not running (socket not found)

Version Updates
  ✓ Version update: up to date (v0.11.0)

Release Preparation
  ! Unreleased changesets: 2 unreleased changeset(s)
    Fix: pnpm version-packages

Summary: 1 issue, 1 fixable
Run with --fix to apply fixes
```

**Fixing Issues:**

When issues are found, running with `--fix` will automatically execute repair commands:

```bash
devac doctor --fix

# Example output with fixes:
CLI Installation
  ✗ devac-mcp: dist/index.js missing
    Fix: pnpm --filter @pietgk/devac-mcp build

Fixes Applied:
  ✓ Fixed: devac-mcp
```

---

## MCP Server

### devac mcp start

Start the MCP server for AI assistant integration.

```bash
devac mcp start [options]

Options:
  --package <path>    Package mode: query a single package (default: hub mode)

Examples:
  devac mcp start                      # Start in hub mode (default)
  devac mcp start --package ./pkg      # Start in package mode
```

**Modes:**

| Mode | Description |
|------|-------------|
| Hub (default) | Queries across all registered repos via central hub. Use `get_context`, `query_sql`, `list_repos`, validation tools, and unified feedback tools. |
| Package | Queries a single package. Useful for isolated analysis. Use `--package` to enable. |

**MCP Tools Available:**
- Code analysis: `find_symbol`, `get_dependencies`, `get_dependents`, `get_file_symbols`, `get_affected`, `get_call_graph`, `query_sql`
- Context discovery: `get_context`, `list_repos`
- Validation: `get_validation_errors`, `get_validation_summary`, `get_validation_counts`
- Unified diagnostics: `get_all_diagnostics`, `get_diagnostics_summary`, `get_diagnostics_counts`

See [MCP Server documentation](./mcp-server.md) for full tool reference.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVAC_HUB_PATH` | Auto-detected | Central hub location (defaults to workspace/.devac/) |
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
