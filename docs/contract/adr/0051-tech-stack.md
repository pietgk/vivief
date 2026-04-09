# ADR-0051: Vivief Tech Stack — P2P Node Architecture

## Status

Accepted (2026-04-07)

Supersedes: [ADR-0050](0050-tech-stack.md) (which superseded [ADR-0046](0046-runtime-and-language.md), [ADR-0047](0047-datom-store-sync.md), [ADR-0048](0048-ui-framework.md), [ADR-0049](0049-deployment-architecture.md))

## Context

**Motivated by** [vivief-concepts-v6.md](../vivief-concepts-v6.md) and [creation-loop-extensions.md](../vision/creation-loop-extensions.md).

ADR-0050 defined vivief as a **browser-first, lean stack** — all application logic in the browser, complexity introduced progressively. It consolidated ADRs 0046–0049 into one coherent decision.

Reviewing ADR-0050 against the existing DevAC implementation exposed a fundamental gap: **DevAC is a vivief domain (Code Analysis) that requires Node.js, filesystem access, and git — it can never be browser-only.** Browser-first breaks when first-class domains need server-side runtimes.

The real model: **vivief is a P2P system of typed nodes.** Browser is one node type, DevAC is another, relay is another. The architecture is the same whether there is one node or a hundred. Phases add node types, not architectural complexity.

### What ADR-0050 Got Wrong or Incomplete

| ADR-0050 Position | Problem |
|-------------------|---------|
| "Existing packages (unchanged)" | DevAC IS a vivief domain — the Code Analysis domain. It can't be "unchanged." |
| wa-sqlite + OPFS as warm tier | D2TS SQLite is intermediate operator state, not datom storage. 2.8–10.3× overhead vs minimal datom store. See [d2ts-operator-state](../datom/d2ts-operator-state.md). |
| iroh-blobs as frozen tier | Separate from MoQ. "Everything is a track" — storage should BE track history. |
| No browser persistence strategy | Closing the tab loses all data. |
| MoQ in Phase 13+ | DevAC needs real-time from day 1. Every domain is a first-class member from start. |
| Browser-first phases (1-12, 13-16, 20+) | Assumes browser is the center. Breaks when domains need server-side runtimes. |
| No C4 mapping | Architecture has no structural mapping tool. |
| Actor systems not specified | How do effectHandlers coordinate across nodes? |

### The C4 "Platform" Question

Vivief as "platform" in C4 terms means: the set of shared concepts (Datom, Projection, Surface, Contract, effectHandler), shared libraries (vivief-* packages), and shared protocols (MoQ over Iroh) that all nodes use. The platform is **domain-agnostic infrastructure** — domains (Code Analysis, Clinical Practice, etc.) plug into it.

**Sources:**
- [vivief-concepts-v6](../vivief-concepts-v6.md) — the five concepts and their requirements
- [node-architecture brainstorm](../../archive/p2p/node-architecture.md) — source analysis for this ADR
- [lean-stack-v2](../p2p/lean-stack-v2.md) — MoQ "everything is a track" insight
- [d2ts-operator-state](../datom/d2ts-operator-state.md) — D2TS SQLite is operator state, not datom storage

---

## Decision

### 1. Guiding Principle: P2P Node Architecture

**Vivief is a P2P system of typed nodes.**

Every participant — browser tab, DevAC CLI, relay server, desktop app — is a **node** with typed capabilities. The architecture is the same whether there is one node or a hundred. Phases add node types, not architectural complexity.

| Capability | Description | Which nodes |
|-----------|-------------|-------------|
| **compute** | D2TS computation, effectHandler execution | All nodes |
| **warm storage** | In-memory datom indexes (EAVT, AEVT) | All nodes |
| **frozen storage** | MoQ WAL on disk (BLAKE3 verified) | Big nodes (relay, desktop) |
| **UI** | Surface rendering (React, XState, Ark UI) | Browser nodes |
| **filesystem** | File access, git, AST parsing | Desktop/server nodes |
| **relay/fan-out** | MoQ track distribution to subscribers | Server nodes |

A browser tab is a small node with UI. A desktop app is a big node with all capabilities. A relay is a server node with fan-out and frozen storage. A DevAC CLI is a medium node with filesystem access and code analysis.

### 2. Language & Dev Runtime

**TypeScript** with strict mode. ESM module system. The structural type system enables Contract enforcement at compile time — interfaces match Contract sub-types, generics enable typed effectHandler signatures.

**Node.js ≥ 24.14.1** (LTS) for dev tooling. Native TypeScript execution via unflagged type stripping — no `tsx` or `tsc` compilation step needed for running scripts, tests, or dev tools. Node.js is the dev tooling runtime, not the sole application runtime (nodes run on different runtimes — browser, Node.js, Rust).

### 3. P2P Networking: Iroh

