# DevAC Core Architecture

> **Package:** @pietgk/devac-core
> **Generated:** 2026-01-07
> **Status:** Draft - Awaiting Developer Validation

## Overview

DevAC Core is a **federated code analysis engine** that extracts, stores, and queries code structure using DuckDB and Parquet for fast, local analysis. It replaces Neo4j with file-based columnar storage and supports TypeScript, Python, and C# with incremental updates and cross-repository federation.

### Core Principles ✓

1. **Two-Pass Analysis** - Structural parsing (fast, <50ms/file) → Semantic resolution (accurate, 50-200ms/file)
2. **Effects-Driven** - Code behavior modeled as immutable effects that can be classified and queried
3. **Federated Architecture** - Multi-repo queries via a Central Hub with Single Writer pattern
4. **Compiler-Grade Resolution** - Uses ts-morph, Pyright, and Roslyn for semantic accuracy
5. **Incremental Processing** - File watching with differential updates to minimize reanalysis

---

## C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONTEXT                                         │
│                                                                              │
│   ┌─────────────┐          ┌──────────────────────────┐                     │
│   │  Developer  │          │     DevAC Core           │                     │
│   │   [Person]  │─────────►│     [System]             │                     │
│   │             │ queries  │                          │                     │
│   └─────────────┘          │  Federated code analysis │                     │
│         │                  │  with DuckDB + Parquet   │                     │
│         │                  └───────────┬──────────────┘                     │
│         │                              │                                    │
│         │                    ┌─────────┼─────────┐                          │
│         │                    │         │         │                          │
│         │                    ▼         ▼         ▼                          │
│         │              ┌──────────┐ ┌──────┐ ┌────────┐                     │
│         │              │ Source   │ │ File │ │Central │                     │
│         │              │ Code     │ │System│ │Hub     │                     │
│         │              │[External]│ │[Ext] │ │[Ext]   │                     │
│         │              └──────────┘ └──────┘ └────────┘                     │
│         │               TS/Py/C#    Parquet   DuckDB                        │
│         │                           Seeds     Federation                    │
│         │                                                                   │
│   ┌─────▼─────┐                                                             │
│   │  DevAC    │                                                             │
│   │  CLI/MCP  │─────────► Uses DevAC Core for analysis                      │
│   │ [System]  │                                                             │
│   └───────────┘                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## C4 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DEVAC CORE CONTAINERS                               │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         ANALYSIS LAYER                                    │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │   │
│  │  │    Parsers      │    │    Semantic     │    │   Analyzer      │       │   │
│  │  │  [Container]    │───►│   [Container]   │◄───│  [Container]    │       │   │
│  │  │                 │    │                 │    │                 │       │   │
│  │  │ TS/Py/C# AST    │    │ Cross-file      │    │ Orchestrates    │       │   │
│  │  │ extraction      │    │ resolution      │    │ analysis flow   │       │   │
│  │  │ <50ms/file      │    │ 50-200ms/file   │    │ Entity IDs      │       │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                                      ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         STORAGE LAYER                                     │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │   │
│  │  │   DuckDBPool    │    │  Seed Writer/   │    │  Effect Writer/ │       │   │
│  │  │  [Container]    │◄───│  Reader         │    │  Reader         │       │   │
│  │  │                 │    │  [Container]    │    │  [Container]    │       │   │
│  │  │ Connection pool │    │                 │    │                 │       │   │
│  │  │ Error recovery  │    │ Parquet I/O     │    │ Effects I/O     │       │   │
│  │  │                 │    │ .devac/seed/    │    │ v3.0 foundation │       │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                                      ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         FEDERATION LAYER                                  │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │   │
│  │  │   Central Hub   │    │   Workspace     │    │    Context      │       │   │
│  │  │  [Container]    │◄───│   Manager       │    │   Discovery     │       │   │
│  │  │                 │    │  [Container]    │    │  [Container]    │       │   │
│  │  │ Cross-repo      │    │                 │    │                 │       │   │
│  │  │ queries         │    │ Multi-repo ops  │    │ Sibling repos   │       │   │
│  │  │ Single Writer   │    │ State mgmt      │    │ Issue worktrees │       │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                                      ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         OUTPUT LAYER                                      │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │   │
│  │  │  Rules Engine   │    │     Views       │    │     Docs        │       │   │
│  │  │  [Container]    │───►│  [Container]    │───►│  [Container]    │       │   │
│  │  │                 │    │                 │    │                 │       │   │
│  │  │ Effects →       │    │ C4/LikeC4       │    │ Markdown        │       │   │
│  │  │ Domain Effects  │    │ diagrams        │    │ generation      │       │   │
│  │  │                 │    │                 │    │ with metadata   │       │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         CROSS-CUTTING                                     │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │   │
│  │  │   Validation    │    │    Watcher      │    │     Utils       │       │   │
│  │  │  [Container]    │    │  [Container]    │    │  [Container]    │       │   │
│  │  │                 │    │                 │    │                 │       │   │
│  │  │ Type/Lint/Test  │    │ File watching   │    │ Atomic writes   │       │   │
│  │  │ validation      │    │ Incremental     │    │ Hashing         │       │   │
│  │  │ Symbol impact   │    │ updates         │    │ Logging         │       │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Analysis Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                          SOURCE CODE                                │
│                   TypeScript │ Python │ C#                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PASS 1: STRUCTURAL PARSING                       │
│                         (<50ms per file)                            │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │ TypeScript  │    │   Python    │    │    C#       │             │
│  │   Parser    │    │   Parser    │    │   Parser    │             │
│  │  (Babel)    │    │(tree-sitter)│    │(tree-sitter)│             │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘             │
│         │                  │                  │                     │
│         └──────────────────┼──────────────────┘                     │
│                            ▼                                        │
│              ┌─────────────────────────┐                           │
│              │  StructuralParseResult  │                           │
│              │  • ParsedNode[]         │                           │
│              │  • ParsedEdge[]         │                           │
│              │  • ParsedExternalRef[]  │                           │
│              └─────────────┬───────────┘                           │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   PASS 2: SEMANTIC RESOLUTION                       │
│                      (50-200ms per file, batched)                   │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │ TypeScript  │    │   Python    │    │    C#       │             │
│  │  Resolver   │    │  Resolver   │    │  Resolver   │             │
│  │ (ts-morph)  │    │ (Pyright)   │    │ (Roslyn)    │             │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘             │
│         │                  │                  │                     │
│         └──────────────────┼──────────────────┘                     │
│                            ▼                                        │
│              ┌─────────────────────────┐                           │
│              │   Resolved Graph        │                           │
│              │  • External refs →      │                           │
│              │    entity_ids           │                           │
│              │  • Cross-file links     │                           │
│              └─────────────┬───────────┘                           │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EFFECTS EXTRACTION                             │
│                                                                     │
│              ┌─────────────────────────┐                           │
│              │     Code Effects        │                           │
│              │  • FunctionCall         │                           │
│              │  • Store / Retrieve     │                           │
│              │  • Send / Request       │                           │
│              └─────────────┬───────────┘                           │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PARQUET STORAGE                                 │
│                   .devac/seed/{package}/                            │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │nodes.parquet │ │edges.parquet │ │external_refs │ │effects     │ │
│  │              │ │              │ │.parquet      │ │.parquet    │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       ┌───────────┐  ┌───────────┐  ┌───────────┐
       │  DuckDB   │  │   Rules   │  │   Views   │
       │  Queries  │  │  Engine   │  │  (C4)     │
       └───────────┘  └─────┬─────┘  └─────┬─────┘
                            │              │
                            ▼              ▼
                     ┌───────────┐  ┌───────────┐
                     │  Domain   │  │Architecture│
                     │  Effects  │  │  Diagrams  │
                     └───────────┘  └───────────┘
