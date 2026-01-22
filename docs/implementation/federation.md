# Federation

This document covers multi-repository queries and the central hub.

## Federation Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FEDERATED ARCHITECTURE                                                     │
│                                                                             │
│  LAYER 1: Package Seeds (per package, ground truth)                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  repo-api/packages/auth/.devac/seed/                                │   │
│  │  repo-api/packages/core/.devac/seed/                                │   │
│  │  repo-web/apps/web/.devac/seed/                                     │   │
│  │  repo-mobile/packages/app/.devac/seed/                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  LAYER 2: Repository Manifests (per repo, index)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  repo-api/.devac/manifest.json                                      │   │
│  │  repo-web/.devac/manifest.json                                      │   │
│  │  repo-mobile/.devac/manifest.json                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  LAYER 3: Central Hub (workspace-level, computed edges)                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  {workspace}/.devac/central.duckdb                                  │   │
│  │  {workspace}/.devac/repos.json                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Repository Manifest

Each repository has a manifest indexing its packages:

```json
{
  "name": "repo-api",
  "packages": [
    { "path": "packages/auth", "seedPath": "packages/auth/.devac/seed" },
    { "path": "packages/core", "seedPath": "packages/core/.devac/seed" }
  ],
  "lastAnalyzed": "2025-01-15T10:30:00Z"
}
```

### Manifest Generation

```typescript
import { generateManifest } from "./hub/manifest-generator";

const manifest = await generateManifest("/path/to/repo");
// Scans for .devac/seed directories
// Creates .devac/manifest.json
```

## Central Hub

The central hub tracks registered repositories and enables cross-repo queries.

### Hub Structure

```
{workspace}/.devac/
├── central.duckdb       ← Lightweight: only computed data
├── repos.json           ← Registered repositories
└── cache/               ← Query result cache (optional)
```

### repos.json

```json
{
  "repositories": [
    {
      "name": "repo-api",
      "path": "/Users/dev/code/repo-api",
      "registeredAt": "2025-01-15T10:00:00Z"
    },
    {
      "name": "repo-web",
      "path": "/Users/dev/code/repo-web",
      "registeredAt": "2025-01-15T10:05:00Z"
    }
  ]
}
```

## Hub Commands

### Sync Repository (Automatic Registration)

```bash
# From within the repository - analyzes and auto-registers with hub
devac sync

# Or specify path
devac sync --path ~/code/repo-api
```

### List Registered Repositories

```bash
devac query repos

# Output:
# ┌────────────────┬───────────────────────────┬────────────────┐
# │ Name           │ Path                      │ Packages       │
# ├────────────────┼───────────────────────────┼────────────────┤
# │ repo-api       │ ~/code/repo-api           │ 4              │
# │ repo-web       │ ~/code/repo-web           │ 2              │
# │ repo-mobile    │ ~/code/repo-mobile        │ 3              │
# └────────────────┴───────────────────────────┴────────────────┘
```

### Query Across Repositories

```bash
# Find function across all repos
devac query sql "SELECT * FROM nodes WHERE name = 'handleLogin'"

# Find imports of a shared module
devac query sql "
  SELECT source_file_path, imported_symbol
  FROM external_refs
  WHERE module_specifier = '@shared/schema'
"
```

### Hub Status

```bash
devac status --hub

# Output:
# Central Hub: /path/to/workspace/.devac/
# Repositories: 3
# Total Packages: 9
# Total Nodes: 45,231
# Last Refresh: 2025-01-15T10:30:00Z
```

### Workspace Refresh

```bash
# Rebuild cross-repo edge cache
devac workspace refresh
```

## Cross-Repo Queries

### Direct Parquet Queries

```sql
-- Query across all registered repos
SELECT 
  entity_id,
  name,
  file_path,
  split_part(entity_id, ':', 1) as repo
FROM read_parquet([
  '/path/to/repo-api/packages/*/.devac/seed/base/nodes.parquet',
  '/path/to/repo-web/apps/*/.devac/seed/base/nodes.parquet'
])
WHERE kind = 'function' AND name = 'handleLogin';
```

### Finding Cross-Repo Dependencies

```sql
-- Find all consumers of a shared type
SELECT 
  refs.source_file_path,
  refs.source_entity_id,
  split_part(refs.source_entity_id, ':', 1) as repo
FROM read_parquet('**/external_refs.parquet') refs
WHERE refs.module_specifier = '@shared/schema'
  AND refs.imported_symbol = 'User';
```

