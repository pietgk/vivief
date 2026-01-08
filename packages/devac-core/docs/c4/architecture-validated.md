# DevAC Core Architecture

> **Package:** @pietgk/devac-core
> **Validated:** 2026-01-08
> **Status:** Human-Validated Architecture Documentation

## Overview

DevAC Core is a **federated code analysis engine** that extracts, stores, and queries code structure using DuckDB and Parquet for fast, local analysis. It replaces Neo4j with file-based columnar storage and supports TypeScript, Python, and C# with incremental updates and cross-repository federation.

### Core Principles

1. **Two-Pass Analysis** - Structural parsing (fast, <50ms/file) followed by semantic resolution (accurate, 50-200ms/file)
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
│   │   [Person]  │─────────>│     [System]             │                     │
│   │             │ queries  │                          │                     │
│   └─────────────┘          │  Federated code analysis │                     │
│         │                  │  with DuckDB + Parquet   │                     │
│         │                  └───────────┬──────────────┘                     │
│         │                              │                                    │
│         │                    ┌─────────┼─────────┐                          │
│         │                    │         │         │                          │
│         │                    v         v         v                          │
│         │              ┌──────────┐ ┌──────┐ ┌────────┐                     │
│         │              │ Source   │ │ File │ │Central │                     │
│         │              │ Code     │ │System│ │Hub     │                     │
│         │              │[External]│ │[Ext] │ │[Ext]   │                     │
│         │              └──────────┘ └──────┘ └────────┘                     │
│         │               TS/Py/C#    Parquet   DuckDB                        │
│         │                           Seeds     Federation                    │
│         │                                                                   │
│   ┌─────v─────┐                                                             │
│   │  DevAC    │                                                             │
│   │  CLI/MCP  │─────────> Uses DevAC Core for analysis                      │
│   │ [System]  │                                                             │
│   └───────────┘                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Context Elements

| Element | Type | Description |
|---------|------|-------------|
| Developer | Person | Uses DevAC for code analysis and architecture visualization |
| DevAC Core | System | Core analysis engine (this package) |
| DevAC CLI/MCP | System | Command-line and MCP interfaces that consume DevAC Core |
| Source Code | External | TypeScript, Python, C# source files to analyze |
| File System | External | Parquet seed storage in `.devac/seed/` |
| Central Hub | External | DuckDB federation database at `~/.devac/central.duckdb` |

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
│  │  │  [Container]    │───>│   [Container]   │<───│  [Container]    │       │   │
│  │  │                 │    │                 │    │                 │       │   │
│  │  │ TS/Py/C# AST    │    │ Cross-file      │    │ Orchestrates    │       │   │
│  │  │ extraction      │    │ resolution      │    │ analysis flow   │       │   │
│  │  │ (Babel, TS)     │    │ (ts-morph,      │    │ Entity IDs      │       │   │
│  │  │                 │    │  Pyright)       │    │ Language route  │       │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                                      v                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         STORAGE LAYER                                     │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │   │
│  │  │   DuckDBPool    │    │  Seed Writer/   │    │  Effect Writer/ │       │   │
│  │  │  [Container]    │<───│  Reader         │    │  Reader         │       │   │
│  │  │                 │    │  [Container]    │    │  [Container]    │       │   │
│  │  │ Connection pool │    │                 │    │                 │       │   │
│  │  │ Error recovery  │    │ Parquet I/O     │    │ Effects I/O     │       │   │
│  │  │ In-memory DB    │    │ .devac/seed/    │    │ v3.0 foundation │       │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                                      v                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         FEDERATION LAYER                                  │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │   │
│  │  │   Central Hub   │    │   Workspace     │    │    Context      │       │   │
│  │  │  [Container]    │<───│   Manager       │    │   Discovery     │       │   │
│  │  │                 │    │  [Container]    │    │  [Container]    │       │   │
│  │  │ Cross-repo      │    │                 │    │                 │       │   │
│  │  │ queries         │    │ Multi-repo ops  │    │ Sibling repos   │       │   │
│  │  │ Single Writer   │    │ State mgmt      │    │ Issue worktrees │       │   │
│  │  │ IPC protocol    │    │ Seed detection  │    │ CI/GitHub sync  │       │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                                      v                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         OUTPUT LAYER                                      │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │   │
│  │  │  Rules Engine   │    │     Views       │    │     Docs        │       │   │
│  │  │  [Container]    │───>│  [Container]    │───>│  [Container]    │       │   │
│  │  │                 │    │                 │    │                 │       │   │
│  │  │ Effects ->      │    │ C4/LikeC4       │    │ Markdown        │       │   │
│  │  │ Domain Effects  │    │ diagrams        │    │ generation      │       │   │
│  │  │ Pattern match   │    │ Gap metrics     │    │ with metadata   │       │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         CROSS-CUTTING CONCERNS                            │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │   │
│  │  │   Validation    │    │    Watcher      │    │     Utils       │       │   │
│  │  │  [Container]    │    │  [Container]    │    │  [Container]    │       │   │
│  │  │                 │    │                 │    │                 │       │   │
│  │  │ Type/Lint/Test  │    │ File watching   │    │ Atomic writes   │       │   │
│  │  │ validation      │    │ Rename detect   │    │ Hashing         │       │   │
│  │  │ Symbol impact   │    │ Incremental     │    │ Logging         │       │   │
│  │  │ Hub integration │    │ updates         │    │ File ops        │       │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘       │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐                              │   │
│  │  │   Types         │    │   Effects       │                              │   │
│  │  │  [Container]    │    │  [Container]    │                              │   │
│  │  │                 │    │                 │                              │   │
│  │  │ Node/Edge/Ref   │    │ Effect mapping  │                              │   │
│  │  │ Effect types    │    │ Hierarchical    │                              │   │
│  │  │ Config types    │    │ resolution      │                              │   │
│  │  └─────────────────┘    └─────────────────┘                              │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Container Details

