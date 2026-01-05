# @pietgk/devac-core

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
