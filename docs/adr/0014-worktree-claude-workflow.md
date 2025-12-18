# ADR-0014: Git Worktree + Claude CLI Workflow

## Status

Accepted

## Context

When working on multiple GitHub issues simultaneously with Claude CLI, developers face a workflow friction:

1. **Claude CLI cwd sandboxing**: The Claude CLI is sandboxed to its starting directory and cannot follow when a user creates a new git worktree via `git worktree add` or `cd` into a different directory.

2. **Manual worktree management**: Creating worktrees for each issue requires repetitive steps:
   - Fetch issue details from GitHub
   - Create appropriately named branch
   - Create worktree in consistent location
   - Install dependencies
   - Start new Claude CLI session
   - Remember to clean up after PR is merged

3. **Context loss**: When starting a new Claude session in a worktree, the issue context (title, description, labels) must be manually provided again.

4. **Cleanup burden**: After merging PRs, worktrees and branches accumulate and need manual cleanup.

## Decision

Create a new `devac-worktree` CLI package that automates the git worktree + Claude CLI workflow:

### Package Structure

- **Standalone package**: `packages/devac-worktree` with no dependency on `devac-core`
- **Single binary**: `devac-worktree` command
- **External dependencies**: `gh` CLI (GitHub), `git`, `claude` CLI

### Commands

| Command | Purpose |
|---------|---------|
| `start <issue>` | Create worktree, install deps, write context, launch Claude |
| `list` | List active worktrees |
| `status` | Show worktrees with issue/PR state |
| `resume <issue>` | Resume work on existing worktree |
| `clean <issue>` | Remove worktree after PR merged |
| `clean-merged` | Clean all worktrees with merged PRs |

### State Management

- **State file**: `~/.devac/worktrees.json` tracks active worktrees
- **Issue context**: `~/.devac/issue-context.md` provides context to Claude
- **Worktree location**: `../<repo>-<issue>` sibling directories

### Workflow

```
devac-worktree start 42
  ├── Fetch issue #42 from GitHub
  ├── Create branch: 42-fix-login-bug
  ├── Create worktree: ../myrepo-42/
  ├── Install dependencies (pnpm/npm/yarn)
  ├── Write issue context to ~/.devac/issue-context.md
  └── Launch claude CLI in worktree

# ... developer works with Claude ...

devac-worktree clean 42
  ├── Verify PR is merged
  ├── Remove worktree
  └── Delete branch
```

### Integration Points

- **GitHub CLI**: All GitHub operations via `gh` command
- **Claude CLI**: Launched as child process in worktree directory
- **Package managers**: Auto-detect pnpm/npm/yarn from lockfiles

## Consequences

### Positive

- Single command to start working on any issue
- Automatic context handoff to Claude sessions
- Consistent worktree naming and location
- Easy cleanup of completed work
- No manual branch/worktree management
- Works with any repository (not tied to devac-core)

### Negative

- Requires `gh` CLI to be installed and authenticated
- Requires `claude` CLI to be installed
- State file could get out of sync with actual worktrees
- Additional package to maintain

### Neutral

- Worktrees created as sibling directories (not inside repo)
- State synced with actual git worktrees on each command
- Context file is global (one issue at a time focus)

## References

- GitHub Issue: https://github.com/pietgk/vivief/issues/12
- Git worktrees: https://git-scm.com/docs/git-worktree
- GitHub CLI: https://cli.github.com/
- Claude CLI: https://claude.ai/cli
