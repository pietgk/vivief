# ADR-0034: EXTENDS Edge Resolution for Inheritance Queries

## Status

Accepted

## Context

The TypeScript parser creates EXTENDS edges for class and interface inheritance, storing them with `unresolved:{className}` or `unresolved:{interfaceName}` target entity IDs. This follows the same pattern as CALLS edges (ADR-0020, ADR-0033) where Pass 1 (structural parsing) deliberately avoids type resolution to stay fast.

This left all EXTENDS edges with unresolved targets, making inheritance queries impossible:

```sql
-- This query returns no results because target_entity_id doesn't match any node
SELECT child.name as child_class, parent.name as parent_class
FROM edges e
JOIN nodes child ON e.source_entity_id = child.entity_id
JOIN nodes parent ON e.target_entity_id = parent.entity_id
WHERE e.edge_type = 'EXTENDS'
```

ADR-0033 established the pattern for CALLS edge resolution. This ADR extends that pattern to EXTENDS edges.

## Decision

Extend the semantic resolution system (Pass 2) to resolve EXTENDS edges, reusing the infrastructure from CALLS resolution (ADR-0033).

### Resolution Strategy

Resolution prioritizes certainty, assigning confidence scores:

1. **Local classes/interfaces** (same file): Match `targetName` against class/interface nodes in the same source file → confidence 1.0
2. **Exported classes/interfaces** (cross-file): Match against ExportIndex from other files in the package → confidence 0.9
3. **External classes** (e.g., `React.Component`): Leave as `unresolved:` → not resolved

### Target Kind Matching

Unlike CALLS (which targets functions/methods), EXTENDS edges must match the appropriate kind:

| Source Kind | Target Kinds |
|-------------|--------------|
| `class` | `["class"]` |
| `interface` | `["interface"]` |

This ensures `class Foo extends Bar` only resolves to class definitions, and `interface A extends B` only resolves to interface definitions.

### Implementation Pattern

Follow the established CALLS resolution pattern from ADR-0033:

| CALLS Resolution | EXTENDS Resolution |
|------------------|-------------------|
| `SeedReader.getUnresolvedCallEdges()` | `SeedReader.getUnresolvedExtendsEdges()` |
| `resolver.resolveCallEdges()` | `resolver.resolveExtendsEdges()` |
| `SeedWriter.updateResolvedCallEdges()` | `SeedWriter.updateResolvedExtendsEdges()` |

### New Types

```typescript
interface UnresolvedExtendsEdge {
  sourceEntityId: string;       // Child class/interface
  targetEntityId: string;       // 'unresolved:ParentName'
  sourceFilePath: string;
  sourceLine: number;
  sourceColumn: number;
  targetName: string;           // Extracted from 'unresolved:xxx'
  sourceKind: "class" | "interface";
}

interface ResolvedExtendsEdge {
  extends: UnresolvedExtendsEdge;
  targetEntityId: string;       // Resolved entity ID
  targetFilePath: string;
  confidence: number;           // 0-1
  method: "compiler" | "index" | "local";
}
```

### Shared Infrastructure

EXTENDS resolution reuses:
- **ExportIndex**: Already built for import/CALLS resolution
- **LocalSymbolIndex**: Extended to include interfaces (previously only functions, methods, classes)

## Alternatives Considered

### A. Resolve During Pass 1

Add inheritance resolution to the TypeScript parser.

**Rejected because:**
- Violates two-pass architecture (ADR-0005)
- Would slow down structural parsing
- Cross-file resolution requires full package context

### B. Separate Resolution Pass for EXTENDS

Create a dedicated resolution system for EXTENDS.

**Rejected because:**
- Would duplicate infrastructure already built for CALLS
- Same ExportIndex and LocalSymbolIndex work for both
- Consistent API is easier to maintain

## Consequences

### Positive

- Enables inheritance queries with JOINs to nodes table
- "Find all subclasses of X" queries now work for local/exported classes
- "Find interface implementations" becomes possible
- Follows established resolution pattern (minimal new concepts)
- Reuses CALLS resolution infrastructure (no duplication)

### Negative

- External extends (e.g., `React.Component`, `Error`) remain unresolved
- Generic type parameters in extends not fully resolved
- Multiple interface extends each need separate resolution

### Neutral

- Resolution is optional (structural data still useful without it)
- Python/C# resolvers return empty results (can implement later)

## Verification

After implementation:

```sql
-- Check resolution rate
SELECT
  COUNT(*) FILTER (WHERE target_entity_id NOT LIKE 'unresolved:%') as resolved,
  COUNT(*) FILTER (WHERE target_entity_id LIKE 'unresolved:%') as unresolved,
  COUNT(*) as total
FROM edges
WHERE edge_type = 'EXTENDS';

-- Inheritance query (now works!)
SELECT child.name as child, parent.name as parent
FROM edges e
JOIN nodes child ON e.source_entity_id = child.entity_id
JOIN nodes parent ON e.target_entity_id = parent.entity_id
WHERE e.edge_type = 'EXTENDS'
LIMIT 10;

-- Find all subclasses of a class
SELECT child.name, child.file_path
FROM edges e
JOIN nodes child ON e.source_entity_id = child.entity_id
JOIN nodes parent ON e.target_entity_id = parent.entity_id
WHERE e.edge_type = 'EXTENDS'
  AND parent.name = 'BaseService';
```

## References

- [ADR-0005: Two-Pass Parsing Architecture](0005-two-pass-parsing.md)
- [ADR-0033: CALLS Edge Resolution](0033-calls-edge-resolution.md)
- [GitHub Issue #143](https://github.com/pietgk/vivief/issues/143)
