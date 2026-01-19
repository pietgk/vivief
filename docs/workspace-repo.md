# Workspace Repository Pattern

A workspace repository is a dedicated git repository for managing multi-repo workspaces with versioned configuration, auto-generated documentation, and team sharing capabilities.

## Overview

### What is a Workspace Repository?

A workspace repository is a git repository that:
- Maintains a registry of repositories in the workspace (`workspace.yaml`)
- Auto-generates `CLAUDE.md` from per-repo `AGENTS.md` files
- Provides versioned workspace configuration for teams
- Enables consistent setup across team members

### When to Use

**Use a workspace repository when:**
- Multiple team members work on the same set of repositories
- You want version-controlled workspace configuration
- Per-repo documentation should be aggregated for AI assistants
- You need consistent environment setup across machines

**Use direct workspace setup when:**
- You're working solo on a few repositories
- Configuration doesn't need to be shared
- Simpler is better for your workflow

### Naming Convention

Workspace repositories follow the naming pattern: `<name>-workspace`

Examples:
- `acme-workspace` for the Acme Corp workspace
- `platform-workspace` for a platform team's workspace
- `my-workspace` for personal use

## Quick Start

### Creating a New Workspace Repository

```bash
# Navigate to parent directory containing your repos
cd ~/ws

# Initialize the workspace repository
devac workspace repo init

# This creates:
# - ~/ws/<parent-name>-workspace/ directory
# - workspace.yaml with discovered repos
# - CLAUDE.md with auto-generated content
```

### Installing an Existing Workspace

```bash
# Clone the workspace repository
git clone https://github.com/your-org/acme-workspace.git

# Install workspace (clones repos, links CLAUDE.md)
cd acme-workspace
devac workspace repo install
```

### Syncing Documentation

```bash
# Update CLAUDE.md from per-repo AGENTS.md files
devac workspace repo sync
```

## Commands Reference

### devac workspace repo init

Initialize a new workspace repository in the current directory.

```bash
devac workspace repo init [options]

Options:
  --name <name>     Custom workspace name (default: parent directory name)
  --path <path>     Parent directory path (default: current directory)
  --force           Overwrite existing workspace repository

Examples:
  devac workspace repo init
  devac workspace repo init --name platform
  devac workspace repo init --path ~/projects
```

**Creates:**
- `<name>-workspace/` directory
- `workspace.yaml` with repository registry
- `CLAUDE.md` with auto-generated sections
- `.gitignore` for local state files

### devac workspace repo sync

Synchronize `CLAUDE.md` from per-repo `AGENTS.md` files.

```bash
devac workspace repo sync [options]

Options:
  --dry-run         Show what would be synced without making changes
  --force           Overwrite manual changes in auto-generated sections

Examples:
  devac workspace repo sync
  devac workspace repo sync --dry-run
```

**Behavior:**
1. Reads `workspace.yaml` for repository list
2. Scans each repo for `AGENTS.md`
3. Updates auto-generated sections in `CLAUDE.md`
4. Preserves manual sections outside markers

### devac workspace repo install

Install a workspace by cloning repositories and setting up links.

```bash
devac workspace repo install [options]

Options:
  --skip-clone      Skip cloning repositories (use existing)
  --skip-symlink    Skip symlinking CLAUDE.md
  --shallow         Use shallow clones for repositories

Examples:
  devac workspace repo install
  devac workspace repo install --skip-clone
```

**Behavior:**
1. Reads `workspace.yaml` for repository list
2. Clones missing repositories to parent directory
3. Creates symlink from parent `CLAUDE.md` to workspace `CLAUDE.md`
4. Initializes DevAC hub if needed

### devac workspace repo status

Show status of workspace repository and registered repos.

```bash
devac workspace repo status [options]

Options:
  --json            Output as JSON

Examples:
  devac workspace repo status
  devac workspace repo status --json
```

**Output:**
```
Workspace: acme-workspace
Path: /Users/you/ws/acme-workspace

Repositories (3):
  api        ✓ cloned  ✓ AGENTS.md  git:clean
  web        ✓ cloned  ✓ AGENTS.md  git:modified (2 files)
  shared     ✓ cloned  ✗ AGENTS.md  git:clean

CLAUDE.md:
  Auto-generated: 2026-01-15T10:30:00Z
  Manual sections: 2
  Repos synced: 2/3
```

## File Structure

