# Codebase Navigation Skill

Navigate and explore the codebase structure using DevAC's Analytics Layer.

## Triggers

This skill activates when users ask about:
- "find where X is defined"
- "explore module"
- "locate definition"
- "navigate to"
- "where is this function"
- "jump to definition"
- "show me the structure"

## Capabilities

### Symbol Location
Quickly find where any symbol is defined across the entire codebase.

### Module Exploration
Understand the structure and contents of modules/packages.

### Cross-Repository Navigation
Navigate between related code across multiple repositories.

### File Discovery
Find files by patterns, symbols they contain, or relationships.

## CLI Commands (Primary)

Use DevAC CLI commands for codebase navigation. CLI is preferred for lower context overhead.

### `devac query symbol`
Locate symbol definitions by name.
```bash
devac query symbol handleAuthentication
devac query symbol UserService --kind class
```

### `devac file-symbols`
Explore all symbols in a file or directory.
```bash
devac file-symbols src/auth/index.ts
devac file-symbols src/services/
```

### `devac query repos`
See all repositories connected to the hub.
```bash
devac query repos
devac status --hub
```

### `devac query`
Advanced navigation queries.
```bash
devac query "SELECT file_path, name, kind FROM symbols WHERE file_path LIKE '%/auth/%' ORDER BY file_path, line"
```

## Example Interactions

**User:** "Where is the UserService defined?"

**Response approach:**
1. Use `devac query symbol UserService` to locate it
2. Return the exact file path and line number
3. Optionally show the class structure

**User:** "Explore the auth module structure"

**Response approach:**
1. Use `devac file-symbols src/auth/` for all symbols
2. Present a tree view of the module structure
3. Highlight key classes and functions

**User:** "Find all API endpoint handlers"

**Response approach:**
1. Use `devac query` to find functions with handler patterns
2. Group by file/module
3. Present organized list with locations

## MCP Tools (Alternative)

If MCP server is configured, these tools provide equivalent functionality:

### `find_symbol`
```
find_symbol(name: "handleAuthentication")
```

### `get_file_symbols`
```
get_file_symbols(file_path: "src/auth/index.ts")
```

### `list_repos`
```
list_repos()
```

### `query_sql`
```sql
SELECT file_path, name, kind
FROM symbols
WHERE file_path LIKE '%/auth/%'
ORDER BY file_path, line
```

## Navigation Tips

- Use exact symbol names for precise matches
- Use patterns for broader exploration
- Cross-reference with `impact-analysis` to understand context
- In hub mode, navigation works across all connected repos

## Notes

- Navigation is instant with indexed Seeds database
- Stale indexes may miss recent changes - run `devac sync` to update
- Works best with well-named, conventional code
- CLI and MCP share the same devac-core implementation and return identical results
