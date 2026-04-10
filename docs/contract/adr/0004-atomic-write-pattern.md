# ADR-0004: Atomic Write Pattern

## Status

Accepted

## Context

Parquet files cannot be incrementally updated - the metadata is at the end of the file. Interrupted writes (crash, power loss, Ctrl+C) can leave corrupt files that are unreadable.

We needed a write pattern that:
- Ensures files are never corrupt
- Works reliably on POSIX systems
- Is a proven industry pattern

## Decision

Use temp file + atomic rename + fsync for all Parquet writes.

### Implementation

```typescript
// 1. Write to temp file
await writeParquet(data, `${path}.tmp`);

// 2. Atomic rename (POSIX guarantees)
await fs.rename(`${path}.tmp`, path);

// 3. Fsync directory for durability
const dir = await fs.open(dirname(path), "r");
await dir.datasync();
await dir.close();
```

## Consequences

### Positive

- Either old or new file exists, never corrupt
- Industry standard pattern (used by npm write-file-atomic)
- Works reliably on macOS and Linux
- Simple to understand and implement

### Negative

- Windows may need retry logic due to EBUSY errors when files are open
- Windows support deferred (see ADR-0009)

### Neutral

- Slightly more I/O than direct write (temp file + rename)
- Fsync adds small latency but ensures durability

## References

- npm `write-file-atomic` package uses same pattern
- POSIX `rename()` atomicity guarantees
