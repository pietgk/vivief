# Vivief Platform Concepts — Hybrid A

> V1 Reducer + V2 Actor Network
> Five concepts. Actors are the runtime.

---

## 1. Core Thesis

**Everything is `(state, effect) => (state', [effect'])` — running as actors.**

Five concepts model the entire vivief platform. At design time, they are simple and graspable. At runtime, they are actors — identities with Projections, message queues, and lifecycle — communicating by exchanging effects and committing datoms to a shared log.

```
Datom → Projection → Surface → Contract → effectHandler
  |         |            |          |            |
 fact    query+scope   render    constraint   transition
```

The actor model is the runtime, not the concept. You think in five concepts. The system runs as actors.

---

## 2. The Five Concepts

### 2.1 Datom

The universal fact. Unchanged.

```
[Entity, Attribute, Value, Tx, Op]
```

Immutable, append-only, self-describing. Schema is stored as datoms. Value types: text, number, date, ref, bytes, vec, encrypted, struct. The datom log is the shared memory that all actors read from and write to.

**At runtime:** The datom store is the Store Actor — it accepts commit effects and notifies actors whose Projections match the committed datoms. Reactive subscription is actor communication: the Store Actor sends notification effects to matching subscribers.

```
StoreActor.receive(:effect/commit, datoms[]) => {
  datoms: datoms,
  effects: [{ type: :effect/notify, subscribers: matching(datoms) }]
}
```

| Domain | Manifestation |
|--------|---------------|
| **devac** | Code graph — nodes, edges, external refs, effects, diagnostics |
| **Counseling app** | Clinical data — clients, sessions, treatment plans, AI suggestions |

### 2.2 Projection

**Lens + Seal merged into one concept.**

A Projection defines: what datoms are visible, who can see them, and how deep the view goes. It combines query (old Lens), access control (old Seal authorization), and encryption scope (old Seal confidentiality).

```typescript
interface Projection {
  // Query (was Lens)
  filter: DatomQuery
  sort: SortSpec
  group?: GroupSpec
  depth?: DepthSpec

  // Access (was Seal authorization)
  capability: CapabilityToken
  scope: "own" | "consented" | "all"

  // Encryption (was Seal confidentiality)
  decryptionKey?: DerivedKey
}
```

**Why one concept:** You never use a query without access control in production. You never enforce access control without a query. A capability IS a Projection: "Client Maria can read her own data" = `Projection({ scope: 'own', entity: 'client:42', decryptionKey: mariaKey })`.

**Key derivation** follows the same model as current Seal — one passphrase → PBKDF2 → master key → HKDF per-entity keys. The key derivation maps directly to Corestore's built-in HKDF. Roles (owner, scoped user, AI agent, system) constrain which Projections can be constructed.

**Trust zones.** Actors exist in trust zones defined by their Projection's capability:

| Trust Zone | Projection Scope | Decryption |
|------------|-----------------|------------|
| Owner | `all` | Master key (derives all) |
| Scoped user | `own` | Portal key (own data only) |
| AI agent | `consented` | AI key (consented entities) |
| System | metadata only | No decryption keys |

**At runtime:** A Projection is an actor's subscription declaration — what part of the shared memory it watches. When the Store Actor commits datoms matching an actor's Projection, that actor receives a notification effect.

A saved Projection is what other tools call a "view," "dashboard," "capability," or "workspace." Projections are themselves datoms — versioned, composable, shareable.

**Consent as datom.** Every privacy decision is stored as an auditable datom with a Why chain. Revoking consent = retraction datom → key rotation as downstream effect. Granting AI access = spawning an AI actor with a Projection scoped to consented entities. Revoking = stopping that actor and rotating keys.

| Domain | Manifestation |
|--------|---------------|
| **devac** | MCP tool query parameters, CLI views, workspace hub queries |
| **Counseling app** | "Morning prep" board, client portal view, AI consent scope |

### 2.3 Surface

The renderer. Takes a Projection and the datom store and produces output.

```
Surface = render(Projection, DatomStore, EffectStream?)
```

| Mode | Input | Output |
|------|-------|--------|
| **Stream** | Time-ordered datoms | Activity feed, chat, notifications |
| **Card** | Single entity datoms | Detail page, form, record |
| **Canvas** | Block datoms + CRDT state | Document, notes, Jupyter blocks |
| **Dialog** | Effect stream (in-flight) | AI chat with streaming tokens |
| **Board** | Grouped datoms | Kanban, calendar, roster |
| **Diagram** | Contract + effect datoms | C4, XState viz, sequence diagram |

**Diagram mode.** Surface encompasses system visualization, not just end-user UI. A C4 diagram is a Surface rendering Contract + handler datoms through a system-level Projection. An XState visualization is a Surface rendering handler state machine datoms. A Storybook story is a Surface with a fixture Projection: `Story = Surface(Projection(fixture-datoms))`.

**EffectStream input.** Dialog mode renders tokens as they arrive from an LLM effectHandler actor. The stream is transient — only the final result becomes datoms. Streaming is natural actor communication: the LLM actor sends token effects to the Surface actor.

