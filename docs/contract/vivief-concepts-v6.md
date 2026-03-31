# Vivief Platform Concepts — v6

> Five concepts. Creation is why. The formula is how. Trust varies. LLM authors rules, system enforces them. The system gets more deterministic over time.

---

## 1. Core Thesis

**The platform exists to help humans, AI, and systems create. All creation follows `(state, intent) => (state', [intent'])`. What varies is who creates and how much the Contract trusts them.**

**Deterministic first.** Each actor does what it's best at. The system validates deterministically — fast, consistent, auditable. The LLM generates the rules the system enforces — pattern recognition, rule authoring, natural language explanation. The human approves, judges, and decides domain questions. When the LLM handles edge cases via reasoning, it observes its own patterns and proposes new deterministic rules. The system gets more deterministic over time. **LLM authors, system enforces, LLM refines.**

Five concepts model the entire vivief platform:

```
Datom → Projection → Surface → Contract → effectHandler
  |         |            |          ↕            |
 fact    query+scope   render   constrains    transition
         +delivery     +stream   all of        +actor
         +trust scope            these
```

At runtime, they are actors communicating via intents. Streaming is native via Projection delivery modes. Contracts cross-cut everything — any concept can have one. Every activity — a counseling session, a code analysis, a morning brief, a cultural adaptation — is creation through this same machinery.

**A Contract declares. An effectHandler enforces.** Every active Contract has an effectHandler that applies it. Creating new Contracts is itself creation — following the same loop, same trust strategies. This is how the system improves: LLM creates rules (Contracts), system enforces them (effectHandlers), LLM observes and refines.

**Intent is the parameter.** The creation loop begins with an intent — the `intent` parameter in `handler(state, intent)`. When a counselor clicks "Prepare for 9:00," that's `:session/preparation-requested`. When `devac sync` runs, that's `:sync/requested`. Intent carries what-to-create, for-whom, and at-what-depth as datom attributes. Formalizing Intent doesn't add a concept — it names the parameter that enters the creation loop. Intent uses domain-specific namespaces with past-tense naming (`:session/completed`, `:validation/failed`, `:compaction/requested`) — there is no `:intent/*` namespace because intent is a phase of the creation loop, not a type of datom.

**Validation is exempt from recursion.** Validation datoms produced by system actors (trust 1.0) are exempt from re-entering the creation loop. They commit directly. This prevents infinite recursion — enforcement produces datoms, but those datoms don't trigger further enforcement.

**Creation boundary.** Creation = producing datoms. Pure transformations that don't produce datoms (formatting a date, parsing a string, computing a hash) are utilities — functions that handlers call internally, below the concept boundary. The creation loop governs datom production. Utilities don't need Contracts, trust strategies, or escalation.

**Concept vs. pattern.** The following are patterns, not concepts: domain, bridge, artifact, slice, profile, skill. They compose the five concepts but don't extend them. Domain is the primary composition pattern — the most important way the five concepts combine for a user population. See §3 for the pattern composition table.

### Reading Guide

This document applies its own conceptual slices:

- **Fact reading** (implementer): §1, §2, §3, §9, §11 — what to build
- **Feature reading** (+ architecture): add §8, §10 — how it fits together
- **Full reading** (platform vision): add §4, §5, §6, §7 — where it's going

---

## 2. The Five Concepts

### 2.1 Datom

The universal fact. `[Entity, Attribute, Value, Tx, Op]`.

Immutable, append-only, self-describing. Schema is stored as datoms. The datom log is the shared memory that all actors read from and write to.

**Provenance as datoms.** Every transaction carries provenance attributes that record who created it and how trustworthy it is:

```
[session:42  :session/themes   ["sleep","anxiety"]  tx:81  true]
[tx:81       :tx/source        :ai/text-generation  tx:81  true]   // who created
[tx:81       :tx/trust-score   0.85                  tx:81  true]   // how trusted
```

`:tx/source` identifies the actor using capability categories (`:human`, `:ai/text-generation`, `:system/analysis`, `:web/scraped`). Model evolution follows schema evolution — additive. When a new model appears, old history retains its original `:tx/source`; the category stays stable while specific models change underneath. `:tx/trust-score` (0.0–1.0) is set at ingestion and flows through the system — Projections can filter by it, Surfaces can display it, Contracts can enforce thresholds on it.

**Trust score assignment.** Every datom gets a trust score at origination via two mechanisms:

