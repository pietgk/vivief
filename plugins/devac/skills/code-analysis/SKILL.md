# Code Analysis Skill

Analyze code structure, find symbols, and explore hierarchies using DevAC's Analytics Layer.

## Triggers

This skill activates when users ask about:
- "analyze code"
- "find functions"
- "show hierarchy"
- "code structure"
- "what functions are in this file"
- "show me the classes"

## Capabilities

### Symbol Discovery
Find and explore symbols (functions, classes, methods, variables) across the codebase.

### Hierarchy Analysis
Understand inheritance, composition, and module structure.

### Code Structure
Get an overview of how code is organized within files and across the project.

## MCP Tools Used

This skill leverages the DevAC MCP server tools:

### `find_symbol`
Find symbols by name across all indexed repositories.
```
find_symbol(name: "UserService")
```

### `get_file_symbols`
Get all symbols defined in a specific file.
```
get_file_symbols(file_path: "src/services/user.ts")
```

### `query_sql`
Run SQL queries against the Seeds database for advanced analysis.
```sql
SELECT name, kind, file_path 
FROM symbols 
WHERE kind = 'class'
ORDER BY name
```

## Example Interactions

**User:** "What functions are defined in the auth module?"

**Response approach:**
1. Use `find_symbol` to locate auth-related symbols
2. Use `get_file_symbols` on relevant files
3. Present a structured list of functions with their signatures

**User:** "Show me the class hierarchy for BaseController"

**Response approach:**
1. Find the BaseController class with `find_symbol`
2. Query for classes that extend it using `query_sql`
3. Present the inheritance tree

## CLI Fallback

If MCP is unavailable, fall back to CLI commands:
```bash
devac query "SELECT * FROM symbols WHERE name LIKE '%UserService%'"
devac symbols src/services/
```

## Notes

- Requires DevAC hub to be initialized (`devac hub init`)
- Repository must be analyzed (`devac analyze .`)
- Works across all repositories connected to the hub
