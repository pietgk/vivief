---
"@pietgk/devac-core": patch
"@pietgk/devac-cli": patch
---

Use DuckDB native arrays instead of JSON strings for array columns

- Add Zod schemas as single source of truth for table definitions (nodes, edges, external_refs)
- Generate SQL DDL and column metadata from Zod schemas
- Update seed-writer to use native DuckDB array syntax (`['item']`) instead of JSON strings (`'["item"]'`)
- Fix schema-generators nullable handling for `default(null)` pattern
- Update test files to use native array syntax for consistency
