# Data Model

This document describes the core data structures: **nodes**, **edges**, **external references**, and **effects**.

## Overview

DevAC represents code as a graph stored in Parquet files:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CODE GRAPH MODEL                                                           │
│                                                                             │
│     ┌──────────┐                    ┌──────────┐                           │
│     │  File    │ ───CONTAINS────►   │ Function │                           │
│     │  Node    │                    │  Node    │                           │
│     └──────────┘                    └────┬─────┘                           │
│                                          │                                  │
│                                    ┌─────┴─────┐                           │
│                                    │  CALLS    │                           │
│                                    ▼           ▼                           │
│                              ┌──────────┐ ┌──────────┐                     │
│                              │ Function │ │  Class   │                     │
│                              │  Node    │ │  Node    │                     │
│                              └──────────┘ └──────────┘                     │
│                                                                             │
│  Storage:                                                                   │
│  ├── nodes.parquet        ← All code elements                              │
│  ├── edges.parquet        ← Relationships between elements                │
│  ├── external_refs.parquet ← Import/dependency tracking                   │
│  └── effects.parquet      ← Code behaviors and execution patterns         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Node Schema

Nodes represent code elements: functions, classes, methods, variables, etc.

```sql
CREATE TABLE IF NOT EXISTS nodes (
  -- Identity
  entity_id VARCHAR NOT NULL,         -- Global ID: "{repo}:{package}:{kind}:{scope_hash}"
  name VARCHAR NOT NULL,              -- Symbol name
  qualified_name VARCHAR NOT NULL,    -- Fully qualified name: "AuthService.login"
  kind VARCHAR NOT NULL,              -- function, class, method, etc.

  -- Location
  file_path VARCHAR NOT NULL,         -- Path relative to package root
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_column INTEGER NOT NULL,

  -- Export Info
  is_exported BOOLEAN NOT NULL DEFAULT false,
  is_default_export BOOLEAN NOT NULL DEFAULT false,

  -- Modifiers
  visibility VARCHAR NOT NULL DEFAULT 'public',  -- public, private, protected, internal
  is_async BOOLEAN NOT NULL DEFAULT false,
  is_generator BOOLEAN NOT NULL DEFAULT false,
  is_static BOOLEAN NOT NULL DEFAULT false,
  is_abstract BOOLEAN NOT NULL DEFAULT false,

  -- Type Information
  type_signature VARCHAR,             -- Type annotation if present
  documentation VARCHAR,              -- JSDoc/docstring content
  decorators VARCHAR[] NOT NULL DEFAULT [],
  type_parameters VARCHAR[] NOT NULL DEFAULT [],
  properties JSON NOT NULL DEFAULT '{}',

  -- Delta Storage
  source_file_hash VARCHAR NOT NULL,  -- SHA-256 of source file content
  branch VARCHAR NOT NULL DEFAULT 'base',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (entity_id, branch)
)
```

### Node Kinds

DevAC supports 17 node kinds:

| Kind | Description | Example |
|------|-------------|---------|
| `function` | Function declaration | `handleLogin` |
| `class` | Class declaration | `AuthService` |
| `method` | Class method | `AuthService.login` |
| `property` | Class/object property | `AuthService.token` |
| `variable` | Variable declaration | `const config` |
| `constant` | Constant declaration | `const MAX_RETRIES = 3` |
| `interface` | TypeScript interface | `IUser` |
| `type` | Type alias | `type UserId = string` |
| `enum` | Enumeration | `enum Status` |
| `enum_member` | Enum member | `Status.Active` |
| `namespace` | Namespace declaration | `namespace Utils` |
| `module` | Module declaration | `module.exports` |
| `parameter` | Function parameter | `(userId: string)` |
| `decorator` | Decorator | `@Injectable` |
| `jsx_component` | React component | `<UserCard>` |
| `hook` | React hook | `useAuth` |
| `unknown` | Unrecognized pattern | Fallback kind |

## Edge Schema

Edges represent relationships between nodes. Note: edges have no explicit ID or PRIMARY KEY - they are identified by their content (source, target, type, location).

