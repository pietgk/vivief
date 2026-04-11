# Intent: DatomStore Spike Refinement

**Status**: Open — ready to execute when DatomStore work begins

## Context

Two related design intents need focused attention when the DatomStore work begins:

1. **Virtual Projections Spike** (`virtual-projections-spike.md`) — concrete spike plan with 4 existential claims to prove
2. **Cold-Tier Indexing** (`../p2p/cold-tier-indexing.md`) — storage layer question for evicted warm-tier entities

The query architecture decision is resolved: **Option A (Clean Datom) from the start** — native Map indexes (EAVT/AEVT/AVET/VAET), skip DuckDB wrapper phase, DuckDB as Layer 3 analytics only.

This file tracks the spike refinement work needed before execution.

## Virtual Projections Spike

The spike plan in `virtual-projections-spike.md` is concrete. Four existential claims to prove:

| Claim | What to prove | Success metric |
|-------|---------------|----------------|
| 1. DatomStore performance | In-memory EAVT/AEVT/AVET/VAET Maps are fast enough | Sub-ms entity lookup, <5s index build for 50K entities |
| 2. N+1 elimination | Entity-centric access replaces multi-table joins | graphDeps rewrite is simpler AND faster |
| 3. LLM TypeScript generation | LLM can generate correct TypeScript queries against DatomStore API | 8/10 questions answered correctly |
| 4. Template routing | Big model creates query templates, small model routes to them | 8/10 Haiku routing tests pass |

### Spike deliverables
- DatomStore implementation (TypeScript, in-memory Maps)
- Loader from existing DevAC Parquet seeds
- Ported graphDeps as proof of simpler queries
- LLM query generation benchmark (10 questions)
- Template extraction + routing benchmark
- Memory benchmark (50K entities → measure RAM)
- Counselor domain paper design (datom schema for sessions)

### Showcase question
"What is the blast radius if I change function X?" — exercises graph projection, document projection, entity-centric access, N+1 elimination.

### What the spike does NOT prove (deferred)
- Vector/FTS virtual projections
- D2TS incremental queries
- P2P datom replication
- Surface rendering from Projections

## Cold-Tier Indexing

Open questions to resolve during or after the spike:

1. **How large does cold tier get?** For a typical practice (~500K datoms). Affects SQLite vs DuckDB choice.
2. **Is browser cold-tier querying a hard requirement?** Or can it be server-proxied?
3. **Can SQLite layer on top of iroh-blobs?** SQLite for cold indexes, iroh-blobs for frozen storage.
4. **What is rebuild time?** Frozen → cold indexes for 500K datoms.

These can be answered as part of the spike or as a follow-up.

## Related

- `intent/datom/query-architecture.md` — Option A decision (resolved)
- `intent/datom/virtual-projections-spike.md` — Full spike plan (532 lines)
- `intent/p2p/cold-tier-indexing.md` — Cold-tier candidates and requirements
- `contract/datom/query-layers.md` — L1/L2/L3 architecture
