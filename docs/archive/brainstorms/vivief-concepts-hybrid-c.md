# Vivief Platform Concepts — Hybrid C

> Hybrid B + V4 Contract (softened)
> Five concepts. Actors are the runtime. Streaming is native. Contracts cross-cut everything.

---

## 1. Core Thesis

**Everything is `(state, effect) => (state', [effect'])` — running as actors, streaming by default, contractable everywhere.**

Five concepts model the entire vivief platform. At runtime, they are actors. Streaming is native via Projection delivery modes. And now: **every concept can have a Contract**. Not "everything IS a Contract" — the concepts keep their own identity. But Contract is a cross-cutting concern: it can constrain any concept, and the tools that verify Contracts (XState, Storybook, likeC4, axe) make the whole system visible.

```
Datom → Projection → Surface → Contract → effectHandler
  |         |            |          ↕            |
 fact    query+scope   render   constrains    transition
         +delivery     +stream   all of        +actor
                                 these
```

---

## 2. The Five Concepts

### 2.1 Datom

The universal fact. `[Entity, Attribute, Value, Tx, Op]`.

Immutable, append-only, self-describing. Schema is stored as datoms. The datom log is the shared memory that all actors read from and write to.

**Observability as datoms.** LLM invocation metadata (tokens, cost, latency, model) stored as regular datoms alongside results. Queryable via Projection, displayable on Surfaces, aggregatable over time.

**Schema Contract (optional).** A Contract can constrain what datoms are valid:

```
[:schema/client-name  :schema/type      :text   tx:1  true]
[:schema/client-name  :schema/required   true   tx:1  true]
```

"Any datom with attribute `:client/name` must have a non-empty text value." Schema evolution IS Contract evolution — adding an attribute = asserting a new Schema Contract. This is already how vivief works (schema-as-datoms); the Contract framing makes validation explicit.

**At runtime:** The Store Actor validates incoming datoms against Schema Contracts before commit.

| Domain | Manifestation |
|--------|---------------|
| **devac** | Code graph, diagnostics, LLM observability datoms |
| **Counseling app** | Clinical data, AI suggestions, consent records |

### 2.2 Projection

**Lens + Seal merged. Delivery modes for streaming. Contractable for authorization and redaction.**

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

  // Delivery
  delivery: "snapshot" | "live" | "replay"
  freshness?: "committed" | "in-flight"
}
```

| Delivery | Behavior |
|----------|----------|
| **snapshot** | Current state. One-shot. |
| **live** | Current state + future matching datoms. This IS reactive subscription. |
| **replay** | Full history from tx:0 or asOf(tx). Time-travel. |

**Trust zones** constrain which Projections can be constructed. Owner, scoped user, AI agent, and system roles have progressively narrower scope and encryption access.

**Projection Contract (optional).** A Contract can constrain what a Projection is allowed to query — making authorization explicit:

```typescript
interface ProjectionContract {
  // Who can construct this Projection
  requiredCapability: CapabilityToken

  // What scope is allowed
  maxScope: "own" | "consented" | "all"

  // Redaction: attributes the Projection may read but must not pass to Surfaces
  redacted?: AttributeKw[]
}
```

**Redaction — the new capability.** A Projection Contract can declare that certain attributes are readable (for computation) but must not be rendered. "The AI actor can read `:client/ssn` for fraud analysis, but no Surface may display it." This separates compute-access from display-access — a genuinely new privacy primitive that falls out of distinguishing Projection Contracts from Render Contracts.

```
AI analysis actor:
  Projection({ filter: ':client/*', scope: 'consented' })
  ProjectionContract({ redacted: [':client/ssn', ':client/dob'] })

  → Actor CAN read SSN for pattern matching
  → Actor CANNOT pass SSN to any Surface (Contract enforced)
  → Surface physically never receives the value
