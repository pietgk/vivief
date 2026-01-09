# Plan: Implement maxDepth parameter for recursive call graph traversal

> **Issue:** [#146](https://github.com/pietgk/vivief/issues/146)
> **Status:** COMPLETED
> **Created:** 2026-01-09

## From Issue

### Summary
The `get_call_graph` MCP tool accepts a `maxDepth` parameter but currently only returns direct callers/callees (1 level deep). Need to implement recursive traversal to answer questions like "What are all functions transitively called by X?"

### Acceptance Criteria
- `maxDepth: 1` returns only direct callees/callers
- `maxDepth: 2` returns direct + their callees/callers
- `maxDepth: 3` returns 3 levels deep
- Cycle detection prevents infinite loops
- Works in both hub mode and package mode

### Dependencies
- Issue #141 (CALLS edge resolution) - **COMPLETED** ✅

### Comment Context
> "Depends on #141 - recursive traversal needs resolved CALLS edges to work properly"

## Implementation Plan

### Files to Modify

| File | Change |
|------|--------|
| `packages/devac-mcp/src/data-provider.ts` | Update `getCallGraph()` with recursive CTE |
| `packages/devac-cli/src/commands/call-graph.ts` | Verify CLI passes maxDepth correctly |

### Approach: Recursive CTEs in DuckDB

Use DuckDB's WITH RECURSIVE to traverse the call graph:

```sql
WITH RECURSIVE call_chain(source_entity_id, target_entity_id, level, path) AS (
  -- Base case: direct calls from the starting function
  SELECT
    e.source_entity_id,
    e.target_entity_id,
    1 as level,
    ARRAY[e.source_entity_id, e.target_entity_id] as path
  FROM edges e
  WHERE e.source_entity_id = ?
  AND e.edge_type = 'CALLS'

  UNION ALL

  -- Recursive case: calls from functions we've found
  SELECT
    e.source_entity_id,
    e.target_entity_id,
    c.level + 1,
    array_append(c.path, e.target_entity_id)
  FROM edges e
  JOIN call_chain c ON e.source_entity_id = c.target_entity_id
  WHERE e.edge_type = 'CALLS'
  AND c.level < ?  -- maxDepth parameter
  AND NOT array_contains(c.path, e.target_entity_id)  -- Prevent cycles
)
SELECT DISTINCT
  cc.target_entity_id,
  cc.level,
  n.name,
  n.kind,
  n.file_path
FROM call_chain cc
JOIN nodes n ON cc.target_entity_id = n.entity_id
ORDER BY cc.level, n.name;
```

### Tasks

- [x] 1. Read current implementation in data-provider.ts
- [x] 2. Update getCallGraph() for callees direction with recursive CTE
- [x] 3. Update getCallGraph() for callers direction with recursive CTE
- [x] 4. Update getCallGraph() for "both" direction
- [x] 5. Verify CLI command passes maxDepth parameter correctly
- [x] 6. Update CLI to display depth info in output
- [x] 7. Run full test suite to ensure no regressions (315 passed)
