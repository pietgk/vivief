# /devac:start-issue-on-new-worktree - Start Issue in Isolated Git Worktree

You are helping the user start work on a GitHub issue using git worktrees for isolation.

## Usage

```
/devac:start-issue-on-new-worktree <issue-number> [--repos repo1,repo2]
```

## What is a Git Worktree?

Git worktrees allow multiple working directories from the same repository. This enables:
- Working on multiple issues simultaneously
- Keeping main branch clean while developing
- Easy cleanup after PR merges

## Steps

### 1. Fetch issue details

```bash
gh issue view <issue-number>
```

### 2. Create worktree

Use devac-worktree CLI:

```bash
# Single repo
devac-worktree start <issue-number>

# Multiple repos (from parent directory)
devac-worktree start <issue-number> --repos api,web,shared
```

This will:
- Create branch: `<issue-number>-<slug>`
- Create worktree: `../<repo>-<issue-number>-<slug>/`
- Install dependencies
- Write issue context

### 3. Present summary

Show the user:
- Worktree location
- Issue context
- Next steps

## Example Flow

```
User: /devac:start-issue-on-new-worktree 42

Claude: Creating worktree for issue #42...

## Worktree Created

**Issue #42:** Add watch mode for incremental analysis

**Location:** ../vivief-42-add-watch-mode/

**Branch:** 42-add-watch-mode

Dependencies installed.

---

To navigate:
```bash
cd ../vivief-42-add-watch-mode
```

Or start a new Claude session there:
```bash
claude --cwd ../vivief-42-add-watch-mode
```

## Implementation Plan

[Proposes implementation approach]
```

## Multi-Repo Workflow

For issues spanning multiple repositories:

```
/devac:start-issue-on-new-worktree 123 --repos api,web

Creates:
  ../api-123-feature/
  ../web-123-feature/
```

Then use `devac context` commands:
- `devac context ci` - Check CI status across repos
- `devac context review` - Generate review prompt

## When to Use

Use `/devac:start-issue-on-new-worktree` when:
- You need to work on multiple issues simultaneously
- You want complete isolation from other work
- The issue spans multiple repositories
- You prefer clean separation between tasks

## See Also

- [ADR-0014: Git Worktree + Claude Workflow](../docs/adr/0014-worktree-claude-workflow.md)
- [devac-worktree Reference](../docs/devac-worktree.md)
