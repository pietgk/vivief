---
"@pietgk/devac-mcp": patch
---

Fix --version flag to exit immediately instead of starting the server

The CLI was missing version handling - when passed --version, it would ignore
the flag and start the MCP server instead. Now it prints the version and exits.
