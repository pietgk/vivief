# Vivief Platform Concepts — Hybrid B

> Hybrid A + V3 Stream
> Five concepts. Actors are the runtime. Streaming is native.

---

## 1. Core Thesis

**Everything is `(state, effect) => (state', [effect'])` — running as actors, streaming by default.**

Five concepts model the entire vivief platform. At runtime, they are actors communicating via effects. Streaming — progressive LLM responses, live dashboards, real-time collaboration — is not bolted on. It emerges naturally from Projections that deliver live, from actors that send messages, and from Contracts that validate in-flight.

```
Datom → Projection → Surface → Contract → effectHandler
  |         |            |          |            |
 fact    query+scope   render    constraint   transition
         +delivery     +stream   +temporal    +actor
```

---

## 2. The Five Concepts

### 2.1 Datom

The universal fact. `[Entity, Attribute, Value, Tx, Op]`.

Immutable, append-only, self-describing. Schema is stored as datoms. Value types: text, number, date, ref, bytes, vec, encrypted, struct. The datom log is the shared memory that all actors read from and write to.

**Observability as datoms.** When an effectHandler invokes an LLM, the invocation metadata is stored as regular datoms alongside the result:

```
[effect:42  :llm/tokens-in      1500                    tx:87  true]
[effect:42  :llm/tokens-out     800                     tx:87  true]
[effect:42  :llm/cost-usd       0.045                   tx:87  true]
[effect:42  :llm/duration-ms    2400                    tx:87  true]
[effect:42  :llm/model          :model/opus-4           tx:87  true]
```

Token counts, cost, latency — all queryable via Projection, displayable on Surfaces, aggregatable over time. No special observability layer needed.

**At runtime:** The datom store is the Store Actor. It accepts commit effects and notifies actors whose Projections match.

| Domain | Manifestation |
|--------|---------------|
| **devac** | Code graph — nodes, edges, external refs, effects, diagnostics |
| **Counseling app** | Clinical data — clients, sessions, treatment plans, AI suggestions |

### 2.2 Projection

**Lens + Seal merged. Now with delivery modes.**

A Projection defines: what datoms are visible, who can see them, how deep the view goes, and **how updates are delivered**.

```typescript
interface Projection {
  // Query
  filter: DatomQuery
  sort: SortSpec
  group?: GroupSpec
  depth?: DepthSpec

  // Access
  capability: CapabilityToken
  scope: "own" | "consented" | "all"

  // Encryption
  decryptionKey?: DerivedKey

  // Delivery (new)
  delivery: "snapshot" | "live" | "replay"
  freshness?: "committed" | "in-flight"
}
```

| Delivery | Behavior |
|----------|----------|
| **snapshot** | Current state. One-shot query. |
| **live** | Current state + all future matching datoms as they commit. This IS reactive subscription. |
| **replay** | Full history from tx:0 or asOf(tx). Time-travel. |

| Freshness | What the actor sees |
|-----------|-------------------|
| **committed** (default) | Only committed datoms |
| **in-flight** | Committed datoms + streaming tokens from active effects |

**The elegant move:** Reactive subscription is no longer a separate "store property" — it's `delivery: "live"` on a Projection. Every Projection can be snapshot, live, or replay. This makes subscription a first-class, queryable, composable thing.

**Streaming as a Projection capability.** A Surface actor with `freshness: "in-flight"` sees LLM tokens as they arrive. A logging actor with `freshness: "committed"` only sees final values. The separation is explicit and per-Projection — different actors see different slices of the same event.

**Trust zones and key derivation** work as in Hybrid A. Roles (owner, scoped user, AI agent, system) constrain which Projections can be constructed. Consent is a datom with Why chain.

**At runtime:** A Projection is an actor's subscription declaration. The Store Actor delivers datoms matching the Projection, in the requested delivery mode.

| Domain | Manifestation |
|--------|---------------|
| **devac** | MCP queries (snapshot), live diagnostics (live), `asOf` analysis (replay) |
| **Counseling app** | Morning prep (snapshot), live session (live+in-flight), client history (replay) |

### 2.3 Surface

The renderer. Consumes a Projection's output and produces visible output. Since Projections can deliver live and in-flight, Surfaces are inherently streaming — no special handling.

```
Surface = render(Projection)
```

