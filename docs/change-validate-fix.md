# The DevAC Change-Validate-Fix Loop

> Automatic validation feedback for Claude Code sessions

---

## TL;DR

DevAC automatically validates your code as you work with Claude. When you submit a prompt, DevAC injects diagnostic counts into Claude's context. When Claude finishes editing, validation runs on changed files. Claude sees the results and can fix issues in the same session—creating a continuous loop until your code passes all checks.

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   EDIT   │───▶│ VALIDATE │───▶│ DIAGNOSE │───▶│   FIX    │
│   CODE   │    │  (auto)  │    │  (auto)  │    │   CODE   │
└──────────┘    └──────────┘    └──────────┘    └────┬─────┘
      ▲                                              │
      └──────────────────────────────────────────────┘
```

**Key benefits:**
- No manual validation commands needed
- Claude sees errors immediately after changes
- Fix-and-verify happens in a single conversation
- Works across TypeScript, ESLint, tests, CI, and GitHub issues

---

## Quick Start

### Prerequisites

1. **DevAC CLI installed** - Run `devac --version` to verify
2. **DevAC plugin for Claude Code** - The plugin provides hooks for automatic validation
3. **Workspace analyzed** - Run `devac sync` once to generate seeds

### 3-Step Setup

```bash
# 1. Analyze your codebase (creates .devac/seed/ files)
devac sync

# 2. Verify the plugin is installed
# Check ~/.claude/plugins/cache/devac/ exists

# 3. Start Claude Code in your repo
claude
```

That's it. The hooks are now active.

### Your First Validation Cycle

1. **Ask Claude to make a change** that introduces an error (intentionally or not)
2. **Notice the Stop hook output** - after Claude edits files, you'll see validation results
3. **Claude sees the errors** - on your next prompt, diagnostic counts are injected
4. **Ask Claude to fix them** - or Claude may proactively address them

---

## How It Works: The Big Picture

### The Automatic Loop

The change-validate-fix loop operates through Claude Code hooks—shell commands that run at specific points in the conversation:

```
You submit prompt ──────────────────────────────────────────┐
    │                                                       │
    ▼ [UserPromptSubmit hook]                               │
devac status --inject                                       │
    │                                                       │
    ▼                                                       │
Claude sees: "DevAC: 3 errors, 2 warnings"                  │
    │                                                       │
    ▼                                                       │
Claude edits code to fix issues                             │
    │                                                       │
    ▼ [Stop hook]                                           │
devac validate --on-stop --mode quick                       │
    │                                                       │
    ▼                                                       │
New errors? → Loop continues                                │
No errors? → Done! ◀────────────────────────────────────────┘
```

### Hook Events

| Hook Event | When It Fires | What DevAC Does |
|------------|---------------|-----------------|
| **UserPromptSubmit** | Every time you send a message | Injects diagnostic counts if any exist |
| **Stop** | After Claude finishes responding | Validates changed files, reports new issues |

### Core Concepts

#### Seeds: Your Code's DNA

DevAC extracts a queryable representation of your code into **seed files** (Parquet format). These contain:
- **Nodes**: Functions, classes, variables, types
- **Edges**: Calls, imports, extends relationships
- **External refs**: Dependencies on npm packages, etc.

Seeds live in `.devac/seed/` within each package and enable instant code graph queries.

#### Hub: The Workspace Brain

The **Central Hub** (`{workspace}/.devac/central.duckdb`) aggregates data across repositories:
- Repository registry (which repos have seeds)
- Validation errors from all packages
- CI status, GitHub issues, PR reviews
- Cross-repo dependency edges

The hub is what makes "show me all errors in my workspace" possible.

#### Sync: Keeping Everything Fresh

`devac sync` analyzes your code and updates the hub:
```bash
devac sync              # Analyze current package, register with hub
devac sync --validate   # Also run validation
devac sync --watch      # Watch for changes continuously
```

#### Query: Asking Questions About Your Code

Query the code graph or diagnostics:
```bash
devac query symbol handleLogin       # Find a function
devac query deps entity-id           # What does it depend on?
devac diagnostics --severity error   # Show all errors
```

---

## Day-to-Day Usage

### The Commands You Need

Most of the time, you won't run commands manually—the hooks handle it. But when you need direct control:

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `devac status` | Show health + diagnostics | Quick check of workspace state |
| `devac status --full` | Detailed breakdown | Investigating specific issues |
| `devac diagnostics` | Query all diagnostics | Filtering or formatting needs |
| `devac sync --validate` | Force validation run | After pulling changes |
| `devac status --doctor` | Health check | Troubleshooting DevAC itself |

### Working with Claude Code

#### How Hooks Work (Automatic!)

The DevAC plugin installs hooks at `~/.claude/plugins/cache/devac/hooks/hooks.json`:

```json
{
  "hooks": [
    {
      "event": "UserPromptSubmit",
      "command": "devac status --inject",
      "blocking": false
    },
    {
      "event": "Stop",
      "command": "devac validate --on-stop --mode quick",
      "blocking": false
    }
  ]
}
```

You don't need to configure anything—it just works once the plugin is installed.

#### Seeing Diagnostics in Context

When diagnostics exist, your prompt is augmented with a `<system-reminder>`:

```
<system-reminder>
DevAC Status
  Diagnostics: errors:3  warnings:2  tests:ok

