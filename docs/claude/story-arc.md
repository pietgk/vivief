---
topic: story-arc
status: canonical
depends-on: [vivief-identity]
human-version: ../story/arc.md
last-verified: 2026-03-30
---

## The Vivief Story Arc

Eight turning points from code analysis tool to platform vision.

### 1. DevAC — Developer Analytics Centre (Dec 2024)

Starting point: analyze existing code across repositories using DuckDB + Parquet.
Code graph model: nodes (functions, classes, components), edges (calls, imports,
extends), external refs. Multi-language support: TypeScript, Python, C#. Package seeds
stored as Parquet files per package. Central hub for cross-repo queries.

### 2. Validation Pipeline (Jan 2025)

Added deterministic validation: TypeScript type checking, ESLint/Biome linting, test
failures, coverage gaps. Unified diagnostics model — all validators push to the same
queryable surface. Validation becomes a pillar alongside extraction.

### 3. Workflow and Accessibility (Jan-Feb 2025)

Issue-driven workflow with git worktrees (`devac-worktree`). Accessibility scanning:
Storybook + Axe integration, WCAG static analysis. Browser automation package
(Playwright wrapper). The "complete development workflow" thread emerges — DevAC is
not just analysis, it orchestrates.

### 4. Counseling Insight (Mar 2025)

Building an example app led to a counseling app, which led to the realization:
concepts like datoms, effects, and surfaces are universal, not developer-specific.
The counseling domain proves the concepts work for therapy sessions, client profiles,
and clinical workflows. "Domains" emerge as a composition pattern.

### 5. Platform Vision — vivief-concepts v1-v6 (Mar 2025)

Six interview rounds crystallize five concepts: Datom, Projection, Surface, Contract,
effectHandler. Each round resolves open questions: v4 establishes concepts, v5
resolves brainstorm gaps, v6 locks Intent as effect, enforcement duality (Contract
declares, effectHandler enforces), and skills as patterns. The name **vivief** —
Vision View Effect — arrives.

### 6. Datom Pivot (Mar 2026)

Key realization: "Nodes, edges, and effects are ALL datoms." The existing code graph
model (separate node/edge/external-ref tables) is the intermediate state; the full
datom model `[E, A, V, Tx, Op]` is the target architecture. DatomStore implemented
with Map-based indexes, intern pools for memory efficiency. Benchmark suite validates
performance for million-datom scale.

### 7. P2P Substrate (Mar 2026)

Architecture for peer-to-peer: MoQ for unified pub/sub over QUIC via Iroh, Loro
for CRDT-based collaboration. Progressive topology: single-user local-first, then
relay-assisted sync, then full P2P mesh. Encryption via Projection (encrypt datom
values, decrypt per-Projection trust scope).

### 8. Current State (Mar 2026)

Implementing datom store while designing the broader platform. Security model
(containers, VPN, trust boundaries) is an open brainstorm. The chicken-and-egg is
fully embraced: designing vivief IS using vivief's creation loop. DevAC remains the
bootstrap domain — making the platform's own development queryable and deterministic.

### The Through-Line

Each turning point follows the same pattern: build something concrete, discover it
generalizes, extract the concept, apply it back. DevAC was code analysis that became
a development platform. The counseling domain proved the concepts were universal.
The datom model unified all data. The creation loop unified all activities.

```
Code analysis -> Validation -> Workflow -> Counseling insight
     -> Platform vision -> Datom unification -> P2P -> Self-creation
```
