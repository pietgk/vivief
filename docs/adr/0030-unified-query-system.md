# ADR-0030: Unified Query System Architecture

## Status

Accepted

## Context

DevAC has evolved to support three query levels:

1. **Package-level**: Query a single package's seeds
2. **Repo-level**: Query all packages in a repository
3. **Workspace-level**: Query packages across multiple repositories

Previously, these levels required different functions:
- `queryParquet()` for single-file queries
- `setupQueryContext()` + raw SQL for multi-package queries
- `queryMultiplePackages()` for explicit multi-package queries
- Hub's `query()` for workspace-level queries

This fragmentation caused:
- **API confusion**: Developers needed to choose the "right" function
- **Code duplication**: Similar view-creation logic in multiple places
- **Inconsistent behavior**: Different error handling and metadata between functions
- **Mental overhead**: Understanding when to use which function

## Decision

We introduce a **Unified Query System** where the query level is **implicit from the packages array**:

```typescript
import { query } from "@pietgk/devac-core";

// Package level - 1 package
await query(pool, {
  packages: ["/repo/packages/core"],
  sql: "SELECT * FROM nodes"
});

// Repo level - multiple packages from same repo
await query(pool, {
  packages: ["/repo/packages/core", "/repo/packages/cli"],
  sql: "SELECT * FROM nodes"
});

// Workspace level - packages from multiple repos
await query(pool, {
  packages: ["/repo-a/pkg", "/repo-b/pkg"],
  sql: "SELECT * FROM nodes"
});
```

### Key Design Principles

1. **Single Entry Point**: One `query()` function for all levels
2. **Packages Array Abstraction**: The array of package paths determines query scope
3. **Implicit Level Detection**: No explicit "level" parameter needed
4. **Rich Metadata**: Returns timing, warnings, views created, packages queried
5. **Graceful Degradation**: Warns and skips invalid packages instead of failing

### API Surface

```typescript
interface QueryConfig {
  /** Package paths to query (absolute paths) */
  packages: string[];

  /** SQL query to execute */
  sql: string;

  /** Branch partition (default: "base") */
  branch?: string;
}

interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  timeMs: number;
  viewsCreated: string[];      // e.g., ["nodes", "edges", "effects"]
  packagesQueried: string[];   // Actually queried (after filtering)
  warnings: string[];          // e.g., root-level seed warnings
}

async function query<T>(pool: DuckDBPool, config: QueryConfig): Promise<QueryResult<T>>;
```

### Implementation Details

1. **View Creation Strategy**:
   - Single package: `CREATE VIEW nodes AS SELECT * FROM read_parquet('path')`
   - Multiple packages: `CREATE VIEW nodes AS SELECT * FROM read_parquet(['path1', 'path2'])`

2. **Root-Level Seed Detection**:
   - Warns if seeds exist at repo root (should only be at package level)
   - Skips invalid paths instead of throwing

3. **Automatic View Management**:
   - Creates `nodes`, `edges`, `external_refs`, `effects` views as needed
   - Only creates views for tables with existing parquet files

### Implementation File

```
packages/devac-core/src/storage/unified-query.ts
```

### Backward Compatibility

The old functions remain available but are marked as deprecated:
- `setupQueryContext()` → Use `query()` with single package
- `queryMultiplePackages()` → Use `query()` with package array

## Consequences

### Positive

- **Simple Mental Model**: One function, array size determines scope
- **Consistent API**: Same interface for all query levels
- **Rich Feedback**: Warnings and metadata help debugging
- **Type Safety**: Generic type parameter for result rows
- **Discoverability**: Single function to learn and document

### Negative

- **Migration Effort**: Existing code using old functions needs updating
- **Package Discovery**: Caller must still discover packages (not automatic)
- **Connection Reuse**: Each `query()` call creates views (no persistent context)

### Neutral

- **No Hub Integration**: This is the low-level query API; hub queries still go through HubClient
- **View Names Fixed**: Always creates `nodes`, `edges`, `external_refs`, `effects`

## Examples

### Package-Level Query

```typescript
const result = await query(pool, {
  packages: ["/path/to/package"],
  sql: "SELECT name, kind FROM nodes WHERE kind = 'function'"
});
console.log(`Found ${result.rowCount} functions in ${result.timeMs}ms`);
```

### Repo-Level Query

```typescript
import { discoverPackagesInRepo } from "@pietgk/devac-core";

const packages = await discoverPackagesInRepo("/path/to/repo");
const result = await query(pool, {
  packages: packages.map(p => p.path),
  sql: "SELECT DISTINCT package_path FROM nodes"
});
```

### Workspace-Level Query

```typescript
import { createHubClient } from "@pietgk/devac-core";

const hub = createHubClient();
const repos = await hub.listRepos();
const allPackages = repos.flatMap(r => r.packages.map(p => p.path));

const result = await query(pool, {
  packages: allPackages,
  sql: "SELECT repo_path, COUNT(*) FROM nodes GROUP BY repo_path"
});
```

## References

- [ADR-0001: Replace Neo4j with DuckDB](./0001-replace-neo4j-with-duckdb.md)
- [ADR-0002: Per-Package Partitioning](./0002-per-package-partitioning.md)
- [ADR-0007: Federation with Central Hub](./0007-federation-central-hub.md)
- [PR #125: Unified Query System](https://github.com/pietgk/vivief/pull/125)
