---
"@pietgk/devac-mcp": patch
---

Fix MCP server socket conflict when multiple Claude CLI sessions start in same workspace

- Add dual-mode support: detect existing MCP server and use client mode instead of failing
- Add auto-promotion: when owner MCP shuts down, client promotes to server mode
- Update all hub-dependent methods to work in both server and client modes
