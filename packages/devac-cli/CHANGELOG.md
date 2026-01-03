# @pietgk/devac-cli

## 0.12.2

### Patch Changes

- 461fa8a: Fix doctor --fix to use workflow install-local command

  - Changed version-check.ts to delegate fix commands to `devac workflow install-local`
  - Updated formatters.ts to always show error details when fixes fail (not just with --verbose)

  This eliminates duplicate CLI linking logic and provides better error visibility.

- 22ce572: Add plugin-dev and plugin-global workflow commands for switching between local development and marketplace plugin modes
  - @pietgk/devac-core@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [fb1410f]
  - @pietgk/devac-core@0.12.1

## 0.12.0

### Minor Changes

- eee1a21: Add `devac doctor` command for diagnosing and fixing CLI/MCP issues

  New diagnostic command that checks system health and can automatically fix common issues:

  **Global checks (always run):**

  - CLI installation: devac, devac-mcp, devac-worktree availability and version consistency
  - Hub health: database initialization and queryability
  - MCP status: socket file presence and responsiveness

  **Workspace checks (when inside devac workspace):**

  - Package builds: dist/index.js existence for all packages
  - Plugin configuration: plugin.json and .mcp.json validity

  **Usage:**

  - `devac doctor` - Check health (dry-run, shows what would be fixed)
  - `devac doctor --fix` - Execute fixes automatically
  - `devac doctor --json` - Output as JSON for programmatic use
  - `devac doctor --verbose` - Show additional details

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

### Minor Changes

- 853b0ed: Add `devac effects verify` and `devac effects sync` commands for developer-maintained effect documentation.

  **New Commands:**

  - `devac effects verify` - Compares documented patterns in `docs/package-effects.md` against actual extracted effects. Reports unmapped patterns (in code but not documented) and stale patterns (documented but not in code).

  - `devac effects sync` - Generates `.devac/effect-mappings.ts` from `docs/package-effects.md` for custom effect classification during analysis.

  **Workflow:**

  1. Run `devac effects init` to create initial `docs/package-effects.md`
  2. Review and refine the documented patterns
  3. Run `devac effects verify` to check for gaps
  4. Run `devac effects sync` to generate TypeScript mappings

### Patch Changes

- 501245f: Fix effects verify parsing for patterns containing "Pattern"

  The `devac effects verify` command was incorrectly skipping patterns that contained the word "Pattern" in their name (e.g., `issuePattern.test`). This was because the header row detection used `line.includes("Pattern")` which matched patterns, not just table headers.

  Fixed by using a more specific regex `/^\|\s*Pattern\s*\|/` that only matches actual header rows starting with `| Pattern |`.

  - @pietgk/devac-core@0.10.0

## 0.9.0

### Minor Changes

- 52c6e77: Add live CI/workflow status to `devac status` command

  - Add WORKFLOW section showing live CI status from GitHub for all repos
  - Integrate getCIStatusForContext from devac-core for real-time CI data
  - Add --cached flag to skip live CI fetch (faster, uses hub cache only)
  - Add --sync flag to sync CI results to hub after gathering
  - Include CI failures in next steps suggestions

  This makes `devac status` the single deterministic command for all Four Pillars: Infrastructure, Validators, Extractors, and Workflow.

### Patch Changes

- @pietgk/devac-core@0.9.0

## 0.8.0

### Minor Changes

- c5d3301: Add `devac workflow` command group for deterministic development operations

  New commands that handle mechanical, repeatable tasks while leaving reasoning to the LLM:

  - `devac workflow check-changeset` - Check if changeset needed based on package changes
  - `devac workflow check-docs` - Validate documentation health (ADR index, format, package READMEs)
  - `devac workflow pre-commit` - Validate commit readiness (staged files, lint, types)
  - `devac workflow prepare-ship` - Full pre-ship validation (build, test, lint, changeset)
  - `devac workflow diff-summary` - Structured diff info for LLM drafting
  - `devac workflow install-local` - Build and link CLI packages globally

  All commands support `--json` flag for structured output, making them ideal for use in scripts and Claude slash commands.

### Patch Changes

- Updated dependencies [72b6800]
  - @pietgk/devac-core@0.8.0

## 0.7.1

### Patch Changes

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

## 0.3.0

### Minor Changes

- 2a0f2bd: Add Effect Store, Rules Engine, and C4 Generator (Priority 6)

  - Add `EffectWriter` and `EffectReader` for effect storage in Parquet format
  - Add `effects` view to query context and hub query federation
  - Add `@package` syntax support for effects queries (e.g., `effects@cli`)
  - Add Rules Engine with 25+ builtin patterns for common domains:
    - Database (DynamoDB, SQL, Prisma)
    - Payment (Stripe)
    - Auth (JWT, bcrypt, Cognito)
    - HTTP (fetch, axios)
    - Messaging (SQS, SNS, EventBridge)
    - Storage (S3, filesystem)
    - Observability (console, Datadog)
  - Add C4 diagram generator from domain effects with PlantUML export
  - Add domain boundary discovery with cohesion scoring

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

- 802f0e5: Add ergonomic Query UX with auto-created views and package shorthand

  - Auto-create `nodes`, `edges`, `external_refs` views when running `devac query`
  - Support `@package` syntax for cross-package queries:
    - `nodes@core` - query specific package by name
    - `edges@*` - query all packages in workspace
  - Package names derived from package.json or directory name
  - Views eliminate need for full `read_parquet('/path/...')` syntax
  - Progressive disclosure: simple → multi-package → all → full control

- b05eacb: Add `devac hub query` command for federated SQL queries across repositories

  - Execute SQL queries across all registered repositories in the hub
  - Automatically creates federated `nodes`, `edges`, `external_refs` views
  - Supports `@package` syntax for package-specific queries
  - Uses federation (queries seed files in place) - no data copying
  - Supports `--json` output format and `--branch` option

- 2b1b353: Add multi-package analysis with `--all` flag

  - New `--all` flag for `devac analyze` discovers and analyzes all packages in a repository
  - Package manager detection for pnpm, npm, and yarn workspaces
  - Multi-language support: TypeScript, Python (pyproject.toml), and C# (.csproj)
  - Continues on error, logging failures while analyzing remaining packages
  - New exports: `detectPackageManager()`, `discoverJSPackages()`, `discoverPythonPackages()`, `discoverCSharpPackages()`, `discoverAllPackages()`

### Patch Changes

- Updated dependencies [2e3e162]
- Updated dependencies [6a218a7]
- Updated dependencies [2a0f2bd]
- Updated dependencies [a426cd5]
- Updated dependencies [802f0e5]
- Updated dependencies [13fb888]
- Updated dependencies [2b1b353]
  - @pietgk/devac-core@0.3.0

## 0.2.0

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

## 0.1.2

### Patch Changes

- Updated dependencies [23e65a2]
  - @pietgk/devac-core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [144f370]
  - @pietgk/devac-core@0.1.1
