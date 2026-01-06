# Plan: Improve C4 architecture generator output quality

> **Issue:** [#114](https://github.com/pietgk/vivief/issues/114)
> **Status:** IN_PROGRESS
> **Created:** 2026-01-06

## From Issue

### Problems to Solve

| Issue | Severity | Current | Desired |
|-------|----------|---------|---------
| Hash-based component names | HIGH | `component '142075ee'` | `component 'analyzePackage'` |
| Duplicate relationships | HIGH | 43 lines of `Storage:Read` | `'Read, Write'` aggregated |
| Missing source line numbers | MEDIUM | `link file.ts` | `link file.ts#L42` |
| Flat container structure | MEDIUM | All under "Users" | Grouped by directory |
| No internal edges | MEDIUM | Only external relationships | Call graph between components |

### Root Causes

1. **Hash names**: C4 generator uses `DomainEffect.sourceEntityId` (hash) instead of joining to `ParsedNode.name`
2. **Duplicates**: One relationship created per effect, no aggregation by `(from, to)` tuple
3. **No line numbers**: `startLine` exists in `DomainEffect` but not passed to component
4. **"Users" container**: Absolute paths `/Users/grop/...` cause wrong grouping
5. **No internal edges**: CALLS edges from seed not included

### Desired Output

```c4
model {
  system = system 'devac-core' {
    analysis_orchestrator = container 'analysis-orchestrator.ts' {
      analyzePackage = component 'analyzePackage' {
        link ../../src/analyzer/analysis-orchestrator.ts#L42
      }
    }
  }

  // Aggregated relationships
  system.analysis_orchestrator -> external_Storage_filesystem 'Read, Write'

  // Internal call graph
  system.analysis_orchestrator.analyzePackage -> system.central_hub.registerRepo 'calls'
}

views {
  view overview {
    include *
    exclude system.*.*
  }

  view analysis_orchestrator of system.analysis_orchestrator {
    include *
  }
}
```

## Implementation Plan

### Phase 1: Files as Containers, Functions as Components
- [ ] Group effects by `filePath` → container
- [ ] Group by `sourceEntityId` within file → component
- [ ] Join to nodes table for readable names

### Phase 2: Add Internal Edges (Call Graph)
- [ ] Query seed's `edges` table for CALLS relationships
- [ ] Add as relationships between components

### Phase 3: Generate Multiple LikeC4 Views
- [ ] Overview view with `exclude system.*.*`
- [ ] Scoped views per file using `view X of Y` syntax
- [ ] Add `navigateTo` for navigation

### Phase 4: Aggregate Relationships
- [ ] Group by `(from, to)` tuple
- [ ] Deduplicate labels: `'Read, Write'` instead of 43 lines

### Phase 5: Add Line Numbers to Links
- [ ] Include `#L{startLine}` in link paths

## Files to Modify

| File | Changes |
|------|---------|
| `packages/devac-core/src/views/c4-generator.ts` | Files as containers, internal edges, aggregation |
| `packages/devac-core/src/docs/c4-doc-generator.ts` | Multiple views, line numbers |
| `packages/devac-core/src/docs/repo-c4-generator.ts` | Pass nodes + edges to generator |

## Research Needed

- [ ] Understand current C4 generator implementation
- [ ] Understand how domain effects are structured
- [ ] Understand LikeC4 syntax for views
