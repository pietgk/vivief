---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
---

Add ergonomic Query UX with auto-created views and package shorthand

- Auto-create `nodes`, `edges`, `external_refs` views when running `devac query`
- Support `@package` syntax for cross-package queries:
  - `nodes@core` - query specific package by name
  - `edges@*` - query all packages in workspace
- Package names derived from package.json or directory name
- Views eliminate need for full `read_parquet('/path/...')` syntax
- Progressive disclosure: simple → multi-package → all → full control
