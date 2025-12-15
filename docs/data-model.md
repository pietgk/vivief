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
CREATE TABLE nodes (
  -- Identity
  entity_id VARCHAR NOT NULL,      -- Global ID: "{repo}:{package}:{kind}:{scope_hash}"
  branch VARCHAR NOT NULL,          -- Branch name (e.g., "main", "feature-auth")
  
  -- File information  
  file_path VARCHAR NOT NULL,       -- Path relative to package root
  file_content_hash VARCHAR NOT NULL, -- SHA-256 of source file
  
  -- Delta storage
  is_deleted BOOLEAN DEFAULT FALSE, -- True = deleted in this branch
  
  -- Scope information
  scoped_name VARCHAR,              -- "AuthService.login", "outer.inner"
  
  -- Classification
  kind VARCHAR NOT NULL,            -- Function, Class, Method, Variable, etc.
  name VARCHAR,                     -- Symbol name (nullable for anonymous)
  
  -- Location
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  
  -- Language
  language VARCHAR NOT NULL,        -- typescript, python, csharp
  
  -- Export Info
  is_exported BOOLEAN DEFAULT FALSE,
  export_name VARCHAR,
  export_kind VARCHAR,              -- "default" | "named" | null
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  properties JSON,                  -- Flexible (decorators, etc.)
  
  PRIMARY KEY (entity_id, branch)
);
```

### Node Kinds

| Kind | Description | Example |
|------|-------------|---------|
| `file` | Source file | `src/auth.ts` |
| `function` | Function declaration | `handleLogin` |
| `class` | Class declaration | `AuthService` |
| `method` | Class method | `AuthService.login` |
| `property` | Class property | `AuthService.token` |
| `variable` | Variable declaration | `const config` |
| `interface` | TypeScript interface | `IUser` |
| `type_alias` | Type alias | `type UserId = string` |
| `enum` | Enumeration | `enum Status` |
| `component` | React component | `<UserCard>` |

## Edge Schema

Edges represent relationships between nodes.

```sql
CREATE TABLE edges (
  -- Identity
  id VARCHAR NOT NULL,
  branch VARCHAR NOT NULL,
  
  -- File information
  file_path VARCHAR NOT NULL,       -- Source file (for delta tracking)
  is_deleted BOOLEAN DEFAULT FALSE,
  
  -- Endpoints
  source_entity_id VARCHAR NOT NULL, -- From node
  target_entity_id VARCHAR NOT NULL, -- To node
  
  -- Classification
  edge_type VARCHAR NOT NULL,
  
  -- Resolution
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  
  -- Metadata
  properties JSON,
  
  PRIMARY KEY (id, branch)
);
```

### Edge Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EDGE TYPE HIERARCHY                                                        │
│                                                                             │
│  STRUCTURAL                                                                 │
│  ├── CONTAINS      File contains function/class                            │
│  ├── OWNS          Class owns method/property                              │
│  ├── HAS_PARAMETER Function has parameter                                  │
│  └── HAS_PROPERTY  Object has property                                     │
│                                                                             │
│  REFERENCE                                                                  │
│  ├── CALLS         Function calls function                                 │
│  ├── USES          Code uses variable/constant                             │
│  └── REFERENCES    General reference                                       │
│                                                                             │
│  TYPE SYSTEM                                                                │
│  ├── EXTENDS       Class extends class                                     │
│  ├── IMPLEMENTS    Class implements interface                              │
│  ├── RETURNS_TYPE  Function returns type                                   │
│  └── PARAMETER_TYPE Parameter has type                                     │
│                                                                             │
│  MODULE                                                                     │
│  ├── IMPORTS       File imports from module                                │
│  ├── EXPORTS       File exports symbol                                     │
│  └── RE_EXPORTS    File re-exports symbol                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## External References Schema

External references track imports and dependencies that may cross package boundaries.

```sql
CREATE TABLE external_refs (
  -- Identity
  id VARCHAR NOT NULL,
  branch VARCHAR NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  
  -- Reference Origin
  source_entity_id VARCHAR NOT NULL,
  source_file_path VARCHAR NOT NULL,
  source_line INTEGER,
  
  -- Reference Target (unresolved)
  module_specifier VARCHAR NOT NULL, -- "@shared/schema", "react", "./utils"
  imported_symbol VARCHAR NOT NULL,  -- "User", "default", "*"
  import_kind VARCHAR NOT NULL,      -- "named", "default", "namespace", "side-effect"
  
  -- Resolution (populated by semantic pass)
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_entity_id VARCHAR,
  resolved_file_path VARCHAR,
  resolved_package VARCHAR,
  is_internal BOOLEAN,
  
  -- Re-export tracking
  is_reexport BOOLEAN DEFAULT FALSE,
  export_alias VARCHAR,
  
  -- Classification
  is_type_only BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  properties JSON,
  
  PRIMARY KEY (id, branch)
);
```

### Import Kinds

| Kind | Example | Description |
|------|---------|-------------|
| `named` | `import { User } from './types'` | Named import |
| `default` | `import React from 'react'` | Default import |
| `namespace` | `import * as utils from './utils'` | Namespace import |
| `side-effect` | `import './styles.css'` | Side-effect only |

## Entity ID Format

Entity IDs are globally unique identifiers for code elements:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ENTITY ID FORMAT                                                           │
│                                                                             │
│  {repo}:{package_path}:{kind}:{scope_hash}                                 │
│                                                                             │
│  Where: scope_hash = sha256(filePath + scopedName + kind).slice(0,8)       │
│                                                                             │
│  Examples:                                                                  │
│  repo-api:packages/auth:function:a1b2c3d4                                  │
│  repo-web:apps/main:class:e5f6g7h8                                         │
│  repo-mobile:packages/ui:component:i9j0k1l2                                │
│                                                                             │
│  IMPORTANT: Branch is NOT part of entity_id                                │
│  Same code = same entity_id regardless of branch                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Scoped Name Examples

| Code Pattern | Scoped Name |
|--------------|-------------|
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
│  ├── base/                     ← Full content for base branch (main)       │
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
│      WHERE br.file_path = base.file_path                                   │
│    )                                                                       │
│  )                                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Example Data

### nodes.parquet

| entity_id | branch | file_path | kind | name | scoped_name | is_exported |
|-----------|--------|-----------|------|------|-------------|-------------|
| repo:pkg:function:abc123 | main | src/auth.ts | function | login | login | true |
| repo:pkg:class:def456 | main | src/auth.ts | class | AuthService | AuthService | true |
| repo:pkg:method:ghi789 | main | src/auth.ts | method | verify | AuthService.verify | false |

### edges.parquet

| id | branch | edge_type | source_entity_id | target_entity_id |
|----|--------|-----------|------------------|------------------|
| e1 | main | CONTAINS | repo:pkg:file:x | repo:pkg:function:abc123 |
| e2 | main | CALLS | repo:pkg:function:abc123 | repo:pkg:method:ghi789 |
| e3 | main | OWNS | repo:pkg:class:def456 | repo:pkg:method:ghi789 |

### external_refs.parquet

| id | branch | source_file_path | module_specifier | imported_symbol | is_resolved |
|----|--------|-----------------|------------------|-----------------|-------------|
| r1 | main | src/auth.ts | react | useState | false |
| r2 | main | src/auth.ts | ./utils | hashPassword | true |
| r3 | main | src/auth.ts | @shared/types | User | true |

---

*Next: [Storage System](./storage-system.md) for DuckDB/Parquet details*