| Mode | Input | Output |
|------|-------|--------|
| **Stream** | Time-ordered datoms | Activity feed, chat, notifications |
| **Card** | Single entity datoms | Detail page, form, record |
| **Canvas** | Block datoms + CRDT state | Document, notes, Jupyter blocks |
| **Dialog** | Projection(delivery: live, freshness: in-flight) | AI chat with streaming tokens |
| **Board** | Grouped datoms | Kanban, calendar, roster |
| **Diagram** | Contract + effect datoms | C4, XState viz, sequence diagram |

**Streaming is natural.** A Dialog Surface subscribes to a Projection with `delivery: "live", freshness: "in-flight"`. Tokens arrive as the LLM generates them. When the effect completes and commits the final datom, the Surface transitions seamlessly from streaming to committed. No special streaming logic — the Surface just renders what the Projection delivers.

**System visualization.** Diagram mode renders architecture (C4 from Contract datoms), behavior (XState from handler state machine datoms), and component catalogs (Storybook from fixture Projections). `Story = Surface(Projection(fixture-datoms, delivery: "snapshot"))`.

**At runtime:** A Surface is a rendering actor. Subscribes via Projection, receives state updates, renders output, emits effects on user interaction.

| Domain | Manifestation |
|--------|---------------|
| **devac** | CLI output, MCP responses, C4 diagrams, live diagnostics |
| **Counseling app** | Stream, Card, Canvas, Dialog (with streaming), Board, Diagram |

### 2.4 Contract

A Contract declares expected behavior. Simultaneously spec, test, and runtime guard. Three modes and three temporal validation points.

```
Contract = (pattern: DatomQuery, constraint: Guard | Aggregation | StateMachine)
```

**Three modes:**

| Mode | What it does | Example |
|------|-------------|---------|
| **Guard** | Reject invalid transitions | "Session recap must produce themes, never diagnosis" |
| **Aggregation** | Derive higher-level facts from lower-level patterns | "HTTP calls aggregate into IO.HTTP" (was devac Rules) |
| **StateMachine** | Define valid states and transitions | XState machine definition = Contract for a handler |

**Three temporal validation points:**

| When | What it validates | Example |
|------|------------------|---------|
| **Pre-commit** | Datoms about to be committed | "`:client/name` must be non-empty text" |
| **In-flight** | Streaming tokens from an active effect | "LLM output must not contain diagnosis language" |
| **Post-commit** | Cross-entity invariants after commit | "High-risk client must have session within 7 days" |

**In-flight validation is the new capability.** An in-flight Contract monitors the token stream from an LLM effectHandler. If the LLM starts generating "Based on my diagnosis...", the Contract fires mid-stream — the effect is interrupted, the LLM is re-prompted, and the violation never becomes a datom. This is genuinely powerful for AI safety: guardrails that work on streaming output, not just committed results.

**Aggregation subsumes Rules.** C4 diagrams are generated from aggregation Contracts applied to effect datoms. The C4 zoom pattern IS the Contract hierarchy.

**StateMachine for visible logic.** Design in Stately Studio, implement the handler, runtime validates transitions match. The machine definition is the spec, the test, and the guard.

**At runtime:** Contracts define actor protocols — what messages actors accept and emit. Contract violations produce violation datoms in the log.

| Domain | Manifestation |
|--------|---------------|
| **devac** | Lint rules, type-checks, effect aggregation for C4, in-flight code review |
| **Counseling app** | Clinical workflow constraints, real-time AI guardrails, regulatory compliance |

### 2.5 effectHandler

The universal control pattern. Two zoom levels: function and actor.

**Level 1 — The function:**

```typescript
handler(state: State, effect: Effect): { datoms: Datom[], effects: Effect[] }
```

Pure, testable, composable. State comes from a Projection. Most handlers.

**Level 2 — The actor:**

Function + identity + Projection + message queue + lifecycle + typed protocol.

| Scenario | Level | Why |
|----------|-------|-----|
| Validate session notes | Function | Stateless check |
| Format recap output | Function | Pure transformation |
| LLM invocation with streaming | Actor | Produces in-flight token stream |
| Session-recap workflow | Actor | Multi-step, needs cancellation |
| AI analysis loop | Actor | Persistent subscription, manages dispatch cadence |
| Context compaction | Actor | Reads conversation stream, produces summary datom |

**Streaming output from actors.** An LLM handler actor produces tokens as in-flight effects. Surface actors subscribed with `freshness: "in-flight"` render them progressively. In-flight Contracts validate them in real-time. On completion, the actor commits the final datom to the Store Actor.

**Context compaction as effectHandler.** When a conversation approaches LLM context limits: `(state, :effect/compact) => { datoms: [summary-datom], effects: [] }`. The compaction handler reads state via its Projection, produces a summary datom, and downstream handlers use the summary as context.