```

**At runtime:** A Projection is an actor's subscription declaration. The Store Actor delivers matching datoms in the requested mode. Projection Contracts are enforced by the dispatcher before datoms reach the actor's Surfaces.

| Domain | Manifestation |
|--------|---------------|
| **devac** | MCP queries (snapshot), live diagnostics (live), `asOf` analysis (replay) |
| **Counseling app** | Morning prep (snapshot), live session (live+in-flight), history (replay), SSN redaction |

### 2.3 Surface

The renderer. Consumes a Projection's output. Six modes including Diagram for system visualization.

```
Surface = render(Projection)
```

| Mode | Input | Output |
|------|-------|--------|
| **Stream** | Time-ordered datoms | Activity feed, chat, notifications |
| **Card** | Single entity datoms | Detail page, form, record |
| **Canvas** | Block datoms + CRDT state | Document, notes, Jupyter blocks |
| **Dialog** | Projection(live, in-flight) | AI chat with streaming tokens |
| **Board** | Grouped datoms | Kanban, calendar, roster |
| **Diagram** | Contract + effect datoms | C4, XState viz, sequence diagram |

Streaming is natural — Dialog renders what the Projection delivers. System visualization is natural — Diagram renders Contract and handler datoms.

**Render Contract (optional).** A Contract can constrain how a Surface renders:

```typescript
interface RenderContract {
  // What must be shown
  required?: AttributeKw[]

  // What must never be shown (enforced redaction from Projection Contract)
  forbidden?: AttributeKw[]

  // Accessibility
  a11y: {
    wcag: "2.1-AA" | "2.1-AAA"
    keyboard: boolean
    screenReader: boolean
  }

