# @pietgk/devac-core

## 1.0.0

## 0.27.0

### Minor Changes

- 52bc90a: feat(workspace): auto-discovery and setup plugin

  - Replace `workspace.json` with filesystem-based auto-discovery for repos
  - Repos are now discovered by scanning for `.git` directories with `AGENTS.md` or `CLAUDE.md`
  - Add `/devac:setup` command for guided first-time setup in Claude Code
  - Simpler setup - no configuration file needed

## 0.26.0

### Minor Changes

- 94a6c53: Add validation test harness for testing devac validation hooks

  - Add ValidationTestHarness class for workspace management and fixture operations
  - Add GitSimulator class for Git operations in tests
  - Add hook output schema validation with Zod for parsing validation results
  - Add fixture packages with intentional errors for comprehensive testing

## 0.25.1

### Patch Changes

- b87fba4: Fix logger output in hook mode for clean JSON output

  - Add `setGlobalLogLevel("silent")` at start of `status --inject` command
  - Modify logger `shouldLog()` to respect global log level dynamically
  - Ensures hook JSON output is not polluted with PackageManager debug logs

## 0.25.0

## 0.24.4

## 0.24.3

## 0.24.2

### Patch Changes

- 115117c: Fix package discovery to include root package in workspaces

  When analyzing repositories with workspace configurations (pnpm/npm/yarn) or fallback patterns (packages/_, apps/_, etc.), the root package was being excluded from discovery. This caused the main application code in repos like React Native apps to never be analyzed.

  **Before:** Only workspace packages were discovered, missing root `package.json`
  **After:** Root package is always included first if `package.json` exists

  This fix ensures:

  - Root package is discovered alongside workspace packages
  - No duplicates when workspace patterns match root directory
  - Backward compatible - repos without root `package.json` work as before

## 0.24.1

### Patch Changes

- 7e2ffd7: Fix CLI commands bypassing HubClient IPC routing

  - All CLI commands now use `createHubClient()` instead of direct `CentralHub` access
  - Added `pushValidationErrors()` to HubClient with IPC support
  - Added `HubLike` type for sync functions accepting either CentralHub or HubClient
  - Commands properly route through MCP when running, with fallback to direct hub access

  This fixes DuckDB lock errors that occurred when running CLI commands while MCP server was active.

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

## 0.22.1

### Patch Changes

- d800467: Consolidate duplicate code in context and validation modules

  - Remove duplicate `parseIssueId` and `parseWorktreeNameV2` from context/discovery.ts (re-exported from workspace for backwards compatibility)
  - Create shared `ValidatorError` base class with `TscError`, `TestError`, `LinterError`, `CoverageError` subclasses

## 0.22.0

### Minor Changes

- d46c52e: Add EXTENDS edge resolution for inheritance queries

  - New `resolveExtendsEdges()` method in TypeScript semantic resolver
  - Resolves local classes/interfaces (confidence 1.0) and exported ones (confidence 0.9)
  - New `getUnresolvedExtendsEdges()` in SeedReader
  - New `updateResolvedExtendsEdges()` in SeedWriter
  - Extended LocalSymbolIndex to include interfaces
  - Integrated into `resolveSemantics()` orchestrator after CALLS resolution
  - Enables inheritance queries with JOINs to nodes table

## 0.21.0

### Minor Changes

- abc21d2: Add CALLS edge resolution for call graph queries

  - New `resolveCallEdges()` method in TypeScript semantic resolver
  - Resolves local functions (confidence 1.0) and exported functions (confidence 0.9)
  - New `getUnresolvedCallEdges()` in SeedReader
  - New `updateResolvedCallEdges()` in SeedWriter
  - Integrated into `resolveSemantics()` orchestrator
  - Enables call graph queries with JOINs to nodes table

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

## 0.19.1

### Patch Changes

