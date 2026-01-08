---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
"@pietgk/devac-mcp": minor
---

feat(hub): improve hub location UX and make hub mode default

**Breaking Change:** The `--hub` flag has been removed from all CLI commands. Hub mode is now the default - all commands query the workspace hub automatically.

### New Features

- **Hub Location Validation**: Hubs can no longer be created inside git repositories. Clear error messages guide users to the correct workspace-level location.
- **Doctor Checks**: New `devac doctor` checks detect misplaced hubs and duplicate hub databases inside git repos.
- **MCP Warnings**: MCP server startup warns when connected to an invalid or empty hub.

### Migration

If you have scripts using `--hub` flag, simply remove the flag - hub mode is now the default.

If you have a hub inside a git repo:
1. Run `devac doctor` to detect the issue
2. Remove the misplaced hub: `rm -rf <repo>/.devac/central.duckdb`
3. The workspace-level hub at `<workspace>/.devac/` remains intact
