# Query Guide

This comprehensive guide covers all query capabilities in DevAC — from simple package-level queries to cross-repository analysis.

## Query Syntax Overview

DevAC provides three query approaches with progressive complexity:

| Approach | Syntax | Use Case | Example |
|----------|--------|----------|---------|
| **Views** | `FROM nodes` | Current package queries | `SELECT * FROM nodes WHERE kind = 'function'` |
| **Package shorthand** | `FROM nodes@core` | Cross-package queries | `SELECT * FROM edges@cli WHERE edge_type = 'CALLS'` |
| **Raw Parquet** | `FROM read_parquet('...')` | Full control, custom paths | Advanced federation |

### Quick Reference

```sql
-- Current package (uses auto-created views)
SELECT * FROM nodes WHERE kind = 'function'
SELECT * FROM edges WHERE edge_type = 'CALLS'
SELECT * FROM external_refs WHERE is_resolved = false
SELECT * FROM effects WHERE effect_type = 'FunctionCall'

-- Specific package by name
SELECT * FROM nodes@core WHERE is_exported = true
SELECT * FROM edges@cli WHERE edge_type = 'IMPORTS'
SELECT * FROM effects@cli WHERE is_external = true

-- All packages at once
SELECT name, file_path FROM nodes@* ORDER BY name
SELECT COUNT(*) FROM edges@* GROUP BY edge_type
SELECT effect_type, COUNT(*) FROM effects@* GROUP BY effect_type

-- Raw Parquet (full path control)
SELECT * FROM read_parquet('.devac/seed/base/nodes.parquet')
```

## Package-Level Queries

### Available Tables/Views

When running `devac query`, four views are automatically created:

| View | Description | Key Columns |
|------|-------------|-------------|
| `nodes` | Code entities | entity_id, name, kind, file_path, is_exported, documentation |
| `edges` | Relationships | source_entity_id, target_entity_id, edge_type, properties |
| `external_refs` | Import statements | module_specifier, imported_symbol, is_resolved |
| `effects` | Behavioral effects | effect_id, effect_type, source_entity_id, callee_name, is_external |

### Common Query Patterns

#### Find Functions by Name

```sql
-- Exact match
SELECT * FROM nodes WHERE name = 'handleLogin'

-- Pattern match (LIKE)
SELECT * FROM nodes WHERE name LIKE 'handle%'

-- Case-insensitive (ILIKE)
SELECT name, file_path FROM nodes WHERE name ILIKE '%auth%'
```

#### Find Exported Symbols

```sql
-- All exports
SELECT name, kind, file_path
FROM nodes
WHERE is_exported = true
ORDER BY kind, name;

-- Default exports only
SELECT * FROM nodes WHERE is_default_export = true;

-- Public API surface
SELECT name, kind, documentation
FROM nodes
WHERE is_exported = true
  AND documentation IS NOT NULL;
```

#### Find by Kind

```sql
-- All functions
SELECT name, file_path FROM nodes WHERE kind = 'function';

-- All classes
SELECT name, file_path FROM nodes WHERE kind = 'class';

-- React components (JSX or hooks)
SELECT name, file_path
FROM nodes
WHERE kind IN ('jsx_component', 'hook');
```

#### Find by Location

```sql
-- Functions in a specific file
SELECT name, start_line, end_line
FROM nodes
WHERE file_path = 'src/auth.ts'
  AND kind = 'function';

-- Functions in a directory
SELECT name, file_path
FROM nodes
WHERE file_path LIKE 'src/controllers/%'
  AND kind = 'function';
```

## Edge Queries (Relationships)

### Find Call Relationships

```sql
-- What does this function call?
SELECT
  e.target_entity_id,
  e.properties->>'callee' as callee,
  e.source_line
FROM edges e
JOIN nodes n ON e.source_entity_id = n.entity_id
WHERE n.name = 'processPayment'
  AND e.edge_type = 'CALLS';

-- Who calls this function?
SELECT
  n.name as caller,
  n.file_path,
  e.source_line
FROM edges e
JOIN nodes n ON e.source_entity_id = n.entity_id
WHERE e.target_entity_id LIKE '%:validateUser'
  AND e.edge_type = 'CALLS';
```

