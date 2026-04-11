# Intent: Cold-Tier Indexing with Iroh + MoQ

**Status**: Open — needs spike

## The problem

The warm tier uses in-memory EAVT/AEVT/AVET/VAET sorted maps. When entities are evicted from warm (archived, inactive, memory pressure), they need to remain queryable via range-scannable cold indexes.

The previous stack used **Hyperbee** (B-tree on Hypercore) for this. With the move to Iroh + MoQ, Hyperbee is no longer available. We need to determine how to provide cold-tier range queries.

## Requirements

- Range-scannable: support queries like "all sessions for client X between dates Y and Z"
- Works in browser (WASM or JS) and native (Rust sidecar)
- Content-addressable or verifiable (aligns with iroh-blobs BLAKE3 model)
- Rebuild from frozen tier (iroh-blobs) if lost — derived state, not source of truth

## Candidates

| Candidate | Strengths | Concerns |
|-----------|-----------|----------|
| **DuckDB (L3 layer)** | Already in stack for analytics. Parquet snapshots from frozen tier. Proven. | Not available in browser without WASM build. Heavier than needed for simple range queries. |
| **SQLite** | Works everywhere (browser via WASM, native). d2ts already uses it for operator state. B-tree indexes built in. | Adds another storage engine. Need to define schema for EAV tuples. |
| **Custom B-tree on iroh-blobs** | Aligns perfectly with frozen storage model. Each B-tree node is an iroh-blob. Content-addressed. | Significant build cost. Reinventing what SQLite/DuckDB already do well. |
| **No cold tier (warm-only)** | Simplest. Rely on memory and rebuild from frozen on demand. | Doesn't scale. Startup time grows with data volume. |

## Questions to resolve

1. How large does the cold tier get? (affects whether SQLite is sufficient or DuckDB is needed)
2. Is browser cold-tier querying a hard requirement or can it be server-proxied?
3. Can we layer SQLite for cold indexes on top of iroh-blobs for frozen storage cleanly?
4. What is the rebuild time from frozen → cold indexes for a typical practice (500k datoms)?

## Related documents

- `contract/datom/architecture.md` §4.3, §7, §12.1
- `contract/datom/query-layers.md` (L1/L2/L3 architecture)
- `contract/datom/d2ts-operator-state.md` (d2ts SQLite precedent)