**Handler registration, deployment, and rollback** — all datom mutations. Same as Hybrid A.

| Domain | Manifestation |
|--------|---------------|
| **devac** | `devac sync` = effectHandler; validation = effect chain; C4 = aggregation Contract |
| **Counseling app** | Voice recap → streaming transcription → structure → AI analysis |

---

## 3. The Actor Runtime

At runtime, the five concepts become actors. The voice recap example — now with streaming:

```
HumanActor (counselor)
  → emits :effect/voice-input
    → DispatcherActor resolves to SessionRecapActor
      → SessionRecapActor.receive(:effect/voice-input)
        → emits :effect/transcribe to TranscriberActor (LLM)
          → TranscriberActor produces in-flight token effects
            → InFlightContract validates each chunk (no diagnosis language)
            → DialogSurfaceActor renders tokens progressively (freshness: in-flight)
          → TranscriberActor commits final transcript datom to StoreActor
            → StoreActor notifies SessionRecapActor (Projection match, delivery: live)
              → SessionRecapActor transitions to 'structuring'
                → ... cascade continues ...
            → StoreActor notifies MorningPrepSurfaceActor (Projection match)
              → MorningPrepSurfaceActor re-renders board
```

The streaming path (in-flight tokens → Contract validation → Surface rendering) and the commit path (final datom → Store notification → downstream handlers) coexist naturally.

---

## 4. Composition

| Composition | What it produces |
|-------------|-----------------|
| **Datom + Projection(snapshot)** | Point-in-time authorized view |
| **Datom + Projection(live)** | Reactive subscription |
| **Datom + Projection(live, in-flight)** | Streaming |
| **Datom + Projection(replay)** | Time-travel |
| **Projection + Surface** | Rendered output (UI, diagram, CLI) |
| **Datom + Contract(guard)** | Validated facts |
| **Datom + Contract(aggregation)** | Derived higher-level facts (C4) |
| **effectHandler + Contract(stateMachine)** | Visible, constrained transitions |
| **effectHandler + Contract(in-flight)** | Real-time AI guardrails |
| **Surface + Projection(fixture)** | Storybook stories |
| **All five** | The vivief platform |

---

## 5. What Disappeared

| Old Concept | Where It Went | Why |
|-------------|--------------|-----|
| **Lens** | → Projection (query + delivery) | Now includes delivery mode (live = reactive sub) |
| **Seal** | → Projection (capability + encryption) | Authorization + encryption per-Projection |
| **P2P** | → Infrastructure (remote actors) | Deployment concern, not data concept |
| **Rules** (devac) | → Contract (aggregation mode) | Same pattern as Contract |
| **Reactive subscription** | → Projection(delivery: live) | First-class Projection capability, not store magic |

---

## 6. Infrastructure

Same as Hybrid A — Holepunch stack, embedded vs. daemon, location-transparent actor communication.

| P2P sub-concept | Holepunch module |
|-----------------|-----------------|
| Agent log | Hypercore |
| Agent log (index) | Hyperbee |
| Key derivation | Corestore (= Projection encryption) |
| Sync | Autobase (multi-writer) |
| Peer discovery | HyperDHT + Hyperswarm |
| IPC | Protomux |
| Handler artifacts | Hyperdrive |

---

## 7. The Trade-off

**Gained over Hybrid A:**
- Streaming is native, not bolted on. Projection delivery modes make reactive subscription and streaming first-class.
- In-flight Contract validation — AI guardrails that work on streaming output. The "diagnosis language" example: genuinely new, genuinely powerful.
- Observability as datoms — token/cost tracking with zero new concepts.
- Context compaction as effectHandler — named pattern for context window management.
- `freshness: "in-flight"` gives per-actor control over what's visible during streaming.

**What stayed clean:**
- Datom is still just a fact. No stream provenance on the struct. Observability metadata is separate datoms.
- Projection is the same concept as Hybrid A, just with `delivery` and `freshness` fields.
- The core formula `(state, effect) => (state', [effect'])` is untouched.

**Remaining open question:**
- How does in-flight Contract validation interact with actor cancellation? If a Contract fires mid-stream, does the actor receive a `:effect/cancel` or is the stream just dropped? This needs specification during implementation.

---

*Version: hybrid-b — 5 concepts with actor runtime and native streaming. Projection gains delivery modes (snapshot/live/replay) and freshness (committed/in-flight). Contract gains temporal validation (pre-commit/in-flight/post-commit). Observability as datoms. Context compaction as effectHandler.*
