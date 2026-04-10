# Vivief Platform Concepts — V2 "The Actor Network"

> Intermediate exploration: what if the actor model is the core thesis, not the formula?
> Goal: see what happens when identity, communication, and lifecycle are primary.

---

## Core Thesis

**Everything is an actor.**

The v1.2 insight was right — effectHandler has two zoom levels (function and actor). But what if we zoom out further? The datom store is an actor. Each Surface is an actor. The dispatcher is an actor. The AI loop is an actor. The human is an actor. P2P peers are actors.

The formula `(state, effect) => (state', [effect'])` is still true — but it's not the thesis. The thesis is:

**The system is a network of actors that communicate by exchanging effects and committing datoms to a shared log.**

```
Actor = {
  identity: EntityId,
  state: Lens view of datom store,
  receive: (effect) => { datoms: Datom[], effects: Effect[] },
  protocol: { accepts: EffectType[], emits: EffectType[] },
  lifecycle: spawn | running | stopping | stopped
}
```

This is XState v5's actor model, applied to the entire platform.

---

## Seven Concepts — Reframed as Actor Infrastructure

The concepts are the same seven. But the organizing principle shifts from "data model" to "actor system."

### 2.1 Datom — The Shared Memory

Unchanged as a data structure. But reframed: datoms are not "the foundation" — they are the **shared memory** that actors read from and write to. The datom log is itself an actor (the Store Actor) that accepts commit effects and notifies subscribers.

```
StoreActor.receive(:effect/commit, datoms[]) => {
  datoms: datoms,           // committed
  effects: [                // notify subscribers
    { type: :effect/notify, subscribers: matching(datoms) }
  ]
}
```

**Reactive subscription is actor communication.** When the Store Actor commits datoms, it sends notification effects to all actors whose subscriptions match. This is not a "store property" — it's message passing between actors.

### 2.2 Lens — The Actor's View

A Lens is an actor's **subscription declaration** — what part of the shared memory it watches. Each actor has exactly one Lens (its view of the world). When the Store Actor commits datoms matching an actor's Lens, the actor receives a notification.

```typescript
interface Lens {
  filter: DatomQuery    // What this actor can see
  sort: SortSpec
  depth?: DepthSpec
  mode?: SurfaceMode    // Only for Surface actors
}
```

**New framing:** A Lens is not a query you run — it's a standing subscription that defines an actor's perception. The actor doesn't "query the store" — it "sees datoms that match its Lens, updated reactively."

### 2.3 Surface — A Rendering Actor

A Surface is an actor that:
- **Subscribes** to datoms via its Lens
- **Receives** state updates when matching datoms are committed
- **Renders** output (UI, CLI, diagram, document)
- **Emits** effects when the user interacts (click → effect, voice → effect)

```
SurfaceActor = {
  identity: :surface/morning-prep,
  state: Lens({ filter: todaySessions, mode: "board" }),
  receive: (stateUpdate) => render(stateUpdate),
  receive: (userAction) => { effects: [actionToEffect(userAction)] },
  protocol: { accepts: [:effect/state-update, :effect/user-action],
              emits: [:effect/session-open, :effect/status-change, ...] }
}
```

**Streaming as actor communication.** An LLM handler actor sends token effects to a Surface actor as they arrive. The Surface renders them progressively. When the LLM actor completes, it sends a final commit effect to the Store Actor. No special "streaming" concept needed — it's just actors sending messages.

**System visualization.** A C4 diagram Surface actor subscribes to Contract and handler registration datoms. An XState visualization actor subscribes to handler state machine definition datoms. These are just Surface actors with different Lenses — no special treatment.

### 2.4 Seal — The Trust Boundary Actor

Reframed: the Seal is not just encryption — it's a **trust boundary** in the actor network. Actors exist in trust zones:

```
Trust Zone: Owner
  ├── All handler actors (full access)
  ├── All surface actors (full view)
  └── Store actor (full log)

Trust Zone: Client Portal
  ├── Client surface actor (Lens: own data only)
  └── Client key (decrypts own V values)

Trust Zone: AI
  ├── AI analysis actor (Lens: consented data)
  └── AI key (decrypts consented V values)

Trust Zone: System
  ├── Routing actors (metadata only, no V decryption)
  └── P2P sync actors (replicate encrypted, can't read)
```

Each actor's Lens is constrained by its trust zone. An actor in the Client Portal zone physically cannot construct a Lens that sees other clients' data — the capability token restricts it.

**Consent as actor protocol.** Granting AI access = spawning an AI actor in a trust zone with a Lens scoped to the consented entities. Revoking = stopping that actor and rotating keys.

### 2.5 Contract — The Protocol Definition

In an actor system, **protocols** define what messages actors accept and emit. A Contract IS a protocol definition:

```typescript
interface Contract {
  // What this handler actor accepts
  accepts: { effectType: string, schema: DatomQuery }

  // What it must produce (guard)
  produces: { required: AttributeKw[], forbidden: AttributeKw[] }

  // Valid state transitions (state machine)
  stateMachine?: XStateMachineDefinition

  // Aggregation rules (subsumes devac Rules)
  aggregates?: { pattern: DatomQuery, produces: EffectType }
}
```

