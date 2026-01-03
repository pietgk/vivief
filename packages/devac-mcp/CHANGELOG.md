# @pietgk/devac-mcp

## 0.13.1

### Patch Changes

- @pietgk/devac-core@0.13.1

## 0.13.0

### Patch Changes

- @pietgk/devac-core@0.13.0

## 0.12.2

### Patch Changes

- @pietgk/devac-core@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [fb1410f]
  - @pietgk/devac-core@0.12.1

## 0.12.0

### Patch Changes

- @pietgk/devac-core@0.12.0

## 0.11.0

### Minor Changes

- 90b02f0: Implement Single Writer Architecture for hub database access

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

### Patch Changes

- Updated dependencies [90b02f0]
  - @pietgk/devac-core@0.11.0

## 0.10.0

### Patch Changes

- @pietgk/devac-core@0.10.0

## 0.9.0

### Patch Changes

- @pietgk/devac-core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [72b6800]
  - @pietgk/devac-core@0.8.0

## 0.7.1

### Patch Changes

- 44b0358: Fix schema column names and SQL queries in MCP tools

  - Update `get_schema` to return actual parquet column names instead of simplified names that caused query failures
  - Fix `get_file_symbols` to use `file_path` instead of `source_file` in both PackageDataProvider and HubDataProvider
  - Add effects table transforms to `querySql()` so `query_effects` works correctly with the `{effects}` placeholder
  - @pietgk/devac-core@0.7.1

## 0.7.0

### Minor Changes

- 31f0d38: feat: add workspace analysis status and enhanced hub registration

  - Add seed state detection per package (none/base/delta/both)
  - Add comprehensive workspace status computation
  - Enhance `devac status` with seed status section and `--seeds-only` flag
  - Enhance `devac hub register` with `--analyze` and `--all` flags
  - Add MCP `get_workspace_status` tool for AI assistant integration
  - Fix entity ID generation to use relative file paths for deterministic results across git worktrees

### Patch Changes

- Updated dependencies [31f0d38]
  - @pietgk/devac-core@0.7.0

## 0.6.1

### Patch Changes

- 08a1e92: Fix --version flag to exit immediately instead of starting the server

  The CLI was missing version handling - when passed --version, it would ignore
  the flag and start the MCP server instead. Now it prints the version and exits.

  - @pietgk/devac-core@0.6.1

## 0.6.0

### Minor Changes

- 968e5c2: Synchronize all package versions and improve workspace discovery

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

### Patch Changes

- Updated dependencies [968e5c2]
  - @pietgk/devac-core@0.6.0

## 0.4.1

### Patch Changes

- Updated dependencies [936dfb0]
  - @pietgk/devac-core@0.5.0

## 0.4.0

### Minor Changes

- 082e7c0: Integrate effect extraction, rules engine, and C4 diagrams into full pipeline

  **Core:**

  - TypeScript parser now extracts code effects (function calls, store operations, external requests)
  - Effects written to `.devac/seed/base/effects.parquet` during analysis

  **CLI:**

  - Add `devac effects` command to query code effects
  - Add `devac rules` command to run rules engine and produce domain effects
  - Add `devac c4` command to generate C4 architecture diagrams (PlantUML/Mermaid/JSON)

  **MCP:**

  - Add `query_effects` tool for querying code effects from seeds
  - Add `run_rules` tool for running rules engine on effects
  - Add `list_rules` tool for listing available rules
  - Add `generate_c4` tool for generating C4 diagrams

  **Documentation:**

  - Add effects table schema to data model docs
  - Add rules engine implementation guide
  - Add C4 generator (views) implementation guide
  - Update CLI reference with new commands

### Patch Changes

- Updated dependencies [082e7c0]
  - @pietgk/devac-core@0.4.0

## 0.3.1

### Patch Changes

- a426cd5: Add workspace auto-detection and readOnly mode for hub operations

  ### @pietgk/devac-core

  - Add `readOnly` option to `CentralHub` for read-only database access
  - Auto-fallback to readOnly mode when database is locked by another process
  - Add `readOnly` option to `HubStorage.init()` for explicit access control

  ### @pietgk/devac-cli

  - Hub commands now auto-detect workspace hub directory using git-based conventions
  - Add helpful error suggestions for common issues (lock conflicts, missing seeds, etc.)
  - Read-only commands (status, list, errors, diagnostics, summary) use readOnly mode to avoid lock conflicts

  ### @pietgk/devac-mcp

  - MCP server now uses readOnly mode by default to prevent DuckDB lock conflicts with CLI

- Updated dependencies [2e3e162]
- Updated dependencies [6a218a7]
- Updated dependencies [2a0f2bd]
- Updated dependencies [a426cd5]
- Updated dependencies [802f0e5]
- Updated dependencies [13fb888]
- Updated dependencies [2b1b353]
  - @pietgk/devac-core@0.3.0

## 0.3.0

### Minor Changes

- 09212d3: Add context discovery, CI status, review prompts, and multi-repo worktree support

  **@pietgk/devac-core:**

  - Add context discovery module for sibling repo and issue worktree detection
  - Add CI status checking via GitHub CLI integration
  - Add review prompt generation for LLM-assisted code review
  - Add cross-repo detection utilities

  **@pietgk/devac-worktree:**

  - Add `--also <repo>` flag for creating worktrees in sibling repos
  - Add `--repos <repos>` flag for parent directory workflow
  - Add `--issue-wide` flag to status command for cross-repo view
  - Support parent directory mode for multi-repo development

  **@pietgk/devac-cli:**

  - Add `devac context` command for context discovery
  - Add `devac context ci` command for CI status checking across repos
  - Add `devac context review` command for generating LLM review prompts

  **@pietgk/devac-mcp:**

  - Add `get_context` tool for AI assistant context discovery
  - Add `list_repos` tool for listing registered repositories
  - Add intelligent context caching with 30-second TTL

### Patch Changes

- Updated dependencies [09212d3]
  - @pietgk/devac-core@0.2.0

## 0.2.0

### Minor Changes

- be91895: Add hub mode support to MCP server for federated cross-repository queries.

  - Add `--hub` flag (default) for hub mode that queries across all registered repositories
  - Add `--package` flag for single package mode (mutually exclusive with `--hub`)
  - Add `list_repos` tool to list registered repositories (hub mode only)
  - Add DataProvider abstraction for unified query interface across modes
  - Update `query_sql` to query all seeds from registered repos in hub mode

### Patch Changes

- Updated dependencies [23e65a2]
  - @pietgk/devac-core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [144f370]
  - @pietgk/devac-core@0.1.1
