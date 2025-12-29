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
devac status --format brief
```

Shows:
- Analysis status
- Last update time
- Symbol counts

### 4. Check Workflow Activity

```bash
# Check for open PRs
gh pr list --state open

# Check CI status
devac context ci
```

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
