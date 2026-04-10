# Vivief Platform Concepts — v3

> Five concepts. Creation is why. The formula is how. Trust varies.

---

## 1. Core Thesis

**The platform exists to help humans, AI, and systems create. All creation follows `(state, effect) => (state', [effect'])`. What varies is who creates and how much the Contract trusts them.**

Five concepts model the entire vivief platform:

```
Datom → Projection → Surface → Contract → effectHandler
  |         |            |          ↕            |
 fact    query+scope   render   constrains    transition
         +delivery     +stream   all of        +actor
         +trust scope            these
```

At runtime, they are actors. Streaming is native via Projection delivery modes. Contracts cross-cut everything — any concept can have one. Every activity — a counseling session, a code analysis, a morning brief, a cultural adaptation — is creation through this same machinery.

**Creation boundary.** Creation = producing datoms. Pure transformations that don't produce datoms (formatting a date, parsing a string, computing a hash) are utilities — functions that handlers call internally, below the concept boundary. The creation loop governs datom production. Utilities don't need Contracts, trust strategies, or escalation.

---

## 2. The Five Concepts

### 2.1 Datom

The universal fact. `[Entity, Attribute, Value, Tx, Op]`.

Immutable, append-only, self-describing. Schema is stored as datoms. The datom log is the shared memory that all actors read from and write to.

**Provenance as datoms.** Every transaction carries provenance attributes that record who created it and how trustworthy it is:

```
[session:42  :session/themes   ["sleep","anxiety"]  tx:81  true]
[tx:81       :tx/source        :ai/opus-4           tx:81  true]   // who created
[tx:81       :tx/trust-score   0.85                  tx:81  true]   // how trusted
```

`:tx/source` identifies the actor (`:human`, `:ai/opus-4`, `:system/devac`, `:web/scraped`). `:tx/trust-score` (0.0–1.0) is set at ingestion and flows through the system — Projections can filter by it, Surfaces can display it, Contracts can enforce thresholds on it.

**Trust score assignment.** Every datom gets a trust score at origination via two mechanisms:

1. **Actor-type defaults** — each actor type has a base trust score: `:human → 1.0`, `:ai/opus-4 → 0.85`, `:system/devac → 1.0`, `:web/scraped → 0.4`. These are Contract defaults (`:default` status) that refine per domain.
2. **Handler override** — an effectHandler operating under strict Contract enforcement (e.g., AI output validated by clinical Guard Contracts) can declare a higher score than the actor-type default. The Contract enforcement has earned that trust.

For derived content, the propagation rule is `min(source_trusts)` — derived content inherits the trust of its least-trusted input.

**Observability as datoms.** LLM invocation metadata (tokens, cost, latency, model) stored as regular datoms alongside results. Queryable via Projection, displayable on Surfaces, aggregatable over time. No special observability layer needed.

**Schema Contract (optional).** Constrains what datoms are valid:

```
[:schema/client-name  :schema/type      :text   tx:1  true]
[:schema/client-name  :schema/required   true   tx:1  true]
```

Schema evolution IS Contract evolution — adding an attribute = asserting a new Schema Contract. At runtime, the Store Actor validates incoming datoms against Schema Contracts before commit.

**Schema evolution.** Schema Contracts are additive by default — they grow (new fields, relaxed constraints) but never remove or tighten. Old datoms are always valid because the Schema only grows. For the rare breaking change (removing a required field, changing a type), a **migration handler** makes the change explicit: migration IS creation, running through the same loop with the same trust strategies, producing new datoms with provenance. Schema Contracts grow. When they must break, a migration handler bridges old to new.

| Domain | Manifestation |
|--------|---------------|
| **devac** | Code graph, diagnostics, LLM observability datoms |
| **Counseling** | Clinical data, AI suggestions, consent records |

### 2.2 Projection

