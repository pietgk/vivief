# ADR-0050: Vivief Tech Stack

## Status

Proposed

Supersedes: [ADR-0046](0046-runtime-and-language.md), [ADR-0047](0047-datom-store-sync.md), [ADR-0048](0048-ui-framework.md), [ADR-0049](0049-deployment-architecture.md)

## Context

ADRs 0046–0049 made sequential decisions that corrected each other, producing an incoherent stack:

- **ADR-0046** chose Deno for security permissions and no-build-step TypeScript
- **ADR-0047** chose Holepunch (Hypercore 11 + RocksDB) for the datom store — creating a Deno/native-addon tension
- **ADR-0049** superseded Deno back to Node.js to resolve the tension, and replaced Pear with Tauri
- **ADR-0048** committed to 8 TanStack packages, Pear/Electron, and a three-runtime architecture (Node.js + Bare + Browser)

The result: three runtimes, heavy Holepunch coupling, a Node.js sidecar, and technology choices driven by cascading constraints rather than a coherent vision.

**The lean stack brainstorms** ([v1](../vision/brainstorms/vivief-p2p-lean-stack-adr.md), [v2](../vision/brainstorms/vivief-p2p-lean-stack-adr-v2.md)) revealed a fundamentally cleaner architecture. The key insight: **Hypercore's append-only log is the wrong abstraction for datoms** — datoms are a multiset with retractions (`assert` = +1, `retract` = -1), which maps directly to differential dataflow. D2TS consolidation is the right primitive, not Hypercore append.

This ADR starts from the complete picture and makes all tech stack decisions coherently in one document.

**Sources:**
- `vivief-concepts-v6.md` — the five concepts and their requirements
- `vivief-concepts-v6-implementation-kb.md` §2 — technology decision framework
- `vivief-p2p-lean-stack-adr.md` / `vivief-p2p-lean-stack-adr-v2.md` — lean stack architecture
- `datom-data-world-v0.7.md` — datom-as-CRDT insight, temperature tiers

---

## Decision

### 1. Guiding Principle: Browser-First, Lean Stack

All application logic runs in the browser. Complexity is introduced progressively — no server for single-user phases, a relay for multi-user, a native sidecar for P2P.

| Phase | What runs | Where |
|-------|-----------|-------|
| **1–12** | D2TS, XState, effectHandlers, Contract validation, LLM calls, React UI | Browser (single user) |
| **13–16** | Same + moq-relay for multi-user (counselor↔client) | Browser + moq-relay server |
| **20+** | Same + Iroh endpoint, P2P holepunching | Browser + Rust sidecar (Tauri) |
| **Dev tooling** | Vite, Turborepo, Biome, Vitest | Node.js ≥ 24.14.1 |

### 2. Language & Dev Runtime

**TypeScript** with strict mode. ESM module system. The structural type system enables Contract enforcement at compile time — interfaces match Contract sub-types, generics enable typed effectHandler signatures.

**Node.js ≥ 24.14.1** (LTS) for dev tooling. Native TypeScript execution via unflagged type stripping — no `tsx` or `tsc` compilation step needed for running scripts, tests, or dev tools. Node.js is the dev tooling runtime, not the application runtime.

Update `engines.node` in root `package.json` from `">=20.0.0"` to `">=24.14.1"`.

### 3. P2P Networking: Iroh

**Drop Holepunch entirely:** Hypercore, Hyperbee, Hyperswarm, Protomux, Bare, Corestore, HyperDHT, dht-relay.