- ac0ea74: ### LikeC4 Directory Restructure

  Restructure `docs/c4/` directories to separate generated and validated architecture models:

  - New `generated/` subdirectory for auto-generated C4 models
  - New `validated/` subdirectory for human-validated C4 models
  - Shared `spec.c4` file defines element kinds and relationships
  - Each subdirectory is an isolated LikeC4 project (no more duplicate element errors)

  This change addresses LikeC4 VSCode plugin conflicts caused by merging multiple `.c4` files
  with overlapping specification blocks.

  ### Documentation Updates

  - **ADR-0029**: LikeC4 Directory Restructure for Conflict Avoidance
  - **ADR-0030**: Unified Query System Architecture
  - **ADR-0031**: Architecture Documentation Quality Improvement Loop
  - Updated ADR-0027 with new output file structure
  - Fixed ADR README date inconsistencies (0011-0023)
  - Updated docs/README.md version info

  ### Code Changes

  - `c4-doc-generator.ts`: Output to `docs/c4/generated/model.c4` instead of `docs/c4/architecture.c4`
  - `likec4-json-parser.ts`: Parse from `generated/` and `validated/` subdirectories
  - Fixed LikeC4 syntax errors in spec.c4 (removed invalid `border dashed`)
  - Renamed `views` container to `view_generators` to avoid reserved keyword conflict

## 0.19.0

### Minor Changes

- eb2364b: feat(core): Add unified query system with packages array abstraction

  - Implements unified `query()` function that takes a packages array as the key abstraction
  - Query level is implicit from array contents: 1 package = package-level, multiple = repo/workspace
  - Adds root-seed validation: warns and skips seeds found at repo root with .git (prevents stale seed issues)
  - Rewrites `setupQueryContext()` and `queryMultiplePackages()` as backwards-compatible wrappers
  - All existing tests pass (1367 tests across devac-core and devac-cli)

  fix(mcp): Update to use shared devac-core hub implementation

  This addresses issue #121 where devac-mcp was not fully using the shared devac-core implementation.

## 0.18.1

### Patch Changes

- f0806b8: feat: add architecture documentation improvement loop

  - Add architecture.md and architecture.reasoning.md for devac-core
  - Document architecture documentation generation methodology
  - Add C4 integration test for reference package validation
  - Improve c4-generator output quality
  - Add docs/plans/improve-pipeline.md outlining AI-verified rules approach

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

## 0.17.1

### Patch Changes

- aa9bc14: fix(likec4): generate unified .c4 files with relative link paths

  - Fixed LikeC4 link syntax to use unquoted URIs (required by LikeC4 parser)
  - Changed from absolute paths to relative paths for source file links
  - Added `computeRelativeLinkPath()` helper to compute paths relative to docs/c4 directory
  - Generated files now pass `likec4 validate` without errors

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

## 0.16.1

### Patch Changes

