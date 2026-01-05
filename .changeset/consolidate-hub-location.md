---
"@pietgk/devac-cli": minor
"@pietgk/devac-core": minor
---

Consolidate hub location to workspace-only mode

**Breaking Change:** DevAC now requires a workspace context. The `--hub-dir` option has been removed from all CLI commands.

- All hub operations now use `{workspace}/.devac` automatically
- Removed `getDefaultHubDir()` fallback to `~/.devac`
- Made `hubDir` required in `HubClient` constructor
- Added helpful error message when not in a workspace context suggesting `devac workspace init`

This change ensures consistent hub usage across CLI and MCP, preventing DuckDB corruption from multiple hub databases.
