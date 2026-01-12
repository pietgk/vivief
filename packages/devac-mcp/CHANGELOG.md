# @pietgk/devac-mcp

## 0.24.2

### Patch Changes

- Updated dependencies [115117c]
  - @pietgk/devac-core@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies [7e2ffd7]
  - @pietgk/devac-core@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [9ed3526]
  - @pietgk/devac-core@0.24.0

## 0.23.1

### Patch Changes

- 8dfe4ea: fix(mcp): Fix broken MCP tools - query_sql and get_workspace_status

  **Root causes and fixes:**

  1. **Workspace status silent failures**: Hub connection errors were silently swallowed by an empty catch block. Now surfaces errors via new `hubError` field in `WorkspaceStatus`.

  2. **Package path resolution**: `getPackagePaths()` was returning repository paths instead of actual package paths. Now reads `.devac/manifest.json` to extract real package paths.

  3. **Overly-restrictive path validation**: `checkForRootSeeds()` filtered out any path containing `.git`, breaking single-package repos where seeds live at repo root. Removed this validation - the unified query system now trusts all provided paths (caller is responsible for valid paths from manifest).

  4. **Misleading schema documentation**: `get_schema` incorrectly implied hub tables (repo_registry, validation_errors, unified_diagnostics) were SQL-queryable. Updated descriptions to clarify these require dedicated MCP tools.

  **Impact:**

  - `query_sql` now works correctly for single-package repos
  - `get_workspace_status` now reports hub errors instead of showing "unregistered"
  - `get_schema` output is now accurate about what's SQL-queryable

  Closes #148

- Updated dependencies [8dfe4ea]
  - @pietgk/devac-core@0.23.1

## 0.23.0

### Minor Changes

- 5b814fe: feat(call-graph): implement maxDepth parameter for recursive call graph traversal

  The `get_call_graph` MCP tool and `devac call-graph` CLI command now support recursive traversal up to the specified `maxDepth` parameter (default: 3).

  - `maxDepth: 1` returns only direct callers/callees
  - `maxDepth: 2` returns direct + their callers/callees
  - `maxDepth: 3` returns 3 levels deep
  - Cycle detection prevents infinite loops
  - Works in both hub mode and package mode

  Implementation uses DuckDB's `WITH RECURSIVE` CTE for efficient single-query traversal with path-based cycle detection.

  Closes #146

### Patch Changes

- Updated dependencies [5b814fe]
  - @pietgk/devac-core@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [d800467]
  - @pietgk/devac-core@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [d46c52e]
  - @pietgk/devac-core@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [abc21d2]
  - @pietgk/devac-core@0.21.0

## 0.20.0

### Minor Changes

- e33dfa5: feat(hub): improve hub location UX and make hub mode default

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

### Patch Changes

- Updated dependencies [e33dfa5]
  - @pietgk/devac-core@0.20.0

## 0.19.1

### Patch Changes

- Updated dependencies [ac0ea74]
  - @pietgk/devac-core@0.19.1

## 0.19.0

### Patch Changes

- eb2364b: feat(core): Add unified query system with packages array abstraction

  - Implements unified `query()` function that takes a packages array as the key abstraction
  - Query level is implicit from array contents: 1 package = package-level, multiple = repo/workspace
  - Adds root-seed validation: warns and skips seeds found at repo root with .git (prevents stale seed issues)
  - Rewrites `setupQueryContext()` and `queryMultiplePackages()` as backwards-compatible wrappers
  - All existing tests pass (1367 tests across devac-core and devac-cli)

  fix(mcp): Update to use shared devac-core hub implementation

  This addresses issue #121 where devac-mcp was not fully using the shared devac-core implementation.

- Updated dependencies [eb2364b]
  - @pietgk/devac-core@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [f0806b8]
  - @pietgk/devac-core@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5c08659]
  - @pietgk/devac-core@0.18.0

## 0.17.1

### Patch Changes

- Updated dependencies [aa9bc14]
  - @pietgk/devac-core@0.17.1

## 0.17.0

### Patch Changes

- Updated dependencies [d74e32d]
  - @pietgk/devac-core@0.17.0

## 0.16.1

### Patch Changes

- Updated dependencies [97c3a2f]
  - @pietgk/devac-core@0.16.1

## 0.16.0

### Patch Changes

- Updated dependencies [ec1f6e0]
  - @pietgk/devac-core@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [8e86197]
  - @pietgk/devac-core@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [b63a413]
  - @pietgk/devac-core@0.15.0

## 0.14.2

### Patch Changes

- Updated dependencies [2d787a0]
  - @pietgk/devac-core@0.14.2

## 0.14.1

### Patch Changes

- @pietgk/devac-core@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [797ec98]
  - @pietgk/devac-core@0.14.0

## 0.13.3

### Patch Changes

- Updated dependencies [190116a]
  - @pietgk/devac-core@0.13.3

## 0.13.2

### Patch Changes

- 73960ba: Fix MCP server socket conflict when multiple Claude CLI sessions start in same workspace

  - Add dual-mode support: detect existing MCP server and use client mode instead of failing
  - Add auto-promotion: when owner MCP shuts down, client promotes to server mode
  - Update all hub-dependent methods to work in both server and client modes
  - @pietgk/devac-core@0.13.2

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