### Analysis Layer

| Container | Purpose | Key Components | Dependencies |
|-----------|---------|----------------|--------------|
| **Parsers** | AST extraction from source files | TypeScriptParser, PythonParser, CSharpParser, ScopedNameGenerator | Babel, tree-sitter |
| **Semantic** | Cross-file symbol resolution | TypeScriptSemanticResolver, PythonSemanticResolver, CSharpSemanticResolver | ts-morph, Pyright, Roslyn |
| **Analyzer** | Orchestrates analysis flow | AnalysisOrchestrator, EntityIdGenerator, LanguageRouter | Parsers, Semantic |

### Storage Layer

| Container | Purpose | Key Components | External I/O |
|-----------|---------|----------------|--------------|
| **DuckDBPool** | Connection pooling and recovery | DuckDBPool, executeWithRecovery | In-memory DuckDB |
| **Seed I/O** | Parquet file operations | SeedWriter, SeedReader, queryMultiplePackages | `.devac/seed/*.parquet` |
| **Effect I/O** | Effect storage (v3.0) | EffectWriter, EffectReader | `.devac/seed/effects.parquet` |

### Federation Layer

| Container | Purpose | Key Components | External I/O |
|-----------|---------|----------------|--------------|
| **Hub** | Cross-repo federation | CentralHub, HubStorage, HubServer, HubClient, ManifestGenerator | `~/.devac/central.duckdb` |
| **Workspace** | Multi-repo management | WorkspaceManager, SeedDetector, AutoRefresher, StateManager | File system |
| **Context** | Repository discovery | CrossRepoDetector, CIStatus, Issues, Reviews, Discovery | GitHub API |

### Output Layer

| Container | Purpose | Key Components |
|-----------|---------|----------------|
| **Rules** | Effect pattern matching | RuleEngine, builtinRules (database, payment, auth, http, messaging) |
| **Views** | Architecture visualization | C4Generator, LikeC4SpecGenerator, LikeC4DynamicGenerator, GapMetrics |
| **Docs** | Documentation generation | EffectsGenerator, C4DocGenerator, RepoEffectsGenerator, WorkspaceEffectsGenerator |

### Cross-Cutting Concerns

| Container | Purpose | Key Components |
|-----------|---------|----------------|
| **Validation** | Code quality validation | ValidationCoordinator, TypecheckValidator, LintValidator, TestValidator, CoverageValidator |
| **Watcher** | Incremental updates | FileWatcher, RenameDetector, UpdateManager |
| **Utils** | Shared utilities | atomicWrite, hash, logger, cleanup, git |
| **Types** | Core type definitions | ParsedNode, ParsedEdge, ParsedExternalRef, Effect types |
| **Effects** | Effect mapping | MappingLoader (hierarchical resolution) |

---