Use status_all_diagnostics to see details.
</system-reminder>
```

Claude sees this and can act on it—either proactively fixing issues or responding when you ask.

#### Using MCP Tools to Dig Deeper

Claude has access to MCP tools for detailed queries:

| MCP Tool | What It Returns |
|----------|-----------------|
| `status_all_diagnostics` | Full diagnostic records with file, line, message |
| `status_all_diagnostics_summary` | Grouped counts by source/severity/repo |
| `status_all_diagnostics_counts` | Total counts (errors: N, warnings: N) |
| `status_diagnostics` | Validation errors only (tsc, eslint, tests) |

**Example interaction:**

> You: "What errors do I need to fix?"
>
> Claude: *calls status_all_diagnostics* "There are 3 TypeScript errors in src/auth/oauth.ts..."

### Fixing Issues

#### Reading Diagnostic Output

The Stop hook shows validation results:

```
Validation found issues that should be resolved:
- 2 TypeScript errors in src/components/Button.tsx
- 1 ESLint warning in src/utils/helpers.ts

Consider running status_all_diagnostics to see details.
```

#### The Fix-and-Verify Cycle

1. **Claude edits files** → Stop hook validates → Results shown
2. **New errors?** → You (or Claude) address them → Validation runs again
3. **All clear?** → Conversation continues or completes

This cycle naturally continues until validation passes.

#### Validation Modes

| Mode | What Runs | Duration | When Used |
|------|-----------|----------|-----------|
| **Quick** | TypeScript + ESLint on changed files | ~5s | Stop hook (default) |
| **Full** | TypeScript + ESLint + Tests + Coverage | ~5m | Manual or CI |

The Stop hook uses quick mode to minimize latency.

---

## Under the Hood (Architecture)

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     YOUR CODEBASE                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ devac sync
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  SEEDS (.devac/seed/)                                       │
│  ├─ nodes.parquet (functions, classes, variables)           │
│  ├─ edges.parquet (calls, imports, extends)                 │
│  └─ external_refs.parquet (npm, pip dependencies)           │
└─────────────────────────┬───────────────────────────────────┘
                          │ register
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  HUB ({workspace}/.devac/central.duckdb)                    │
│  ├─ Repository registry                                     │
│  ├─ Validation errors (tsc, eslint, tests)                  │
│  ├─ CI status, GitHub issues, PR reviews                    │
│  └─ Cross-repo edges                                        │
└─────────────────────────┬───────────────────────────────────┘
                          │ query via MCP
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  CLAUDE CODE                                                │
│  ├─ Sees diagnostic counts on every prompt                  │
│  ├─ Queries full details via status_all_diagnostics         │
│  └─ Fixes issues with full code graph context               │
└─────────────────────────────────────────────────────────────┘
```

### The Validation Pipeline

#### Hook Events in Detail

**UserPromptSubmit hook:**
- Runs `devac status --inject`
- Checks hub for existing diagnostics
- Outputs JSON that Claude interprets as context
- Silent when no diagnostics exist (zero noise)

**Stop hook:**
- Runs `devac validate --on-stop --mode quick`
- Identifies git-changed files
- Runs TypeScript type-check and ESLint on those files
- Pushes results to hub
- Outputs summary for Claude to see

#### Quick vs Full Validation

| Aspect | Quick Mode | Full Mode |
|--------|------------|-----------|
| **Scope** | Changed files + direct importers | All files in package |
| **Checks** | TypeScript, ESLint | TypeScript, ESLint, Tests, Coverage |
| **Duration** | ~5 seconds | ~5 minutes |
| **Use case** | Interactive development | CI/CD, release gates |

