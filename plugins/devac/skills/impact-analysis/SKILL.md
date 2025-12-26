# Impact Analysis Skill

Determine what code changes will affect and find dependencies using DevAC's Analytics Layer.

## Triggers

This skill activates when users ask about:
- "what will this affect"
- "find dependencies"
- "impact of change"
- "call graph"
- "who calls this function"
- "what uses this"
- "ripple effect"

## Capabilities

### Affected Files Analysis
Determine which files would be impacted by changes to a specific file or symbol.

### Dependency Graphs
Trace dependencies both upstream (what this depends on) and downstream (what depends on this).

### Call Graph Exploration
Understand how functions call each other throughout the codebase.

### Change Impact Assessment
Before making changes, understand the blast radius.

## MCP Tools Used

This skill leverages the DevAC MCP server tools:

### `get_affected`
Get files that would be affected by changes to a specific file.
```
get_affected(file_path: "src/core/auth.ts")
```

### `get_dependencies`
Get dependencies of a specific file or symbol.
```
get_dependencies(file_path: "src/services/user.ts")
```

### `get_call_graph`
Get the call graph for a specific function or method.
```
get_call_graph(symbol: "validateUser", depth: 3)
```

### `query_sql`
Advanced queries for complex dependency analysis.
```sql
SELECT DISTINCT callee_symbol, callee_file
FROM calls
WHERE caller_file = 'src/core/auth.ts'
```

## Example Interactions

**User:** "What will be affected if I change the UserService class?"

**Response approach:**
1. Use `get_affected` to find impacted files
2. Use `get_call_graph` to show function-level impact
3. Present a summary of the blast radius with risk assessment

**User:** "Show me the call graph for the login function"

**Response approach:**
1. Use `find_symbol` to locate the login function
2. Use `get_call_graph` with appropriate depth
3. Visualize the call chain (callers and callees)

**User:** "What are the dependencies of the payment module?"

**Response approach:**
1. Use `get_dependencies` on payment module files
2. Categorize into internal vs external dependencies
3. Highlight any circular dependencies

## CLI Fallback

If MCP is unavailable, fall back to CLI commands:
```bash
devac affected src/core/auth.ts
devac deps src/services/user.ts
devac call-graph validateUser --depth 3
```

## Notes

- Impact analysis is most accurate after recent `devac analyze`
- Consider running analysis before major refactoring
- Cross-repo impact is available when using hub mode
- Large blast radius may indicate tight coupling