1. **Actor-type defaults** — each actor type has a base trust score: `:human → 1.0`, `:ai/text-generation → 0.85`, `:system/analysis → 1.0`, `:web/scraped → 0.4`. These are Contract defaults (`:default` status) that refine per domain.
2. **Handler override** — a handler can override its actor-type trust score if its governing Behavior Contract is verifiable. The Contract enforcement has earned that trust.

For derived content, the propagation rule is `min(source_trusts)` — derived content inherits the trust of its least-trusted input. Handler override raises the actor's contribution to the min calculation, not the input trust: `min(0.80_input, 0.95_overridden_actor) = 0.80`. The chain stays honest. Refinable per domain.

**Observability as datoms.** LLM invocation metadata (tokens, cost, latency, model) stored as regular datoms alongside results. Queryable via Projection, displayable on Surfaces, aggregatable over time.

**Schema Contract (optional).** Constrains what datoms are valid:

```
[:schema/client-name  :schema/type      :text   tx:1  true]
[:schema/client-name  :schema/required   true   tx:1  true]
```

Schema evolution IS Contract evolution — adding an attribute = asserting a new Schema Contract. Schema Contracts are additive by default — they grow but never remove or tighten. Old datoms are always valid because the Schema only grows. For the rare breaking change, a **migration handler** makes the change explicit: migration IS creation, running through the same loop with the same trust strategies.

### 2.2 Projection

