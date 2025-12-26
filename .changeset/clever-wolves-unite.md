---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
"@pietgk/devac-mcp": patch
---

Add workspace auto-detection and readOnly mode for hub operations

### @pietgk/devac-core

- Add `readOnly` option to `CentralHub` for read-only database access
- Auto-fallback to readOnly mode when database is locked by another process
- Add `readOnly` option to `HubStorage.init()` for explicit access control

### @pietgk/devac-cli

- Hub commands now auto-detect workspace hub directory using git-based conventions
- Add helpful error suggestions for common issues (lock conflicts, missing seeds, etc.)
- Read-only commands (status, list, errors, diagnostics, summary) use readOnly mode to avoid lock conflicts

### @pietgk/devac-mcp

- MCP server now uses readOnly mode by default to prevent DuckDB lock conflicts with CLI
