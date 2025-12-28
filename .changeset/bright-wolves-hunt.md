---
"@pietgk/devac-core": minor
"@pietgk/devac-mcp": minor
"@pietgk/devac-cli": minor
"@pietgk/devac-worktree": minor
"@pietgk/devac-eval": minor
---

Synchronize all package versions and improve workspace discovery

This release introduces fixed versioning - all DevAC packages now share the same version number.

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

**devac-eval:**
- Add `publishConfig` for GitHub Packages publishing
- Switch from hardcoded version to dynamic version from package.json

**devac-worktree:**
- Switch from hardcoded version to dynamic version from package.json

**Release Infrastructure:**
- Enable fixed versioning across all packages
- Add prebuild scripts for consistent version generation
- Improve CI workflow for version file generation
