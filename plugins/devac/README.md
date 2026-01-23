# DevAC Plugin for Claude Code

DevAC plugin providing Analytics Layer skills and Workflow commands for code analysis and development workflows.

## How Plugin Loading Works

Understanding how Claude Code loads plugins is important to avoid confusion:

### Loading Methods (In Order of Preference)

| Method | Command Format | When to Use |
|--------|---------------|-------------|
| **Install via Marketplace** | `/devac:commit` | Recommended - works globally in any project |
| **Marketplace** (vivief repo) | `/commit` | Working inside the vivief repository |
| **--plugin-dir** | `/devac:commit` | Development/testing of the plugin |

### What "Project Scope" Means

When using Claude Code in a **multi-repo workspace** (like `~/ws/` containing multiple repositories):

- **Project = the directory where you launched Claude Code**
- If you run `claude` from `~/ws/vivief/`, the plugin loads for that session
- If you run `claude` from `~/ws/` (parent directory), the plugin loads if vivief's marketplace is detected
- Other sibling repositories (`~/ws/other-repo/`) don't automatically get the plugin

**Important**: The plugin scope is tied to the Claude Code session, not individual repositories within your workspace.

---

## Setup Guide

### Option 1: Install via Marketplace (Recommended)

The DevAC plugin is published to GitHub and can be installed globally via Claude Code's plugin system. This works in **any project** without needing the vivief repository.

```bash
# Add the vivief marketplace (one-time setup)
claude plugin marketplace add pietgk/vivief

# Install the DevAC plugin
claude plugin install devac@vivief
```

**Verify installation:**
```bash
claude plugin marketplace list
# Should show: vivief - Source: GitHub (pietgk/vivief)
```

After installation, commands are available with the `devac:` namespace prefix:
- `/devac:commit` - Full commit workflow
- `/devac:ship` - Commit, push, and create PR
- `/devac:start-issue` - Start work on an issue
- etc.

### Option 2: Working Inside the Vivief Repository

If you're a vivief developer, the plugin loads automatically via the repository's marketplace configuration.

**Usage:**
```bash
cd ~/ws/vivief
claude
```

Commands are available **without namespace prefix**:
- `/commit`, `/ship`, `/start-issue`, etc.

### Option 3: Development/Testing (--plugin-dir)

For testing plugin changes during development:

```bash
claude --plugin-dir /path/to/vivief/plugins/devac
```

Commands will be namespaced as `/devac:commit`, `/devac:ship`, etc.

---

## Quick Reference: Command Names

| If Plugin Loaded Via... | Command Format | Example |
|------------------------|----------------|---------|
| Install via Marketplace | `/devac:command` | `/devac:commit` |
| Marketplace (inside vivief) | `/command` | `/commit` |
| --plugin-dir | `/devac:command` | `/devac:commit` |

---

## Conceptual Model

