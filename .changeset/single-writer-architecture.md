---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
"@pietgk/devac-mcp": minor
---

Implement Single Writer Architecture for hub database access

**devac-core:**
- Add `HubClient` class for automatic routing (IPC when MCP running, direct otherwise)
- Add `HubServer` class for Unix socket IPC handling
- Add IPC protocol types (`HubRequest`, `HubResponse`, `HubMethod`)
- Export new classes from `hub/index.ts`

**devac-cli:**
- Update all hub commands to use `HubClient` instead of direct `CentralHub` access
- Commands now work seamlessly whether MCP is running or not

**devac-mcp:**
- MCP server now owns hub database exclusively in hub mode
- Starts `HubServer` to handle CLI requests via IPC
- Fixes "read-only mode" errors when CLI and MCP run concurrently
