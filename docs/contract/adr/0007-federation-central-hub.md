# ADR-0007: Federation with Central Hub

## Status

Accepted

> **Note:** CLI commands in this ADR have been reorganized in v4.0. See `docs/cli-reference.md` for current commands.

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
- **DuckDB single-writer constraint**: Only one process can have read-write access to the hub database at a time (see [ADR-0024](0024-hub-single-writer-ipc.md))

### Neutral

- Hub can be local (single developer) or shared (team)
- Computed edges can be regenerated from seeds

## Concurrency Model

Due to DuckDB's single-writer constraint, the hub implements a **Single Writer Architecture** when the MCP server is running:

1. **MCP running**: MCP server owns the hub database exclusively. CLI commands delegate operations via Unix socket IPC.
2. **MCP not running**: CLI commands access the hub directly (read-only for queries, read-write for mutations).

This ensures CLI commands work seamlessly whether MCP is running or not. See [ADR-0024](0024-hub-single-writer-ipc.md) for implementation details.

## References

- See [ADR-0001](0001-replace-neo4j-with-duckdb.md) for DuckDB choice rationale
- See [ADR-0002](0002-per-package-partitioning.md) for package partitioning that enables this federation
- See [ADR-0024](0024-hub-single-writer-ipc.md) for Single Writer Architecture (IPC layer)
