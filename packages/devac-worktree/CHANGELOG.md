# @pietgk/devac-worktree

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

- 6ef9b2b: Fix issue ID parsing in clean and resume commands

  - Both `clean` and `resume` commands now accept full issue ID format (e.g., `ghvivief-62`) in addition to numeric format (`62`)
  - Added pre-checks for worktree cleanliness before clean operation
  - Added `--skip-pr-check` flag to skip only PR merged validation
  - Added `--yes` / `-y` flag to skip confirmation prompts
  - Added `checkWorktreeStatus()` function to detect modified/untracked files
  - Improved error messages with actionable suggestions
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

- b56ef9d: Rename `--skip-claude` flag to `--new-session` with inverted semantics

  **Breaking change in flag behavior:**

  - Old: `--skip-claude` meant "don't launch Claude" (opt-out)
  - New: `--new-session` means "launch Claude in the worktree" (opt-in)

  Default behavior is now to NOT launch Claude automatically, giving users control over their session.

  Also exports `parseIssueArg` and `parseRepos` functions for testing.

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

## 0.3.3

### Patch Changes

- Updated dependencies [936dfb0]
  - @pietgk/devac-core@0.5.0

## 0.3.2

### Patch Changes

- Updated dependencies [082e7c0]
  - @pietgk/devac-core@0.4.0

## 0.3.1

### Patch Changes

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

- 27d7fe8: Add devac-worktree CLI for git worktree + Claude CLI workflow

  New package providing:

  - `devac-worktree start <issue>` - Create worktree and launch Claude for an issue
  - `devac-worktree list` - List active worktrees
  - `devac-worktree status` - Show worktrees with issue/PR state
  - `devac-worktree resume <issue>` - Resume work on existing worktree
  - `devac-worktree clean <issue>` - Remove worktree after PR merged
  - `devac-worktree clean-merged` - Clean all worktrees with merged PRs
