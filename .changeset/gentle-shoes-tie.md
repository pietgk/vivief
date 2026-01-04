---
"@pietgk/devac-cli": patch
---

fix(hub-query): handle missing effects.parquet gracefully

DuckDB's `read_parquet([list])` fails if any file in the list doesn't exist. Since `effects.parquet` is optional (v3.0 feature), the effects view creation was failing silently. Now checks for file existence before adding to the parquet list.
