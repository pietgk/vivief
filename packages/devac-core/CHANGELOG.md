# @pietgk/devac-core

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