- 97c3a2f: Fix rules engine regex patterns and add missing technology rules

  - Remove `\(` from SQL patterns that prevented matching (callee names don't include parentheses)
  - Add Kysely ORM rules for database operations (selectFrom, insertInto, updateTable, deleteFrom)
  - Add tRPC API rules for procedure definitions (procedure.mutation, procedure.query)
  - Remove overly restrictive `isExternal: true` from AWS service rules (DynamoDB, S3, SQS, SNS, etc.)
  - Update documentation with correct patterns and new rules

  Fixes #105

## 0.16.0

### Minor Changes

- ec1f6e0: Consolidate hub location to workspace-only mode

  **Breaking Change:** DevAC now requires a workspace context. The `--hub-dir` option has been removed from all CLI commands.

  - All hub operations now use `{workspace}/.devac` automatically
  - Removed `getDefaultHubDir()` fallback to `~/.devac`
  - Made `hubDir` required in `HubClient` constructor
  - Added helpful error message when not in a workspace context suggesting `devac workspace init`

  This change ensures consistent hub usage across CLI and MCP, preventing DuckDB corruption from multiple hub databases.

## 0.15.1

### Patch Changes

- 8e86197: Fix doc-sync bugs: incorrect package counts, wrong column name, is_external never set

  - Fix package counts always showing "1" by using repo.packages from manifest
  - Fix wrong column name in effects queries (filename → source_file_path)
  - Add external call detection to typescript-parser for is_external flag

## 0.15.0

### Minor Changes

- b63a413: Consolidate query architecture and reduce code duplication

  - Add `queryWithContext()` for consistent view-based package queries
  - Fix `getUnifiedQuery()` to use correct deduplication keys for effects (effect_id vs entity_id)
  - Add `getParquetFilePaths()` helper for consistent parquet path construction
  - Consolidate duplicate `fileExists` implementations into single canonical utility

## 0.14.2

### Patch Changes

- 2d787a0: Fix workspace effects showing zero counts

  - Fixed `CentralHub.query()` to create views (nodes, edges, external_refs, effects) pointing to all seed parquet files
  - Fixed `getCachedQuery()` to skip DELETE in read-only mode
  - Fixed `workspace-effects-generator` to use `filename LIKE` pattern instead of non-existent `repo_id` column

## 0.14.1

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

## 0.13.3

### Patch Changes

- 190116a: Add fallback discovery for repos without workspace config

  - JS packages: Try common patterns (packages/_, apps/_, libs/_, services/_) when no pnpm-workspace.yaml or workspaces field exists
  - Python packages: Discover projects with requirements.txt + .py files (in addition to pyproject.toml)

  Fixes #69

## 0.13.2

## 0.13.1

## 0.13.0

## 0.12.2

## 0.12.1

### Patch Changes

- fb1410f: Fix race condition where second MCP server would delete first server's socket

  When multiple Claude CLI sessions started MCP servers, the second one would unconditionally delete the first's socket file during cleanup, then fail on the DB lock. This left the first MCP orphaned with no socket for IPC delegation.

  Now `cleanupSocket()` checks if the socket is actively in use before deleting. If another MCP is listening, it throws a clear error instead of deleting the socket.

## 0.12.0

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

## 0.10.0

## 0.9.0

## 0.8.0

### Patch Changes

- 72b6800: Fix {effects} placeholder replacement in hub mode queries

  The `queryMultiplePackages()` function was missing the `{effects}` placeholder
  replacement, causing MCP tools like `query_effects`, `run_rules`, and `generate_c4`
  to fail with SQL syntax errors when running in hub mode.

  Added `effectsPaths` collection alongside existing `nodePaths`, `edgePaths`, and
  `refPaths`, and added the corresponding `.replace(/{effects}/g, ...)` to the
  SQL processing chain.

## 0.7.1

## 0.7.0

### Minor Changes

- 31f0d38: feat: add workspace analysis status and enhanced hub registration

  - Add seed state detection per package (none/base/delta/both)
  - Add comprehensive workspace status computation
  - Enhance `devac status` with seed status section and `--seeds-only` flag
  - Enhance `devac hub register` with `--analyze` and `--all` flags
  - Add MCP `get_workspace_status` tool for AI assistant integration
  - Fix entity ID generation to use relative file paths for deterministic results across git worktrees

## 0.6.1

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

## 0.5.0

### Minor Changes

- 936dfb0: Add API decorator extraction and M2M call detection for v0.5.0

  **API Decorator Extraction:**

  - Extract `@Route`, `@Get`, `@Post`, `@Put`, `@Delete` decorators from tsoa, NestJS, and Express
  - Create `RequestEffect` records with route patterns, HTTP methods, and framework detection
  - Combine class-level route prefixes with method-level routes

  **M2M URL Pattern Detection:**

  - Detect HTTP client calls: `m2mClient`, `axios`, `fetch`, `got`, `superagent`
  - Extract URL patterns from string literals and template literals
  - Create `SendEffect` records with M2M service name detection
  - Added "m2m" to `send_type` enum for machine-to-machine calls

  **Cross-Repo M2M Tracking:**

  - New `findM2MConnections()` method on `CentralHub` for querying M2M calls across registered repos
  - Match Send effects to Request effects by service name and route pattern
  - New `M2MConnection` and `M2MQueryResult` types exported from hub module

  This improves DevAC effectiveness score from 60-65% to an estimated 75-80%.

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

## 0.3.0

### Minor Changes

- 2e3e162: Add Effect schema types with Zod for v3.0 foundation

  Defines the Effect type system based on DevAC v3.0 Foundation (Sections 5.3-5.5):

  **Code Effects** - What code does:

  - `FunctionCall` - Code execution (method calls, function invocations)
  - `Store` - Data persistence (database writes, cache sets)
  - `Retrieve` - Data fetching (database reads, cache gets)
  - `Send` - External communication (HTTP requests, emails)
  - `Request` / `Response` - API boundary effects
  - `Condition` / `Loop` - Control flow effects
  - `Group` - Organizational boundaries (C4 diagrams)

  **Workflow Effects** - Development activity:

  - `FileChanged` - Filesystem watch triggers
  - `SeedUpdated` - Extraction complete events
  - `ValidationResult` - Check pass/fail with diagnostics
  - `IssueClaimed` / `PRMerged` - GitHub workflow events
  - `ChangeRequested` - Human/LLM action routing

  Includes:

  - Zod schemas for runtime validation
  - TypeScript types inferred from schemas
  - Helper functions (`createFunctionCallEffect`, `createValidationResultEffect`, etc.)
  - Type guards (`isCodeEffect`, `isWorkflowEffect`)
  - `parseEffect` / `safeParseEffect` for unknown data validation

- 6a218a7: Add CALLS edge extraction to TypeScript, Python, and C# parsers

  - New CALLS edges track function and method call relationships
  - Captures caller → callee relationships including:
    - Simple function calls: `foo()`
    - Method calls: `obj.method()`
    - Chained calls: `items.filter().map()`
    - Built-in calls: `console.log()`, `setTimeout()`, `print()`
    - Constructor calls: `super()`, `new Class()`
    - Instance method calls: `this.method()`, `self.method()`
    - C# base/this initializers: `base()`, `this()`
    - Object creation: `new ClassName()`
  - Edge properties include source location and argument count
  - Enables "find all callers of X" queries on seeds
  - Updated data model documentation for CALLS edge properties

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

- 13fb888: Add JSDoc/documentation extraction to TypeScript parser

  - Extract JSDoc comments from functions, classes, interfaces, type aliases, and enums
  - Handle JSDoc attached to export wrappers (`export function foo`)
  - Clean and normalize JSDoc comment formatting (remove `*` prefixes, trim whitespace)
  - Populate the existing `documentation` field in parsed nodes
  - Respect `includeDocumentation` config flag (defaults to true)

- 2b1b353: Add multi-package analysis with `--all` flag

  - New `--all` flag for `devac analyze` discovers and analyzes all packages in a repository
  - Package manager detection for pnpm, npm, and yarn workspaces
  - Multi-language support: TypeScript, Python (pyproject.toml), and C# (.csproj)
  - Continues on error, logging failures while analyzing remaining packages
  - New exports: `detectPackageManager()`, `discoverJSPackages()`, `discoverPythonPackages()`, `discoverCSharpPackages()`, `discoverAllPackages()`

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

## 0.1.2

### Patch Changes

- 23e65a2: Replace non-null assertions with optional chaining in test files to resolve biome lint warnings

## 0.1.1

### Patch Changes

- 144f370: Reorganize test fixtures into separate packages per language

  - Create `packages/fixtures-typescript` with proper tsconfig for type-checking
  - Create `packages/fixtures-python` for Python test fixtures
  - Create `packages/fixtures-csharp` for C# test fixtures
  - Rename intentionally broken files to `.txt` extension to prevent IDE errors
  - Update all tests to use new fixture package paths
  - Add ADR documenting the fixture organization decision

  This change improves developer experience by:

  - Type-checking valid TypeScript fixtures
  - Eliminating spurious IDE errors from intentionally broken files
  - Providing clear separation of fixtures by language