  // Test fixtures
  stories?: StoryDefinition[]
}
```

**a11y as Contract term.** Not an afterthought. Every Surface can have a Render Contract that specifies its WCAG level, keyboard navigability, and screen reader support. axe scanning validates the a11y terms — violations are Contract violations in the datom log.

**Storybook as Contract verification.** `Story = Surface(Projection(fixture-datoms))`. Each story is a test case for a Render Contract — required fields shown, forbidden fields hidden, a11y met. Stories ARE living documentation.

**At runtime:** A Surface is a rendering actor. Subscribes via Projection, renders output, emits effects on interaction.

| Domain | Manifestation |
|--------|---------------|
| **devac** | CLI output, MCP responses, C4 diagrams, live diagnostics |
| **Counseling app** | All six modes. a11y validated by Render Contracts. Storybook stories. |

### 2.4 Contract

The cross-cutting concept. A Contract declares expected behavior — simultaneously spec, test, and runtime guard. It can constrain any of the other four concepts.

**Three modes:**

| Mode | What it does | Example |
|------|-------------|---------|
| **Guard** | Reject invalid state | "Session recap must produce themes, never diagnosis" |
| **Aggregation** | Derive higher-level facts | "HTTP calls aggregate into IO.HTTP" (was devac Rules) |
| **StateMachine** | Define valid transitions | XState machine definition = handler Contract |

**Three temporal validation points:**

| When | What it validates | Example |
|------|------------------|---------|
| **Pre-commit** | Datoms about to commit | Schema Contract: "`:client/name` must be text" |
| **In-flight** | Streaming tokens | "LLM output must not contain diagnosis language" |
| **Post-commit** | Cross-entity invariants | "High-risk client must have session within 7 days" |

**Six Contract types — one per concept it constrains:**

| Contract Type | Constrains | What it specifies |
|---------------|-----------|-------------------|
| **Schema Contract** | Datom | What facts can exist (types, required fields, enums) |
| **Projection Contract** | Projection | Who can query what, redaction rules |
| **Render Contract** | Surface | a11y requirements, required/forbidden display, stories |
| **Trust Contract** | Encryption | Key derivation rules, role definitions, consent protocol |
| **Sync Contract** | Replication (infra) | Conflict resolution per attribute type, claim protocol |
| **Behavior Contract** | effectHandler | Accepted/produced effects, state machine, aggregation rules |

**Not everything must have a Contract.** A simple validation handler works without a Behavior Contract. A quick CLI Surface works without a Render Contract. Contracts are available when you need guarantees — not required everywhere. The development flow `Contract → Handler → Verify → Gate → Live` applies to production handlers, not to every experiment.

**Trust Contract.** Specifies the cryptographic rules that Projection's encryption follows:

```typescript
interface TrustContract {
  derivation: "passphrase → PBKDF2 → HKDF per-entity"
  roles: {
    owner: { derives: "all" }
    scopedUser: { derives: "own-entity-only" }
    ai: { derives: "consented-only", constraint: "read + draft-write" }
    system: { derives: "none", sees: "metadata only" }
  }
  consent: {
    grant: "datom assertion with why-chain"
    revoke: "retraction → key rotation effect"
  }
}
```

**Sync Contract.** Specifies how datoms replicate between peers:

```typescript
interface SyncContract {
  // Conflict resolution per attribute type
  resolution: {
    text: "crdt-yjs"
    scalar: "last-writer-wins"
    ref: "manual-merge"
  }
  // What this peer shares/wants
  scope: { push: DatomQuery, pull: DatomQuery }
  // Claim protocol for expensive work distribution
  claim: { pattern: ":effect/claimed-by", timeout: "30s" }
}
```

This addresses the P2P conflict resolution gap from the challenge document. Text attributes merge via CRDT, scalars use last-writer-wins, references surface to human for merge. The claim pattern handles multi-device work distribution (the consumer-groups gap from the NATS analysis).

| Domain | Manifestation |
|--------|---------------|
| **devac** | Lint rules (Guard), effect aggregation for C4 (Aggregation), in-flight code review |
| **Counseling app** | Clinical constraints, real-time AI guardrails, a11y, consent, conflict resolution |

### 2.5 effectHandler

The universal control pattern. Two zoom levels: function and actor.

**Level 1 — The function:**

```typescript
handler(state: State, effect: Effect): { datoms: Datom[], effects: Effect[] }
```

Pure, testable, composable. State via Projection. Most handlers.

**Level 2 — The actor:**

Function + identity + Projection + message queue + lifecycle + typed protocol.

| Scenario | Level |
|----------|-------|
| Validate session notes | Function |
| Format recap output | Function |
| LLM invocation with streaming | Actor (produces in-flight tokens) |
| Session-recap workflow | Actor (multi-step, cancellable) |
| AI analysis loop | Actor (persistent subscription) |
| Context compaction | Actor (reads stream, produces summary datom) |

**Behavior Contract (optional).** A handler can declare its Contract:

```typescript
interface BehaviorContract {
  accepts: EffectType[]
  produces: { required: AttributeKw[], forbidden: AttributeKw[] }
  stateMachine?: XStateMachineDefinition    // Visual in Stately Studio
  aggregates?: { from: DatomQuery, to: EffectType }
  runtime?: { lifecycle: "stateless" | "persistent", interruptible: boolean }
}
```

Design the Behavior Contract first (state machine in Stately Studio for complex handlers). Implement the handler. Runtime validates transitions match. The Contract is the spec, the test, and the guard.

**Streaming from actors.** LLM handler actors produce in-flight token effects. Surface actors with `freshness: "in-flight"` render them. In-flight Contracts validate them. On completion, the final datom commits.

**Context compaction.** `(state, :effect/compact) => { datoms: [summary-datom], effects: [] }`. Named pattern for LLM context window management.

| Domain | Manifestation |
|--------|---------------|
| **devac** | Sync, validation, C4 generation (via aggregation Contracts) |
| **Counseling app** | Voice recap → streaming → structure → analysis, with real-time guardrails |

---

## 3. The Visual Triangle — Contracts Made Visible

C4, XState, and Storybook each verify a different Contract type:

| Tool | Contract Type | What it verifies |
|------|--------------|-----------------|
| **Stately Studio / XState** | Behavior Contract (state machine) | Handler transitions are valid |
| **Storybook** | Render Contract (stories + a11y) | Surface output is correct and accessible |
| **likeC4** | Behavior Contract hierarchy (aggregation) | C4 architecture at zoom levels |
| **axe / browser scan** | Render Contract (a11y terms) | WCAG compliance |

All four tools are **Contract verifiers**. They make Contracts visible and testable. This is the connection between vivief's concepts and the visual tools the team uses — the tools compose from the concepts rather than requiring new ones.

The overlap: all three are **Surfaces over datoms, constrained by Contracts**. A C4 diagram is a Surface rendering aggregation Contract datoms. An XState visualization is a Surface rendering Behavior Contract datoms. A Storybook story is a Surface rendering fixture datoms, verified against a Render Contract.

---

## 4. The Actor Runtime

Same as Hybrid B. At runtime, the five concepts become actors communicating via effects. Streaming via Projection delivery modes. In-flight Contracts validate during streaming. Location transparency via Protomux.

```
HumanActor (counselor)
  → emits :effect/voice-input
    → SessionRecapActor.receive(:effect/voice-input)
      → TranscriberActor produces in-flight tokens
        → InFlightContract validates each chunk
        → DialogSurfaceActor renders (Render Contract enforces a11y)
        → Projection Contract enforces redaction (no SSN in render path)
      → TranscriberActor commits final datom
        → Schema Contract validates datom structure
        → StoreActor notifies actors with matching Projections (delivery: live)
