---
"@pietgk/devac-core": minor
---

Add shared query layer for CLI and MCP

Implement a unified query layer in `devac-core/src/queries/` that provides a single source of truth for query behavior between CLI and MCP.

**New query functions:**
- Symbol queries: `symbolFind`, `symbolGet`, `symbolFile`
- Graph queries: `graphDeps`, `graphDependents`, `graphCalls`, `graphImports`
- Schema queries: `schemaTables`, `schemaKinds`, `schemaEdges`, `schemaStats`

**Key features:**
- Unified output levels: `counts`, `summary`, `details` (progressive disclosure)
- Consistent parameter naming (`entity`, `file`, `level`, `limit`, `offset`)
- Zod schemas for validation with adapter utilities for MCP/CLI generation
- Thin adapter examples for CLI (`symbol-v2.ts`, `graph-v2.ts`) and MCP (`shared-queries.ts`)
