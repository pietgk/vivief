# Vivief P2P Node Architecture

**Status:** Brainstorm
**Date:** 2026-03-26
**Revises:** [ADR-0050](../../adr/0050-tech-stack.md) (browser-first tech stack)
**Sources:** ADR-0050, [d2ts-sqlite-operator-state](d2ts-sqlite-operator-state.md), [vivief-p2p-lean-stack-adr-v2](vivief-p2p-lean-stack-adr-v2.md), [vivief-concepts-v6](../vivief-concepts-v6.md), [concepts](../concepts.md), [foundation](../foundation.md), [implementation KB](../vivief-concepts-v6-implementation-kb.md)

---

## Narrative Arc

1. ADR-0050 defined vivief as browser-first — all logic in the browser, everything else added later
2. Reviewing ADR-0050 against the existing DevAC implementation exposed a gap: DevAC is a vivief domain (Code Analysis) that needs Node.js, filesystem, and git — it can never be browser-only
3. Browser-first breaks when first-class domains require server-side runtimes
4. The real model: **vivief is a P2P system of typed nodes** — browser is one node type, DevAC is another, relay is another
5. C4 maps this naturally: System = Vivief, Containers = Nodes, Components = Actors
6. MoQ from start enables this — unified pub/sub across all nodes, from day 1
7. Storage tiers map to node capabilities — warm tier on all nodes, frozen tier on big nodes
8. Datoms are the universal primitive — storage, computation, and communication all use the same `[E, A, V, Tx, Op]` shape
9. This is cleaner than ADR-0050: one architectural model, not phased complexity

---

## 1. The ADR-0050 Gaps

### What ADR-0050 Got Right

These decisions carry forward unchanged:

- **Drop Holepunch** — Hypercore's append-only log is the wrong abstraction for datom multisets with retractions. Iroh + MoQ + D2TS is cleaner.
- **Datom shape** — `[Entity, Attribute, Value, Tx, Op]` with ULIDs, namespaced attributes, provenance-as-datoms. Engine-independent.
- **Conflict resolution** — LWW for `:one` scalar, OR-Set for `:many`, `:contract/conflict` datom for `:one` ref (human resolves), Loro Fugue for rich text. Healthcare-safe.
- **Loro scoped to rich text** — Fugue algorithm for character-level merge. All structured data goes through datom/D2TS path.
- **React 19 + Vite + TanStack Router** — component model maps to Surface modes. D2TS feeds React directly via hooks.
- **XState v5 for all Surfaces** — React is always a pure renderer of actor state snapshots. Three-layer model: Data → Logic → View.
- **Ark UI (Zag.js)** — headless a11y components. Two state machine layers: XState (domain) + Zag.js (UI interaction).
- **CSS Modules + Custom Properties** — zero-runtime styling. Trust-semantic design tokens. Dark mode primary.
- **Custom LLM abstraction** — effectHandler-based. Capability categories as provider routing. Trust scoring per invocation.
- **TypeScript strict ESM** — Contract enforcement at compile time. Node.js ≥ 24.14.1 LTS for dev tooling (native TypeScript execution).
- **pnpm + Turborepo + Biome + Vitest + Husky** — already in use, keep all.
- **Storybook 10+** — Contract verification: `Story = Surface(Projection(fixture-datoms))`.
- **WCAG 2.2 AA** — Render Contract a11y baseline.
- **Tauri** for desktop shell (Phase 4).
- **Concept-aligned packages** — vivief-datom, vivief-contract, vivief-projection, vivief-surface, vivief-effect, vivief-llm, vivief-app.

### What ADR-0050 Got Wrong or Incomplete