```

Contracts appear at every boundary — in-flight, pre-commit, render-time — but only where declared. No Contract = no validation at that point.

---

## 5. Composition

| Composition | What it produces |
|-------------|-----------------|
| **Datom + Schema Contract** | Validated facts |
| **Datom + Projection(snapshot)** | Authorized point-in-time view |
| **Datom + Projection(live)** | Reactive subscription |
| **Datom + Projection(live, in-flight)** | Streaming with redaction |
| **Projection + Surface** | Rendered output |
| **Surface + Render Contract** | Accessible, tested, documented output |
| **effectHandler + Behavior Contract** | Constrained transitions with visible state machines |
| **effectHandler + in-flight Contract** | Real-time AI guardrails |
| **Surface + Projection(fixture)** | Storybook stories |
| **P2P + Sync Contract** | Conflict-resolved replication with claim protocol |
| **All five + Contracts** | The vivief platform |

---

## 6. What Disappeared

| Old Concept | Where It Went | Why |
|-------------|--------------|-----|
| **Lens** | → Projection (query + delivery) | Includes delivery modes and freshness |
| **Seal** | → Projection (access) + Trust Contract (crypto rules) | Authorization per-Projection, crypto rules as Contract |
| **P2P** | → Infrastructure + Sync Contract | Deployment concern; conflict resolution specified as Contract |
| **Rules** (devac) | → Contract (aggregation mode) | Same pattern |
| **Reactive subscription** | → Projection(delivery: live) | First-class Projection capability |

---

## 7. Infrastructure

Same Holepunch stack as Hybrid A/B. P2P as remote actors with location transparency.

The Sync Contract specifies conflict resolution strategy per attribute type, addressing the gap the challenge document identified. The claim protocol handles multi-device work distribution.

---

## 8. The Trade-off

**Gained over Hybrid B:**
- **Redaction.** Compute-access vs. display-access separation. AI reads SSN for analysis, Surface cannot render it. This is genuinely new and powerful for privacy.
- **a11y as Contract term.** Every Surface's accessibility requirements are explicit, verifiable, tracked.
- **Conflict resolution specified.** Sync Contract declares per-attribute-type strategy. No more "underspecified."
- **Visual triangle.** XState, Storybook, likeC4, axe — all framed as Contract verifiers. The tools compose from the concepts.
- **Contract cross-cuts cleanly.** Six Contract types match the five concepts + infrastructure. Each is optional, not mandatory.

**What stayed clean:**
- The 5 concepts keep their own identity. Contract doesn't subsume them — it constrains them.
- "Can have a Contract" not "must have a Contract." Simple handlers and quick experiments work without Contracts.
- The core formula, actor runtime, and streaming are untouched from Hybrid B.

**What to watch:**
- Six Contract types might feel like six new concepts in disguise. The key: they're all the same thing (pattern → constraint) applied to different targets. If they start feeling like separate concepts, the abstraction is leaking.
- "Every concept can have a Contract" should not become "every concept must have a Contract." The development flow `Contract → Handler → Verify → Gate → Live` is for production, not prototyping.

---

*Version: hybrid-c — 5 concepts with actor runtime, native streaming, and cross-cutting Contracts. Six Contract types (Schema, Projection, Render, Trust, Sync, Behavior) constrain concepts without subsuming them. Redaction separates compute-access from display-access. Visual triangle: tools as Contract verifiers. a11y and conflict resolution specified as Contract terms.*
