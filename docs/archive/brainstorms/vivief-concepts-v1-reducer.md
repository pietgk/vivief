# Vivief Platform Concepts — V1 "The Reducer"

> Intermediate exploration: what if we aggressively merge overlapping concepts?
> Goal: find the minimum concept set that still covers everything.

---

## Core Thesis

**Five concepts. Not seven.**

The challenge document revealed overlaps: Lens is always used through Surface, Seal's authorization half is a Lens property, Contract subsumes Rules, and P2P is an infrastructure concern — not a concept at the same level as the others. What if we stop pretending they're all peers?

```
Datom → Projection → Surface → Contract → effectHandler
  |         |            |          |            |
 fact    query+scope   render    constraint   transition
```

---

## The Five Concepts

### 1. Datom

Unchanged. `[Entity, Attribute, Value, Tx, Op]`. The universal fact. Append-only, immutable, self-describing.

This is the bedrock. Nothing merges into it, nothing merges out of it.

### 2. Projection

**Lens + Seal merged into one concept.**

A Projection defines: what datoms are visible, who can see them, and how deep the view goes. It combines query (old Lens), access control (old Seal authorization), and encryption scope (old Seal confidentiality) into one thing.

```typescript
interface Projection {
  // Query (was Lens)
  filter: DatomQuery
  sort: SortSpec
  group?: GroupSpec
  depth?: DepthSpec

  // Access (was Seal authorization)
  capability: CapabilityToken    // Who can construct this Projection
  scope: "own" | "consented" | "all"

  // Encryption (was Seal confidentiality)
  decryptionKey?: DerivedKey     // If present, V values are decrypted
}
```

**Why this works:** You never use a Lens without access control in production. You never enforce access control without a query. They were always one thing — we just described them separately. The insight from the challenge: open-webui's `AccessGrant` model is essentially a Projection — it binds resource filtering to principal identity.

A saved Projection is what other tools call a "view," "dashboard," "capability," or "workspace."

**Key insight preserved:** A capability IS a Projection. "Client Maria can read her own data" = `Projection({ scope: 'own', entity: 'client:42', decryptionKey: mariaKey })`.

### 3. Surface

Absorbs rendering modes AND streaming. The challenge identified that Surface needs to handle both committed datom snapshots and in-flight effect streams.

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

**New: Diagram mode.** The challenge showed Surface should encompass system visualization. A C4 diagram is a Surface. An XState visualization is a Surface. Adding Diagram mode makes this explicit without adding a concept.

**New: EffectStream input.** Dialog mode can render tokens as they arrive from an LLM effectHandler. The stream is transient — only the final result becomes datoms. This solves the progressive/streaming values challenge.

### 4. Contract

**Absorbs Rules, validation, and state machine definitions.**

The challenge's biggest insight: devac's Rules and vivief's Contract are the same pattern. Both are `pattern over datoms/effects → derived knowledge`. Contract becomes more powerful:

```
Contract = (pattern: DatomQuery, constraint: Assertion | Aggregation | StateMachine)
```

Three modes of Contract:

| Mode | What it does | Example |
|------|-------------|---------|
| **Guard** | Reject invalid transitions | "Session recap must produce themes, never diagnosis" |
| **Aggregation** | Derive higher-level facts from lower-level patterns | "HTTP calls aggregate into IO.HTTP" (was Rules) |
| **StateMachine** | Define valid states and transitions for a handler | XState machine definition = Contract for that handler |

**Why StateMachine belongs in Contract:** The challenge showed that an XState machine definition IS a Contract — it declares what states exist, what transitions are valid, what effects each state can produce. Designing the machine first (in Stately Studio) means designing the Contract first. The handler implementation then fulfills the Contract.

**C4 from Contracts:** C4 zoom levels map to Contract hierarchy. System-level Contracts aggregate Container-level Contracts, which aggregate Component-level Contracts. The C4 diagram is generated from this hierarchy — always up-to-date, always consistent with runtime validation.

### 5. effectHandler

**Two zoom levels (function and actor), unchanged from v1.2 but with explicit actor semantics.**

The function: `(state, effect) => (state', [effect'])`
The actor: function + identity + message queue + lifecycle

What's different in this version: the actor level is not optional flavor — it's the **default runtime model**. Every handler instance is an actor. Simple handlers just happen to be actors with no persistent state and immediate completion (stateless actors). This unifies:

- Composition: actors with typed protocols
- Interruptibility: actors receive cancel messages
- Observability: actors emit lifecycle datoms (spawned, completed, failed, cancelled)
- Context management: compaction is an actor that manages its own context window

**Reactive subscription** remains a property of the datom store, not a concept. When datoms commit, matching Projections are notified. Unchanged.

---

## What Disappeared

| Old Concept | Where It Went | Why |
|-------------|--------------|-----|
| **Lens** | → Projection (query half) | Never used without access scope in production |
| **Seal** | → Projection (access + encryption) | Authorization was always a query constraint; encryption is per-Projection |
| **P2P** | → Infrastructure section | Agent log, peer discovery, sync are deployment concerns, not data model concepts |
| **Rules** (devac) | → Contract (aggregation mode) | Same pattern as Contract validation |

### P2P as infrastructure (not concept)

P2P's four sub-concepts (agent log, peer validation, peer discovery, sync) move to the infrastructure section alongside Holepunch. The rationale: P2P describes **how datoms replicate**, not **what datoms are**. The five concepts above work identically whether running on a single SQLite database or across Hypercore peers. P2P is a deployment choice, like choosing PostgreSQL vs. SQLite.

**Peer validation stays conceptual** — it's Contract validation applied to incoming replicated datoms. This naturally falls out of Contract, not P2P.

---

## Composition

| Composition | What it produces |
|-------------|-----------------|
| **Datom + Projection** | Scoped, authorized view of state |
| **Projection + Surface** | Rendered output (UI, diagram, CLI) |
| **Datom + Contract** | Validated, aggregated, state-machine-governed facts |
| **effectHandler + Contract** | Constrained transition logic with visible state machines |
| **All five** | The vivief platform |

---

## The Trade-off

**Gained:** Fewer concepts. Tighter composition. No "is authorization Seal or Lens?" confusion. Contract is more powerful (subsumes Rules + state machines). Surface handles streaming and system visualization.

**Lost:** P2P as a first-class concept signals intent — "this is a P2P-first platform." Demoting it to infrastructure might make it feel optional. Merging Lens + Seal into Projection creates a larger, more complex single concept. Seal's encryption story (key derivation, consent-as-datom) might get lost inside Projection.

**The question:** Is the conceptual clarity worth the loss of P2P's first-class status and Seal's distinct identity?

---

*Version: exploration-v1-reducer — 5 concepts: Datom, Projection, Surface, Contract, effectHandler. Merges Lens+Seal→Projection, absorbs Rules→Contract, demotes P2P→infrastructure.*
