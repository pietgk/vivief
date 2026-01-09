---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
"@pietgk/devac-mcp": minor
---

feat(call-graph): implement maxDepth parameter for recursive call graph traversal

The `get_call_graph` MCP tool and `devac call-graph` CLI command now support recursive traversal up to the specified `maxDepth` parameter (default: 3).

- `maxDepth: 1` returns only direct callers/callees
- `maxDepth: 2` returns direct + their callers/callees
- `maxDepth: 3` returns 3 levels deep
- Cycle detection prevents infinite loops
- Works in both hub mode and package mode

Implementation uses DuckDB's `WITH RECURSIVE` CTE for efficient single-query traversal with path-based cycle detection.

Closes #146
