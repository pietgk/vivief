# @pietgk/devac-cli

## 2.2.0

### Patch Changes

- Updated dependencies [2c8b254]
  - @pietgk/devac-core@2.2.0

## 2.1.0

### Minor Changes

- 1b7a778: Add proactive health check with guided recovery

  Running `devac` now proactively detects and offers to fix common issues:

  - Multiple MCP processes running (should be 0 or 1)
  - Stale socket file (exists but nothing listening)
  - Stale PID file (exists but process is dead)
  - Protocol version mismatch between CLI and MCP

  New CLI flags:

  - `--heal`: Auto-fix issues without prompting
  - `--skip-health`: Skip health check entirely

  In interactive mode, users are prompted before fixes are applied. In non-interactive mode, a warning is shown with hints.

### Patch Changes

- Updated dependencies [1b7a778]
  - @pietgk/devac-core@2.1.0

## 2.0.1

### Patch Changes

- Updated dependencies [fdc7093]
  - @pietgk/devac-core@2.0.1

## 2.0.0

### Patch Changes

- Updated dependencies [25dba08]
  - @pietgk/devac-core@2.0.0

## 1.2.1

### Patch Changes

- Updated dependencies [ccab1f9]
  - @pietgk/devac-core@1.2.1

## 1.2.0

### Minor Changes

- 12d3199: feat: Robust MCP server lifecycle management

  - Add IPC fallback in HubClient.dispatch() - when IPC fails with connection errors, falls back to direct hub access instead of failing
  - Add version negotiation via ping method - CLI checks protocol version compatibility on first IPC call
  - Add shutdown method for graceful MCP server termination via IPC
  - Add PID file management for fallback kill mechanism
  - Add `devac mcp stop` command with `--force` flag for killing unresponsive servers
  - Add `devac mcp status` command to check if MCP is running and show version info
  - Wire up shutdown callback in devac-mcp server for IPC-triggered shutdown

### Patch Changes

- Updated dependencies [12d3199]
  - @pietgk/devac-core@1.2.0

## 1.1.0

### Minor Changes

- 29951a3: Add prerequisites module and improve DX when prerequisites aren't met

  - Add prerequisites module with checkSyncPrerequisites, checkQueryPrerequisites, getReadinessForStatus
  - Fix silent failures: track missing seeds, log hub lock fallback, validate MCP parameters
  - Fix circular error in sync: no longer says "run devac sync" when sync itself failed
  - Consolidate CLI hub checks into shared hub-prerequisites utility
  - Add readiness section to status output showing sync/query readiness
  - Include readiness metadata in MCP query responses when results are empty

### Patch Changes

- Updated dependencies [29951a3]
  - @pietgk/devac-core@1.1.0

## 1.0.0

### Major Changes

- 498d53d: BREAKING: Reorganize CLI into three core commands (v4.0)

  This is a breaking change that consolidates 50+ CLI commands into three core commands:

  **New Command Structure:**

  - `devac sync` - Analyze packages, register repos, sync CI/issues/docs
  - `devac status` - Show health, diagnostics, doctor, seeds
  - `devac query <subcommand>` - All code graph queries

  Plus utility commands:

  - `devac mcp` - Start MCP server
  - `devac workflow` - CI/git integration

  **Command Mapping (old → new):**

  - `devac analyze` → `devac sync`
  - `devac hub init/register/refresh` → `devac sync` (automatic)
  - `devac validate` → `devac sync --validate`
  - `devac watch` → `devac sync --watch`
  - `devac find-symbol` → `devac query symbol`
  - `devac deps` → `devac query deps`
  - `devac diagnostics` → `devac status --diagnostics`
  - `devac doctor` → `devac status --doctor`

  **MCP Tool Renaming:**
  Tools renamed to match CLI pattern with `query_*` and `status_*` prefixes:

  - `find_symbol` → `query_symbol`
  - `get_dependencies` → `query_deps`
  - `get_validation_errors` → `status_diagnostics`
  - etc.

  **Migration:** No backwards compatibility - update scripts to use new commands.

  See ADR-0041 (CLI Command Structure) and ADR-0042 (MCP Tool Naming) for details.

### Patch Changes

- 8d90b55: fix(workflow): make plugin-dev robust for non-git directories

  - Auto-discover vivief repo when run from workspace root (non-git dir)
  - Prioritize main vivief repo over worktrees (vivief-\*)
  - Provide clear error messages for invalid --path arguments
  - @pietgk/devac-core@1.0.0

## 0.27.0

### Minor Changes