```sql
CREATE TABLE IF NOT EXISTS edges (
  -- Endpoints
  source_entity_id VARCHAR NOT NULL,  -- From node
  target_entity_id VARCHAR NOT NULL,  -- To node
  edge_type VARCHAR NOT NULL,         -- CALLS, CONTAINS, EXTENDS, etc.

  -- Location (where the relationship is expressed in code)
  source_file_path VARCHAR NOT NULL,
  source_line INTEGER NOT NULL,
  source_column INTEGER NOT NULL,

  -- Metadata
  properties JSON NOT NULL DEFAULT '{}',

  -- Delta Storage
  source_file_hash VARCHAR NOT NULL,
  branch VARCHAR NOT NULL DEFAULT 'base',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
```

### Edge Types

DevAC supports 19 edge types:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EDGE TYPE HIERARCHY                                                        │
│                                                                             │
│  STRUCTURAL                                                                 │
│  ├── CONTAINS      Parent contains child (file contains function)          │
│  ├── PARAMETER_OF  Parameter belongs to function                           │
│  └── DECORATES     Decorator applied to symbol                             │
│                                                                             │
│  REFERENCE                                                                  │
│  ├── CALLS         Function calls function                                 │
│  ├── REFERENCES    General reference to symbol                             │
│  ├── ACCESSES      Accesses property/field                                 │
│  ├── INSTANTIATES  Creates instance of class                               │
│  └── OVERRIDES     Method overrides parent method                          │
│                                                                             │
│  TYPE SYSTEM                                                                │
│  ├── EXTENDS       Class/interface extends another                         │
│  ├── IMPLEMENTS    Class implements interface                              │
│  ├── RETURNS       Function returns type                                   │
│  ├── TYPE_OF       Variable has type                                       │
│  └── USES_TYPE     Uses type in signature                                  │
│                                                                             │
│  MODULE                                                                     │
│  ├── IMPORTS       File imports from module                                │
│  ├── EXPORTS       Module exports symbol                                   │
│  └── RE_EXPORTS    Module re-exports symbol                                │
│                                                                             │
│  ASYNC                                                                      │
│  ├── AWAITS        Awaits promise/async call                               │
│  ├── YIELDS        Generator yields value                                  │
│  └── THROWS        Function throws error type                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### CALLS Edge Properties

CALLS edges track function/method call relationships. They include additional properties in the `properties` JSON field:

| Property | Type | Description |
|----------|------|-------------|
| `callee` | string | Name of the called function/method (e.g., `console.log`, `this.helper`) |
| `argumentCount` | number | Number of arguments passed to the call |

**Target Entity ID Format:**

Since CALLS edges are extracted during structural parsing without type resolution, the target uses an `unresolved:` prefix:

| Call Pattern | Target Entity ID |
|--------------|------------------|
| Simple call: `foo()` | `unresolved:foo` |
| Method call: `obj.method()` | `unresolved:obj.method` |
| Chained: `items.filter()` | `unresolved:items.filter` |
| Built-in: `console.log()` | `unresolved:console.log` |
| Super call: `super()` | `unresolved:super` |
| This method: `this.helper()` | `unresolved:this.helper` |

**Example CALLS edges:**

```json
{
  "source_entity_id": "repo:pkg:function:abc123",
  "target_entity_id": "unresolved:validateUser",
  "edge_type": "CALLS",
  "source_file_path": "src/auth.ts",
  "source_line": 15,
  "source_column": 4,
  "properties": {
    "callee": "validateUser",
    "argumentCount": 2
  }
}
```

## External References Schema

External references track imports and dependencies that may cross package boundaries.

```sql
CREATE TABLE IF NOT EXISTS external_refs (
  -- Reference Origin
  source_entity_id VARCHAR NOT NULL,
  source_file_path VARCHAR NOT NULL,
  source_line INTEGER NOT NULL,
  source_column INTEGER NOT NULL,

  -- Reference Target (unresolved)
  module_specifier VARCHAR NOT NULL,  -- "@shared/schema", "react", "./utils"
  imported_symbol VARCHAR NOT NULL,   -- "User", "default", "*"
  local_alias VARCHAR,                -- Rename: "import { User as UserModel }"
  import_style VARCHAR NOT NULL DEFAULT 'named',

  -- Type Information
  is_type_only BOOLEAN NOT NULL DEFAULT false,

  -- Resolution (populated by semantic pass)
  target_entity_id VARCHAR,           -- Resolved target entity
  is_resolved BOOLEAN NOT NULL DEFAULT false,

  -- Re-export Tracking
  is_reexport BOOLEAN NOT NULL DEFAULT false,
  export_alias VARCHAR,

  -- Delta Storage
  source_file_hash VARCHAR NOT NULL,
  branch VARCHAR NOT NULL DEFAULT 'base',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
```