Lens + Seal merged. Query + access + encryption + delivery + freshness in one concept.

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

  // Trust
  trustThreshold?: number  // exclude datoms where :tx/trust-score < threshold
}
```

| Delivery | Behavior |
|----------|----------|
| **snapshot** | Current state. One-shot. |
| **live** | Current state + future matching datoms. This IS reactive subscription. |
| **replay** | Full history from tx:0 or asOf(tx). Time-travel. |

**Named profiles.** The full Projection interface covers query, access, encryption, delivery, trust, and freshness. Most uses need only a few dimensions. Named profiles provide convenience without splitting the concept:

```typescript
Projection.snapshot(query, capability)       // delivery: snapshot, freshness: committed
Projection.live(query, capability)           // delivery: live, freshness: committed
Projection.stream(query, capability)         // delivery: live, freshness: in-flight
Projection.trusted(query, capability, 0.7)   // + trustThreshold: 0.7
```

Profiles are factory functions that set sensible defaults for dimensions you don't care about. The full interface stays unified for fine control.

**Trust zones** constrain which Projections can be constructed. Owner, scoped user, AI agent, and system roles have progressively narrower scope and encryption access.

**Trust-scoped Projection.** The `trustThreshold` field filters datoms by their `:tx/trust-score`. An LLM context load with `trustThreshold: 0.7` excludes low-trust datoms (web-scraped, unreviewed AI output) from the context window. A human reviewing all sources uses `trustThreshold: 0.0`. This prevents poisoned or low-quality data from reaching actors that shouldn't see it — without separate filtering infrastructure.

**Projection Contract (optional).** Constrains what a Projection is allowed to query — making authorization explicit:

```typescript
interface ProjectionContract {
  requiredCapability: CapabilityToken
  maxScope: "own" | "consented" | "all"
  redacted?: AttributeKw[]
}
```

**Redaction.** A Projection Contract can declare that certain attributes are readable (for computation) but must not be rendered. "The AI actor can read `:client/ssn` for fraud analysis, but no Surface may display it." This separates compute-access from display-access — a genuinely new privacy primitive.

| Domain | Manifestation |
|--------|---------------|
| **devac** | MCP queries (snapshot), live diagnostics (live), `asOf` analysis (replay) |
| **Counseling** | Morning prep (snapshot), live session (live+in-flight), history (replay), SSN redaction |

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

**Surface → Projection binding.** A Projection is a Surface parameter: `Surface(projection, mode)`. The binding is recorded as a datom — `[surface:X :surface/projection projection:Y tx:N true]` — making it queryable ("what Surfaces consume this Projection?") without introducing a new concept. A Surface can consume multiple Projections via composite Projection. Multiple Surfaces can share a Projection — it's a value.

**Trust signals in rendering.** When a Surface renders content from datoms with low `:tx/trust-score` or non-human `:tx/source`, the Render Contract can require visible provenance. A web-scraped reference displays with "Source: web (trust: 0.4)" alongside the content. An AI-drafted clinical note renders with "AI draft — pending review." The user always knows what they're looking at.

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

**a11y as Contract term.** Every Surface can have a Render Contract that specifies its WCAG level, keyboard navigability, and screen reader support. axe scanning validates the a11y terms — violations are Contract violations in the datom log.

**Storybook as Contract verification.** `Story = Surface(Projection(fixture-datoms))`. Each story is a test case for a Render Contract — required fields shown, forbidden fields hidden, a11y met.

| Domain | Manifestation |
|--------|---------------|
| **devac** | CLI output, MCP responses, C4 diagrams, live diagnostics |
| **Counseling** | All six modes. a11y validated by Render Contracts. Trust signals on AI output. Storybook stories. |

### 2.4 Contract

The cross-cutting concept. A Contract declares expected behavior — simultaneously spec, test, and runtime guard. It can constrain any of the other four concepts.

**Three modes:**

| Mode | What it does | Example |
|------|-------------|---------|
| **Guard** | Reject invalid state | "Session recap must produce themes, never diagnosis" |
| **Aggregation** | Derive higher-level facts | "HTTP calls aggregate into IO.HTTP" (subsumes devac Rules) |
| **StateMachine** | Define valid transitions | XState machine definition = handler Contract |

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

**Not everything must have a Contract.** A simple validation handler works without a Behavior Contract. A quick CLI Surface works without a Render Contract. Contracts are available when you need guarantees — not required everywhere.

**Contract lifecycle.** Contracts are datoms with a lifecycle:

| State | Meaning |
|-------|---------|
| **asserted** | Declared. Exists in the log. Not yet enforced. |
| **active** | Currently enforced by the Store Actor. |
| **superseded** | Replaced by a newer version. Still in the log (immutable), no longer enforced. |
| **conflicted** | Two active Contracts disagree. Requires resolution. |

Resolution rules: (1) **Newest active wins** for same-type, same-attribute Contracts — asserting a new Schema Contract for `:client/name` supersedes the previous one. (2) **Lock = a Guard Contract on the Contract itself** — a `:locked` Contract has a meta-Contract that rejects new assertions. To unlock, retract the lock Contract first (with `:tx/why`). (3) **Cross-type conflicts** surface as `:contract/conflict` datoms + `:effect/contract-conflict`, entering the creation loop for resolution. Contract lifecycle is just datoms + Contracts-about-Contracts — no new machinery.

**Trust over structure.** When a Trust Contract restricts access to something a Schema Contract requires, the Trust Contract wins. Safety trumps structure. The conflict is surfaced as an error datom, and the creation loop resolves it — typically the actor needs a higher capability to proceed.

**Contract coverage.** A Contract is either **declared** (has constraints but no verification) or **verifiable** (has at least one story, fixture, or StateMachine transition that can be mechanically checked). This is queryable via `:contract/verifiable` — "show me all declared-but-not-verifiable Contracts" is a technical debt Projection. No "complete" tier — completeness is domain-specific.

**Security as Contract enforcement.** Security is not a separate layer — it's Contract enforcement at every boundary where data enters or leaves the system. Three detection patterns, all implemented as Guard or Aggregation Contracts:

- **Instruction detection** (Guard): scans incoming content for injection patterns (prompt injection, encoded payloads, social engineering)
- **Behavioral validation** (Guard): checks LLM output against expected patterns (no unauthorized URLs, no data in query parameters, output matches stated intent)
- **Trust scoring** (Aggregation): computes trust for derived content from source trust scores. Default rule: `min(source_trusts)`. Derived content inherits the trust of its least-trusted input.

These are deterministic security checks at bridge boundaries — where external content enters the datom store, where datoms leave for external systems, and where LLM output is produced.

**Contract defaults.** Not all configuration can be decided at design time. The pattern: assert a sensible default as a datom, mark it `:default`, and let domain experience refine it through normal datom evolution:

```
:default           → works without domain expertise
:domain-refined    → adapted for specific domain (clinical, dev, content)
:experience-refined → adjusted from actual usage data and incidents
:locked            → frozen after deliberate decision (with :tx/why)
```

Each transition is a datom assertion with provenance. The question is never lost — it becomes an explicit configuration point that tracks its own history.

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
  resolution: { text: "crdt-yjs", scalar: "last-writer-wins", ref: "manual-merge" }
  scope: { push: DatomQuery, pull: DatomQuery }
  claim: { pattern: ":effect/claimed-by", timeout: "30s" }
}
```

