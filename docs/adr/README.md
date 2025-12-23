# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Vivief project.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision made along with its context and consequences. ADRs help new team members understand why certain decisions were made and provide a historical record of the project's evolution.

## ADR Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-replace-neo4j-with-duckdb.md) | Replace Neo4j with DuckDB | Accepted | 2024-12 |
| [0002](0002-per-package-partitioning.md) | Per-Package Partitioning | Accepted | 2024-12 |
| [0003](0003-entity-id-scoped-names.md) | Entity ID Scoped Names | Accepted | 2024-12 |
| [0004](0004-atomic-write-pattern.md) | Atomic Write Pattern | Accepted | 2024-12 |
| [0005](0005-two-pass-parsing.md) | Two-Pass Parsing Architecture | Accepted | 2024-12 |
| [0006](0006-python-parser-subprocess.md) | Python Parser via Subprocess | Accepted | 2024-12 |
| [0007](0007-federation-central-hub.md) | Federation with Central Hub | Accepted | 2024-12 |
| [0008](0008-content-hash-incremental.md) | Content Hash for Incremental Analysis | Accepted | 2024-12 |
| [0009](0009-windows-support-deferred.md) | Windows Support Deferred | Accepted | 2024-12 |
| [0010](0010-recursive-cte-depth-limit.md) | Recursive CTE Depth Limit | Accepted | 2024-12 |
| [0011](0011-development-workflow.md) | Development Workflow | Accepted | 2025-12 |
| [0012](0012-claude-assisted-slash-commands.md) | Claude-Assisted Slash Commands | Accepted | 2025-12 |
| [0013](0013-fixture-packages-per-language.md) | Fixture Packages Per Language | Accepted | 2025-12 |
| [0014](0014-worktree-claude-workflow.md) | Git Worktree + Claude CLI Workflow | Accepted | 2025-12 |
| [0015](0015-conceptual-foundation.md) | Conceptual Foundation - Effect Handler Pattern | Accepted | 2025-12 |
| [0016](0016-workspace-module.md) | Workspace Module Architecture | Accepted | 2025-12 |
| [0017](0017-validation-hub-cache.md) | Validation Hub Cache | Accepted | 2025-12 |
| [0018](0018-unified-feedback-model.md) | Unified Feedback Model | Accepted | 2025-12 |
| [0019](0019-coverage-validator.md) | Coverage Validator Integration | Accepted | 2025-12 |

## Creating a New ADR

1. Copy the template: `cp template.md NNNN-title-with-dashes.md`
2. Fill in all sections
3. Update this README's index
4. Submit with your PR

## ADR Lifecycle

- **Proposed**: Under discussion
- **Accepted**: Decision has been made and implemented
- **Deprecated**: No longer applies but kept for historical reference
- **Superseded**: Replaced by another ADR (link to replacement)