```
┌──────────────────────────────────────────┬─────────────────────┐
│      CLI (devac, devac-worktree)         │   MCP (devac-mcp)   │
│  Preferred - low context overhead        │  Alternative access │
└──────────────────────────────────────────┴─────────────────────┘
         │                                          │
         └────────────────────┬─────────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    SHARED CORE (devac-core)                     │
└────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
- **CLI is preferred** - Skills invoke `devac` commands via Bash for lower context overhead
- **CLI and MCP share implementation** - Both import from `devac-core` and behave identically
- **MCP is optional** - Skills work without MCP server running

---

## What's Included

### Skills (Auto-Invoked)

Skills activate automatically based on your conversation:

| Skill | Triggers On | Description |
|-------|------------|-------------|
| `code-analysis` | "analyze code", "find functions" | Analyze code structure and symbols |
| `impact-analysis` | "what will this affect" | Determine change impact and dependencies |
| `codebase-navigation` | "find where X is defined" | Navigate and locate code |
| `diagnostics-triage` | "what needs fixing" | Triage errors and warnings |
| `multi-repo-context` | "cross-repo", "workspace" | Work across multiple repositories |
| `explain-package` | "explain this package", "document package" | Generate human-readable package documentation |
| `define-effects` | "define effects", "map effects" | Create and maintain effect mappings |

### Commands (User-Invoked)

| Command | Description |
|---------|-------------|
| `/commit` | Full commit workflow with changeset/ADR checks |
| `/ship` | Commit, push, and create PR |
| `/start-issue` | Start work on a GitHub issue |
| `/start-issue-on-new-worktree` | Start issue with new git worktree |
| `/issue` | Create a new GitHub issue |
| `/prepare-commit` | Prepare commit message (review before committing) |
| `/draft-commit` | Draft commit message only |
| `/prepare-pr` | Prepare PR description |
| `/draft-changeset` | Draft changeset for release |
| `/draft-adr` | Draft architecture decision record |
| `/devac-status` | Query status across all Four Pillars |

> **Note**: Commands shown without namespace. If installed via marketplace or using `--plugin-dir`, prefix with `devac:` (e.g., `/devac:commit`).

---

## Prerequisites

1. **DevAC CLI installed**
   ```bash
   npm install -g @pietgk/devac-cli
   ```

2. **Hub initialized** (for multi-repo features)
   ```bash
   devac sync
   ```

3. **Repositories analyzed**
   ```bash
   cd your-repo
   devac sync
   ```

---

## CLI Commands Used by Skills

Skills invoke CLI commands for all DevAC operations:

```bash
# Code analysis
devac query symbol UserService
devac file-symbols src/auth/

# Impact analysis
devac query affected src/core/auth.ts
devac query deps src/services/user.ts

# Diagnostics
devac status --diagnostics
devac status --diagnostics --severity error

# Multi-repo
devac status --hub
devac query repos

# Effects documentation
devac effects init -p <package>
devac effects verify -p <package>
devac effects sync -p <package>
devac effects list -p <package>
```

---

## MCP Integration (Alternative)

An MCP server configuration is included for `devac-mcp`. MCP provides the same functionality with higher context overhead:

- `find_symbol` - Find symbols by name
- `get_file_symbols` - Get symbols in a file
- `get_affected` - Get affected files
- `get_dependencies` - Get file dependencies
- `get_call_graph` - Get function call graphs
- `get_diagnostics_summary` - Get diagnostics overview
- `get_all_diagnostics` - Get all diagnostics
- `list_repos` - List connected repositories
- `query_sql` - Query the Seeds database

**Note:** CLI is preferred. MCP is useful when you have it configured but is not required.

---

## Usage Examples

### Skills (Just Ask)
```
"What functions are in the auth module?"
"What will be affected if I change UserService?"
"What TypeScript errors need fixing?"
"Show me the workspace status"
```

### Commands (Explicit Invocation)
```
/start-issue 123
/commit
/ship
```

---

## Troubleshooting

### Commands Not Found

**Symptom**: `/commit` or `/devac:commit` doesn't work

**Check**:
1. Installed via marketplace? → Commands are `/devac:commit`
2. Inside the vivief directory? → Commands are `/commit` (no namespace)
3. Using `--plugin-dir`? → Commands are `/devac:commit`
4. Plugin not loaded? → Run `claude plugin list` to check, then `/help` to see available commands

### Skills Not Activating

**Check**:
1. Is DevAC CLI installed? → `devac --version`
2. Is the repository analyzed? → `devac status --hub`

### Plugin Not Loading

**Check**:
1. Verify marketplace.json exists: `cat .claude-plugin/marketplace.json`
2. Check plugin structure: `ls plugins/devac/`
3. Restart Claude Code after changes

---

## Learn More

- [Vivief Workflow Guide](../../docs/vivief-workflow.md) - Complete development workflow
- [CLI Reference](../../docs/cli-reference.md) - DevAC CLI commands
- [MCP Server Reference](../../packages/devac-mcp/README.md) - MCP integration