| ADR-0050 Position | Problem | This Brainstorm |
|-------------------|---------|-----------------|
| "Existing packages (unchanged)" | DevAC IS a vivief domain — the Code Analysis domain. It can't be unchanged. | DevAC as first-class domain with progressive migration |
| wa-sqlite + OPFS as warm tier | D2TS SQLite is intermediate operator state, not datom storage. 2.8–10.3× overhead vs minimal datom store. See [d2ts-sqlite-operator-state](d2ts-sqlite-operator-state.md). | TypeScript Map-based datom indexes (EAVT, AEVT) |
| iroh-blobs as frozen tier | Separate from MoQ. "Everything is a track" — storage should BE track history. | MoQ tracks as durable WAL |
| No browser persistence strategy | Closing the tab loses all data | IndexedDB cache (convenience) + relay frozen WAL (authoritative) |
| MoQ in Phase 13+ | DevAC needs real-time from day 1. Every domain is a first-class member from start. | MoQ from start |
| Browser-first phases (1-12, 13-16, 20+) | Assumes browser is the center. Breaks when domains need server-side runtimes. | Node-capability phases — architecture stable, node types grow |
| No C4 mapping | Architecture has no structural mapping tool | C4: System → Containers (Nodes) → Components (Actors) |
| Actor systems not specified | How do effectHandlers coordinate across nodes? | Node-local XState actors. Cross-node communication is datom streams via MoQ. |

---

## 2. Core Insight — P2P Node Architecture

**Vivief is a P2P system of typed nodes.**

Every participant — browser tab, DevAC CLI, relay server, desktop app — is a **node** with typed capabilities. The architecture is the same whether there is one node or a hundred. Phases add node types, not architectural complexity.

Node capabilities:

| Capability | Description | Which nodes |
|-----------|-------------|-------------|
| **compute** | D2TS computation, effectHandler execution | All nodes |
| **warm storage** | In-memory datom indexes (EAVT, AEVT) | All nodes |
| **frozen storage** | MoQ WAL on disk (BLAKE3 verified) | Big nodes (relay, desktop) |
| **UI** | Surface rendering (React, XState, Ark UI) | Browser nodes |
| **filesystem** | File access, git, AST parsing | Desktop/server nodes |
| **relay/fan-out** | MoQ track distribution to subscribers | Server nodes |

A browser tab is a small node with UI. A desktop app is a big node with all capabilities. A relay is a server node with fan-out and frozen storage. A DevAC CLI is a medium node with filesystem access and code analysis.

The architecture doesn't change as nodes are added — only the set of available capabilities grows.

---

## 3. C4 Mapping

### System Context (C4 Level 1)

Vivief is the system. Users interact with it. It connects to external services.

```
[Practitioner] ──▶ [Vivief Platform]
[Developer]    ──▶ [Vivief Platform]

[Vivief Platform] ──▶ [LLM APIs] (Anthropic, OpenAI)
                  ──▶ [Git Forges] (GitHub)
                  ──▶ [Code Repositories]
                  ──▶ [Iroh Relay Network]
```

**Open question: what is "platform" in C4 terms?** C4's System concept typically has clear boundaries. Vivief as "platform" means: the set of shared concepts (Datom, Projection, Surface, Contract, effectHandler), shared libraries (vivief-* packages), and shared protocols (MoQ over Iroh) that all nodes use. The platform is domain-agnostic infrastructure — domains (Code Analysis, Clinical Practice, etc.) plug into it.

### Container Diagram (C4 Level 2) = Node Types

Each container is a node type. Nodes are running processes with typed capabilities.

| Node Type | Size | Capabilities | Runtime | Example |
|-----------|------|-------------|---------|---------|
| **Browser Node** | Small | UI + compute + warm + IndexedDB cache | Browser (WebTransport) | vivief-app tab |
| **DevAC Node** | Medium | Filesystem + compute + code analysis | Node.js (MoQ publisher) | devac CLI/MCP on dev machine |
| **Relay Node** | Server | Fan-out + frozen WAL + MoQ persistence | Rust binary (moq-relay) | Self-hosted relay for practice |
| **Desktop Node** | Big | All tiers + Iroh P2P + holepunching | Tauri + Rust sidecar | Offline-first desktop app |

### Component Diagram (C4 Level 3) = Actors per Node

Each node runs XState actors internally. Actors are node-local — they never span nodes.

**Browser Node actors:**
- D2TS Engine — processes datom streams, materializes indexes
- Surface Renderer — React components, Ark UI, design system
- Projection Manager — query evaluation, delivery modes
- effectHandler Router — dispatches effects to handlers, produces datoms
- MoQ Client — subscribes/publishes datom tracks via WebTransport

