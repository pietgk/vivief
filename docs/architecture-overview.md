# Architecture Overview

DevAC v2 is a **federated, file-based code analysis system**. This document explains the high-level architecture and how components interact.

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             DEVELOPER LAPTOP                                │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                           REPOSITORIES                                │  │
│  │                                                                       │  │
│  │   repo-api/              repo-web/              repo-mobile/          │  │
│  │   ├── packages/          ├── apps/              ├── packages/         │  │
│  │   │   ├── auth/          │   ├── web/           │   ├── app/          │  │
│  │   │   │   └─.devac/      │   │   └─.devac/      │   │   └─.devac/     │  │
│  │   │   │      └─seed/     │   │      └─seed/     │   │      └─seed/    │  │
│  │   │   └── core/          │   └── admin/         │   └── ui/           │  │
│  │   └── .devac/manifest    └── .devac/manifest    └── .devac/manifest   │  │
│  │                                                                       │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                          │
│                                  ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        CENTRAL HUB (Optional)                         │  │
│  │  ~/.devac/central.duckdb  ← Only computed edges, not raw data        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                  │                                          │
│                                  ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                          QUERY ENGINE                                 │  │
│  │  DuckDB ─────► read_parquet('**/nodes.parquet') ─────► Results       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Three-Layer Federation Model

DevAC uses a **three-layer architecture** where each layer has distinct responsibilities:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 3: CENTRAL HUB                                                       │
│  Location: ~/.devac/central.duckdb                                          │
│  Contains: Repo registry, cross-repo edges, cached stats                    │
│  Size: ~1MB                                                                 │
│  Updates: On cross-repo query                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 2: REPOSITORY MANIFEST                                               │
│  Location: repo/.devac/manifest.json                                        │
│  Contains: Package index, configuration                                     │
│  Size: <1KB                                                                 │
│  Updates: On package add/remove                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 1: PACKAGE SEEDS (Ground Truth)                                      │
│  Location: packages/auth/.devac/seed/                                       │
│  Contains: nodes.parquet, edges.parquet, external_refs.parquet             │
│  Size: 1-50MB per package                                                   │
│  Updates: Per-file incremental                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  1. PARSE                     2. STORE                   3. QUERY           │
│                                                                             │
│  ┌──────────┐              ┌──────────────┐           ┌──────────────┐     │
│  │  Source  │              │  Parquet     │           │   DuckDB     │     │
│  │  Files   │  ─────────►  │  Files       │  ─────►   │   Engine     │     │
│  │  .ts/.py │  AST Parse   │  .parquet    │  Direct   │              │     │
│  └──────────┘              └──────────────┘  Query    └──────────────┘     │
│                                                                             │
│  Two-Pass Pipeline:                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  Pass 1: Structural ──► Extract nodes, edges, refs (parallel)      │    │
│  │  Pass 2: Semantic ────► Resolve imports, cross-file refs (batched) │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEVAC V2 COMPONENTS                               │
│                                                                             │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐           │
│  │    CLI          │   │    MCP Server   │   │    Watcher      │           │
│  │  (Commands)     │   │  (AI Assistant) │   │  (File Events)  │           │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘           │
│           │                     │                     │                     │
│           └─────────────────────┼─────────────────────┘                     │
│                                 ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    ANALYSIS ORCHESTRATOR                              │  │
│  │  Coordinates parsing, writing, resolution                            │  │
│  └────────┬───────────────────────────────┬─────────────────────────────┘  │
│           │                               │                                 │
│           ▼                               ▼                                 │
│  ┌─────────────────┐           ┌─────────────────────────────────────┐     │
│  │ LANGUAGE ROUTER │           │          STORAGE LAYER              │     │
│  │                 │           │  ┌─────────────┐  ┌─────────────┐   │     │
│  │ ┌─────────────┐ │           │  │ SeedWriter  │  │ SeedReader  │   │     │
│  │ │ TypeScript  │ │           │  │             │  │             │   │     │
│  │ │ Parser      │ │           │  │ Atomic      │  │ Query       │   │     │
│  │ ├─────────────┤ │           │  │ Writes      │  │ Interface   │   │     │
│  │ │ Python      │ │           │  └──────┬──────┘  └──────┬──────┘   │     │
│  │ │ Parser      │ │           │         │                │          │     │
│  │ ├─────────────┤ │           │         ▼                ▼          │     │
│  │ │ C#          │ │           │  ┌───────────────────────────────┐  │     │
│  │ │ Parser      │ │           │  │        DuckDB Pool            │  │     │
│  │ └─────────────┘ │           │  │  Connection management        │  │     │
│  └─────────────────┘           │  └───────────────────────────────┘  │     │
│                                └─────────────────────────────────────┘     │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         SUPPORTING SERVICES                           │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │  │
│  │  │ Semantic     │  │ Central Hub  │  │ Validation   │                │  │
│  │  │ Resolver     │  │ (Federation) │  │ Coordinator  │                │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Why DuckDB + Parquet?