```

---

## Module Dependency Graph

```
                         index.ts
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
      Types             Analyzer           Parsers
      (base)          (entity IDs)        (TS/Py/C#)
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
                            ▼
                        Semantic
                  (Cross-file resolution)
                            │
                         Storage
                     (DuckDB/Parquet)
                      │         │
                      │         └──────► Workspace
                      │                  (Multi-repo)
                      │
              ┌───────┴────────┐
              │                │
             Hub           Validation
          (Federation)   (Impact analysis)
              │                │
              │           ┌────┴────┐
              │           │         │
             Utils     Context   Watcher
                       (GitOps)
              │
              ├──────► Rules Engine
              │        (Effects → Domain Effects)
              │
              ├──────► Views (C4/LikeC4)
              │        (Architecture diagrams)
              │
              ├──────► Effects Module
              │        (Mapping loading)
              │
              └──────► Docs
                       (Documentation generation)
```

---

## Key Components Detail

### 1. Entity ID System ✓

Entity IDs uniquely identify code symbols across the entire federated system:

**Format:** `{repo}:{packagePath}:{kind}:{scopeHash}`

**Example:** `github.com/pietgk/vivief:packages/devac-core:function:a1b2c3d4`

| Component | Purpose |
|-----------|---------|
| `repo` | Repository identifier (e.g., `github.com/org/repo`) |
| `packagePath` | Relative path to package within repo |
| `kind` | Node type (function, class, method, etc.) |
| `scopeHash` | Hash of qualified name for uniqueness |

### 2. Node Kinds (27 types) ✓

```
function, class, method, property, variable, constant,
interface, type, enum, namespace, module, jsx_component,
hook, decorator, parameter, type_parameter, generic,
export, import, file, directory, package, repository,
workspace, test, fixture, mock
```

### 3. Edge Types (19 types) ✓

```
CONTAINS, CALLS, IMPORTS, EXTENDS, IMPLEMENTS, RETURNS,
PARAMETER_OF, TYPE_OF, DECORATES, OVERRIDES, REFERENCES,
EXPORTS, RE_EXPORTS, INSTANTIATES, USES_TYPE, ACCESSES,
THROWS, AWAITS, YIELDS
```

### 4. Effect Types ✓

**Code Effects:**
- `FunctionCall` - Function/method invocations
- `Store` - Write operations (database, cache, file)
- `Retrieve` - Read operations
- `Send` - Outbound communications (HTTP, events)
- `Request` - Incoming requests
- `Response` - Outgoing responses

**Workflow Effects:**
- `FileChanged` - Source file modifications
- `SeedUpdated` - Analysis seed updates
- `ValidationResult` - Type/lint/test results
- `IssueClaimedEffect` - GitHub issue claims
- `PRMergedEffect` - Pull request merges

---

## Sequence Diagram: Analysis Flow

```
Developer          CLI/MCP        Orchestrator      Parsers         Semantic        Storage
    │                │                │                │                │              │
    │  analyze pkg   │                │                │                │              │
    │───────────────►│                │                │                │              │
    │                │  orchestrate   │                │                │              │
    │                │───────────────►│                │                │              │
    │                │                │                │                │              │
    │                │                │  PASS 1: parse │                │              │
    │                │                │───────────────►│                │              │
    │                │                │                │                │              │
    │                │                │  nodes/edges   │                │              │
    │                │                │◄───────────────│                │              │
    │                │                │                │                │              │
    │                │                │  PASS 2: resolve external refs  │              │
    │                │                │────────────────────────────────►│              │
    │                │                │                │                │              │
    │                │                │  resolved refs │                │              │
    │                │                │◄────────────────────────────────│              │
    │                │                │                │                │              │
    │                │                │  write seeds   │                │              │
    │                │                │─────────────────────────────────────────────►│
    │                │                │                │                │              │
    │                │  result        │                │                │              │
    │                │◄───────────────│                │                │              │
    │  complete      │                │                │                │              │
    │◄───────────────│                │                │                │              │
    │                │                │                │                │              │
```

---

## Storage Architecture

### Seed Files Location
```
.devac/
└── seed/
    └── {packagePath}/
        ├── base/
        │   ├── nodes.parquet
        │   ├── edges.parquet
        │   ├── external_refs.parquet
        │   └── effects.parquet
        └── delta/
            └── {timestamp}/
                └── ... (incremental changes)
```

### Central Hub Location
```
~/.devac/
├── central.duckdb        # Cross-repo federation database
├── mcp.sock              # Unix socket for Single Writer IPC
└── workspace-state.json  # Workspace state cache
```

---

## Hub Single Writer Architecture ✓

The Central Hub uses a **Single Writer Architecture** due to DuckDB's concurrency constraints:

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP SERVER RUNNING                        │
│                                                              │
│  ┌──────────┐      IPC       ┌──────────────────┐           │
│  │   CLI    │──────────────►│   MCP Server      │           │
│  │ Commands │   Unix Socket  │  (Hub Owner)      │           │
│  └──────────┘   ~/.devac/    │                   │           │
│                  mcp.sock    │  ┌────────────┐   │           │
│                              │  │ CentralHub │   │           │
│                              │  │ (exclusive)│   │           │
│                              │  └────────────┘   │           │
│                              └──────────────────┘           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   MCP SERVER NOT RUNNING                     │
│                                                              │
│  ┌──────────┐    Direct     ┌────────────┐                  │
│  │   CLI    │──────────────►│ CentralHub │                  │
│  │ Commands │               │  (direct)  │                  │
│  └──────────┘               └────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

The `HubClient` class handles routing automatically - commands work the same regardless of whether MCP is running.

---

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Parsing** | Babel, tree-sitter, ts-morph |
| **Semantic** | ts-morph (TS), Pyright (Python), Roslyn (C#) |
| **Storage** | DuckDB, Apache Parquet |
| **File Watch** | chokidar |
| **Schema Validation** | Zod |
| **Testing** | Vitest |
| **TypeScript** | 5.7+ with strict mode, ESM |

---

## Actual Code Graph Statistics ✓

*Queried via `devac query` CLI (2026-01-07)*

### Node Distribution
| Kind | Count |
|------|-------|
| method | 276 |
| function | 174 |
| interface | 115 |
| property | 73 |
| module | 53 |
| class | 29 |
| type | 21 |
| **Total** | **741** |

### Edge Distribution
| Edge Type | Count |
|-----------|-------|
| CONTAINS | 668 |
| EXTENDS | 4 |
| **Total** | **672** |

### External References
| Status | Count |
|--------|-------|
| Unresolved | 619 |

⚠️ **Note:** High unresolved count indicates semantic resolution may need improvement or external packages aren't in the hub.

---

## Gaps and Uncertainties

⚠️ **Areas requiring developer validation:**

1. **Semantic Resolution Coverage** - 619 unresolved external refs suggests Python/C# resolvers may be incomplete or external packages aren't registered

2. **Effects Table Not Populated** - The v3.0 effects storage isn't yet created; `devac query "SELECT * FROM effects"` returns "table does not exist"

3. **MCP Hub Location Bug** - MCP tools look in `~/.devac` instead of workspace-level `.devac/central.duckdb`. CLI works correctly. Files with stale references:
   - `packages/devac-mcp/src/index.ts`
   - `packages/devac-cli/src/commands/hub-init.ts`
   - `packages/devac-worktree/src/*.ts`

4. **Cross-Level Navigation** - The package → repo → workspace federation flow for architecture documentation needs verification

5. **Performance Characteristics** - The stated performance targets (<50ms structural, 50-200ms semantic) should be validated against actual measurements

---

## Related Documentation

- **ADR-0023**: Developer-Maintained Effects Documentation
- **ADR-0024**: Hub Single Writer IPC Architecture
- **Issue #115**: Strategic C4 Architecture - Hybrid Hierarchical + Effect-Centric Model
- **Issue #120**: Improve C4 Pipeline via AI-Verified Rules

---

*This document was generated as part of the architecture documentation improvement loop. Its primary purpose is to serve as a human-validated goal for improving effect-domain-rules and architecture.c4 generation.*
