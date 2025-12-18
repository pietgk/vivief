---
"@pietgk/devac-mcp": minor
---

Add hub mode support to MCP server for federated cross-repository queries.

- Add `--hub` flag (default) for hub mode that queries across all registered repositories
- Add `--package` flag for single package mode (mutually exclusive with `--hub`)
- Add `list_repos` tool to list registered repositories (hub mode only)
- Add DataProvider abstraction for unified query interface across modes
- Update `query_sql` to query all seeds from registered repos in hub mode
