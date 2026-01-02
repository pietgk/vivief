---
"@pietgk/devac-core": patch
---

Fix race condition where second MCP server would delete first server's socket

When multiple Claude CLI sessions started MCP servers, the second one would unconditionally delete the first's socket file during cleanup, then fail on the DB lock. This left the first MCP orphaned with no socket for IPC delegation.

Now `cleanupSocket()` checks if the socket is actively in use before deleting. If another MCP is listening, it throws a clear error instead of deleting the socket.