### Find Class Hierarchy

```sql
-- What does this class extend?
SELECT
  n.name as class_name,
  e.target_entity_id as extends
FROM edges e
JOIN nodes n ON e.source_entity_id = n.entity_id
WHERE n.kind = 'class'
  AND e.edge_type = 'EXTENDS';

-- What implements this interface?
SELECT
  n.name as implementor,
  n.file_path
FROM edges e
JOIN nodes n ON e.source_entity_id = n.entity_id
WHERE e.target_entity_id LIKE '%:IRepository'
  AND e.edge_type = 'IMPLEMENTS';
```

### Find Containment

```sql
-- What methods does this class contain?
SELECT
  child.name as method_name,
  child.start_line
FROM edges e
JOIN nodes parent ON e.source_entity_id = parent.entity_id
JOIN nodes child ON e.target_entity_id = child.entity_id
WHERE parent.name = 'AuthService'
  AND e.edge_type = 'CONTAINS'
  AND child.kind = 'method';
```

## External Reference Queries

### Find Imports

```sql
-- All React imports
SELECT
  source_file_path,
  imported_symbol
FROM external_refs
WHERE module_specifier = 'react';

-- All imports from a shared package
SELECT
  source_file_path,
  imported_symbol,
  local_alias
FROM external_refs
WHERE module_specifier = '@shared/schema';

-- Unresolved imports (external dependencies)
SELECT
  module_specifier,
  COUNT(*) as import_count
FROM external_refs
WHERE is_resolved = false
GROUP BY module_specifier
ORDER BY import_count DESC;
```

### Find Dependency Usage

```sql
-- Who uses lodash?
SELECT DISTINCT source_file_path
FROM external_refs
WHERE module_specifier LIKE 'lodash%';

-- Which AWS SDK methods are used?
SELECT
  module_specifier,
  imported_symbol,
  COUNT(*) as usage_count
FROM external_refs
WHERE module_specifier LIKE '@aws-sdk/%'
GROUP BY module_specifier, imported_symbol
ORDER BY usage_count DESC;
```

## Querying Documentation

DevAC extracts JSDoc/docstring content into the `documentation` field:

### Find Undocumented Functions

```sql
-- Exported functions without documentation
SELECT
  name,
  file_path,
  start_line
FROM nodes
WHERE kind = 'function'
  AND is_exported = true
  AND (documentation IS NULL OR documentation = '')
ORDER BY file_path, start_line;

-- Documentation coverage by file
SELECT
  file_path,
  COUNT(*) as total_functions,
  COUNT(documentation) as documented,
  ROUND(100.0 * COUNT(documentation) / COUNT(*), 1) as coverage_pct
FROM nodes
WHERE kind IN ('function', 'method')
  AND is_exported = true
GROUP BY file_path
HAVING COUNT(*) > 0
ORDER BY coverage_pct ASC;
```

### Search Documentation for Keywords

```sql
-- Find functions mentioning "deprecated"
SELECT
  name,
  file_path,
  documentation
FROM nodes
WHERE documentation ILIKE '%deprecated%';

-- Find functions related to authentication
SELECT
  name,
  file_path,
  SUBSTRING(documentation, 1, 100) as doc_preview
FROM nodes
WHERE documentation ILIKE '%auth%'
   OR documentation ILIKE '%login%'
   OR documentation ILIKE '%password%';

-- Find @throws annotations
SELECT
  name,
  file_path,
  documentation
FROM nodes
WHERE documentation LIKE '%@throws%';
```

### Generate API Documentation from Seeds

```sql
-- Export public API as markdown-ready format
SELECT
  '### ' || name || E'\n\n' ||
  '**Kind:** ' || kind || E'\n' ||
  '**File:** `' || file_path || ':' || start_line || '`' || E'\n\n' ||
  COALESCE(documentation, '_No documentation_') || E'\n\n---\n'
  as markdown_entry
FROM nodes
WHERE is_exported = true
  AND kind IN ('function', 'class', 'interface', 'type')
ORDER BY kind, name;
```