**DevAC Node actors:**
- Code Analyzer — AST parsing, semantic resolution, entity extraction
- Hub Manager — DuckDB queries, seed aggregation
- Validator — tsc, eslint, tests, wcag, rules engine
- MoQ Publisher — translates seeds to datoms, publishes MoQ tracks

**Relay Node actors:**
- MoQ Fan-out — distributes tracks to subscribers
- Frozen WAL Manager — persists track segments to disk
- BLAKE3 Verifier — content-addressed segment integrity

**Desktop Node actors:**
- All browser actors (D2TS, Surface, Projection, effectHandler)
- Iroh Endpoint — P2P holepunching, direct connections
- Local Frozen Storage — full frozen tier on local disk

---

## 4. Layer Stack

```
┌─────────────────────────────────────────────────┐
│  Application                                     │
│  Datoms, Surfaces, Contracts, effectHandlers     │
├─────────────────────────────────────────────────┤
│  Protocol                                        │
│  MoQ (pub/sub, tracks, WAL persistence)          │
├─────────────────────────────────────────────────┤
│  Transport                                       │
│  Iroh (QUIC, holepunching, Ed25519 identity)     │
└─────────────────────────────────────────────────┘
```

**Iroh** provides:
- QUIC connections (browser→relay via WebTransport, desktop→desktop via holepunching)
- Ed25519 identity (NodeId — each node has a persistent identity)
- Relay fallback with E2E encryption
- ALPN-based protocol multiplexing

**MoQ** provides:
- Pub/sub semantics — tracks, groups, objects
- Track organization — namespace/track-name patterns
- Priority-based congestion — audio > datoms > video > text
- WAL persistence — frozen tier IS persisted track history

**iroh-blobs** (optional):
- Large content-addressed data (Loro document snapshots, frozen epoch archives)
- BLAKE3 verified streaming
- Used when data doesn't fit the track model (binary blobs, large snapshots)

---

## 5. Revised Storage Tiers

### The Correction

ADR-0050 proposed wa-sqlite + OPFS as the warm tier and iroh-blobs as the frozen tier. The [d2ts-sqlite-operator-state](d2ts-sqlite-operator-state.md) research showed this is wrong:

- D2TS SQLite tables are **intermediate operator state** (arrangements, compaction frontiers, dirty key tracking) — not a datom store
- Storage overhead: **2.8–10.3×** compared to a minimal datom store
- JSON serialization of all columns (double-encoding) inflates every row
- Per-operator duplication — each operator in the pipeline keeps its own copy

### Revised Tier Model

| Tier | What | Where | Persistence | Purpose |
|------|------|-------|-------------|---------|
| **Hot** | D2TS in-memory computation | All nodes | None | Active processing — versions above frontier, no compaction |
| **Warm** | TypeScript Map-based datom indexes | All nodes | None (in-memory) | Fast query — O(1) entity lookup, O(1) attribute scan. Rehydrates from frozen. |
| **Frozen** | MoQ tracks as durable WAL | Big nodes (relay/desktop) | Disk | Authoritative — BLAKE3 per segment, verified streaming, content-addressed |
| **Cache** | IndexedDB snapshot of warm tier | Browser nodes | Browser storage | Convenience — fast reload, not authoritative, may be stale or cleared |

### Warm Tier: TypeScript Map-Based Indexes

```typescript
// EAVT: entity → attribute → datoms
Map<EntityId, Map<Attribute, Set<Datom>>>

// AEVT: attribute → entity → datoms
Map<Attribute, Map<EntityId, Set<Datom>>>

// Later: AVET (value lookup), VAET (reverse ref / graph traversal)
```

- No serialization overhead (native JS objects)
- D2TS materializes these indexes incrementally — input is datom stream, output is index updates
- Memory-efficient (references, not copies)
- Survives as long as the node process is running
- Rehydrates from frozen tier on startup

### Frozen Tier: MoQ Tracks as Durable WAL

"Everything is a track" — the MoQ lean stack insight extends to storage:

