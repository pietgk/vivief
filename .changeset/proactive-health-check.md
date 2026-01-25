---
"@pietgk/devac-cli": minor
"@pietgk/devac-core": minor
---

Add proactive health check with guided recovery

Running `devac` now proactively detects and offers to fix common issues:

- Multiple MCP processes running (should be 0 or 1)
- Stale socket file (exists but nothing listening)
- Stale PID file (exists but process is dead)
- Protocol version mismatch between CLI and MCP

New CLI flags:
- `--heal`: Auto-fix issues without prompting
- `--skip-health`: Skip health check entirely

In interactive mode, users are prompted before fixes are applied. In non-interactive mode, a warning is shown with hints.
