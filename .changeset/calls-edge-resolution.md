---
"@pietgk/devac-core": minor
---

Add CALLS edge resolution for call graph queries

- New `resolveCallEdges()` method in TypeScript semantic resolver
- Resolves local functions (confidence 1.0) and exported functions (confidence 0.9)
- New `getUnresolvedCallEdges()` in SeedReader
- New `updateResolvedCallEdges()` in SeedWriter
- Integrated into `resolveSemantics()` orchestrator
- Enables call graph queries with JOINs to nodes table