```
Track: practice42/datoms/session
Segments:
  epoch-001: [datom1, datom2, ...datom_n]  (sealed, immutable)
  epoch-002: [datom_{n+1}, ...]             (sealed, immutable)
  epoch-current: [...]                      (active, accumulating)
```

- Each segment is sealed and immutable once closed
- BLAKE3 hash per segment — content-addressed verification
- Stored on big nodes (relay, desktop) that have disk
- Browser nodes don't persist frozen — they rehydrate warm from frozen on connect
- Verified streaming: integrity guaranteed during transfer between nodes

### Browser Persistence: IndexedDB Cache

- Browser nodes snapshot their warm tier to IndexedDB for fast reload
- Not authoritative — convenience only, may be stale
- On startup: load from IndexedDB (fast) → connect to relay → catch up from frozen WAL if stale
- Graceful degradation: no relay? IndexedDB only. No IndexedDB? Full replay from relay.

---

## 6. Datoms as Universal Primitive

The most elegant aspect of this architecture: **datoms are the universal primitive** for storage, computation, and communication. There is no separate message format, no separate storage format. Everything is `[Entity, Attribute, Value, Tx, Op]`.

| Use | How datoms flow |
|-----|-----------------|
| **Storage** | Warm tier (Map indexes) and frozen tier (MoQ WAL) store datoms |
| **Communication** | MoQ tracks carry datoms between nodes |
| **Computation** | D2TS processes datom streams (assert=+1, retract=-1 multiset) |
| **Actor output** | effectHandlers produce datoms as their output |
| **Cross-node exchange** | Nodes publish/subscribe to datom tracks, not actor events |
| **Provenance** | Every transaction has provenance datoms (`:tx/source`, `:tx/trust-score`) |

### Cross-Node Communication

Actors are **node-local** — each node runs its own XState actor system. Between nodes, all communication is datom streams via MoQ. There is no distributed actor system, no remote procedure calls, no separate event protocol.

Why: D2TS already communicates in datoms internally. MoQ already streams datoms. Adding a separate actor-to-actor protocol across nodes would introduce a second communication primitive for no benefit. Datom pub/sub is sufficient and consistent.

```
Browser Node                     DevAC Node
┌──────────────────┐             ┌──────────────────┐
│ XState actors    │             │ XState actors    │
│  (local only)    │             │  (local only)    │
│                  │             │                  │
│ D2TS ← MoQ sub ◄├─── MoQ ────┤► MoQ pub → Hub  │
│                  │   datoms    │                  │
│ Surface ← D2TS  │             │ Analyzer → seeds │
│                  │             │ → datom boundary │
└──────────────────┘             └──────────────────┘
```

---

## 7. DevAC as Code Analysis Domain

### Relationship

DevAC is a vivief domain — the **Code Analysis domain**. It's a node type (DevAC Node) that publishes datom tracks.

DevAC already implements proto-versions of every vivief concept:

| V6 Concept | DevAC Equivalent | Migration |
|-----------|------------------|-----------|
| **Datom** | Seeds (Parquet rows: nodes, edges, effects) | Emit datoms at MoQ boundary |
| **Projection** | MCP query tools (query_symbol, query_deps, etc.) | Wrap as vivief-projection |
| **Surface** | CLI output, MCP tool responses | Render as vivief Surfaces in vivief-app |
| **Contract** | Validators (tsc, eslint, tests, wcag), rules engine | Wrap as vivief-contract instances |
| **effectHandler** | Extractors, validators, analysis pipeline | Already IS the pattern |

### Runtime

DevAC stays on **Node.js** — it needs filesystem access (reading code files, `.git`, AST parsing with tree-sitter/ts-morph). Node.js is the right runtime for a tool that operates on local code.

### Storage: DuckDB Inside, Datoms Outside

DevAC keeps **DuckDB + Parquet** internally — it works well for batch code analysis (columnar queries, SQL, fast aggregation). At the MoQ publishing boundary, seed rows are translated to datoms:

