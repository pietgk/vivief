# Vivief Concepts — Implementation Knowledge Base (v5)

> Decision framework for going from concepts to implementation. Not code-level details. Frames the choices needed with criteria and tradeoffs, leaving actual decisions open for follow-up evaluation.

---

## 1. Purpose & Scope

**What this document is.** A decision framework that maps vivief-concepts-v5.md to implementation choices. Each technology area is framed as an open decision with criteria derived from the concepts, candidate approaches, and tradeoffs. The format is decision-record style: What to decide / Why it matters / Criteria / Candidates / Concept connection.

**What this document is not.** A code-level spec, API reference, or architecture document. Those emerge from making the decisions framed here.

**Relationship to vivief-concepts-v5.md.** The concepts document defines WHAT the platform does and WHY. This document frames HOW to get there — without prescribing answers. The concepts are stable across technology choices; the technology choices serve the concepts.

**devac as PoC.** DevAC is a prototype/proof-of-concept that validates key ideas: DuckDB + Parquet for queryable code graphs, effect extraction from AST, Contract-like validation pipelines, MCP for AI tool integration. Learnings to carry forward: the effectHandler formula works, deterministic-first is practical, structured extraction enables powerful queries. Things to re-evaluate: storage engine, query layer, build approach, UI framework — all technology choices are open.

---

## 2. Technology Stack Decisions

### 2.1 Runtime & Language

**What to decide.** Primary language and runtime for the vivief platform.

**Why it matters.** The runtime constrains streaming capabilities, type safety, async patterns, and ecosystem access. The concepts require strict types (Contract enforcement at compile time), ESM (module boundaries map to bridge boundaries), and native async/streaming (Projection delivery modes).

**Criteria from concepts:**
- Strict type system (Contract enforcement, typed protocols)
- ESM module system (clean boundaries for bridges)
- Native async and streaming (Projection delivery, in-flight tokens)
- Rich ecosystem (UI frameworks, state machines, testing)

**Candidates:**

| Candidate | Strengths | Concerns |
|-----------|-----------|----------|
| **TypeScript / Node.js** | Largest ecosystem, proven at scale, devac PoC validates | Node.js streaming API complexity, startup time |
| **TypeScript / Deno** | Built-in TypeScript, modern APIs, permissions model | Smaller ecosystem, compatibility gaps |
| **TypeScript / Bun** | Fast startup, built-in bundler, Node.js compatible | Younger runtime, compatibility edge cases |

**Concept connection.** The effectHandler signature `(state, effect) => { datoms, effects }` is language-agnostic but benefits from TypeScript's type system for Contract enforcement at compile time. Actor-level handlers need robust async primitives.

### 2.2 Datom Store

**What to decide.** How to store, query, and subscribe to datoms.

**Why it matters.** The datom is the universal fact — every concept depends on it. The store must support append-only writes, immutable history, provenance attributes, schema-as-data, and queryable access. The choice of store shapes performance, query capabilities, and the Projection implementation.

**Criteria from concepts:**
- Append-only, immutable facts with `[Entity, Attribute, Value, Tx, Op]`
- Provenance attributes (`:tx/source`, `:tx/trust-score`) on every transaction
- Schema stored as datoms (schema-as-data)
- Queryable via Projection interface (filter, sort, group, depth, trust threshold)
- Subscription support for live and live-persistent delivery modes
- Replay capability (full history from tx:0 or asOf)

**Candidates:**

| Candidate | Strengths | Concerns |
|-----------|-----------|----------|
| **DuckDB + Parquet** | devac PoC validates, fast analytics, columnar | Not a native datom store, no built-in subscription, single-writer |
| **SQLite** | Ubiquitous, embedded, well-understood | Append-only requires discipline, no native subscription |
| **Datascript / DataScript-js** | Native datom model, Datalog queries, built for this | JS implementation maturity, memory-only by default |
| **Custom append-only store** | Exact fit for concept requirements | Build cost, no ecosystem tooling |
| **XTDB** | Native bitemporal datom store, Datalog | JVM dependency, operational complexity |