| Domain | Manifestation |
|--------|---------------|
| **devac** | Lint rules (Guard), effect aggregation for C4 (Aggregation), in-flight code review |
| **Counseling** | Clinical constraints, real-time AI guardrails, a11y, consent, conflict resolution |

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

**Failure model.** Two paths, both auditable:

- **Graceful failure**: the handler returns `{ datoms: [error-datoms], effects: [:effect/failed] }`. The error datoms describe what went wrong. The `:effect/failed` triggers the creation loop's escalation.
- **Crash**: the actor runtime catches the exception and produces a crash datom: `[handler:X :handler/crashed "reason" tx:N true]` with `:tx/source :system/runtime`. The `:effect/crashed` escalates to human immediately.

Both are datoms in the log — auditable, queryable. Both enter the creation loop. The escalation StateMachine distinguishes them: a graceful failure may auto-retry, a crash escalates to human.

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

**Context compaction.** `(state, :effect/compact) => { datoms: [summary-datom], effects: [] }`. Named pattern for LLM context window management.

| Domain | Manifestation |
|--------|---------------|
| **devac** | Sync, validation, C4 generation (via aggregation Contracts) |
| **Counseling** | Voice recap → streaming → structure → analysis, with real-time guardrails |

---

## 3. Creation

Everything vivief does is creation. A counselor creating session notes, AI analyzing patterns, devac extracting a code graph, a morning brief from emails — all follow one loop with variable trust.