Lens + Seal merged. Query + access + encryption + delivery + freshness + trust in one concept.

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
  delivery: "snapshot" | "live" | "live-persistent" | "replay"
  freshness?: "committed" | "in-flight"

  // Trust
  trustThreshold?: number  // exclude datoms where :tx/trust-score < threshold
}
```

| Delivery | Behavior |
|----------|----------|
| **snapshot** | Current state. One-shot. |
| **live** | Current state + future matching datoms. Ephemeral — Surface-bound, dies on unmount. |
| **live-persistent** | Like live, but independent entity with lifecycle. Survives Surface unmount. |
| **replay** | Full history from tx:0 or asOf(tx). Time-travel. |

**Live Projection — two tiers.** A live Projection is ephemeral by default (dies with its Surface); mark it persistent when it must outlive any particular Surface. Persistent Projections are recorded as datoms with `:projection/status` (active / paused / stopped), consumable by zero or more Surfaces. On Store compaction, persistent Projections re-snapshot automatically via `:compaction/completed`.

**Named profiles.** Most uses need only a few dimensions. Three named profiles provide convenience:

```typescript
Projection.snapshot(query, capability)       // delivery: snapshot, freshness: committed
Projection.live(query, capability)           // delivery: live, freshness: committed
Projection.stream(query, capability)         // delivery: live, freshness: in-flight
```

Teams define domain-specific profiles (debug, trusted, audit) using the same factory mechanism.

**Composite Projection.** A Surface that needs multiple data sources composes Projections by name:

```typescript
CompositeProjection({
  session: Projection.live(sessionQuery, cap),
  notes: Projection.snapshot(notesQuery, cap),
  metrics: Projection.stream(metricsQuery, cap)
})
```

Each constituent keeps its own trust scope, delivery mode, and access rules — no lossy merging. Composition is named slots, not union or precedence.

**Trust-scoped Projection.** The `trustThreshold` field filters datoms by their `:tx/trust-score`. An LLM context load with `trustThreshold: 0.7` excludes low-trust datoms from the context window. A human reviewing all sources uses `trustThreshold: 0.0`. This prevents poisoned or low-quality data from reaching actors that shouldn't see it.

**Projection Contract (optional).** Constrains what a Projection is allowed to query — making authorization explicit:

```typescript
interface ProjectionContract {
  requiredCapability: CapabilityToken
  maxScope: "own" | "consented" | "all"
  redacted?: AttributeKw[]
}
```

**Redaction.** A Projection Contract can declare that certain attributes are readable (for computation) but must not be rendered. "The AI actor can read `:client/ssn` for fraud analysis, but no Surface may display it." This separates compute-access from display-access.

### 2.3 Surface

The renderer. Consumes a Projection's output. Six modes:

| Mode | Input | Output |
|------|-------|--------|
| **Stream** | Time-ordered datoms | Activity feed, chat, notifications |
| **Card** | Single entity datoms | Detail page, form, record |
| **Canvas** | Block datoms + CRDT state | Document, notes, Jupyter blocks |
| **Dialog** | Projection(live, in-flight) | AI chat with streaming tokens |
| **Board** | Grouped datoms | Kanban, calendar, roster |
| **Diagram** | Contract + effect datoms | C4, XState viz, sequence diagram |

Streaming is natural — Dialog renders what the Projection delivers. System visualization is natural — Diagram renders Contract and handler datoms.

**Surface → Projection binding.** A Projection is a Surface parameter: `Surface(projection, mode)`. The binding is recorded as a datom — `[surface:X :surface/projection projection:Y tx:N true]` — making it queryable without introducing a new concept. A Surface can consume multiple Projections via composite Projection. Multiple Surfaces can share a Projection.

**Non-developer interaction.** Surfaces for non-developer users blend direct interaction (deterministic, fast) with LLM-mediated interaction (contextual, generative). A counselor clicks "new session" (direct), then asks "summarize this week's patterns" (LLM-mediated). Deterministic first, LLM when it adds value.

**Trust signals in rendering.** When a Surface renders content from datoms with low trust score or non-human source, the Render Contract can require visible provenance — "AI draft — pending review" or "Source: web (trust: 0.4)."

**Render Contract (optional).** Constrains how a Surface renders:

```typescript
interface RenderContract {
  required?: AttributeKw[]
  forbidden?: AttributeKw[]
  a11y: { wcag: "2.1-AA" | "2.1-AAA", keyboard: boolean, screenReader: boolean }
  trustSignals?: { showSource: boolean, showScore: boolean, threshold: number }
  stories?: StoryDefinition[]
}
```

a11y as Contract term: every Surface can have a Render Contract that specifies its WCAG level, keyboard navigability, and screen reader support. axe scanning validates the a11y terms. Storybook as Contract verification: `Story = Surface(Projection(fixture-datoms))`.

### 2.4 Contract

The cross-cutting concept. A Contract declares expected behavior — simultaneously spec, test, and runtime guard.

**Three modes:**

| Mode | What it does | Example |
|------|-------------|---------|
| **Guard** | Reject invalid state | "Session recap must produce themes, never diagnosis" |
| **Aggregation** | Derive higher-level facts | "HTTP calls aggregate into IO.HTTP" |
| **StateMachine** | Define valid transitions | XState machine definition = handler Contract |

Aggregation Contract = declarative rule ("these effects compose into this"). effectHandler = runtime that applies it. Contract is spec, handler is executor.

**Three temporal validation points:**

| When | What it validates | Example |
|------|------------------|---------|
| **Pre-commit** | Datoms about to commit | Schema Contract: "`:client/name` must be text" |
| **In-flight** | Streaming tokens | "LLM output must not contain diagnosis language" |
| **Post-commit** | Cross-entity invariants | "High-risk client must have session within 7 days" |

**Six Contract sub-types — one per concept it constrains:**

| Contract Type | Constrains | What it specifies |
|---------------|-----------|-------------------|
| **Schema Contract** | Datom | What facts can exist (types, required fields, enums) |
| **Projection Contract** | Projection | Who can query what, redaction rules |
| **Render Contract** | Surface | a11y requirements, required/forbidden display, trust signals, stories |
| **Trust Contract** | Encryption | Key derivation rules, role definitions, consent protocol |
| **Sync Contract** | Replication | Conflict resolution per attribute type, claim protocol |
| **Behavior Contract** | effectHandler | Accepted/produced effects, state machine, aggregation rules |

The six sub-types are a closed set — they map one-per-concept plus Trust and Sync for cross-cutting concerns. If a new sub-type seems needed, it signals a missing concept.

Cultural rules (e.g., "use informal 'je' in Dutch therapy") are in-flight Guard Contracts for a specific domain — not a separate sub-type.

**Enforcement strategy.** A Contract's enforcement follows the trust boundary. Universal heuristic: if the handler's trust is lower than what the Contract protects, enforcement is external (the system doesn't trust the handler to check itself). Otherwise, enforcement can be internal (the handler embodies the constraint).

| Strategy | When | Example |
|----------|------|---------|
| **External** | Handler is less trusted than Contract requires | Schema Contract validated by store, Trust Contract by key derivation layer, in-flight Contract by system actor pipeline |
| **Internal** | Handler embodies the Contract | StateMachine Behavior Contract where XState definition IS the handler |
| **Internal, externalizable** | Domain-specific enforcement that matures | Clinical Guard starts as handler logic, evolves to infrastructure rule |

Per sub-type defaults:

| Contract Type | Default Enforcement |
|---------------|-------------------|
| Schema, Trust, Sync | External (infrastructure) |
| Render | External (tooling — axe, Storybook) |
| In-flight | External (system actor pipeline) |
| Behavior | Internal (handler), externalizable as patterns mature |

Enforcement migrates outward as trust increases. This is the deterministic-first loop applied to Contract enforcement itself. A formal `enforcementTrustThreshold` field on Contracts is a natural future extension when mechanical enforcement proves necessary.

**Contract decision tree:**

```
Safety/trust/compliance?     → Behavior Contract + Trust Contract
Data entering the store?     → Schema Contract
Surface showing data?        → Render Contract (a11y)
Crossing a medium boundary?  → Bridge Contract (Schema at boundary)
None of the above?           → No Contract needed
```

**Not everything must have a Contract.** A simple validation handler works without a Behavior Contract. A quick CLI Surface works without a Render Contract. Contracts are available when you need guarantees — not required everywhere.

**Contract lifecycle.** Contracts are datoms with a lifecycle:

| State | Meaning |
|-------|---------|
| **asserted** | Declared. Exists in the log. Not yet enforced. |
| **active** | Currently enforced by the Store Actor. |
| **superseded** | Replaced by a newer version. Still in the log, no longer enforced. |
| **conflicted** | Two active Contracts disagree. Requires resolution. |

Resolution: newest active wins for same-type, same-attribute Contracts. Lock = a Guard Contract on the Contract itself. Cross-type conflicts surface as `:contract/conflict` datoms entering the creation loop.

**Trust over structure.** When a Trust Contract restricts access to something a Schema Contract requires, the Trust Contract wins. Safety trumps structure.

**Contract coverage.** A Contract is either **declared** (has constraints but no verification) or **verifiable** (has at least one story, fixture, or StateMachine transition that can be mechanically checked).

**Anti-pattern Guards.** Three named anti-patterns: utility-as-creation, Contract-on-everything, Projection-splitting. Graduated enforcement: explain → warn → block. Teams choose their level via Contract lifecycle.

**Contract defaults lifecycle:**

```
:default           → works without domain expertise
:domain-refined    → adapted for specific domain (clinical, dev, content)
:experience-refined → adjusted from actual usage data and incidents
:locked            → frozen after deliberate decision (with :tx/why)
```

**Trust Contract:**

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

**Sync Contract:**

```typescript
interface SyncContract {
  resolution: { text: "crdt-loro", scalar: "last-writer-wins", ref: "manual-merge" }
  scope: { push: DatomQuery, pull: DatomQuery }
  claim: { pattern: ":work/claimed-by", timeout: "30s" }
}
```

Security is Contract enforcement at bridge boundaries — instruction detection (Guard), behavioral validation (Guard), and trust scoring (Aggregation) are deterministic checks where external content enters or leaves the system.

### 2.5 effectHandler

The universal control pattern. Two zoom levels and an orthogonal implementation strategy dimension.

**Level 1 — The function:**

```typescript
handler(state: State, intent: Intent): { datoms: Datom[], intents: Intent[] }
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
| Context compaction | Actor (reads stream, produces summary datom) |

