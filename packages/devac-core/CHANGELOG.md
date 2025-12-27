# @pietgk/devac-core

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