### The Creation Loop

```
Intent → Contract → Create → Validate ─── pass ──→ Cache
            │          │         │
         (defines    (human,   fail
          what's     AI, or     │
          valid      system)    ▼
          + trust)         error datoms
                         + :effect/fix
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

Not every feature requires all five concepts. Three named slices give entry points at different levels of complexity:

| Slice | Concepts used | What you build | Example |
|-------|--------------|----------------|---------|
| **Fact** | Datom + Schema Contract | Validated data structure | Add an attribute, define an entity type |
| **Feature** | Datom + Schema Contract + effectHandler (function) | Validated transformation | Derive themes from transcript, migrate data |
| **Full** | All five | End-to-end with display and constraints | Counseling session with live streaming and guardrails |

Slices don't bypass concepts — they use fewer. Entry path: Fact (schema design) → Feature (handlers) → Full (surfaces + contracts + wiring).

### Three Trust Strategies

| Strategy | Trust | Commit behavior |
|----------|-------|-----------------|
| **Authoritative** (human) | Full | Immediate commit. Contract validates, but human has override with `:tx/why`. |
| **Gated** (AI) | Draft | Draft commit (`:tx/source :ai`, `:tx/status :pending`). Human approves before authoritative. |
| **Sandboxed** (AI, low-risk) | Isolated | Commits to sandbox Projection scope. Invisible until promoted. |

**Sandbox as Projection scope.** No separate infrastructure — a sandbox is a scoped Projection plus a gated promotion Contract. Sandboxed datoms commit to the store under a sandbox namespace. Only the creator and reviewers see them.

**Sandbox promotion.** Promotion re-validates sandboxed datoms against the target namespace's active Contracts — the same validation a direct commit would face. If all Contracts pass, promotion succeeds. Who approves is a promotion Contract property: `:promotion/requires-approval true` (gated, human reviews) or `:promotion/auto-on-pass true` (system, auto-promotes when all Contracts pass). Promotion produces datoms with `:tx/promoted-from` provenance. Failures enter the creation loop.

**Cache as creation memory.** The platform remembers what it created, under what conditions, and whether those conditions still hold:

```
[creation:X  :creation/inputs-hash     "sha256:..."    tx:N  true]
[creation:X  :creation/contract-hash   "sha256:..."    tx:N  true]
[creation:X  :creation/actor           :ai/opus-4      tx:N  true]
[creation:X  :creation/valid           true             tx:N  true]
```

If inputs-hash and contract-hash still match: return cached output, zero cost. If either changed: re-create. This is content-addressable creation — like Turborepo or Nix, but for everything in the platform.

**Cache invalidation.** When a Contract is superseded (its state changes from active to superseded), its hash changes. A reactive Projection on Contract changes triggers a sweep: the Store queries all cache datoms where `:creation/contract-hash` matches the old Contract's hash, retracts their `:creation/valid`, and emits `:effect/cache-invalidated` per affected creation. Re-creation follows through the normal creation loop.

### Validation Feedback

When a Contract rejects a creation, two things happen: error datoms are committed (diagnostics in the log), and an `:effect/validation-failed` is emitted. This effect can trigger a fix handler — and fixing is itself creation, re-entering the loop with error datoms as input state.

**Three fix strategies, mapping to the same trust levels:**

| Fix strategy | Actor | How it works |
|-------------|-------|-------------|
| **Auto-fix** | System (deterministic) | Applies safe mechanical fixes (e.g. `biome --fix`). Immediate. Re-validates. |
| **AI-fix** | AI (sandboxed) | Reads errors + source in sandbox, iterates until all Contracts pass, promotes clean result. |
| **Human-fix** | Human (authoritative) | Errors surfaced via Projection, developer edits directly. |

**Escalation.** Fix strategies compose: auto-fix runs first (cheap, deterministic). If errors remain, AI attempts in sandbox. If AI exhausts retries or errors require judgment, the human is surfaced the remaining errors. The escalation itself can be a StateMachine Contract — max retries, timeout, escalation rules.

### Artifacts and the Bridge

Creation produces **artifacts** — datom clusters with provenance. Source code, images, documents, clinical notes are all artifacts. What varies is the medium they live in and the bridge that connects them to the datom store.

**Artifacts live in their native medium.** Files stay on filesystem, git, or Hyperdrive. The datom store holds everything ABOUT the artifact: intent, provenance, metadata, validation state, cache validity. A bridge connects the two — and a bridge is always an effectHandler with a Contract at the medium boundary:

```
File (native medium) ←→ Bridge (effectHandler + Contract) ←→ Datoms
```

| File type | Bridge | Datoms store |
|-----------|--------|-------------|
| **Source code** | devac sync (parser) | Code graph, diagnostics, effects |
| **Images / SVG** | Metadata extractor | Dimensions, alt-text, provenance |
| **Documents** | Document parser | Structure, extracted content |
| **Clinical notes** | Datom-native | Content lives directly as datoms |

**The datom store never stores large file content.** It stores what the file IS (metadata), whether it's valid (diagnostics), who created it and why (provenance), and where it is in the workflow (state). Small structured content (clinical notes, config) may be datom-native when naturally datom-shaped.

The bridge pattern applies at every boundary where data crosses mediums — filesystem, git, GitHub API, web content, remote APIs. Each bridge boundary has a Contract that validates what enters and what leaves, with trust scoring on inbound data.

**Source code is the hardest case.** It has compilers, type-checkers, linters, git branching, GitHub PRs, CI pipelines, and review cycles. The vivief mapping:

| Git/GitHub | Vivief concept |
|-----------|---------------|
| Branch | Sandbox Projection scope |
| PR | Gated promotion (`:effect/promote-sandbox`) |
| Review | Contract enforcement (human + AI validators) |
| CI checks | Automated Contract validation |
| Merge | Promotion from sandbox to authoritative |
| Worktree | Materialized sandbox workspace |

**LLM context as bridge participant.** AI memory, plans, and decisions are bridged to datoms rather than living only as markdown files. The LLM's context window is a Projection (delivery: snapshot) loading relevant datoms. Its tools are bridge endpoints — each MCP tool bridges the LLM to a specific medium. Decisions that survive context compaction persist as datoms with provenance, queryable across conversations.

**Non-developer users.** A counselor, analyst, or designer doesn't think in "git" or "filesystem." Their bridge is LLM-mediated — the AI bridges their domain intent to the appropriate creation medium. A counselor speaks and the system transcribes, structures, and validates via clinical Contracts. The five concepts apply identically; only the Surface and Contract domain differ.

### A Day in Creation

```
 7:00  Morning Brief (AI, gated)
       → In-flight Contract validates: no full email bodies
       → Draft brief → user reviews → approves
       → Cached until new emails arrive

 8:30  Code Review (Human + AI, mixed trust)
       → AI suggests improvements (sandboxed)
       → Developer accepts some (authoritative)
       → System runs tests (deterministic, immediate)
       → Cached: unchanged code = unchanged test results

