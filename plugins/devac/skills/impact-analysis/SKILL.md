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

## CLI Commands (Primary)

Use DevAC CLI commands for impact analysis. CLI is preferred for lower context overhead.

### `devac query affected`
Get files that would be affected by changes to a specific file.
```bash
devac query affected src/core/auth.ts
devac query affected src/services/user.ts --depth 2
```

### `devac query deps`
Get dependencies of a specific file or symbol.
```bash
devac query deps src/services/user.ts
devac query deps src/core/auth.ts --direction both
```

### `devac call-graph`
Get the call graph for a specific function or method.
```bash
devac call-graph validateUser --depth 3
devac call-graph login --direction callers
```

### `devac query`
Advanced queries for complex dependency analysis.
```bash
devac query "SELECT DISTINCT callee_symbol, callee_file FROM calls WHERE caller_file = 'src/core/auth.ts'"
```

## Example Interactions

**User:** "What will be affected if I change the UserService class?"

**Response approach:**
1. Use `devac query affected src/services/user.ts` to find impacted files
2. Use `devac call-graph UserService` to show function-level impact
3. Present a summary of the blast radius with risk assessment

**User:** "Show me the call graph for the login function"

**Response approach:**
1. Use `devac query symbol login` to locate the function
2. Use `devac call-graph login --depth 3`
3. Visualize the call chain (callers and callees)

**User:** "What are the dependencies of the payment module?"

**Response approach:**
1. Use `devac query deps src/payment/` on payment module files
2. Categorize into internal vs external dependencies
3. Highlight any circular dependencies

## MCP Tools (Alternative)

If MCP server is configured, these tools provide equivalent functionality:

### `get_affected`
```
get_affected(file_path: "src/core/auth.ts")
```

### `get_dependencies`
```
get_dependencies(file_path: "src/services/user.ts")
```

### `get_call_graph`
```
get_call_graph(symbol: "validateUser", depth: 3)
```

### `query_sql`
```sql
SELECT DISTINCT callee_symbol, callee_file
FROM calls
WHERE caller_file = 'src/core/auth.ts'
```

## Notes

- Impact analysis is most accurate after recent `devac sync`
- Consider running analysis before major refactoring
- Cross-repo impact is available when using hub mode
- Large blast radius may indicate tight coupling
- CLI and MCP share the same devac-core implementation and return identical results