```
Seed row (DuckDB/Parquet)              Datom (MoQ track)
───────────────────────                ─────────────────
node: { id: 'fn/abc123',             [:fn/abc123 :node/kind "function" tx1 assert]
        kind: 'function',             [:fn/abc123 :node/name "handleClick" tx1 assert]
        name: 'handleClick',          [:fn/abc123 :node/file "src/app.ts" tx1 assert]
        file: 'src/app.ts' }

edge: { source: 'fn/abc123',         [:fn/abc123 :edge/calls :fn/def456 tx1 assert]
        target: 'fn/def456',
        kind: 'CALLS' }

effect: { kind: 'FunctionCall',       [:effect/e1 :effect/kind "FunctionCall" tx1 assert]
          target: 'stripe.charge',     [:effect/e1 :effect/target "stripe.charge" tx1 assert]
          domain: 'Payment',           [:effect/e1 :effect/domain "Payment" tx1 assert]
          significance: 'Critical' }   [:effect/e1 :effect/sig "Critical" tx1 assert]
                                       [:effect/e1 :effect/source :fn/abc123 tx1 assert]

diagnostic: { message: '...',          [:diag/1 :diagnostic/message "..." tx2 assert]
              source: 'tsc' }          [tx2 :tx/source "tsc" tx2 assert]
                                       [tx2 :tx/trust-score 1.0 tx2 assert]
```

### Transport: MoQ Tracks from Day 1

DevAC publishes its data as MoQ tracks:

| Track | Content |
|-------|---------|
| `devac/{repo}/nodes` | Code graph nodes (functions, classes, etc.) |
| `devac/{repo}/edges` | Relationships (CALLS, IMPORTS, EXTENDS, etc.) |
| `devac/{repo}/effects` | Extracted effects (FunctionCall, Store, Send, etc.) |
| `devac/{repo}/diagnostics` | Validation results (tsc, eslint, tests, wcag) |
| `devac/{repo}/c4` | C4 architecture data (systems, containers, components) |

### Progressive Migration

DevAC adopts vivief concepts in this order:

**1. Contract first** — smallest conceptual leap. DevAC's validators already ARE constraint enforcement.
- tsc validator → Schema Contract
- eslint/biome validator → Schema Contract
- test validator → Behavior Contract
- wcag validator → Render Contract
- rules engine → Behavior Contract (pattern matching on effects)

**2. Datom boundary** — add datom translation to MoQ publishing. DevAC internals unchanged.

**3. Projection** — wrap MCP query tools (query_symbol, query_deps, query_affected, status_diagnostics, etc.) as vivief-projection instances.

**4. Surface** — C4 diagrams, diagnostics boards, dependency graphs as vivief Surfaces in vivief-app (see Section 8).

**End-state aspiration:** Hub becomes a vivief-datom store (DuckDB → D2TS migration). Not near-term — the boundary translation approach works well for now.

### Multi-User Vision

DevAC is not just a local dev tool — it answers **"how does the system work?"** for all users of the system:

- Real-time diagnostics: network logging, console messages, code changes while an LLM modifies code
- Live C4 diagrams updating as code structure changes
- Multiple subscribers get the same datom feed via MoQ relay
- Developers, architects, and system users all benefit from the same data

### Browser Packages

browser-core, browser-cli, browser-mcp are **DevAC domain tooling**. They enable:
- Accessibility scanning of other apps (axe-core → diagnostics)
- Runtime behavior observation (console, network, UI layers)
- LLM understanding of how code behaves at runtime (not just statically)
- Testing vivief-app itself — DevAC analyzes vivief (the tool analyzes itself)

### Future Skill Mappings

These demonstrate that everything maps to effectHandlers (scope for later implementation):
- **devac-worktree** → vivief Skill (effectHandler + Behavior Contract with states: `claimed → wip → pr → merged`)
- **devac-eval** → Contract verification tooling (evaluation IS contract validation)

---

## 8. C4 Diagram as Live Surface

The live C4 diagram is a **Diagram-mode Surface** in vivief-app, consuming DevAC datoms via a live Projection. This is THE proof that DevAC is a vivief domain — its data renders through vivief Surfaces.

```tsx
<DiagramSurface
  projection={codeGraphProjection}
  mode="diagram"
/>
```

