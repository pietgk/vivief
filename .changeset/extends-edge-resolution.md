---
"@pietgk/devac-core": minor
---

Add EXTENDS edge resolution for inheritance queries

- New `resolveExtendsEdges()` method in TypeScript semantic resolver
- Resolves local classes/interfaces (confidence 1.0) and exported ones (confidence 0.9)
- New `getUnresolvedExtendsEdges()` in SeedReader
- New `updateResolvedExtendsEdges()` in SeedWriter
- Extended LocalSymbolIndex to include interfaces
- Integrated into `resolveSemantics()` orchestrator after CALLS resolution
- Enables inheritance queries with JOINs to nodes table