**Implementation strategy.** Orthogonal to level — a function or actor can use any strategy:

| Implementation | Runtime | Trust | Example |
|---------------|---------|-------|---------|
| **Code** | TypeScript/Node.js | 1.0 | Deterministic validation, data transformation |
| **Markdown/LLM** | LLM interprets instructions | 0.85 | Skills — multi-step workflows described in natural language |
| **StateMachine** | XState | 1.0 | Machine definition IS the handler |
| **Hybrid** | Code + LLM | min() | Deterministic steps with LLM for edge cases |

Implementation strategy affects trust scoring and the deterministic-first evolution path. A skill (markdown/LLM) that stabilizes can migrate to hybrid, then to code — each step raising trust. The strategy is a property of the handler, not a new concept.

**Contract-governed effectHandler.** An effectHandler can be Contract-governed: `Contract(effectHandler)`. For external enforcement, the runtime wires validation around the handler — preconditions on intent, postconditions on result. For internal enforcement, the handler declares its Contract association and validates its own transitions. The handler remains an effectHandler; the Contract adds governance, not identity.

**Failure model.** Two paths, both auditable:

- **Graceful failure**: the handler returns `{ datoms: [error-datoms], intents: [:handler/failed] }`. Triggers the creation loop's escalation.
- **Crash**: the actor runtime catches the exception and produces a crash datom: `[handler:X :handler/crashed "reason" tx:N true]`. Escalates to human immediately.

