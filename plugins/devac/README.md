# DevAC Plugin for Claude Code

DevAC plugin providing Analytics Layer skills and Workflow commands for code analysis and development workflows.

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

Workflow commands for development tasks:

| Command | Description |
|---------|-------------|
| `/start-issue` | Start work on a GitHub issue |
| `/start-issue-on-new-worktree` | Start issue with new git worktree |
| `/issue` | Create a new GitHub issue |
| `/commit` | Full commit workflow |
| `/ship` | Commit, push, and create PR |
| `/prepare-commit` | Prepare commit message |
| `/draft-commit` | Draft commit message |
| `/prepare-pr` | Prepare PR description |
| `/draft-changeset` | Draft changeset for release |
| `/draft-adr` | Draft architecture decision record |
| `/devac-status` | Query status across all Four Pillars |

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

## MCP Integration

This plugin includes an MCP server configuration that connects to `devac-mcp`. The MCP server provides:

- `find_symbol` - Find symbols by name
- `get_file_symbols` - Get symbols in a file
- `get_affected` - Get affected files
- `get_dependencies` - Get file dependencies
- `get_call_graph` - Get function call graphs
- `get_diagnostics_summary` - Get diagnostics overview
- `get_all_diagnostics` - Get all diagnostics
- `list_repos` - List connected repositories
- `get_context` - Get DevAC context
- `query_sql` - Query the Seeds database

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
/start-issue 123
/commit
/ship
```

## CLI Fallback

All skills support CLI fallback when MCP is unavailable:

```bash
devac find UserService
devac affected src/core/auth.ts
devac diagnostics --severity error
devac hub repos
```

## Learn More

- [DevAC Documentation](https://github.com/mindler-sern/vivief)
- [Concepts and Architecture](../../docs/vision/concepts.md)
- [MCP Server Reference](../../packages/devac-mcp/README.md)
