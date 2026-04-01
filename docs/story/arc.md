# Vivief — The Path from Start to Now

> How a developer analytics tool became a platform vision for human-AI-system creation.

---

## Timeline

### Phase 1: DevAC — Understand Existing Code (Dec 2024)

**Starting point**: Developer Analytics Centre. The problem: understand what code does across multiple repositories using all available information — code, CMS, infra, company documents, administration.

**Key decisions**: DuckDB + Parquet for fast local code graph storage. No server dependency. Per-package partitioning. Two-pass parsing (structural → semantic). Entity IDs: `{repo}:{package}:{kind}:{hash}`. Multi-language from day one (TypeScript, Python, C#).

**Produced**: Nodes (code entities), Edges (relationships), External Refs (imports). Seeds as queryable Parquet extractions. Central hub for cross-repo federation.

### Phase 2: Validation Pipeline (Jan 2025)

**Turning point**: Analysis alone isn't enough — support building new code by catching problems early.

**Added**: Unified diagnostics model (Watch → Validate → Cache → Query). TypeScript type checking, ESLint/Biome linting, test runner, coverage gaps, LLM-based validation. All validation results flow through the same pipeline as code analysis.

**Key insight**: Validators are just another kind of effect handler — they observe code and produce diagnostics.

### Phase 3: Workflow, Accessibility, Browser Automation (Jan-Feb 2025)

**Turning point**: Handle the complete development workflow, not just analysis.

**Added**: Issue-driven development with git worktrees (`devac-worktree`). PR flow automation. WCAG static accessibility analysis. Axe runtime accessibility scanning via browser automation (Playwright). Storybook scanning for component-level a11y. MCP server (21 tools) for AI assistant integration. Claude Code slash commands.

**Key insight**: The validation pipeline, issue workflow, and accessibility scanning are all the same pattern — observe, diagnose, report.

### Phase 4: Counseling App Insight (Mar 2025)

**Turning point**: An example app → a counseling app → the realization that these concepts are universal.

DevAC's concepts (effects, surfaces for visualization, contracts for validation) applied naturally to a counseling practice management app. A counselor's session is creation. A code review is creation. A morning brief is creation. The same machinery — datoms, projections, surfaces — serves all of them.

**Key insight**: DevAC is not a tool. It's a domain. The concepts are a platform.

### Phase 5: Platform Vision — vivief-concepts v1→v6 (Mar 2025 - Mar 2026)

**Six iterations** of concept refinement:

| Version | Focus | Key Addition |
|---------|-------|-------------|
| v1 | Exploration — minimum concept set | Reducer model |
| v2 | Comprehensive | Actor network |
| v3 | Creation-focused | Streaming native |
| v4 | Trust & actor systems | Contract as meta-concept |
| v5 | Trim + deterministic-first | Enforcement duality |
| v6 | **Current** — 5 concepts | Intent formalized, skills as pattern |

**v6 crystallization**: Datom → Projection → Surface → Contract → effectHandler. Everything else (domain, bridge, artifact, slice, profile, skill) is a pattern, not a concept.

### Phase 6: Datom Pivot (Mar 2026)

**Turning point**: "Nodes, edges, and effects are ALL datoms."

The brainstorm on 2026-03-27 revealed the merge question was wrong. The real model: datoms with attribute namespaces (`:node/*`, `:edge/*`, `:effect/*`). Entity-centric access via Map-based EAVT/AEVT/AVET/VAET indexes.

**Core findings**:
- Datoms ARE a CRDT (assert = add, retract = remove, commutative)
- Replay diffs is the universal operation (every boundary crossed the same way)
- DatomStore eliminates 6 concrete pain points from the multi-table model
- At rest = fact, in motion = intent (phase distinction, not type distinction)

### Phase 7: P2P Substrate & Current Work (Mar 2026 - present)

**Technical substrate**: MoQ (Media over QUIC) as unified pub/sub protocol over QUIC via Iroh. iroh-blobs for frozen-tier storage. Loro for rich text CRDT. Progressive: single-user → relay → full P2P. Keet/Pear/Holepunch stack dropped — video built directly on MoQ hang format.

**Active implementation**: DatomStore in packages/devac-core/src/datom/ — Map-based indexes, benchmarks, compact store.

**Open design**: Security (containers, VPN-level, secure bridging). Cross-domain sharing patterns. The balance between design and implementation.

---

## The Meta-Insight

Vivief is about creation. Creating vivief IS using vivief's creation loop: `effect (Intent) → Contract(effectHandler) → datoms`. The documentation follows intent/contract/fact — the same phases. Brainstorms are intents. ADRs and specs are contracts. Implementation docs are facts.

The chicken-and-egg is not a problem to solve. It's the nature of the platform: design informs implementation, implementation reveals design gaps, gaps become new intents. The loop is the feature.
