# DevAC v2 Documentation

**DevAC** (Developer Analysis & Codebase) is a federated code analysis system that parses codebases into queryable knowledge graphs using DuckDB + Parquet.

## Quick Navigation

| Level | Document | Description |
|-------|----------|-------------|
| **Overview** | [Architecture Overview](./architecture-overview.md) | High-level system design (5 min read) |
| **Getting Started** | [Quick Start Guide](./quick-start.md) | Get up and running (10 min) |
| **Deep Dives** | [Data Model](./data-model.md) | Nodes, edges, refs schema |
| | [Storage System](./storage-system.md) | DuckDB + Parquet internals |
| | [Parsing Pipeline](./parsing-pipeline.md) | Two-pass analysis flow |
| | [Federation](./federation.md) | Multi-repo queries |
| **Reference** | [CLI Reference](./cli-reference.md) | All commands |
| | [API Reference](./api-reference.md) | Programmatic usage |
| **History** | [Specification](./spec/) | Original spec + research |

## What is DevAC v2?

DevAC v2 is a complete architectural redesign that replaces Neo4j with a **file-based, federated storage model**:

```
┌─────────────────────────────────────────────────────────────────┐
│  SOURCE CODE                                                    │
│  ├── repo-api/                                                  │
│  │   └── packages/auth/.devac/seed/                            │
│  │       ├── base/nodes.parquet    ← Analyzed code structure   │
│  │       └── branch/nodes.parquet  ← Current branch delta      │
│  ├── repo-web/                                                  │
│  └── repo-mobile/                                               │
│                                                                 │
│  QUERY ENGINE                                                   │
│  └── DuckDB ───► Direct Parquet queries, no import needed     │
└─────────────────────────────────────────────────────────────────┘
```

## Core Principles

1. **Source Code is Truth** - Seeds are derived, always regenerable
2. **No Data Duplication** - Query Parquet files directly
3. **Single Technology Stack** - DuckDB + Parquet everywhere
4. **Package-Local by Default** - Federation is opt-in
5. **LLM-Optimized Output** - Context-rich query results

## Key Features

- **Multi-language**: TypeScript, Python, C# support
- **Incremental Updates**: Sub-second file change handling
- **Cross-Repo Queries**: Federated queries across repositories
- **Symbol-Level Precision**: Track individual function/class usage
- **Affected Detection**: Know exactly what changes impact

## Directory Structure

```
docs/
├── README.md                    ← You are here
├── architecture-overview.md     ← Start here
├── quick-start.md              ← Hands-on tutorial
├── data-model.md               ← Schema details
├── storage-system.md           ← DuckDB/Parquet internals
├── parsing-pipeline.md         ← How analysis works
├── federation.md               ← Multi-repo setup
├── cli-reference.md            ← Command reference
├── api-reference.md            ← Programmatic API
└── spec/                       ← Historical specification
    ├── devac-spec-v2.0.md      ← Full specification
    ├── design-decisions.md     ← Why decisions were made
    └── implementation-log.md   ← Phase-by-phase history
```

## Version

- **Current Version**: 2.0.0
- **Status**: Production Ready
- **Last Updated**: December 2025

---

*See [Architecture Overview](./architecture-overview.md) to understand the system design.*
