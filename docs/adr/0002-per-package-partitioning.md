# ADR-0002: Per-Package Partitioning

## Status

Accepted

## Context

The original v2.0 proposal used per-source-file partitioning (one Parquet file per source file). Code review flagged this as HIGH RISK due to file count explosion - a typical monorepo with 5,000 source files would create 15,000+ Parquet files (3 per source file).

We needed a partitioning strategy that:
- Limits file count to manageable numbers
- Maintains good query performance
- Supports incremental updates
- Enables branch-based development

## Decision

Use per-package partitioning with base/branch delta storage.

Each package produces at most 6 Parquet files:
- `nodes.parquet` (base branch)
- `edges.parquet` (base branch)
- `external_refs.parquet` (base branch)
- `nodes.delta.parquet` (feature branch changes)
- `edges.delta.parquet` (feature branch changes)
- `external_refs.delta.parquet` (feature branch changes)

### Options Considered

1. **Per-file partitioning (3 files per source file)**
   - Pros: Minimal rewrite on file change
   - Cons: 15,000+ files for typical monorepo, slow glob queries

2. **Single package file (monolithic)**
   - Pros: Simplest implementation
   - Cons: Entire file rewritten on any change

3. **Per-package with base/branch delta storage**
   - Pros: 6 files max per package, efficient queries, branch support
   - Cons: Single file change rewrites package Parquet

## Consequences

### Positive

- File count: 6 files max per package vs potentially 15,000+
- Query performance: DuckDB handles single files better than 10K+ file globs
- Incremental: Content-hash based change detection achieves <500ms updates
- Branch support: Delta storage enables efficient feature branch handling

### Negative

- Single file change rewrites entire package Parquet
- Acceptable trade-off: ~150-300ms for typical packages
- Base branch edits slower than feature branch (300-500ms vs 150-300ms)

### Neutral

- Package boundaries align with logical code organization
- Delta files can be merged into base on branch merge

## References

- `devac-spec-v2.0-branch-partitioning-research.md` - Detailed partitioning analysis
