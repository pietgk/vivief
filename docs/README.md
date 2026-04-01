# Vivief Documentation

**Vivief** (ViViEf = Vision View Effect) is a platform for human-AI-system creation. **DevAC** (Developer Analytics Centre) is the first domain — code analysis, validation, and workflow. **Counseling** and **Procurement** are planned domains.

## Structure — The Creation Loop

The documentation follows vivief's own creation model: **intent** (ideas) → **contract** (decisions) → **fact** (reality).

```
docs/
├── claude/        ← Claude windows: 50-80 line summaries for AI sessions
├── intent/        ← Open questions & active brainstorms, by topic
├── contract/      ← Locked decisions, specs & ADRs, by topic
├── fact/          ← Implemented reality: code docs, guides, references
├── story/         ← Narrative: path from start to now + evolution logs
└── archive/       ← All historical versions, resolved brainstorms
```

## Getting Started

**New here?** Read in this order:
1. This README (you're here)
2. [Story Arc](story/arc.md) — how DevAC became a platform vision (5 min read)
3. [Concepts v6](contract/vivief-concepts-v6.md) — the five concepts (read "Core Thesis" + skim concepts)
4. [DevAC Quick Start](fact/guides/quick-start.md) — hands-on with the first domain

| You want to... | Start here |
|-----------------|-----------|
| **Use DevAC** | [Quick Start](fact/guides/quick-start.md) → [CLI Reference](fact/guides/cli-reference.md) |
| **Understand the vision** | [claude/INDEX.md](claude/INDEX.md) → [Concepts v6](contract/vivief-concepts-v6.md) |
| **See the full story** | [Story Arc](story/arc.md) → [Evolution logs](story/evolution/) |
| **Brainstorm with Claude** | Load [claude/INDEX.md](claude/INDEX.md) first, then relevant topic windows |
| **Find a decision** | [ADRs](contract/adr/README.md) + [Relevance overlay](contract/adr/RELEVANCE.md) |
| **Explore open questions** | Browse [intent/](intent/) by topic |
| **Understand DevAC domain** | [DevAC overview](fact/devac/overview.md) → [Concepts quick ref](contract/concepts-quick-ref.md) |
| **Explore Counseling domain** | [Platform v2 spec](contract/counseling/platform-v2.md) |
| **Explore Procurement domain** | [Procurement README](contract/procurement/README.md) → [MVP spec](contract/procurement/mvp/) |
| **Review doc quality** | [REVIEW.md](REVIEW.md) |

## Claude Windows (Dual Format)

Every topic has two representations:
- **Claude window** (`claude/*.md`): 50-80 lines with frontmatter — loads fast, gives Claude enough context to participate
- **Human version**: Full document linked from the Claude window's `human-version:` field

Start with the Claude window. Follow the link when you need depth.

## Document Lifecycle

```
NEW IDEA → intent/[topic]/        Brainstorm, explore
DECISION → contract/[topic]/      Lock it down, ADR or spec
BUILT    → fact/[topic]/          Document what ships
OLD      → archive/[topic]/       Preserve with evolution log in story/evolution/
```

## DevAC ↔ Vivief Platform Bridge

DevAC is the first domain — a working implementation. Vivief concepts define the target architecture. Here's how current DevAC maps to the platform:

| DevAC (current) | Vivief Platform (target) | Status |
|-----------------|--------------------------|--------|
| Nodes, Edges, External Refs | **Datom** `[e,a,v,tx,op]` with attribute namespaces | DatomStore in devac-core, migrating |
| Parquet seeds + DuckDB hub | **Datom** storage (iroh-blobs + Map indexes + DuckDB analytics) | DuckDB is L3 analytics layer |
| `query_sql`, `query_symbol` MCP tools | **Projection** (3-layer: L1 DatomStore, L2 D2TS, L3 DuckDB) | L3 current, L1 migration planned |
| CLI output, MCP responses | **Surface** (6 rendering modes) | Stream mode via CLI/MCP |
| Unified diagnostics (tsc, lint, test) | **Contract** (Schema, Behavior, Trust enforcement) | Validation = one Contract type |
| Code effects (FunctionCall, Store, Send) | **effectHandler** `(state, intent) => (state', [intent'])` | Effects absorbed into effectHandler model |
| Four Pillars (Infra, Validators, Extractors, Workflow) | Domain pattern (DevAC-specific) | Pillars are DevAC's domain structure |

> The terminology shift from "effects" to "effectHandler" reflects evolution: foundation.md (DevAC era) described effects as standalone descriptions of what code does. In v6, effects are the *output* of effectHandlers — the handler is the concept, the effect is what it produces.

## Five Concepts

Vivief models everything with five concepts:

| Concept | Role | One-liner |
|---------|------|-----------|
| **Datom** | Fact | `[Entity, Attribute, Value, Tx, Op]` — universal, immutable, append-only |
| **Projection** | Query | Query + access + encryption + delivery + trust |
| **Surface** | Render | 6 modes: Stream, Card, Canvas, Dialog, Board, Diagram |
| **Contract** | Constrain | Declares rules; effectHandler enforces them |
| **effectHandler** | Transition | `(state, intent) => (state', [intent'])` — the universal abstraction |

Everything else (domain, bridge, artifact, slice, profile, skill) is a **pattern**, not a concept.

## Three Domains

| Domain | Status | Focus |
|--------|--------|-------|
| **DevAC** | Production-ready | Code analysis, validation, workflow, browser automation |
| **Counseling** | Spec v0.7 (implementation-ready) | Lifelong developer experience mapping |
| **Procurement** | MVP specified | Intelligent data extraction at scale |

## Documentation Maintenance

### Adding a New Document

1. **Decide the lifecycle stage**: Is it a brainstorm (intent), a locked decision (contract), or documenting what shipped (fact)?
2. **Place it in the right folder**: `intent/[topic]/`, `contract/[topic]/`, or `fact/[topic]/`
3. **Create a Claude window** if the topic is significant: add a 50-80 line summary in `claude/` with `human-version:` frontmatter linking to the full doc (see [claude/INDEX.md](claude/INDEX.md) for format)
4. **Update the index** if you add a Claude window: add it to `claude/INDEX.md` under the right category

### Naming Conventions

- Use kebab-case for filenames: `my-new-topic.md`
- Group by topic, not chronology: `intent/security/`, not `intent/2026-04/`
- Version labels go in the document title, not the filename (exception: archived concept versions)

### Lifecycle Transitions

```
intent/[topic]/doc.md  →  DECISION MADE  →  contract/[topic]/doc.md
contract/[topic]/doc.md  →  IMPLEMENTED  →  fact/[topic]/doc.md
any doc  →  SUPERSEDED  →  archive/[topic]/doc.md + entry in story/evolution/
```

### Review

The documentation quality review lives at [REVIEW.md](REVIEW.md). Update it when making structural changes.
