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

| You want to... | Start here |
|-----------------|-----------|
| **Use DevAC** | [Quick Start](fact/guides/quick-start.md) → [CLI Reference](fact/guides/cli-reference.md) |
| **Understand the vision** | [claude/INDEX.md](claude/INDEX.md) → [Concepts v6](contract/vivief-concepts-v6.md) |
| **See the full story** | [Story Arc](story/arc.md) → [Evolution logs](story/evolution/) |
| **Brainstorm with Claude** | Load [claude/INDEX.md](claude/INDEX.md) first, then relevant topic windows |
| **Find a decision** | [ADRs](contract/adr/README.md) + [Relevance overlay](contract/adr/RELEVANCE.md) |
| **Explore open questions** | Browse [intent/](intent/) by topic |

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

## Five Concepts

Vivief models everything with five concepts:

| Concept | Role | One-liner |
|---------|------|-----------|
| **Datom** | Fact | `[Entity, Attribute, Value, Tx, Op]` — universal, immutable, append-only |
| **Projection** | Query | Query + access + encryption + delivery + trust |
| **Surface** | Render | 6 modes: Stream, Card, Canvas, Dialog, Board, Diagram |
| **Contract** | Constrain | Declares rules; effectHandler enforces them |
| **effectHandler** | Transition | `(state, effect) => (state', [effect'])` — the universal abstraction |

Everything else (domain, bridge, artifact, slice, profile, skill) is a **pattern**, not a concept.

## Three Domains

| Domain | Status | Focus |
|--------|--------|-------|
| **DevAC** | Production-ready | Code analysis, validation, workflow, browser automation |
| **Counseling** | Spec v0.7 (implementation-ready) | Lifelong developer experience mapping |
| **Procurement** | MVP specified | Intelligent data extraction at scale |
