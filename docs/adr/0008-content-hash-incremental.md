# ADR-0008: Content Hash for Incremental Analysis

## Status

Accepted

## Context

We need fast incremental updates when files change. Challenges include:
- File watcher may miss events (during sleep, network issues)
- Git operations (checkout, rebase) change many files at once
- Need reliable detection regardless of how files changed

## Decision

Use SHA-256 content hashing with stored hashes for change detection.

### Flow

1. Compute current file hashes (~20ms for typical package)
2. Compare with stored hashes (in nodes.parquet metadata)
3. Parse only files with changed hashes
4. Merge changes into package Parquet

### Hash Storage

Hashes are stored in the nodes.parquet file alongside node data:
- `source_file_hash` column contains SHA-256 of file content
- Enables quick comparison without re-reading file content

## Consequences

### Positive

- Hash check catches ALL changes, even if watcher missed events
- Fast when nothing changed: ~20-50ms
- Fast for single file change: ~150-300ms
- Works reliably after IDE restart, git checkout, branch switch
- Deterministic - same content always produces same hash

### Negative

- Requires reading all files to compute hashes
- SHA-256 computation has small overhead
- Hash storage adds to Parquet file size

### Neutral

- Hash comparison serves as reliable backup for file watcher
- Can be used standalone without file watcher for batch operations

## References

- See ADR-0002 for how hashes integrate with package partitioning
- SHA-256 chosen for security and collision resistance
