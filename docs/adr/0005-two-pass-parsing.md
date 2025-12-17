# ADR-0005: Two-Pass Parsing Architecture

## Status

Accepted (preserved from v1.x)

## Context

Code analysis requires two types of information:

1. **Structural**: What symbols exist in each file (functions, classes, variables)
2. **Semantic**: How symbols relate across files (import resolution, type inference)

Structural analysis is fast and parallelizable. Semantic analysis requires cross-file knowledge and is inherently slower.

## Decision

Keep the two-pass architecture from v1.x.

### Pass 1 (Structural)

- Per-file, fully parallelizable
- Fast: <50ms per TypeScript file
- Extracts: nodes, edges, external_refs (unresolved)
- No cross-file dependencies

### Pass 2 (Semantic)

- Cross-file, batched processing
- Resolves imports to target entity_ids
- Updates external_refs with resolution info
- Uses compiler-grade tools (ts-morph, Pyright)

## Consequences

### Positive

- Proven pattern from v1.x with known performance characteristics
- Enables parallel parsing for maximum throughput
- Separates fast path (structural) from expensive resolution (semantic)
- Pass 1 can complete while Pass 2 runs in background

### Negative

- Two passes means two iterations over code
- External refs are unresolved until Pass 2 completes
- More complex orchestration logic

### Neutral

- Pass 2 can be skipped for quick structural queries
- Resolution accuracy depends on Pass 2 tooling quality

## References

- v1.x implementation proved the pattern at scale
- See ADR-0006 for Python-specific parsing considerations
