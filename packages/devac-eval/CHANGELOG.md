# @pietgk/devac-eval

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

## 0.3.0

### Minor Changes

- 22970ac: Replace Anthropic SDK with Claude CLI for LLM execution

  - Add ClaudeCLIExecutor that spawns `claude -p` subprocess
  - Remove @anthropic-ai/sdk dependency (works with Claude Max subscription)
  - Add --model CLI option for model selection (sonnet, haiku, opus)
  - Fix subprocess stdin handling to prevent hanging
  - Use ~/ws as working directory for proper context access
  - Add timing estimates to evaluation progress output
  - Add comprehensive tests for CLI executor (16 tests)

  **Breaking change**: Requires Claude CLI to be installed and authenticated instead of ANTHROPIC_API_KEY.

## 0.2.0

### Minor Changes

- 35256ba: Add LLM answer quality evaluation framework

  New package for measuring how DevAC improves LLM answer quality for code understanding questions.

  - LLM-as-judge scoring with 5 quality dimensions (correctness, completeness, hallucination, comprehensibility, context usage)
  - Pairwise comparison between baseline (LLM-only) and enhanced (LLM+DevAC) modes
  - 10 benchmark questions about DevAC codebase with ground truth facts
  - Full CLI with commands: `run`, `report`, `compare`, `list`, `validate`
  - MCP server integration for enhanced mode evaluation
  - Extensible benchmark format supporting multiple codebases
