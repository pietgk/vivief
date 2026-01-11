# How Effects Are Handled in DevAC

> **Document Version:** 1.0.0
> **Last Updated:** 2025-01-09
> **Confidence Level:** High (based on source code analysis)

This document provides a comprehensive architectural overview of how effects are extracted, stored, processed, and transformed in DevAC. Effects are the foundation for understanding code behavior, generating C4 architecture diagrams, and enabling automated code analysis.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Effect Type Hierarchy](#2-effect-type-hierarchy)
3. [C4 Context Diagram](#3-c4-context-diagram)
4. [C4 Container Diagram](#4-c4-container-diagram)
5. [C4 Component Diagram](#5-c4-component-diagram)
6. [Effect Lifecycle Flow](#6-effect-lifecycle-flow)
7. [Extraction Sequence](#7-extraction-sequence)
8. [Rules Engine Processing](#8-rules-engine-processing)
9. [Storage Architecture](#9-storage-architecture)
10. [Effect Enrichment](#10-effect-enrichment)
11. [MCP Integration](#11-mcp-integration)
12. [Data Sources and Methodology](#12-data-sources-and-methodology)

---

## 1. Executive Summary

**[Confidence: HIGH]**

Effects in DevAC represent **observable behaviors** in code. They are extracted during AST analysis and stored as immutable records in Parquet files. The system supports two major categories:

- **Code Effects**: What code does (FunctionCall, Store, Retrieve, Send, Request, Response)
- **Workflow Effects**: Development activity (FileChanged, SeedUpdated, ValidationResult)

Effects flow through a pipeline:

```
Source Code → AST Parser → Effect Extractor → Effect Writer → Parquet Storage
                                                    ↓
                   C4 Generator ← Effect Enricher ← Rules Engine ← Effect Reader
```

---

## 2. Effect Type Hierarchy

**[Confidence: HIGH - Direct from `/packages/devac-core/src/types/effects.ts`]**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Effect (Union Type)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Code Effects                                  │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │                                                                       │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │  │
│  │  │  FunctionCall   │  │     Store       │  │    Retrieve     │       │  │
│  │  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤       │  │
│  │  │ callee_name     │  │ store_type      │  │ retrieve_type   │       │  │
│  │  │ is_method_call  │  │ operation       │  │ operation       │       │  │
│  │  │ is_async        │  │ target_resource │  │ target_resource │       │  │
│  │  │ is_external     │  │ provider        │  │ provider        │       │  │
│  │  │ external_module │  └─────────────────┘  └─────────────────┘       │  │
│  │  │ argument_count  │                                                  │  │
│  │  └─────────────────┘                                                  │  │
│  │                                                                       │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │  │
│  │  │     Send        │  │    Request      │  │   Response      │       │  │
│  │  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤       │  │
│  │  │ send_type       │  │ request_type    │  │ response_type   │       │  │
│  │  │ method          │  │ method          │  │ status_code     │       │  │
│  │  │ target          │  │ route_pattern   │  │ content_type    │       │  │
│  │  │ is_third_party  │  │ framework       │  └─────────────────┘       │  │
│  │  │ service_name    │  └─────────────────┘                            │  │
│  │  └─────────────────┘                                                  │  │
│  │                                                                       │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │  │
│  │  │   Condition     │  │      Loop       │  │     Group       │       │  │
│  │  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤       │  │
│  │  │ condition_type  │  │ loop_type       │  │ group_type      │       │  │
│  │  │ branch_count    │  │ is_async        │  │ group_name      │       │  │
│  │  │ has_default     │  └─────────────────┘  │ technology      │       │  │
│  │  └─────────────────┘                       │ parent_group_id │       │  │
│  │                                            └─────────────────┘       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       Workflow Effects                                │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │                                                                       │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │  │
│  │  │  FileChanged    │  │  SeedUpdated    │  │ValidationResult │       │  │
│  │  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤       │  │
│  │  │ change_type     │  │ package_path    │  │ check_type      │       │  │
│  │  │ file_path       │  │ node_count      │  │ passed          │       │  │
│  │  │ package_path    │  │ edge_count      │  │ error_count     │       │  │
│  │  └─────────────────┘  │ duration_ms     │  │ warning_count   │       │  │
│  │                       └─────────────────┘  └─────────────────┘       │  │
│  │                                                                       │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │  │
│  │  │  IssueClaimed   │  │   PRMerged      │  │ChangeRequested  │       │  │
│  │  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤       │  │
│  │  │ issue_number    │  │ pr_number       │  │ change_type     │       │  │
│  │  │ claimed_by      │  │ base_branch     │  │ description     │       │  │
│  │  │ worktree_path   │  │ related_issues  │  │ affected_files  │       │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Base Effect Fields (All Effects Share)

**[Confidence: HIGH]**

| Field | Type | Description |
|-------|------|-------------|
| `effect_id` | string | Unique identifier (format: `eff_{timestamp}_{random}`) |
| `timestamp` | ISO datetime | When the effect occurred/was extracted |
| `source_entity_id` | string | Entity ID that produced this effect |
| `source_file_path` | string | File path where effect was extracted |
| `source_line` | number | Line number in source file |
| `source_column` | number | Column number in source file |
| `branch` | string | Git branch name (default: "base") |
| `properties` | JSON | Additional context as key-value pairs |

---

## 3. C4 Context Diagram

**[Confidence: HIGH - Based on architecture analysis]**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          C4 Context Diagram                                 │
│                         DevAC Effects System                                │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌───────────────────────┐
                         │      Developer        │
                         │       [Person]        │
                         └───────────┬───────────┘
                                     │
                    Uses CLI commands│to analyze code
                    and query effects│
                                     ▼
          ┌──────────────────────────────────────────────────────┐
          │                                                      │
          │                   DevAC System                       │
          │              [Software System]                       │
          │                                                      │
          │    Extracts code effects from source code,           │
          │    stores them in Parquet files, processes           │
          │    them through rules engine, and generates          │
          │    C4 architecture diagrams.                         │
          │                                                      │
          └──────────────────────────────────────────────────────┘
                    │                           │
     ┌──────────────┘                           └──────────────┐
     │                                                         │
     ▼                                                         ▼
┌─────────────────────────┐                   ┌─────────────────────────┐
│    Source Codebase      │                   │    AI Assistant         │
│   [External System]     │                   │   [External System]     │
│                         │                   │                         │
│  TypeScript/Python/C#   │                   │  Uses MCP tools to      │
│  source code files      │                   │  query effects and      │
│  analyzed by DevAC      │                   │  understand codebase    │
└─────────────────────────┘                   └─────────────────────────┘
```

### PlantUML Version

```plantuml
@startuml C4_Context
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml

title DevAC Effects System - System Context Diagram

Person(developer, "Developer", "Uses DevAC to analyze and understand code")
Person(ai, "AI Assistant", "Uses MCP to query code structure")

System(devac, "DevAC System", "Code analysis and effects extraction system")

System_Ext(codebase, "Source Codebase", "TypeScript/Python/C# source files")
System_Ext(storage, "File Storage", "Parquet files in .devac/seed/")

Rel(developer, devac, "Uses", "CLI commands")
Rel(ai, devac, "Queries", "MCP protocol")
Rel(devac, codebase, "Analyzes", "AST parsing")
Rel(devac, storage, "Reads/Writes", "DuckDB/Parquet")

@enduml
```

---

## 4. C4 Container Diagram

**[Confidence: HIGH - Based on package structure analysis]**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         C4 Container Diagram                                │
│                          DevAC System Boundary                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              DevAC System                                   │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│                                                                             │
│  ┌─────────────────────┐       ┌─────────────────────┐                     │
│  │    devac-cli        │       │    devac-mcp        │                     │
│  │   [Container]       │       │   [Container]       │                     │
│  │                     │       │                     │                     │
│  │  Command-line       │       │  MCP Server for     │                     │
│  │  interface for      │       │  AI assistant       │                     │
│  │  analyze, query,    │       │  integration        │                     │
│  │  effects commands   │       │                     │                     │
│  └──────────┬──────────┘       └──────────┬──────────┘                     │
│             │                              │                                │
│             │ depends on                   │ depends on                     │
│             │                              │                                │
│             └──────────────┬───────────────┘                                │
│                            │                                                │
│                            ▼                                                │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                      devac-core                              │           │
│  │                     [Container]                              │           │
│  │                                                              │           │
│  │  Core analysis engine containing:                            │           │
│  │  • AST Parsers (TypeScript, Python, C#)                     │           │
│  │  • Effect Extraction Logic                                   │           │
│  │  • Rules Engine for Domain Effects                          │           │
│  │  • DuckDB Storage Layer                                      │           │
│  │  • C4 Diagram Generation                                     │           │
│  │                                                              │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                            │                                                │
│                            │ reads/writes                                   │
│                            ▼                                                │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                    Parquet Storage                           │           │
│  │                      [Database]                              │           │
│  │                                                              │           │
│  │  .devac/seed/base/                                          │           │
│  │  ├── nodes.parquet      (Code entities)                     │           │
│  │  ├── edges.parquet      (Relationships)                     │           │
│  │  ├── external_refs.parquet (External imports)               │           │
│  │  └── effects.parquet    (Code effects)                      │           │
│  │                                                              │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### PlantUML Version

```plantuml
@startuml C4_Container
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

title DevAC System - Container Diagram

System_Boundary(devac, "DevAC System") {
    Container(cli, "devac-cli", "TypeScript/Node.js", "Command-line interface for developers")
    Container(mcp, "devac-mcp", "TypeScript/Node.js", "MCP server for AI assistants")
    Container(core, "devac-core", "TypeScript/Node.js", "Core analysis engine with parsers, rules, and storage")
    ContainerDb(storage, "Parquet Storage", "DuckDB/Parquet", "nodes, edges, external_refs, effects")
}

Rel(cli, core, "Uses")
Rel(mcp, core, "Uses")
Rel(core, storage, "Reads/Writes")

@enduml
```

---

## 5. C4 Component Diagram

**[Confidence: HIGH - Based on source code file structure]**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         C4 Component Diagram                                │
│                       devac-core Container                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            devac-core                                       │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Types Layer                                   │   │
│  │  ┌───────────────────┐  ┌───────────────────┐                       │   │
│  │  │   effects.ts      │  │ enriched-effects.ts│                      │   │
│  │  │   [Component]     │  │    [Component]     │                      │   │
│  │  │                   │  │                    │                      │   │
│  │  │ Zod schemas for   │  │ Types for enriched │                      │   │
│  │  │ all effect types  │  │ domain effects     │                      │   │
│  │  └───────────────────┘  └────────────────────┘                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       Storage Layer                                  │   │
│  │  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────┐  │   │
│  │  │  effect-writer.ts │  │  effect-reader.ts │  │  duckdb-pool.ts │  │   │
│  │  │    [Component]    │  │    [Component]    │  │   [Component]   │  │   │
│  │  │                   │  │                   │  │                 │  │   │
│  │  │ Atomic Parquet    │  │ Query interface   │  │ Connection pool │  │   │
│  │  │ writes with lock  │  │ with filtering    │  │ management      │  │   │
│  │  └───────────────────┘  └───────────────────┘  └─────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Rules Layer                                   │   │
│  │  ┌───────────────────┐  ┌───────────────────┐                       │   │
│  │  │  rule-engine.ts   │  │ builtin-rules.ts  │                       │   │
│  │  │    [Component]    │  │   [Component]     │                       │   │
│  │  │                   │  │                   │                       │   │
│  │  │ Pattern matching  │  │ 31 builtin rules  │                       │   │
│  │  │ engine for        │  │ for common        │                       │   │
│  │  │ transforming      │  │ patterns:         │                       │   │
│  │  │ effects to domain │  │ - Database (8)    │                       │   │
│  │  │ effects           │  │ - Payment (3)     │                       │   │
│  │  │                   │  │ - Auth (5)        │                       │   │
│  │  │                   │  │ - HTTP (2)        │                       │   │
│  │  │                   │  │ - tRPC (3)        │                       │   │
│  │  │                   │  │ - Messaging (4)   │                       │   │
│  │  │                   │  │ - Storage (4)     │                       │   │
│  │  │                   │  │ - Observability(2)│                       │   │
│  │  └───────────────────┘  └───────────────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Views Layer                                   │   │
│  │  ┌───────────────────┐  ┌───────────────────────────────────────┐   │   │
│  │  │ effect-enricher.ts│  │         docs/                          │   │   │
│  │  │    [Component]    │  │  effects-generator.ts [Component]     │   │   │
│  │  │                   │  │  repo-effects-generator.ts             │   │   │
│  │  │ Enriches domain   │  │  workspace-effects-generator.ts        │   │   │
│  │  │ effects with node │  │                                        │   │   │
│  │  │ metadata for C4   │  │ Generate documentation and C4 from    │   │   │
│  │  │ diagram generation│  │ effects                                │   │   │
│  │  └───────────────────┘  └───────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Effect Lifecycle Flow

**[Confidence: HIGH]**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Effect Lifecycle Flow Diagram                          │
└─────────────────────────────────────────────────────────────────────────────┘

         ┌─────────────────┐
         │   Source Code   │
         │   (.ts, .py,    │
         │    .cs files)   │
         └────────┬────────┘
                  │
                  │ [1] Parse with Tree-sitter
                  ▼
         ┌─────────────────┐
         │   AST Nodes     │
         │                 │
         │ (syntax tree    │
         │  representation)│
         └────────┬────────┘
                  │
                  │ [2] Extract effects from AST
                  │     - Identify function calls
                  │     - Detect method invocations
                  │     - Track external imports
                  ▼
         ┌─────────────────┐
         │  CodeEffect[]   │
         │                 │
         │ Raw effects with│
         │ type, location, │
         │ and metadata    │
         └────────┬────────┘
                  │
                  │ [3] Write atomically to Parquet
                  │     - Acquire file lock
                  │     - Write to temp file
                  │     - Atomic rename
                  │     - Fsync for durability
                  ▼
         ┌─────────────────┐
         │ effects.parquet │
         │                 │
         │ Persistent      │
         │ Parquet storage │
         │ in .devac/seed/ │
         └────────┬────────┘
                  │
                  │ [4] Read for processing
                  │     - Filter by type, file, entity
                  │     - Support pagination
                  ▼
         ┌─────────────────┐
         │  EffectReader   │
         │                 │
         │ Query interface │
         │ via DuckDB      │
         └────────┬────────┘
                  │
                  │ [5] Process through Rules Engine
                  │     - Match against 31 builtin rules
                  │     - Priority-based evaluation
                  │     - First match wins
                  ▼
         ┌─────────────────┐
         │ DomainEffect[]  │
         │                 │
         │ High-level      │
         │ semantics like  │
         │ "Database:Read" │
         │ "Payment:Charge"│
         └────────┬────────┘
                  │
                  │ [6] Enrich with node metadata
                  │     - Resolve entity IDs to names
                  │     - Compute relative paths
                  │     - Build lookup maps
                  ▼
         ┌─────────────────┐
         │EnrichedDomain   │
         │Effect[]         │
         │                 │
         │ Human-readable  │
         │ names and paths │
         └────────┬────────┘
                  │
                  │ [7] Generate outputs
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌───────────────┐
│ C4 Diagrams   │   │ Documentation │
│               │   │               │
│ - Context     │   │ package-      │
│ - Container   │   │ effects.md    │
│ - Component   │   │               │
└───────────────┘   └───────────────┘
```

---

## 7. Extraction Sequence

**[Confidence: HIGH - Based on effect-writer.ts analysis]**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Effect Extraction Sequence Diagram                       │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────┐    ┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────┐
  │ CLI     │    │ Analyzer │    │EffectWriter │    │  DuckDBPool  │    │Parquet │
  │         │    │          │    │             │    │              │    │ File   │
  └────┬────┘    └────┬─────┘    └──────┬──────┘    └──────┬───────┘    └───┬────┘
       │              │                 │                  │                │
       │ analyze()    │                 │                  │                │
       │─────────────>│                 │                  │                │
       │              │                 │                  │                │
       │              │ parseFile()     │                  │                │
       │              │ (Tree-sitter)   │                  │                │
       │              │                 │                  │                │
       │              │ extractEffects()│                  │                │
       │              │ from AST nodes  │                  │                │
       │              │                 │                  │                │
       │              │ writeEffects()  │                  │                │
       │              │────────────────>│                  │                │
       │              │                 │                  │                │
       │              │                 │ withSeedLock()   │                │
       │              │                 │──────┐           │                │
       │              │                 │      │ acquire   │                │
       │              │                 │<─────┘ lock      │                │
       │              │                 │                  │                │
       │              │                 │ executeWithRecovery()             │
       │              │                 │─────────────────>│                │
       │              │                 │                  │                │
       │              │                 │                  │ getConnection()│
       │              │                 │                  │───────┐        │
       │              │                 │                  │<──────┘        │
       │              │                 │                  │                │
       │              │                 │ INSERT effects   │                │
       │              │                 │─────────────────>│                │
       │              │                 │                  │                │
       │              │                 │ COPY TO temp.parquet              │
       │              │                 │─────────────────>│                │
       │              │                 │                  │ write          │
       │              │                 │                  │───────────────>│
       │              │                 │                  │                │
       │              │                 │ fs.rename(temp → final)           │
       │              │                 │─────────────────────────────────>│
       │              │                 │                  │                │
       │              │                 │ fs.fsync(dir)    │                │
       │              │                 │─────────────────────────────────>│
       │              │                 │                  │                │
       │              │                 │ release lock     │                │
       │              │                 │──────┐           │                │
       │              │                 │<─────┘           │                │
       │              │                 │                  │                │
       │              │<────────────────│                  │                │
       │              │  WriteResult    │                  │                │
       │              │                 │                  │                │
       │<─────────────│                 │                  │                │
       │ AnalysisResult                 │                  │                │
       │              │                 │                  │                │
```

### Atomic Write Pattern

**[Confidence: HIGH - Directly from effect-writer.ts:60-109]**

The effect writer uses a **temp + rename + fsync** pattern for atomicity:

```typescript
// 1. Write to temp file
const tempPath = `${paths.effectsParquet}.tmp`;
await conn.run(getCopyToParquet("effects", tempPath));

// 2. Atomic rename (atomic on POSIX systems)
await fs.rename(tempPath, paths.effectsParquet);

// 3. Fsync directory for durability
const handle = await fs.open(dir, "r");
await handle.sync();
await handle.close();
```

This ensures:
- **Atomicity**: Either all effects are written or none
- **Durability**: Changes survive system crashes
- **Consistency**: No partial writes visible to readers

---

## 8. Rules Engine Processing

**[Confidence: HIGH - Based on rule-engine.ts and builtin-rules.ts]**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Rules Engine Processing Flow                           │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌────────────────────────────────────┐
                    │        CodeEffect Input            │
                    │                                    │
                    │  effect_type: "FunctionCall"       │
                    │  callee_name: "stripe.charges.create"│
                    │  is_external: true                 │
                    │  is_async: true                    │
                    └────────────────┬───────────────────┘
                                     │
                                     ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │                       Rules Evaluation                                  │
    │   (Rules sorted by priority: higher priority evaluated first)          │
    │                                                                        │
    │   ┌─────────────────────────────────────────────────────────────────┐  │
    │   │  Rule: "payment-stripe-charge" (priority: 20)                   │  │
    │   │  Match: {                                                       │  │
    │   │    effectType: "FunctionCall",                                  │  │
    │   │    callee: /stripe\.(charges|paymentIntents)\.(create|confirm)/i│  │
    │   │  }                                                              │  │
    │   │  Result: ✓ MATCHES                                              │  │
    │   └─────────────────────────────────────────────────────────────────┘  │
    │                              │                                         │
    │                              │ First match wins                        │
    │                              ▼                                         │
    │   ┌─────────────────────────────────────────────────────────────────┐  │
    │   │  Emit Domain Effect:                                            │  │
    │   │  {                                                              │  │
    │   │    domain: "Payment",                                           │  │
    │   │    action: "Charge",                                            │  │
    │   │    metadata: { provider: "stripe" }                             │  │
    │   │  }                                                              │  │
    │   └─────────────────────────────────────────────────────────────────┘  │
    │                                                                        │
    └────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────────┐
                    │       DomainEffect Output          │
                    │                                    │
                    │  sourceEffectId: "eff_..."         │
                    │  domain: "Payment"                 │
                    │  action: "Charge"                  │
                    │  ruleId: "payment-stripe-charge"   │
                    │  metadata: { provider: "stripe" }  │
                    └────────────────────────────────────┘
```

### Builtin Rules Summary

**[Confidence: HIGH - Count verified from builtin-rules.ts]**

| Domain | Rules | Priority | Examples |
|--------|-------|----------|----------|
| **Database** | 8 | 5-10 | DynamoDB, Kysely, SQL, Prisma |
| **Payment** | 3 | 20 | Stripe charges, refunds, subscriptions |
| **Auth** | 5 | 15-20 | JWT sign/verify, bcrypt, Cognito |
| **HTTP** | 2 | 5-10 | fetch, axios |
| **API (tRPC)** | 3 | 15 | mutation, query, procedure |
| **Messaging** | 4 | 15 | SQS, SNS, EventBridge |
| **Storage** | 4 | 5-15 | S3, filesystem |
| **Observability** | 2 | 1-10 | console, Datadog |

**Total: 31 builtin rules**

### Rule Matching Algorithm

**[Confidence: HIGH]**

```
function effectMatchesRule(effect, rule.match):
    1. Check effect_type matches (if specified)
    2. Check callee pattern matches (string or RegExp)
    3. Check target pattern matches
    4. Check isExternal flag matches
    5. Check isAsync flag matches
    6. Run custom predicate (if provided)

    Return: true if ALL checks pass, false otherwise
```

---

## 9. Storage Architecture

**[Confidence: HIGH]**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Storage Architecture                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  Package Root Directory
  │
  └── .devac/
      │
      ├── seed/                          # Seed storage root
      │   │
      │   ├── base/                      # Base branch (default)
      │   │   ├── nodes.parquet          # Code entities
      │   │   ├── edges.parquet          # Relationships (CALLS, IMPORTS, etc.)
      │   │   ├── external_refs.parquet  # External package references
      │   │   └── effects.parquet        # Code effects
      │   │
      │   └── feature-branch/            # Feature branch (delta storage)
      │       └── effects.parquet        # Only changed effects
      │
      ├── manifest.json                  # Package metadata
      │
      └── effect-mappings.ts             # Custom effect mappings (optional)


  Central Hub (~/.devac/)
  │
  ├── central.duckdb                     # Cross-repo federation database
  └── mcp.sock                           # Unix socket for IPC


┌─────────────────────────────────────────────────────────────────────────────┐
│                        Effects Parquet Schema                               │
│                                                                             │
│  Column                  Type         Description                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  effect_id               VARCHAR      Unique identifier                     │
│  effect_type             VARCHAR      FunctionCall|Store|Retrieve|...      │
│  timestamp               TIMESTAMP    When extracted                        │
│  source_entity_id        VARCHAR      Entity that produced effect          │
│  source_file_path        VARCHAR      File location                         │
│  source_line             INTEGER      Line number                           │
│  source_column           INTEGER      Column number                         │
│  branch                  VARCHAR      Git branch name                       │
│  properties              JSON         Additional metadata                   │
│  target_entity_id        VARCHAR      Target (if resolved)                  │
│  callee_name             VARCHAR      Function/method name                  │
│  callee_qualified_name   VARCHAR      Fully qualified name                  │
│  is_method_call          BOOLEAN      obj.method() vs fn()                  │
│  is_async                BOOLEAN      await/async call                      │
│  is_constructor          BOOLEAN      new X() call                          │
│  argument_count          INTEGER      Number of arguments                   │
│  is_external             BOOLEAN      External module call                  │
│  external_module         VARCHAR      Module specifier                      │
│  ... (30+ more columns for other effect types)                             │
│  source_file_hash        VARCHAR      For change detection                  │
│  is_deleted              BOOLEAN      Soft delete flag                      │
│  updated_at              TIMESTAMP    Last modification                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Effect Enrichment

**[Confidence: HIGH - Based on effect-enricher.ts]**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Effect Enrichment Flow                               │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────┐
    │                     DomainEffect Input                                │
    │                                                                      │
    │  sourceEntityId: "myrepo:packages/api:function:abc123def"           │
    │  domain: "Database"                                                  │
    │  action: "Read"                                                      │
    │  filePath: "/Users/grop/ws/myrepo/packages/api/src/user.ts"        │
    └────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │                     Node Lookup Map                                   │
    │                                                                      │
    │  Built from SQL: SELECT entity_id, name, qualified_name, kind       │
    │                  FROM nodes                                          │
    │                                                                      │
    │  Map<entity_id, NodeMetadata>:                                       │
    │  "myrepo:...:function:abc123def" → {                                │
    │    name: "getUserById",                                             │
    │    qualified_name: "src/user.getUserById",                          │
    │    kind: "function"                                                  │
    │  }                                                                   │
    └────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │                     Enrichment Process                                │
    │                                                                      │
    │  1. Lookup node metadata by entity_id                                │
    │  2. If found: use name, qualified_name, kind                         │
    │  3. If not found: extract fallback from entity_id                    │
    │  4. Compute relative file path (strip absolute prefix)               │
    │                                                                      │
    │  Fallback extraction for "repo:pkg:kind:hash":                      │
    │  → "${kind}_${hash.slice(0,6)}" e.g., "function_abc123"             │
    └────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │                   EnrichedDomainEffect Output                        │
    │                                                                      │
    │  ...original domain effect fields...                                 │
    │  sourceName: "getUserById"           ← Human-readable!              │
    │  sourceQualifiedName: "src/user.getUserById"                        │
    │  sourceKind: "function"                                              │
    │  relativeFilePath: "packages/api/src/user.ts" ← Clean path!         │
    └──────────────────────────────────────────────────────────────────────┘
```

### Benefits of Enrichment

**[Confidence: HIGH]**

| Without Enrichment | With Enrichment |
|-------------------|-----------------|
| `myrepo:packages/api:function:abc123def` | `getUserById` |
| `/Users/grop/ws/myrepo/packages/api/src/user.ts` | `packages/api/src/user.ts` |
| Hash-based IDs in C4 diagrams | Human-readable names |
| Hard to understand architecture | Clear component relationships |

---

## 11. MCP Integration

**[Confidence: HIGH]**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MCP Integration Flow                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
  │  AI Assistant │         │   devac-mcp   │         │  devac-core   │
  │  (Claude)     │         │   Server      │         │               │
  └───────┬───────┘         └───────┬───────┘         └───────┬───────┘
          │                         │                         │
          │  query_effects          │                         │
          │  { type: "FunctionCall",│                         │
          │    externalOnly: true } │                         │
          │────────────────────────>│                         │
          │                         │                         │
          │                         │  EffectReader.          │
          │                         │  readEffects(filter)    │
          │                         │────────────────────────>│
          │                         │                         │
          │                         │                         │ Query DuckDB
          │                         │                         │ on effects.parquet
          │                         │                         │
          │                         │<────────────────────────│
          │                         │   CodeEffect[]          │
          │                         │                         │
          │<────────────────────────│                         │
          │  { effects: [...],      │                         │
          │    rowCount: 42 }       │                         │
          │                         │                         │
          │  run_rules              │                         │
          │  { limit: 100 }         │                         │
          │────────────────────────>│                         │
          │                         │                         │
          │                         │  RuleEngine.            │
          │                         │  process(effects)       │
          │                         │────────────────────────>│
          │                         │                         │
          │                         │<────────────────────────│
          │                         │  { domainEffects,       │
          │                         │    ruleStats }          │
          │<────────────────────────│                         │
          │                         │                         │
          │  generate_c4            │                         │
          │  { level: "containers" }│                         │
          │────────────────────────>│                         │
          │                         │                         │
          │                         │  C4Generator.           │
          │                         │  generate(effects)      │
          │                         │────────────────────────>│
          │                         │                         │
          │<────────────────────────│<────────────────────────│
          │  { model, plantuml }    │                         │
          │                         │                         │
```

### Available MCP Tools for Effects

**[Confidence: HIGH]**

| Tool | Description |
|------|-------------|
| `query_effects` | Query effects with filters (type, file, entity, external, async) |
| `run_rules` | Process effects through rules engine to get domain effects |
| `list_rules` | List all available rules (builtin + custom) |
| `generate_c4` | Generate C4 diagrams from effects |
| `query_sql` | Execute raw SQL on effects table |

---

## 12. Data Sources and Methodology

**[Confidence: HIGH]**

This document was created by analyzing the DevAC source code using the DevAC MCP tools and direct file reading. Below is a detailed explanation of each data source and how it contributed to this document.

### 12.1 Primary Data Sources

| Source | Path | Data Extracted | Confidence |
|--------|------|----------------|------------|
| **Effects Type Definitions** | `packages/devac-core/src/types/effects.ts` | All effect types, Zod schemas, base fields, factory functions | **HIGH** - Direct source code |
| **Enriched Effects Types** | `packages/devac-core/src/types/enriched-effects.ts` | EnrichedDomainEffect, NodeMetadata, InternalEdge | **HIGH** - Direct source code |
| **Effect Writer** | `packages/devac-core/src/storage/effect-writer.ts` | Atomic write pattern, file locking, Parquet schema | **HIGH** - Direct source code |
| **Effect Reader** | `packages/devac-core/src/storage/effect-reader.ts` | Query interface, filtering, statistics | **HIGH** - Direct source code |
| **Rule Engine** | `packages/devac-core/src/rules/rule-engine.ts` | Rule structure, matching algorithm, domain effect creation | **HIGH** - Direct source code |
| **Builtin Rules** | `packages/devac-core/src/rules/builtin-rules.ts` | All 31 rules, domains, priorities | **HIGH** - Direct source code |
| **Effect Enricher** | `packages/devac-core/src/views/effect-enricher.ts` | Enrichment process, fallback naming, path computation | **HIGH** - Direct source code |
| **Effects Generator** | `packages/devac-core/src/docs/effects-generator.ts` | Documentation generation | **HIGH** - Direct source code |
| **Effects CLI Command** | `packages/devac-cli/src/commands/effects.ts` | CLI interface, init/verify/sync commands | **HIGH** - Direct source code |

### 12.2 MCP Tool Data

| Tool Used | Query | Data Obtained |
|-----------|-------|---------------|
| `get_schema` | N/A | Full database schema including effects table structure |
| `query_effects` | `limit: 50` | Sample effects showing real-world structure |
| `list_rules` | N/A | All 31 builtin rules with match patterns |
| `run_rules` | `includeStats: true` | Rule matching statistics |
| `generate_c4` | `level: context/containers/domains` | C4 model structure |
| `query_sql` | `SELECT effect_type, COUNT(*) FROM effects GROUP BY effect_type` | Effect type distribution (FunctionCall: 54,158, Send: 68, Request: 8) |

### 12.3 Analysis Methodology

1. **Schema Analysis**: Used `get_schema` to understand the database structure and available columns in the effects table.

2. **Source Code Reading**: Read each source file to understand:
   - Type definitions and schemas
   - Business logic and algorithms
   - Integration patterns

3. **Sample Data**: Used `query_effects` to see real effect data and validate schema understanding.

4. **Rules Verification**: Used `list_rules` and counted rules in `builtin-rules.ts` to verify the total (31 rules).

5. **C4 Generation**: Used `generate_c4` at multiple levels to understand how effects are transformed into architecture diagrams.

### 12.4 Confidence Levels Explained

| Level | Meaning | Verification |
|-------|---------|--------------|
| **HIGH** | Direct from source code | Code was read and analyzed directly |
| **MEDIUM** | Inferred from patterns | Based on consistent patterns across codebase |
| **LOW** | Speculative | Based on naming conventions or documentation |

### 12.5 Verification Commands

To verify the information in this document, run these commands:

```bash
# Verify effect types count
grep -c "effect_type:" packages/devac-core/src/types/effects.ts

# Verify builtin rules count
grep -c "defineRule({" packages/devac-core/src/rules/builtin-rules.ts

# Query actual effects
devac effects list --limit 10

# Get effect statistics
devac effects summary --group-by type

# Generate C4 diagram
devac c4 generate --level containers

# List rules
devac rules list
```

### 12.6 Limitations

1. **Dynamic Behavior**: This analysis is based on static code analysis. Runtime behavior may vary based on configuration.

2. **Version Specificity**: This document reflects the codebase as of 2025-01-09. Future versions may differ.

3. **Custom Rules**: Only builtin rules are documented. User-defined rules via `package-effects.md` are not covered.

4. **External Systems**: Integration with external systems (databases, APIs) is described based on rule patterns, not actual runtime behavior.

---

## Appendix A: Quick Reference

### Effect Type Summary

| Type | Purpose | Key Fields |
|------|---------|------------|
| `FunctionCall` | Code execution | `callee_name`, `is_async`, `is_external` |
| `Store` | Data persistence | `store_type`, `operation`, `target_resource` |
| `Retrieve` | Data fetching | `retrieve_type`, `operation`, `target_resource` |
| `Send` | External communication | `send_type`, `target`, `service_name` |
| `Request` | API endpoint handler | `request_type`, `route_pattern`, `framework` |
| `Response` | API response | `response_type`, `status_code` |
| `Condition` | Branching logic | `condition_type`, `branch_count` |
| `Loop` | Iteration | `loop_type`, `is_async` |
| `Group` | Architectural boundary | `group_type`, `group_name`, `technology` |

### CLI Commands

```bash
devac analyze              # Extract effects from code
devac effects list         # Query effects
devac effects summary      # Get statistics
devac effects init         # Create package-effects.md
devac effects verify       # Validate documentation
devac effects sync         # Generate effect-mappings.ts
devac c4 generate          # Generate C4 diagrams
```

---

*Document generated with DevAC analysis tools. For corrections or updates, please refer to the source code in `packages/devac-core/`.*
