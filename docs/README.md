# DevAC Documentation

**DevAC** (Developer Analysis & Codebase) is a federated code analysis system that parses codebases into queryable knowledge graphs using DuckDB + Parquet.

## Documentation Structure

### Vision (Conceptual Foundation)

What we're building and why. Start here to understand the concepts and philosophy.

| Document | Description |
|----------|-------------|
| [Foundation](./vision/foundation.md) | Core concepts: Effect Handler pattern, Seeds, Vision↔View loop |
| [Visual Guide](./vision/foundation-visual.md) | Architecture diagrams and visual explanations |
| [Implementation Guide](./vision/foundation-impl-guide.md) | How to implement foundation concepts |

### Implementation (What's Built)

Technical details of the current implementation.

| Document | Description |
|----------|-------------|
| [Overview](./implementation/overview.md) | High-level system architecture |
| [Roadmap](./implementation/roadmap.md) | Implementation phases and progress |
| [Data Model](./implementation/data-model.md) | Nodes, edges, refs schema |
| [Storage](./implementation/storage.md) | DuckDB + Parquet internals |
| [Parsing](./implementation/parsing.md) | Two-pass analysis flow |
| [Resolution](./implementation/resolution.md) | Semantic resolution details |
| [Federation](./implementation/federation.md) | Multi-repo queries |
| [Context Discovery](./implementation/context-discovery.md) | Workspace context detection |
| [AST](./implementation/ast.md) | AST extraction architecture |

### User Guides

Getting started and reference documentation.

| Document | Description |
|----------|-------------|
| [Quick Start](./quick-start.md) | Get up and running (10 min) |
| [CLI Reference](./cli-reference.md) | All commands |
| [API Reference](./api-reference.md) | Programmatic usage |
| [MCP Server](./mcp-server.md) | AI assistant integration |
| [Worktree Workflow](./devac-worktree.md) | Issue-based git worktrees |

### Archive

[Historical foundation versions](./archive/) - preserved for reference.

---

## What is DevAC?

DevAC is a **file-based, federated code analysis system** that replaces traditional graph databases with a more portable approach:

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

## Version

- **Current Version**: 2.0.0
- **Status**: Production Ready
- **Last Updated**: December 2025

---

*Start with [Vision Foundation](./vision/foundation.md) to understand the concepts, or [Quick Start](./quick-start.md) to dive in.*
