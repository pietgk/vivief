# ADR-0007: Federation with Central Hub

## Status

Accepted

## Context

We need to query across multiple repositories without copying data. In a typical organization:
- Multiple teams work on different repositories
- Cross-repo dependencies exist (shared libraries, APIs)
- Each team should own their repository's analysis

## Decision

Implement a three-layer federation model with a central hub.

### Layers

1. **Package Seeds** - Ground truth
   - Per-package Parquet files
   - Owned by each repository
   - Contains nodes, edges, external_refs

2. **Repository Manifest** - Index
   - Lists all packages in a repository
   - Contains package metadata (path, language, dependencies)
   - One manifest per repository

3. **Central Hub** - Registry + Computed Data
   - Registry of all repositories
   - Computed cross-repo edges
   - Does NOT store raw nodes/edges

### Key Insight

Hub stores only computed data, NOT raw nodes/edges. Queries go directly to Parquet files via DuckDB glob patterns.

## Consequences

### Positive

- No data duplication across layers
- Each repository is self-contained and portable
- Cross-repo queries use efficient DuckDB glob patterns
- Teams maintain ownership of their repository data

### Negative

- No real-time cross-repo sync
- Manual `devac hub refresh` needed after repository changes
- Cross-repo queries require network access to remote seeds

### Neutral

- Hub can be local (single developer) or shared (team)
- Computed edges can be regenerated from seeds

## References

- See ADR-0001 for DuckDB choice rationale
- See ADR-0002 for package partitioning that enables this federation