10:00  Counseling Session (Human + AI + System)
       → Counselor speaks → System transcribes (deterministic)
       → AI proposes themes (gated → counselor reviews)
       → AI flags risk (gated → counselor reviews urgently)
       → Cached per-component: transcript until audio changes,
         themes until transcript changes

14:00  Schema Evolution (System + Human)
       → Developer adds attribute (authoritative, additive)
       → System validates existing datoms (still valid — additive)
       → All downstream caches with changed contract-hash invalidated

16:00  Treatment Plan Review (Human + AI)
       → AI synthesizes 8 sessions into progress (gated)
       → Counselor reviews, edits, approves (authoritative)
       → Next month: AI creates from cache + new sessions only
```

---

## 4. Visual Triangle — Contracts Made Visible

XState, Storybook, likeC4, and axe are all **Contract verifiers**. They make Contracts visible and testable:

| Tool | Contract Type | What it verifies |
|------|--------------|-----------------|
| **Stately Studio / XState** | Behavior Contract (state machine) | Handler transitions are valid |
| **Storybook** | Render Contract (stories + a11y) | Surface output is correct and accessible |
| **likeC4** | Behavior Contract (aggregation) | C4 architecture at zoom levels |
| **axe** | Render Contract (a11y terms) | WCAG compliance |

The unifying insight: all four tools are **Surfaces over datoms, constrained by Contracts**. A C4 diagram is a Surface rendering aggregation Contract datoms. An XState visualization is a Surface rendering Behavior Contract datoms. A Storybook story is a Surface rendering fixture datoms, verified against a Render Contract.

---

## 5. Actor Runtime

At runtime, the five concepts become actors communicating via effects. Streaming via Projection delivery modes. In-flight Contracts validate during streaming. Location transparency via Protomux.

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
      → If TranscriberActor crashes:
        → Runtime produces [:handler/crashed ...] datom
        → Escalation StateMachine routes to human
```

