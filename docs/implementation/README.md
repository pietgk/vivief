# Implementation Documentation

> **What we HAVE built** — Technical architecture of the current implementation

This directory contains documentation for the actual DevAC implementation — what's been built and how it works.

## Documents

### Overview
| Document | Purpose |
|----------|---------|
| [overview.md](./overview.md) | High-level system architecture and component diagram |
| [roadmap.md](./roadmap.md) | Implementation phases, progress tracking, and future plans |

### Components
| Document | Purpose |
|----------|---------|
| [data-model.md](./data-model.md) | Node, Edge, and External Ref schemas |
| [storage.md](./storage.md) | DuckDB pool and Parquet file handling |
| [query-guide.md](./query-guide.md) | Comprehensive SQL query patterns and examples |
| [parsing.md](./parsing.md) | Two-pass analysis pipeline |
| [resolution.md](./resolution.md) | Semantic resolution for cross-file references |
| [federation.md](./federation.md) | Central hub and multi-repo queries |
| [context-discovery.md](./context-discovery.md) | Workspace and worktree detection |
| [ast.md](./ast.md) | AST extraction architecture |

## Implementation Status

See [roadmap.md](./roadmap.md) for current status:

| Phase | Status |
|-------|--------|
| Phase 1: Core (Code Seeds, Workspace) | ✅ Complete |
| Phase 2: Validation (tsc, eslint, tests) | ✅ Complete |
| Phase 3: CI/CD Integration | Planned |
| Future: Content, Infra, Observability Seeds | Future |

## Relationship to Vision

These documents describe **what's actually built**. For the conceptual foundation that guides this implementation, see [Vision Documentation](../vision/).

---

*See [Vision Documentation](../vision/) for the conceptual foundation.*