**What devac PoC taught us.** DuckDB + Parquet works well for batch analytics (code graph queries, diagnostic aggregation). Limitations surface with real-time subscriptions (live Projection), multi-writer scenarios (actor concurrency), and fine-grained datom-level operations. A production store likely needs a different approach for the reactive/subscription layer even if DuckDB remains useful for analytics.

### 2.3 P2P & Replication

**What to decide.** How to replicate datoms across peers with conflict resolution.

**Why it matters.** The Sync Contract specifies per-attribute conflict resolution, multi-writer support, encryption, and claim protocol. P2P enables the platform to work offline-first and peer-to-peer without central infrastructure.

**Criteria from concepts:**
- Per-attribute conflict resolution (text: CRDT, scalar: last-writer-wins, ref: manual-merge)
- Multi-writer with causal ordering
- End-to-end encryption (Trust Contract key derivation)
- Peer validation = Contract enforcement on incoming datoms
- Claim protocol for distributed work assignment

**Candidates:**

| Candidate | Strengths | Concerns |
|-----------|-----------|----------|
| **Holepunch (Hypercore / Hyperbee / Autobase)** | Append-only logs, multi-writer via Autobase, encryption, P2P native | API stability, learning curve, Node.js only |
| **Holochain** | Agent-centric, validation rules, P2P native | Rust runtime, different data model, steep learning curve |
| **Custom over libp2p** | Full control, language-agnostic | Significant build cost |

**Concept connection.** Peers are remote actors governed by the same Contracts as local actors. The Sync Contract maps directly to replication configuration. Defer until core platform is validated.

### 2.4 CRDT

**What to decide.** Which CRDT library to use for collaborative text editing and conflict-free merging.

**Why it matters.** The Sync Contract specifies CRDT for text attributes. Canvas mode Surface requires real-time collaborative editing.

**Criteria from concepts:**
- Text merging for Canvas mode (documents, notes)
- Integration with datom store (CRDT state as datom attributes)
- Performance with large documents
- Awareness features (cursors, selections) for collaborative Surfaces

**Candidates:**

| Candidate | Strengths | Concerns |
|-----------|-----------|----------|
| **Yjs** | Mature, battle-tested, rich ecosystem, awareness protocol | Memory usage with large histories |
| **Loro** | Modern, Rust core with WASM bindings, efficient | Younger project, smaller ecosystem |
| **Automerge** | Strong academic foundation, document-oriented | Performance at scale, API changes |

### 2.5 UI Framework

**What to decide.** Framework for rendering Surfaces across 6 modes.

**Why it matters.** Surfaces are the user's interface to the platform. The framework must support 6 render modes, streaming content, accessibility (Render Contract), trust signal rendering, and reactive updates from live Projections.

**Criteria from concepts:**
- 6 Surface modes (Stream, Card, Canvas, Dialog, Board, Diagram)
- Streaming content rendering (Dialog mode with in-flight tokens)
- Accessibility as first-class (Render Contract with WCAG, keyboard, screen reader)
- Trust signal rendering (provenance badges, trust scores)
- Reactive updates from Projection delivery modes
- Storybook integration for Contract verification

**Candidates:**

| Candidate | Strengths | Concerns |
|-----------|-----------|----------|
| **React** | Largest ecosystem, Storybook native, component model fits Surface modes | Meta-framework choice needed (Next.js, Remix, Vite) |
| **React + Next.js** | SSR, routing, API routes, deployment options | Server-centric model may conflict with P2P/offline |
| **React + Vite** | Lighter, SPA-focused, fast dev experience | No SSR out of the box |
| **Solid.js** | Fine-grained reactivity, better performance | Smaller ecosystem, Storybook support less mature |

**Concept connection.** Each Surface mode is a component pattern. The Surface → Projection binding maps to data-fetching hooks. Render Contracts map to component prop validation + axe testing.

### 2.6 State Machines

**What to decide.** State machine library for Contract StateMachine mode and actor lifecycle.

**Why it matters.** StateMachine is one of three Contract modes. Actor lifecycle, onboarding progression, escalation flows, and publishing workflows all use state machines. The Visual Triangle requires state machine visualization.