### Import Styles

DevAC supports 6 import styles:

| Style | Example | Description |
|-------|---------|-------------|
| `named` | `import { User } from './types'` | Named import |
| `default` | `import React from 'react'` | Default import |
| `namespace` | `import * as utils from './utils'` | Namespace import |
| `side_effect` | `import './styles.css'` | Side-effect only |
| `dynamic` | `await import('./module')` | Dynamic import |
| `require` | `const fs = require('fs')` | CommonJS require |

## Effects Schema

Effects track code behaviors and execution patterns extracted during parsing. Effects form the foundation for the Rules Engine and C4 diagram generation.

```sql
CREATE TABLE IF NOT EXISTS effects (
  -- Identity
  effect_id VARCHAR NOT NULL,             -- Unique ID: "eff_{timestamp}_{random}"
  effect_type VARCHAR NOT NULL,           -- FunctionCall, Store, Retrieve, Send, etc.
  timestamp VARCHAR NOT NULL,             -- ISO timestamp when effect was extracted

  -- Location
  source_entity_id VARCHAR NOT NULL,      -- Entity that produced this effect
  source_file_path VARCHAR NOT NULL,      -- File path
  source_line INTEGER NOT NULL,           -- Line number
  source_column INTEGER NOT NULL,         -- Column number

  -- Target (if applicable)
  target_entity_id VARCHAR,               -- Entity being called/accessed

  -- FunctionCall properties
  callee_name VARCHAR,                    -- Name of called function/method
  callee_qualified_name VARCHAR,          -- Full qualified name
  is_method_call BOOLEAN,                 -- obj.method() vs function()
  is_async BOOLEAN,                       -- Called with await
  is_constructor BOOLEAN,                 -- new X() call
  argument_count INTEGER,                 -- Number of arguments
  is_external BOOLEAN,                    -- Calls external module
  external_module VARCHAR,                -- Module specifier if external

  -- Store/Retrieve properties
  store_type VARCHAR,                     -- database, cache, file, queue, external
  retrieve_type VARCHAR,                  -- database, cache, file, queue, external
  operation VARCHAR,                      -- insert, select, get, write, etc.
  target_resource VARCHAR,                -- Table name, cache key, file path
  provider VARCHAR,                       -- mysql, dynamodb, redis, s3

  -- Send properties
  send_type VARCHAR,                      -- http, email, sms, push, webhook
  target VARCHAR,                         -- URL or destination
  is_third_party BOOLEAN,                 -- External service call
  service_name VARCHAR,                   -- stripe, twilio, sendgrid

  -- Request/Response properties
  request_type VARCHAR,                   -- http, graphql, grpc, websocket
  response_type VARCHAR,                  -- Same as request_type
  method VARCHAR,                         -- HTTP method
  route_pattern VARCHAR,                  -- /users/:id, /api/v1/orders
  framework VARCHAR,                      -- express, tsoa, fastify, trpc
  status_code INTEGER,                    -- Response status code
  content_type VARCHAR,                   -- Response content type

  -- Control flow properties
  condition_type VARCHAR,                 -- if, switch, ternary, guard
  branch_count INTEGER,                   -- Number of branches
  has_default BOOLEAN,                    -- Has else/default
  loop_type VARCHAR,                      -- for, for_of, while, map, filter

  -- Group properties (C4 organization)
  group_type VARCHAR,                     -- System, Container, Component, File, Class
  group_name VARCHAR,                     -- Name of group
  description VARCHAR,                    -- Purpose/description
  technology VARCHAR,                     -- Tech stack for Container level
  parent_group_id VARCHAR,                -- Parent group for hierarchy

  -- Metadata
  properties JSON NOT NULL DEFAULT '{}',  -- Additional context

  -- Delta Storage
  source_file_hash VARCHAR NOT NULL,
  branch VARCHAR NOT NULL DEFAULT 'base',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (effect_id, branch)
)
```

### Effect Types

