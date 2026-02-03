# @pietgk/devac-worktree

## 2.5.0

### Patch Changes

- Updated dependencies [9656502]
  - @pietgk/devac-core@2.5.0

## 2.4.0

### Patch Changes

- 1e78589: Add cleanup diagnostics, interactive cleanup command, and comprehensive testing

  ### Features

  - **Cleanup command**: New `devac cleanup` command with interactive menu for cleaning stale branches and worktrees
    - `--dry-run`: Preview what would be cleaned
    - `--branches`/`--worktrees`: Filter cleanup scope
    - `--json`: Structured output for scripting
    - `-y`/`--yes`: Skip interactive prompts
  - **Status detection modules**: New detection capabilities in devac-core
    - Git detection: base branch, tracking, working dir, merge/rebase states
    - Seed detection: staleness detection with commit tracking
    - PR detection: PR merge readiness via GitHub CLI
    - Staleness detection: stale branch/worktree detection (30-day threshold)
  - **Status cleanup flag**: Add `--cleanup` flag to `devac status` to show stale resources
  - **Diagnostics-fix skill**: New plugin skill for automated error resolution workflow
  - **Enhanced MCP tool descriptions**: Better LLM guidance for query_rules, query_c4 tools

  ### Bug Fixes

  - Fix MCP tool name in diagnostic injection (`status_all_diagnostics` not `get_all_diagnostics`)
  - Preserve schemaVersion when updating seed metadata (fixes verify command failures)
  - Fix flaky verify test race condition with shared tempDir variable
  - Add file sync before atomic rename to prevent flaky tests on macOS
  - Consolidate duplicate git helpers into shared utils/git.ts
  - Fix hub DB filename inconsistency (use `central.duckdb` consistently)
  - Fix typo: `safeToDeletBranches` -> `safeToDeleteBranches`

  ### Documentation

  - Add change-validate-fix loop documentation explaining automatic validation workflow
  - Update ADR-0043 status from "Proposed" to "Accepted"
  - Add validation pipeline section to CLAUDE.md
  - Fix misleading hub location references (workspace-level, not user home)
  - Fix documentation drift: update MCP tools section, plugin README, mcp-server.md
  - Add effects coverage to change-validate-fix documentation

  ### Testing

  - Add MCP tool tests for query_rules, query_rules_list, query_c4, query_effects, status_diagnostics_summary, status_diagnostics_counts (100% tool coverage)
  - Add CLI command tests for effects, context, cleanup, doc-sync commands
  - Add plugin validation tests for skills, commands, hooks, and manifests
  - Add coverage thresholds to devac-cli, devac-mcp, devac-worktree packages

- Updated dependencies [1e78589]
  - @pietgk/devac-core@2.4.0

## 2.3.2

### Patch Changes

- @pietgk/devac-core@2.3.2

## 2.3.1

### Patch Changes

- @pietgk/devac-core@2.3.1

## 2.3.0

### Minor Changes

- c36dd69: Add default branch detection and git-crypt support for worktrees

  - Add `getDefaultBranch()` to auto-detect default branch from `origin/HEAD` or common branch names (main, master, development, develop)
  - Add `usesGitCrypt()` to detect repositories using git-crypt
  - Add `createWorktreeWithGitCrypt()` to properly share git-crypt keys via symlink when creating worktrees
  - Add `--base` CLI flag to explicitly specify base branch for worktree creation
  - Update `createWorktree()` to auto-detect branch and handle git-crypt repos automatically

  This fixes issues with repositories that use a non-"main" default branch (e.g., "development") and repositories that use git-crypt for encrypted files.

### Patch Changes

- Updated dependencies [333a92f]
  - @pietgk/devac-core@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies [2c8b254]
  - @pietgk/devac-core@2.2.0

## 2.1.0

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

- aea188d: Fix silent failure when running `devac-worktree start` with numeric-only issue IDs

  - Remove legacy numeric-only issue ID format support
  - Require full issue ID format: `gh<repoDirectoryName>-<issueNumber>`
  - Detect non-`gh` inputs as Jira format with "coming soon" message
  - Add clear error messages with format explanation
  - Update all documentation to reflect new requirements
  - @pietgk/devac-core@0.24.4

## 0.24.3

### Patch Changes

- 47be200: fix(worktree): make start command more robust

  - Fix `gh issue view` failing in parent directory mode by passing explicit repo context
  - Add uncommitted changes detection before creating worktrees to prevent broken/empty worktrees
  - Provide helpful error messages with stash instructions when uncommitted changes are detected
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