| Aspect | Neo4j (v1.x) | DuckDB + Parquet (v2.0) |
|--------|--------------|-------------------------|
| Query speed | Graph traversal optimized | Analytics optimized |
| Point lookups | Required NodeIndexCache | Native column indexing |
| Data location | Central database | Per-package files |
| Crash recovery | Transaction log replay | Regenerate from source |
| Federation | Complex sync | Direct file queries |

### Why Per-Package Storage?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  REJECTED: Per-File Parquet (15,000+ files)                                │
│  ─────────────────────────────────────────                                  │
│  seed/nodes/src_auth_ts.parquet                                            │
│  seed/nodes/src_utils_ts.parquet                                           │
│  ... (one file per source file = file count explosion)                     │
│                                                                             │
│  ADOPTED: Per-Package with Delta Storage (6 files max)                      │
│  ──────────────────────────────────────────────────────                     │
│  seed/base/nodes.parquet       ← Full content for main branch              │
│  seed/base/edges.parquet                                                   │
│  seed/base/external_refs.parquet                                           │
│  seed/branch/nodes.parquet     ← Delta for feature branch                  │
│  seed/branch/edges.parquet                                                 │
│  seed/branch/external_refs.parquet                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Atomic Writes?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ATOMIC WRITE PATTERN                                                       │
│                                                                             │
│  Step 1: Write to temp file                                                 │
│  ┌─────────────────┐                                                        │
│  │ nodes.parquet   │  ──► COPY TO 'nodes.parquet.tmp'                      │
│  │ (existing)      │                                                        │
│  └─────────────────┘      ┌─────────────────┐                               │
│                           │ nodes.parquet   │                               │
│                           │ .tmp (new)      │                               │
│                           └─────────────────┘                               │
│                                                                             │
│  Step 2: Atomic rename (POSIX rename(2) is atomic)                          │
│  ┌─────────────────┐                                                        │
│  │ nodes.parquet   │  ◄── rename('nodes.parquet.tmp', 'nodes.parquet')     │
│  │ (new content)   │                                                        │
│  └─────────────────┘                                                        │
│                                                                             │
│  Result: Either old file or new file exists, never corrupt                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Module Responsibility Matrix

| Module | Primary Responsibility | Key Files |
|--------|----------------------|-----------|
| **types/** | TypeScript interfaces | nodes.ts, edges.ts, external-refs.ts |
| **storage/** | DuckDB/Parquet operations | duckdb-pool.ts, seed-writer.ts, seed-reader.ts |
| **analyzer/** | Parse orchestration | analysis-orchestrator.ts, entity-id-generator.ts |
| **parsers/** | Language-specific AST | typescript-parser.ts, python-parser.ts, csharp-parser.ts |
| **resolver/** | Cross-file reference resolution | semantic-resolver.ts |
| **watcher/** | File change detection | file-watcher.ts, rename-detector.ts |
| **hub/** | Multi-repo federation | central-hub.ts, manifest-generator.ts |
| **validation/** | Type checking, linting | validation-coordinator.ts, issue-enricher.ts |
| **cli/** | User commands | analyze.ts, query.ts, watch.ts, hub-*.ts |
| **mcp/** | AI assistant integration | (MCP server tools) |
| **utils/** | Shared utilities | atomic-write.ts, hash.ts, cleanup.ts |

## Performance Characteristics

| Operation | Typical Time | Notes |
|-----------|--------------|-------|
| Hash check (no changes) | 20-50ms | Skip optimization |
| Single file parse (TS) | 50-200ms | Babel-based |
| Single file parse (Python) | 200-500ms | Subprocess |
| Package write | 50-100ms | ZSTD compressed |
| **Total: file change** | **150-500ms** | Watch mode |
| Package query | <100ms | Partition pruning |
| Cross-repo query | 200-600ms | Multiple globs |

---

*Next: [Quick Start Guide](./quick-start.md) for hands-on usage*