**Criteria from concepts:**
- Visual inspection (Stately Studio integration for Visual Triangle)
- Composable machines (actors contain sub-machines)
- TypeScript typed states and events
- Serializable machine definitions (stored as datoms)
- Runtime inspection (current state queryable)

**Candidates:**

| Candidate | Strengths | Concerns |
|-----------|-----------|----------|
| **XState v5** | Visual editor (Stately Studio), TypeScript native, actor model, battle-tested | Learning curve, bundle size |
| **Custom lightweight** | Exact fit, minimal overhead | No visual tooling, build cost |

**Concept connection.** XState is named in the Visual Triangle as a Contract verifier. Its actor model aligns with effectHandler Level 2. Machine definitions stored as datoms enable runtime Contract verification.

### 2.7 AI / LLM Integration

**What to decide.** How to integrate LLM capabilities (text generation, analysis, rule authoring).

**Why it matters.** The deterministic-first loop requires LLM observation, rule proposal, and explanation generation. Trust strategies require provenance tracking per LLM invocation. Streaming requires in-flight token delivery.

**Criteria from concepts:**
- Provider abstraction (capability categories like `:ai/text-generation`, not specific models)
- Trust scoring per invocation (`:tx/trust-score` on LLM output)
- Streaming support (in-flight tokens for Dialog mode)
- Observability as datoms (tokens, cost, latency, model stored as datoms)
- Context management (Projection-based context loading with trust threshold)

**Candidates:**

| Candidate | Strengths | Concerns |
|-----------|-----------|----------|
| **Direct API (Anthropic, OpenAI)** | Full control, streaming native | Multi-provider abstraction is manual |
| **Vercel AI SDK** | Provider abstraction, streaming, React hooks | Framework coupling, abstraction may conflict with datom-native observability |
| **Custom abstraction** | Maps exactly to effectHandler pattern | Build cost |

**Concept connection.** Every LLM invocation is an effectHandler (actor level) producing datoms with provenance. The handler's Behavior Contract constrains what the LLM may produce. In-flight Contract validates streaming tokens.

### 2.8 Build & Quality Tooling

**What to decide.** Monorepo management, type checking, linting, formatting, testing, coverage.

**Why it matters.** Quality tooling validates Contracts at development time. The deterministic-first principle applies to the build pipeline itself — push as much validation into fast, deterministic checks.

**Criteria from concepts:**
- Monorepo support (multiple packages with clean dependency boundaries)
- Strict TypeScript (type checking as compile-time Contract enforcement)
- Fast, deterministic linting and formatting
- Test framework supporting fixture-based testing (Storybook stories = Contract verification)
- Coverage tracking (Contract coverage: declared vs verifiable)

**Candidates:**

| Candidate | Strengths | Concerns |
|-----------|-----------|----------|
| **pnpm + Turborepo** | devac PoC validates, fast, workspace support | Turborepo cache configuration |
| **Biome** | Fast linting + formatting in one tool, devac PoC validates | Younger than ESLint, fewer rules |
| **ESLint + Prettier** | Largest rule ecosystem, community support | Two tools, slower than Biome |
| **Vitest** | Fast, Vite-native, devac PoC validates | — |

### 2.9 Visualization & Contract Verification

**What to decide.** Tools for making Contracts visible and verifiable (the Visual Triangle).

**Why it matters.** The Visual Triangle is central to Contract verification — state machines, component stories, architecture diagrams, and accessibility scanning all validate Contract compliance visually.

**Criteria from concepts:**
- C4 architecture diagrams from aggregation Contract datoms
- State machine visualization from Behavior Contract StateMachine definitions
- Component stories from Surface + Projection(fixture-datoms)
- Accessibility scanning from Render Contract a11y terms

**Candidates:**

