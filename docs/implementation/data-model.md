# Data Model

This document describes the core data structures: **nodes**, **edges**, and **external references**.

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
│  ├── nodes.parquet      ← All code elements                                │
│  ├── edges.parquet      ← Relationships between elements                  │
│  └── external_refs.parquet ← Import/dependency tracking                   │
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
│  │   └── external_refs.parquet                                             │
│  │                                                                          │
│  └── branch/                   ← Delta for current working branch          │
│      ├── nodes.parquet         ← Only changed/new/deleted files            │
│      ├── edges.parquet                                                     │
│      └── external_refs.parquet                                             │
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
