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

## 2. Four Pillars Supporting the Analytics Layer

DevAC has four distinct pillars, each producing a different output. The **Analytics Layer** sits on top, querying across all pillar outputs.

| Pillar | What It Does | Produces |
|--------|--------------|----------|
| **Infra** | Runs DevAC itself | DevAC Health |
| **Validators** | Check code health | Diagnostics |
| **Extractors** | Extract queryable data | Seeds |
| **Workflow** | Orchestrate development activities | Work Activity |

```
        ┌─────────────────────────────────────────────────────────────┐
        │                      ANALYTICS LAYER                         │
        │                                                              │
        │   Query and reason over all pillar outputs                   │
        │   (Seeds, Diagnostics, DevAC Health, Work Activity)          │
        │                                                              │
        │   "How does auth work?"    "What needs fixing?"              │
        │   "What calls this API?"   "What PRs are pending?"           │
        │   "Generate C4 diagram"    "Is the build healthy?"           │
        └─────────────────────────────────────────────────────────────┘
              │           │           │           │
         ┌────┴────┐ ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
         │  INFRA  │ │ VALID-  │ │ EXTRAC- │ │  WORK-  │
         │         │ │ ATORS   │ │  TORS   │ │  FLOW   │
         │         │ │         │ │         │ │         │
         │ Is      │ │ Is code │ │ Make    │ │ Manage  │
         │ DevAC   │ │ healthy?│ │ code    │ │ dev     │
         │ running?│ │         │ │queryable│ │ workflow│
         │         │ │         │ │         │ │         │
         │ - Watch │ │- Type   │ │- AST    │ │- Issues │
         │ - Hub   │ │- Lint   │ │- Infra  │ │- Commits│
         │ - MCP   │ │- Test   │ │- Content│ │- PRs    │
         │ - Sync  │ │- Cover  │ │- CI/CD  │ │- ADRs   │
         │         │ │- CI     │ │- Observ │ │- Release│
         │         │ │         │ │         │ │         │
         │→ DevAC  │ │→ Diag-  │ │→ Seeds  │ │→ Work   │
         │  Health │ │  nostics│ │         │ │ Activity│
         └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

**Key distinctions:**
- **Pillars** are deterministic — systems handle them
- **Analytics Layer** is where LLMs and humans query and reason
- **Workflow Pillar** (new) handles issue-based development, git workflow, releases, and decision capture

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

### Workflow

| Concept | Definition | Key Property |
|---------|------------|--------------|
| **Issue** | GitHub issue tied to a repo | Identified as `{repo}-{issueId}` |
| **Work Activity** | PRs, reviews, issues, releases pending | Queryable via Analytics Layer |
| **Changeset** | Release changelog entry | Triggers version bump |
| **ADR** | Architecture Decision Record | Captures design decisions |

---

## 4. Analytics Layer

The Analytics Layer is the "roof" that sits on top of the Four Pillars. It provides a unified interface for querying across all pillar outputs.

| What It Queries | From Pillar | Example Questions |
|-----------------|-------------|-------------------|
| DevAC Health | Infra | "Is the hub running?" |
| Diagnostics | Validators | "What type errors exist?" |
| Seeds | Extractors | "How does auth work?" |
| Work Activity | Workflow | "What PRs are pending?" |

**Key characteristics:**
- **Unified querying**: Single interface to query all pillar outputs
- **LLM + Human**: Where reasoning happens (vs. deterministic pillars)
- **Tools**: MCP server, CLI queries, skills, commands

---

## 5. Status Command

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

## 6. Triggers

What causes DevAC to update:

| Trigger | When | What Updates |
|---------|------|--------------|
| **File Watch** | File saved | Validators run, diagnostics update |
| **Claude Hook** | Claude action | Context, validation |
| **Manual CLI** | `devac status` | Reads current state |
| **GitHub Event** | Push, PR, Issue | Work activity, external validation |
| **CI Pipeline** | Build completes | CI status in diagnostics |

---

## 7. Division of Labor

| Actor | What They Do | Examples |
|-------|--------------|----------|
| **System** | Watch, validate, cache (deterministic) | Run tsc, update hub, sync GitHub |
| **LLM** | Query, reason, propose (intelligent) | "How do I fix this?", generate code |
| **Human** | Decide, edit, approve (authority) | Accept PR, choose approach |

**The principle**: Ask if the answer can be determined deterministically. If yes, let the system handle it. If no, involve LLM/human reasoning.

---

## 8. Glossary

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

### Architecture Terms

| Term | Definition |
|------|------------|
| **Four Pillars** | Infra, Validators, Extractors, Workflow — the deterministic foundation |
| **Analytics Layer** | The "roof" that queries across all pillar outputs — where LLMs/humans reason |
| **Pillar Output** | What a pillar produces: DevAC Health, Diagnostics, Seeds, or Work Activity |

### Workflow Terms

| Term | Definition |
|------|------------|
| **Issue** | GitHub issue tied to a repo, identified as `{repo}-{issueId}` |
| **Work Activity** | PRs, reviews, issues, releases — pending items in the development workflow |
| **Changeset** | Release changelog entry that triggers version bump |
| **ADR** | Architecture Decision Record — captures design decisions |

### Status Terms

| Term | Definition |
|------|------------|
| **DevAC Health** | Status of DevAC infrastructure (watch, hub, mcp running?) — from Infra pillar |
| **Code Diagnostics** | Validation results for code health (errors, lint, tests, coverage) — from Validators pillar |
| **Work Activity** | PRs, reviews, issues, releases — what's pending in the workflow — from Workflow pillar |

### Deprecated Terms

| Old Term | Use Instead | Reason |
|----------|-------------|--------|
| "Analyser" | **Extractor** | Clearer — it extracts data into seeds |
| "Feedback" | **Diagnostics** | Feedback implied only issues; diagnostics includes "all clear" |
| "Push to hub" | (implicit) | Hub update is always implicit, not optional |
| "Infra status" | **DevAC Health** | Avoids confusion with infrastructure seeds |
| "Analytics" (as concept) | **Analytics Layer** | Clarifies it's a layer on top of pillars, not a separate thing |
| "Three Pillars" | **Four Pillars** | Workflow is now the 4th pillar |

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [foundation.md](./foundation.md) | Deep conceptual dive — effect handlers, pipelines, rules |
| [validation.md](./validation.md) | Unified feedback model — Watch → Validate → Cache → Query |
| [foundation-visual.md](./foundation-visual.md) | Mermaid diagrams illustrating concepts |

---

*This is the quick reference. For the full conceptual foundation, see [foundation.md](./foundation.md).*
