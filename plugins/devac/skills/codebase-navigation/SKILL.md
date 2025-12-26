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

## MCP Tools Used

This skill leverages the DevAC MCP server tools:

### `find_symbol`
Locate symbol definitions by name.
```
find_symbol(name: "handleAuthentication")
```

### `get_file_symbols`
Explore all symbols in a file.
```
get_file_symbols(file_path: "src/auth/index.ts")
```

### `list_repos`
See all repositories connected to the hub.
```
list_repos()
```

### `query_sql`
Advanced navigation queries.
```sql
SELECT file_path, name, kind
FROM symbols
WHERE file_path LIKE '%/auth/%'
ORDER BY file_path, line
```

## Example Interactions

**User:** "Where is the UserService defined?"

**Response approach:**
1. Use `find_symbol` to locate UserService
2. Return the exact file path and line number
3. Optionally show the class structure

**User:** "Explore the auth module structure"

**Response approach:**
1. Query for all files in the auth directory
2. Use `get_file_symbols` on key files
3. Present a tree view of the module structure

**User:** "Find all API endpoint handlers"

**Response approach:**
1. Use `query_sql` to find functions with handler patterns
2. Group by file/module
3. Present organized list with locations

## CLI Fallback

If MCP is unavailable, fall back to CLI commands:
```bash
devac find UserService
devac symbols src/auth/
devac query "SELECT file_path, name FROM symbols WHERE kind = 'function' AND name LIKE '%Handler%'"
```

## Navigation Tips

- Use exact symbol names for precise matches
- Use patterns for broader exploration
- Cross-reference with `impact-analysis` to understand context
- In hub mode, navigation works across all connected repos

## Notes

- Navigation is instant with indexed Seeds database
- Stale indexes may miss recent changes - run `devac analyze` to update
- Works best with well-named, conventional code
