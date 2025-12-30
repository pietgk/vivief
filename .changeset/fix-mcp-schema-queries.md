---
"@pietgk/devac-mcp": patch
---

Fix schema column names and SQL queries in MCP tools

- Update `get_schema` to return actual parquet column names instead of simplified names that caused query failures
- Fix `get_file_symbols` to use `file_path` instead of `source_file` in both PackageDataProvider and HubDataProvider
- Add effects table transforms to `querySql()` so `query_effects` works correctly with the `{effects}` placeholder