| Candidate | Strengths | Concerns |
|-----------|-----------|----------|
| **likeC4** | C4 diagrams as code, composable views | Newer tool, smaller community |
| **Storybook** | Component stories, a11y addon, fixture-driven | Configuration overhead, version churn |
| **axe / axe-core** | WCAG scanning, CI integration, devac PoC validates | Runtime-only (needs rendered DOM) |
| **Stately Studio** | XState visualization, online editor | Cloud dependency for visual editor |

---

## 3. Concept → Technology Mapping

| Concept | What it needs from the technology layer |
|---------|-----------------------------------------|
| **Datom** | Append-only store with tuple structure, provenance attributes, schema-as-data, replay capability |
| **Projection** | Query engine (filter/sort/group/depth), subscription mechanism (live delivery), trust filtering, encryption layer |
| **Surface** | UI framework with 6 render mode components, streaming support, a11y validation, trust signal rendering |
| **Contract** | Validation runtime (pre-commit/in-flight/post-commit hooks), state machine engine, aggregation pipeline |
| **effectHandler** | Execution runtime (sync functions + async actors), message queue, failure handling, actor lifecycle management |

**Cross-cutting needs:**
- Serialization for datoms (store, transfer, cache)
- Event bus for effect routing between actors
- Content-addressed hashing for cache invalidation
- Key derivation for Trust Contract encryption

---

## 4. Implementation Phases

### Foundation Phases (build first)

| Phase | What | Depends on | v5 concept |
|-------|------|-----------|------------|
| 1 | **Datom store** with provenance attributes | — | Datom (§2.1) |
| 2 | **Schema Contract** validation at commit | Phase 1 | Contract pre-commit (§2.4) |
| 3 | **Projection snapshot** + 3 named profiles | Phase 1 | Projection (§2.2) |
| 4 | **effectHandler function** + failure model | Phase 1, 3 | effectHandler Level 1 (§2.5) |
| 5 | **Surface Card** + Projection binding + Render Contract | Phase 3 | Surface (§2.3) |

### Extension Phases (build on foundation)

| Phase | What | Depends on | v5 concept |
|-------|------|-----------|------------|
| 6 | **Live Projection** (ephemeral) + Surface reactivity | Phase 3, 5 | Projection delivery (§2.2) |
| 7 | **effectHandler actor** + streaming + in-flight Contract | Phase 4, 6 | effectHandler Level 2, in-flight (§2.5, §2.4) |
| 8 | **Live-persistent Projection** + compaction | Phase 6 | Two-tier lifecycle (§2.2) |
| 9 | **Composite Projection** + multi-source Surfaces | Phase 6, 5 | Composition (§10) |
| 10 | **Bridge pattern** + Contract at boundary | Phase 2, 4 | Bridge (§3) |
| 11 | **Cache pattern** with content-addressed invalidation | Phase 1, 2, 4 | Cache (§3) |
| 12 | **Behavior Contract** + StateMachine mode | Phase 4 | Contract modes (§2.4) |

### Advanced Phases (after core validated)

| Phase | What | Depends on |
|-------|------|-----------|
| 13 | Anti-pattern Guards with graduated enforcement | Phase 12 |
| 14 | Trust Contract + encryption + trust-scoped Projection | Phase 3 |
| 15 | Remaining Surface modes (Stream, Canvas, Dialog, Board, Diagram) | Phase 5, 7 |
| 16 | Deterministic-first loop (LLM rule proposal + review + activation) | Phase 12, 7 |

### Deferred Phases (see §8)

| Phase | What | When |
|-------|------|------|
| 17+ | Self-documentation domain (onboarding, explanation handler) | When team grows |
| 18+ | Domain packaging | When second domain needed |
| 19+ | Export/migration templates | When portability proof needed |
| 20+ | P2P / Sync Contract / CRDT | When core platform validated |

---

## 5. Architecture Patterns

### Bridge Pattern

Every connection to an external medium follows: effectHandler (reads medium, produces datoms) + Contract (validates at boundary). The handler reads the native medium, extracts what's relevant, and writes datoms with provenance. The Contract validates structure (Schema Contract) and trust (trust scoring on inbound data).

Implementation approach: define a `Bridge` interface that extends effectHandler with medium-specific configuration. Each bridge type (filesystem, git, API, web) implements the interface. Contract enforcement happens in a middleware layer that wraps the bridge handler.