The streaming path (in-flight tokens → Contract validation → Surface rendering) and the commit path (final datom → Store notification → downstream handlers) coexist naturally. The failure path (crash datom → escalation) is auditable. Contracts appear at every boundary — in-flight, pre-commit, render-time — but only where declared.

---

## 6. Content & Culture

Content and translation are domain patterns within the five concepts, not new concepts.

**Principles:**

1. **Content is datoms.** Content types are Schema Contracts, instances are datoms, publishing workflows are effectHandlers. A CMS is Surface (Canvas) + Projection (content datoms) + Contract (content type schema) + effectHandler (publishing workflow).

2. **Locale is a Projection dimension.** The Projection resolves which locale to surface, with fallback chains. Surface rendering adapts (RTL/LTR, typography, date/number format).

3. **Cultural rules are Contracts.** The same in-flight mechanism that catches "Based on my diagnosis..." also catches "using formal 'u' in Dutch therapy context." Cultural Contracts constrain AI-generated content per locale:

```
[:contract/nl-therapy  :contract/rule  "Use informal 'je' not formal 'u'"     tx:5  true]
[:contract/ja-therapy  :contract/rule  "Honor amae as valid attachment"        tx:6  true]
```

4. **Content worlds for deep adaptation.** When a locale requires more than string translation — different content structure, different clinical assumptions, different legal framework — each locale becomes a semi-independent content world. Bridges link related content across worlds with explicit relationship types (literal, adapted, original, untranslatable).

5. **Translation is creation.** Same loop, same trust levels. AI adapts within cultural Contracts (gated). Cultural experts author directly (authoritative). System serves cached adaptations (deterministic).

---

## 7. Composition

| Composition | What it produces |
|-------------|-----------------|
| **Datom + Schema Contract** | Validated facts (Fact slice) |
| **Datom + Schema Contract + effectHandler** | Validated transformation (Feature slice) |
| **Datom + provenance attrs** | Facts with trust score and source tracking |
| **Datom + Projection(snapshot)** | Authorized point-in-time view |
| **Datom + Projection(live)** | Reactive subscription |
| **Datom + Projection(live, in-flight)** | Streaming with redaction |
| **Projection + trustThreshold** | Trust-scoped view (excludes low-trust datoms) |
| **Projection + Surface** | Rendered output (Surface consumes Projection as parameter) |
| **Surface + Render Contract** | Accessible, tested, documented output |
| **Surface + trust signals** | Rendered output with visible provenance |
| **effectHandler + Behavior Contract** | Constrained transitions with visible state machines |
| **effectHandler + in-flight Contract** | Real-time AI guardrails |
| **effectHandler + failure model** | Auditable failure with escalation (graceful → crash → human) |
| **Surface + Projection(fixture)** | Storybook stories |
| **Validation failure + Creation Loop** | Recursive fix with escalation (auto → AI → human) |
| **File + Bridge + Datom store** | Artifact with provenance, queryable metadata, and validation |
| **Contract + defaults lifecycle** | Self-documenting configuration that refines per domain and experience |
| **Contract + Contract (meta)** | Contract lifecycle — lock, supersede, conflict detection |
| **P2P + Sync Contract** | Conflict-resolved replication with claim protocol |
| **All five + Contracts** | The vivief platform |

---

## 8. Infrastructure

Holepunch stack. P2P as remote actors with location transparency.

| P2P sub-concept | Holepunch module |
|-----------------|-----------------|
| Agent log | Hypercore |
| Agent log (index) | Hyperbee |
| Key derivation | Corestore (= Projection encryption) |
| Sync | Autobase (multi-writer) |
| Peer discovery | HyperDHT + Hyperswarm |
| IPC | Protomux |
| Handler artifacts | Hyperdrive |