**At runtime:** A Surface is a rendering actor:
- **Subscribes** to datoms via its Projection
- **Receives** state updates when matching datoms commit
- **Renders** output (UI, CLI, diagram, document)
- **Emits** effects when the user interacts (click → effect, voice → effect)

```
SurfaceActor = {
  identity: :surface/morning-prep,
  projection: { filter: todaySessions, mode: "board" },
  receive: (stateUpdate) => render(stateUpdate),
  receive: (userAction) => { effects: [actionToEffect(userAction)] },
  protocol: { accepts: [:effect/state-update, :effect/user-action],
              emits: [:effect/session-open, :effect/status-change] }
}
```

| Domain | Manifestation |
|--------|---------------|
| **devac** | CLI output, MCP responses, C4 diagrams, status display |
| **Counseling app** | Stream, Card, Canvas, Dialog, Board — the five modes + Diagram |

### 2.4 Contract

A Contract is a datom that declares expected behavior. Simultaneously **spec**, **test**, and **runtime guard**. Absorbs devac's Rules and XState state machine definitions.

```
Contract = (pattern: DatomQuery, constraint: Guard | Aggregation | StateMachine)
```

| Mode | What it does | Example |
|------|-------------|---------|
| **Guard** | Reject invalid transitions | "Session recap must produce themes, never diagnosis" |
| **Aggregation** | Derive higher-level facts from lower-level patterns | "HTTP calls aggregate into IO.HTTP" (was devac Rules) |
| **StateMachine** | Define valid states and transitions for a handler | XState machine definition = Contract for that handler |

**Guard mode** is the current Contract — schema validation, effect constraints, cross-entity invariants. Three levels: Schema (structural), Effect (handler output), Invariant (business rules).

**Aggregation mode** subsumes devac's Rules. Both are `pattern over datoms/effects → derived knowledge`. C4 diagrams are generated from aggregation Contracts applied to effect datoms — always up-to-date, always consistent with runtime validation. The C4 zoom pattern IS the Contract hierarchy: System Contracts aggregate Container Contracts, which aggregate Component Contracts.

**StateMachine mode** makes effectHandler logic visible. An XState machine definition IS the Contract for that handler — it declares valid states, transitions, and what effects each state can produce. Design in Stately Studio first, implement the handler second. The machine definition is the spec; runtime validates the handler follows it.

**At runtime:** Contracts define actor protocols — what messages actors accept and emit. When actor A sends an effect to actor B, the Contract defines the message schema. This is typed message passing. Contract violations produce violation datoms, making the audit trail part of the datom log.

Contracts are datoms — versioned, auditable, queryable. They evolve through the same effectHandler flow as any other change.

| Domain | Manifestation |
|--------|---------------|
| **devac** | Lint rules, type-checks, effect-domain-rules (now aggregation Contracts), C4 generation |
| **Counseling app** | Clinical workflow constraints, AI guardrails, regulatory compliance |

### 2.5 effectHandler

The universal control pattern. Two zoom levels: function and actor.

**Level 1 — The function (transition logic):**

```typescript
handler(state: State, effect: Effect): { datoms: Datom[], effects: Effect[] }
```

Pure, testable, composable, stateless. State comes from outside via Projection. Most handlers only need this level.

**Level 2 — The actor (runtime identity):**

When a handler needs long-running workflow, message queue, or coordination, it runs as an actor:

| Actor property | What it adds |
|----------------|-------------|
| **Identity** | Entity ID in datom store |
| **Projection** | Scoped datom subscription |
| **Message queue** | Ordered effect intake with backpressure |
| **Lifecycle** | Spawn, run, stop (cancellation, cleanup) |
| **Typed protocol** | Declared input/output effect types (= Contract) |

The function IS the actor's `receive` logic. The actor adds the runtime envelope. This matches XState v5: `createMachine()` = function, `createActor(machine)` = actor.

**The principle:** Start with a function. Promote to an actor only when you need identity, lifecycle, or a message queue.

| Scenario | Level | Why |
|----------|-------|-----|
| Validate session notes | Function | Stateless check |
| Format recap output | Function | Pure transformation |
| Schema migration | Function | One-shot read/write |
| Session-recap workflow | Actor | Multi-step, needs cancellation |
| AI analysis loop | Actor | Persistent subscription, own dispatch cadence |
| Multi-device claim coordination | Actor | Identity for "I claimed this" datoms |

**Handler registration is a datom:**
```
[:handler/session-recap-v2  :handler/effect-type   :effect/session-recap           tx:N  true]
[:handler/session-recap-v2  :handler/module-path   "dist/handlers/session-recap.v2.mjs"  tx:N  true]
[:handler/session-recap-v2  :handler/active         true                            tx:N  true]
```

**Deployment is a datom mutation.** Register handler, enable feature flag, gate behind Contract. No server restart.

**Reactive subscription** remains a property of the datom store (the Store Actor), not something handlers produce. When datoms commit, the Store Actor notifies actors whose Projections match. No handler ever specifies who to notify.

| Domain | Manifestation |
|--------|---------------|
| **devac** | `devac sync` = effectHandler over AST; validation pipeline as effect chain |
| **Counseling app** | Voice recap → structured notes → AI analysis = effectHandler cascade |

