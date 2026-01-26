---
"@pietgk/devac-worktree": minor
---

Add default branch detection and git-crypt support for worktrees

- Add `getDefaultBranch()` to auto-detect default branch from `origin/HEAD` or common branch names (main, master, development, develop)
- Add `usesGitCrypt()` to detect repositories using git-crypt
- Add `createWorktreeWithGitCrypt()` to properly share git-crypt keys via symlink when creating worktrees
- Add `--base` CLI flag to explicitly specify base branch for worktree creation
- Update `createWorktree()` to auto-detect branch and handle git-crypt repos automatically

This fixes issues with repositories that use a non-"main" default branch (e.g., "development") and repositories that use git-crypt for encrypted files.