The Sync Contract specifies conflict resolution strategy per attribute type: text merges via CRDT (Yjs), scalars use last-writer-wins, references surface to human for merge. The claim pattern handles multi-device work distribution.

Peer validation is Contract enforcement on incoming datoms — peers are just remote actors, governed by the same Contracts as local actors.

---

## 9. Glossary

| Term | Definition |
|------|-----------|
| **Datom** | Immutable fact: `[Entity, Attribute, Value, Tx, Op]` |
| **Projection** | Query + access + encryption + delivery mode + trust scope over datoms |
| **Surface** | Renderer that consumes a Projection as parameter (6 modes) |
| **Contract** | Declared constraint — simultaneously spec, test, and runtime guard |
| **effectHandler** | `(state, effect) => { datoms, effects }` — function or actor |
| **delivery** | How a Projection delivers updates: snapshot, live, or replay |
| **freshness** | What an actor sees: committed datoms only, or also in-flight tokens |
| **Projection profile** | Convenience factory (snapshot/live/stream/trusted) that sets sensible Projection defaults |
| **provenance** | `:tx/source` and `:tx/trust-score` on every transaction — who created it and how trusted |
| **trust score assignment** | Actor-type defaults (`:human → 1.0`, `:ai → 0.85`, `:web → 0.4`) with handler override |
| **trust threshold** | Projection filter that excludes datoms below a trust score |
| **trust signal** | Visible provenance in Surface rendering (source badge, trust score) |
| **redaction** | Projection Contract separating compute-access from display-access |
| **trust strategy** | Authoritative (human), gated (AI draft→approve), sandboxed (AI isolated→promote) |
| **bridge** | effectHandler + Contract at a medium boundary — syncs native medium to datom store |
| **artifact** | Datom cluster with provenance — the named output of a creation cycle |
| **Contract lifecycle** | asserted → active → superseded (or conflicted). Newest wins. Lock = meta-Contract |
| **Contract coverage** | declared (constraints only) vs verifiable (has story, fixture, or StateMachine) |
| **Contract defaults** | Configuration points that start `:default` and refine through `:domain-refined` → `:experience-refined` → `:locked` |
| **schema evolution** | Additive by default. Breaking changes require a migration handler |
| **migration handler** | effectHandler that bridges old schema to new — migration IS creation |
| **creation boundary** | Creation = produces datoms. Utility = pure transformation below the concept level |
| **Fact / Feature / Full** | Three conceptual slices: data only, data + logic, all five concepts |
| **graceful failure** | Handler returns error datoms + `:effect/failed` — triggers escalation |
| **crash** | Runtime catches unhandled exception → `:handler/crashed` datom → escalates to human |
| **sandbox promotion** | Re-validation against target Contracts. Promotion Contract specifies approval rule |
| **Schema Contract** | Constrains what datoms can exist |
| **Projection Contract** | Constrains who can query what, with redaction rules |
| **Render Contract** | Constrains Surface rendering: a11y, required/forbidden display, trust signals |
| **Trust Contract** | Specifies key derivation, roles, consent protocol. Wins over Schema on access conflicts |
| **Sync Contract** | Specifies conflict resolution per attribute type |
| **Behavior Contract** | Constrains effectHandler: accepted effects, state machine, aggregation |
| **Cultural Contract** | In-flight validation of cultural rules for AI-generated content |
| **validation feedback** | When a Contract rejects creation, error datoms + fix effect trigger recursive creation with escalation |

---

*Version: v3 — closes all concept-level gaps from v2 review. Adds: trust score assignment rule (actor-type defaults + handler override), schema evolution (additive-only + migration handler), Contract lifecycle (4 states, newest-wins, lock-as-Contract), Contract coverage (declared/verifiable), Surface→Projection binding (parameter + datom), effectHandler failure model (graceful + crash), trust-over-structure conflict rule, sandbox promotion mechanics, cache invalidation mechanics, creation boundary (datom production vs utility), conceptual slices (Fact/Feature/Full), Projection profiles. Five concepts remain sufficient. Replaces v2.*
