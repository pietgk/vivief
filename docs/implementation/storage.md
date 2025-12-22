# Storage System

This document covers the DuckDB + Parquet storage layer: how data is written, read, and managed.

## Storage Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STORAGE LAYER COMPONENTS                                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        DuckDB Pool                                   │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐           │   │
│  │  │  Conn 1   │ │  Conn 2   │ │  Conn 3   │ │  Conn 4   │           │   │
│  │  │  (idle)   │ │  (active) │ │  (idle)   │ │  (active) │           │   │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│          ┌───────────────────┼───────────────────┐                         │
│          ▼                   ▼                   ▼                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│  │ SeedWriter  │     │ SeedReader  │     │ File Lock   │                  │
│  │             │     │             │     │             │                  │
│  │ Atomic      │     │ Query       │     │ Concurrent  │                  │
│  │ Writes      │     │ Interface   │     │ Protection  │                  │
│  └──────┬──────┘     └──────┬──────┘     └─────────────┘                  │
│         │                   │                                              │
│         ▼                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Parquet Files                                    │   │
│  │  .devac/seed/base/nodes.parquet                                     │   │
│  │  .devac/seed/base/edges.parquet                                     │   │
│  │  .devac/seed/base/external_refs.parquet                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## DuckDB Pool

The connection pool manages DuckDB connections for efficiency:

```typescript
import { DuckDBPool } from "./storage/duckdb-pool";

// Create pool with configuration
const pool = new DuckDBPool({
  maxConnections: 4,      // Maximum concurrent connections
  minConnections: 1,      // Keep 1 warm
  idleTimeoutMs: 60000,   // Close idle after 1 minute
  acquireTimeoutMs: 30000 // Fail if can't acquire in 30s
});

await pool.initialize();

// Use connection
const result = await pool.execute(async (conn) => {
  return await conn.all("SELECT * FROM nodes LIMIT 10");
});

// Cleanup
await pool.shutdown();
```

### Connection Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CONNECTION LIFECYCLE                                                       │
│                                                                             │
│  CLI Mode (ephemeral):                                                      │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐                               │
│  │ Create  │ ──► │ Execute │ ──► │ Close   │                               │
│  │ conn    │     │ query   │     │ conn    │                               │
│  └─────────┘     └─────────┘     └─────────┘                               │
│                                                                             │
│  Watch Mode (pooled):                                                       │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐              │
│  │ Acquire │ ──► │ Execute │ ──► │ Release │ ──► │ Reuse   │              │
│  │ conn    │     │ query   │     │ to pool │     │ later   │              │
│  └─────────┘     └─────────┘     └─────────┘     └─────────┘              │
│                                                                             │
│  Warm Start Benefit:                                                        │
│  Cold: ~100-200ms (connection + metadata load)                             │
│  Warm: ~10-20ms (connection reuse)                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## SeedWriter

The SeedWriter handles atomic writes to Parquet files:

```typescript
import { createSeedWriter } from "./storage/seed-writer";

const writer = createSeedWriter(pool, "/path/to/package");

// Write parse results (atomic)
await writer.writeFile({
  filePath: "src/auth.ts",
  sourceFileHash: "abc123...",
  nodes: [...],
  edges: [...],
  externalRefs: [...]
});

// Update (delete old + write new)
await writer.updateFile(parseResult);

// Delete file's data
await writer.deleteFile("src/auth.ts");
```

### Atomic Write Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ATOMIC WRITE SEQUENCE                                                      │
│                                                                             │
│  Step 1: Acquire lock                                                       │
│  ───────────────────                                                        │
│  .devac/seed/.devac.lock created with PID                                  │
│  Other processes wait or timeout                                           │
│                                                                             │
│  Step 2: Write to temp file                                                 │
│  ─────────────────────────                                                  │
│  COPY nodes TO 'nodes.parquet.tmp' (FORMAT PARQUET, COMPRESSION ZSTD)      │
│                                                                             │
│  Step 3: Atomic rename                                                      │
│  ────────────────────                                                       │
│  fs.rename('nodes.parquet.tmp', 'nodes.parquet')                           │
│  (POSIX rename(2) is atomic within same filesystem)                        │
│                                                                             │
│  Step 4: Fsync directory                                                    │
│  ──────────────────────                                                     │
│  Ensures rename is persisted even on power failure                         │
│                                                                             │
│  Step 5: Release lock                                                       │
│  ───────────────────                                                        │
│  .devac.lock deleted                                                       │
│                                                                             │
│  Step 6: Cleanup on failure                                                 │
│  ────────────────────────                                                   │
│  If any step fails, .tmp file is deleted                                   │
│  Original file remains intact                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## SeedReader

The SeedReader provides query access to seed files:

```typescript
import { createSeedReader } from "./storage/seed-reader";

const reader = createSeedReader(pool, "/path/to/package");

// Read all nodes
const nodes = await reader.readNodes();

// Read with filter
const functions = await reader.readNodes({
  kind: "function",
  isExported: true
});

// Custom query
const result = await reader.query(`
  SELECT name, file_path 
  FROM nodes 
  WHERE kind = 'class'
`);

// Check integrity
const integrity = await reader.verifyIntegrity();
if (!integrity.valid) {
  console.error("Corrupt seeds:", integrity.errors);
}
```

### Query Patterns

