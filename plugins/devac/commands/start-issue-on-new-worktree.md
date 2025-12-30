# /devac:start-issue-on-new-worktree - Start Issue in Isolated Git Worktree

You are helping the user start work on a GitHub issue using git worktrees for isolation.

## Usage

```
/devac:start-issue-on-new-worktree <issue-id> [--repos repo1,repo2]
```

### Issue ID Format

The `<issue-id>` can be specified in two formats:

1. **Full issue ID** (recommended): `ghrepo-123` - Works from anywhere in the workspace
   - `gh` = GitHub source prefix
   - `repo` = repository name (e.g., `vivief`, `api`)
   - `123` = issue number
   - Example: `ghvivief-39` for issue #39 in the vivief repo

2. **Legacy numeric format**: `123` - Only works when inside the repo
   - Example: `39` (must be inside the vivief directory)

## What is a Git Worktree?

Git worktrees allow multiple working directories from the same repository. This enables:
- Working on multiple issues simultaneously
- Keeping main branch clean while developing
- Easy cleanup after PR merges

## Steps

### 1. Fetch issue details

```bash
gh issue view <issue-number> -R owner/repo
```

### 2. Create worktree

Use devac-worktree CLI:

```bash
# From anywhere in workspace (recommended)
devac-worktree start ghvivief-39

# From inside a repo (legacy)
devac-worktree start 39

# Multiple repos (from parent directory)
devac-worktree start ghvivief-39 --repos api,web,shared
```

This will:
- Find the workspace root automatically
- Locate the repo by name from the issue ID
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
User: /devac:start-issue-on-new-worktree ghvivief-42

Claude: Creating worktree for issue #42 in vivief...

## Worktree Created

**Issue #42:** Add watch mode for incremental analysis

**Location:** /Users/user/ws/vivief-42-add-watch-mode/

**Branch:** 42-add-watch-mode

Dependencies installed.

---

To navigate:
```bash
cd /Users/user/ws/vivief-42-add-watch-mode
```

Or start a new Claude session there:
```bash
claude --cwd /Users/user/ws/vivief-42-add-watch-mode
```

## Implementation Plan

[Proposes implementation approach]
```

## Workspace Mode

When using the full issue ID format (`ghrepo-123`), devac-worktree will:

1. **Find workspace** - Walk up directories to find the workspace root (contains `.devac/` or multiple repos)
2. **Locate repo** - Find the repository by name in the workspace
3. **Get GitHub info** - Parse the git remote to determine owner/repo for API calls
4. **Create worktree** - Create the worktree as a sibling in the workspace

This allows starting work from any directory in the workspace:

```bash
# All of these work with the full issue ID:
cd /Users/user/ws && devac-worktree start ghvivief-42
cd /Users/user/ws/vivief && devac-worktree start ghvivief-42
cd /Users/user/ws/vivief/packages/core && devac-worktree start ghvivief-42
```

## Multi-Repo Workflow

For issues spanning multiple repositories:

```
/devac:start-issue-on-new-worktree ghvivief-123 --repos api,web

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
- You're working from anywhere in the workspace (use full issue ID)

## See Also

- [ADR-0014: Git Worktree + Claude Workflow](../docs/adr/0014-worktree-claude-workflow.md)
- [devac-worktree Reference](../docs/devac-worktree.md)