### Actor Runtime

Actors are effectHandlers (Level 2) with identity, Projection subscription, message queue, and lifecycle. Implementation choices:

- **Message routing**: how effects reach the right actor (topic-based, direct addressing, or both)
- **Supervision**: what happens when an actor crashes (restart, escalate, stop)
- **Concurrency**: single-threaded event loop (Node.js natural) vs worker threads for CPU-bound handlers
- **Lifecycle**: spawn, running, stopping, stopped — with Projection subscription management

The actor runtime manages the lifecycle. Individual actors are effectHandlers with a Behavior Contract. The runtime itself is a system actor.

### Contract Enforcement

Contracts are enforced at three temporal points. Implementation approach per point:

- **Pre-commit**: synchronous validation in the store's write path. Schema Contract checks run before datom persistence. Fast path for the common case (valid datoms).
- **In-flight**: streaming pipeline with Contract validation between producer and consumer. Each chunk passes through registered in-flight Contracts before reaching the Surface. Rejection produces error datoms without stopping the stream.
- **Post-commit**: async validation triggered by commit events. Cross-entity invariants checked after the fact. Violations produce error datoms and `:effect/validation-failed` for escalation.

### Trust Scoring

Trust flows through the system at every stage:

1. **Assignment**: actor-type defaults set at datom creation. Handler override when Behavior Contract is verifiable.
2. **Storage**: `:tx/trust-score` persisted as a datom attribute alongside the data.
3. **Propagation**: derived content gets `min(source_trusts)`. The handler's override raises its own contribution, not input trust.
4. **Filtering**: Projection's `trustThreshold` excludes datoms below the threshold at query time.
5. **Display**: Render Contract's `trustSignals` configuration determines what provenance is shown.

---

## 6. The Deterministic-First Loop — Practical Mechanics

The deterministic-first principle is the platform's improvement trajectory: probabilistic LLM reasoning gradually becomes deterministic system enforcement. This section describes how that works in practice.

### What Triggers LLM Observation

The LLM doesn't continuously monitor — it observes when triggered:

- **Repeated patterns**: when an effectHandler handles the same edge case via LLM reasoning more than N times (configurable threshold), the system flags it for rule proposal
- **Repeated explanations**: when the explanation handler generates similar explanations for different users encountering the same concept confusion
- **Repeated debug narratives**: when `Projection.debug()` output for different entities follows the same pattern (same Contract failures, same escalation paths)

Each trigger produces an `:effect/rule-proposal-needed` datom with context.

### How Rules Are Proposed

When triggered, the LLM receives the pattern context via Projection and produces a proposed Contract:

```
[rule-proposal:X  :contract/type       :guard          tx:N  true]
[rule-proposal:X  :contract/rule       "..."           tx:N  true]
[rule-proposal:X  :tx/source           :ai/text-gen    tx:N  true]
[rule-proposal:X  :tx/trust-score      0.7             tx:N  true]
[rule-proposal:X  :proposal/confidence 0.85            tx:N  true]
[rule-proposal:X  :proposal/evidence   [ref:A,ref:B]   tx:N  true]
```

The proposal includes confidence scoring and references to the evidence that triggered it.

### Review Workflow

Proposed rules follow the **gated trust strategy** — human reviews before activation:

1. LLM proposes rule with confidence score and evidence
2. Human reviews proposal, evidence, and potential false positives
3. If approved, rule transitions from `asserted` to `active` in the Contract lifecycle
4. If rejected, proposal is retracted with `:tx/why` explaining the rejection

### How Rules Are Validated

Before activation, proposed rules must pass verification:

- **Contract tests**: does the rule correctly identify the pattern it claims to detect?
- **False positive check**: does the rule fire on cases it shouldn't?
- **Verifiable coverage**: does the rule have at least one fixture or test case? (Contract coverage: verifiable, not just declared)

Rules that pass verification and human review can be activated. Rules with failing tests stay in `asserted` state until fixed.

### How Rules Are Refined

