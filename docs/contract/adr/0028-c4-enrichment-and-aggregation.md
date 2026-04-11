# ADR-0028: C4 Architecture Enrichment and Relationship Aggregation

## Status

Accepted

## Context

DevAC generates C4 architecture diagrams from code effects, but the current output has several quality issues that reduce the diagrams' usefulness:

1. **Hash-based Component Names**: Components are identified by entity ID hashes (e.g., `abc12345`) instead of readable function names like `analyzePackage`. This makes diagrams hard to understand.

2. **Duplicate Relationships**: Multiple effects of the same type generate redundant relationship lines. For example, 43 separate `Storage:Read` relationships from one container to S3, instead of a single aggregated line.

3. **Missing Source Line Numbers**: Component links to source files lack line numbers, forcing developers to search for the relevant code.

4. **Flat Container Structure**: Absolute file paths (e.g., `/Users/grop/ws/project/src/analyzer.ts`) result in unusable container IDs like `Users` instead of meaningful names like `analyzer`.

5. **No Internal Call Graph**: Relationships between internal components (the call graph) are not visualized, missing important architectural information.

The root cause is that `DomainEffect` only contains `sourceEntityId` (a hash) but not the actual function name. The readable names exist in the **nodes table** but aren't passed to the C4 generator.

## Decision

We enrich domain effects with node metadata **before** passing them to the C4 generator, and add relationship aggregation and internal call graph edges.

### New Data Flow

```
Effects → Rules Engine → DomainEffect[]
    → enrichDomainEffects(effects, nodeMap, edges) → EnrichedDomainEffect[]
    → C4 Generator → LikeC4/PlantUML
```

### Key Changes

1. **Effect Enrichment Types** (`types/enriched-effects.ts`):
   - `EnrichedDomainEffect` extends `DomainEffect` with `sourceName`, `sourceQualifiedName`, `sourceKind`, `relativeFilePath`
   - `NodeLookupMap` for efficient entity-to-name lookups
   - `InternalEdge` for call graph relationships

2. **Effect Enricher** (`views/effect-enricher.ts`):
   - `enrichDomainEffects()` adds readable names from nodes table
   - `buildNodeLookupMap()` creates lookup from SQL results
   - `computeRelativePath()` strips absolute path prefixes
   - `extractFallbackName()` provides fallback when node metadata unavailable

3. **C4 Generator Enhancements** (`views/c4-generator.ts`):
   - Added `startLine?: number` to `C4Component` interface
   - Added `internalEdges?: InternalEdge[]` to `C4GeneratorOptions`
   - `aggregateRelationships()` groups duplicate relationships with combined labels and counts
   - `addInternalRelationships()` adds call graph edges between containers

4. **Doc Generator Updates** (`docs/c4-doc-generator.ts`):
   - `computeRelativeLinkPath()` now accepts optional `lineNumber` parameter
   - Source links include line number anchors (e.g., `file.ts#L42`)
   - Scoped drill-down views per container for detailed component relationships

5. **CLI Integration** (`commands/doc-sync.ts`):
   - Fetches node metadata from parquet files using SQL
   - Fetches internal CALLS edges from edges table
   - Enriches domain effects before C4 generation

### Output Example

Before:
```c4
abc12345 = component 'abc12345' {
  link ../../src/analyzer.ts
}
system.Users -> external_Storage_s3 'Storage:Read'
system.Users -> external_Storage_s3 'Storage:Read'
// ... repeated 43 times
```

After:
```c4
analyzePackage = component 'analyzePackage' {
  link ../../src/analyzer/analysis-orchestrator.ts#L42
}

// Aggregated relationship with count
system.analyzer -> external_Storage_s3 'Read, Write (45 calls)'

views {
  view containers { ... }

  // Drill-down view for detailed component relationships
  view analyzer_detail of system.analyzer {
    title 'analyzer - Components'
    include *
  }
}
```

## Consequences

### Positive

- **Readable Diagrams**: Function names instead of hashes make diagrams immediately useful
- **Cleaner Relationships**: Aggregation reduces visual clutter from 43 lines to 1
- **Source Traceability**: Line number links enable direct navigation to code
- **Internal Architecture**: Call graph edges show how components interact
- **Drill-Down Navigation**: Scoped views preserve detailed relationships while keeping overview clean
- **Graceful Degradation**: Falls back to hash-based names if node metadata unavailable

### Negative

- **Additional SQL Queries**: Enrichment requires querying nodes and edges tables
- **Larger Memory Footprint**: Node lookup map held in memory during generation
- **Aggregation Hides Detail**: Overview diagrams don't show individual effect sources (mitigated by drill-down views)

### Neutral

- **Backward Compatible**: Existing code using `DomainEffect` continues to work
- **Optional Enrichment**: Enrichment is applied in CLI integration, not forced on library users

## References

- [Issue #114: Improve C4 Architecture Generator Output Quality](https://github.com/pietgk/vivief/issues/114)
- [ADR-0027: LikeC4 as Primary C4 Documentation Format](./0027-likec4-primary-format.md)
- [ADR-0026: Federated Documentation Generation](./0026-federated-documentation-generation.md)