## Data Flow: Analysis Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                          SOURCE CODE                                │
│                   TypeScript │ Python │ C#                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               v
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
│                            v                                        │
│              ┌─────────────────────────┐                           │
│              │  StructuralParseResult  │                           │
│              │  - ParsedNode[]         │                           │
│              │  - ParsedEdge[]         │                           │
│              │  - ParsedExternalRef[]  │                           │
│              └─────────────┬───────────┘                           │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             v
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
│                            v                                        │
│              ┌─────────────────────────┐                           │
│              │   Resolved Graph        │                           │
│              │  - External refs ->     │                           │
│              │    entity_ids           │                           │
│              │  - Cross-file links     │                           │
│              └─────────────┬───────────┘                           │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             v
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
              v              v              v
       ┌───────────┐  ┌───────────┐  ┌───────────┐
       │  DuckDB   │  │   Rules   │  │   Views   │
       │  Queries  │  │  Engine   │  │  (C4)     │
       └───────────┘  └─────┬─────┘  └─────┬─────┘
                            │              │
                            v              v
                     ┌───────────┐  ┌───────────┐
                     │  Domain   │  │Architecture│
                     │  Effects  │  │  Diagrams  │
                     └───────────┘  └───────────┘
```

---

## Hub Single Writer Architecture

The Central Hub uses a **Single Writer Architecture** due to DuckDB's concurrency constraints:

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP SERVER RUNNING                            │
│                                                                  │
│  ┌──────────┐      IPC       ┌──────────────────┐               │
│  │   CLI    │───────────────>│   MCP Server      │               │
│  │ Commands │   Unix Socket  │  (Hub Owner)      │               │
│  └──────────┘   ~/.devac/    │                   │               │
│                  mcp.sock    │  ┌────────────┐   │               │
│                              │  │ CentralHub │   │               │
│                              │  │ (exclusive)│   │               │
│                              │  └────────────┘   │               │
│                              └──────────────────┘               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   MCP SERVER NOT RUNNING                         │
│                                                                  │
│  ┌──────────┐    Direct     ┌────────────┐                      │
│  │   CLI    │──────────────>│ CentralHub │                      │
│  │ Commands │               │  (direct)  │                      │
│  └──────────┘               └────────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

The `HubClient` class handles routing automatically - commands work the same regardless of whether MCP is running.

---

## Entity ID System

Entity IDs uniquely identify code symbols across the entire federated system:

**Format:** `{repo}:{packagePath}:{kind}:{scopeHash}`

**Example:** `vivief:packages/devac-core:function:a1b2c3d4`

| Component | Purpose |
|-----------|---------|
| `repo` | Repository identifier (e.g., `vivief`) |
| `packagePath` | Relative path to package within repo |
| `kind` | Node type (function, class, method, etc.) |
| `scopeHash` | 8-char hash of qualified name for uniqueness |

---

## Code Graph Statistics

*Queried via `devac query` (2026-01-08)*

### Node Distribution

| Kind | Count |
|------|-------|
| function | 1,038 |
| method | 757 |
| interface | 625 |
| type | 274 |
| module | 263 |
| property | 241 |
| class | 139 |
| enum_member | 12 |
| enum | 4 |
| parameter | 3 |
| variable | 2 |
| namespace | 1 |
| **Total** | **3,359** |

### Edge Distribution

| Edge Type | Count |
|-----------|-------|
| CALLS | 12,167 |
| CONTAINS | 3,072 |
| EXTENDS | 30 |
| PARAMETER_OF | 3 |
| IMPLEMENTS | 1 |
| **Total** | **15,273** |

### External References

| Metric | Count |
|--------|-------|
| Total external refs | 2,898 |

### Top External Dependencies

| Module | Imports |
|--------|---------|
| @pietgk/devac-core (self) | 329 |
| node:path | 113 |
| node:fs/promises | 81 |

---

## Storage Locations

### Per-Package Seeds
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

### Central Hub
```
~/.devac/
├── central.duckdb        # Cross-repo federation database
├── mcp.sock              # Unix socket for Single Writer IPC
└── workspace-state.json  # Workspace state cache
```

---

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Parsing** | Babel, tree-sitter |
| **Semantic** | ts-morph (TS), Pyright (Python), Roslyn (C#) |
| **Storage** | DuckDB, Apache Parquet |
| **File Watch** | chokidar |
| **Schema Validation** | Zod |
| **Testing** | Vitest |
| **TypeScript** | 5.7+ with strict mode, ESM |

---

## Related Documentation

- **ADR-0024**: Hub Single Writer IPC Architecture
- **README.md**: Project overview and CLI usage
- **README-CodeGraph.md**: Legacy tree-sitter patterns from v1

---

*This is human-validated architecture documentation. It serves as the ground truth for C4 diagram generation and gap analysis.*