Both are datoms in the log — auditable, queryable. Both enter the creation loop.

**Behavior Contract (optional):**

```typescript
interface BehaviorContract {
  accepts: EffectType[]
  produces: { required: AttributeKw[], forbidden: AttributeKw[] }
  stateMachine?: XStateMachineDefinition
  aggregates?: { from: DatomQuery, to: EffectType }
}
```

**Streaming from actors.** LLM handler actors produce in-flight token effects. Surface actors with `freshness: "in-flight"` render them. In-flight Contracts validate them. On completion, the final datom commits.

**Context compaction.** `(state, :compaction/requested) => { datoms: [summary-datom], intents: [] }`. Named pattern for LLM context window management.

**Effects as understanding.** The system observes itself through effects. Every meaningful action — a function call, a store write, an LLM invocation — produces effect datoms. This is the foundation of the deterministic-first loop:

1. **Effects are data.** What devac extracts from code (function calls, stores, sends) are effects. What runtime telemetry captures are effects. All queryable as datoms.
2. **Aggregation Contracts compose understanding.** Low-level effects (DBQuery, HTTPRequest) compose into high-level effects (ChargePayment, AuthenticateUser) via Aggregation rules.
3. **Observability IS Projection over effect datoms.** No separate observability layer. A dashboard is a Surface over a live-persistent Projection filtering effect datoms.
4. **The deterministic-first loop feeds on this.** LLM reads effect datoms, observes patterns ("this handler always calls these three effects in sequence"), proposes a new Aggregation Contract. Team reviews. System enforces. The platform's understanding grows deterministically.

---

## 3. Creation

Everything vivief does is creation. A counselor creating session notes, AI analyzing patterns, devac extracting a code graph — all follow one loop with variable trust.

### The Creation Loop

**Compact formulation:**

```
effect (Intent) → Contract(effectHandler) → datoms (result)
```

An effect enters the creation loop. A Contract governs the effectHandler that processes it. The result is datoms.

**Full loop with failure and escalation:**

```
Intent → Contract → Create → Validate ─── pass ──→ Cache
            │          │         │
         (defines    (human,   fail
          what's     AI, or     │
          valid      system)    ▼
          + trust)         error datoms
                         + :fix/requested
                               │
                       ┌───────┘
                       ▼
                 Fix (another creation,
                  reading errors as input)
                       │
                       └──→ re-Validate ──→ ...
```

**One loop. Any actor. Variable trust. Validation failure re-enters the loop.**

### Conceptual Slices

| Slice | Concepts used | What you build |
|-------|--------------|----------------|
| **Fact** | Datom + Schema Contract | Validated data structure |
| **Feature** | Datom + Schema Contract + effectHandler (function) | Validated transformation |
| **Full** | All five | End-to-end with display and constraints |

Entry path: Fact (schema design) → Feature (handlers) → Full (surfaces + contracts + wiring).

### Patterns

Patterns compose the five concepts but don't extend them:

| Pattern | Composes | What it produces |
|---------|----------|-----------------|
| **domain** | Schema + Behavior Contracts + Surface template + onboarding StateMachine | Named configuration for a user population |
| **bridge** | effectHandler + Contract at medium boundary | Sync between native medium and datom store |
| **artifact** | Datoms about something in a native medium + bridge | Metadata representation of external content |
| **slice** | Subset of the five concepts (Fact / Feature / Full) | Entry path for incremental adoption |
| **profile** | Projection with preset dimensions | Convenience factory for common queries |
| **skill** | effectHandler (LLM-implemented) + Behavior Contract + Projection (context) | Reusable orchestration of multi-step workflows |

A skill is an effectHandler implemented in markdown, executed by an LLM, composing other effectHandlers. It follows the same trust and Contract rules as any effectHandler. Skill authoring is itself creation — same loop, same trust strategies. Sharing is opt-in by default.

### Three Trust Strategies

| Strategy | Trust | Commit behavior |
|----------|-------|-----------------|
| **Authoritative** (human) | Full | Immediate commit. Contract validates, but human has override with `:tx/why`. |
| **Gated** (AI) | Draft | Draft commit. Human approves before authoritative. |
| **Sandboxed** (AI, low-risk) | Isolated | Commits to sandbox Projection scope. Invisible until promoted. |

**Sandbox as Projection scope.** No separate infrastructure — a sandbox is a scoped Projection plus a gated promotion Contract. Promotion re-validates against target Contracts. Failures enter the creation loop.

