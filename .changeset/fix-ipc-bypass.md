---
"@pietgk/devac-cli": patch
"@pietgk/devac-core": patch
---

Fix CLI commands bypassing HubClient IPC routing

- All CLI commands now use `createHubClient()` instead of direct `CentralHub` access
- Added `pushValidationErrors()` to HubClient with IPC support
- Added `HubLike` type for sync functions accepting either CentralHub or HubClient
- Commands properly route through MCP when running, with fallback to direct hub access

This fixes DuckDB lock errors that occurred when running CLI commands while MCP server was active.
