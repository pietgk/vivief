# DevAC Plugin for Claude Code

DevAC plugin providing Analytics Layer skills and Workflow commands for code analysis and development workflows.

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

## Installation

### From Vivief Marketplace

```bash
/plugin install devac@vivief
```

### Local Development

```bash
claude --plugin-dir ./plugins/devac
```

## Architecture Overview

This plugin provides the LLM interface to DevAC's Four Pillars and Analytics Layer:

```
        ┌─────────────────────────────────────────────────────────────┐
        │                      ANALYTICS LAYER                         │
        │        (Skills query and reason over all outputs)            │
        └─────────────────────────────────────────────────────────────┘
              │           │           │           │
         ┌────┴────┐ ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
         │  INFRA  │ │ VALID-  │ │ EXTRAC- │ │  WORK-  │
         │         │ │ ATORS   │ │  TORS   │ │  FLOW   │
         │ DevAC   │ │ Diag-   │ │  Seeds  │ │  Work   │
         │ Health  │ │ nostics │ │         │ │Activity │
         └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

## What's Included

### Skills (Model-Invoked)

Skills activate automatically when you ask relevant questions:

| Skill | Triggers On | Description |
|-------|------------|-------------|
| `code-analysis` | "analyze code", "find functions" | Analyze code structure and symbols |
| `impact-analysis` | "what will this affect" | Determine change impact and dependencies |
| `codebase-navigation` | "find where X is defined" | Navigate and locate code |
| `diagnostics-triage` | "what needs fixing" | Triage errors and warnings |
| `multi-repo-context` | "cross-repo", "workspace" | Work across multiple repositories |

### Commands (User-Invoked)

Workflow commands for development tasks. Commands use the `devac:` namespace prefix:

| Command | Description |
|---------|-------------|
| `/devac:start-issue` | Start work on a GitHub issue |
| `/devac:start-issue-on-new-worktree` | Start issue with new git worktree |
| `/devac:issue` | Create a new GitHub issue |
| `/devac:commit` | Full commit workflow |
| `/devac:ship` | Commit, push, and create PR |
| `/devac:prepare-commit` | Prepare commit message |
| `/devac:draft-commit` | Draft commit message |
| `/devac:prepare-pr` | Prepare PR description |
| `/devac:draft-changeset` | Draft changeset for release |
| `/devac:draft-adr` | Draft architecture decision record |
| `/devac:devac-status` | Query status across all Four Pillars |

## Prerequisites

1. **DevAC CLI installed**
   ```bash
   npm install -g @pietgk/devac-cli
   ```

2. **Hub initialized** (for multi-repo features)
   ```bash
   devac hub init
   ```

3. **Repositories analyzed**
   ```bash
   cd your-repo
   devac analyze .
   ```

## CLI Commands (Primary)

Skills use CLI commands for all DevAC operations:

```bash
# Code analysis
devac find-symbol UserService
devac file-symbols src/auth/

# Impact analysis
devac affected src/core/auth.ts
devac deps src/services/user.ts

# Diagnostics
devac hub diagnostics
devac hub diagnostics --severity error

# Multi-repo
devac hub status
devac hub repos
```

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

## Usage Examples

### Code Analysis
```
"What functions are in the auth module?"
"Show me the class hierarchy for BaseController"
```

### Impact Analysis
```
"What will be affected if I change UserService?"
"Show me the call graph for the login function"
```

### Diagnostics
```
"What TypeScript errors need fixing?"
"Triage the current issues by priority"
```

### Multi-Repo
```
"Show me the workspace status"
"Find all implementations of authenticate across repos"
```

### Workflow
```
/devac:start-issue 123
/devac:commit
/devac:ship
```

## Installation Verification

After installation, verify the plugin is working:

```bash
# Check DevAC CLI is available
devac --version

# Check hub is initialized
devac hub status

# Test a skill by asking Claude:
"What functions are in this file?"
```

## Learn More

- [DevAC Documentation](https://github.com/mindler-sern/vivief)
- [Concepts and Architecture](../../docs/vision/concepts.md)
- [MCP Server Reference](../../packages/devac-mcp/README.md)
