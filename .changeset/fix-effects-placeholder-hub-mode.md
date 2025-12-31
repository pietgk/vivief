---
"@pietgk/devac-core": patch
---

Fix {effects} placeholder replacement in hub mode queries

The `queryMultiplePackages()` function was missing the `{effects}` placeholder
replacement, causing MCP tools like `query_effects`, `run_rules`, and `generate_c4`
to fail with SQL syntax errors when running in hub mode.

Added `effectsPaths` collection alongside existing `nodePaths`, `edgePaths`, and
`refPaths`, and added the corresponding `.replace(/{effects}/g, ...)` to the
SQL processing chain.
