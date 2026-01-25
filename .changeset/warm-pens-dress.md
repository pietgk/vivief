---
"@pietgk/devac-core": patch
---

Auto-stop MCP on version mismatch for better DX

Previously, when CLI and MCP had incompatible protocol versions, users saw an error message telling them to manually run `devac mcp stop`. Now the CLI automatically stops the outdated MCP and falls back to direct hub access, so CLI updates work seamlessly.

Also added hub lock error patterns to enable graceful fallback when the hub database is locked.
