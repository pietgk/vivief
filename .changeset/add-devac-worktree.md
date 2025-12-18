---
"@pietgk/devac-worktree": minor
---

Add devac-worktree CLI for git worktree + Claude CLI workflow

New package providing:
- `devac-worktree start <issue>` - Create worktree and launch Claude for an issue
- `devac-worktree list` - List active worktrees
- `devac-worktree status` - Show worktrees with issue/PR state
- `devac-worktree resume <issue>` - Resume work on existing worktree
- `devac-worktree clean <issue>` - Remove worktree after PR merged
- `devac-worktree clean-merged` - Clean all worktrees with merged PRs
