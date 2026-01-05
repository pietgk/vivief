---
"@pietgk/devac-core": patch
---

Fix doc-sync bugs: incorrect package counts, wrong column name, is_external never set

- Fix package counts always showing "1" by using repo.packages from manifest
- Fix wrong column name in effects queries (filename → source_file_path)
- Add external call detection to typescript-parser for is_external flag
