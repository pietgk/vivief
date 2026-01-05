---
"@pietgk/devac-core": minor
---

Consolidate query architecture and reduce code duplication

- Add `queryWithContext()` for consistent view-based package queries
- Fix `getUnifiedQuery()` to use correct deduplication keys for effects (effect_id vs entity_id)
- Add `getParquetFilePaths()` helper for consistent parquet path construction
- Consolidate duplicate `fileExists` implementations into single canonical utility