**Projection:**
```typescript
{
  filter: { namespace: 'devac/*', kind: ['system', 'container', 'component'] },
  delivery: 'live',
  depth: 'containers'  // or 'components' for drill-down
}
```

**Data flow:**
```
DevAC Node → datoms → MoQ → Relay → MoQ → Browser Node
  → D2TS processes datoms
  → Projection filters to code graph
  → DiagramSurface renders C4 diagram
  → React updates incrementally on change
```

**XState actor manages:**
- Zoom level and pan position
- Selected container (drill-down to components)
- Detail depth (system → containers → components)
- Filter state (show/hide node kinds, edge types)
- Layout algorithm selection

Updates incrementally on every code change — as an LLM modifies code, the C4 diagram reflects the structural change in real-time.

---

## 9. Node-Capability Phase Model

Replaces ADR-0050's browser-first phases (1-12, 13-16, 20+). The architecture is stable across all phases — only the set of active node types grows.

| Phase | Name | Nodes | Features |
|-------|------|-------|----------|
| **1** | Foundation | Browser + local relay | Single-user vivief-app. D2TS, Surfaces, Contracts, XState. IndexedDB cache + relay frozen WAL. Core concepts validated. |
| **2** | Code Analysis | + DevAC node | Live C4 diagrams, diagnostics boards, code graph exploration. DevAC publishes MoQ tracks. Browser subscribes and renders Surfaces. |
| **3** | Multi-User | + remote relay | Counselor↔client communication. Multiple browser nodes via relay. Loro for shared rich text (session notes). Presence, datom sync. |
| **4** | Desktop / Full P2P | + Tauri desktop | Offline-first operation. Iroh direct connections (holepunching). Full frozen tier on local disk. All capabilities in one node. |

**Key difference from ADR-0050:** The phase model is additive, not transformative. Phase 1's architecture is the same as Phase 4's — Phase 4 just has more node types active. No "browser-only then add server then add P2P" transformation. It's always P2P, always MoQ, always the same datom-based communication.

---

## 10. What Changes from ADR-0050

| ADR-0050 | This Brainstorm | Why |
|----------|----------------|-----|
| Browser-first, lean stack | P2P node architecture | DevAC integration proves browser-first is incomplete — first-class domains need server-side runtimes |
| wa-sqlite + OPFS (warm) | TypeScript Map indexes (warm) | D2TS SQLite is operator state, not datom storage (2.8–10.3× overhead). See [d2ts-sqlite-operator-state](d2ts-sqlite-operator-state.md) |
| iroh-blobs (frozen) | MoQ tracks as durable WAL (frozen) | "Everything is a track" — storage IS track history. One primitive for persistence + communication |
| No browser persistence | IndexedDB cache (convenience, not authoritative) | Fast reload + graceful degradation when relay unavailable |
| MoQ in Phase 13+ | MoQ from start | Every domain is first-class from day 1. DevAC needs real-time. No throwaway transport code. |
| "Existing packages unchanged" | DevAC as vivief domain with progressive migration | DevAC IS a vivief domain — the Code Analysis domain |
| Phase 1-12, 13-16, 20+ | Node-capability phases 1-4 | Architecture is stable; phases add node types, not complexity |
| No C4 mapping | C4: System → Containers (Nodes) → Components (Actors) | Natural structural mapping for P2P architecture |
| Actor systems not specified | Node-local XState actors; datom streams between nodes | Datoms are the universal primitive — no separate inter-node event protocol |

---

## 11. What Carries Forward from ADR-0050

All of these remain valid and unchanged:

**Core stack:**
- Iroh for P2P transport (QUIC, holepunching, Ed25519 identity)
- MoQ for pub/sub (unified protocol, priority-based congestion, IETF-backed)
- D2TS for datom computation (multiset model = datom model, incremental arrangements)
- Datom shape (ULID, namespaced attributes, provenance-as-datoms, schema-as-data)
- Loro for rich text only (Fugue algorithm, scoped — all structured data via datom/D2TS)
- Conflict resolution (LWW / OR-Set / `:contract/conflict` / Loro Fugue)