- 52bc90a: feat(workspace): auto-discovery and setup plugin

  - Replace `workspace.json` with filesystem-based auto-discovery for repos
  - Repos are now discovered by scanning for `.git` directories with `AGENTS.md` or `CLAUDE.md`
  - Add `/devac:setup` command for guided first-time setup in Claude Code
  - Simpler setup - no configuration file needed

### Patch Changes

- Updated dependencies [52bc90a]
  - @pietgk/devac-core@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies [94a6c53]
  - @pietgk/devac-core@0.26.0

## 0.25.1

### Patch Changes

- b87fba4: Fix logger output in hook mode for clean JSON output

  - Add `setGlobalLogLevel("silent")` at start of `status --inject` command
  - Modify logger `shouldLog()` to respect global log level dynamically
  - Ensures hook JSON output is not polluted with PackageManager debug logs

- Updated dependencies [b87fba4]
  - @pietgk/devac-core@0.25.1

## 0.25.0

### Minor Changes

- 44fc580: Add hook-based validation triggering for Claude Code integration

  - Add `--inject` flag to `devac status` command for UserPromptSubmit hook integration
  - Add `--on-stop` flag to `devac validate` command for Stop hook integration with auto git diff detection
  - Add `level` parameter to `get_all_diagnostics` MCP tool supporting progressive disclosure (counts/summary/details)
  - Create `plugins/devac/hooks/hooks.json` with hook definitions
  - Update diagnostics-triage skill documentation with hook workflow

### Patch Changes

- @pietgk/devac-core@0.25.0

## 0.24.4

### Patch Changes

- @pietgk/devac-core@0.24.4

## 0.24.3

### Patch Changes

- @pietgk/devac-core@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [115117c]
  - @pietgk/devac-core@0.24.2

## 0.24.1

### Patch Changes

- 7e2ffd7: Fix CLI commands bypassing HubClient IPC routing

  - All CLI commands now use `createHubClient()` instead of direct `CentralHub` access
  - Added `pushValidationErrors()` to HubClient with IPC support
  - Added `HubLike` type for sync functions accepting either CentralHub or HubClient
  - Commands properly route through MCP when running, with fallback to direct hub access

  This fixes DuckDB lock errors that occurred when running CLI commands while MCP server was active.

- Updated dependencies [7e2ffd7]
  - @pietgk/devac-core@0.24.1

## 0.24.0

### Minor Changes

- 9ed3526: Add grouping and significance rules for improved C4 architecture generation

  - Add `GroupingRule` interface and built-in layer rules (Analysis, Storage, Federation, API, Rules, Views)
  - Add `SignificanceRule` interface for classifying architectural importance (critical, important, minor, hidden)
  - Integrate rule-based grouping and significance filtering into C4 generator
  - Enhance `devac architecture score` command with:
    - Gap metrics with target comparisons (Container F1, Signal-to-Noise, Relationship F1, External F1)
    - `--with-rules` flag for rule-based analysis
    - `--show-targets` flag for displaying target thresholds
    - Improvement suggestions based on gap analysis
  - Add C4 quality rules documentation for validate-architecture skill

### Patch Changes

- Updated dependencies [9ed3526]
  - @pietgk/devac-core@0.24.0

## 0.23.1

### Patch Changes

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

- Updated dependencies [eb2364b]
  - @pietgk/devac-core@0.19.0

## 0.18.1

### Patch Changes

- f0806b8: feat: add architecture documentation improvement loop

  - Add architecture.md and architecture.reasoning.md for devac-core
  - Document architecture documentation generation methodology
  - Add C4 integration test for reference package validation
  - Improve c4-generator output quality
  - Add docs/plans/improve-pipeline.md outlining AI-verified rules approach

- Updated dependencies [f0806b8]
  - @pietgk/devac-core@0.18.1

## 0.18.0

### Minor Changes

- 5c08659: Improve C4 architecture generator output quality

  **New Features:**

  - Enriched domain effects with readable function names from nodes table instead of hash-based IDs
  - Relationship aggregation: groups duplicate relationships with combined labels and call counts (e.g., "Read, Write (45 calls)")
  - Source links now include line numbers (e.g., `file.ts#L42`) for direct code navigation
  - Internal call graph edges: CALLS relationships between components are now visualized
  - Scoped drill-down views per container showing detailed component relationships

  **New APIs:**

  - `enrichDomainEffects()` - enriches domain effects with node metadata
  - `buildNodeLookupMap()` - creates lookup map from SQL results
  - `buildInternalEdges()` - builds internal edge array from SQL results
  - `computeRelativePath()` - strips absolute path prefixes for cleaner file paths

  **New Types:**

  - `EnrichedDomainEffect` - domain effect with readable names
  - `NodeMetadata`, `NodeLookupMap`, `InternalEdge`, `EnrichmentResult`

  **C4 Generator Enhancements:**

  - Added `startLine` to `C4Component` interface
  - Added `internalEdges` option to `C4GeneratorOptions`
  - Better handling of absolute paths in container IDs

  Fixes #114

