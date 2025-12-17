# ADR-0001: Replace Neo4j with DuckDB

## Status

Accepted

## Context

The v1.x architecture used Neo4j as the central database. During v1.11 development, a `NodeIndexCache` was introduced - an in-memory cache duplicating all nodes from Neo4j. This highlighted a fundamental issue: Neo4j optimizes for graph traversal but has poor point-lookup performance.

We needed a database that:
- Supports efficient point lookups
- Handles analytical queries well
- Works with file-based storage for federation
- Doesn't require running a server

## Decision

Replace Neo4j with DuckDB + Parquet files.

### Options Considered

1. **Keep Neo4j + add PostgreSQL for point lookups**
   - Pros: Minimal migration, keep Cypher queries
   - Cons: Two databases to manage, data sync complexity

2. **Replace Neo4j with DuckDB + Parquet (file-based)**
   - Pros: Single technology, file-based storage enables federation, no server required
   - Cons: Graph queries need recursive CTEs instead of Cypher

3. **Replace Neo4j with SQLite**
   - Pros: Simple, well-understood
   - Cons: Poor analytical query performance, no native Parquet support

## Consequences

### Positive

- Source code is truth - everything else is derived and regenerable
- No data duplication - query Parquet files directly
- Single technology stack - DuckDB everywhere
- Enables federation - each package owns its seeds
- No database server to manage

### Negative

- Major architectural change from v1.x
- Graph queries use recursive CTEs instead of Cypher
- No real-time cross-repo sync (acceptable trade-off)
- Learning curve for recursive CTE patterns

### Neutral

- Parquet files are portable and can be inspected with standard tools
- DuckDB has excellent SQL support and growing ecosystem

## References

- `devac-spec-v2.0-storage-design-decisions.md` - Detailed DuckDB/Parquet configuration analysis
