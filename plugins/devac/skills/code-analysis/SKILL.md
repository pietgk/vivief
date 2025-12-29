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

## CLI Commands (Primary)

Use DevAC CLI commands for code analysis. CLI is preferred for lower context overhead.

### `devac find-symbol`
Find symbols by name across all indexed repositories.
```bash
devac find-symbol UserService
devac find-symbol --kind class Controller
```

### `devac file-symbols`
Get all symbols defined in a specific file or directory.
```bash
devac file-symbols src/services/user.ts
devac file-symbols src/auth/
```

### `devac query`
Run SQL queries against the Seeds database for advanced analysis.
```bash
devac query "SELECT name, kind, file_path FROM symbols WHERE kind = 'class' ORDER BY name"
devac query "SELECT * FROM symbols WHERE name LIKE '%UserService%'"
```

## Example Interactions

**User:** "What functions are defined in the auth module?"

**Response approach:**
1. Use `devac file-symbols src/auth/` to list all symbols
2. Filter for functions in the output
3. Present a structured list of functions with their signatures

**User:** "Show me the class hierarchy for BaseController"

**Response approach:**
1. Find the BaseController class with `devac find-symbol BaseController`
2. Query for classes that extend it using `devac query`
3. Present the inheritance tree

## MCP Tools (Alternative)

If MCP server is configured, these tools provide equivalent functionality:

### `find_symbol`
```
find_symbol(name: "UserService")
```

### `get_file_symbols`
```
get_file_symbols(file_path: "src/services/user.ts")
```

### `query_sql`
```sql
SELECT name, kind, file_path
FROM symbols
WHERE kind = 'class'
ORDER BY name
```

## Notes

- Requires DevAC hub to be initialized (`devac hub init`)
- Repository must be analyzed (`devac analyze .`)
- Works across all repositories connected to the hub
- CLI and MCP share the same devac-core implementation and return identical results
