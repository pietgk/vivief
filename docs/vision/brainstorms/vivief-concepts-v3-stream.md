# Vivief Platform Concepts — V3 "The Stream"

> Intermediate exploration: what if we invert the hierarchy?
> Instead of "facts first, streams derived," what if "streams first, facts are snapshots of streams?"
> Goal: make streaming/progressive values native, not bolted on.

---

## Core Thesis

**Everything flows.**

The current model says: datoms are facts, committed atomically, immutable. Streams are a Surface concern — rendering tokens as they arrive. But the challenge revealed this creates a seam: committed datoms (the "real" data) vs. in-flight streams (the "temporary" data) are treated as fundamentally different things.

What if they're the same thing at different speeds?

```
Stream ──────────────────────────→ time
  │ token  │ token  │ token  │ COMMIT │
  │        │        │        │   ↓    │
  │        │        │        │  Datom │
```

A **datom** is a stream that has completed — a stream of length 1, committed. A **streaming LLM response** is a datom that hasn't finished yet. A **CRDT document** is a stream of micro-mutations that are each committed but collectively form one evolving value.

The thesis: **the stream is the primitive. The datom is a completed stream.**

---

## Seven Concepts — Stream-Native

### 1. Datom (completed stream)

Still `[Entity, Attribute, Value, Tx, Op]`. Still immutable, append-only, self-describing. But now understood as a **crystallized moment** in a stream — the point where a value became a fact.

What changes: datoms can have a **provenance stream**. The committed datom `[session:42, :session/transcript, "full text...", tx:87, true]` may have arrived as 200 token chunks over 30 seconds. The datom is the final fact. The provenance stream is metadata — available if you want it, invisible if you don't.

```typescript
interface Datom {
  entity: EntityId
  attribute: AttributeKw
  value: V
  tx: TxId
  op: boolean
  // New: optional stream provenance
  stream?: {
    chunks: number       // How many stream events produced this value
    duration: number     // Milliseconds from first chunk to commit
    source: EffectId     // Which effect produced this stream
  }
}
```

**Why:** Observability. "This transcript took 30 seconds and 200 chunks" is useful for cost tracking, performance monitoring, and understanding system behavior. The provenance is itself a datom — queryable, lensable, surfaceable.

### 2. Flow (replaces Lens)

**Renaming Lens to Flow** to emphasize that it's not a static query — it's a **continuous stream of matching datoms**.

```typescript
interface Flow {
  filter: DatomQuery        // What matches
  sort: SortSpec
  group?: GroupSpec
  depth?: DepthSpec
  mode: SurfaceMode

  // New: stream behavior
  delivery: "snapshot" | "live" | "replay"
}
```

| Delivery | Behavior |
|----------|----------|
| **snapshot** | Current state as of now. One-shot. (Was: Lens query) |
| **live** | Current state + all future matching datoms as they commit. (Was: reactive subscription) |
| **replay** | Full history from tx:0 or asOf(tx). (Was: asOf query) |

**The key move:** Reactive subscription is no longer a "store property" — it's the `live` delivery mode of a Flow. Every Flow can be snapshot, live, or replay. This makes subscription a first-class, queryable, composable thing.

**In-flight streams.** A Flow with `delivery: "live"` on an active LLM effect sees token chunks before they commit. The Surface renders them as they arrive. When the effect completes and commits the final datom, the Flow transitions from streaming to committed seamlessly.

### 3. Surface (stream renderer)

A Surface consumes a Flow and renders it. Since Flows can be live, Surfaces are inherently streaming. No special handling needed.

```
Surface = render(Flow)

// A chat UI
Surface(Flow({ filter: ':message/*', delivery: 'live', mode: 'stream' }))
  → renders committed messages
  → renders in-flight LLM tokens as they arrive
  → seamlessly transitions when tokens commit as final message

// A C4 diagram
Surface(Flow({ filter: ':contract/*', delivery: 'snapshot', mode: 'diagram' }))
  → renders current architecture

// A Storybook story
Surface(Flow({ filter: fixture-datoms, delivery: 'snapshot', mode: 'card' }))
  → renders component with controlled inputs
```

**Diagram mode** added for system visualization (C4, XState, sequence diagrams). These are just Surfaces over Flows of different datom types.

### 4. Seal (stream encryption)

Seal encrypts streams, not just committed values. When a Flow crosses a trust boundary (P2P replication, client portal, AI consent), the Seal determines:

- Which stream chunks are decryptable (scoped by entity/attribute)
- At what granularity (per-datom, per-stream, per-session)
- With what key (derived from passphrase via HKDF)

**Consent as stream gating.** AI consent doesn't just grant access to committed datoms — it grants access to the live Flow. Revoking consent stops the Flow to the AI actor immediately, mid-stream if necessary.

### 5. Contract (stream invariant)

Contracts validate streams, not just committed state. Three temporal modes:

| Mode | When it checks | Example |
|------|---------------|---------|
| **Pre-commit** | Before datoms commit | "Session recap must produce themes" |
| **In-flight** | During streaming | "LLM output must not contain diagnosis language" (checked per chunk) |
| **Post-commit** | After commit, across entities | "High-risk client must have session within 7 days" |

**In-flight validation is the new capability.** The challenge showed that LLM guardrails need to work on streaming output, not just committed results. An in-flight Contract monitors the token stream and can interrupt it if a violation is detected — before it ever becomes a datom.

