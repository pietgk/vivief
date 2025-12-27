# @pietgk/devac-worktree

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