#### How Results Reach the Hub

```
Validation runs
    │
    ▼
Parse tsc/eslint output
    │
    ▼
Transform to unified diagnostics format
    │
    ▼
Push to hub (INSERT/UPDATE unified_diagnostics)
    │
    ▼
MCP tools can now query results
```

### The Query System

#### How Claude Accesses Your Code Graph

The MCP server (`devac-mcp`) provides tools that query:
- **Seeds directly** via DuckDB's `read_parquet()`
- **Hub** for cross-repo queries and diagnostics
- **GitHub** (via `gh` CLI) for issues and PR reviews

#### MCP Tools Available

**Code Analysis:**
- `query_symbol` - Find symbols by name
- `query_deps` - Get dependencies of a symbol
- `query_dependents` - Get reverse dependencies
- `query_file` - Get all symbols in a file
- `query_affected` - Impact analysis for changes
- `query_call_graph` - Trace function calls
- `query_sql` - Raw SQL against the code graph

**Diagnostics:**
- `status_all_diagnostics` - All diagnostics (validation + CI + issues + reviews)
- `status_all_diagnostics_summary` - Grouped counts
- `status_all_diagnostics_counts` - Total by severity
- `status_diagnostics` - Validation errors only

#### SQL for Power Users

Query the code graph directly:

```sql
-- Find all exported functions
SELECT name, file_path
FROM nodes
WHERE kind = 'function' AND is_exported = true;

-- Find callers of a function
SELECT n.name, n.file_path
FROM edges e
JOIN nodes n ON e.source_entity_id = n.entity_id
WHERE e.target_entity_id = 'repo:pkg:function:abc123'
  AND e.edge_type = 'CALLS';
```

Use `devac query sql "..."` from CLI or `query_sql` via MCP.

---

## Reference

### Key ADRs

For deeper understanding of design decisions:

| ADR | Topic | Key Insight |
|-----|-------|-------------|
| [ADR-0043](adr/0043-hook-based-validation-triggering.md) | Hook-based validation | Why hooks over polling, progressive disclosure |
| [ADR-0024](adr/0024-hub-single-writer-ipc.md) | Hub single-writer | IPC architecture for concurrent CLI/MCP access |
| [ADR-0017](adr/0017-validation-hub-cache.md) | Validation hub cache | Why store diagnostics in hub, not per-repo |
| [ADR-0018](adr/0018-unified-diagnostics-model.md) | Unified diagnostics | Schema for validation + CI + issues + reviews |

### Related Documentation

| Document | What It Covers |
|----------|----------------|
| [cli-reference.md](cli-reference.md) | Complete CLI command reference |
| [vision/foundation.md](vision/foundation.md) | Conceptual model and architecture vision |
| [implementation/overview.md](implementation/overview.md) | Component architecture and data flow |
| [implementation/storage.md](implementation/storage.md) | DuckDB + Parquet storage layer |
| [implementation/query-guide.md](implementation/query-guide.md) | SQL patterns for code graph queries |

### Quick Command Reference

```bash
# Status & Diagnostics
devac status              # Brief status
devac status --full       # Detailed breakdown
devac diagnostics         # All diagnostics
devac diagnostics --source tsc --severity error

# Analysis
devac sync                # Analyze + register
devac sync --validate     # Analyze + validate
devac sync --watch        # Watch mode

# Queries
devac query symbol NAME   # Find symbol
devac query deps ENTITY   # Dependencies
devac query sql "..."     # Raw SQL

# Health
devac status --doctor     # Check DevAC health
devac status --doctor --fix  # Auto-fix issues
```

### Troubleshooting

**Hooks not firing?**
- Check plugin is installed: `ls ~/.claude/plugins/cache/devac/`
- Restart Claude Code after plugin installation

**Diagnostics not updating?**
- Run `devac sync --validate` manually
- Check hub connection: `devac status --hub`

**MCP tools not available?**
- Ensure devac-mcp is in PATH
- Check MCP server is configured in Claude settings

**Stale diagnostic counts?**
- Run `devac sync` to refresh the hub
- Clear and re-sync: `devac hub sync --ci --issues --reviews`

---

*For issues or questions, see the [DevAC repository](https://github.com/pietgk/vivief) or run `devac status --doctor` for automated diagnostics.*
