# Vivief Platform Concepts

> The unified conceptual foundation for the vivief platform.
> Replaces the devac-specific concepts.md and foundation.md with platform-level concepts that span both development tooling and application domains.

---

## 1. Core Thesis

**Everything is `(state, effect) => (state', [effect'])`.**

The effectHandler formula is the universal pattern. It models code analysis, clinical workflows, UI interactions, AI reasoning, and the development process itself. State is always datoms. Effects are always immutable descriptions of intent. Handlers are always pure functions that read state and produce new datoms plus downstream effects.

```
effectHandler = (state, effect) => (state', [effect'])
```

| Component | What it is |
|-----------|------------|
| **State** | A point-in-time query over the datom log. `State = f(Lens, DatomLog)` |
| **Effect** | An immutable description of intent: What (new datoms), How (handler), Why (reasoning) |
| **State'** | The datom log after new facts are committed. Append-only — history is never lost. Reactive subscription automatically notifies observers of the transition |
| **[Effect']** | Downstream effects to be dispatched — each routed to its own handler, producing further (State'', [Effect'']) cascades |

**Deterministic-first principle**: Always push work into the deterministic world (systems handle it) before falling back to reasoning (LLMs/humans handle it). The boundary between deterministic and non-deterministic shifts as LLMs improve — the concepts remain stable.

---

## 2. Seven First-Class Concepts

Seven concepts compose to model the entire vivief platform. Each is defined once and manifests in both the development domain (devac) and the application domain (counseling app).

### 2.1 Datom

The universal fact primitive. Inspired by Datomic's immutable fact model.

```
[Entity, Attribute, Value, Tx, Op]
```

| Field | Description | Example |
|-------|-------------|---------|
| Entity | Unique identifier for the thing | `client:42`, `handler:session-recap`, `node:myrepo:fn:abc123` |
| Attribute | What property of the entity | `:client/name`, `:node/kind`, `:handler/effect-type` |
| Value | The value (typed: text, number, date, ref, bytes, vec, encrypted) | `"Maria"`, `"function"`, `true` |
| Tx | Transaction identifier (monotonic, timestamped) | `tx:1087` |
| Op | Assert (true) or Retract (false) | `true` |

**Key properties:**
- **Immutable.** Datoms are never modified. A "change" is a retraction + assertion in a new Tx.
- **Append-only.** The log only grows. Any historical state is reproducible via `asOf(tx)`.
- **Self-describing.** Schema is stored as datoms. Adding an attribute = asserting schema datoms. No migrations.
- **Typed values.** V carries type information — text, number, date, ref (to another entity), bytes, vec (embedding), encrypted (sealed), or **struct** (a typed record with named fields).

**Scalar V vs Struct V.** Most attributes have scalar values — these support per-value indexing and history. Some attributes have struct values (typed records) — these support per-attribute indexing and history at struct granularity. The choice is principled: if sub-fields need independent querying, indexing, or history tracking, they must be separate scalar datoms. If the value is semantically atomic (you never put a WHERE clause on a sub-field independently), it belongs in a struct V. See the [struct-as-value analysis](../spec/counseling/viviefco-architecture-ideas.md#struct-as-value-a-thorough-analysis-of-compound-v-in-the-datom-model) for the full rationale, memory optimization techniques, and migration path.

| Domain | Manifestation |
|--------|---------------|
| **devac** | Code graph — nodes, edges, external refs, effects, diagnostics all as datoms |
| **Counseling app** | Clinical data — clients, sessions, treatment plans, AI suggestions, check-ins |

The datom model is the constant across all deployment and replication choices. Everything else — PostgreSQL, SQLite, Hypercore, in-memory — is a storage/transport decision. The data shape stays `[E, A, V, Tx, Op]`.

### 2.2 Lens

A Lens is a query combined with rendering intent. It defines **which datoms are visible** and **how they should be rendered**.

```typescript
interface Lens {
  filter: DatomQuery   // Which entities/attributes to include
  sort: SortSpec       // Time, attribute value, relevance
  group?: GroupSpec    // Group by attribute (enables Board mode)
  mode: SurfaceMode   // How to render: "stream" | "card" | "canvas" | "dialog" | "board"
  depth?: DepthSpec   // How deep to follow references
}
```

The `DatomQuery` type is the single query model for the entire system. It is used for Lens filters, Seal enforcement, Contract invariants, and dispatcher state reads — one query language everywhere.

```typescript
interface DatomQuery {
  entity?: EntityId | EntityId[]
  attribute?: AttributeKw           // exact or wildcard (":handler/*")
  where?: WhereClause[]             // additional filters (ANDed)
  asOf?: TxId                       // time-travel
  depth?: "own" | "refs" | "all"    // reference traversal depth
  limit?: number
}
```

A saved Lens is what other tools call a "view," "dashboard," or "workspace." Lenses are themselves datoms — versioned, composable, shareable.

| Domain | Manifestation |
|--------|---------------|
| **devac** | MCP tool query parameters, CLI query commands, `devac status` views |
| **Counseling app** | "Morning prep" board, "Maria's journey" card, "AI suggestions" stream |

**Key insight: a Seal capability IS a Lens.** "Client Maria can read her own data" = a Lens `{ entity: 'client:42', depth: 'own' }` combined with her decryption key. The query engine that renders Surfaces also enforces access control.

### 2.3 Surface

The Surface is the renderer. It takes a Lens and the datom store and produces output. Five modes that morph based on context:

| Mode | What it absorbs | Rendering |
|------|-----------------|-----------|
| **Stream** | Activity feed, chat, notifications, session history | Time-ordered datoms flowing past |
| **Card** | Detail page, entity profile, form, record view | One entity, all its datoms, as typed attributes |
| **Canvas** | Document, session notes, treatment plan, Jupyter-style blocks | Block-based, CRDT-synchronized document |
| **Dialog** | AI chat, voice command, quick capture | Conversational input → Effect proposal |
| **Board** | Kanban, table, calendar, roster | Cards arranged spatially by grouping attribute |

Surfaces morph based on what the user is looking at, doing, and how they're interacting. Transitions are animated morphs, not page navigations. The datoms stay — only the rendering shifts.

| Domain | Manifestation |
|--------|---------------|
| **devac** | CLI output, MCP response formatting, status display, C4 diagram generation |
| **Counseling app** | Stream, Card, Canvas, Dialog, Board — the five modes replace ClickUp, Notion, Slack, CRM, EHR, calendar |

### 2.4 Seal

The Seal is the privacy model — identity, capability, and encryption boundary. It emerges from combining a Lens with cryptographic enforcement.

**Deterministic key derivation.** One passphrase → PBKDF2 → master key → HKDF per-entity keys. No key database, no key server. Keys exist only in memory during a session.

**Selective value encryption.** Only the V field of sensitive datoms is encrypted. E, A, Tx, Op remain cleartext for routing, indexing, and querying. Which attributes are sensitive is defined in the schema (as datoms).

**Roles and capabilities:**

| Role | Key held | Can see | Can do |
|------|----------|---------|--------|
| Owner | Master key (derives all) | All data | Read all, write all, grant/revoke |
| Scoped user | Portal key (own data only) | Own datoms | Read own, limited write |
| AI agent | AI key (per consented entity) | Consented data | Read consented, write drafts only |
| System | No decryption keys | Metadata only (E + A + Tx) | Route, index, schedule |

**Consent as datom.** Every privacy decision is stored as an auditable datom with a Why chain. Revoking consent = retraction datom → key rotation as downstream Effect'.

| Domain | Manifestation |
|--------|---------------|
| **devac** | Corestore master key per workspace; derived keys per repo |
| **Counseling app** | Counselor passphrase → per-client keys; client portal keys; AI consent keys |

**Implementation note:** The Seal's key derivation maps directly to Corestore's built-in HKDF (see section 6.1). Zero additional cryptographic code needed.

### 2.5 Contract

A Contract is a datom that declares expected behavior. It is simultaneously **spec** ("what should happen"), **test** ("did it happen?"), and **runtime guard** ("prevent it from not happening"). Contracts are enforced by the dispatcher on every effect execution — not just during testing.

Three levels:

| Level | What it checks | Example |
|-------|----------------|---------|
| **Schema** | Structural validity of entities | "A client must have a name and status" |
| **Effect** | Handler output validity | "A session recap must produce themes, never a diagnosis" |
| **Invariant** | Cross-entity business rules | "A high-risk client must have a session within 7 days" |

Contracts are datoms — versioned, auditable, queryable. They evolve through the same effectHandler flow as any other change. Contract violations produce violation datoms, making the test report part of the datom log.

Invariant conditions use DatomQuery — the same query model used by Lens and Seal:
```typescript
// "high-risk client must have session within 7 days"
{
  attribute: ':schedule/*',
  where: [{ attribute: ':schedule/date', op: 'within', value: '7d', direction: 'future' }]
}
```

| Domain | Manifestation |
|--------|---------------|
| **devac** | Lint rules as executable specs; type-check, test-check as Contracts |
| **Counseling app** | Clinical workflow contracts; AI guardrails; regulatory compliance rules |

### 2.6 P2P

The peer-to-peer layer makes datoms replicate without central servers. P2P is defined here as abstract concepts; the Holepunch stack mapping in section 6 is the chosen implementation.

#### Four P2P sub-concepts

| Sub-concept | What it does | Why it's necessary |
|-------------|-------------|-------------------|
| **Agent log** | Each agent (person, device, or service) has its own append-only datom log | Sovereignty — your data lives with you, not on someone else's server |
| **Peer validation** | When a peer receives replicated datoms, it validates them against shared Contracts before accepting | Trust — peers don't blindly accept data; Contracts are the shared rules of the network |
| **Peer discovery** | Find and connect to peers without central servers | Independence — no single point of failure, no gatekeeper |
| **Sync** | Multi-writer conflict resolution when multiple agents modify the same entities concurrently | Collaboration — offline-capable, eventually consistent |

**Peer validation is the critical insight.** In a P2P network, there is no central authority to enforce data integrity. Contracts fill this role — they are the shared validation rules that every peer executes on incoming datoms. A datom that violates a Contract is rejected by the receiving peer, even if it was validly signed by its author. This makes Contracts not just runtime guards but **the P2P trust model**.

This insight is validated independently by two P2P architectures:
- **Holochain** calls this the *integrity zome / coordinator zome* split — integrity zomes define deterministic validation rules (= Contracts) that every peer executes, while coordinator zomes define application logic (= effectHandlers). The split is architectural because P2P trust requires it.
- **Holepunch** does not build validation into the protocol layer — it provides the transport (Hypercore, Hyperswarm) and leaves validation to the application. In vivief, Contract validation on Hypercore replication events fills this gap.

Both validate the same conclusion: **Contracts and effectHandlers are the right abstraction boundary** for P2P systems. Contracts = deterministic, shared, executed by every peer. effectHandlers = application logic, local, executed by the authoring agent.

#### Embedded vs. daemon duality

Two deployment modes using the same store code — the difference is the process boundary:

- **Embedded** (single process): Store + handlers + UI in one process. Direct function calls. Zero IPC. For single-device use.
- **Daemon** (multi-client): Data daemon owns the store. UI, MCP server, phone app connect via IPC protocol. For multi-device + multi-consumer use.

This mirrors devac exactly — devac's MCP server owns the hub (daemon mode), the CLI routes via IPC when MCP is running. The counseling app data daemon IS the counseling equivalent of devac's MCP hub.

| Domain | Manifestation |
|--------|---------------|
| **devac** | Agent log per repo; peer discovery within workspace; MCP as daemon |
| **Counseling app** | Agent log per client; MacBook ↔ phone sync; client portal via IPC |

### 2.7 effectHandler

The effectHandler is the universal control plane. It is the formula from section 1, materialized as the dispatcher pattern.

#### What a handler produces

A handler takes state and an effect, and returns exactly two things:

```typescript
handler(state: State, effect: Effect): {
  datoms: Datom[]     // New facts to commit (State → State')
  effects: Effect[]   // Downstream intents to dispatch ([Effect'])
}
```

- **Datoms** are the state transition. They are committed to the datom log atomically.
- **Effects** are new intents. Each is dispatched to its own handler, which may produce more datoms and more effects. This is how effect cascades emerge — a voice recap effect produces datoms, which trigger a pattern-detection effect, which produces more datoms, which trigger a scheduling effect.

There is no third output. Handlers do not "publish signals" or "notify observers" — that is a property of the datom store, not the handler.

#### Reactive subscription — how observers learn about changes

When datoms are committed, the datom store notifies all subscribers whose subscriptions match the committed datoms. This is **reactive subscription** — a property of the store, not something handlers produce.

```
Handler commits datoms
  → Store notifies matching subscribers automatically
    → Surface re-renders (subscribed via its Lens filter)
    → AI loop triggers analysis (subscribed to clinical attribute namespaces)
    → P2P layer replicates (Hypercore append triggers peer sync)
```

Reactive subscription is how:
- **Surfaces** stay current — a Surface subscribes to the DatomQuery in its Lens. When matching datoms are committed, the Surface re-renders. No explicit "refresh" signal needed.
- **The AI loop** observes — it subscribes to attribute namespaces (`:session/*`, `:checkin/*`). When new clinical datoms arrive, analysis handlers are dispatched.
- **P2P replication** propagates — committing a datom to a Hypercore automatically makes it available to peers. The Hypercore IS the subscription mechanism for remote observers.
- **Reactive datom projections** update — TanStack DB collections subscribe to datom commits matching their filter, folding new datoms into entity objects with sub-millisecond latency.

The implementation of reactive subscription varies (NATS pub/sub, in-process EventTarget, Hypercore replication events, WebSocket push) — but the concept is uniform: **commit datoms, subscribers react**. No handler ever needs to know who is watching.

#### The dispatch cycle

```
Effect arrives → Resolve handler → Check feature flags → Dynamic import →
Execute handler → Validate contracts → Commit datoms → Dispatch downstream effects
                                                ↓
                                   (Store notifies subscribers automatically)
```

Most logic is handlers calling handlers — ordinary function calls, not message passing. A handler can call other handlers directly (synchronous, in-process) or return effects for the dispatcher to route (asynchronous, decoupled).

**Handler registration is a datom:**
```
[:handler/session-recap-v2  :handler/effect-type   :effect/session-recap           tx:N  true]
[:handler/session-recap-v2  :handler/module-path   "dist/handlers/session-recap.v2.mjs"  tx:N  true]
[:handler/session-recap-v2  :handler/active         true                            tx:N  true]
```

**Deployment is a datom mutation** — register handler, enable feature flag, gate behind contract. No server restart. No migration. The same effectHandler pattern that processes a voice recap also processes a handler deployment.

| Domain | Manifestation |
|--------|---------------|
| **devac** | `devac sync` = effectHandler over AST; validation pipeline as effect chain |
| **Counseling app** | Voice recap → structured notes → AI analysis = effectHandler cascade |

---

## 3. How Concepts Compose

The seven concepts are not independent — they compose into higher-level capabilities.

| Composition | What it produces | Example |
|-------------|-----------------|---------|
| **Datom + Lens** | Queryable state | "Show me all clients with sessions today" |
| **Lens + Surface** | Rendered UI | Morning prep Board, session notes Canvas |
| **Lens + Seal** | Access control | A capability IS a Lens scoped by a decryption key |
| **Datom + Contract** | Runtime-enforced specs | "Session recap must produce themes" — validated on every dispatch |
| **Datom + P2P** | Replicated append-only log | Agent logs replicating datoms between MacBook and phone |
| **Contract + P2P** | Trustless peer validation | Incoming datoms validated against shared Contracts before acceptance |
| **effectHandler + Contract + Datom** | The development model | Contract → Handler → Verify → Gate → Live |
| **Datom + Lens + Surface** | The full UI stack | One data shape, queried by Lens, rendered by Surface |
| **All seven** | The vivief platform | Development and application unified under one model |

### Reactive subscription — the connective tissue

Reactive subscription (section 2.7) connects concepts without explicit wiring:

```
effectHandler commits datoms
  → Lens-based Surface re-renders (Datom + Lens + Surface)
  → AI loop dispatches analysis effects (effectHandler cascade)
  → P2P layer replicates to peers (Datom + P2P)
  → Peer validates against Contracts on receipt (Contract + P2P)
```

No handler specifies who to notify. The store's reactive subscription model handles it. This is what makes the system composable — adding a new Surface, a new AI analysis handler, or a new peer requires zero changes to existing handlers.

### Reactive datom projections (the TanStack DB pattern)

Collections synced from committed datoms via reactive subscription, with live queries and optimistic mutations. The concept is first-class — committed datoms projected into reactive UI state with sub-millisecond updates. TanStack DB is one implementation; the pattern works with any reactive store that can consume `[E, A, V, Tx, Op]` tuples.

```typescript
// The concept: reactive subscription → collection → live query → UI
const clients = createCollection({
  subscribe: { attributePrefix: ':client/' },  // reactive subscription filter
  projection: datomsToEntity                   // fold [E,A,V,Tx,Op] into objects
})

const activeClients = useLiveQuery(q =>
  q.from({ c: clients })
   .where(({ c }) => eq(c.status, 'active'))
)
```

---

## 4. Three Actors and the Develop/Use Blur

### 4.1 The three actors

| Actor | What they do | When deterministic | When reasoning |
|-------|-------------|-------------------|----------------|
| **System** | Watch, validate, extract, cache, route, schedule | Always — this is the deterministic world | Never |
| **LLM** | Query, reason, propose, generate, structure | When following contracts with high confidence | Pattern recognition, content generation, code writing |
| **Human** | Decide, approve, create, edit, override | When applying known procedures | Design, judgment, authority, creativity |

**The decision matrix**: Ask if the answer can be determined deterministically. If yes, let the system handle it. If no, involve LLM. If the LLM's confidence is below threshold, involve the human.

| Confidence | Action |
|------------|--------|
| **> 95%** | Auto-apply (log for review) |
| **80–95%** | Request human review (default accept) |
| **< 80%** | Manual review required |

As LLMs get smarter, faster, and smaller, the boundary shifts: more work moves from human → LLM → system. The concepts stay stable — only the confidence thresholds and handler implementations change.

### 4.2 The develop/use blur

This is the central insight that unifies devac and the counseling app:

**Developing the app and using the app are the same activity when LLMs are involved.**

```
Developer writes handler  →  Handler stored as datoms  →  Dispatcher runs it
Counselor uses the app    →  Effects produce datoms    →  AI proposes insights
LLM develops new handler  →  Contract validates it     →  Feature flag gates it
LLM inside the app        →  Reads clinical datoms     →  Proposes draft datoms
```

All four actors use the same primitives. The development flow (Contract → Handler → Verify → Gate → Live) IS the same effectHandler pattern the application uses for clinical workflows.

**What this means concretely:**
- **Contracts** serve as specs, tests, AND runtime guards — not separate concerns.
- **Deployment** is a datom mutation (register handler, enable flag), not a server restart.
- **The LLM's context** for development (MCP tools reading datoms) and for clinical AI (reading the same datoms) uses the same DatomQuery API.
- **devac's Four Pillars** (Infra, Validators, Extractors, Workflow) become effectHandler patterns within the unified model.
- **A "new feature"** is a handler registered as a datom, gated by a contract, enabled by a feature flag — the same mechanism whether a developer or an LLM authored it.

---

## 5. The Dual-Loop Pattern

Two effectHandler loops run in parallel, connected by reactive subscription to the shared datom store. This pattern generalizes beyond counseling to any domain where AI augments human work.

### 5.1 Human loop (synchronous, authoritative)

Human actions → datoms → immediate effects. The human sees the result of their action immediately.

```
[Human Input] → effectHandler → [Datom Store] → [Surface Render]
      ↑                                    |
      └────────────────────────────────────┘
              (Surface shows State')
```

**In the counseling app:** Voice recap → structured notes appear. Drag card → status updates.
**In devac:** Code edit → extractors run → seeds update → MCP queries reflect the change.

### 5.2 AI loop (asynchronous, draft-only)

Subscribes via reactive subscription to relevant attribute namespaces → runs analysis → commits draft datoms marked `:tx/source :ai` and `:tx/status :pending`.

```
[Reactive subscription to committed datoms] → AI Analysis → [Draft Datoms (:tx/source = :ai)]
                                                                    |
                                                                    ↓
                                                          [Human Review]
                                                              ↙        ↘
                                                         Approve      Reject/Edit
                                                            ↓             ↓
                                                    Assert Datom    Discard / Modify
```

**Critical constraint:** The AI never directly mutates authoritative state. It proposes. The human approves, rejects, or modifies. This satisfies ethical requirements, regulatory requirements (AI therapy legislation), and engineering safety (LLM outputs are probabilistic).

**In the counseling app:** Pattern detection, treatment plan suggestions, session prep, risk flagging.
**In devac:** Rule proposals, refactoring suggestions, documentation generation, architecture analysis.

### 5.3 Generalization

The dual-loop is not counseling-specific. It is the pattern for any domain where:
- Humans have authority and judgment
- AI has speed and pattern recognition
- Both operate on the same state (datoms)
- Trust must be explicit and auditable (`:tx/source` metadata)

---

## 6. Infrastructure: Implementation Mapping

The P2P concept (section 2.6) defines four abstract sub-concepts: agent log, peer validation, peer discovery, and sync. This section maps them to the chosen implementation stack.

### 6.1 The Holepunch stack

Holepunch is chosen as the P2P implementation because it provides agent log, peer discovery, and sync as composable JavaScript modules, and its key derivation model (Corestore) maps exactly to the Seal.

| P2P sub-concept | Holepunch module | What it provides |
|-----------------|-----------------|-----------------|
| **Agent log** | Hypercore | Append-only log with Merkle tree verification per entity |
| **Agent log** (index) | Hyperbee | B-tree on Hypercore — persistent index, no startup replay |
| **Seal** (key derivation) | Corestore | Master key → named Hypercores via HKDF. IS the Seal |
| **Sync** | Autobase | Multi-writer causal DAG linearization — multi-device without conflicts |
| **Peer discovery** | HyperDHT + Hyperswarm | Kademlia DHT with NAT holepunching + connection management |
| **IPC** (daemon mode) | Protomux | Protocol multiplexer — same protocol over local pipe or P2P connection |
| **Transport encryption** | Secretstream | Noise-protocol encrypted streams — wraps all connections |
| **Handler artifacts** | Hyperdrive | Versioned filesystem — handler modules replicated to all devices |
| **Dev-mode files** | Localdrive / Mirrordrive | Local FS with same API as Hyperdrive; sync between local and drive |
| **App runtime** | Bare / Pear | Minimal JS runtime + P2P app distribution |

**Peer validation is not in Holepunch.** Holepunch provides transport and replication but not application-level validation. vivief adds Contract validation on Hypercore replication events — when datoms arrive from a peer, the dispatcher validates them against applicable Contracts before accepting them into the local store. This is the gap that Holochain's integrity zome concept identifies and that vivief fills with Contracts.

### 6.2 What you build on top

These are vivief-specific, not part of any P2P stack:

- **In-memory datom store** — 4 Map indexes (entity, outbound edges, inbound edges, name) as hot cache over Hyperbee
- **DatomQuery API** — TypeScript typed query builder compiling to store queries
- **effectHandler + dispatcher** — handler resolution, Contract validation, datom commit, effect dispatch
- **Reactive subscription** — notify Surfaces, AI loop, and P2P layer on datom commits
- **Surface renderers** — CLI, web, native, MCP output modes

### 6.3 Why not Holochain?

Holochain's architecture validates vivief's Contract/effectHandler split (section 2.6), but its implementation choices differ:

| Concern | Holochain | Holepunch + vivief |
|---------|-----------|-------------------|
| **Language** | Rust (WASM zomes) | JavaScript/TypeScript (native ecosystem match) |
| **Validation** | Built into protocol (integrity zome) | Application-level (Contract on replication event) |
| **Data model** | DHT entries + links | Datom `[E,A,V,Tx,Op]` in Hypercore |
| **Replication** | DHT gossip (eventually consistent) | Direct peer replication (Hyperswarm) |
| **Key model** | Agent keypairs + capability tokens | Corestore HKDF (= Seal, zero additional code) |
| **Ecosystem** | Standalone runtime (Holochain conductor) | Composable modules (mix and match) |

Holochain's integrity/coordinator split is the conceptual validation. Holepunch's composable modules are the implementation choice. vivief's Contracts bridge the gap — providing Holochain-grade validation rules on Holepunch's transport layer.

---

## 7. The Development Flow

### 7.1 Contract-driven development

The development flow replaces the traditional test → deploy → monitor cycle with a five-step loop where Contracts are the single mechanism for specification, testing, and runtime enforcement.

```
Contract → Handler → Verify → Gate → Live

1. Contract: Write the spec as a Contract datom
   "Session recap must produce :session/themes and :session/mood, never :session/diagnosis"

2. Handler: Write the handler code (TypeScript module)
   Register as handler datom with module path

3. Verify: Run against Contract
   Contract validation happens on every dispatch — not a separate test step

4. Gate: Feature flag (disabled by default)
   Enable for testing → dispatcher resolves the override handler

5. Live: Enable flag in production
   "Production" is the same machine — the flag flip is a datom mutation
```

**Rollback** = retract the active handler datom, re-assert the old version. Old handler artifact stays on disk. No deployment pipeline, no rollback procedure — just datom operations.

### 7.2 The Why chain

Every transaction carries metadata as first-class datoms:

```
[:tx/1087  :tx/what   <datom references>                              tx:1087  true]
[:tx/1087  :tx/how    :effect/voice-recap                             tx:1087  true]
[:tx/1087  :tx/who    :therapist/anna                                 tx:1087  true]
[:tx/1087  :tx/why    "Client reported sleep regression → exploring CBT-I"  tx:1087  true]
```

This makes the entire history auditable, queryable, and AI-analyzable. "Why was this treatment plan changed?" is a DatomQuery. "Why was this handler deployed?" is the same query.

### 7.3 Linters as executable specs

A key devac insight that generalizes to the platform:

| Layer | Purpose | Example |
|-------|---------|---------|
| **AGENTS.md / Contract datom** | The "why" — intent, rules | "Use named exports for searchability" |
| **Lint rule / Contract validation** | The "how" — executable guarantee | `no-default-export` rule blocks violations |

Agents (LLMs) use diagnostics to self-heal — iterate until contracts are satisfied. "Contract green" becomes the definition of "done."

---

## 8. Stability Layers

What changes and what stays stable as the platform evolves and LLMs improve:

| Layer | Stability | Changes when |
|-------|-----------|-------------|
| **Concepts** (this document) | Very high | Rarely — foundational model |
| **Data model** (datom schema, DatomQuery) | High | Add attributes, never break existing queries |
| **Query interface** (DatomQuery API, MCP tools) | High | Extend, never break |
| **Workflow logic** (handler implementations, AI prompts) | Medium | As LLMs improve, as domain knowledge grows |
| **Tool implementations** (storage engine, UI framework) | Low | Frequently — these are interchangeable |
| **Confidence thresholds** (human/LLM boundary) | Low | Continuously — as LLMs get smarter |

**Future-proofing guarantees:**
- **Datoms are format-agnostic.** PostgreSQL, SQLite, Hypercore, in-memory — the V shape stays `[E, A, V, Tx, Op]`.
- **Effects are abstract.** Handler implementations can change without touching the effect model.
- **Contracts are pluggable.** New validation rules = new Contract datoms. No code change needed.
- **P2P is additive.** Start with local SQLite, add Hypercore replication later. The datom model doesn't change.
- **Surfaces are interchangeable.** CLI, web, native, MCP — all consume the same Lens + datom state.

---

## 9. Glossary

### Concept terms

| Term | Definition |
|------|------------|
| **Datom** | `[Entity, Attribute, Value, Tx, Op]` — the universal immutable fact primitive |
| **Lens** | Query + rendering intent. Defines which datoms are visible and how they render |
| **Surface** | The renderer. Takes a Lens + datom store, produces output in one of five modes |
| **Seal** | Privacy model: identity + capability + encryption boundary, enforced via Lens + crypto |
| **Contract** | Datom declaring expected behavior — simultaneously spec, test, and runtime guard |
| **P2P** | Peer-to-peer layer: agent log + peer validation + peer discovery + sync — making datoms replicate without central servers |
| **effectHandler** | `(state, effect) => (state', [effect'])` — the universal control pattern |

### System terms

| Term | Definition |
|------|------------|
| **DatomQuery** | The single typed query model used by Lens, Seal, Contract, and dispatcher |
| **Dispatcher** | Runtime core that resolves handlers, checks flags, validates contracts, commits datoms, dispatches effects |
| **Handler** | TypeScript module that processes an effect and produces exactly two things: datoms (state transition) and effects (downstream intents) |
| **Reactive subscription** | Property of the datom store: when datoms are committed, matching subscribers are notified automatically. How Surfaces, AI loop, and P2P replication learn about changes — without handlers specifying who to notify |
| **Reactive datom projection** | Committed datoms → reactive collection → live query → UI (the TanStack DB pattern). Built on reactive subscription |

### Actor terms

| Term | Definition |
|------|------------|
| **Human** | Decides, approves, creates — has authority. Developer, counselor, or client |
| **LLM** | Queries, reasons, proposes — probabilistic. Drafts are always marked `:tx/source :ai` |
| **System** | Watches, validates, routes — deterministic. Handles everything that doesn't require reasoning |

### P2P terms (abstract)

| Term | Definition |
|------|------------|
| **Agent log** | Each agent's own append-only datom log — sovereignty over your own data |
| **Peer validation** | Incoming datoms validated against shared Contracts before acceptance — the P2P trust model |
| **Peer discovery** | Finding and connecting to peers without central servers |
| **Sync** | Multi-writer conflict resolution for concurrent modifications |
| **Embedded mode** | Single-process: store + UI + handlers in one process. For single-device |
| **Daemon mode** | Multi-client: data daemon owns store, clients connect via IPC protocol |

### Infrastructure terms (Holepunch implementation)

| Term | Definition |
|------|------------|
| **Hypercore** | Append-only log with Merkle tree verification — implements agent log |
| **Hyperbee** | B-tree index on Hypercore — persistent, no startup replay needed |
| **Corestore** | Hypercore factory with HKDF key derivation — implements the Seal |
| **Autobase** | Multi-writer causal DAG — implements sync |
| **Hyperswarm** | DHT-based connection management — implements peer discovery |
| **Protomux** | Protocol multiplexer — implements daemon-mode IPC over any transport |

### Development terms

| Term | Definition |
|------|------------|
| **Contract-driven development** | Contract → Handler → Verify → Gate → Live |
| **Why chain** | Tx metadata datoms (`:tx/what`, `:tx/how`, `:tx/who`, `:tx/why`) for full auditability |
| **Feature flag** | Handler override gated by a datom — deployment is a datom mutation |
| **Develop/use blur** | The insight that developing the app and using the app are the same activity under effectHandler |

### Deprecated terms (from devac lineage)

| Old term | Use instead | Reason |
|----------|-------------|--------|
| "Seed" / "Parquet file" | **Datom** | Seeds were the devac-era queryable extraction. Datoms subsume them |
| "Hub" / "central.duckdb" | **Datom store** | The hub was a DuckDB aggregator. The datom store (in-memory + Hyperbee) replaces it |
| "Analyser" | **Extractor** (as effectHandler) | Extraction is an effectHandler pattern, not a separate concept |
| "Four Pillars" | **effectHandler patterns** | Infra, Validators, Extractors, Workflow are all effectHandler instantiations |
| "Analytics Layer" | **Lens + DatomQuery** | Querying across all data is just a Lens over the datom store |

---

## 10. Related Documents

### Vision
| Document | Purpose |
|----------|---------|
| [concepts.md](./concepts.md) | devac-specific quick reference (implementation-level, superseded at concept level by this document) |
| [foundation.md](./foundation.md) | devac-specific conceptual foundation (implementation-level, superseded at concept level by this document) |

### Specification
| Document | Purpose |
|----------|---------|
| [counseling-platform-architecture-v2.md](../spec/counseling/counseling-platform-architecture-v2.md) | Full architecture spec for the counseling app — Datom DDL, DatomQuery API, dispatcher, development flow |
| [viviefco-architecture-v4.md](../spec/counseling/viviefco-architecture-v4.md) | P2P vision progression (v4a→v4b→v4c) — datoms as constant, replication as variable |
| [viviefco-architecture-ideas.md](../spec/counseling/viviefco-architecture-ideas.md) | Holepunch deep dive, 5 patterns, embedded vs daemon, datoms vs typed structs analysis |

### Implementation
| Document | Purpose |
|----------|---------|
| [test-strategy.md](../spec/test-strategy.md) | How tests validate effects — unit, integration, Storybook, E2E |
| [actors.md](./actors.md) | Actor model — state machines as higher-level effects |
| [ui-effects.md](./ui-effects.md) | UI effects — JSX components, A11y, Storybook as documentation |

---

*This document defines the "why" and "what" of the vivief platform. Implementation details ("how") belong in the specification and implementation docs.*

*Version: 1.1 — Clean effectHandler output model (datoms + effects, reactive subscription replaces signals); P2P generalized to abstract concepts (agent log, peer validation, peer discovery, sync) with Holochain validation of Contract/effectHandler split; Holepunch moved to implementation section*