DevAC supports two categories of effects:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EFFECT TYPE HIERARCHY                                                      │
│                                                                             │
│  CODE EFFECTS (What code does)                                              │
│  ├── Data Effects                                                           │
│  │   ├── FunctionCall    Function/method invocation                        │
│  │   ├── Store           Data persistence (INSERT, write, publish)         │
│  │   ├── Retrieve        Data fetching (SELECT, get, read)                 │
│  │   ├── Send            External communication (HTTP, email)              │
│  │   ├── Request         Incoming request handler                          │
│  │   └── Response        Outgoing response                                 │
│  │                                                                          │
│  ├── Flow Effects                                                           │
│  │   ├── Condition       Branching logic (if, switch)                      │
│  │   └── Loop            Iteration (for, while, map/filter)                │
│  │                                                                          │
│  └── Group Effects                                                          │
│      └── Group           Organizational boundary (C4 levels)               │
│                                                                             │
│  WORKFLOW EFFECTS (Development process)                                     │
│  ├── FileChanged         Filesystem watch trigger                          │
│  ├── SeedUpdated         Extraction complete                               │
│  ├── ValidationResult    Check complete with diagnostics                   │
│  ├── IssueClaimed        Issue work started                                │
│  ├── PRMerged            Pull request merged                               │
│  └── ChangeRequested     Change request submitted                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### FunctionCall Effect Properties

The most common effect type, extracted for every function and constructor call:

| Property | Type | Description |
|----------|------|-------------|
| `callee_name` | string | Name of the called function/method |
| `is_method_call` | boolean | `obj.method()` vs `function()` |
| `is_async` | boolean | Called with `await` |
| `is_constructor` | boolean | `new X()` constructor call |
| `argument_count` | number | Number of arguments passed |
| `is_external` | boolean | Calls external module |
| `external_module` | string | Module specifier if external |

**Example FunctionCall effects:**

```json
{
  "effect_id": "eff_abc123_xyz789",
  "effect_type": "FunctionCall",
  "source_entity_id": "repo:pkg:function:abc123",
  "callee_name": "validateUser",
  "is_method_call": false,
  "is_async": true,
  "is_constructor": false,
  "argument_count": 2,
  "is_external": false
}
```

### Storage Effects (Store/Retrieve)

Track data persistence operations:

| Store Type | Example Operations |
|------------|-------------------|
| `database` | INSERT, UPDATE, DELETE via SQL |
| `cache` | redis.set(), memcached.set() |
| `file` | fs.writeFile(), s3.putObject() |
| `queue` | sqs.send(), sns.publish() |
| `external` | Third-party API writes |

### Communication Effects (Send/Request/Response)

Track external communication:

| Effect | Description | Example |
|--------|-------------|---------|
| `Send` | Outgoing communication | HTTP POST to stripe.com |
| `Request` | Incoming request handler | Express route handler |
| `Response` | Outgoing response | API response with status |

## Entity ID Format

Entity IDs are globally unique identifiers for code elements:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ENTITY ID FORMAT                                                           │
│                                                                             │
│  {repo}:{package_path}:{kind}:{scope_hash}                                 │
│                                                                             │
│  Where: scope_hash = sha256(filePath + qualifiedName + kind).slice(0,8)    │
│                                                                             │
│  Examples:                                                                  │
│  repo-api:packages/auth:function:a1b2c3d4                                  │
│  repo-web:apps/main:class:e5f6g7h8                                         │
│  repo-mobile:packages/ui:jsx_component:i9j0k1l2                            │
│                                                                             │
│  IMPORTANT: Branch is NOT part of entity_id                                │
│  Same code = same entity_id regardless of branch                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Qualified Name Examples

| Code Pattern | Qualified Name |
|--------------|----------------|
| Top-level function | `handleLogin` |
| Class method | `AuthService.login` |
| Nested function | `processUser.validate` |
| Arrow in variable | `fetchUser` |
| Callback | `users.map.$arg0` |
| Array element | `callbacks.$0` |
| Computed property | `Foo.[key]` |