**Replace with [Iroh](https://github.com/n0-computer/iroh)** (n0-computer):

- **Rust core** with WASM compilation for browsers (`wasm32-unknown-unknown`)
- **QUIC transport** via quinn — authenticated, encrypted (TLS 1.3), multiplexed
- **Ed25519 identity** — each endpoint identified by a 32-byte NodeId (public key)
- **ALPN-based protocol multiplexing** — replaces Protomux with the QUIC standard
- **Relay fallback** — E2E encrypted traffic through relay when NAT traversal fails; relay sees nothing
- **Production-proven** — 500K+ unique nodes/month, used by Nous Research for decentralized LLM training

**Why Iroh over Holepunch:**

| Concern | Holepunch | Iroh |
|---------|-----------|------|
| Runtime | Node.js or Bare (~40 MB custom runtime) | Browser-native (WASM) + native Rust |
| Data model | Append-only log (wrong for datom multiset) | Transport-agnostic — carries whatever we need |
| Protocol multiplexing | Protomux (custom) | QUIC ALPN (standard) |
| Encryption | Noise (built-in) | TLS 1.3 (QUIC standard) + optional Noise |
| Peer discovery | HyperDHT (custom) | DNS, DHT (pkarr), local network |
| Maturity | Hypercore 11 uses discontinued RocksDB bindings | Active development, 1.0 roadmap committed |

**Iroh sub-protocols used by vivief:**

| Protocol | Purpose |
|----------|---------|
| **iroh-blobs** | Content-addressed blob transfer (BLAKE3 tree hash). Verified streaming per 1KB chunk. Frozen tier storage. |
| **iroh-gossip** | Epidemic broadcast tree (HyParView + PlumTree). Available as fallback; primary pub/sub is MoQ. |

### 4. Pub/Sub Protocol: MoQ (Media over QUIC)

**[MoQ](https://github.com/moq-dev/moq)** (Media over QUIC) provides a unified pub/sub model for ALL real-time data flows. Despite the name "Media," the core protocol (moq-lite) is media-agnostic — it's a generic pub/sub for any real-time data delivered as named tracks of ordered groups of frames.

| Vivief concern | MoQ track pattern |
|---------------|-------------------|
| Hot datom sync | `{practice}/datoms/{namespace}` |
| Video conferencing | `{practice}/{participant}/audio`, `{practice}/{participant}/video` |
| Loro text collaboration | `{practice}/notes/{document-id}` |
| Presence/status | `{practice}/presence` |
| Frozen tier announcements | `{practice}/frozen/{epoch-id}` |

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

Under congestion: audio and datoms stay, video drops frames, text sync delays. Exactly the right degradation for practice management with embedded meetings.

**MoQ + Iroh integration:** The moq-dev crates support iroh as a transport natively. Connection URLs: `iroh://<ENDPOINT_ID>` (P2P via QUIC) or standard WebTransport for browser clients.

**Phase 13–16:** A self-hosted moq-relay enables counselor↔client communication. Both parties connect from browser via WebTransport. The relay caches and fans out content without understanding payload. No P2P holepunching needed — relay handles everything.

**Video conferencing** via MoQ's `hang` format (WebCodecs-based): available when MoQ is introduced in Phase 13–16. Multiple renditions (quality levels), subscriber chooses based on bandwidth. Hardware-accelerated encoding on native via iroh-live.

### 5. Datom Store: D2TS (Differential Dataflow)

**[D2TS](https://github.com/electric-sql/d2ts)** (ElectricSQL) is the universal datom engine. The fundamental data structure in differential dataflow — the multiset with signed multiplicities — IS the datom model:

```
Differential dataflow triple:  (data,     time, diff)
Vivief datom:                   (e/a/v,    tx,   +1/-1)
```

A datom `assert` is `(data, time, +1)`. A `retract` is `(data, time, -1)`. D2TS natively operates on these triples. No adaptation layer needed.

**Three temperature tiers:**

| Tier | D2TS concept | Storage | Behavior |
|------|-------------|---------|----------|
| **Hot** | Versions above the frontier | In-memory | Actively receiving via MoQ. No compaction possible. |
| **Warm** | Consolidated, queryable | SQLite (wa-sqlite + OPFS) | Closed versions, individual datoms distinguishable. |
| **Frozen** | Fully compacted | iroh-blob (BLAKE3) | Net state only. Assert+retract pairs cancel. |

**D2TS compaction** maps naturally to the tiers: consolidation merges multiplicities for identical `(data, time)` pairs. If an assert (+1) and retract (-1) exist for the same datom, they cancel to 0 and are removed. The frozen tier IS full compaction — only the net truth survives.

**Indexes (incremental):**
- **Phase 1:** EAVT (entity → attribute → value → tx) + AEVT (attribute → entity → value → tx)
- **Later:** AVET (value lookup — "find entity by email") + VAET (reverse ref — "all sessions for client X")

D2TS materializes indexes as incremental arrangements. Adding an index later is adding a new pipeline, not a data migration.

**SQLite persistence:** D2TS operators have SQLite-backed variants (`consolidateSQLite()`, `joinSQLite()`, `reduceSQLite()`) for larger-than-memory datasets and warm tier durability.

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

### 7. Browser-Local Storage: wa-sqlite + OPFS

SQLite in the browser via [wa-sqlite](https://rhashimoto.github.io/wa-sqlite/) with **OPFS (Origin Private File System)** backend. D2TS SQLite-backed operators persist the warm tier to OPFS. Data survives page reloads and browser restarts.

This is the standard approach for durable browser-local SQLite — used by ElectricSQL, Notion, and others. OPFS is supported in Chrome, Edge, Firefox, and Safari.

### 8. Frozen Tier Verification: iroh-blobs + BLAKE3

**Start with Option A** (snapshot-as-blob):

1. D2TS compacts warm tier → produces consolidated datom set
2. Serialize consolidated datoms to deterministic binary format (sorted by `[entity, attribute, value]`)
3. Store as iroh-blob → BLAKE3 root hash = frozen tier identifier
4. Verified streaming: each 1KB chunk integrity-checked during transfer

The BLAKE3 hash of the frozen snapshot proves content integrity. Any modification changes the hash. Peers can independently produce the same hash from the same datom set if they agree on the serialization format.

**Upgrade path to Option B** (segmented Merkle via HashSeq) when data grows or range proofs are needed — each segment is an independently verifiable iroh-blob, linked by a HashSeq root. Analogous to Hypercore's Merkle tree but built on standard BLAKE3 + iroh-blob primitives.

### 9. Rich Text CRDT: Loro

**[Loro](https://github.com/loro-dev/loro)** (Rust core → WASM) handles **rich text only** — session notes, treatment plans, and similar documents where concurrent editing may occur.

- **Fugue algorithm** for text (minimizes interleaving anomalies)
- **Synced via dedicated MoQ track** (`{practice}/notes/{document-id}`)
- **Time travel** via `checkout` to any historical frontier
- ALL structured data goes through the datom/D2TS path, never Loro
- Loro documents referenced by datom: `[entity :content <loro-doc-hash> tx op]`

### 10. Conflict Resolution

Carried forward from ADR-0047, engine-independent:

| Data type | Resolution strategy |
|-----------|-------------------|
| `:one` scalar attribute | Last-writer-wins (highest tx ULID) |
| `:many` scalar attribute | OR-Set (assert adds, retract removes; commutative) |
| `:one` ref attribute | Produces `:contract/conflict` datom — human resolution required |
| `:many` ref attribute | OR-Set |
| Rich text attribute | Loro Fugue algorithm |

`:one` ref conflicts are **never** silently resolved by LWW — they produce `:contract/conflict` datoms that enter the creation loop for human review. The risk of silently re-assigning a relationship (e.g., a session pointing to a different client) is too high for a healthcare context.

### 11. UI Framework: React + Vite + TanStack Router

- **React 19** — component model maps to Surface modes. No Server Components (no SSR in this architecture).
- **Vite** — dev server + build tool. HMR for fast development. Single SPA — reactive workspace with persistent data connections.
- **TanStack Router** — type-safe routing, search params encode navigable Projection filters (shareable URLs), loader pattern triggers D2TS subscription setup before render, lazy routes for code splitting.
- **D2TS feeds React directly** via custom hooks — no TanStack DB wrapper layer. The D2TS output stream connects to React state through a thin hook layer.
- Other TanStack packages (Form, Table, Virtual, Hotkeys, Query) adopted as needed during implementation, not committed upfront.

### 12. State Machines: XState v5 (All Surfaces)

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

### 13. Headless Components: Ark UI (Zag.js)

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

### 14. Styling: CSS Modules + Custom Properties

- **CSS custom properties** define the design token system — colors, spacing, typography, trust-specific tokens (`--color-trust-high`, `--color-trust-low`, `--color-trust-ai`)
- **CSS Modules** provide component-scoped styles without runtime overhead
- **Dark mode primary, light mode secondary** — both supported via token system from the start
- **Zero runtime overhead** — critical for high-frequency D2TS reactive updates
- No Tailwind (utility classes obscure trust-semantic styles)
- No CSS-in-JS (runtime overhead incompatible with reactive data updates)

### 15. LLM Integration: Custom Vivief Abstraction

A custom LLM abstraction that maps exactly to the effectHandler pattern:

- **Capability categories** (`:ai/text-generation`, `:ai/analysis`, etc.) as provider routing keys — not specific model names
- **Trust scoring per invocation** — every LLM output gets `:tx/trust-score` on its result datoms
- **Streaming support** — `ReadableStream` for Dialog mode in-flight tokens
- **Observability as datoms** — tokens, cost, latency, model stored as regular datoms alongside results, queryable via Projection
- **Provider adapters** (Anthropic, OpenAI) as effectHandlers producing datoms with provenance

Every LLM call is an effectHandler: `(state, effect) => { datoms, effects }`. The effectHandler IS the abstraction. No framework on top.

Browser-direct API calls to CORS-enabled provider endpoints. No server proxy needed for Phase 1–12. In Phase 13–16, the moq-relay could optionally proxy LLM calls if API key management requires it.

### 16. Build & Quality Tooling

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

### 17. Package Structure (Concept-Aligned)

New `vivief-*` packages alongside existing `devac-*` / `browser-*` packages:

```
packages/
  # New vivief packages (concept-aligned)
  vivief-datom/       # Datom store engine (D2TS, wa-sqlite, indexes, schema)
  vivief-contract/    # Contract validation runtime (all 6 sub-types)
  vivief-projection/  # Projection query engine + delivery modes
  vivief-surface/     # React Surface components + Ark UI + design system
  vivief-effect/      # effectHandler runtime, actor lifecycle, XState integration
  vivief-llm/         # LLM abstraction, capability categories, trust scoring
  vivief-app/         # Vite app shell, TanStack Router, routes, app config

  # Existing packages (unchanged)
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

### 18. Deployment Architecture

**Phase 1–12: Pure browser SPA (single user)**

```
Browser
├── Vite-built React SPA
├── D2TS engine (datom processing, indexes)
├── wa-sqlite + OPFS (warm tier persistence)
├── XState actors (domain logic)
├── effectHandlers (validation, transformation)
├── LLM calls (direct to provider APIs)
└── No server. No sidecar. Zero infrastructure.
```

**Phase 13–16: Browser + moq-relay (multi-user)**

```
Browser (Counselor)                    Browser (Client)
├── Same React SPA                     ├── Same React SPA
├── MoQ session (WebTransport)         ├── MoQ session (WebTransport)
│   ├── datoms/* tracks (pub+sub)      │   ├── datoms/* tracks (pub+sub)
│   ├── notes/* tracks (Loro sync)     │   ├── notes/* tracks (Loro sync)
│   ├── audio track (publish)          │   ├── presence (pub+sub)
│   ├── video track (publish)          │   └── ... (subscribes to counselor tracks)
│   └── presence (pub+sub)             │
└── wa-sqlite + OPFS                   └── wa-sqlite + OPFS

                    moq-relay (self-hosted)
                    ├── --iroh-enabled
                    ├── Caches and fans out tracks
                    ├── Doesn't inspect content
                    └── Minimal: single Rust binary
```

**Phase 20+: Tauri desktop + Rust sidecar (P2P)**

```
Tauri application
├── System webview (WebKit/WebView2/WebKitGTK)
│   └── Same React SPA (zero code changes)
└── Rust sidecar (managed by Tauri lifecycle)
    ├── Iroh endpoint (QUIC, holepunching, relay fallback)
    ├── Embedded MoQ relay
    ├── iroh-blobs (frozen tier, verified storage)
    └── E2E encryption (Iroh connections are E2E by default)
```

---

## What This ADR Drops (vs ADRs 0046–0049)

| Dropped | Was in | Why |
|---------|--------|-----|
| **Holepunch** (Hypercore, Hyperswarm, Protomux, Bare, Corestore, HyperDHT, dht-relay) | 0047, 0049 | Wrong abstraction for datom multiset. D2TS + Iroh is cleaner. |
| **Deno** | 0046 | Browser-first eliminates the server runtime question |
| **Node.js as application runtime** | 0049 | Browser-first; Node.js 24 LTS only for dev tooling |
| **Pear / Electron** | 0048, 0049 | Tauri when needed (Phase 20+), no bundled Chromium |
| **TanStack DB** | 0048 | D2TS feeds React directly via hooks; no wrapper needed |
| **TanStack Query, Form, Table, Virtual, Hotkeys** (as upfront decisions) | 0048 | Adopt as needed during implementation |
| **DuckDB** | 0047 | Was server-side analytics; browser-first has no server |
| **Hyperbee cold tier** | 0047 | Replaced by D2TS compaction + iroh-blobs |
| **Three-runtime complexity** (Node.js + Bare + Browser) | 0049 | Down to one (browser), later two (browser + Rust) |

## What Carries Forward Unchanged

| Decision | Source | Why unchanged |
|----------|--------|--------------|
| TypeScript (strict, ESM) | 0046 | Language is orthogonal to runtime |
| Datom shape (ULID, namespaced attrs, provenance-as-datoms) | 0047 | Engine-independent |
| Conflict resolution (LWW / OR-Set / manual-merge / Loro) | 0047 | Data-model-level, not engine-level |
| Loro for rich text only | 0047 | Scoped role unchanged |
| React + Vite | 0048 | Still the right UI choice |
| XState v5 for all surfaces | 0048 | Architectural commitment to pure rendering |
| Ark UI (Zag.js) | 0048 | Headless a11y components |
| CSS Modules + Custom Properties | 0048 | Zero-runtime styling |
| WCAG 2.2 AA baseline | 0048 | Render Contract a11y requirement |
| Tauri for desktop shell (Phase 20+) | 0049 | Clean, lightweight, no Electron |
| pnpm + Turborepo | existing | Already in use in vivief repo |
| Biome + Vitest + Husky | existing | Already in use in vivief repo |

---

## Consequences

### Positive

- **Progressive complexity.** One runtime (browser) for Phases 1–12. Relay added for 13–16. Rust sidecar for 20+. Each phase adds only what's needed.
- **Zero infrastructure for Phase 1.** Pure browser app. Validate the datom model, Contracts, Projections, and Surfaces with no deployment.
- **No impedance mismatch.** D2TS multiset model IS the datom model. `assert` = +1, `retract` = -1. No translation layer, no adaptation code.
- **Unified real-time protocol.** MoQ handles datoms, video, text sync, and presence with one congestion strategy and one relay infrastructure.
- **Architecture mirrors the concepts.** Seven packages map to the five concepts. The code structure IS the conceptual structure.
- **IETF-backed protocols.** QUIC and MoQ are standards-track. Long-term viability and ecosystem growth.
- **Counselor↔client communication in Phase 13–16.** moq-relay enables the core use case without waiting for full P2P.
- **Native TypeScript in Node.js 24.** No compilation step for dev tooling scripts.

### Negative

- **D2TS maturity.** Relatively young TypeScript implementation. Fallback: Rust `differential-dataflow` crate via WASM for the hot path, with D2TS as the lightweight query layer.
- **MoQ is an IETF draft** (not final). The moq-lite forward-compatible subset mitigates wire-format churn.
- **Browser-only networking is relay-only.** Iroh WASM in browser cannot do direct UDP holepunching (browser sandbox). All browser connections go through relay. Acceptable — relay is E2E encrypted.
- **No background processing when browser tab is closed.** Acceptable for Phase 1–16. Tauri sidecar resolves this in Phase 20+.
- **Custom LLM abstraction is upfront work.** Worth it for exact alignment with the effectHandler pattern and datom-native observability.
- **moq-relay introduces a server dependency in Phase 13–16.** Minimal — single Rust binary, self-hosted.
- **Fine-grained packages add monorepo overhead.** Worth it for architectural clarity. Turborepo caching mitigates build-time cost.

### Neutral

- **wa-sqlite + OPFS requires modern browser.** Supported in Chrome 102+, Firefox 111+, Safari 15.2+. Acceptable for a practitioner tool targeting current browsers.
- **Storybook 10+** requires evaluation against current a11y-reference-storybook setup.
- **Video conferencing (MoQ hang)** is available in Phase 13–16 but implementation can be progressive within those phases.

---

## Spikes Required

| Spike | When | What it unblocks |
|-------|------|-----------------|
| D2TS performance with 500K+ datoms in browser | Pre-Phase 1 | Warm tier viability; determines if in-browser D2TS is sufficient |
| D2TS SQLite operators work with wa-sqlite (OPFS backend) | Pre-Phase 1 | Warm tier persistence; the SQLite-backed operators assume standard SQLite |
| wa-sqlite + OPFS reliability across target browsers | Pre-Phase 1 | Storage layer commitment |
| Storybook 10 compatibility with Vite + React 19 | Pre-Phase 5 | Surface component testing and Contract verification |
| MoQ TypeScript client (`@moq/lite`) maturity | Pre-Phase 13 | Multi-user communication layer |
| moq-relay deployment (self-hosted, single binary) | Pre-Phase 13 | Relay infrastructure for counselor↔client |
| Iroh WASM binary size and browser load time | Pre-Phase 20 | P2P networking in browser |
| Tauri + Rust sidecar (Iroh + MoQ) + same SPA | Pre-Phase 20 | Desktop shell with P2P capability |

---

## Concept → Technology Mapping

| Concept | What it needs | Technology |
|---------|--------------|----|
| **Datom** | Append-only store with tuple structure, provenance, schema-as-data, replay | D2TS (multiset engine) + wa-sqlite/OPFS (warm) + iroh-blobs (frozen) |
| **Projection** | Query engine (filter/sort/group/depth), subscription (live delivery), trust filtering | D2TS incremental arrangements (EAVT/AEVT/AVET/VAET), MoQ track subscription |
| **Surface** | 6 render mode components, streaming support, a11y validation, trust signal rendering | React 19 + Ark UI + CSS Modules + Storybook 10+ + axe |
| **Contract** | Validation runtime (pre-commit/in-flight/post-commit), state machine engine, enforcement | XState v5 (StateMachine mode) + vivief-contract (validation runtime) |
| **effectHandler** | Execution runtime (sync + async), actor lifecycle, implementation strategies | XState v5 actors + vivief-effect + vivief-llm (LLM strategy) |

**Cross-cutting:**

| Need | Technology |
|------|-----------|
| Serialization | ULID, deterministic binary format for frozen tier |
| Event bus / effect routing | XState actor `send()` + D2TS output streams |
| Content-addressed hashing | BLAKE3 (iroh-blobs) |
| Rich text collaboration | Loro (Fugue algorithm, WASM) |
| Real-time pub/sub | MoQ (moq-lite, QUIC ALPN) |
| P2P connectivity | Iroh (QUIC, Ed25519, relay fallback) |

---

## References

- [vivief-concepts-v6.md](../vision/vivief-concepts-v6.md) — The five concepts
- [vivief-concepts-v6-implementation-kb.md](../vision/vivief-concepts-v6-implementation-kb.md) — Technology decision framework
- [vivief-p2p-lean-stack-adr.md](../vision/brainstorms/vivief-p2p-lean-stack-adr.md) — Lean stack v1 (Iroh + D2TS + Loro)
- [vivief-p2p-lean-stack-adr-v2.md](../vision/brainstorms/vivief-p2p-lean-stack-adr-v2.md) — Lean stack v2 (adds MoQ)
- [datom-data-world-v0.7.md](../vision/brainstorms/datom-data-world-v0.7.md) — Datom-as-CRDT insight
- [D2TS](https://github.com/electric-sql/d2ts) — Differential dataflow for TypeScript
- [Iroh](https://github.com/n0-computer/iroh) — P2P QUIC networking
- [MoQ](https://github.com/moq-dev/moq) — Media over QUIC pub/sub
- [Loro](https://github.com/loro-dev/loro) — Rich text CRDT
- [wa-sqlite](https://rhashimoto.github.io/wa-sqlite/) — SQLite for browsers via WASM + OPFS
- [XState v5](https://stately.ai/docs/xstate-v5) — State machines and actors
- [Ark UI](https://ark-ui.com/) — Headless components (Zag.js)
- [TanStack Router](https://tanstack.com/router) — Type-safe routing
- [Storybook](https://storybook.js.org/) — Component stories and a11y testing
- [axe-core](https://github.com/dequelabs/axe-core) — WCAG accessibility scanning
- [Tauri v2](https://v2.tauri.app/) — Desktop/mobile framework
