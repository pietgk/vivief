---
"@pietgk/devac-core": patch
---

Fix workspace effects showing zero counts

- Fixed `CentralHub.query()` to create views (nodes, edges, external_refs, effects) pointing to all seed parquet files
- Fixed `getCachedQuery()` to skip DELETE in read-only mode
- Fixed `workspace-effects-generator` to use `filename LIKE` pattern instead of non-existent `repo_id` column
