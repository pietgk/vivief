# ADR-0017: Validation Hub Cache

## Status

Accepted

## Context

DevAC Phase 2 adds validation support (type errors, lint issues, test results) that can be:
- Queried by LLMs via MCP tools ("what errors do I need to fix?")
- Aggregated across repositories for workspace-level views
- Enriched with CodeGraph context (affected symbols, callers)

Validation data has different characteristics than code graph seeds:

| Property | Code Graph Seeds | Validation Errors |
|----------|-----------------|-------------------|
| Stability | Stable (changes on commit) | Ephemeral (changes every save) |
| Update frequency | Infrequent | High (every validation run) |
| Lifespan | Persistent | Transient (obsolete when fixed) |
| Size | 10-100 KB | 5-50 KB |
| Query pattern | Ad-hoc exploration | "Current errors" snapshot |

We needed to decide where to store validation errors for efficient querying.

## Decision

Store validation errors in the **Central Hub's DuckDB** (`~/.devac/central.duckdb`) rather than per-repo Parquet seeds.

### Storage Structure

```sql
CREATE TABLE validation_errors (
  repo_id VARCHAR NOT NULL,
  package_path VARCHAR NOT NULL,
  file VARCHAR NOT NULL,
  line INTEGER NOT NULL,
  column INTEGER NOT NULL,
  message VARCHAR NOT NULL,
  severity VARCHAR NOT NULL,     -- 'error' | 'warning'
  source VARCHAR NOT NULL,       -- 'tsc' | 'eslint' | 'test'
  code VARCHAR,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repo_id, file, line, column, source, code)
);
```

### Data Flow

```
Per-Repo Validation                 Central Hub
┌─────────────────────┐            ┌───────────────────────┐
│  devac validate     │            │  ~/.devac/            │
│  or devac watch     │──push───►  │    central.duckdb     │
│                     │            │      validation_errors│
│  Runs tsc, eslint   │            │                       │
│  Returns issues     │            │  MCP queries here     │
└─────────────────────┘            └───────────────────────┘
```

### Alternatives Considered

1. **Per-Repo Parquet Seeds** (like code graph)
   - ❌ Full file rewrite on each change (~150-300ms)
   - ❌ Lock contention with parallel validators
   - ✅ Consistent with existing seed pattern

2. **NDJSON Streams**
   - ✅ Fast append-only writes
   - ❌ Slower SQL queries
   - ❌ New infrastructure needed

3. **Hybrid (NDJSON + Parquet snapshot)**
   - ✅ Best of both worlds
   - ❌ Overkill when historical tracking not needed

4. **In-Memory Only**
   - ✅ Zero storage overhead
   - ❌ 5+ second query latency (must re-run validation)
   - ❌ No cross-repo queries

### Why Hub Cache Wins

1. **Faster writes**: SQL INSERT (~10-50ms) vs Parquet rewrite (~150-300ms)
2. **Native cross-repo queries**: Single table, no federation needed
3. **Pooled connections**: Hub already manages DuckDB pool
4. **Fits ephemeral nature**: Clear old errors on new validation run
5. **Existing infrastructure**: Hub DuckDB already exists

## Consequences

### Positive

- Fast validation error queries for LLMs
- Cross-repo error views work naturally ("all errors in workspace")
- No per-repo Parquet file management for ephemeral data
- Survives process restarts (file-backed DuckDB)
- Watch mode can push updates incrementally

### Negative

- Requires Hub to be accessible (no offline per-repo validation storage)
- Expands Hub's responsibility beyond metadata/federation
- Need to clear old errors before pushing new ones

### Neutral

- Validation still takes 5+ seconds (inherent to running tsc/eslint)
- CLI can work without Hub (validation runs, just doesn't persist to Hub)
- MCP tools can return real-time validation by calling validators directly

## Implementation

**Files modified:**

| File | Changes |
|------|---------|
| `devac-core/src/hub/hub-storage.ts` | Added `validation_errors` table + CRUD |
| `devac-core/src/hub/central-hub.ts` | Added `pushValidationErrors()`, `getValidationErrors()` |
| `devac-core/src/validation/hub-integration.ts` | Bridge functions for validation→hub |
| `devac-mcp/src/tools/validation-tools.ts` | MCP tools: `get_validation_errors`, `get_validation_summary`, `get_validation_counts` |
| `devac-cli/src/commands/validate.ts` | `--push-to-hub`, `--repo-id` options |

**New MCP Tools:**

- `get_validation_errors`: Query errors with filters (repo, severity, source, file)
- `get_validation_summary`: Grouped error counts (by repo, file, source)
- `get_validation_counts`: Simple count of errors/warnings

## References

- [ADR-0007: Federation Central Hub](0007-federation-central-hub.md) - Original hub architecture
- [ADR-0016: Workspace Module](0016-workspace-module.md) - Two-tier watching model
- [Foundation Architecture](../foundation-architecture.md) - System overview
