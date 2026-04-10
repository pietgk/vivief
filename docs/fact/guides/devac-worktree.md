# devac-worktree Reference

Git worktree + Claude CLI workflow for GitHub issues.

## Overview

`devac-worktree` automates the workflow of creating git worktrees for GitHub issues, installing dependencies, and launching Claude CLI for AI-assisted development. It supports both single-repo and multi-repo workflows.

## Installation

```bash
# From GitHub Packages
npm install -g @pietgk/devac-worktree

# Or use directly from the monorepo
pnpm --filter @pietgk/devac-worktree exec devac-worktree --help
```

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth login`)
- `claude` CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Git repository with GitHub remote

---

## Commands

### devac-worktree start

Create a worktree for an issue and launch Claude CLI.

```bash
devac-worktree start <issue-id> [options]

Options:
  --skip-install      Skip dependency installation
  --new-session       Launch Claude CLI in the worktree
  --create-pr         Create a draft PR immediately
  --also <repo>       Also create worktree in sibling repo (repeatable)
  --repos <repos>     Create worktrees in specified repos (comma-separated, parent dir only)
  -v, --verbose       Verbose output

Examples:
  devac-worktree start ghvivief-123
  devac-worktree start ghvivief-123 --new-session
  devac-worktree start ghvivief-123 --also web --also shared
  devac-worktree start ghvivief-123 --repos api,web,shared
```

**Issue ID Format:** `gh<repoDirectoryName>-<issueNumber>` (e.g., `ghvivief-123`, `ghapi-42`)

**Workflow:**
1. Fetches issue #123 from GitHub
2. Creates branch `123-<short-description>`
3. Creates worktree at `../<repo>-123-<slug>/`
4. Installs dependencies (pnpm/npm/yarn auto-detected)
5. Writes issue context to `~/.devac/issue-context.md`
6. Launches Claude CLI in the worktree

**Multi-Repo Modes:**

| Mode | Flag | Use Case |
|------|------|----------|
| Single repo | (default) | Working on one repo for the issue |
| Sibling repos | `--also <repo>` | Inside a repo, add worktrees in siblings |
| Parent directory | `--repos <repos>` | From parent dir, create worktrees in multiple repos |

---

### devac-worktree list

List active worktrees.

```bash
devac-worktree list [options]

Options:
  -v, --verbose       Show detailed information
  --json              Output as JSON

Examples:
  devac-worktree list
  devac-worktree list --verbose
  devac-worktree list --json
```

**Output:**
```
Active Worktrees:

  #123 Add user authentication
    api-123-auth @ /Users/dev/projects/api-123-auth
    Branch: 123-auth
    Created: 2025-12-18

  #456 Fix login bug
    api-456-fix-login @ /Users/dev/projects/api-456-fix-login
    Branch: 456-fix-login
    Created: 2025-12-17
```

---

### devac-worktree status

Show worktrees with issue state and PR status.

```bash
devac-worktree status [options]

Options:
  -v, --verbose       Show detailed information
  --json              Output as JSON
  --issue-wide        Show all worktrees for current issue across repos

Examples:
  devac-worktree status
  devac-worktree status --issue-wide
  devac-worktree status --json
```

**Output (regular):**
```
Worktree Status:

  #123 Add user authentication
    api-123-auth
    Issue: OPEN
    PR: #45 (open) ✓ checks passing
    https://github.com/org/api/pull/45
```

**Output (with --issue-wide):**
```
Issue #123 Status: Add user authentication

  api-123-auth
    Issue: OPEN
    PR: #45 (open) ✓ checks passing
    https://github.com/org/api/pull/45

  web-123-auth
    Issue: OPEN
    PR: #46 (open) ⏳ checks pending
    https://github.com/org/web/pull/46
```

---

### devac-worktree resume

Resume work on an existing worktree.

```bash
devac-worktree resume <issue-id> [options]

Options:
  --new-session       Launch Claude CLI in the worktree
  -v, --verbose       Verbose output

Examples:
  devac-worktree resume ghvivief-123
  devac-worktree resume ghvivief-123 --new-session
```

**Workflow:**
1. Finds existing worktree for issue #123
2. Re-fetches issue details from GitHub
3. Updates `~/.devac/issue-context.md`
4. Launches Claude CLI in the worktree

---

### devac-worktree clean

Remove worktree after PR is merged.

```bash
devac-worktree clean <issue-id> [options]