## Effect Queries (v3.0 Foundation)

DevAC extracts behavioral effects from code, describing what functions *do* rather than just what they *are*. Effects complement the structural data in nodes/edges.

### Available Effect Types

| Effect Type | Description | Key Fields |
|-------------|-------------|------------|
| `FunctionCall` | Invokes behavior | callee_name, is_external, is_async |
| `Store` | Persists data | target_name, storage_type |
| `Retrieve` | Fetches data | source_name, storage_type |
| `Send` | External communication | target_name, protocol |
| `Request` | Incoming request handler | method, route |
| `Response` | Outgoing response | status_code |
| `Condition` | Conditional branch | condition |
| `Loop` | Iteration | loop_type |
| `Group` | Container for nested effects | children |

### Find External Calls

```sql
-- What external functions does this code call?
SELECT
  source_entity_id,
  callee_name,
  file_path,
  start_line
FROM effects
WHERE effect_type = 'FunctionCall'
  AND is_external = true
ORDER BY callee_name;

-- Find all AWS SDK calls
SELECT
  callee_name,
  COUNT(*) as call_count
FROM effects
WHERE effect_type = 'FunctionCall'
  AND callee_name LIKE 'aws-sdk%'
GROUP BY callee_name
ORDER BY call_count DESC;
```

### Find Database Operations

```sql
-- Find all store operations
SELECT
  source_entity_id,
  target_name,
  file_path,
  start_line
FROM effects
WHERE effect_type = 'Store';

-- Find all data retrieval
SELECT
  source_entity_id,
  source_name,
  file_path
FROM effects
WHERE effect_type = 'Retrieve';
```

### Find HTTP/Network Effects

```sql
-- Find all outbound requests
SELECT
  source_entity_id,
  target_name,
  file_path
FROM effects
WHERE effect_type = 'Send';

-- Find API endpoints (request handlers)
SELECT
  source_entity_id,
  file_path,
  start_line
FROM effects
WHERE effect_type = 'Request';
```

### Async Effect Analysis

```sql
-- Find all async function calls
SELECT
  source_entity_id,
  callee_name,
  file_path
FROM effects
WHERE effect_type = 'FunctionCall'
  AND is_async = true;

-- Count async vs sync calls per file
SELECT
  file_path,
  SUM(CASE WHEN is_async THEN 1 ELSE 0 END) as async_calls,
  SUM(CASE WHEN NOT is_async THEN 1 ELSE 0 END) as sync_calls
FROM effects
WHERE effect_type = 'FunctionCall'
GROUP BY file_path
ORDER BY async_calls DESC;
```

### Cross-Package Effect Queries

```sql
-- Effects from CLI package
SELECT * FROM effects@cli WHERE effect_type = 'FunctionCall';

-- All external calls across all packages
SELECT
  callee_name,
  COUNT(*) as usage_count
FROM effects@*
WHERE effect_type = 'FunctionCall'
  AND is_external = true
GROUP BY callee_name
ORDER BY usage_count DESC;
```

## Multi-Package Queries

### Query by Package Name

```sql
-- Query the core package
SELECT * FROM nodes@core WHERE kind = 'function';

-- Query the CLI package
SELECT * FROM edges@cli WHERE edge_type = 'CALLS';

-- Cross-package comparison
SELECT
  'core' as package,
  COUNT(*) as function_count
FROM nodes@core
WHERE kind = 'function'
UNION ALL
SELECT
  'cli' as package,
  COUNT(*)
FROM nodes@cli
WHERE kind = 'function';
```

### Query All Packages

```sql
-- Find all exported classes across all packages
SELECT
  entity_id,
  name,
  file_path
FROM nodes@*
WHERE kind = 'class'
  AND is_exported = true
ORDER BY name;

-- Count by kind across all packages
SELECT
  kind,
  COUNT(*) as count
FROM nodes@*
GROUP BY kind
ORDER BY count DESC;

-- Find duplicate symbol names across packages
SELECT
  name,
  COUNT(DISTINCT split_part(entity_id, ':', 2)) as package_count
FROM nodes@*
WHERE is_exported = true
GROUP BY name
HAVING COUNT(DISTINCT split_part(entity_id, ':', 2)) > 1;
```