**`:creation/abandoned`.** When all fix strategies exhaust or a human decides to stop, creation enters a terminal `:creation/abandoned` state with provenance (`:creation/abandoned-by`, `:creation/abandoned-reason`). Incomplete creation is auditable, not silently stalled.

**Cache.** Cache is content-addressed. If inputs or governing Contract change, cache invalidates. Re-creation follows the normal loop.

### The Bridge

Artifacts (source code, images, documents) live in their native medium. The datom store holds everything ABOUT the artifact. A bridge connects the two — an effectHandler with a Contract at the medium boundary:

```
File (native medium) ←→ Bridge (effectHandler + Contract) ←→ Datoms
```

Examples: devac sync bridges source code to code graph datoms. A metadata extractor bridges images to dimension/alt-text datoms. The bridge pattern applies at every boundary where data crosses mediums — filesystem, git, GitHub API, web content, remote APIs.

### Validation Feedback

When a Contract rejects a creation, error datoms are committed and `:validation/failed` is emitted. Three fix strategies compose: auto-fix (deterministic, cheap) → AI-fix (sandbox, iterates until Contracts pass) → human-fix (errors surfaced via Projection). The escalation itself can be a StateMachine Contract.

### The Compounding Flywheel

Creation compounds the system through reinforcing loops:

```
Skills → Effects → Patterns → Contracts → Trust → Autonomy → More Skills
  ↑                                                              │
  └──────────────────────────────────────────────────────────────┘
```

Every skill execution produces effect datoms. The LLM observes patterns in effect data, proposes Contracts. Humans approve. The system enforces deterministically. Trust increases. More autonomy enables more skill creation. The system genuinely gets smarter through use — not through retraining, but through the natural cycle of use → observe → propose → enforce.

Knowledge matures through a predictable path:

```
tacit knowledge → knowledge file → proto-Contract → proposed Contract → active Contract → infrastructure Contract
```

The system proposes formalization (`:rule/proposal-needed`) but a human approves each transition. Enforcement migrates outward as patterns stabilize.

### Operations as Creation of Understanding

Operations fit the creation loop: you're creating understanding, not features. Monitoring is a live-persistent Projection over effect datoms. Alerting is a Guard Contract on operational thresholds. Incident response follows the escalation StateMachine. Day-end status reports are a scheduled creation: Projection over the day's effect datoms, rendered on a Surface.

### A Day in Creation — The Counselor's Perspective

```
 8:45  Arrive, open dashboard
       → Surface (Board mode): today's clients, session statuses
       → Clicks "Prepare for 9:00" → morning prep (Card mode):
         last session summary, flagged items, suggested topics
       → Trust-badged: "AI summary — verified by you last week"

 9:00  Session with client
       → System transcribes in real time
       → Surface (Dialog mode): streaming transcript with inline
         AI annotations ("anxiety pattern — similar to session 3")
       → Counselor taps "flag" on an annotation (direct interaction)
       → Asks: "What sleep patterns across the last month?"
         (LLM-mediated — generates analysis from session datoms)

 9:50  Post-session
       → Surface (Card mode): AI-drafted session summary
       → Counselor edits severity from "moderate" to "significant"
         (authoritative, overrides AI draft)
       → Schema Contract validates required fields → done
       → Never typed "datom," "Projection," or "Contract"
```

### A Day in Creation — The Developer's Perspective (Feature Slice)

```
10:00  Add attribute to a data model
       → Assert new Schema Contract: [:schema/client-risk-level :schema/type :enum tx:N true]
       → Additive — existing datoms still valid, no migration needed

10:15  Write effectHandler
       → handler(state, :session/completed) => { datoms: [risk-assessment], intents: [] }
       → Reads session datoms via Projection.snapshot(), computes risk level
       → Returns datom with :tx/source :ai/text-generation, :tx/trust-score 0.85

10:30  Validate
       → Schema Contract validates the output datom structure
       → Behavior Contract (optional) verifies accepted/produced effects
       → Tests run: handler with fixture datoms → expected output

10:45  Fix error
       → Behavior Contract rejects: handler produces :forbidden/diagnosis attribute
       → Error datom committed, :validation/failed emitted
       → Developer reads error via Projection, removes the attribute, re-validates
       → Pass. Feature complete at the Feature slice — no Surface needed yet
```

---

## 4. Self-Documentation