Options:
  -f, --force         Force removal (skip PR check AND remove with modified files)
  --skip-pr-check     Skip the PR merged check only
  --keep-branch       Keep the git branch
  -y, --yes           Skip confirmation prompts
  -v, --verbose       Verbose output

Examples:
  devac-worktree clean ghvivief-123
  devac-worktree clean ghvivief-123 --force
  devac-worktree clean ghvivief-123 --keep-branch
```

**Workflow:**
1. Checks if PR is merged (unless `--force`)
2. Removes the worktree directory
3. Deletes the branch (unless `--keep-branch`)
4. Removes from state file

---

### devac-worktree clean-merged

Clean all worktrees with merged PRs.

```bash
devac-worktree clean-merged [options]

Options:
  -v, --verbose       Verbose output

Examples:
  devac-worktree clean-merged
  devac-worktree clean-merged --verbose
```

**Workflow:**
1. Lists all active worktrees
2. Checks PR status for each
3. Cleans worktrees where PR is merged
4. Reports results

---

## Workflows

### Single-Repo Workflow

Standard workflow for working on an issue in one repository:

```bash
# Start working on issue #123 in api repo
devac-worktree start ghapi-123

# Worktree created at ../api-123-feature/
# ... work with Claude ...

# Check status
devac-worktree status

# After PR is merged
devac-worktree clean ghapi-123
```

### Multi-Repo Workflow (--also)

Use to create worktrees in sibling repos:

```bash
# Start and also create worktrees in sibling repos
devac-worktree start ghapi-123 --also web --also shared

# Creates:
#   ../api-123-feature/
#   ../web-123-feature/
#   ../shared-123-feature/

# Check status across all repos
devac-worktree status --issue-wide
```

### Parent Directory Workflow (--repos)

Use when working from a parent directory containing multiple repos:

```bash
# Start from parent directory (not inside any repo)
cd ~/projects
devac-worktree start ghapi-123 --repos api,web,shared

# Creates worktrees in all specified repos
# Claude launches in parent directory (~/projects)

# This allows Claude to work across all repos naturally
# Using: git -C api-123-feature status
#        npm --prefix web-123-feature test
```

### Decision Tree: --also vs --repos

| Situation | Use |
|-----------|-----|
| Inside a repo, need to add sibling worktrees | `--also` |
| In parent directory, starting fresh | `--repos` |
| Want Claude to see all repos at once | `--repos` (from parent) |
| Adding one repo at a time | `--also` |

---

## Naming Conventions

### Worktree Directory

Pattern: `{repo}-{issue#}-{slug}`

Examples:
- `api-123-auth` (issue #123 "Add authentication" in api repo)
- `web-45-fix-bug` (issue #45 "Fix login bug" in web repo)

### Branch Name

Pattern: `{issue#}-{short-description}`

Examples:
- `123-add-authentication`
- `45-fix-login-bug`

---

## State Management

### Worktrees State File

Location: `~/.devac/worktrees.json`

```json
[
  {
    "path": "/Users/dev/projects/api-123-auth",
    "branch": "123-add-authentication",
    "issueNumber": 123,
    "issueTitle": "Add user authentication",
    "createdAt": "2025-12-18T10:30:00Z",
    "repoRoot": "/Users/dev/projects/api"
  }
]
```

### Issue Context File

Location: `~/.devac/issue-context.md`

Contains the current issue details for Claude to reference:
- Issue number and title
- Description and body
- Labels
- Linked PRs

---

## Integration with devac context

The `devac context` commands work alongside devac-worktree:

```bash
# Check context discovery
devac context

# Check CI status for all issue PRs
devac context ci

# Generate review prompt
devac context review
```

See [CLI Reference - Context Commands](./cli-reference.md#context-commands) for details.

---

## Troubleshooting

### "Claude CLI is not installed"

Install Claude CLI:
```bash
npm install -g @anthropic-ai/claude-code
```

### "gh CLI not authenticated"

Authenticate with GitHub:
```bash
gh auth login
```

### "Worktree already exists"

Use resume instead:
```bash
devac-worktree resume ghvivief-123
```

### "PR not merged" when cleaning

Use `--force` to remove anyway:
```bash
devac-worktree clean ghvivief-123 --force
```

### "Not a git repository" with --repos

The `--repos` flag requires being in a parent directory (not inside a git repo). Use `--also` when inside a repo.

---

## See Also

- [CLI Reference](./cli-reference.md) - DevAC CLI commands
- [Development Workflow](./vivief-workflow.md) - Complete development workflow
- [ADR-0014](./adr/0014-worktree-claude-workflow.md) - Architecture decision
