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
(cd packages/devac-worktree && pnpm link --global)
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

## Issue ID Format

The `<issue>` parameter supports two formats:

### Full Issue ID (Recommended)

Format: `ghrepo-123` - Works from anywhere in the workspace

- `gh` = GitHub source prefix
- `repo` = repository name (e.g., `vivief`, `api`)
- `123` = issue number

**Examples:**
- `ghvivief-39` - Issue #39 in the vivief repo
- `ghapi-123` - Issue #123 in the api repo

### Legacy Numeric Format

Format: `123` - Only works when inside the repository

This is maintained for backward compatibility but requires you to be inside the target repository.

## Quick Start

### From Anywhere in Workspace (Recommended)

```bash
# Start working on issue #123 in vivief repo
devac-worktree start ghvivief-123

# Check status
devac-worktree status

# After PR is merged
devac-worktree clean 123
```

### From Inside a Repository (Legacy)

```bash
cd /path/to/vivief

# Start working on issue #123
devac-worktree start 123
```

## Workspace Mode

When using the full issue ID format (`ghrepo-123`), devac-worktree will:

1. **Find workspace** - Walk up directories to find the workspace root (contains `.devac/` or multiple repos)
2. **Locate repo** - Find the repository by name in the workspace
3. **Get GitHub info** - Parse the git remote to determine owner/repo for API calls
4. **Create worktree** - Create the worktree as a sibling in the workspace

This allows starting work from any directory:

```bash
# All of these work with the full issue ID:
cd ~/ws && devac-worktree start ghvivief-42
cd ~/ws/vivief && devac-worktree start ghvivief-42
cd ~/ws/vivief/packages/core && devac-worktree start ghvivief-42
```

## Multi-Repo Support

```bash
# Create worktrees in sibling repos (from inside a repo)
devac-worktree start 123 --also web --also shared

# Create worktrees in multiple repos (from parent directory)
devac-worktree start ghvivief-123 --repos api,web,shared
```

## Naming Convention

- Worktree directory: `{repo}-{issue#}-{slug}` (e.g., `vivief-123-auth`)
- Branch name: `{issue#}-{short-description}` (e.g., `123-add-authentication`)

## Documentation

Full documentation: [docs/devac-worktree.md](../../docs/devac-worktree.md)

## See Also

- [ADR-0014: Git Worktree + Claude CLI Workflow](../../docs/adr/0014-worktree-claude-workflow.md)
- [DevAC CLI Reference](../../docs/cli-reference.md)