**Contract subsumes Rules.** Aggregation Contracts watch a stream of low-level effect datoms and produce higher-level effect datoms — this IS what devac Rules do. C4 diagrams are generated from aggregation Contracts applied to the live Flow of handler registrations.

**State machine Contracts.** An XState machine definition is a Contract that validates the transition stream of an effectHandler — ensuring it only moves through valid states.

### 6. P2P (stream replication)

P2P replication is **stream forwarding**. A Flow on one device is forwarded to a Flow on another device. Hypercore is the transport — it replicates the append-only stream of datoms.

| Sub-concept | Stream framing |
|-------------|---------------|
| **Agent log** | Each agent's local stream of datoms |
| **Peer validation** | Contract applied to incoming stream before acceptance |
| **Peer discovery** | Finding other streams to connect to |
| **Sync** | Merging multiple streams (Autobase causal DAG) |

**Location-transparent Flows.** A Flow doesn't know if its datoms come from the local store or a remote peer. The P2P layer forwards matching datoms into the Flow. This means a Surface showing "all sessions" seamlessly includes sessions from both the MacBook and the phone — same Flow, multiple sources.

### 7. effectHandler (stream processor)

An effectHandler is a **stream processor**: it receives an input stream (effects), processes each event, and produces an output stream (datoms + downstream effects).

**Level 1 — The function (single event processor):**
```typescript
handler(state, effect): { datoms: Datom[], effects: Effect[] }
```

Processes one event at a time. Pure, testable, composable. Most handlers.

**Level 2 — The actor (continuous stream processor):**

An actor maintains a running subscription (Flow) and processes events from its mailbox continuously. It can:
- Buffer events (backpressure)
- Maintain internal state across events
- Produce streaming output (token-by-token LLM responses)
- Be interrupted mid-stream

```typescript
actor(flow: Flow, mailbox: EffectStream): AsyncGenerator<Datom | Effect>
```

**The stream processor model makes composition natural.** Handlers compose like Unix pipes — one handler's output stream is another handler's input stream. A voice recap handler streams into a transcription handler, which streams into a structuring handler. Each handler processes the stream as it arrives.

**Context compaction as stream summarization.** When a conversation stream gets too long for an LLM context window, a compaction handler reads the stream, produces a summary datom, and the downstream handler uses the summary instead. This is just stream processing — filter, transform, emit.

---

## The Stream Composition

```
Effect Stream
  → effectHandler (processes events, produces datoms + effects)
    → Datom Stream (committed to store)
      → Flow (filters matching datoms, delivers live/snapshot/replay)
        → Surface (renders the flow)
          → User Interaction Stream
            → Effect Stream (back to the top)
```

The whole system is a cycle of streams. Effects flow in, datoms flow through, Surfaces render, interactions produce more effects.

**Observability is stream metadata.** Token counts, cost, latency — all are properties of the stream. Every Flow carries metadata: how many events, how long, what source. This naturally solves the observability challenge.

---

## What Changed

| Aspect | v1.2 | v3 Stream |
|--------|------|-----------|
| Core thesis | "Everything is `(state, effect) => ...`" | "Everything flows" |
| Datom | Fact (static) | Completed stream (crystallized) |
| Lens | Query | Flow (continuous, with delivery mode) |
| Reactive subscription | Store property | Flow delivery mode (`live`) |
| Streaming | Surface concern | Native — streams are the primitive |
| Contract validation | On commit | Pre-commit, in-flight, post-commit |
| effectHandler | Function/actor | Stream processor |
| Composition | Effect dispatch | Stream piping |
| Observability | Datom audit trail | Stream metadata |

---

## The Trade-off

**Gained:** Streaming is not bolted on — it's the foundation. Progressive LLM responses, real-time collaboration, live dashboards, and committed state all use the same primitive (stream/flow). In-flight Contract validation catches problems before they become datoms. Composition as stream piping is elegant and familiar (Unix pipes, Rx observables, Node streams).

**Lost:** Conceptual simplicity of "a datom is a fact." Facts are simple. Streams are complex — they have lifecycle, backpressure, error handling, ordering guarantees. Renaming Lens to Flow adds cognitive load for a team that already knows the current vocabulary. The stream provenance metadata on datoms adds weight to the simplest primitive.

**The risk:** Over-streaming. Not everything benefits from being a stream. A validation check that returns true/false doesn't need stream semantics. The Unix pipe metaphor can lead to "everything is a pipeline" thinking, which obscures simple request-response patterns.

**The crazy beautiful part:** In-flight Contract validation. Imagine an LLM generating a session recap, and as it types "Based on my diagnosis...", a Contract fires mid-stream: "handlers in the counseling domain must never produce diagnosis language." The stream is interrupted. The LLM is re-prompted. The violation never becomes a datom. This is genuinely powerful for AI safety — and it falls naturally out of "Contracts validate streams."

**The question:** Is the stream abstraction worth the complexity cost, or should streaming remain a transport optimization (Surface concern) rather than the core primitive?

---

*Version: exploration-v3-stream — 7 concepts reframed as stream infrastructure. Core thesis: everything flows. Datom = completed stream. Lens → Flow with delivery modes. In-flight Contract validation. effectHandler = stream processor.*
