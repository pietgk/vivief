---
"@pietgk/devac-core": minor
"@pietgk/devac-mcp": minor
"@pietgk/devac-cli": patch
---

Fix MCP server hub directory discovery to use workspace instead of homedir

**devac-core:**
- Add `findGitRoot()` to walk up directory tree and find git repository root
- Add `findWorkspaceDir()` to find workspace from any location (workspace dir, repo root, or subdirectory inside repo)
- Add `findWorkspaceHubDir()` to get the hub directory path for a workspace

**devac-mcp:**
- **BREAKING:** `createDataProvider()` is now async
- **BREAKING:** `HubDataProvider` constructor no longer defaults `hubDir` to `~/.devac`
- Hub directory is now auto-detected from workspace when not explicitly provided
- Clear error message when run outside a workspace without `--hub-dir` flag

**devac-cli:**
- Workspace discovery functions now re-exported from devac-core for consistency