## Branch and Delta Storage

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BRANCH STORAGE MODEL                                                       │
│                                                                             │
│  .devac/seed/                                                              │
│  ├── base/                     ← Full content for base branch              │
│  │   ├── nodes.parquet         ← ALL nodes for package                     │
│  │   ├── edges.parquet                                                     │
│  │   ├── external_refs.parquet                                             │
│  │   └── effects.parquet       ← Code effects (v3.0)                       │
│  │                                                                          │
│  └── branch/                   ← Delta for current working branch          │
│      ├── nodes.parquet         ← Only changed/new/deleted files            │
│      ├── edges.parquet                                                     │
│      ├── external_refs.parquet                                             │
│      └── effects.parquet
│                                                                             │
│  QUERY PATTERNS                                                             │
│  ─────────────                                                              │
│                                                                             │
│  Base branch only (fast):                                                   │
│  SELECT * FROM read_parquet('base/nodes.parquet')                          │
│                                                                             │
│  Unified view (base + delta):                                              │
│  SELECT * FROM (                                                           │
│    SELECT * FROM read_parquet('branch/nodes.parquet')                      │
│    WHERE is_deleted = false                                                │
│    UNION ALL                                                               │
│    SELECT * FROM read_parquet('base/nodes.parquet') base                   │
│    WHERE NOT EXISTS (                                                      │
│      SELECT 1 FROM read_parquet('branch/nodes.parquet') br                 │
│      WHERE br.entity_id = base.entity_id                                   │
│    )                                                                       │
│  )                                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Query UX

DevAC provides ergonomic query features that eliminate the need for full parquet paths:

### Auto-Created Views

When running `devac query`, views are automatically created for the current package:

```sql
-- Instead of:
SELECT * FROM read_parquet('/full/path/to/.devac/seed/base/nodes.parquet')

-- Simply use:
SELECT * FROM nodes WHERE kind = 'function'
SELECT * FROM edges WHERE edge_type = 'CALLS'
SELECT * FROM external_refs WHERE is_resolved = false
```

### Package Shorthand Syntax

Query specific packages using `@package` syntax:

```sql
-- Query a specific package by name
SELECT * FROM nodes@core WHERE kind = 'class'
SELECT * FROM edges@cli WHERE edge_type = 'IMPORTS'

-- Query all packages at once
SELECT name, kind, file_path FROM nodes@* ORDER BY name
SELECT COUNT(*) FROM edges@* GROUP BY edge_type
```

Package names are derived from:
1. `package.json` name (scoped packages like `@org/pkg` → `pkg`)
2. Directory name if no package.json

### Progressive Disclosure

| Complexity | Syntax | Use Case |
|------------|--------|----------|
| Simple | `FROM nodes` | Current package queries |
| Multi-package | `FROM nodes@core` | Cross-package analysis |
| All packages | `FROM nodes@*` | Workspace-wide queries |
| Full control | `FROM read_parquet('...')` | Advanced/custom paths |

## Querying Documentation

DevAC extracts JSDoc and docstring content into the `documentation` field. This enables powerful documentation analysis.

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
   OR documentation ILIKE '%login%';

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

For more query examples, see [Query Guide](./query-guide.md).

## Example Data

### nodes.parquet

| entity_id | branch | file_path | kind | name | qualified_name | is_exported |
|-----------|--------|-----------|------|------|----------------|-------------|
| repo:pkg:function:abc123 | base | src/auth.ts | function | login | login | true |
| repo:pkg:class:def456 | base | src/auth.ts | class | AuthService | AuthService | true |
| repo:pkg:method:ghi789 | base | src/auth.ts | method | verify | AuthService.verify | false |

### edges.parquet

| source_entity_id | target_entity_id | edge_type | source_file_path | source_line |
|------------------|------------------|-----------|------------------|-------------|
| repo:pkg:function:abc123 | repo:pkg:method:ghi789 | CALLS | src/auth.ts | 15 |
| repo:pkg:class:def456 | repo:pkg:method:ghi789 | CONTAINS | src/auth.ts | 8 |

### external_refs.parquet

| source_entity_id | source_file_path | module_specifier | imported_symbol | import_style | is_resolved |
|------------------|------------------|------------------|-----------------|--------------|-------------|
| repo:pkg:function:abc123 | src/auth.ts | react | useState | named | false |
| repo:pkg:function:abc123 | src/auth.ts | ./utils | hashPassword | named | true |
| repo:pkg:function:abc123 | src/auth.ts | @shared/types | User | named | true |

---

*Next: [Storage](./storage.md) for DuckDB/Parquet details*