**[Iroh](https://github.com/n0-computer/iroh)** (n0-computer) for all P2P networking:

- **Rust core** with WASM compilation for browsers (`wasm32-unknown-unknown`)
- **QUIC transport** via quinn — authenticated, encrypted (TLS 1.3), multiplexed
- **Ed25519 identity** — each endpoint identified by a 32-byte NodeId (public key). Each vivief node has a persistent identity.
- **ALPN-based protocol multiplexing** — QUIC standard, no custom protocol layer
- **Relay fallback** — E2E encrypted traffic through relay when NAT traversal fails; relay sees nothing
- **Production-proven** — 500K+ unique nodes/month

| Concern | Iroh |
|---------|------|
| Runtime | Browser-native (WASM) + native Rust |
| Data model | Transport-agnostic — carries whatever we need |
| Protocol multiplexing | QUIC ALPN (standard) |
| Encryption | TLS 1.3 (QUIC standard) + optional Noise |
| Peer discovery | DNS, DHT (pkarr), local network |

**Iroh sub-protocols used by vivief:**

| Protocol | Purpose |
|----------|---------|
| **iroh-blobs** | Content-addressed blob transfer (BLAKE3 tree hash). Verified streaming per 1KB chunk. For large data that doesn't fit the track model (Loro document snapshots, frozen epoch archives). |
| **iroh-gossip** | Epidemic broadcast tree (HyParView + PlumTree hybrid protocol). Available as fallback; primary pub/sub is MoQ. |

### 4. Pub/Sub Protocol: MoQ (Media over QUIC)

**[MoQ](https://github.com/moq-dev/moq)** (Media over QUIC) provides a unified pub/sub model for ALL real-time data flows **from day 1**. Despite the name "Media," the core protocol (moq-lite) is media-agnostic — it's a generic pub/sub for any real-time data delivered as named tracks of ordered groups of frames.

MoQ is not a Phase 13+ addition — it's the transport layer from the start. DevAC needs real-time datom publishing from day 1. Building a throwaway transport and replacing it later wastes effort.

| Vivief concern | MoQ track pattern |
|---------------|-------------------|
| Hot datom sync | `{namespace}/datoms/{topic}` |
| DevAC code graph | `devac/{repo}/nodes`, `devac/{repo}/edges`, `devac/{repo}/effects` |
| DevAC diagnostics | `devac/{repo}/diagnostics` |
| Video conferencing | `{namespace}/{participant}/audio`, `{namespace}/{participant}/video` |
| Loro text collaboration | `{namespace}/notes/{document-id}` |
| Presence/status | `{namespace}/presence` |
| Frozen tier announcements | `{namespace}/frozen/{epoch-id}` |

**Key properties:**

- **Tracks are independent QUIC streams** — no head-of-line blocking between data types
- **MoQ group = datom transaction** — all datoms in a tx are delivered reliably and in-order within a group
- **Groups are independent** — transactions can arrive out-of-order (D2TS handles reordering via frontier)
- **Priority-based congestion** — subscriber-controlled degradation

| Track | Priority | Order | Timeout | Rationale |
|-------|----------|-------|---------|-----------|
| `*/audio` | 100 | ascending | 500ms | Speech must not drop |
| `*/datoms/*` | 90 | ascending | 1000ms | Data integrity > video |
| `*/presence` | 85 | descending | 200ms | Latest state only |
| `*/video` | 50 | descending | 2000ms | Drop old frames, show latest |
| `*/notes/*` | 30 | ascending | 5000ms | Text sync can buffer longer |

Under congestion: audio and datoms stay, video drops frames, text sync delays.

**MoQ + Iroh integration:** The moq-dev crates support iroh as a transport natively. Connection URLs: `iroh://<ENDPOINT_ID>` (P2P via QUIC) or standard WebTransport for browser clients.

**Video conferencing** via MoQ's `hang` format (WebCodecs-based): multiple renditions (quality levels), subscriber chooses based on bandwidth. Hardware-accelerated encoding on native via iroh-live.

### 5. Datom Store: D2TS (Differential Dataflow)

**[D2TS](https://github.com/electric-sql/d2ts)** (ElectricSQL) is the universal datom engine. The fundamental data structure in differential dataflow — the multiset with signed multiplicities — IS the datom model:

```
Differential dataflow triple:  (data,     time, diff)
Vivief datom:                   (e/a/v,    tx,   +1/-1)
```

A datom `assert` is `(data, time, +1)`. A `retract` is `(data, time, -1)`. D2TS natively operates on these triples. No adaptation layer needed.

**D2TS compaction** maps naturally to temperature tiers: consolidation merges multiplicities for identical `(data, time)` pairs. If an assert (+1) and retract (-1) exist for the same datom, they cancel to 0 and are removed.

**Indexes (incremental):**
- **Phase 1:** EAVT (entity → attribute → value → tx) + AEVT (attribute → entity → value → tx)
- **Later:** AVET (value lookup — "find entity by email") + VAET (reverse ref — "all sessions for client X")

D2TS materializes indexes as incremental arrangements. Adding an index later is adding a new pipeline, not a data migration.

### 6. Datom Shape

```typescript
type Datom = {
  e: EntityId;     // ULID — globally unique, coordination-free, time-ordered
  a: Attribute;    // Namespaced: "client/name", "session/date"
  v: DatomValue;   // Primitive | EntityId (ref) | ContainerRef (Loro)
  tx: TxId;        // ULID of producing transaction
  op: 'assert' | 'retract';
};
```

- **ULIDs** for both entity and tx — time-ordered, globally unique, coordination-free. Any peer generates entity IDs offline without collision risk.
- **Provenance as datoms** on the transaction entity, not fields on every individual datom:

```
[session:42  :session/themes   ["sleep","anxiety"]  tx:81  assert]
[tx:81       :tx/source        :ai/text-generation  tx:81  assert]
[tx:81       :tx/trust-score   0.85                 tx:81  assert]
```

- **Schema as datoms** — schema evolution IS Contract evolution. Additive by default. Old datoms always valid.
- **Attribute cardinality** stored as schema datoms (`:db/cardinality` `:db.cardinality/one` or `:db.cardinality/many`).
- **Rich text** as ContainerRef — when `db/valueType` is `"text"`, the datom value is a Loro pointer.

### 7. Storage Tiers

ADR-0050 proposed wa-sqlite + OPFS as the warm tier and iroh-blobs as the frozen tier. This is wrong — D2TS SQLite tables are intermediate operator state (arrangements, compaction frontiers, dirty key tracking), not a datom store. Storage overhead: 2.8–10.3× compared to a minimal datom store. See [d2ts-operator-state](../datom/d2ts-operator-state.md).

**Revised tier model:**

| Tier | What | Where | Persistence | Purpose |
|------|------|-------|-------------|---------|
| **Hot** | D2TS in-memory computation | All nodes | None | Active processing — versions above frontier, no compaction |
| **Warm** | TypeScript Map-based datom indexes | All nodes | None (in-memory) | Fast query — O(1) entity lookup, O(1) attribute scan. Rehydrates from frozen. |
| **Frozen** | MoQ tracks as durable WAL | Big nodes (relay/desktop) | Disk | Authoritative — BLAKE3 per segment, verified streaming, content-addressed |
| **Cache** | IndexedDB snapshot of warm tier | Browser nodes | Browser storage | Convenience — fast reload, not authoritative, may be stale or cleared |

**Warm Tier: TypeScript Map-Based Indexes**

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

**Frozen Tier: MoQ Tracks as Durable WAL**

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

**Browser Persistence: IndexedDB Cache**

- Browser nodes snapshot their warm tier to IndexedDB for fast reload
- Not authoritative — convenience only, may be stale
- On startup: load from IndexedDB (fast) → connect to relay → catch up from frozen WAL if stale
- Graceful degradation: no relay? IndexedDB only. No IndexedDB? Full replay from relay.

### 8. Rich Text CRDT: Loro

**[Loro](https://github.com/loro-dev/loro)** (Rust core → WASM) handles **rich text only** — session notes, treatment plans, and similar documents where concurrent editing may occur.

- **Fugue algorithm** for text (minimizes interleaving anomalies)
- **Synced via dedicated MoQ track** (`{namespace}/notes/{document-id}`)
- **Time travel** via `checkout` to any historical frontier
- ALL structured data goes through the datom/D2TS path, never Loro
- Loro documents referenced by datom: `[entity :content <loro-doc-hash> tx op]`

### 9. Conflict Resolution

Engine-independent, carried forward:

| Data type | Resolution strategy |
|-----------|-------------------|
| `:one` scalar attribute | Last-writer-wins (highest tx ULID) |
| `:many` scalar attribute | OR-Set (assert adds, retract removes; commutative) |
| `:one` ref attribute | Produces `:contract/conflict` datom — human resolution required |
| `:many` ref attribute | OR-Set |
| Rich text attribute | Loro Fugue algorithm |

`:one` ref conflicts are **never** silently resolved by LWW — they produce `:contract/conflict` datoms that enter the creation loop for human review. The risk of silently re-assigning a relationship (e.g., a session pointing to a different client) is too high for a healthcare context.

### 10. UI Framework: React + Vite + TanStack Router

- **React 19** — component model maps to Surface modes. No Server Components (no SSR in this architecture).
- **Vite** — dev server + build tool. HMR for fast development. Single SPA — reactive workspace with persistent data connections.
- **TanStack Router** — type-safe routing, search params encode navigable Projection filters (shareable URLs), loader pattern triggers D2TS subscription setup before render, lazy routes for code splitting.
- **D2TS feeds React directly** via custom hooks — no TanStack DB wrapper layer. The D2TS output stream connects to React state through a thin hook layer.
- Other TanStack packages (Form, Table, Virtual, Hotkeys, Query) adopted as needed during implementation, not committed upfront.

### 11. State Machines: XState v5 (All Surfaces)

XState v5 for **all Surface components**. React is always a pure renderer of actor state snapshots. This is an architectural commitment: domain logic lives in XState actors, React renders their output.

**Three-layer component model:**
```
Data (D2TS subscription) → Logic (XState actor) → View (React component)
```

| Layer | Responsibility | Testable via |
|-------|---------------|-------------|
| **Data** (D2TS) | Reactive datom subscriptions | Unit tests with fixture datoms |
| **Logic** (XState v5 actor) | State transitions, business rules, mutations | Model-based testing from machine definition |
| **View** (React component) | Pure rendering of actor state snapshots | Storybook stories |

**Component tiers:**

| Tier | State machine? | Example |
|------|---------------|---------|
| Surface (top-level mode) | Always | `<CardSurface>`, `<StreamSurface>`, `<DialogSurface>` |
| Feature (complex region) | When ≥3 behavioral states | Session editor, filter panel, onboarding wizard |
| Primitive (UI atom) | Never | Badge, Avatar, Button, Label |

**Behavior Contract = XState machine definition.** The machine definition is both the runtime Contract and the test model generator. Stately Studio provides visual inspection (Visual Triangle).

**Mutations flow through actors:** user action → `actor.send(event)` → actor invokes effectHandler → datom written → D2TS → actor context updated → re-render.

**Actor scope:** Actors are **node-local** — each node runs its own XState actor system. Between nodes, all communication is datom streams via MoQ. There is no distributed actor system, no remote procedure calls, no separate event protocol. D2TS already communicates in datoms internally. MoQ already streams datoms. Adding a separate actor-to-actor protocol across nodes would introduce a second communication primitive for no benefit.

### 12. Headless Components: Ark UI (Zag.js)

**[Ark UI](https://ark-ui.com/)** (built on [Zag.js](https://zagjs.com/) state machines) for headless, accessible UI primitives.

**Two state machine layers, complementary:**

| Layer | Library | Governs |
|-------|---------|---------|
| **Domain behavior** | XState v5 | "Is the session in draft/reviewed/finalized?" "Can the user edit?" |
| **UI interaction** | Zag.js (via Ark UI) | "Is the dropdown open?" "Which item has focus?" |

XState determines WHAT the component shows. Zag.js handles HOW interactive primitives behave.

A thin **vivief design system layer** wraps Ark UI components to add:
- Trust signal rendering (provenance badges on data-bound components)
- Render Contract validation hooks (axe checks tied to component lifecycle)
- Design tokens and theming
- Surface-mode-specific behavior

### 13. Styling: CSS Modules + Custom Properties

- **CSS custom properties** define the design token system — colors, spacing, typography, trust-specific tokens (`--color-trust-high`, `--color-trust-low`, `--color-trust-ai`)
- **CSS Modules** provide component-scoped styles without runtime overhead
- **Dark mode primary, light mode secondary** — both supported via token system from the start
- **Zero runtime overhead** — critical for high-frequency D2TS reactive updates
- No Tailwind (utility classes obscure trust-semantic styles)
- No CSS-in-JS (runtime overhead incompatible with reactive data updates)

### 14. LLM Integration: Custom Vivief Abstraction

A custom LLM abstraction that maps exactly to the effectHandler pattern:

- **Capability categories** (`:ai/text-generation`, `:ai/analysis`, etc.) as provider routing keys — not specific model names
- **Trust scoring per invocation** — every LLM output gets `:tx/trust-score` on its result datoms
- **Streaming support** — `ReadableStream` for Dialog mode in-flight tokens
- **Observability as datoms** — tokens, cost, latency, model stored as regular datoms alongside results, queryable via Projection
- **Provider adapters** (Anthropic, OpenAI) as effectHandlers producing datoms with provenance

Every LLM call is an effectHandler: `(state, intent) => { datoms, intents }`. The effectHandler IS the abstraction. No framework on top.

Browser-direct API calls to CORS-enabled provider endpoints. No server proxy needed for single-user operation. When multi-user, the moq-relay could optionally proxy LLM calls if API key management requires it.

### 15. Build & Quality Tooling

All existing vivief monorepo tooling is preserved and extended:

| Tool | Role | Status |
|------|------|--------|
| **pnpm** | Package manager | Existing — keep |
| **pnpm workspaces** | Monorepo package management | Existing — keep |
| **Turborepo** | Build orchestration, caching | Existing — keep |
| **Biome** | Linting + formatting (single tool) | Existing — keep |
| **Vitest** | Testing (Vite-native) | Existing — keep |
| **Husky + lint-staged** | Git hooks | Existing — keep |
| **Storybook 10+** | Contract verification: `Story = Surface(Projection(fixture-datoms))` | New — add for vivief-surface |
| **axe-core** | WCAG 2.2 AA scanning (Render Contract a11y validation) | Existing (a11y-reference-storybook) — extend |
| **Node.js ≥ 24.14.1** | Dev tooling runtime with native TypeScript execution | Update from ≥ 20.0.0 |

**Testing strategy:**

| Level | What it validates | Concept connection |
|-------|-------------------|--------------------|
| **Unit** | Individual effectHandler functions | Handler with fixture datoms → expected output |
| **Integration** | Handler + Store + Contract pipeline | End-to-end creation loop for a Feature slice |
| **Contract-as-test** | Storybook stories verify Render Contracts | `Story = Surface(Projection(fixture-datoms))` |
| **StateMachine** | XState machine transitions | Behavior Contract StateMachine mode verification |
| **a11y** | axe scanning of rendered Surfaces | Render Contract a11y terms (WCAG 2.2 AA) |

### 16. Package Structure (Concept-Aligned)

New `vivief-*` packages alongside existing `devac-*` / `browser-*` packages:

```
packages/
  # New vivief packages (concept-aligned)
  vivief-datom/       # Datom store engine (D2TS, Map indexes, schema)
  vivief-contract/    # Contract validation runtime (all 6 sub-types)
  vivief-projection/  # Projection query engine + delivery modes
  vivief-surface/     # React Surface components + Ark UI + design system
  vivief-effect/      # effectHandler runtime, actor lifecycle, XState integration
  vivief-llm/         # LLM abstraction, capability categories, trust scoring
  vivief-app/         # Vite app shell, TanStack Router, routes, app config

  # Existing packages (DevAC domain — first-class vivief domain)
  devac-core/         browser-core/       a11y-reference-storybook/
  devac-cli/          browser-cli/        fixtures-*/
  devac-mcp/          browser-mcp/
  devac-eval/
  devac-worktree/
```

**Package dependency graph:**

```
vivief-app
  └─ vivief-surface
       ├─ vivief-projection
       │    └─ vivief-datom
       ├─ vivief-contract
       └─ vivief-effect
            ├─ vivief-datom
            ├─ vivief-contract
            └─ vivief-projection

vivief-llm
  ├─ vivief-effect
  └─ vivief-datom
```

Each package maps to one or more of the five concepts:

| Package | Concept(s) |
|---------|-----------|
| vivief-datom | Datom |
| vivief-contract | Contract |
| vivief-projection | Projection |
| vivief-surface | Surface |
| vivief-effect | effectHandler |
| vivief-llm | effectHandler (LLM implementation strategy) |
| vivief-app | Composition of all five |

### 17. Node Types & C4 Mapping

#### System Context (C4 Level 1)

Vivief is the system. Users interact with it. It connects to external services.

```
[Practitioner] ──▶ [Vivief Platform]
[Developer]    ──▶ [Vivief Platform]

[Vivief Platform] ──▶ [LLM APIs] (Anthropic, OpenAI)
                  ──▶ [Git Forges] (GitHub)
                  ──▶ [Code Repositories]
                  ──▶ [Iroh Relay Network]
```

#### Container Diagram (C4 Level 2) = Node Types

Each container is a node type. Nodes are running processes with typed capabilities.

| Node Type | Size | Capabilities | Runtime | Example |
|-----------|------|-------------|---------|---------|
| **Browser Node** | Small | UI + compute + warm + IndexedDB cache | Browser (WebTransport) | vivief-app tab |
| **DevAC Node** | Medium | Filesystem + compute + code analysis | Node.js (MoQ publisher) | devac CLI/MCP on dev machine |
| **Relay Node** | Server | Fan-out + frozen WAL + MoQ persistence | Rust binary (moq-relay) | Self-hosted relay for practice |
| **Desktop Node** | Big | All tiers + Iroh P2P + holepunching | Tauri + Rust sidecar | Offline-first desktop app |

#### Component Diagram (C4 Level 3) = Actors per Node

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

#### Layer Stack

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

**Iroh** provides: QUIC connections (browser→relay via WebTransport, desktop→desktop via holepunching), Ed25519 identity (NodeId), relay fallback with E2E encryption, ALPN-based protocol multiplexing.

**MoQ** provides: pub/sub semantics (tracks, groups, objects), priority-based congestion, WAL persistence (frozen tier IS persisted track history).

### 18. Deployment: Node-Capability Phases

Replaces ADR-0050's browser-first phases (1-12, 13-16, 20+). The architecture is stable across all phases — only the set of active node types grows.

| Phase | Name | Nodes | Features |
|-------|------|-------|----------|
| **1** | Foundation | Browser + local relay | Single-user vivief-app. D2TS, Surfaces, Contracts, XState. IndexedDB cache + relay frozen WAL. Core concepts validated. |
| **2** | Code Analysis | + DevAC node | Live C4 diagrams, diagnostics boards, code graph exploration. DevAC publishes MoQ tracks. Browser subscribes and renders Surfaces. |
| **3** | Multi-User | + remote relay | Counselor↔client communication. Multiple browser nodes via relay. Loro for shared rich text (session notes). Presence, datom sync. |
| **4** | Desktop / Full P2P | + Tauri desktop | Offline-first operation. Iroh direct connections (holepunching). Full frozen tier on local disk. All capabilities in one node. |

**Key difference from ADR-0050:** The phase model is additive, not transformative. Phase 1's architecture is the same as Phase 4's — Phase 4 just has more node types active. No "browser-only then add server then add P2P" transformation. It's always P2P, always MoQ, always the same datom-based communication.

### 19. Datoms as Universal Primitive

The most elegant aspect of this architecture: **datoms are the universal primitive** for storage, computation, and communication. There is no separate message format, no separate storage format. Everything is `[Entity, Attribute, Value, Tx, Op]`.

| Use | How datoms flow |
|-----|-----------------|
| **Storage** | Warm tier (Map indexes) and frozen tier (MoQ WAL) store datoms |
| **Communication** | MoQ tracks carry datoms between nodes |
| **Computation** | D2TS processes datom streams (assert=+1, retract=-1 multiset) |
| **Actor output** | effectHandlers produce datoms as their output |
| **Cross-node exchange** | Nodes publish/subscribe to datom tracks, not actor events |
| **Provenance** | Every transaction has provenance datoms (`:tx/source`, `:tx/trust-score`) |

**Cross-node communication diagram:**

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

### 20. DevAC as Code Analysis Domain

DevAC is a vivief domain — the **Code Analysis domain**. It's a node type (DevAC Node) that publishes datom tracks.

DevAC already implements proto-versions of every vivief concept:

| V6 Concept | DevAC Equivalent | Migration |
|-----------|------------------|-----------|
| **Datom** | Seeds (Parquet rows: nodes, edges, effects) | Emit datoms at MoQ boundary |
| **Projection** | MCP query tools (query_symbol, query_deps, etc.) | Wrap as vivief-projection |
| **Surface** | CLI output, MCP tool responses | Render as vivief Surfaces in vivief-app |
| **Contract** | Validators (tsc, eslint, tests, wcag), rules engine | Wrap as vivief-contract instances |
| **effectHandler** | Extractors, validators, analysis pipeline | Already IS the pattern |

**Runtime:** DevAC stays on **Node.js** — it needs filesystem access (reading code files, `.git`, AST parsing with tree-sitter/ts-morph). Node.js is the right runtime for a tool that operates on local code.

**Storage: DuckDB Inside, Datoms Outside.** DevAC keeps **DuckDB + Parquet** internally — it works well for batch code analysis (columnar queries, SQL, fast aggregation). At the MoQ publishing boundary, seed rows are translated to datoms:

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
```

**Transport: MoQ Tracks from Day 1.** DevAC publishes its data as MoQ tracks:

| Track | Content |
|-------|---------|
| `devac/{repo}/nodes` | Code graph nodes (functions, classes, etc.) |
| `devac/{repo}/edges` | Relationships (CALLS, IMPORTS, EXTENDS, etc.) |
| `devac/{repo}/effects` | Extracted effects (FunctionCall, Store, Send, etc.) |
| `devac/{repo}/diagnostics` | Validation results (tsc, eslint, tests, wcag) |
| `devac/{repo}/c4` | C4 architecture data (systems, containers, components) |

**Progressive Migration** — DevAC adopts vivief concepts in this order:

1. **Contract first** — smallest conceptual leap. DevAC's validators already ARE constraint enforcement.
2. **Datom boundary** — add datom translation to MoQ publishing. DevAC internals unchanged.
3. **Projection** — wrap MCP query tools as vivief-projection instances.
4. **Surface** — C4 diagrams, diagnostics boards, dependency graphs as vivief Surfaces in vivief-app.

**End-state aspiration:** Hub becomes a vivief-datom store (DuckDB → D2TS migration). Not near-term.

**C4 Diagram as Live Surface (proof of concept direction):** The live C4 diagram is a Diagram-mode Surface in vivief-app, consuming DevAC datoms via a live Projection. This is THE proof that DevAC is a vivief domain — its data renders through vivief Surfaces.

```
DevAC Node → datoms → MoQ → Relay → MoQ → Browser Node
  → D2TS processes datoms
  → Projection filters to code graph
  → DiagramSurface renders C4 diagram
  → React updates incrementally on change
```

**Browser packages** (browser-core, browser-cli, browser-mcp) are **DevAC domain tooling** — they enable accessibility scanning, runtime behavior observation, LLM understanding of how code behaves at runtime, and testing vivief-app itself (DevAC analyzes vivief).

---

## What Changes from ADR-0050

| ADR-0050 | This ADR | Why |
|----------|---------|-----|
| Browser-first, lean stack | P2P node architecture | DevAC integration proves browser-first is incomplete |
| wa-sqlite + OPFS (warm) | TypeScript Map indexes (warm) | D2TS SQLite is operator state, not datom storage (2.8–10.3× overhead) |
| iroh-blobs (frozen) | MoQ tracks as durable WAL (frozen) | "Everything is a track" — one primitive for persistence + communication |
| No browser persistence | IndexedDB cache (convenience, not authoritative) | Fast reload + graceful degradation |
| MoQ in Phase 13+ | MoQ from start | Every domain is first-class from day 1 |
| "Existing packages unchanged" | DevAC as vivief domain with progressive migration | DevAC IS a vivief domain |
| Phase 1-12, 13-16, 20+ | Node-capability phases 1-4 | Architecture stable; phases add node types, not complexity |
| No C4 mapping | C4: System → Containers (Nodes) → Components (Actors) | Natural structural mapping for P2P architecture |
| Actor systems not specified | Node-local XState actors; datom streams between nodes | Datoms are the universal primitive |

## What Carries Forward Unchanged

| Decision | Why unchanged |
|----------|--------------|
| Iroh for P2P transport | Still the right transport layer |
| MoQ for pub/sub | Unified protocol — now from start, not Phase 13+ |
| D2TS for datom computation | Multiset model = datom model |
| Datom shape (ULID, namespaced attrs, provenance-as-datoms) | Engine-independent |
| Conflict resolution (LWW / OR-Set / manual-merge / Loro) | Data-model-level |
| Loro for rich text only | Scoped role unchanged |
| React 19 + Vite + TanStack Router | Still the right UI choice |
| XState v5 for all Surfaces | Pure rendering commitment |
| Ark UI (Zag.js) | Headless a11y components |
| CSS Modules + Custom Properties | Zero-runtime styling |
| Custom LLM abstraction (effectHandler-based) | Exact alignment with the pattern |
| TypeScript strict ESM, Node.js ≥ 24.14.1 | Language and dev runtime orthogonal |
| pnpm + Turborepo + Biome + Vitest + Husky | Already in use |
| Storybook 10+ for Contract verification | New in 0050, still correct |
| WCAG 2.2 AA baseline | Render Contract a11y requirement |
| Tauri for desktop shell (Phase 4) | Clean, lightweight |
| Concept-aligned packages | Architecture mirrors the concepts |

---

## Consequences

### Positive

- **One architectural model.** P2P nodes from day 1. No phased transformation from browser-only → browser+server → browser+P2P. Architecture is stable; only node types grow.
- **DevAC integration.** The first vivief domain runs as a DevAC Node from Phase 2. No "existing packages unchanged" hand-waving — progressive migration path is explicit.
- **Universal datom primitive.** Storage, computation, and communication all use the same `[E, A, V, Tx, Op]` shape. No impedance mismatch.
- **Correct storage tiers.** Map-based warm tier avoids the 2.8–10.3× overhead of wa-sqlite. IndexedDB cache provides browser persistence that ADR-0050 lacked.
- **MoQ from start.** No throwaway transport code. DevAC's real-time needs are met from day 1.
- **C4 mapping.** Architecture has a structural tool — System → Containers (Nodes) → Components (Actors). Natural fit for P2P.
- **Unified real-time protocol.** MoQ handles datoms, video, text sync, and presence with one congestion strategy and one relay infrastructure.
- **IETF-backed protocols.** QUIC and MoQ are standards-track.
- **Native TypeScript in Node.js 24.** No compilation step for dev tooling.

### Negative

- **D2TS maturity.** Relatively young TypeScript implementation. Fallback: Rust `differential-dataflow` crate via WASM for the hot path.
- **MoQ is an IETF draft** (not final). The moq-lite forward-compatible subset mitigates wire-format churn.
- **Browser-only networking is relay-only.** Iroh WASM in browser cannot do direct UDP holepunching (browser sandbox). All browser connections go through relay. Acceptable — relay is E2E encrypted.
- **No background processing when browser tab is closed.** Acceptable for Phases 1-3. Tauri sidecar resolves this in Phase 4.
- **Custom LLM abstraction is upfront work.** Worth it for exact alignment with the effectHandler pattern.
- **moq-relay introduces a server dependency.** Minimal — single Rust binary, self-hosted. Required from Phase 1 (local relay).
- **Fine-grained packages add monorepo overhead.** Worth it for architectural clarity. Turborepo caching mitigates build-time cost.

### Neutral

- **IndexedDB as cache, not authority.** Browser data is always rehydratable from the frozen WAL. Acceptable for a practitioner tool.
- **Storybook 10+** requires evaluation against current a11y-reference-storybook setup.
- **Video conferencing (MoQ hang)** is available in Phase 3 but implementation can be progressive within that phase.

---

## Spikes Required

| Spike | When | What it unblocks |
|-------|------|-----------------|
| D2TS performance with 500K+ datoms in browser | Pre-Phase 1 | Warm tier viability; determines if in-browser D2TS is sufficient |
| D2TS → Map index materialization | Pre-Phase 1 | How D2TS output feeds TypeScript Map-based EAVT/AEVT indexes |
| MoQ TypeScript client (`@moq/lite`) maturity | Pre-Phase 1 | Multi-user and DevAC real-time communication |
| MoQ WAL persistence format | Pre-Phase 1 | How MoQ tracks are persisted to disk on relay/desktop nodes |
| IndexedDB warm snapshot format | Pre-Phase 1 | Serialization format for warm tier snapshot in browser |
| Local relay packaging | Pre-Phase 1 | How moq-relay is distributed to developers (npm-wrapped Rust binary?) |
| Iroh WASM vs WebTransport in browser | Pre-Phase 1 | Browser → relay connection strategy |
| Storybook 10 compatibility with Vite + React 19 | Pre-Phase 1 | Surface component testing and Contract verification |
| DevAC datom boundary translation | Pre-Phase 2 | Exact mapping from seed schema to datom tuples |
| DevAC multi-user hub evolution | Future | Timeline for DuckDB → vivief-datom store migration |

---

## Concept → Technology Mapping

| Concept | What it needs | Technology |
|---------|--------------|----|
| **Datom** | Append-only store with tuple structure, provenance, schema-as-data, replay | D2TS (multiset engine) + Map indexes (warm) + MoQ WAL (frozen) + IndexedDB (cache) |
| **Projection** | Query engine (filter/sort/group/depth), subscription (live delivery), trust filtering | D2TS incremental arrangements (EAVT/AEVT/AVET/VAET), MoQ track subscription |
| **Surface** | 6 render mode components, streaming support, a11y validation, trust signal rendering | React 19 + Ark UI + CSS Modules + Storybook 10+ + axe |
| **Contract** | Validation runtime (pre-commit/in-flight/post-commit), state machine engine, enforcement | XState v5 (StateMachine mode) + vivief-contract (validation runtime) |
| **effectHandler** | Execution runtime (sync + async), actor lifecycle, implementation strategies | XState v5 actors + vivief-effect + vivief-llm (LLM strategy) |

**Cross-cutting:**

| Need | Technology |
|------|-----------|
| Serialization | ULID, deterministic binary format for frozen tier |
| Event bus / effect routing | XState actor `send()` + D2TS output streams |
| Content-addressed hashing | BLAKE3 (iroh-blobs, frozen tier segments) |
| Rich text collaboration | Loro (Fugue algorithm, WASM) |
| Real-time pub/sub | MoQ (moq-lite, QUIC ALPN) — from start |
| P2P connectivity | Iroh (QUIC, Ed25519, relay fallback) |
| C4 architecture mapping | System → Containers (Nodes) → Components (Actors) |

---

## References

- [vivief-concepts-v6](../vivief-concepts-v6.md) — The five concepts
- [node-architecture brainstorm](../../archive/p2p/node-architecture.md) — Source analysis for this ADR
- [lean-stack-v2](../p2p/lean-stack-v2.md) — MoQ "everything is a track" insight
- [lean-stack-v1](../../archive/p2p/vivief-p2p-lean-stack-adr.md) — Original lean stack (Iroh + D2TS + Loro)
- [d2ts-operator-state](../datom/d2ts-operator-state.md) — D2TS SQLite is operator state, not datom storage
- [datom architecture](../datom/architecture.md) — DatomStore implementation and migration path
- [Reactive Subscription vs NATS gap analysis](../../archive/counseling/concepts-vs-nats.md) — Evidence: 2/10 NATS capabilities are reactive subscription; remaining 8 handled by Iroh+MoQ+datom model
- [ADR-0050](0050-tech-stack.md) — Previous tech stack decision (superseded)
- [D2TS](https://github.com/electric-sql/d2ts) — Differential dataflow for TypeScript
- [Iroh](https://github.com/n0-computer/iroh) — P2P QUIC networking
- [MoQ](https://github.com/moq-dev/moq) — Media over QUIC pub/sub
- [Loro](https://github.com/loro-dev/loro) — Rich text CRDT
- [XState v5](https://stately.ai/docs/xstate-v5) — State machines and actors
- [Ark UI](https://ark-ui.com/) — Headless components (Zag.js)
- [TanStack Router](https://tanstack.com/router) — Type-safe routing
- [Storybook](https://storybook.js.org/) — Component stories and a11y testing
- [axe-core](https://github.com/dequelabs/axe-core) — WCAG accessibility scanning
- [Tauri v2](https://v2.tauri.app/) — Desktop/mobile framework
