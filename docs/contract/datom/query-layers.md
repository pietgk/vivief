# Decision: Layered Query Architecture

**Status**: Accepted (2026-03-27)

## Decision

Three query layers, each optimized for different access patterns:

| Layer | Engine | Primary Use | Access Pattern |
|-------|--------|-------------|----------------|
| **L1** | TypeScript DatomStore API | Primary queries | Direct Map lookups, entity-centric |
| **L2** | D2TS / Datalog | Live projections | Incremental differential dataflow |
| **L3** | DuckDB SQL | Analytics | Materialized views, batch queries |

## Rationale

- **L1** eliminates N+1 queries and 3-way joins. LLM generates TypeScript query code against the DatomStore API. This is the primary interface for most operations.
- **L2** powers live Projections — C4 diagrams, dashboards, real-time views. D2TS computes incremental updates as datoms stream in. D2TS SQLite is intermediate operator state only, NOT a storage layer.
- **L3** preserves the existing `query_sql` MCP tool. DuckDB reads materialized snapshots of the datom store. Best for aggregate analytics and ad-hoc exploration.

## Migration

Current DevAC uses L3 primarily. Migration adds L1 (immediate) and L2 (when live projections are needed). L3 is preserved — no existing queries break.

## Source

Brainstorm: `intent/datom/query-architecture.md`
Architecture: `contract/datom/architecture.md`
