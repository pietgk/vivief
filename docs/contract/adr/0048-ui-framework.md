# ADR-0048: UI Framework

## Status

Superseded by [ADR-0050](0050-tech-stack.md). React + Vite, XState v5, Ark UI, CSS Modules carried forward. TanStack suite trimmed to Router only; others adopted as needed.

## Context

The implementation KB §2.5 frames the UI framework decision: a framework for rendering Surfaces across 6 modes, with streaming content, accessibility (Render Contract), trust signal rendering, and reactive updates from live Projections.

**Sources informing this decision:**
- `vivief-concepts-v6-implementation-kb.md` §2.5 (UI Framework), §2.6 (State Machines), §2.9 (Visualization)
- `vivief-concepts-v6.md` §2.3 (Surface), §2.4 (Contract — Render Contract)
- ADR-0046 (Deno runtime)
- ADR-0047 (datom store — d2ts as Warm→Hot bridge, Hypercore, Pear client)

**Key constraints from prior ADRs (updated per ADR-0049):**

- **ADR-0049 (deployment):** Server runtime is Node.js (supersedes ADR-0046's Deno choice). Browser SPA for Phases 1-19, Tauri desktop shell for Phase 20+. Protomux channels carry data between server and client.
- **ADR-0047 (datom store):** d2ts differential dataflow powers the Warm tier. The Hot tier (UI) consumes d2ts diffs via `datom-app/v1` Protomux channel. TanStack DB uses d2ts internally. Two deployment contexts: server (Node.js), browser/Tauri client.

**Why the TanStack ecosystem:** High-quality open-source with a unified philosophy: framework-agnostic cores, type-safe by design, production-grade, no vendor lock-in. The d2ts technology already committed in ADR-0047 originated from the same differential dataflow thinking that powers TanStack DB. Adopting the broader ecosystem provides consistent patterns across routing, data, forms, tables, and tooling.

## Decision

### 1. React

React is the UI library. Largest ecosystem, Storybook native, component model maps to Surface modes. React 19 (without Server Components — no SSR in this architecture).

### 2. Deployment Targets — Web Only (amended by ADR-0049)

> **Note:** [ADR-0049](0049-deployment-architecture.md) supersedes this section's Pear client references. The deployment model is now: browser SPA (Phases 1-19) + Tauri desktop shell (Phase 20+). The UI bundle is identical in both contexts.

Both deployment contexts render web UI:

| Context | Runtime | UI rendering |
|---------|---------|-------------|
| **Browser client** (Phases 1-19) | Browser | Vite-built React SPA served by Node.js at localhost |
| **Tauri client** (Phase 20+) | System webview | Same Vite-built bundle, wrapped in Tauri native shell |

React Native / Expo are **not** adopted for now. Tauri v2 provides iOS/Android support via system webview. React Native + Bare Kit is deferred as a future option if native mobile with embedded Hypercore becomes critical. See ADR-0049 §5 for alternatives evaluation.

### 3. App Shell — Vite + TanStack Router

**Vite** (no TanStack Start) as the build tool and dev server:
- No SSR — the Pear client is local, the browser client connects via WebSocket/Protomux, not HTTP request-response
- TanStack Start's server functions model doesn't fit the datom architecture (data flows via d2ts subscriptions)
- Vite provides fast dev, HMR, tree-shaking, and is TanStack Start's underlying tool anyway

**TanStack Router** for routing:
- Type-safe search params encode navigable Projection filters (shareable URLs)
- Loader pattern triggers d2ts subscription setup before render
- Pending/stale states align with Projection delivery modes
- Lazy routes for code splitting
- Single SPA — reactive workspace with persistent WebSocket/d2ts connections

### 4. Data Layer — TanStack DB + TanStack Query

Two data strategies with clear boundaries:

| Strategy | Scope | Data source |
|----------|-------|-------------|
| **TanStack DB** | Datom-sourced reactive data | d2ts warm indexes → live queries → React |
| **TanStack Query** | Non-datom async operations | LLM API calls, DuckDB analytics, file system, external bridges |

**End-to-end data flow:**
```
Hypercore feed → d2ts warm indexes (EAVT/AEVT/AVET/VAET)
    → d2ts output diffs → TanStack DB collections
    → TanStack DB live queries → XState actor context → Pure React component
```

**Optimistic mutations** use TanStack DB: UI reflects changes immediately; the datom commit (or Contract rejection) reconciles the optimistic state.

TanStack Store is **not** adopted separately — TanStack DB subsumes it for datom data; React's own state handles local UI state.

### 5. Component Architecture Pattern

Three clean layers with a strict separation of concerns:

```
Data layer (TanStack DB)  →  Logic layer (XState actor)  →  View layer (React component)
```

| Layer | Responsibility | Testable via |
|-------|---------------|-------------|
| **Data** (TanStack DB) | Reactive datom subscriptions, live queries | Unit tests with fixture datoms |
| **Logic** (XState v5 actor) | State transitions, business rules, mutations | Model-based testing from machine definition |
| **View** (React component) | Pure rendering of actor state snapshots | Storybook stories |

**Rules:**

1. **Surface components use an XState actor** (Behavior Contract) for all behavioral logic
2. **React components are pure renderers** of actor state snapshots — no business logic in components
3. **Actors own their data subscriptions** — the actor sets up d2ts/TanStack DB queries internally (self-contained, testable without React)
4. **Mutations flow through actors** — `user action → actor.send(event) → actor invokes effectHandler → datom written → d2ts → actor context updated → re-render`
5. **Primitive components** (Badge, Avatar, Button — no state transitions) are pure functions of props, no state machine needed

**Component tiers:**

| Tier | State machine? | Example |
|------|---------------|---------|
| Surface (top-level mode) | Always | `<CardSurface>`, `<StreamSurface>`, `<DialogSurface>` |
| Feature (complex interactive region) | When ≥3 behavioral states | Session editor, filter panel, onboarding wizard |
| Primitive (UI atom) | Never | Badge, Avatar, Button, Label |

**Actor lifecycle:** One actor per Surface scope. Child components derive state from the parent actor's snapshot. Exception: components with genuinely independent lifecycle (e.g., Dialog mode streaming) own their own actor.

### 6. Two State Machine Layers — Zag.js + XState

Two state machine layers operating at different abstraction levels:

| Layer | Library | Governs |
|-------|---------|---------|
| **Domain behavior** | XState v5 | "Is the session in draft/reviewed/finalized?" "Can the user edit?" |
| **UI interaction** | Zag.js (via Ark UI) | "Is the dropdown open?" "Which item has focus?" |

XState determines WHAT the component shows. Zag.js handles HOW interactive primitives behave. No conflict — they are complementary.

### 7. Headless Components — Ark UI (Zag.js)

**Ark UI** (built on Zag.js state machines) for headless, accessible UI primitives:
- WAI-ARIA compliance maps to Render Contract a11y terms
- State machine internals align philosophically with vivief's StateMachine Contract mode
- Framework-agnostic Zag.js core preserves portability
- Ready-to-use React wrappers reduce boilerplate

A thin **vivief design system layer** wraps Ark UI components to add:
- Trust signal rendering (provenance badges on data-bound components)
- Render Contract validation hooks (axe checks tied to component lifecycle)
- Design tokens and theming
- Surface-mode-specific behavior

### 8. Styling — CSS Modules + Custom Properties

- **CSS custom properties** define the design token system (colors, spacing, typography, trust-specific tokens like `--color-trust-high`, `--color-trust-low`)
- **CSS Modules** provide component-scoped styles without runtime overhead
- **Dark mode primary, light mode secondary** — both supported via token system from the start
- No Tailwind (build dependency, utility classes obscure trust-semantic styles)
- No CSS-in-JS (runtime overhead incompatible with high-frequency d2ts reactive updates)

### 9. Additional TanStack Packages

| Package | Role |
|---------|------|
| **TanStack Form** | Type-safe form management; validation pipeline enforces Schema Contract rules client-side before datom commit |
| **TanStack Table** | Headless table/datagrid for Board mode and admin views |
| **TanStack Virtual** | Virtualized rendering for Stream mode and large datom lists |
| **TanStack Hotkeys** | Type-safe keyboard shortcuts; first-class from Phase 5 (accessibility requires keyboard-navigable UI) |
| **TanStack Devtools** | Centralized devtools panel for Query, DB, Router state; dev-only in browser, behind flag in Pear client |

### 10. TanStack AI — Evaluate, Don't Commit

TanStack AI (alpha) provides a unified multi-provider interface with streaming and no vendor lock-in. The implementation KB §2.7 requires provider abstraction and streaming.

**Decision:** Evaluate TanStack AI when it reaches beta. Use it if it can be extended with provenance hooks (`:tx/trust-score`, `:tx/source` per invocation). Otherwise, build a thin vivief-specific LLM adapter wrapping direct provider APIs.

**Dialog mode streaming architecture (regardless of AI SDK choice):**
- In-flight LLM tokens flow through a dedicated streaming channel (ephemeral, not stored as datoms)
- Only finalized output becomes datoms with provenance
- UI subscribes to both: token stream (live typing) and d2ts Projection (finalized result)
- In-flight Contract (system actor, per ADR-0047) validates tokens before they reach the Surface

### 11. Accessibility — WCAG 2.2 Level AA

WCAG 2.2 Level AA as the baseline for Render Contract compliance. Three enforcement points:

| When | Mechanism | Catches |
|------|-----------|---------|
| **Dev time** | Storybook + `@storybook/addon-a11y` (axe) | Immediate feedback while building |
| **Build time** | CI runs axe on all stories | Regressions fail the build |
| **Dev runtime** | React axe overlay | Live warnings during development |

This implements external enforcement (§5 of implementation KB) — the component cannot skip its own a11y check.

**Focus management ownership:**
- **Ark UI (Zag.js):** primitive focus (tab order, arrow keys within components, focus trapping in dialogs)
- **Vivief design system:** Surface-level focus (navigation between Surfaces, keyboard shortcuts via TanStack Hotkeys)

### 12. Model-Based Testing

The Behavior Contract (XState machine) serves dual purpose: runtime enforcement and test model.

| Surface concern | Testing approach |
|----------------|-----------------|
| Surface lifecycle (load/ready/error/streaming) | MBT — machine generates exhaustive test paths |
| Projection delivery mode transitions | MBT — snapshot→live→reconnect is a state graph |
| Component rendering per state | Storybook stories — visual + axe |
| Form validation flows | TanStack Form validation + Vitest |
| Primitive components | Storybook stories only |

MBT is **not** mandatory for every component — only for components where the state graph has enough complexity that manual test enumeration would miss paths.

### 13. Storybook Integration

Storybook 8+ with Vite builder (shared config with app build). Key addons:
- `@storybook/addon-a11y` — axe integration for Render Contract
- `@storybook/test` — component testing in stories

**Story = Surface(Projection(fixture-datoms)):** Each story receives typed fixture datoms, runs them through a mock Projection, and renders the Surface component. Every story is a Contract verification test case with end-to-end type safety from fixture to pixel.

### 14. Error Handling

Three-layer error strategy:

| Layer | Handles | Mechanism |
|-------|---------|-----------|
| **XState actor** | Domain errors (Contract violation, effectHandler failure) | Error states in machine — renders error UI, offers recovery |
| **React Error Boundary** | Render crashes (unexpected JS errors) | Catches, renders fallback, reports error datom |
| **d2ts / TanStack DB** | Connection errors (subscription dropped, sync failure) | Reconnect logic, stale data indicators |

Domain errors are **actor states, not exceptions**. When an effectHandler fails, the actor transitions to an error state. The pure component renders the error state's UI. Contract violations produce error datoms incorporated into actor context.

### 15. Server + Client Architecture (amended by ADR-0049)

> **Note:** [ADR-0049](0049-deployment-architecture.md) replaces the original Pear client architecture. Actors run in Node.js on the server, not in Bare. The Bare↔webview IPC bridge is eliminated. Data flows via Protomux channels.

```
Node.js server process
├── Hypercore 11 feed (on disk)
├── d2ts warm indexes (in memory)
├── XState actors (domain logic)
└── Protomux server (over localhost WebSocket / Noise stream)
    ├── hypercore/alpha — feed sync
    ├── loro-text/v1 — rich text CRDT
    └── datom-app/v1 — d2ts diffs, actor snapshots, queries

Browser / Tauri webview
├── Vite-built bundle (React + Ark UI)
├── Protomux client (connects to server)
├── TanStack DB (hot tier — receives diffs via datom-app/v1)
└── Pure rendering of actor state snapshots
```

**Actors run in Node.js** on the server. The browser receives actor state snapshots via the `datom-app/v1` Protomux channel and renders them purely. XState actors are pure JavaScript — they could run in the browser if needed, but the default architecture places them server-side for consistency with the Hypercore write path.

**Browser and Tauri clients are identical.** The same React SPA, same Protomux client, same data flow. Tauri wraps the SPA in a native window (Phase 20+) without code changes.

### 16. Internationalization

English-only for initial deployment. i18n infrastructure included from the start (translatable UI strings via key-value lookup). Content worlds (deep locale adaptation) deferred per implementation KB §8.

### 17. Security

- **XSS:** React's default JSX escaping handles datom string values. Rich text (Loro content) is sanitized (DOMPurify) before rendering. No `dangerouslySetInnerHTML` without sanitization.
- **CSP:** Strict Content Security Policy for the browser client — no inline scripts, no eval, origins restricted to the dht-relay server.

### 18. Package Structure

```
packages/
  vivief-ui/              # Design system + Surface components
    src/
      tokens/             # CSS custom properties, design tokens
      components/         # Ark UI wrappers + vivief-specific components
      surfaces/           # Surface mode implementations (Card, Stream, etc.)
      hooks/              # d2ts/TanStack DB bindings, Projection hooks
      contracts/          # Render Contract validation utilities
  vivief-app/             # Vite + TanStack Router app shell
    src/
      routes/             # File-based routes
      layouts/            # App layout components
```

## Consequences

### Positive

- **Ecosystem coherence:** TanStack Router, DB, Query, Form, Table, Virtual, Hotkeys, Devtools share philosophy (headless, type-safe, no lock-in) — consistent patterns across the UI
- **d2ts alignment:** TanStack DB's d2ts internals match ADR-0047's Warm→Hot tier — tightest possible integration with zero translation layer
- **Contract-as-test:** XState machines are both runtime Behavior Contracts and test model generators — eliminates the gap between declared and verified behavior
- **Pure rendering:** components are deterministic functions of actor state — predictable, testable, no hidden side effects
- **Accessibility from day one:** Ark UI's WAI-ARIA compliance + axe enforcement at three points (dev, build, runtime) implements the Render Contract
- **No vendor lock-in:** every major dependency is open source with framework-agnostic cores

### Negative

- **Two state machine layers:** Zag.js (UI interaction) + XState (domain behavior) is conceptually clean but adds learning curve
- **TanStack DB is beta:** production readiness must be monitored; fallback is direct d2ts subscription + React state
- **TanStack AI is alpha:** may not mature; vivief-specific LLM adapter may be needed regardless
- ~~**Actor-in-Bare architecture** for Pear client requires IPC bridge implementation and testing~~ Eliminated by ADR-0049 — actors run in Node.js, data flows via Protomux

### Neutral

- **Bundle size ~160 kB gzipped** is acceptable for a workspace application; Tauri client loads from disk
- **Vite over TanStack Start:** can migrate to TanStack Start later since TanStack Router is shared; no rearchitecture required
- **React 19 without Server Components:** uses improved Suspense and `use()` hook without SSR complexity

## Spikes Required (updated per ADR-0049)

| Spike | Phase | What it unblocks |
|-------|-------|--------------------|
| Vite + TanStack ecosystem in Node.js | Pre-Phase 5 | Confirms dev server and Storybook work in Node.js runtime |
| TanStack DB ↔ d2ts warm tier via Protomux | Phase 5 | Confirms the Warm→Hot data flow is seamless over Protomux channels |
| Tauri + Node.js sidecar + same SPA | Pre-Phase 20 | Confirms the desktop shell path (see ADR-0049) |

## References

- [vivief-concepts-v6-implementation-kb.md §2.5, §2.6, §2.9](../vision/vivief-concepts-v6-implementation-kb.md) — UI Framework, State Machines, Visualization decision frames
- [vivief-concepts-v6.md §2.3, §2.4](../vision/vivief-concepts-v6.md) — Surface concept, Render Contract
- [ADR-0046](0046-runtime-and-language.md) — Runtime and Language (superseded by ADR-0049 for server runtime)
- [ADR-0049](0049-deployment-architecture.md) — Deployment Architecture (supersedes Pear, amends deployment targets)
- [ADR-0047](0047-datom-store-sync.md) — Datom Store and Sync (d2ts, Hypercore)
- [TanStack](https://tanstack.com/) — Router, Query, DB, Form, Table, Virtual, Hotkeys, Devtools, AI
- [Ark UI](https://ark-ui.com/) — Headless components built on Zag.js
- [Zag.js](https://zagjs.com/) — UI component state machines
- [XState v5](https://stately.ai/docs/xstate-v5) — State machines and actors
- [Storybook](https://storybook.js.org/) — Component stories and a11y testing
- [axe-core](https://github.com/dequelabs/axe-core) — WCAG accessibility scanning