**Contracts are actor protocols.** When actor A sends an effect to actor B, the Contract defines the message schema. This is typed message passing — the same thing XState v5 does with `types.events` and `types.context`.

**Contract hierarchy = C4 zoom.** System-level Contracts define coarse actor protocols ("the clinical system accepts session effects"). Container-level Contracts refine them ("the session-recap actor accepts voice effects, produces structured notes"). Component-level Contracts specify the full state machine.

### 2.6 P2P — Remote Actors

P2P is not a separate concern — it's actors communicating across process and network boundaries. A local actor sends effects via function calls. A remote actor sends effects via Protomux/Hypercore.

| Actor Location | Communication | Transport |
|----------------|--------------|-----------|
| Same process | Direct function call | None (in-memory) |
| Same machine, different process | IPC | Protomux over Unix socket |
| Different machine, same network | P2P | Protomux over Hyperswarm |
| Different machine, internet | P2P | Protomux over HyperDHT relay |

**The actor doesn't know where its peer is.** The dispatcher resolves location transparently — same API whether the target actor is in-process or on another continent. This is the actor model's location transparency.

**Peer validation = Contract enforcement on remote actors.** When datoms arrive from a remote actor, the Store Actor validates them against Contracts before accepting. Same Contract, same validation — the only difference is the transport.

### 2.7 effectHandler — The Actor Definition

An effectHandler is now explicitly an **actor definition**. The function level is the actor's `receive` logic. The actor level is the full runtime identity.

```typescript
// The actor definition (Level 1 — the logic)
const sessionRecap = createMachine({
  id: 'session-recap',
  initial: 'idle',
  states: {
    idle: { on: { ':effect/voice-input': 'transcribing' } },
    transcribing: { on: { ':effect/transcript-ready': 'structuring' } },
    structuring: { on: { ':effect/structured': 'analyzing' } },
    analyzing: { on: { ':effect/analysis-complete': 'idle' } },
  }
})

// The actor instance (Level 2 — the runtime)
const recapActor = createActor(sessionRecap, {
  lens: { filter: { attribute: ':session/*' } },
  identity: ':handler/session-recap-v2',
})
```

**Every handler is an actor.** Simple handlers are stateless actors (one state, one transition, immediate completion). Complex handlers are stateful actors with explicit state machines. The spectrum is continuous, not binary.

---

## The Actor Network in Action

### A voice recap flows through the network:

```
HumanActor (counselor)
  → emits :effect/voice-input
    → DispatcherActor resolves to SessionRecapActor
      → SessionRecapActor.receive(:effect/voice-input)
        → emits :effect/transcribe to TranscriberActor
          → TranscriberActor streams tokens to SurfaceActor (progressive rendering)
          → TranscriberActor commits transcript datoms to StoreActor
            → StoreActor notifies SessionRecapActor (Lens match)
              → SessionRecapActor transitions to 'structuring'
                → emits :effect/structure to StructurerActor
                  → ... cascade continues ...
        → StoreActor notifies AISurfaceActor (Lens match on :session/*)
          → AISurfaceActor re-renders morning prep board
```

Every arrow is an actor sending an effect to another actor. The entire system is visible as a **message sequence diagram** — which is itself a Surface actor rendering Tx history datoms.

---

## What Changed

| Aspect | v1.2 | v2 Actor Network |
|--------|------|-----------------|
| Core thesis | "Everything is `(state, effect) => ...`" | "Everything is an actor" |
| Reactive subscription | Store property | Actor message passing |
| Surface | Renderer | Rendering actor |
| Streaming | Surface concern | Actor-to-actor token stream |
| P2P | Separate concept | Remote actors, same protocol |
| Seal | Encryption model | Trust zone boundaries |
| Composition | Concept pairs | Actor protocols (Contracts) |

---

## The Trade-off

**Gained:** Streaming is natural (actors send messages). Location transparency (local = remote). Composition is formal (typed protocols). Interruptibility is built in (stop an actor). Observability is natural (actors emit lifecycle datoms). The whole system is visualizable as an actor network diagram.

**Lost:** Simplicity of "it's just a function." The actor model is heavier conceptually — spawning, mailboxes, supervision, lifecycle. For a validation handler that checks if a field exists, an actor is massive overkill. The "start with a function" principle from v1.2 gets overwhelmed by "everything is an actor."

**The risk:** Actor model enthusiasm can lead to over-engineering. Erlang/OTP, Akka, and Orleans are powerful but complex. vivief's strength is "7 concepts, any counselor can understand the model." Making everything an actor might break that accessibility.

**The question:** Is the actor model the right organizing principle for the whole platform, or just for effectHandler's runtime level?

---

*Version: exploration-v2-actor-network — 7 concepts reframed as actor infrastructure. Core thesis: everything is an actor communicating via effects. Reactive subscription = actor messages. Streaming = actor-to-actor. P2P = remote actors.*
