# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Vivief project.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision made along with its context and consequences. ADRs help new team members understand why certain decisions were made and provide a historical record of the project's evolution.

## ADR Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-replace-neo4j-with-duckdb.md) | Replace Neo4j with DuckDB | Accepted | 2025-12 |
| [0002](0002-per-package-partitioning.md) | Per-Package Partitioning | Accepted | 2025-12 |
| [0003](0003-entity-id-scoped-names.md) | Entity ID Scoped Names | Accepted | 2025-12 |
| [0004](0004-atomic-write-pattern.md) | Atomic Write Pattern | Accepted | 2025-12 |
| [0005](0005-two-pass-parsing.md) | Two-Pass Parsing Architecture | Accepted | 2025-12 |
| [0006](0006-python-parser-subprocess.md) | Python Parser via Subprocess | Accepted | 2025-12 |
| [0007](0007-federation-central-hub.md) | Federation with Central Hub | Accepted | 2025-12 |
| [0008](0008-content-hash-incremental.md) | Content Hash for Incremental Analysis | Accepted | 2025-12 |
| [0009](0009-windows-support-deferred.md) | Windows Support Deferred | Accepted | 2025-12 |
| [0010](0010-recursive-cte-depth-limit.md) | Recursive CTE Depth Limit | Accepted | 2025-12 |
| [0011](0011-development-workflow.md) | Development Workflow | Accepted | 2025-12 |
| [0012](0012-claude-assisted-slash-commands.md) | Claude-Assisted Slash Commands | Accepted | 2025-12 |
| [0013](0013-fixture-packages-per-language.md) | Fixture Packages Per Language | Accepted | 2025-12 |
| [0014](0014-worktree-claude-workflow.md) | Git Worktree + Claude CLI Workflow | Accepted | 2025-12 |
| [0015](0015-conceptual-foundation.md) | Conceptual Foundation - Effect Handler Pattern | Accepted | 2025-12 |
| [0016](0016-workspace-module.md) | Workspace Module Architecture | Accepted | 2026-01 |
| [0017](0017-validation-hub-cache.md) | Validation Hub Cache | Accepted | 2026-01 |
| [0018](0018-unified-diagnostics-model.md) | Unified Diagnostics Model | Accepted | 2026-01 |
| [0019](0019-coverage-validator.md) | Coverage Validator Integration | Accepted | 2026-01 |
| [0020](0020-calls-edge-extraction.md) | CALLS Edge Extraction for Function Call Tracking | Accepted | 2026-01 |
| [0021](0021-code-understanding-pipeline-doc.md) | Code Understanding Pipeline Documentation | Accepted | 2026-01 |
| [0022](0022-answer-quality-evaluation.md) | Answer Quality Evaluation Framework | Accepted | 2026-01 |
| [0023](0023-developer-maintained-effects.md) | Developer Maintained Effects | Accepted | 2026-01 |
| [0024](0024-hub-single-writer-ipc.md) | Hub Single Writer Architecture with IPC | Accepted | 2026-01 |
| [0025](0025-unified-start-issue-command.md) | Unified Start-Issue Command | Accepted | 2026-01 |
| [0026](0026-federated-documentation-generation.md) | Federated Documentation Generation | Accepted | 2026-01 |
| [0027](0027-likec4-primary-format.md) | LikeC4 as Primary C4 Documentation Format | Accepted | 2026-01 |
| [0028](0028-c4-enrichment-and-aggregation.md) | C4 Architecture Enrichment and Relationship Aggregation | Accepted | 2026-01 |
| [0029](0029-likec4-directory-restructure.md) | LikeC4 Directory Restructure for Conflict Avoidance | Accepted | 2026-01 |
| [0030](0030-unified-query-system.md) | Unified Query System Architecture | Accepted | 2026-01 |
| [0031](0031-architecture-quality-improvement-loop.md) | Architecture Documentation Quality Improvement Loop | Accepted | 2026-01 |
| [0032](0032-hub-location-validation.md) | Hub Location Validation | Accepted | 2026-01 |
| [0033](0033-calls-edge-resolution.md) | CALLS Edge Resolution for Call Graph Queries | Accepted | 2026-01 |
| [0034](0034-extends-edge-resolution.md) | EXTENDS Edge Resolution for Inheritance Queries | Accepted | 2026-01 |

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
