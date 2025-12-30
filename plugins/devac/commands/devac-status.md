# /devac:devac-status - Query DevAC Status

You are helping the user check the status of DevAC across all Four Pillars and the Analytics Layer.

## What This Checks

DevAC is organized into Four Pillars plus an Analytics Layer:

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

## Steps

### 1. Check Infrastructure Health

```bash
devac hub status
```

Shows:
- Hub connection status
- Registered repositories
- MCP server availability

### 2. Check Validators (Diagnostics)

```bash
devac hub diagnostics
devac hub diagnostics --severity error
```

Shows:
- Type errors
- Lint issues
- Test failures
- Coverage status

### 3. Check Extractors (Seeds)

```bash
devac status --brief
```

Shows:
- Analysis status
- Last update time
- Symbol counts

To get symbol counts via MCP, use the `query_sql` tool:
```sql
SELECT COUNT(*)::INT as node_count FROM nodes
SELECT COUNT(*)::INT as edge_count FROM edges
```

**Important**: Always cast counts to INT (e.g., `COUNT(*)::INT`) to avoid BigInt serialization issues.

### 4. Check Workflow Activity

```bash
# Check CI status across all repos in workspace
devac workspace ci

# Or check for open PRs per repo (use --repo flag from workspace root)
gh pr list --state open --repo <owner/repo>
```

**Note:** When running from a workspace parent directory (not a git repo), use `devac workspace ci` or specify repos explicitly with `gh pr list --repo owner/repo`.

Shows:
- Open pull requests
- CI/CD status
- Review status

## Example Output

```
## DevAC Status Report

### Infrastructure (Pillar 1)
- Hub: Connected ({workspace}/.devac/)
- Repos: 3 registered
- MCP: Ready

### Validators (Pillar 2)
- Type Errors: 5
- Lint Issues: 3
- Tests: Passing (45/45)
- Coverage: 78%

### Extractors (Pillar 3)
- Last Analysis: 2 hours ago
- Symbols: 1,245
- Edges: 3,892

### Workflow (Pillar 4)
- Open PRs: 2
- Pending Reviews: 1
- CI Status: Passing

---

**Next Steps:**
- Fix 5 type errors in packages/devac-cli/
- Review PR #45 "Add watch mode"
```

## When to Use

Use `/devac:devac-status` when:
- You want an overview of project health
- You're starting a work session
- You need to know what needs attention
- You want to check CI/CD status across repos

## Database Schema Reference

When using the `query_sql` MCP tool, these are the available tables:

### Seed Tables (per-package, stored in `.devac/seed/`)
| Table | Description |
|-------|-------------|
| `nodes` | Code entities (functions, classes, variables, interfaces, etc.) |
| `edges` | Relationships between entities (CALLS, IMPORTS, EXTENDS, IMPLEMENTS, etc.) |
| `external_refs` | Import references to external packages |
| `effects` | Code behaviors and execution patterns (v3.0) |

### Hub Tables (cross-repo, stored in `{workspace}/.devac/`)
| Table | Description |
|-------|-------------|
| `repo_registry` | Registered repositories and their metadata |
| `validation_errors` | Type errors, lint issues from validators |
| `unified_diagnostics` | All diagnostics unified (validation + CI + GitHub issues) |

### SQL Best Practices

- **Cast aggregates to INT**: Use `COUNT(*)::INT` or `SUM(x)::INT` to avoid BigInt serialization errors
- **Prefer MCP tools**: Use dedicated tools like `get_diagnostics_counts` instead of raw SQL when available
- **Use table aliases**: In hub mode, tables are read from multiple Parquet files
