---
"@pietgk/devac-core": minor
---

Add unified addressing scheme (ADR-0044)

- New URI module with parser, formatter, resolver, and relative reference handling
- Support for three reference types:
  - Canonical URI: `devac://workspace/repo@version/package/file#Symbol`
  - Entity ID: `repo:package:kind:hash` (stable internal)
  - Relative ref: `#Symbol`, `./file#Symbol` (context-dependent)
- SCIP-style symbol paths with `#` for types, `.` for terms
- Location fragments: `#L10`, `#L10:C5`, `#L10-L20`
