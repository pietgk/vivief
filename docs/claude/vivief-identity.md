---
topic: vivief-identity
status: canonical
depends-on: []
human-version: ../contract/vivief-concepts-v6.md
last-verified: 2026-03-30
---

## What Vivief Is

**vivief** = **Vi**sion **Vi**ew **Ef**fect. A platform vision where everything — code
analysis, counseling sessions, procurement pipelines, morning briefs — is creation
through the same five concepts.

### Five Concepts

```
Datom -> Projection -> Surface -> Contract -> effectHandler
  |          |            |          cross-cuts      |
 fact     query+scope   render     all of these   transition
           +delivery    +stream                    +actor
           +trust scope
```

1. **Datom** — Universal fact: `[Entity, Attribute, Value, Tx, Op]`. Immutable, append-only.
2. **Projection** — Query + access scope + encryption + delivery mode. How datoms reach consumers.
3. **Surface** — Rendering mode. Six types: dashboard, chat, brief, feed, detail, ambient.
4. **Contract** — Constraints on any concept. Trust strategies, schema rules, escalation.
5. **effectHandler** — `(state, intent) => (state', [intent'])`. The transition function. Every activity is an intent handled by some handler that produces datoms.

A Contract declares; an effectHandler enforces. Intent is the `intent`
parameter entering the creation loop. Validation datoms are exempt from recursion.

### Three Domains

| Domain | Focus | Maturity |
|--------|-------|----------|
| **DevAC** | Developer analytics — code graph (DuckDB+Parquet), validation pipeline (tsc, lint, test, coverage, a11y), MCP server, browser automation, worktree workflows | Production-ready: 50+ ADRs, 849 tests, 21 MCP tools |
| **Counseling** | Lifelong developer experience mapping, therapy-centered platform, session/theme/goal model | Design v0.7, contracts written |
| **Procurement** | Data extraction at scale, DuckLake integration, scraping pipelines | Intent stage, brainstorms |

### Hierarchy

```
vivief (platform — five concepts)
  +-- DevAC (domain — developer analytics)
  |     +-- devac-core, devac-cli, devac-mcp, browser-core, browser-cli, browser-mcp
  +-- Counseling (domain — therapy-centered)
  +-- Procurement (domain — data extraction)
```

Domains are composition patterns, not sixth concepts. They combine the five concepts
for a specific user population. Other patterns (bridge, artifact, slice, profile, skill)
also compose concepts without extending them.

### Documentation Is Part of the Platform

Docs follow the same intent/contract/fact creation loop as code. Intent docs are open
brainstorms. Contract docs are locked decisions. Fact docs track implemented reality.
Documentation IS creation — it produces datoms (conceptually), goes through the loop,
and can have Contracts.

### The Creation Meta-Insight

Vivief creates itself using its own concepts. Designing vivief IS using the creation
loop. The chicken-and-egg problem is embraced as a feature: the platform's concepts
model its own development process. Every design session is `(state, intent) =>
(state', [intent'])` where the intent is "clarify concept X" and the output is new
datoms (decisions, documents, code).

DevAC is the first domain because it makes the platform's own development queryable
and deterministic — the platform bootstraps through its developer analytics domain.
