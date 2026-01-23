# @pietgk/devac-eval

## 1.2.0

### Patch Changes

- Updated dependencies [12d3199]
  - @pietgk/devac-core@1.2.0

## 1.1.0

### Patch Changes

- Updated dependencies [29951a3]
  - @pietgk/devac-core@1.1.0

## 1.0.0

### Patch Changes

- @pietgk/devac-core@1.0.0

## 0.27.0

### Patch Changes

- Updated dependencies [52bc90a]
  - @pietgk/devac-core@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies [94a6c53]
  - @pietgk/devac-core@0.26.0

## 0.25.1

### Patch Changes

- Updated dependencies [b87fba4]
  - @pietgk/devac-core@0.25.1

## 0.25.0

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

- Updated dependencies [7e2ffd7]
  - @pietgk/devac-core@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [9ed3526]
  - @pietgk/devac-core@0.24.0

## 0.23.1

### Patch Changes

- Updated dependencies [8dfe4ea]
  - @pietgk/devac-core@0.23.1

## 0.23.0

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

- @pietgk/devac-core@0.7.1

## 0.7.0

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