## Hub Queries (Cross-Repository)

### Basic Hub Queries

```bash
# Query across all registered repositories
devac hub query "SELECT * FROM nodes WHERE name = 'handleLogin'"

# Find all uses of a shared type
devac hub query "
  SELECT source_file_path, imported_symbol
  FROM external_refs
  WHERE module_specifier = '@shared/schema'
"
```

### Advanced Hub Queries

```sql
-- Find function across all repos (via hub)
SELECT
  entity_id,
  name,
  file_path,
  split_part(entity_id, ':', 1) as repo
FROM nodes
WHERE name = 'handleLogin';

-- Cross-repo dependency analysis
SELECT
  split_part(source_entity_id, ':', 1) as source_repo,
  module_specifier,
  COUNT(*) as import_count
FROM external_refs
WHERE module_specifier LIKE '@shared/%'
GROUP BY source_repo, module_specifier
ORDER BY import_count DESC;
```

### Package vs Hub: When to Use Each

| Use Case | Use Package Query | Use Hub Query |
|----------|-------------------|---------------|
| "What functions are in this file?" | ✅ `devac query` | ❌ Overkill |
| "Who calls this function?" | ✅ Same package | ✅ Cross-repo callers |
| "What imports @shared/schema?" | ✅ Local imports | ✅ All consumers |
| "Find all AuthService classes" | ✅ If local | ✅ Workspace-wide |
| "Affected by changing User type" | ❌ Limited scope | ✅ Full impact |

## Performance Best Practices

### Use Filters Early

```sql
-- ✅ Good: Filter in WHERE clause (pushdown to Parquet)
SELECT name, file_path
FROM nodes
WHERE kind = 'function' AND is_exported = true;

-- ❌ Avoid: Filter after SELECT all
SELECT * FROM nodes;  -- then filter in application
```

### Limit Result Sets

```sql
-- ✅ Good: Use LIMIT for exploration
SELECT * FROM nodes WHERE kind = 'function' LIMIT 10;

-- ❌ Avoid: Fetch all without limit
SELECT * FROM nodes;  -- may return thousands of rows
```

### Use Specific Columns

```sql
-- ✅ Good: Select only needed columns
SELECT name, file_path, start_line FROM nodes WHERE kind = 'class';

-- ❌ Avoid: SELECT * when you need few columns
SELECT * FROM nodes WHERE kind = 'class';
```

### Index-Like Patterns

Parquet files have statistics that enable predicate pushdown for:

| Column Type | Optimization |
|-------------|--------------|
| `kind` | String dictionary encoding - fast equality |
| `entity_id` | Prefix matching works well |
| `is_exported` | Boolean - very fast filter |
| `file_path` | LIKE with prefix works well |

```sql
-- ✅ Fast: Equality on kind (dictionary encoded)
SELECT * FROM nodes WHERE kind = 'function';

-- ✅ Fast: Prefix match on file_path
SELECT * FROM nodes WHERE file_path LIKE 'src/auth/%';

-- ⚠️ Slower: Suffix match (no index benefit)
SELECT * FROM nodes WHERE file_path LIKE '%Controller.ts';
```

### Query Size Estimates

| Query Scope | Typical Rows | Typical Time |
|-------------|--------------|--------------|
| Single file | 10-100 | <10ms |
| Single package | 100-5,000 | 10-100ms |
| All packages (monorepo) | 5,000-50,000 | 100-500ms |
| Hub (3+ repos) | 10,000-100,000 | 200-1000ms |

## Real-World Query Examples

### Example 1: Find All API Endpoints

```sql
-- Find functions that look like API handlers
SELECT
  name,
  file_path,
  start_line,
  documentation
FROM nodes
WHERE (name LIKE 'get%' OR name LIKE 'post%' OR name LIKE 'put%' OR name LIKE 'delete%')
  AND kind = 'function'
  AND file_path LIKE '%controller%'
ORDER BY file_path, name;
```

