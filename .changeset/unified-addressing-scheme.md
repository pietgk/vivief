---
"@pietgk/devac-core": major
---

Add unified addressing scheme with single identity model (ADR-0044)

**Breaking Changes:**
- `parseCanonicalURI()` now returns `ParsedURI` (with `uri` and `params` fields) instead of `CanonicalURI`
- Cross-file relative refs (`./file#Symbol`) are no longer supported
- Workspace removed from URI format (inferred from context)
- Version and location moved from URI path to query parameters

**New URI Format:**
```
devac://repo/package/file#Symbol?version=main&line=45
```

**Features:**
- Single identity model: Entity ID (`repo:package:kind:hash`) is THE identity
- Canonical URIs are human-readable lookup keys that resolve to Entity IDs
- SCIP-style symbol paths with `#` for types, `.` for terms
- Query parameters for version (`?version=main`) and location (`?line=45&col=10`)
- Same-file relative refs only (`#Symbol`, `.term()`)
