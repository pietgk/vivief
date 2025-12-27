---
"@pietgk/devac-cli": minor
---

Add `devac hub query` command for federated SQL queries across repositories

- Execute SQL queries across all registered repositories in the hub
- Automatically creates federated `nodes`, `edges`, `external_refs` views
- Supports `@package` syntax for package-specific queries
- Uses federation (queries seed files in place) - no data copying
- Supports `--json` output format and `--branch` option
