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

## MCP Tools Used

This skill leverages the DevAC MCP server tools:

### `list_repos`
List all repositories connected to the hub.
```
list_repos()
```

### `get_context`
Get the current DevAC context including hub status.
```
get_context()
```

### `find_symbol`
Search for symbols across all connected repos.
```
find_symbol(name: "UserService")  // searches all repos
```

### `query_sql`
Cross-repo queries using the unified Seeds database.
```sql
SELECT repo, file_path, name
FROM symbols
WHERE name = 'authenticate'
ORDER BY repo
```

## Example Interactions

**User:** "Show me the workspace status"

**Response approach:**
1. Use `list_repos` to enumerate all repos
2. Use `get_context` for hub health
3. Show repo names, paths, and analysis status

**User:** "Find all implementations of UserService across repos"

**Response approach:**
1. Use `find_symbol` to search all repos
2. Group results by repository
3. Show file paths and line numbers for each

**User:** "What repos depend on the shared-utils package?"

**Response approach:**
1. Query the Seeds database for import references
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

## CLI Fallback

If MCP is unavailable, fall back to CLI commands:
```bash
devac hub status
devac hub repos
devac find UserService --all-repos
devac query "SELECT DISTINCT repo FROM symbols" --hub
```

## Setup Requirements

1. Initialize the hub: `devac hub init`
2. Add repositories: `devac hub add ../repo-path`
3. Analyze each repo: `devac analyze .` (from each repo)
4. Query across repos via MCP or CLI

## Notes

- Hub mode requires initial setup but enables powerful cross-repo analysis
- Re-analyze repos after significant changes
- Large workspaces may have slower initial indexing
- The hub database is stored in `~/.devac/hub.db`
