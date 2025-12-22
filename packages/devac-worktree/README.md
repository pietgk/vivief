# @pietgk/devac-worktree

Git worktree + Claude CLI workflow for GitHub issues.

## Overview

`devac-worktree` automates the workflow of creating git worktrees for GitHub issues, installing dependencies, and launching Claude CLI for AI-assisted development.

## Installation

```bash
npm install -g @pietgk/devac-worktree
```

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth login`)
- `claude` CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Git repository with GitHub remote

## Commands

| Command | Description |
|---------|-------------|
| `start <issue>` | Create worktree for issue, install deps, launch Claude |
| `list` | List active worktrees |
| `status` | Show worktrees with issue/PR state |
| `resume <issue>` | Resume work on existing worktree |
| `clean <issue>` | Remove worktree after PR merged |
| `clean-merged` | Clean all merged worktrees |

## Quick Start

```bash
# Start working on issue #123
devac-worktree start 123

# Check status
devac-worktree status

# After PR is merged
devac-worktree clean 123
```

## Multi-Repo Support

```bash
# Create worktrees in sibling repos (from inside a repo)
devac-worktree start 123 --also web --also shared

# Create worktrees in multiple repos (from parent directory)
devac-worktree start 123 --repos api,web,shared
```

## Naming Convention

- Worktree directory: `{repo}-{issue#}-{slug}` (e.g., `api-123-auth`)
- Branch name: `{issue#}-{short-description}` (e.g., `123-add-authentication`)

## Documentation

Full documentation: [docs/devac-worktree.md](../../docs/devac-worktree.md)

## See Also

- [ADR-0014: Git Worktree + Claude CLI Workflow](../../docs/adr/0014-worktree-claude-workflow.md)
- [DevAC CLI Reference](../../docs/cli-reference.md)
