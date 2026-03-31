# ADR-0049: Deployment Architecture — Unified Runtime

## Status

Superseded by [ADR-0050](0050-tech-stack.md). Three-runtime complexity eliminated. Browser-first for Phase 1-12, moq-relay for Phase 13-16, Tauri + Rust sidecar for Phase 20+.

## Context

ADRs 0046, 0047, and 0048 were written as a sequence — each referencing the prior — but when viewed as a system they reveal a three-way architectural tension.

**Sources informing this decision:**
- ADR-0046 (Deno runtime), ADR-0047 (datom store, Hypercore, Protomux), ADR-0048 (UI framework, Pear client)
- `vivief-concepts-v6-implementation-kb.md` §2.1 (Runtime & Language), §2.5 (UI Framework)
- `vivief-concepts-v6.md` §2.2 (Projection delivery modes), §2.4 (Contract enforcement)
- `datom-data-world-v0.7.md` (architecture brainstorm)

### Tension 1: Deno + Hypercore 11 Native Addons

ADR-0046 chose Deno for security permissions, no-build-step TypeScript, and modern APIs. ADR-0047 chose Hypercore 11 as the frozen tier, which uses RocksDB (native C++ addon) for storage. Deno's Node-API (NAPI) support is limited and fragile for complex native addons. The `rocksdb` npm bindings used by Hypercore 11's storage layer are discontinued. ADR-0047 line 22 acknowledges the tension and claims resolution via `npm:` specifiers — but this applies to pure-JavaScript packages. Native C++ addon compilation and loading through Deno's compatibility layer is a different, unproven path.

### Tension 2: Pear = Electron Under the Hood

