---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
---

Improve C4 architecture generator output quality

**New Features:**
- Enriched domain effects with readable function names from nodes table instead of hash-based IDs
- Relationship aggregation: groups duplicate relationships with combined labels and call counts (e.g., "Read, Write (45 calls)")
- Source links now include line numbers (e.g., `file.ts#L42`) for direct code navigation
- Internal call graph edges: CALLS relationships between components are now visualized
- Scoped drill-down views per container showing detailed component relationships

**New APIs:**
- `enrichDomainEffects()` - enriches domain effects with node metadata
- `buildNodeLookupMap()` - creates lookup map from SQL results
- `buildInternalEdges()` - builds internal edge array from SQL results
- `computeRelativePath()` - strips absolute path prefixes for cleaner file paths

**New Types:**
- `EnrichedDomainEffect` - domain effect with readable names
- `NodeMetadata`, `NodeLookupMap`, `InternalEdge`, `EnrichmentResult`

**C4 Generator Enhancements:**
- Added `startLine` to `C4Component` interface
- Added `internalEdges` option to `C4GeneratorOptions`
- Better handling of absolute paths in container IDs

Fixes #114