A workspace repository has this structure:

```
acme-workspace/
├── workspace.yaml         # Repository registry
├── CLAUDE.md             # Auto-generated + manual content
├── .gitignore            # Excludes local state
└── .agent-os/            # Optional Agent OS configuration
    └── product/
        └── ...
```

### workspace.yaml

```yaml
# Workspace Repository Configuration
version: "1.0"
name: acme-workspace

repositories:
  - name: api
    url: git@github.com:acme/api.git
    path: ../api                    # Relative to workspace repo

  - name: web
    url: git@github.com:acme/web.git
    path: ../web

  - name: shared
    url: git@github.com:acme/shared.git
    path: ../shared

# Optional: teams for different configurations
teams:
  backend:
    repos: [api, shared]
  frontend:
    repos: [web, shared]
```

### CLAUDE.md

The `CLAUDE.md` file contains auto-generated sections from per-repo `AGENTS.md` files, plus manual sections for workspace-level guidance.

```markdown
# Workspace Context

This workspace contains the Acme platform repositories.

<!-- BEGIN AUTO-GENERATED - DO NOT EDIT -->
<!-- Generated from AGENTS.md files on 2026-01-15 -->

## Repositories

| Repo | Purpose | Docs |
|------|---------|------|
| api | Backend API services | @api/AGENTS.md |
| web | React frontend | @web/AGENTS.md |
| shared | Shared libraries | @shared/AGENTS.md |

**For repo-specific guidance, read the individual AGENTS.md files.**

<!-- END AUTO-GENERATED -->

## Manual Section

Add workspace-level instructions here. This section is preserved during sync.
```

## How Auto-Generation Works

### AGENTS.md to CLAUDE.md Flow

Each repository can have an `AGENTS.md` file with AI-specific guidance:

```
api/
├── AGENTS.md      # Repo-specific AI instructions
├── src/
└── ...
```

When you run `devac workspace repo sync`:

1. **Discovery**: Scans repos in `workspace.yaml`
2. **Collection**: Reads each `AGENTS.md` file
3. **Aggregation**: Builds repository table and cross-references
4. **Generation**: Updates content between `<!-- BEGIN/END AUTO-GENERATED -->` markers
5. **Preservation**: Keeps manual content outside markers

### Symlink Strategy

The workspace repository creates a symlink from the parent directory:

```
~/ws/
├── api/
├── web/
├── shared/
├── CLAUDE.md → acme-workspace/CLAUDE.md  # Symlink
└── acme-workspace/
    └── CLAUDE.md                          # Actual file
```

This allows:
- AI assistants to find `CLAUDE.md` at workspace root
- Version control of `CLAUDE.md` in the workspace repo
- Single source of truth for workspace documentation

## Best Practices

### When to Use vs Direct Setup

| Scenario | Recommendation |
|----------|----------------|
| Team of 2+ developers | Use workspace repo |
| Solo developer, stable setup | Either works |
| Frequently changing repo set | Direct setup |
| Need version history | Use workspace repo |
| CI/CD integration | Use workspace repo |

### Repository Organization

1. **Keep workspace repo minimal**: Only configuration and generated docs
2. **Don't duplicate code**: Let repos contain their own code
3. **Use relative paths**: In `workspace.yaml`, use `../repo-name` paths
4. **Commit regularly**: Track changes to workspace configuration

### AGENTS.md Guidelines

Each repo's `AGENTS.md` should include:
- Purpose and context
- Key commands (build, test, lint)
- Important patterns
- Tech stack summary

Keep it concise - the workspace `CLAUDE.md` aggregates these.

### Team Workflows

**Onboarding new team members:**
```bash
# Clone workspace repo
git clone git@github.com:acme/acme-workspace.git

# Install everything
cd acme-workspace
devac workspace repo install

# Ready to work!
cd ../api
```

**Updating documentation:**
```bash
# After editing api/AGENTS.md
cd ~/ws/acme-workspace
devac workspace repo sync
git add -A && git commit -m "docs: sync AGENTS.md changes"
git push
```

## Related Documentation

- [Quick Start](./quick-start.md) - Basic DevAC setup
- [ADR-0016: Workspace Module](./adr/0016-workspace-module.md) - Workspace architecture
- [ADR-0044: Workspace Repository Pattern](./adr/0044-workspace-repo-pattern.md) - This pattern's design rationale
