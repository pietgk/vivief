---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
"@pietgk/devac-mcp": minor
---

feat: Robust MCP server lifecycle management

- Add IPC fallback in HubClient.dispatch() - when IPC fails with connection errors, falls back to direct hub access instead of failing
- Add version negotiation via ping method - CLI checks protocol version compatibility on first IPC call
- Add shutdown method for graceful MCP server termination via IPC
- Add PID file management for fallback kill mechanism
- Add `devac mcp stop` command with `--force` flag for killing unresponsive servers
- Add `devac mcp status` command to check if MCP is running and show version info
- Wire up shutdown callback in devac-mcp server for IPC-triggered shutdown
