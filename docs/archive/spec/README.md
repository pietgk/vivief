# DevAC v2 Specification & History

This directory contains the complete specification and historical documents for DevAC v2.

## Documents

| Document | Description |
|----------|-------------|
| [../adr/](../adr/) | Architecture Decision Records with rationale |
| [implementation-log.md](./implementation-log.md) | Phase-by-phase implementation history |

> **Note:** The full specification (devac-spec-v2.0.md, ~196KB) is available in the CodeGraph repository at `CodeGraph/src/devac-v2/docs/spec/devac-spec-v2.0.md`. This condensed documentation covers the essential concepts.

## Why DevAC v2?

### The Problem with v1.x

DevAC v1.x used Neo4j as its database. During v1.11 development, we discovered a fundamental issue:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  V1.X ARCHITECTURE PROBLEM                                                  │
│                                                                             │
│  Neo4j is optimized for:     We need fast:                                 │
│  • Graph traversal           • Point lookups (symbol by ID)               │
│  • Relationship queries      • Batch inserts                              │
│                                                                             │
│  Result: NodeIndexCache was introduced - an in-memory cache duplicating    │
│  ALL nodes from Neo4j. This is a symptom of wrong database choice.         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The v2.0 Solution

Instead of adding a second database (v1.11-db-redesign proposal), we chose a more radical simplification:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  V2.0 ARCHITECTURE                                                          │
│                                                                             │
│  1. Source code is truth - Everything else is derived                      │
│  2. No data duplication - Query Parquet files directly                     │
│  3. Single technology - DuckDB + Parquet everywhere                        │
│  4. Files ARE the database - No sync step, no import                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Specification Overview

The v2.0 specification covers:

1. **Design Principles** - Core architectural principles
2. **Architecture Overview** - High-level system design
3. **Three-Layer Federation** - Package → Repository → Hub model
4. **Data Model** - Nodes, edges, external refs schema
5. **Storage Strategy** - DuckDB + Parquet configuration
6. **Parsing Pipeline** - Two-pass analysis architecture
7. **Query Patterns** - SQL examples for common queries
8. **Incremental Updates** - Content-hash based change detection
9. **Multi-Language Support** - TypeScript, Python, C# parsers
10. **Validation Integration** - Symbol-level affected detection
11. **CLI Interface** - Command reference
12. **Performance Considerations** - Targets and optimizations
13. **Migration Path** - From v1.x to v2.0
14. **Implementation Phases** - 6-phase implementation plan

## Review Process

The specification was reviewed by three AI reviewers:

| Reviewer | Verdict |
|----------|---------|
| Claude (Anthropic) | ✅ Approved with conditions |
| GPT (OpenAI) | ✅ Approved with conditions |
| Gemini (Google) | ✅ Approved with conditions |

**Consensus:**
- Core architecture is sound
- DuckDB + Parquet is the right choice
- Error handling and concurrency needed work (addressed)
- Performance targets needed revision (addressed)

See `design-decisions.md` for consolidated feedback and decisions.

## Related Research

These documents (in `docs/development/`) contain detailed analysis:

| Document | Topic |
|----------|-------|
| `devac-spec-v2.0-branch-partitioning-research.md` | Per-package vs per-file partitioning analysis |
| `devac-spec-v2.0-entity-id-lifecycle-analysis.md` | Entity ID stability across all scenarios |
| `devac-spec-v2.0-storage-design-decisions.md` | DuckDB/Parquet configuration rationale |
| `devac-spec-v2.0-review-recap.md` | Consolidated review feedback |
| `devac-spec-v2.0-final-review-claude.md` | Final review before implementation |

## Timeline

| Date | Milestone |
|------|-----------|
| Dec 2024 | Specification v2.0 drafted |
| Dec 2024 | Architecture reviews completed |
| Dec 2024 | Phase 1-6 implemented |
| Dec 2024 | Documentation completed |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Dec 2024 | Initial federated architecture spec |
| 2.1 | Dec 2024 | Entity ID revision (scoped names, no branch in ID) |
| 2.1 | Dec 2024 | Per-package-per-branch storage (not per-file) |
| 2.1 | Dec 2024 | Content-hash based incremental updates |