Active rules that produce false positives enter the refinement cycle:

1. False positive detected (human flags or automated monitoring)
2. Current rule superseded via Contract lifecycle (state: `superseded`)
3. LLM observes the false positive pattern and proposes refined rule
4. Refined rule goes through the same review → validate → activate cycle
5. Old rule remains in the log for audit (immutable)

### Confidence Thresholds and Auto-Promotion

For low-risk domains, high-confidence rules with passing tests can auto-promote:

| Confidence | Action |
|------------|--------|
| < 0.7 | Manual review required |
| 0.7 – 0.9 | Human review with auto-approve suggestion |
| > 0.9 + all tests pass | Auto-promote eligible (if `:promotion/auto-on-pass true`) |

The confidence threshold itself is a Contract default that refines per domain: clinical starts at "all manual," developer tooling may allow auto-promotion for lint-style rules.

---

## 7. Quality Approach

### Type Safety

Strict TypeScript throughout. The type system is the first line of Contract enforcement — invalid datom structures, incorrect handler signatures, and mismatched Projection queries should fail at compile time where possible.

### Linting and Formatting

Deterministic, fast, consistent. Biome (or equivalent) for formatting. Custom lint rules evolve through the deterministic-first loop — LLM-proposed rules that prove their value become permanent lint checks.

### Testing Strategy

| Level | What it validates | Concept connection |
|-------|-------------------|--------------------|
| **Unit** | Individual effectHandler functions | Handler with fixture datoms → expected output |
| **Integration** | Handler + Store + Contract pipeline | End-to-end creation loop for a Feature slice |
| **Contract-as-test** | Storybook stories verify Render Contracts | `Story = Surface(Projection(fixture-datoms))` |
| **StateMachine** | XState machine transitions | Behavior Contract StateMachine mode verification |
| **a11y** | axe scanning of rendered Surfaces | Render Contract a11y terms |

### Code Coverage

Coverage tracks how much of the creation loop is verified. Contract coverage (declared vs verifiable) is a more meaningful metric than line coverage — "show me all declared-but-not-verifiable Contracts" is a technical debt Projection.

### Contract Verification

- **Storybook**: each story is a test case for a Render Contract
- **XState**: each machine definition is a testable Behavior Contract
- **likeC4**: architecture diagrams verify aggregation Contract accuracy
- **axe**: WCAG scanning validates Render Contract a11y terms

---

## 8. What to Defer

Explicit list of concepts and patterns that should NOT be built in the foundation phases. These are valuable but depend on a working core platform.

| Deferred item | Why defer | When to revisit |
|---------------|-----------|-----------------|
| **Self-documentation domain** | Bootstrap problem — explanation handler needs working platform | When team grows beyond concept authors |
| **Domain packaging** | Overhead without benefit for single-domain deployments | When second domain is needed |
| **Export/migration templates** | Portability proof, not runtime requirement | When adoption or lock-in concerns arise |
| **P2P / Sync Contract** | Complex infrastructure, core platform must validate first | After core platform handles single-user well |
| **LLM-generated lint rules** | Requires working creation loop and LLM integration | After deterministic-first loop is validated with manual rules |
| **Portability mapping tables** | Reference material, moved from concepts doc | Alongside export templates |
| **Git → vivief mapping** | Detailed bridge mapping for source code medium | When implementing the source code bridge |
| **Holepunch / infrastructure details** | P2P implementation specifics | When P2P replication is prioritized |
| **Content worlds** | Deep locale adaptation with separate content structures | When internationalization is needed |
| **Canvas mode + CRDT** | Requires CRDT library integration | After Card and Dialog modes are stable |
| **Replay delivery mode** | Time-travel queries require mature store | After snapshot and live modes are solid |

---

*Version: v5 implementation KB — decision framework for vivief platform implementation. All technology choices framed as open decisions with criteria from concepts, candidate approaches, and tradeoffs. DevAC acknowledged as PoC with learnings to carry forward. Dedicated section for deterministic-first loop practical mechanics. Replaces vivief-concepts-implementation-kb.md (which referenced v2).*