## Affected Analysis

The hub can determine what's affected by a change across repositories:

```typescript
import { createAffectedAnalyzer } from "./hub/affected-analyzer";

const analyzer = createAffectedAnalyzer(hub);

// What's affected by changing User type?
const affected = await analyzer.findAffected({
  repo: "shared-schema",
  symbol: "User"
});

// Returns files from all repos that import User
// {
//   "repo-api": ["src/controllers/UserController.ts"],
//   "repo-web": ["src/components/UserCard.tsx", "src/pages/Profile.tsx"],
//   "repo-mobile": ["src/screens/ProfileScreen.tsx"]
// }
```

### Affected Query Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CROSS-REPO AFFECTED ANALYSIS                                               │
│                                                                             │
│  Changed: shared-schema/src/types.ts (modified User type)                  │
│                                                                             │
│  Step 1: Identify changed exports                                           │
│  ─────────────────────────────────                                          │
│  Query changed package's nodes.parquet                                     │
│  → Changed: [User], Unchanged: [Post, Comment]                             │
│                                                                             │
│  Step 2: Find importers across all repos                                    │
│  ────────────────────────────────────────                                   │
│  Query: SELECT source_file_path FROM external_refs                         │
│         WHERE module_specifier = '@shared/schema'                          │
│         AND imported_symbol = 'User'                                       │
│  Scope: All registered repos                                               │
│                                                                             │
│  Step 3: Return affected files grouped by repo                              │
│  ───────────────────────────────────────────────                            │
│  repo-api: [UserController.ts]                                             │
│  repo-web: [UserCard.tsx, Profile.tsx]                                     │
│  repo-mobile: [ProfileScreen.tsx]                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Central Hub Database

The central DuckDB database stores only computed data:

```sql
-- repo_registry: Which repos are known
CREATE TABLE repo_registry (
  name VARCHAR PRIMARY KEY,
  path VARCHAR NOT NULL,
  registered_at TIMESTAMP DEFAULT NOW()
);

-- cross_repo_edges: Computed import→export mappings
CREATE TABLE cross_repo_edges (
  id VARCHAR PRIMARY KEY,
  source_repo VARCHAR NOT NULL,
  source_entity_id VARCHAR NOT NULL,
  target_repo VARCHAR NOT NULL,
  target_entity_id VARCHAR NOT NULL,
  edge_type VARCHAR DEFAULT 'IMPORTS',
  computed_at TIMESTAMP DEFAULT NOW()
);

-- cached_stats: Optional aggregations
CREATE TABLE cached_stats (
  repo VARCHAR NOT NULL,
  package_path VARCHAR NOT NULL,
  node_count INTEGER,
  edge_count INTEGER,
  ref_count INTEGER,
  computed_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (repo, package_path)
);
```

**Important:** The hub does NOT store raw nodes/edges. Those are queried directly from Parquet files.

## Federation Best Practices

### Monorepo Setup

```bash
# For a monorepo with multiple packages
cd ~/code/monorepo

# Analyze all packages (auto-registers with hub)
devac sync
```

### Multi-Repo Setup

```bash
# Sync each repo (auto-registers with hub)
cd ~/code/repo-api && devac sync
cd ~/code/repo-web && devac sync
cd ~/code/repo-mobile && devac sync

# Query across all
devac query sql "SELECT COUNT(*) FROM nodes GROUP BY split_part(entity_id, ':', 1)"
```

### Keeping Hub in Sync

```bash
# After major changes, refresh workspace
devac workspace refresh

# Or set up watch mode per repo
# (In separate terminals)
cd ~/code/repo-api && devac sync --watch
cd ~/code/repo-web && devac sync --watch
```

## Performance Characteristics

| Query Type | Typical Time | Notes |
|------------|--------------|-------|
| Single repo query | <100ms | Direct Parquet read |
| Cross-repo query (3 repos) | 200-600ms | Multiple glob patterns |
| Affected analysis | 300-800ms | Depends on import count |
| Hub refresh | 2-10s | Recomputes all edges |

## Limitations

1. **No Real-Time Cross-Repo Sync**: Changes in one repo don't automatically update hub. Use `devac hub refresh` after significant changes.

2. **Hub is Local**: The central hub is per-user, not shared. Each developer has their own hub.

3. **External Dependencies Unresolved**: Imports from npm/pypi packages remain unresolved (marked `is_resolved = false`).

---

*Next: [CLI Reference](./cli-reference.md) for all commands*