The platform teaches itself using the same five concepts. Onboarding, concept explanation, and debugging assistance are all creation — explanation datoms produced by an LLM effectHandler under a Behavior Contract, cached, trust-scored, audience-tailored.

Users progress through an onboarding StateMachine: `unfamiliar → exploring → practicing → comfortable → teaching`. Each state determines proactive vs. on-demand explanation. The explanation handler reads the platform's own concept structure via a concept Projection and generates contextual help using the user's domain language.

---

## 5. Domains

A **domain** is a named configuration that bundles Schema + Behavior Contracts + Surface template + onboarding StateMachine for a user population. Domains are exclusive per deployment — one domain active, not composable. Cross-domain composition is a future extension.

Examples: a **clinical** domain bundles clinical Guard Contracts, consent Trust Contract, and session Card/Dialog Surface templates. A **developer** domain bundles code quality Guards, CI Behavior Contracts, and code Canvas/PR Board templates.

---

## 6. Portability

Every vivief concept maps to a conventional equivalent. Bidirectional. Read-only snapshots proving portability. A Projection maps to a SQL view, an effectHandler to an Express route, a Contract to a JSON Schema + integration test. The proof that every concept has a conventional equivalent reduces perceived lock-in. Export templates are effectHandlers operating under Behavior Contracts. Mapping tables live in the implementation KB.

---

## 7. Content & Culture

Content is datoms — content types are Schema Contracts, instances are datoms, publishing workflows are effectHandlers. Locale is a Projection dimension with fallback chains. Cultural rules are in-flight Guard Contracts — the same mechanism that catches "Based on my diagnosis..." also catches "using formal 'u' in Dutch therapy context." Translation is creation — same loop, same trust levels.

---

## 8. Visual Triangle — Contracts Made Visible

XState, Storybook, likeC4, and axe are all **Contract verifiers**:

| Tool | Contract Type | What it verifies |
|------|--------------|-----------------|
| **Stately Studio / XState** | Behavior Contract (state machine) | Handler transitions are valid |
| **Storybook** | Render Contract (stories + a11y) | Surface output is correct and accessible |
| **likeC4** | Behavior Contract (aggregation) | C4 architecture at zoom levels |
| **axe** | Render Contract (a11y terms) | WCAG compliance |

The unifying insight: all four tools are **Surfaces over datoms, constrained by Contracts**. A C4 diagram is a Surface rendering aggregation Contract datoms. An XState visualization is a Surface rendering Behavior Contract datoms. A Storybook story is a Surface rendering fixture datoms, verified against a Render Contract.

---

## 9. Actor Runtime

At runtime, the five concepts become actors communicating via effects. Streaming via Projection delivery modes. In-flight Contracts validate during streaming.

```
HumanActor (counselor)
  → emits :voice/input-received
    → SessionRecapActor.receive(:voice/input-received)
      → TranscriberActor produces in-flight tokens
        → InFlightContract validates each chunk
        → DialogSurfaceActor renders (Render Contract enforces a11y)
      → TranscriberActor commits final datom
        → Schema Contract validates structure
        → StoreActor notifies actors with matching Projections
      → If TranscriberActor crashes:
        → Runtime produces [:handler/crashed ...] datom
        → Escalation StateMachine routes to human
```

The streaming path (in-flight tokens → Contract validation → Surface rendering) and the commit path (final datom → Store notification → downstream handlers) coexist naturally. The failure path (crash datom → escalation) is auditable. Contracts appear at every boundary — in-flight, pre-commit, render-time — but only where declared.

---

## 10. Composition

| Composition | What it produces |
|-------------|-----------------|
| **Datom + Schema Contract** | Validated facts (Fact slice) |
| **Datom + Schema Contract + effectHandler** | Validated transformation (Feature slice) |
| **Datom + Projection(snapshot)** | Authorized point-in-time view |
| **Datom + Projection(live-persistent)** | Background monitoring with independent lifecycle |
| **Projection + Projection (composite)** | Named namespace map — multiple data sources, no merging |
| **Projection + Surface** | Rendered output (Surface consumes Projection as parameter) |
| **Surface + Render Contract** | Accessible, tested, documented output |
| **effectHandler + Behavior Contract** | Constrained transitions with visible state machines |
| **effectHandler + in-flight Contract** | Real-time AI guardrails |
| **Contract(effectHandler)** | Contract-governed creation — preconditions on intent, postconditions on result |
| **Validation failure + Creation Loop** | Recursive fix with escalation (auto → AI → human) |

