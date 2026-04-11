---
topic: datom-store
status: canonical
depends-on: [concepts-datom]
human-version: ../contract/datom/architecture.md
last-verified: 2026-03-30
---

## DatomStore Implementation

The DatomStore is a TypeScript Map-based implementation of datom storage with four
composite indexes for different access patterns. Current implementation lives in
`packages/devac-core/src/datom/`.

### Four Indexes

| Index | Lookup Pattern | Primary Use |
|-------|---------------|-------------|
| **EAVT** | Entity → Attribute → Value → Tx | "Everything about entity X" |
| **AEVT** | Attribute → Entity → Value → Tx | "All entities with attribute Y" |
| **AVET** | Attribute → Value → Entity → Tx | "Which entity has value Z for attribute Y?" |
| **VAET** | Value → Attribute → Entity → Tx | Reverse references — "who points at entity X?" |

Entity-centric access: one EAVT lookup retrieves everything about a code entity —
its kind, name, file, line, edges, effects, external refs. No joins needed.

### Memory Profile

| Codebase Size | Entities | Estimated Memory |
|---------------|----------|-----------------|
| Typical repo | ~50K | ~200 MB |
| Large monorepo | ~250K | ~1 GB |

String interning via `InternPool` reduces memory by deduplicating attribute names,
entity IDs, and common values across all indexes.

### What It Replaces

The current DevAC data model uses separate tables: nodes, edges, effects, external_refs.
This causes six pain points that DatomStore eliminates:

1. **N+1 queries** — must query nodes, then edges, then effects separately
2. **Effect-enricher workaround** — effects need post-processing to link to nodes
3. **3-way joins** — cross-referencing nodes+edges+effects requires complex SQL
4. **Schema rigidity** — adding a new attribute means ALTER TABLE
5. **No temporal queries** — can't ask "what changed in this commit?"
6. **No entity history** — only current state, no append-only log

### Migration Path

The migration is incremental, not big-bang:

1. Define `DatomStore` interface with current Map-based implementation
2. Implement same interface over DuckDB (for comparison/fallback)
3. Port existing queries from SQL to DatomStore API (Layer 1)
4. Keep DuckDB as Layer 3 for analytics queries
5. Native Map indexes become primary when benchmarks confirm performance

### Current Implementation Files

```
packages/devac-core/src/datom/
  compact-datom-store.ts   # Memory-optimized store implementation
  datom-store.ts           # Core DatomStore with four indexes
  intern-pool.ts           # String interning for memory reduction
  types.ts                 # Datom type definitions [E, A, V, Tx, Op]
  index.ts                 # Public exports
  loader.ts                # Loading datoms from external sources
  graph-deps-datom.ts      # Dependency graph over datom model
  benchmark.ts             # Performance measurement
  benchmark-v2.ts          # Improved benchmarking
  benchmark-comparison.ts  # Compare implementations
```

### Open Brainstorms

- `intent/datom/virtual-projections-spike.md` — exploring virtual Projections
  that compute derived attributes lazily rather than materializing them
- How CompactDatomStore (typed arrays, column-oriented) compares to Map-based
  store for large codebases — benchmarks in progress
