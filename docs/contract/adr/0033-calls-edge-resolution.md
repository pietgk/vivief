# ADR-0033: CALLS Edge Resolution for Call Graph Queries

## Status

Accepted

## Context

ADR-0020 introduced CALLS edge extraction in the TypeScript parser, storing call relationships with `unresolved:{calleeName}` target entity IDs. This was a deliberate design choice to keep Pass 1 (structural parsing) fast by avoiding type resolution.

However, this left all 33,000+ CALLS edges with unresolved targets, making call graph queries impossible:

```sql
-- This query returns no results because target_entity_id doesn't match any node
SELECT s.name as caller, t.name as callee
FROM edges e
JOIN nodes s ON e.source_entity_id = s.entity_id
JOIN nodes t ON e.target_entity_id = t.entity_id
WHERE e.edge_type = 'CALLS'
```

ADR-0020 anticipated this: "Semantic resolution can later resolve `unresolved:` targets to actual entity IDs". This ADR documents that resolution implementation.

## Decision

Extend the existing semantic resolution system (Pass 2) to resolve CALLS edges, following the established pattern from import resolution.

### Resolution Strategy

Resolution prioritizes certainty, assigning confidence scores:

1. **Local functions** (same file): Match `calleeName` against function nodes in the same source file → confidence 1.0
2. **Exported functions** (cross-file): Match against ExportIndex from other files in the package → confidence 0.9
3. **External/built-in calls**: Leave as `unresolved:` → not resolved

### Implementation Pattern

Follow the existing import resolution pattern:

| Import Resolution | CALLS Resolution |
|-------------------|------------------|
| `SeedReader.getUnresolvedRefs()` | `SeedReader.getUnresolvedCallEdges()` |
| `resolver.resolvePackage()` | `resolver.resolveCallEdges()` |
| `SeedWriter.updateResolvedRefs()` | `SeedWriter.updateResolvedCallEdges()` |

### New Types

```typescript
interface UnresolvedCallEdge {
  sourceEntityId: string;      // Caller function
  targetEntityId: string;      // 'unresolved:xxx'
  sourceFilePath: string;
  sourceLine: number;
  sourceColumn: number;
  calleeName: string;          // Extracted from 'unresolved:xxx'
}

interface ResolvedCallEdge {
  call: UnresolvedCallEdge;
  targetEntityId: string;      // Resolved entity ID
  targetFilePath: string;
  confidence: number;          // 0-1
  method: "compiler" | "index" | "local";
}
```

### Filtering Rules

Skip resolution for common built-in/external calls that can never resolve:

- `console.*` methods
- Array built-ins (`map`, `filter`, `reduce`, `forEach`, `find`, `some`, `every`, `includes`, `push`, `pop`, etc.)
- Object built-ins (`keys`, `values`, `entries`, `assign`, `freeze`)
- String built-ins (`substring`, `split`, `replace`, `trim`, `toLowerCase`, `toUpperCase`)
- Promise built-ins (`then`, `catch`, `finally`)
- JSON methods (`parse`, `stringify`)

## Alternatives Considered

### A. Full TypeScript Compiler Resolution

Use ts-morph to resolve all call targets with full type information.

**Rejected because:**
- Significantly slower than structural analysis
- Would require resolving method calls through type hierarchies
- Diminishing returns: most valuable calls are local/exported functions
- Can add later for method calls if needed

### B. Scope-Based Local Resolution Only

Only resolve calls to functions defined in the same scope (not exported).

**Rejected because:**
- Misses cross-file calls which are often most interesting
- ExportIndex already exists for import resolution, easy to reuse

### C. Resolve During Pass 1

Add resolution to the TypeScript parser itself.

**Rejected because:**
- Violates two-pass architecture (ADR-0005)
- Would slow down structural parsing
- Cross-file resolution requires full package context

## Consequences

### Positive

- Enables call graph queries with JOINs to nodes table
- "Find all callers of X" queries now work for local/exported functions
- Follows established resolution pattern (minimal new concepts)
- Resolution is incremental (can improve over time)
- TypeScript-only implementation, Python/C# can follow same pattern

### Negative

- External calls remain unresolved (by design)
- Method calls on instances have lower confidence
- Some valid calls may not resolve due to complex patterns

### Neutral

- Resolution is optional (structural data still useful without it)
- Can add more sophisticated resolution later (e.g., type-based method resolution)

## Verification

After implementation:

```sql
-- Check resolution rate
SELECT
  COUNT(*) FILTER (WHERE target_entity_id NOT LIKE 'unresolved:%') as resolved,
  COUNT(*) FILTER (WHERE target_entity_id LIKE 'unresolved:%') as unresolved,
  COUNT(*) as total
FROM edges
WHERE edge_type = 'CALLS';

-- Call graph query (now works!)
SELECT s.name as caller, t.name as callee
FROM edges e
JOIN nodes s ON e.source_entity_id = s.entity_id
JOIN nodes t ON e.target_entity_id = t.entity_id
WHERE e.edge_type = 'CALLS'
LIMIT 10;
```

## References

- [ADR-0005: Two-Pass Parsing Architecture](0005-two-pass-parsing.md)
- [ADR-0020: CALLS Edge Extraction](0020-calls-edge-extraction.md)
- [GitHub Issue #141](https://github.com/grop/vivief/issues/141)
