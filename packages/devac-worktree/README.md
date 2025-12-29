# @pietgk/devac-worktree

Git worktree + Claude CLI workflow for GitHub issues.

## Overview

`devac-worktree` automates the workflow of creating git worktrees for GitHub issues, installing dependencies, and launching Claude CLI for AI-assisted development.

## Installation

### From GitHub Packages

```bash
# Configure npm for GitHub Packages (one-time setup)
echo "@pietgk:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc

# Install globally
npm install -g @pietgk/devac-worktree
```

### From Source (Development)

```bash
# Clone the DevAC monorepo
git clone https://github.com/pietgk/vivief.git
cd vivief

# Install and build
pnpm install
pnpm build

# Link globally
pnpm --filter @pietgk/devac-worktree link --global
```

### Verify Installation

```bash
devac-worktree --version
devac-worktree --help
```

## Prerequisites

- **Node.js 20+**
- **GitHub CLI** (`gh`) - Install from [cli.github.com](https://cli.github.com/), then run `gh auth login`
- **Claude CLI** (`claude`) - Install from [Claude Code](https://claude.ai/claude-code)
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