### Patch Changes

- Updated dependencies [5c08659]
  - @pietgk/devac-core@0.18.0

## 0.17.1

### Patch Changes

- aa9bc14: fix(likec4): generate unified .c4 files with relative link paths

  - Fixed LikeC4 link syntax to use unquoted URIs (required by LikeC4 parser)
  - Changed from absolute paths to relative paths for source file links
  - Added `computeRelativeLinkPath()` helper to compute paths relative to docs/c4 directory
  - Generated files now pass `likec4 validate` without errors

- Updated dependencies [aa9bc14]
  - @pietgk/devac-core@0.17.1

## 0.17.0

### Minor Changes

- d74e32d: feat(likec4): add LikeC4 as primary C4 documentation format

  - Add LikeC4 as the default output format for C4 diagrams (replacing PlantUML as default)
  - Add `--format` flag to `doc-sync` command with options: `likec4` (default), `plantuml`, `both`
  - Add `exportContextToEnhancedLikeC4` and `exportContainersToEnhancedLikeC4` with source links and tags
  - Add `generateLikeC4Specification` for custom element kinds based on detected domains
  - Add `identifyEffectChains`, `generateDynamicViews`, `generateEffectsFlowLikeC4` for effect flow visualization
  - Add `generateUnifiedWorkspaceLikeC4` for cross-repo architecture diagrams
  - PlantUML remains available via `--format plantuml` for backward compatibility

  See ADR-0027 for the decision rationale.

### Patch Changes

- Updated dependencies [d74e32d]
  - @pietgk/devac-core@0.17.0

## 0.16.1

### Patch Changes

- Updated dependencies [97c3a2f]
  - @pietgk/devac-core@0.16.1

## 0.16.0

### Minor Changes

- ec1f6e0: Consolidate hub location to workspace-only mode

  **Breaking Change:** DevAC now requires a workspace context. The `--hub-dir` option has been removed from all CLI commands.

  - All hub operations now use `{workspace}/.devac` automatically
  - Removed `getDefaultHubDir()` fallback to `~/.devac`
  - Made `hubDir` required in `HubClient` constructor
  - Added helpful error message when not in a workspace context suggesting `devac workspace init`

  This change ensures consistent hub usage across CLI and MCP, preventing DuckDB corruption from multiple hub databases.

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

- 14dbdc3: fix(hub-query): handle missing effects.parquet gracefully

  DuckDB's `read_parquet([list])` fails if any file in the list doesn't exist. Since `effects.parquet` is optional (v3.0 feature), the effects view creation was failing silently. Now checks for file existence before adding to the parquet list.

  - @pietgk/devac-core@0.14.1

## 0.14.0

### Minor Changes

- 797ec98: feat: Add doc-sync command for federated documentation generation

  - Generate effects documentation at package, repo, and workspace levels
  - Generate C4 PlantUML diagrams (context and containers) at all levels
  - Seed hash metadata for change detection (skip unchanged packages)
  - `--check` flag for CI mode to verify docs are in sync
  - Aggregation functions to identify cross-package and cross-repo patterns
  - Integration with existing effects workflow (effects init → verify → doc-sync)

  New files:

  - `devac-core/src/docs/`: seed-hasher, doc-metadata, effects-generator, c4-doc-generator
  - `devac-core/src/docs/repo-*`: Repo-level aggregation generators
  - `devac-core/src/docs/workspace-*`: Workspace-level aggregation generators
  - `devac-cli/src/commands/doc-sync.ts`: CLI command implementation

  Resolves #83

### Patch Changes

- Updated dependencies [797ec98]
  - @pietgk/devac-core@0.14.0

## 0.13.3

### Patch Changes

- Updated dependencies [190116a]
  - @pietgk/devac-core@0.13.3

## 0.13.2

### Patch Changes

- @pietgk/devac-core@0.13.2

## 0.13.1

### Patch Changes

- @pietgk/devac-core@0.13.1

## 0.13.0

### Minor Changes

- 4fb8426: Add `devac sync` command to streamline analyze + register workflow

  - New `devac sync` command combines package analysis and hub registration
  - Supports `--analyze-only`, `--register-only`, `--force`, and `--dry-run` flags
  - Uses `--if-changed` optimization by default for faster incremental syncs
  - **Breaking**: `devac hub register` no longer auto-analyzes packages (use `devac sync` instead)
  - Status command now recommends `devac sync` in "Next Steps"

### Patch Changes

- @pietgk/devac-core@0.13.0

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
