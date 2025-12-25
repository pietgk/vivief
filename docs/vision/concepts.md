# DevAC Concepts

> Quick reference for DevAC terminology and structure.
> For deep conceptual understanding, see [foundation.md](./foundation.md).

---

## 1. Core Thesis

**DevAC makes development queryable and deterministic.**

Push as much as possible into the **deterministic world** (systems handle it) so humans and LLMs can focus on what they do best (reasoning, decisions, creativity).

```
effectHandler = (state, effect) => (state', [effect'])
```

**Deterministic-first principle**: Always try to make things deterministic before falling back to reasoning.

---

## 2. Three Pillars

DevAC has three distinct pillars, each producing a different output:

| Pillar | What It Does | Produces |
|--------|--------------|----------|
| **Infra** | Runs DevAC itself | DevAC Health |
| **Validators** | Check code health | Diagnostics |
| **Extractors** | Extract queryable data | Seeds |

```
┌─────────────────────────────────────────────────────────────┐
│                     THREE PILLARS OF DEVAC                   │
├───────────────┬───────────────────┬─────────────────────────┤
│    INFRA      │    VALIDATORS     │      EXTRACTORS         │
│               │                   │                         │
│ Is DevAC      │ Is my code        │ Make code/content       │
│ running?      │ healthy?          │ queryable               │
│               │                   │                         │
│ - Watch       │ - TypeCheck       │ - AST extractor         │
│ - Hub         │ - Lint            │ - Infra extractor       │
│ - MCP server  │ - Test            │ - Content extractor     │
│ - GitHub sync │ - Coverage        │ - CI/CD extractor       │
│               │ - CI status       │ - Observability extr.   │
│               │                   │                         │
│ → DevAC Health│ → Diagnostics     │ → Seeds                 │
└───────────────┴───────────────────┴─────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │       ANALYTICS         │
              │                         │
              │ Query seeds + diagnostics│
              │ to answer questions     │
              │                         │
              │ "How does auth work?"   │
              │ "What calls this API?"  │
              │ "Generate C4 diagram"   │
              └─────────────────────────┘
```

**Key distinction:**
- **Extractors** produce **Seeds** (raw queryable data)
- **Analytics** uses Seeds + Diagnostics to **answer questions**

---

## 3. Core Concepts

### Topology

| Concept | Definition | Key Property |
|---------|------------|--------------|
| **Workspace** | Directory containing sibling repos (`~/ws/`) | Convention-discovered |
| **Repo** | Git repository | Source of truth |
| **Worktree** | Isolated working copy for an issue | Named `{repo}-{issueId}-{slug}` |

### Data

| Concept | Definition | Key Property |
|---------|------------|--------------|
| **Hub** | Central query layer (DuckDB) | Aggregates all seeds |
| **Seed** | Queryable extraction from source of truth | Parquet file |

### Validation

| Concept | Definition | Key Property |
|---------|------------|--------------|
| **Validator** | Tool that checks code health | Produces diagnostics |
| **Diagnostics** | Validation results | Errors, warnings, or "all clear" |

### Infrastructure

| Concept | Definition | Key Property |
|---------|------------|--------------|
| **Watch** | File/event monitoring | Triggers validators/extractors |
| **MCP** | Model Context Protocol | LLM tool interface |

---

## 4. Status Command

`devac status` instantly tells you what's going on.

### Status Levels

```bash
devac status              # One-liner (default)
devac status --brief      # Summary per category  
devac status --full       # Detailed breakdown
```

### Status Categories

| Category | What It Answers | Example |
|----------|-----------------|---------|
| **Context** | Where am I? What issue? | `worktree:api-gh123-auth` |
| **DevAC Health** | Is DevAC running? | `watch:active hub:connected` |
| **Code Diagnostics** | Is code healthy? | `errors:5 lint:3 tests:ok` |
| **Work Activity** | What's pending? | `prs:1 reviews:0` |
| **Next** | What should I do? | `next:fix-errors` |

### Example Outputs

**One-liner (default):**
```
api-gh123-auth  errors:5 lint:3 tests:ok coverage:45%  pr:open  next:errors
```

**Brief:**
```
DevAC Status
  Context:      api-gh123-auth (issue #123)
  DevAC Health: watch:active  hub:connected  mcp:ready
  Diagnostics:  errors:5  lint:3  tests:ok  coverage:45%
  Activity:     pr:#456 open  reviews:0
  Next:         Fix 5 type errors in src/auth/*
```

**Full:** (see [status command examples](./status-examples.md) for detailed output)

---

## 5. Triggers

What causes DevAC to update:

| Trigger | When | What Updates |
|---------|------|--------------|
| **File Watch** | File saved | Validators run, diagnostics update |
| **Claude Hook** | Claude action | Context, validation |
| **Manual CLI** | `devac status` | Reads current state |
| **GitHub Event** | Push, PR, Issue | Work activity, external validation |
| **CI Pipeline** | Build completes | CI status in diagnostics |

---

## 6. Division of Labor

| Actor | What They Do | Examples |
|-------|--------------|----------|
| **System** | Watch, validate, cache (deterministic) | Run tsc, update hub, sync GitHub |
| **LLM** | Query, reason, propose (intelligent) | "How do I fix this?", generate code |
| **Human** | Decide, edit, approve (authority) | Accept PR, choose approach |

**The principle**: Ask if the answer can be determined deterministically. If yes, let the system handle it. If no, involve LLM/human reasoning.

---

## 7. Glossary

### Core Terms

| Term | Definition |
|------|------------|
| **Workspace** | Directory containing sibling repos (e.g., `~/ws/`) |
| **Repo** | Git repository |
| **Worktree** | Git worktree for isolated issue work, named `{repo}-{issueId}-{slug}` |
| **Hub** | DuckDB instance aggregating seeds for cross-repo queries |
| **Seed** | Queryable Parquet file extracted from a source of truth |
| **Extractor** | Tool that produces seeds from sources (AST, infra, content, etc.) |
| **Validator** | Tool that checks code health and produces diagnostics |
| **Diagnostics** | Validation results: errors, warnings, or "all clear" |
| **Watch** | File/event monitoring that triggers extractors and validators |
| **MCP** | Model Context Protocol — interface for LLM tools |

### Status Terms

| Term | Definition |
|------|------------|
| **DevAC Health** | Status of DevAC infrastructure (watch, hub, mcp running?) |
| **Code Diagnostics** | Validation results for code health (errors, lint, tests, coverage) |
| **Work Activity** | PRs, reviews, issues — what's pending in the workflow |
| **Analytics** | Using seeds + diagnostics to answer questions about the codebase |

### Deprecated Terms

| Old Term | Use Instead | Reason |
|----------|-------------|--------|
| "Analyser" | **Extractor** | Clearer — it extracts data into seeds |
| "Feedback" | **Diagnostics** | Feedback implied only issues; diagnostics includes "all clear" |
| "Push to hub" | (implicit) | Hub update is always implicit, not optional |
| "Infra status" | **DevAC Health** | Avoids confusion with infrastructure seeds |
| "Workflow status" | **Work Activity** | More specific about what it tracks |

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [foundation.md](./foundation.md) | Deep conceptual dive — effect handlers, pipelines, rules |
| [validation.md](./validation.md) | Unified feedback model — Watch → Validate → Cache → Query |
| [foundation-visual.md](./foundation-visual.md) | Mermaid diagrams illustrating concepts |

---

*This is the quick reference. For the full conceptual foundation, see [foundation.md](./foundation.md).*