ADR-0048 chose Pear as the desktop runtime. Pear uses `pear-electron`, which IS Electron. This means:
- Bundle size: ~150-200 MB (Electron baseline)
- Memory: ~200-300 MB idle
- Chromium bundled (redundant on Chromium-based systems)
- The Bare runtime (Pear's backend process) is a third JavaScript runtime with ~95% Node.js API compatibility — the missing 5% requires per-dependency verification

### Tension 3: Three-Runtime Complexity

The current ADR chain produces three JavaScript runtimes:

| Context | Runtime | What runs there |
|---------|---------|-----------------|
| Server | Deno (ADR-0046) | effectHandlers, CLI, MCP, analytics |
| Desktop backend | Bare (ADR-0048 via Pear) | Hypercore, d2ts, XState actors |
| Desktop UI / Browser | Browser JS | React, TanStack DB, rendering |

Each runtime has different API surfaces, different module resolution, and different capabilities. Code shared across runtimes (d2ts, XState actors) must be validated in all three. This contradicts the project's value of elegance and simplicity.

### What Must Be Preserved

These commitments from ADR-0047 and ADR-0048 are load-bearing and must not change:

- **Hypercore** as frozen tier (datom log, append-only, Merkle-verified)
- **d2ts** as warm tier materializer (pure TypeScript, runs anywhere)
- **Protomux** with three channels: `hypercore/alpha`, `loro-text/v1`, `datom-app/v1`
- **React + TanStack ecosystem** (Router, DB, Query, Form, Table, Virtual, Hotkeys, Devtools)
- **XState v5** for behavior contracts and actor model
- **Ark UI (Zag.js)** for headless accessible components
- **Holepunch P2P architecture** (Hyperswarm, Noise encryption, dht-relay) — decided, built Phase 20+
- **TypeScript** as the language
- **All UI decisions** from ADR-0048 (CSS Modules, Storybook, WCAG 2.2 AA, model-based testing, error handling)

## Decision

### 1. Node.js as Server Runtime (supersedes ADR-0046)

Node.js replaces Deno as the server runtime. Hypercore 11 runs natively on Node.js — zero compatibility risk, zero native addon friction. The full Holepunch stack (Hypercore, Hyperswarm, Protomux, Corestore, dht-relay) is Node.js-native and battle-tested.

**What ADR-0046's Deno benefits looked like, and how they are addressed:**

| ADR-0046 benefit | Node.js equivalent | Trade-off |
|-----------------|-------------------|-----------|
| **Security permissions** (`--allow-net`, etc.) | Node.js 22+ `--experimental-permission` (partial); platform's own trust model (Contract enforcement, capability tokens) | Deno's permission model is more mature and mandatory; Node.js is opt-in. This is the main sacrifice. |
| **No build step** (run TypeScript directly) | `tsx` (mature, widely used) or Node.js 23+ `--experimental-strip-types` (stabilizing) | Functionally equivalent for development. `tsx` is a single dependency. |
| **Modern APIs** (`fetch`, `ReadableStream`, `WebSocket`) | Standard in Node.js 22+ (all three are stable, unflagged) | No gap. |
| **`deno fmt`, `deno lint`, `deno test`** | Biome (already used in devac), Vitest (already used) | No gap — these tools are already in the project. |

**TypeScript remains the language.** ADR-0046's reasoning about TypeScript over Python (structural type system vs bolted-on typing) and Bun elimination (dependency incompatibility) is preserved and still valid.

### 2. Protomux as the Universal Communication Layer

ADR-0047 committed to three Protomux channels for P2P communication. This ADR extends that commitment to Phase 1: use Protomux from day one as the communication layer between server and browser.

Protomux multiplexes over any framed stream. The stream transport changes; the protocol does not:

| Phase | Transport | Encryption |
|-------|-----------|------------|
| **1-19** | Localhost WebSocket or TCP stream | None needed (same machine) |
| **20+** | Hyperswarm connection via HyperDHT | Noise protocol (E2E encrypted) |

The three channels from ADR-0047 are used as-is:

| Channel | Protocol | What flows |
|---------|----------|-----------|
| `hypercore/alpha` | Hypercore replication | Datom feed sync (frozen tier) |
| `loro-text/v1` | Loro delta sync | Rich text collaborative editing |
| `datom-app/v1` | protomux-rpc | d2ts diffs, actor snapshots, queries, subscriptions, presence |

This means the browser speaks the P2P protocol from Phase 1. When Hyperswarm activates in Phase 20+, the protocol migration cost is zero — only the transport changes.

### 3. Browser SPA for Phases 1-19 (amends ADR-0048 §2)

A Vite-built React SPA served by the Node.js process at `localhost`. The user opens a browser tab. No desktop shell is needed for foundation and extension phases.

Reviewing the implementation KB's phase structure:
- **Phases 1-5** (Foundation): datom store, schema, projection, effectHandler, Surface Card — all server-side or browser UI work
- **Phases 6-12** (Extension): live projections, actors, streaming, bridges — all server-side or browser UI work
- **Phases 13-16** (Advanced): trust, remaining surfaces, deterministic-first loop — all server-side or browser UI work

None of these phases require native desktop capabilities (system tray, file system access, native notifications). A browser SPA at `localhost` provides the complete development and user experience.

### 4. Tauri Desktop Shell for Phase 20+ (replaces Pear in ADR-0048)

When P2P features are built (Phase 20+), the existing SPA is wrapped in Tauri v2. The Node.js process becomes a Tauri sidecar.

**Why Tauri:**

- **All platforms**: macOS, Linux, Windows, iOS, Android — from one codebase (Tauri v2)
- **Lightweight**: ~30-50 MB (Tauri shell) + ~70 MB (Node.js sidecar) ≈ 100-120 MB total, vs Pear's ~200 MB
- **System webview**: No bundled Chromium. Uses WebKit (macOS/iOS), WebView2 (Windows), WebKitGTK (Linux), android.webkit (Android)
- **Established IPC**: Secure, typed, binary streaming channels (`tauri::ipc::Channel`)
- **Sidecar pattern**: Production-proven via `tauri-plugin-shell`. Node.js bundled with `pkg` or Node.js SEA (Single Executable Applications)
- **No Electron**: Addresses the Pear/Electron discomfort directly
- **Plugin system**: Tauri v2 plugins can bridge bottlenecks between Rust and Node.js if needed

**The SPA is identical** between browser and Tauri webview. Tauri adds: native window, system tray, offline persistence, file system access, push notifications. The React code does not change. The Node.js process does not change. Only the shell around them changes.

### 5. Alternatives Evaluated

#### Option A: Pear (current ADR-0048) — Rejected

Pear is Electron under the hood (`pear-electron`). It creates three runtimes (Deno + Bare + Browser). The ecosystem is small (226 GitHub stars, one production app: Keet). The Bare runtime's ~95% Node.js compatibility requires per-dependency verification. The custom IPC bridge between Bare and webview is unproven engineering. The P2P-native advantage of Pear does not justify the complexity cost when P2P is deferred to Phase 20+.

#### Option B: Deno Server + Browser SPA — Rejected

This retains ADR-0046's Deno choice but drops Pear. The fundamental problem remains: Deno + Hypercore 11's RocksDB native addon is an unproven, high-risk compatibility path. A spike might fail, falling back to Node.js anyway and losing time. Since Hypercore is foundational (Phase 1), this risk is not acceptable for the critical path.

#### Option C: React Native + Bare Kit — Deferred

Holepunch's `react-native-bare-kit` embeds the Bare runtime in React Native apps. This is the only path for native mobile with embedded Hypercore. However: the kit is experimental, documentation is minimal, Hypercore integration inside Bare Kit worklets is undocumented, and React Native for desktop (macOS, Windows) is not mainstream. Revisit if native mobile becomes critical before Tauri v2 mobile matures.

#### Option D: Tauri + Rust Hypercore (Pure Rust Stack) — Track as Long-Term

The `datrs/hypercore` crate provides a Rust implementation of Hypercore (compatible with HC 10 LTS). However, Hyperswarm and Protomux do NOT have mature Rust implementations — community ports exist but are incomplete. If the Rust P2P ecosystem matures, this would eliminate the Node.js sidecar entirely, giving a pure Rust + Browser architecture. Track as a long-term option; do not depend on it.

### 6. Data Flow (replaces ADR-0048 §15)

**Phase 1-19:**

```
Node.js server process
├── Hypercore 11 feed (frozen tier, on disk)
├── d2ts materializer (warm tier, in memory)
│   └── Indexes: EAVT, AEVT, AVET, VAET
├── XState actors (domain logic, behavior contracts)
├── Protomux server (over localhost WebSocket)
│   ├── hypercore/alpha — feed sync (single-peer in Phase 1)
│   ├── loro-text/v1 — rich text CRDT (Loro Fugue)
│   └── datom-app/v1 — d2ts diffs → TanStack DB, actor snapshots,
│                       queries, subscriptions, presence
└── HTTP server (Vite SPA in dev, static files in prod)

Browser
├── React + TanStack Router (SPA)
├── Protomux client (over WebSocket to localhost)
├── TanStack DB (hot tier — receives diffs via datom-app/v1 channel)
├── XState actor snapshots (received via datom-app/v1 channel)
└── Optimistic mutations → datom-app/v1 → server → Hypercore commit
```

**Phase 20+:**

```
Tauri application
├── System webview
│   └── Same React SPA (zero code changes)
└── Node.js sidecar (managed by Tauri lifecycle)
    ├── Hypercore 11 + Corestore (frozen tier)
    ├── Hyperswarm + HyperDHT (peer discovery, NAT traversal)
    ├── d2ts materializer (warm tier)
    ├── XState actors
    └── Protomux server (now over Noise-encrypted Hyperswarm streams)
        ├── hypercore/alpha — feed sync (multi-peer replication active)
        ├── loro-text/v1 — collaborative rich text
        └── datom-app/v1 — diffs, snapshots, queries, presence

dht-relay (always-on server)
└── WebSocket→UDP bridge for browser clients (blind relay, Noise-encrypted)
```

**Actors run in Node.js** (not Bare, not the browser). The browser receives actor state snapshots via the `datom-app/v1` Protomux channel and renders them purely. This eliminates the Bare↔webview IPC bridge that ADR-0048 §15 required.

**Browser client in Phase 20+:** Connects to the always-on server via dht-relay WebSocket. Protomux runs over the relay connection. The browser receives sparse Hypercore data via `hypercore/alpha` and d2ts diffs via `datom-app/v1`. Same protocol, relayed transport.

### 7. Implications for Prior ADRs

#### ADR-0046: Superseded for Server Runtime

Status changes from "Accepted" to "Superseded by ADR-0049." The server runtime changes from Deno to Node.js due to Hypercore 11 native addon incompatibility.

ADR-0046's reasoning about TypeScript (over Python) and Bun elimination remains valid and is preserved. The TypeScript language choice is unchanged.

#### ADR-0047: Amended — Deno Tension Resolved

The "Tension with ADR-0046" paragraph (line 22) is resolved: Node.js IS the server runtime, so the Holepunch ecosystem runs natively without `npm:` specifier concerns.

The "Holepunch ecosystem coupling" negative consequence (line 236) is resolved: no Deno compatibility re-validation needed on Holepunch version upgrades.

**All datom store decisions are unchanged.** Hypercore frozen tier, d2ts warm tier, four indexes, conflict resolution, Loro for rich text, Protomux channels, subscription-as-replication-filter, identity model — everything in ADR-0047 is preserved exactly.

#### ADR-0048: Amended — Deployment Targets and Pear Architecture

**§2 (Deployment Targets)** changes from Pear client + browser to browser SPA (Phases 1-19) + Tauri (Phase 20+).

**§15 (Pear Client Architecture)** is removed. Actors run in Node.js on the server, not in the Bare runtime. No Bare↔webview IPC bridge is needed. The webview receives data via Protomux channels, not custom IPC.

**Spikes table** is updated (see §Spikes below).

**All other ADR-0048 decisions are unchanged:** React, TanStack Router, TanStack DB, TanStack Query, TanStack Form, TanStack Table, TanStack Virtual, TanStack Hotkeys, TanStack Devtools, Vite, XState v5, Ark UI (Zag.js), CSS Modules + Custom Properties, Storybook, WCAG 2.2 AA, model-based testing, error handling, package structure, internationalization, security.

## Consequences

### Positive

- **One server runtime** (Node.js) — Hypercore 11 runs natively, zero compatibility risk
- **Two contexts only** (Node.js server + browser) — reduced from three, halving the cross-runtime testing surface
- **No Electron** — Pear eliminated, no bundled Chromium for desktop
- **One React SPA** serves browser and future Tauri shell identically — no code duplication
- **Protomux from Phase 1** — the browser speaks the P2P protocol from day one; zero protocol migration at Phase 20+
- **Progressive enhancement** — desktop shell is additive (Phase 20+), not foundational (Phase 1)
- **Tauri v2 mobile** (iOS/Android) available when needed, via system webview
- **Full Holepunch commitment preserved** — Hypercore from Phase 1, Protomux channels from Phase 1, architecture ready for Hyperswarm at Phase 20+

### Negative

- **Deno permission model lost** — Node.js does not enforce runtime sandboxing by default. This is the main sacrifice. Partially mitigated by Node.js 22+ `--experimental-permission` and the platform's own Contract-based trust model.
- **No native desktop shell until Phase 20+** — users must use a browser tab for foundation and extension phases
- **Tauri adds Rust toolchain** to the build chain at Phase 20+ — new dependency for the team
- **Node.js sidecar** adds ~70 MB to the Tauri desktop bundle
- **System webview fragmentation** — Tauri uses the OS-native webview (WebKit, WebView2, WebKitGTK), which may have subtle cross-platform rendering differences. ADR-0048's Storybook + axe testing pipeline mitigates this.

### Neutral

- **`tsx`** provides no-build-step TypeScript execution for Node.js — functionally equivalent to Deno's native TypeScript for development purposes
- **Vite dev server** with HMR is unchanged — same developer experience for UI work
- **P2P architecture** (ADR-0047 §5) is completely unchanged — Protomux channels, Hyperswarm, dht-relay, Noise encryption all preserved
- **All UI decisions** from ADR-0048 are unchanged — the UI framework ADR remains authoritative for component architecture, state machines, styling, accessibility, and testing
- **React Native + Bare Kit** is deferred, not rejected — it remains a future option if native mobile with embedded Hypercore becomes critical
- **Rust Hypercore** is tracked as a long-term option — if the Rust P2P ecosystem matures, the Node.js sidecar could be replaced by native Rust

## Spikes Required

| Spike | Phase | What it unblocks |
|-------|-------|-----------------|
| Node.js + Hypercore 11 + d2ts end-to-end | Pre-Phase 1 | Validates the core stack: write datoms to Hypercore, materialize through d2ts, query via warm indexes |
| Protomux over localhost WebSocket in browser | Pre-Phase 1 | Validates that Protomux client works in browser over a WebSocket transport (not just Noise streams) |
| Vite React SPA + Protomux reactive data flow | Pre-Phase 5 | Validates the browser data delivery path: d2ts diffs via datom-app/v1 → TanStack DB |
| TanStack DB receiving d2ts diffs over Protomux | Phase 5 | Validates the Warm→Hot tier data flow is seamless over the network |
| Tauri + Node.js sidecar + same SPA | Pre-Phase 20 | Validates the desktop shell path before committing to P2P implementation |

## References

- [ADR-0046](0046-runtime-and-language.md) — Runtime and Language (superseded for server runtime by this ADR)
- [ADR-0047](0047-datom-store-sync.md) — Datom Store and Sync (amended: Deno tension resolved)
- [ADR-0048](0048-ui-framework.md) — UI Framework (amended: deployment targets and Pear architecture)
- [vivief-concepts-v6-implementation-kb.md §2.1, §2.5](../vision/vivief-concepts-v6-implementation-kb.md) — Runtime & Language, UI Framework decision frames
- [vivief-concepts-v6.md §2.2, §2.4](../vision/vivief-concepts-v6.md) — Projection delivery, Contract enforcement
- [datom-data-world-v0.7.md](../vision/brainstorms/datom-data-world-v0.7.md) — Architecture brainstorm
- [Tauri v2](https://v2.tauri.app/) — Desktop/mobile framework
- [Tauri Sidecar](https://v2.tauri.app/develop/sidecar/) — External binary management
- [Hypercore Protocol](https://docs.holepunch.to/building-blocks/hypercore)
- [Protomux](https://docs.holepunch.to/helpers/protomux)
- [tsx](https://tsx.is/) — TypeScript execution for Node.js
- [datrs/hypercore](https://github.com/datrs/hypercore) — Rust Hypercore implementation (long-term tracking)