---

## 3. The Actor Runtime

At runtime, the five concepts become actors communicating via effects:

```
HumanActor (counselor)
  → emits :effect/voice-input
    → DispatcherActor resolves to SessionRecapActor
      → SessionRecapActor.receive(:effect/voice-input)
        → emits :effect/transcribe to TranscriberActor
          → TranscriberActor streams tokens to SurfaceActor
          → TranscriberActor commits transcript datoms to StoreActor
            → StoreActor notifies SessionRecapActor (Projection match)
              → SessionRecapActor transitions to 'structuring'
                → emits :effect/structure to StructurerActor
                  → ... cascade continues ...
        → StoreActor notifies MorningPrepSurfaceActor (Projection match)
          → MorningPrepSurfaceActor re-renders board
```

Every arrow is an actor sending an effect. The entire flow is visible as a message sequence diagram — which is itself a Surface actor rendering Tx history datoms through a time-range Projection.

**Location transparency.** The actor model gives P2P for free:

| Actor Location | Transport |
|----------------|-----------|
| Same process | Direct function call |
| Same machine, different process | Protomux over Unix socket |
| Different machine | Protomux over Hyperswarm |

The actor doesn't know where its peer is. The dispatcher resolves location transparently.

---

## 4. Composition

| Composition | What it produces |
|-------------|-----------------|
| **Datom + Projection** | Scoped, authorized, decrypted view of state |
| **Projection + Surface** | Rendered output (UI, diagram, CLI) |
| **Datom + Contract** | Validated, aggregated, state-machine-governed facts |
| **effectHandler + Contract** | Constrained transitions with visible state machines |
| **Surface + Contract** | `Story = Surface(Projection(fixture-datoms))` — testable, documented components |
| **All five** | The vivief platform |

---

## 5. What Disappeared

| Old Concept | Where It Went | Why |
|-------------|--------------|-----|
| **Lens** | → Projection (query) | Never used without access scope in production |
| **Seal** | → Projection (capability + encryption) | Authorization was always a query constraint |
| **P2P** | → Infrastructure (remote actors) | Describes how datoms replicate, not what they are |
| **Rules** (devac) | → Contract (aggregation mode) | Same pattern: datoms/effects → derived knowledge |

### P2P as infrastructure

P2P's four sub-concepts (agent log, peer validation, peer discovery, sync) move to infrastructure. The five concepts work identically on SQLite, Hypercore, or in-memory. P2P is a deployment choice.

**Peer validation stays conceptual** — it's Contract enforcement on incoming replicated datoms. A remote actor's datoms are validated against the same Contracts as local ones.

---

## 6. Infrastructure

### The Holepunch stack

| P2P sub-concept | Holepunch module | Actor framing |
|-----------------|-----------------|---------------|
| **Agent log** | Hypercore | Each agent's append-only actor log |
| **Agent log** (index) | Hyperbee | B-tree for persistent Projection results |
| **Key derivation** | Corestore | Master key → HKDF per-entity keys (= Projection encryption) |
| **Sync** | Autobase | Multi-writer causal DAG for remote actor coordination |
| **Peer discovery** | HyperDHT + Hyperswarm | Finding remote actors |
| **IPC** | Protomux | Same protocol for local and remote actors |
| **Handler artifacts** | Hyperdrive | Handler modules replicated to all devices |

### Embedded vs. daemon

- **Embedded** (single process): All actors in one process. Direct function calls. Zero IPC.
- **Daemon** (multi-client): Store Actor owns the log. Surface actors, MCP, phone app connect via Protomux IPC.

### What you build on top

- In-memory datom store (4 Map indexes as hot cache over Hyperbee)
- DatomQuery API (typed query builder)
- Dispatcher (handler resolution, Contract validation, datom commit, effect dispatch)
- Surface renderers (CLI, web, native, MCP output modes)

---

## 7. The Trade-off

**Gained:**
- 5 concepts instead of 7. Tighter, less ambiguity ("is authorization Seal or Lens?" → it's Projection).
- Contract is more powerful: Guard + Aggregation + StateMachine. Subsumes Rules, enables C4 from Contracts.
- Actor runtime gives streaming (actor messages), location transparency (P2P), composition (typed protocols), interruptibility (stop actor), and observability (lifecycle datoms) — without adding concepts.
- Surface includes system visualization (Diagram mode).

**Lost:**
- P2P as first-class concept signals "this is a P2P-first platform." Demoting it to infrastructure may make it feel optional.
- Seal's distinct identity (encryption, consent, key derivation) gets folded into Projection. The cryptographic story is still there but less prominent.
- Projection is a larger concept than Lens or Seal individually.

**The balance:** The actor runtime is an implementation model, not a concept. You don't need to understand actors to understand "Projection = what you can see, Surface = how it renders." The actor framing helps implementers; the 5 concepts help everyone.

---

*Version: hybrid-a — 5 concepts (Datom, Projection, Surface, Contract, effectHandler) with actor runtime. Merges Lens+Seal→Projection, Rules→Contract, P2P→infrastructure. Actor model provides streaming, location transparency, and composition.*
