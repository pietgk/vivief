---
topic: index
status: canonical
last-verified: 2026-03-30
---

## Vivief Documentation — Claude Index

This folder contains **Claude windows** — compact 50-80 line context files that Claude
loads at session start to quickly understand the vivief project. Each window links to
its full human-version doc for deeper reading.

### Documentation Structure

| Folder | Purpose | Mutability |
|--------|---------|------------|
| `intent/` | Open brainstorms organized by topic | Evolving |
| `contract/` | Locked design decisions (v6 concepts, ADRs) | Append-only |
| `fact/` | Implemented reality (what the code actually does) | Tracks code |
| `story/` | Narrative arc and evolution history | Append-only |
| `archive/` | Historical documents, past sessions, old plans | Frozen |
| `claude/` | This folder — compact windows for Claude sessions | Synced to above |

### What Is Vivief?

**vivief** = **Vi**sion **Vi**ew **Ef**fect. A platform vision modeled by five concepts:
Datom, Projection, Surface, Contract, effectHandler.

Three domains compose the platform:

- **DevAC** — Developer Analytics Centre. Code analysis, validation, MCP, browser automation.
- **Counseling** — Lifelong developer experience mapping, therapy-centered platform.
- **Procurement** — Data extraction at scale (DuckLake).

Hierarchy: vivief (platform) > domains > implementations.

### Dual Format

Each Claude window is a 50-80 line summary. The `human-version` frontmatter field
links to the full document. Windows are for fast context loading; human versions are
for deep understanding and decision records.

### Claude Windows

**Identity and Narrative**

- `vivief-identity.md` — What vivief IS: platform hierarchy, three domains, creation meta-insight
- `story-arc.md` — Path from DevAC to platform vision, eight turning points

**Concepts**

- `concepts-datom.md` — Universal fact `[E, A, V, Tx, Op]`, append-only, trust scores
- `concepts-projection.md` — Query + access scope + encryption + delivery modes
- `concepts-surface.md` — Six rendering modes (dashboard, chat, brief, feed, detail, ambient)
- `concepts-contract.md` — Constraints on all concepts, trust strategies, escalation
- `concepts-effecthandler.md` — `(state, effect) => (state', [effect'])`, the transition function
- `concepts-creation-loop.md` — The creation formula, chicken-and-egg as feature

**Architecture**

- `arch-datom-store.md` — DatomStore implementation, Map-based indexes, migration path
- `arch-p2p.md` — MoQ, Protomux, Loro CRDT, progressive P2P topology
- `arch-query.md` — Three-layer query architecture (TS API + D2TS + DuckDB)
- `arch-security.md` — Seal encryption, trust model, containers, VPN

**Domains**

- `domain-devac.md` — Code analysis, validation pipeline, MCP server, browser automation
- `domain-counseling.md` — Counseling platform v0.7, session model, clinical workflows
- `domain-procurement.md` — Data extraction at scale, DuckLake, scraping pipelines
- `domain-sharing.md` — Cross-domain patterns: datom, effects, surfaces shared across domains