**UI & state:**
- React 19 + Vite + TanStack Router (no SSR, SPA, type-safe routing)
- XState v5 for all Surfaces (React = pure renderer of actor snapshots)
- Ark UI / Zag.js (headless a11y, two state machine layers)
- CSS Modules + Custom Properties (zero runtime, trust-semantic tokens)

**LLM:**
- Custom vivief LLM abstraction (effectHandler-based, capability categories, trust scoring, observability-as-datoms)

**Build & quality:**
- TypeScript strict ESM, Node.js ≥ 24.14.1 LTS (native TypeScript execution for dev tooling)
- pnpm + Turborepo + Biome + Vitest + Husky (all already in use)
- Storybook 10+ for Contract verification
- axe-core for WCAG 2.2 AA scanning

**Packages:**
- Concept-aligned: vivief-datom, vivief-contract, vivief-projection, vivief-surface, vivief-effect, vivief-llm, vivief-app
- Existing: devac-core, devac-cli, devac-mcp, devac-eval, devac-worktree, browser-core, browser-cli, browser-mcp, a11y-reference-storybook

**Deployment:**
- Tauri for desktop shell (Phase 4)

---

## 12. Open Questions

| Question | Context | When to resolve |
|----------|---------|-----------------|
| What is "platform" in C4 System context? | Vivief as System works but "platform" is ambiguous. Need clean definition of boundaries — is it the shared infra, the running system, or both? | Before writing ADR-0051 |
| MoQ TypeScript client implementation | moq-js? Custom? What's mature enough for Phase 1? | Pre-Phase 1 spike |
| MoQ WAL persistence format | How are MoQ tracks persisted to disk on relay/desktop nodes? Binary format, segment boundaries, compaction. | Pre-Phase 1 spike |
| D2TS → Map index materialization | How does D2TS output feed TypeScript Map-based EAVT/AEVT indexes? Custom D2TS operator or downstream subscriber? | Pre-Phase 1 spike |
| IndexedDB warm snapshot format | Serialization format for warm tier snapshot in IndexedDB. JSON? Structured clone? Compact binary? | Pre-Phase 1 spike |
| DevAC datom boundary translation | Exact mapping from seed schema (nodes/edges/effects/external_refs) to datom tuples. Entity ID format mapping. | Pre-Phase 2 |
| Local relay packaging | How is the local moq-relay distributed to developers? npm package wrapping Rust binary? Standalone binary? | Pre-Phase 1 |
| DevAC multi-user hub evolution | Timeline and approach for DuckDB → vivief-datom store migration. End-state aspiration. | Future |
| Iroh WASM in browser vs WebTransport | For browser → relay connection, is Iroh WASM needed or can browser use WebTransport directly to MoQ relay? | Pre-Phase 1 spike |
| D2TS performance at scale | D2TS with 500K+ datoms in browser. Memory usage, computation latency, index materialization speed. | Pre-Phase 1 spike |

---

## References

- [ADR-0050: Vivief Tech Stack](../../adr/0050-tech-stack.md) — what this brainstorm revises
- [d2ts-sqlite-operator-state](d2ts-sqlite-operator-state.md) — D2TS SQLite is operator state, not datom storage
- [vivief-p2p-lean-stack-adr-v2](vivief-p2p-lean-stack-adr-v2.md) — MoQ "everything is a track" insight
- [vivief-p2p-lean-stack-adr](vivief-p2p-lean-stack-adr.md) — original lean stack (Iroh + D2TS)
- [vivief-concepts-v6](../vivief-concepts-v6.md) — the five concepts
- [vivief-concepts-v6-implementation-kb](../vivief-concepts-v6-implementation-kb.md) — implementation framework
- [concepts](../concepts.md) — current DevAC concepts (Four Pillars, effects documentation)
- [foundation](../foundation.md) — current DevAC conceptual foundation
- [D2TS](https://github.com/electric-sql/d2ts) — Differential Dataflow in TypeScript
- [Iroh](https://github.com/n0-computer/iroh) — Rust P2P (QUIC, holepunching, WASM)
- [MoQ](https://github.com/moq-dev/moq) — Media over QUIC
- [Loro](https://github.com/loro-dev/loro) — Rust CRDT (Fugue algorithm, WASM)
