# Multi-Repo Context Skill

Work across multiple repositories in a workspace using DevAC's Hub mode.

## Triggers

This skill activates when users ask about:
- "cross-repo"
- "workspace status"
- "all repos"
- "multi-repo"
- "across repositories"
- "workspace overview"
- "connected repos"

## Capabilities

### Workspace Overview
See all repositories connected to the DevAC hub with their status.

### Cross-Repository Search
Find symbols, patterns, and code across all connected repos.

### Unified Context
Get a holistic view of dependencies and relationships spanning repos.

### Multi-Repo Impact Analysis
Understand how changes in one repo affect others.

## CLI Commands (Primary)

Use DevAC CLI commands for multi-repo operations. CLI is preferred for lower context overhead.

### `devac status --hub`
Get hub connection and health status.
```bash
devac status --hub
```

### `devac query repos`
List all repositories connected to the hub.
```bash
devac query repos
devac query repos --verbose
```

### `devac query symbol`
Search for symbols across all connected repos.
```bash
devac query symbol UserService --all-repos
devac query symbol authenticate --kind function
```

### `devac query`
Cross-repo queries using the unified Seeds database. Queries all repos by default.
```bash
devac query "SELECT repo, file_path, name FROM symbols WHERE name = 'authenticate' ORDER BY repo"
devac query "SELECT DISTINCT repo FROM symbols"
```

### `devac context`
Get current worktree and issue context.
```bash
devac context
devac context ci    # CI status across repos
devac context review  # Generate review prompt
```

## Example Interactions

**User:** "Show me the workspace status"

**Response approach:**
1. Use `devac status --hub` for hub health
2. Use `devac query repos` to enumerate all repos
3. Show repo names, paths, and analysis status

**User:** "Find all implementations of UserService across repos"

**Response approach:**
1. Use `devac query symbol UserService --all-repos`
2. Group results by repository
3. Show file paths and line numbers for each

**User:** "What repos depend on the shared-utils package?"

**Response approach:**
1. Use `devac query` to search for import references
2. Group by repository
3. Show dependency chain

## Hub Mode Architecture

```
DevAC Hub
├── monorepo-3.0/           # Backend microservices
├── app/                     # Mobile app
├── frontend-monorepo/       # Web frontends
├── public-website-3/        # Marketing site
└── npm-private-packages/    # Shared packages
```

### How Hub Works
- Single SQLite database aggregates Seeds from all repos
- Cross-repo queries are instant (no re-indexing)
- Each repo maintains its own analysis but contributes to hub
- Changes in one repo can show impact on others

## MCP Tools (Alternative)

If MCP server is configured, these tools provide equivalent functionality:

### `list_repos`
```
list_repos()
```

### `get_context`
```
get_context()
```

### `find_symbol`
```
find_symbol(name: "UserService")  // searches all repos
```

### `query_sql`
```sql
SELECT repo, file_path, name
FROM symbols
WHERE name = 'authenticate'
ORDER BY repo
```

## Setup Requirements

1. Initialize the hub: `devac sync` (automatic)
2. Analyze each repo: `devac sync` (from each repo)
3. Repos with seeds are auto-discovered for hub queries
4. Query across repos via CLI or MCP

## Notes

- Hub mode requires initial setup but enables powerful cross-repo analysis
- Re-analyze repos after significant changes
- Large workspaces may have slower initial indexing
- The hub database is stored in `{workspace}/.devac/`
- CLI and MCP share the same devac-core implementation and return identical results
