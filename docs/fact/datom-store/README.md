# Datom Store — Current State

**Location**: `packages/devac-core/src/datom/`

## What exists

- `datom-store.ts` — Core DatomStore with Map-based indexes
- `compact-datom-store.ts` — Memory-optimized compact variant
- `intern-pool.ts` — String interning for memory efficiency
- `types.ts` — Datom type definitions
- `index.ts` — Public API exports
- `loader.ts` — Data loading utilities
- `benchmark.ts` / `benchmark-v2.ts` — Performance benchmarks
- `benchmark-comparison.ts` — Comparison between store variants
- `llm-test-harness.ts` / `template-test-harness.ts` — Test infrastructure
- `graph-deps-datom.ts` — Dependency graph queries via datoms

## Test coverage

Tests in `packages/devac-core/__tests__/datom/`:
- `datom-store.test.ts` — Core store operations
- `compact-datom-store.test.ts` — Compact variant
- `benchmark.test.ts` / `benchmark-v2.test.ts` — Performance tests
- `graph-deps-datom.test.ts` — Graph dependency queries
- `loader.test.ts` — Data loading
- `memory-analysis.test.ts` — Memory usage analysis
- `llm-test-harness.test.ts` / `template-test-harness.test.ts` — Harness tests

## Architecture decision

See `contract/datom/architecture.md` for the full datom model spec (v0.7).
See `contract/datom/query-layers.md` for the 3-layer query architecture.