### Example 2: Find Unused Exports

```sql
-- Exported symbols that are never imported
SELECT
  n.name,
  n.file_path,
  n.kind
FROM nodes n
WHERE n.is_exported = true
  AND NOT EXISTS (
    SELECT 1 FROM external_refs r
    WHERE r.imported_symbol = n.name
      AND r.is_resolved = true
  )
ORDER BY n.file_path, n.name;
```

### Example 3: Call Graph Depth

```sql
-- Functions with most outgoing calls
SELECT
  n.name,
  n.file_path,
  COUNT(*) as call_count
FROM nodes n
JOIN edges e ON n.entity_id = e.source_entity_id
WHERE n.kind IN ('function', 'method')
  AND e.edge_type = 'CALLS'
GROUP BY n.name, n.file_path
ORDER BY call_count DESC
LIMIT 20;
```

### Example 4: Find Circular Dependencies

```sql
-- Files that import each other (potential circulars)
WITH imports AS (
  SELECT DISTINCT
    source_file_path as from_file,
    -- Extract relative path from module specifier
    REPLACE(module_specifier, './', '') as to_pattern
  FROM external_refs
  WHERE module_specifier LIKE './%'
)
SELECT
  a.from_file,
  b.from_file as imports_back
FROM imports a
JOIN imports b ON a.from_file LIKE '%' || b.to_pattern || '%'
               AND b.from_file LIKE '%' || a.to_pattern || '%'
WHERE a.from_file < b.from_file;  -- Avoid duplicates
```

### Example 5: Find Large Functions

```sql
-- Functions with many lines (complexity indicator)
SELECT
  name,
  file_path,
  start_line,
  end_line,
  (end_line - start_line) as line_count
FROM nodes
WHERE kind IN ('function', 'method')
  AND (end_line - start_line) > 50
ORDER BY line_count DESC
LIMIT 20;
```

### Example 6: Import Analysis

```sql
-- Most imported internal modules
SELECT
  module_specifier,
  COUNT(*) as import_count,
  COUNT(DISTINCT source_file_path) as file_count
FROM external_refs
WHERE module_specifier LIKE './%'
   OR module_specifier LIKE '../%'
GROUP BY module_specifier
ORDER BY import_count DESC
LIMIT 10;
```

### Example 7: Type Coverage

```sql
-- Functions with vs without type signatures
SELECT
  CASE WHEN type_signature IS NOT NULL THEN 'Typed' ELSE 'Untyped' END as status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as percentage
FROM nodes
WHERE kind = 'function'
GROUP BY status;
```

### Example 8: Decorator Usage

```sql
-- Most common decorators
SELECT
  UNNEST(decorators) as decorator,
  COUNT(*) as usage_count
FROM nodes
WHERE array_length(decorators) > 0
GROUP BY decorator
ORDER BY usage_count DESC;
```

### Example 9: Component Complexity

```sql
-- React components sorted by contained elements
SELECT
  parent.name as component,
  parent.file_path,
  COUNT(*) as element_count
FROM nodes parent
JOIN edges e ON parent.entity_id = e.source_entity_id
WHERE parent.kind = 'jsx_component'
  AND e.edge_type = 'CONTAINS'
GROUP BY parent.name, parent.file_path
ORDER BY element_count DESC
LIMIT 10;
```

### Example 10: External Dependency Audit

```sql
-- Group external dependencies by scope
SELECT
  CASE
    WHEN module_specifier LIKE '@%' THEN split_part(module_specifier, '/', 1)
    ELSE module_specifier
  END as package_scope,
  COUNT(DISTINCT module_specifier) as packages,
  COUNT(*) as total_imports
FROM external_refs
WHERE is_resolved = false  -- External only
GROUP BY package_scope
ORDER BY total_imports DESC;
```

---

*See also: [Data Model](./data-model.md) for schema details, [Federation](./federation.md) for hub setup*