---

## 11. Glossary

### Datom terms

| Term | Definition |
|------|-----------|
| **Datom** | Immutable fact: `[Entity, Attribute, Value, Tx, Op]` |
| **provenance** | `:tx/source` and `:tx/trust-score` on every transaction |
| **trust score** | 0.0–1.0 rating set at ingestion via actor-type defaults or handler override |
| **schema evolution** | Additive by default. Breaking changes require a migration handler |

### Projection terms

| Term | Definition |
|------|-----------|
| **Projection** | Query + access + encryption + delivery mode + trust scope over datoms |
| **delivery** | How a Projection delivers: snapshot, live, live-persistent, or replay |
| **freshness** | What an actor sees: committed datoms only, or also in-flight tokens |
| **composite Projection** | Named namespace map of Projections — each keeps its own trust scope and delivery mode |
| **redaction** | Projection Contract separating compute-access from display-access |

### Surface terms

| Term | Definition |
|------|-----------|
| **Surface** | Renderer consuming a Projection as parameter (6 modes) |
| **trust signal** | Visible provenance in Surface rendering (source badge, trust score) |

### Contract terms

| Term | Definition |
|------|-----------|
| **Contract** | Declared constraint — simultaneously spec, test, and runtime guard |
| **Contract lifecycle** | asserted → active → superseded (or conflicted). Newest wins. Lock = meta-Contract |
| **Contract coverage** | declared (constraints only) vs verifiable (has story, fixture, or StateMachine) |
| **Contract defaults** | Configuration starting `:default`, refining through `:domain-refined` → `:experience-refined` → `:locked` |
| **trust strategy** | Authoritative (human), gated (AI draft→approve), sandboxed (AI isolated→promote) |
| **enforcement strategy** | External (infrastructure enforces), internal (handler embodies constraint), or internal-externalizable (migrates outward as trust increases) |

### effectHandler terms

| Term | Definition |
|------|-----------|
| **effectHandler** | `(state, intent) => { datoms, intents }` — function or actor |
| **implementation strategy** | How an effectHandler is implemented: code, markdown/LLM, StateMachine, or hybrid |
| **Contract-governed** | `Contract(effectHandler)` — Contract wraps handler with preconditions on intent and postconditions on result |
| **graceful failure** | Handler returns error datoms + `:handler/failed` — triggers escalation |
| **crash** | Runtime catches exception → `:handler/crashed` datom → escalates to human |
| **context compaction** | Named pattern for LLM context window management |

### Cross-cutting terms

| Term | Definition |
|------|-----------|
| **Intent** | The effect that enters the creation loop — carries the what-to-create payload, context, and requester identity |
| **creation boundary** | Creation = produces datoms. Utility = pure transformation below the concept level |
| **deterministic first** | LLM generates rules, system enforces them. Probabilistic fallback for edge cases |
| **Fact / Feature / Full** | Three conceptual slices: data only, data + logic, all five concepts |
| **bridge** | effectHandler + Contract at a medium boundary — syncs native medium to datom store |
| **skill** | effectHandler (LLM-implemented) composing other effectHandlers — reusable multi-step workflow orchestration |
| **domain** | Named configuration bundling Schema + Behavior Contracts + Surface template + onboarding StateMachine |
| **sandbox promotion** | Re-validation against target Contracts. Promotion Contract specifies approval rule |
| **:creation/abandoned** | Terminal state for exhausted or cancelled creation — auditable, with provenance |
| **validation exemption** | System-produced validation datoms (trust 1.0) are exempt from re-entering the creation loop |
| **compounding flywheel** | Skills → Effects → Patterns → Contracts → Trust → Autonomy → More Skills |

---

*Version: v6 — closes two gaps identified in the skills brainstorm. Gap 1: Intent formalized as the effect entering the creation loop. Gap 2: Contract enforcement strategy formalized — follows the trust boundary (external when handler trust < Contract criticality, internal when handler embodies the constraint), with enforcement migrating outward as trust increases. effectHandler gains implementation strategy dimension (code, markdown/LLM, StateMachine, hybrid) and Contract-governed notation. Skills added as pattern (LLM-implemented effectHandler composing other effectHandlers). Pattern composition table added for all six patterns. Compounding flywheel and knowledge evolution path added to Creation section. Validation recursion exemption made explicit. Contract sub-types confirmed as closed set of six. Additive to v5 — no concepts added, no sections removed. Five concepts remain sufficient. Replaces v5.*