```sql
-- Package-local query (fast, single package)
SELECT * FROM read_parquet('packages/auth/.devac/seed/base/nodes.parquet')
WHERE kind = 'function' AND is_exported = true

-- Repository-wide query (glob pattern)
SELECT * FROM read_parquet('packages/*/.devac/seed/base/nodes.parquet')
WHERE kind = 'class'

-- Cross-repo query (multiple paths)
SELECT * FROM read_parquet([
  '/path/to/repo-api/packages/*/.devac/seed/base/nodes.parquet',
  '/path/to/repo-web/apps/*/.devac/seed/base/nodes.parquet'
])
WHERE name = 'handleLogin'

-- Unified branch view (base + delta)
SELECT * FROM (
  SELECT * FROM read_parquet('branch/nodes.parquet')
  WHERE is_deleted = false
  UNION ALL
  SELECT * FROM read_parquet('base/nodes.parquet') base
  WHERE NOT EXISTS (
    SELECT 1 FROM read_parquet('branch/nodes.parquet') br
    WHERE br.file_path = base.file_path
  )
)
```

## File Locking

Prevents concurrent writes to the same package:

```typescript
import { withSeedLock } from "./storage/file-lock";

// Automatic lock acquisition and release
await withSeedLock(seedPath, async () => {
  // Safe to write here
  await writer.writeFile(parseResult);
});

// Lock is released even on error
```

### Lock Implementation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FILE LOCK MECHANISM                                                        │
│                                                                             │
│  Lock file: .devac/seed/.devac.lock                                        │
│                                                                             │
│  Contents:                                                                  │
│  {                                                                          │
│    "pid": 12345,                                                           │
│    "timestamp": "2025-12-15T10:30:00Z",                                    │
│    "hostname": "developer-laptop"                                          │
│  }                                                                          │
│                                                                             │
│  Acquisition:                                                               │
│  1. Try fs.open(..., 'wx') - atomic create-exclusive                       │
│  2. If exists, check if PID is still running                               │
│  3. If stale (PID not running), remove and retry                          │
│  4. If fresh, wait with exponential backoff (50ms → 1000ms)               │
│  5. Timeout after 30s                                                      │
│                                                                             │
│  Release:                                                                   │
│  1. Delete lock file                                                       │
│  2. Log warning if delete fails (non-fatal)                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Parquet Configuration

```typescript
// Parquet write options for optimal performance
const PARQUET_OPTIONS = {
  compression: "zstd",    // Best compression/speed ratio
  rowGroupSize: 10000,    // Smaller for per-package partitions
  statistics: true,       // Enable predicate pushdown
  dictionary: true        // String dictionary encoding
};
```

### Compression Comparison

| Compression | Size | Write Speed | Read Speed |
|-------------|------|-------------|------------|
| None | 100% | Fastest | Fastest |
| Snappy | 50% | Fast | Fast |
| ZSTD | 30% | Medium | Fast |
| GZIP | 25% | Slow | Medium |

**ZSTD** is chosen for the best balance of compression ratio and read performance.

## Error Recovery

### Corrupt Parquet Detection

```typescript
// DuckDB validates Parquet footer on read
async function validateParquet(filePath: string): Promise<boolean> {
  try {
    await pool.execute(async (conn) => {
      await conn.run(`SELECT COUNT(*) FROM read_parquet('${filePath}') LIMIT 0`);
    });
    return true;
  } catch {
    return false; // Corrupted
  }
}
```

### Recovery Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CORRUPTION RECOVERY                                                        │
│                                                                             │
│  1. Detect: DuckDB throws on read                                          │
│  2. Log: Warning with file path                                            │
│  3. Remove: Delete corrupt Parquet file                                    │
│  4. Regenerate: Re-analyze source files                                    │
│  5. Continue: System remains operational                                   │
│                                                                             │
│  Source code is always the truth - seeds are 100% regenerable              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Orphan Cleanup

On startup, DevAC cleans up artifacts from interrupted operations:

```typescript
import { cleanupOrphanedFiles } from "./utils/cleanup";

const result = await cleanupOrphanedFiles(seedPath);
// { tempFilesRemoved: 3, staleLockFilesRemoved: 1, errors: [] }
```

### Cleanup Targets

| Artifact | Pattern | Age Threshold | Action |
|----------|---------|---------------|--------|
| Temp Parquet | `*.parquet.tmp` | >1 hour | Delete |
| Orphan temp | `*.tmp` | >1 hour | Delete |
| Stale locks | `.devac.lock` | PID not running | Delete |

## Memory Management

```typescript
// DuckDB memory configuration
const duckdbConfig = {
  memory_limit: "512MB",  // Per connection
  temp_directory: "/tmp/devac-duckdb",
  threads: os.cpus().length - 1
};
```

### Memory Limits by Operation

| Operation | Typical Usage | Max Recommended |
|-----------|---------------|-----------------|
| Single file analysis | 50-100MB | 256MB |
| Package analysis | 100-300MB | 512MB |
| Repo-wide query | 200-500MB | 1GB |
| Cross-repo query | 300-800MB | 2GB |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVAC_DUCKDB_MEMORY` | `512MB` | Memory limit per connection |
| `DEVAC_DUCKDB_THREADS` | `CPU count - 1` | Parallel threads |
| `DEVAC_DUCKDB_POOL_SIZE` | `4` | Max pool connections |
| `DEVAC_DUCKDB_TEMP_DIR` | System temp | Spill directory |

---

*Next: [Parsing Pipeline](./parsing.md) for analysis flow*
