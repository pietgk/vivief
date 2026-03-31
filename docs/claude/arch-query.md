---
topic: query-architecture
status: canonical
depends-on: [concepts-datom, concepts-projection, arch-datom-store]
human-version: ../contract/datom/architecture.md
last-verified: 2026-03-30
---

## Three-Layer Query Architecture

Vivief uses three query layers, each optimized for a different use case. All three
operate over the same datom model but serve different latency and complexity profiles.

### Layer 1: TypeScript DatomStore API (Primary)

Direct Map lookups against in-memory EAVT/AEVT/AVET/VAET indexes.

```typescript
// "Everything about entity X"
const attrs = store.getEntity("myrepo:packages/api:function:abc123");

// "All functions in file Y"
const fns = store.findByAttribute("kind", "function")
  .filter(d => d.value === "packages/api/src/handler.ts");

// "Who calls function X?" (reverse ref via VAET)
const callers = store.getRefsTo("myrepo:packages/api:function:abc123", "calls");
```

**Key design**: LLMs generate TypeScript query code against this API. No query
language to learn — the API IS the query language. This is Layer 1's main advantage
over SQL: LLMs produce better TypeScript than SQL for graph traversals.

**Latency**: Sub-millisecond for single lookups, low milliseconds for traversals.

### Layer 2: D2TS / Datalog (Live Projections)

Incremental differential dataflow for live-updating Projections. When datoms change,
downstream Projections update automatically without re-querying.

```
datom-change → D2TS operator graph → updated Projection → Surface re-render
```

**D2TS operator state** uses SQLite, but this is internal implementation detail —
SQLite stores intermediate operator state ONLY, not datoms. The contract at
`contract/datom/d2ts-operator-state.md` locks this boundary.

**Use cases**: Live C4 diagrams, real-time dashboards, counseling session views
that update as datoms arrive. Anything where "push updates when data changes"
is better than "poll and re-query."

**Latency**: Milliseconds from datom write to Projection update.

### Layer 3: DuckDB SQL (Analytics)

Materialized views from periodic datom snapshots exported to Parquet. The existing
DevAC `query_sql` MCP tool is preserved — it queries this layer.

```sql
-- Cross-repo symbol search (existing MCP tool)
SELECT * FROM nodes WHERE name LIKE '%Handler%'

-- Analytics: code churn over time
SELECT file, COUNT(*) as changes FROM edges
WHERE kind = 'MODIFIES' GROUP BY file ORDER BY changes DESC
```

**Use cases**: Complex aggregations, cross-repo analytics, ad-hoc exploration,
anything where batch processing over large datasets is appropriate.

**Latency**: Tens of milliseconds to seconds depending on data volume.

### Layer Selection Guide

| Need | Layer | Why |
|------|-------|-----|
| Entity lookup, graph walk | L1 TS API | Fastest, LLM-friendly |
| Live dashboard, streaming view | L2 D2TS | Incremental updates |
| Cross-repo analytics, aggregations | L3 DuckDB | SQL power, Parquet efficiency |
| MCP tool `query_sql` | L3 DuckDB | Backwards compatible |
| MCP tool `query_symbol` | L1 TS API | Migration target from L3 |

### Migration from Current DevAC

Current DevAC uses Layer 3 (DuckDB) for everything. Migration plan:

1. Port `query_symbol`, `query_deps`, `query_dependents` to Layer 1
2. Add Layer 2 for live Projections (C4 diagrams first)
3. Keep Layer 3 for `query_sql` and analytics-heavy tools
4. MCP tools transparently switch layers — callers unaffected
