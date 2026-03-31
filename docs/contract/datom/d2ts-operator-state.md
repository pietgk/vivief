# D2TS SQLite Is Intermediate Operator State, Not a Storage Layer

**Status:** Accepted
**Date:** 2026-03-26
**Context:** Evaluating d2ts (Differential Dataflow in TypeScript) SQLite integration for the practice management platform architecture.

## Decision

D2TS's SQLite persistence is **not** a datom/data storage layer. It persists intermediate operator state for the dataflow graph — arrangements, compaction frontiers, and modified-key tracking — to enable resumable incremental pipelines and larger-than-memory datasets.

We will not use d2ts SQLite as a primary or secondary datom store.

## Context

D2TS (`@electric-sql/d2ts`) provides optional SQLite-backed operators (`consolidate`, `join`, `reduce`, `distinct`, etc.) that persist their internal state. We investigated the schema and storage characteristics to understand whether this could double as a datom persistence layer.

## SQLite Schema Per Operator

Each operator that opts into SQLite persistence creates **three tables**:

### Main index: `index_{name}`

```sql
CREATE TABLE index_{name} (
  key          TEXT NOT NULL,      -- JSON-serialized key
  version      TEXT NOT NULL,      -- JSON-serialized Version (multi-dimensional timestamp)
  value        TEXT NOT NULL,      -- JSON-serialized datum/value
  multiplicity INTEGER NOT NULL,   -- +1 insert, -1 retraction, accumulates via UPSERT
  PRIMARY KEY (key, version, value)
);
CREATE INDEX index_{name}_version_idx ON index_{name}(version);
CREATE INDEX index_{name}_key_idx ON index_{name}(key);
```

### Meta: `index_{name}_meta`

```sql
CREATE TABLE index_{name}_meta (
  key   TEXT PRIMARY KEY,  -- e.g. 'compaction_frontier'
  value TEXT               -- JSON-serialized Antichain
);
```

### Dirty tracking: `index_{name}_modified_keys`

```sql
CREATE TABLE index_{name}_modified_keys (
  key TEXT PRIMARY KEY     -- JSON-serialized keys needing compaction
);
```

The `consolidate` operator uses a simpler variant — a `collections_{id}` table storing entire MultiSets as a single JSON blob per version.

## How a MultiSet Is Stored

A multiset like:

```ts
new MultiSet([
  [["user-123", { a: "name", v: "Alice" }], 1],    // insert
  [["user-456", { a: "name", v: "Bob" }],  -1],    // retract
])
```

at version `[3]` becomes two rows:

| key | version | value | multiplicity |
|-----|---------|-------|-------------|
| `"user-123"` | `[3]` | `{"a":"name","v":"Alice"}` | 1 |
| `"user-456"` | `[3]` | `{"a":"name","v":"Bob"}` | -1 |

Insert uses `ON CONFLICT ... DO UPDATE SET multiplicity = multiplicity + excluded.multiplicity` — proper multiset accumulation. Compaction merges old versions via `SUM(multiplicity)` and discards zero-multiplicity rows.

## Storage Overhead (Benchmarked)

| Scenario | Size |
|----------|------|
| 1 operator, 1,000 datoms, single version | **188 KB** |
| + 100 updates (200 retraction/insert rows) | 212 KB |
| 3-operator pipeline, 1,000 datoms each | **700 KB** |
| Minimal EAVT datom store, 1,000 datoms | **68 KB** |

**Overhead ratio:** 2.8× (single operator) to 10.3× (3-operator pipeline) vs a minimal datom store.

### Sources of overhead

1. **JSON serialization of all columns** — keys, versions, values are `JSON.stringify()`'d into TEXT. Double-encoding (JSON string inside SQLite TEXT) inflates every row.
2. **Per-operator duplication** — each operator in the pipeline maintains its own copy of the data flowing through it. This is inherent to differential dataflow: each operator keeps its own "arrangement."
3. **3 tables + 2 indexes per operator** — ~112 bytes overhead per row beyond payload.

## Consequences

- D2TS SQLite is appropriate for: resumable pipelines, larger-than-memory operator state, incremental view maintenance.
- D2TS SQLite is **not** appropriate for: primary datom storage, querying historical data, serving as source of truth.
- Our architecture uses D2TS as the datom computation layer with custom in-memory indexes (TypeScript Map-based EAVT/AEVT) for warm storage. Loro is scoped to rich text only. D2TS sits downstream as a computation/materialization layer. If we use its SQLite persistence, it's purely for pipeline resumability.
- Joins in d2ts are computed directly in SQL across operator index tables (`JOIN ... ON a.key = b.key`), with multiplicity = product. This is efficient for incremental recomputation but creates yet another copy of the data.

## References

- Source: [`electric-sql/d2ts`](https://github.com/electric-sql/d2ts) — `src/sqlite/version-index.ts`, `src/sqlite/operators/`
- D2TS uses `better-sqlite3` via a `BetterSQLite3Wrapper` implementing the `SQLiteDb` interface.
