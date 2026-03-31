# Vivief Platform Concepts — v4

> Five concepts. Creation is why. The formula is how. Trust varies. LLM authors rules, system enforces them.

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

**Deterministic first.** Each actor does what it's best at. The system validates deterministically — fast, consistent, auditable. The LLM generates the rules the system enforces — pattern recognition, rule authoring, natural language explanation. The human approves, judges, and decides domain questions. When the LLM handles edge cases via reasoning, it observes its own patterns and proposes new deterministic rules. The system gets more deterministic over time. **LLM authors, system enforces, LLM refines.**

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

**Handler override trust boundary.** By default, any handler whose governing Behavior Contract is verifiable (has stories, fixtures, or StateMachine transitions) qualifies for trust override. For high-stakes domains, a Trust Contract can restrict overrides to a named list of Behavior Contracts. The rule: "A handler may override its actor-type trust score if its governing Behavior Contract is verifiable — unless a Trust Contract for that domain restricts overrides to a named list." This uses the Contract defaults lifecycle: `:default` = verifiable qualifies, `:domain-refined` = explicit list.

For derived content, the propagation rule is `min(source_trusts)` — derived content inherits the trust of its least-trusted input. Handler override raises the actor's contribution to the min calculation, not the input trust: `min(0.80_input, 0.95_overridden_actor) = 0.80`. The chain stays honest.

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

**Live Projection — two tiers.** Most live Projections are UI-bound (a session view, a dashboard panel) and should die with their Surface — these are **ephemeral** (`delivery: "live"`), no entity ID, garbage collected on unmount. Background monitoring, alerting, and long-running analysis need Projections that outlive any particular Surface — these are **persistent** (`delivery: "live-persistent"`), recorded as datoms with `:projection/status` (active / paused / stopped), consumable by zero or more Surfaces. On Store compaction, persistent Projections re-snapshot automatically via `:effect/compaction-complete`.

**Named profiles.** The full Projection interface covers query, access, encryption, delivery, trust, and freshness. Most uses need only a few dimensions. Named profiles provide convenience without splitting the concept:

```typescript
Projection.snapshot(query, capability)       // delivery: snapshot, freshness: committed
Projection.live(query, capability)           // delivery: live, freshness: committed
Projection.stream(query, capability)         // delivery: live, freshness: in-flight
Projection.trusted(query, capability, 0.7)   // + trustThreshold: 0.7
Projection.debug(entity, timeRange)          // full datom trail for entity
```

Profiles are factory functions that set sensible defaults for dimensions you don't care about. The full interface stays unified for fine control.

**Debug profiles.** `Projection.debug()` returns the full datom trail for an entity: every assertion, retraction, Contract validation, trust score, effect, and handler invocation. Named debug profiles cover common failure patterns:

```typescript
Projection.debugContractFailure(entity)      // Contract validation trail
Projection.debugTrustEscalation(entity)      // trust scoring + escalation trail
Projection.debugCacheInvalidation(creation)  // cache lifecycle trail
```

These are the datom-native equivalent of `console.log` — instant, deterministic, no LLM needed. For complex multi-entity trails, the platform's explanation handler (§4) generates a narrative from the debug Projection's output.

**Composite Projection.** A Surface that needs multiple data sources composes Projections by name:

```typescript
CompositeProjection({
  session: Projection.live(sessionQuery, cap),
  notes: Projection.snapshot(notesQuery, cap),
  metrics: Projection.trusted(metricsQuery, cap, 0.8)
})
```

Each constituent keeps its own trust scope, delivery mode, and access rules — no lossy merging. The Surface receives a named map and decides how to combine them in rendering. Composition is named slots, not union or precedence.

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
| **devac** | MCP queries (snapshot), live diagnostics (live), `asOf` analysis (replay), debug profiles |
| **Counseling** | Morning prep (snapshot), live session (live+in-flight), monitoring (live-persistent), history (replay), SSN redaction |

### 2.3 Surface

The renderer. Consumes a Projection's output. Eight modes:

| Mode | Input | Output |
|------|-------|--------|
| **Stream** | Time-ordered datoms | Activity feed, chat, notifications |
| **Card** | Single entity datoms | Detail page, form, record |
| **Canvas** | Block datoms + CRDT state | Document, notes, Jupyter blocks |
| **Dialog** | Projection(live, in-flight) | AI chat with streaming tokens |
| **Board** | Grouped datoms | Kanban, calendar, roster |
| **Diagram** | Contract + effect datoms | C4, XState viz, sequence diagram |
| **Learn** | Concept structure datoms | Inline concept annotations for users in onboarding |
| **Explain** | Concept structure datoms | Platform structure view for developers |

Streaming is natural — Dialog renders what the Projection delivers. System visualization is natural — Diagram renders Contract and handler datoms. Self-documentation is natural — Learn and Explain render the platform's own concept structure (§4).

**Surface → Projection binding.** A Projection is a Surface parameter: `Surface(projection, mode)`. The binding is recorded as a datom — `[surface:X :surface/projection projection:Y tx:N true]` — making it queryable ("what Surfaces consume this Projection?") without introducing a new concept. A Surface can consume multiple Projections via composite Projection. Multiple Surfaces can share a Projection — it's a value.

**Non-developer interaction.** Surfaces for non-developer users blend direct interaction (deterministic, fast) with LLM-mediated interaction (contextual, generative). A counselor clicks "new session" (direct), selects a client from a list (direct), then asks "summarize this week's patterns" (LLM-mediated). The Surface design determines which interactions are direct and which are LLM-mediated — deterministic first, LLM when it adds value.

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
| **Counseling** | All eight modes. a11y validated by Render Contracts. Trust signals on AI output. Learn mode for new counselors. |

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

**Anti-pattern Guard Contracts.** Three named anti-patterns that the concepts specifically discourage:

| Anti-pattern | What it means | Detection |
|-------------|---------------|-----------|
| **utility-as-creation** | Modeling pure transformations as effectHandlers with datom output | Handler output trivially derivable from input |
| **Contract-on-everything** | Adding Contracts where none are needed | Contract on entity type with no safety/trust/compliance justification |
| **Projection-splitting** | Breaking the unified Projection into separate query and access objects | Separate query and access interfaces for the same data |

These are named datoms (`:anti-pattern/utility-as-creation`, etc.) with graduated enforcement: the onboarding explanation handler (§4) explains them to developers in `exploring` or `practicing` state. LLM-generated lint rules warn at development time. Optional Guard Contracts block when the team is ready for enforcement. Teams choose their level via Contract lifecycle — assert the Guard Contract when ready.

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
| **devac** | Lint rules (Guard), effect aggregation for C4 (Aggregation), in-flight code review, anti-pattern Guards |
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

### A Day in Creation — The Counselor's Perspective

```
 8:45  Arrive, open dashboard
       → Surface (Board mode): today's clients, session statuses
       → Clicks "Prepare for 9:00" (direct interaction)
       → System shows morning prep (Surface, Card mode):
         last session summary, flagged items, suggested topics
       → All trust-badged: "AI summary — verified by you last week"

 9:00  Session with client
       → Counselor speaks naturally — system transcribes in real time
       → Surface (Dialog mode): streaming transcript with inline
         AI annotations ("anxiety pattern — similar to session 3")
       → Counselor taps "flag" on an annotation (direct interaction)
       → Asks: "What sleep patterns do you see across the last month?"
         (LLM-mediated — generates analysis from session datoms)

 9:50  Post-session
       → Surface (Card mode): AI-drafted session summary
       → Counselor edits severity from "moderate" to "significant"
         (direct interaction, authoritative, overrides AI draft)
       → Clicks "Save" — Schema Contract validates required fields
       → Done. Never typed "datom," "Projection," or "Contract."

10:15  Between sessions
       → Learn mode active (counselor in "exploring" state):
         "The summary you just edited was an AI draft (trust 0.85).
          Your edit made it authoritative (trust 1.0).
          The system keeps both versions with timestamps."
       → As counselor reaches "comfortable" state:
         annotations become on-demand only
```

---

## 4. Platform Self-Documentation

The platform teaches itself. Onboarding, concept explanation, ecosystem translation, over-modeling prevention, Contract guidance, and debugging assistance are all creation — the same five concepts, the same creation loop, applied to the platform's own structure.

### The Onboarding Domain as Creation Stack

| Concept | Role in onboarding |
|---------|-------------------|
| **Schema Contract** | Defines explanation datoms: `:explanation/concept`, `:explanation/context`, `:explanation/audience` (developer, counselor, designer), `:explanation/depth` (fact-level, feature-level, full-level) |
| **effectHandler** | LLM-powered explanation handler. Takes the current feature's concept structure (Contracts, bindings, trust scopes) as input, produces explanation datoms. Audience-aware, slice-aware. Cached via contract-hash. |
| **Behavior Contract** | Constrains explanations: must reference only concepts the user's current slice uses, must use the audience's domain language, must be accurate to the current Contract state. |
| **StateMachine** | Onboarding journey: `unfamiliar → exploring → practicing → comfortable → teaching`. Each state determines proactive vs. on-demand explanation. |
| **Surface** | Learn mode (inline annotations for users) and Explain mode (concept structure view for developers). |

**Concept Projection.** A Projection over the platform's own datoms — Contracts, bindings, trust scopes, handler relationships. This is what the explanation handler reads to generate contextual help. The platform's concept structure is data (datoms), so explaining it is just another Projection + Surface combination.

**The onboarding StateMachine:**

```
unfamiliar → exploring → practicing → comfortable → teaching
     │            │            │            │            │
  everything   contextual   on-demand    silent     can author
  explained    annotations  only         (badges    explanations
  proactively  on actions              only)      for others
```

Each user's state is a datom with provenance — queryable ("show me which team members are in `exploring` state for Contract concepts"), evolvable per domain.

### Ecosystem Translation

Developers bring existing knowledge. The explanation handler uses `:user/familiar-with` profile datoms (`:react`, `:postgresql`, `:redux`, `:express`) to generate analogies:

| Vivief concept | For a React developer | For a backend developer |
|---------------|----------------------|------------------------|
| Projection | "Like useSWR — query + subscription + cache" | "Like a SQL view with a webhook" |
| effectHandler | "Like a reducer, but returns effects too" | "Like an Express middleware that returns data + side effects" |
| Surface | "Like a React component bound to a data source" | "Like a template engine consuming a query result" |
| Contract | "Like PropTypes + test assertions + runtime validation combined" | "Like a DB constraint + API schema + integration test" |

Translations are audience-tailored explanations within the onboarding domain — not separate infrastructure. They fade as the developer moves from `exploring` to `comfortable`, replaced by native vivief terminology.

### Deterministic-First Guardrails

The platform's guardrails follow the core principle: LLM authors rules, system enforces them.

**Over-modeling prevention:**
1. **Preferred: LLM-generated lint rules.** The LLM analyzes effectHandlers and generates deterministic, machine-checkable rules stored as datoms. Example: "any effectHandler whose output datoms contain only attributes present in input without transformation → flag as possible utility-as-creation."
2. **Fallback: LLM explanation.** For nuanced cases, the onboarding explanation handler catches the pattern and explains why it's over-modeling.
3. **Progression:** When the LLM gives the same explanation repeatedly, it proposes a new lint rule — moving from probabilistic to deterministic. The system gets more deterministic over time.

**Contract guidance:**
- The LLM generates a **Contract decision tree** as a deterministic Schema Contract: "features with safety implications require Behavior Contract, pure data schemas require only Schema Contract, user-facing output requires Render Contract."
- The team reviews and activates the decision tree. The system enforces it.
- Edge cases trigger LLM reasoning + a proposed tree extension.

**Debug assistance:**
- `Projection.debug()` and named debug profiles (§2.2) are the deterministic layer — always available, instant.
- For complex multi-entity trails, the explanation handler generates a natural-language narrative from the debug Projection's output. Cached, trust-scored, auditable.
- The LLM observes repeated debug narratives and proposes new named debug profiles — the 80% case becomes deterministic.

---

## 5. Domains

A **domain** is a named configuration that packages the five concepts for a specific user population. It bundles everything a user group needs: data model, behavior rules, UI patterns, and onboarding path.

```
[domain:clinical  :domain/schema-contracts    [...]  tx:N  true]
[domain:clinical  :domain/behavior-contracts  [...]  tx:N  true]
[domain:clinical  :domain/surface-template    ...    tx:N  true]
[domain:clinical  :domain/onboarding-machine  ...    tx:N  true]
```

| Domain component | What it provides |
|-----------------|-----------------|
| **Schema Contracts** | The domain's data model — what entities and attributes exist |
| **Behavior Contracts** | The domain's rules — what handlers can and must do |
| **Surface template** | The domain's UI patterns — starting points for Surface design |
| **Onboarding StateMachine** | The domain's learning path — from unfamiliar to comfortable |

Domains are datoms — queryable ("show me all domains"), evolvable, composable. A domain doesn't prescribe — it provides starting points. Implementers customize the Surface template, refine Contracts through the defaults lifecycle, and extend the onboarding path.

**Domain examples:**

| Domain | Users | Key Contracts | Surface patterns |
|--------|-------|--------------|-----------------|
| **Clinical** | Counselors, therapists | Clinical Guard Contracts, consent Trust Contract, HIPAA Schema Contracts | Session Card, client Board, Dialog for AI assistance |
| **Developer** | Engineers | Code quality Guards, CI Behavior Contracts, a11y Render Contracts | Code Canvas, PR Board, Diagram for architecture |
| **Content** | Writers, designers | Editorial Guards, publishing StateMachine, locale Contracts | Canvas for writing, Board for editorial workflow |

A domain connects onboarding (§4), guardrails (§4), non-developer UX (§2.3), and the concept stack into one coherent unit per user population. No new concept — a domain is a named composite of existing concepts, recorded as datoms.

---

## 6. Portability & Migration

### Export Templates

LLM-generated mapping templates translate vivief concepts to conventional equivalents. Templates are deterministic rules stored as datoms — the LLM generates them, the team reviews them, the system applies them consistently.

| Vivief concept | Conventional equivalent |
|---------------|------------------------|
| Projection (snapshot) | SQL view / REST GET endpoint |
| Projection (live) | SQL view + WebSocket subscription |
| effectHandler (function) | Express route handler / serverless function |
| effectHandler (actor) | Worker process / message consumer |
| Surface (Card) | React component / template |
| Schema Contract | JSON Schema / DB migration |
| Trust Contract | Auth middleware / RBAC rules |
| Behavior Contract | Integration test suite |

Exports are read-only snapshots — proof of portability, not a runtime layer. A team that knows it can generate a conventional equivalent at any time commits more confidently. The export is an effectHandler operating under a Behavior Contract that ensures structural equivalence.

### Migration Templates

The same mapping works in reverse — conventional patterns to vivief concepts. A team with a REST + PostgreSQL + React stack uses these as starting points:

| Conventional pattern | Vivief mapping |
|---------------------|---------------|
| REST GET endpoint | Projection.snapshot() + Surface |
| REST POST endpoint | effectHandler + Schema Contract |
| PostgreSQL table | Schema Contract + datoms |
| React component | Surface + Render Contract |
| Redux store/reducer | Projection + effectHandler |
| Express middleware | Contract (Guard mode) |
| JWT auth | Trust Contract |
| DB migration script | Migration handler (creation) |

Migration and export templates are bidirectional — one set of mappings, two directions. The LLM handles complex cases (middleware chains, ORM relationships) and proposes new templates. Core mappings are deterministic; edge cases get LLM reasoning that proposes new deterministic rules over time.

---

## 7. Visual Triangle — Contracts Made Visible

XState, Storybook, likeC4, and axe are all **Contract verifiers**. They make Contracts visible and testable:

| Tool | Contract Type | What it verifies |
|------|--------------|-----------------|
| **Stately Studio / XState** | Behavior Contract (state machine) | Handler transitions are valid |
| **Storybook** | Render Contract (stories + a11y) | Surface output is correct and accessible |
| **likeC4** | Behavior Contract (aggregation) | C4 architecture at zoom levels |
| **axe** | Render Contract (a11y terms) | WCAG compliance |

The unifying insight: all four tools are **Surfaces over datoms, constrained by Contracts**. A C4 diagram is a Surface rendering aggregation Contract datoms. An XState visualization is a Surface rendering Behavior Contract datoms. A Storybook story is a Surface rendering fixture datoms, verified against a Render Contract.

---

## 8. Actor Runtime

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

## 9. Content & Culture

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

## 10. Composition

| Composition | What it produces |
|-------------|-----------------|
| **Datom + Schema Contract** | Validated facts (Fact slice) |
| **Datom + Schema Contract + effectHandler** | Validated transformation (Feature slice) |
| **Datom + provenance attrs** | Facts with trust score and source tracking |
| **Datom + Projection(snapshot)** | Authorized point-in-time view |
| **Datom + Projection(live)** | Reactive subscription (ephemeral, Surface-bound) |
| **Datom + Projection(live-persistent)** | Background monitoring (independent lifecycle) |
| **Datom + Projection(live, in-flight)** | Streaming with redaction |
| **Projection + trustThreshold** | Trust-scoped view (excludes low-trust datoms) |
| **Projection + Projection (composite)** | Named namespace map — multiple data sources, no merging |
| **Projection + Surface** | Rendered output (Surface consumes Projection as parameter) |
| **Surface + Render Contract** | Accessible, tested, documented output |
| **Surface + trust signals** | Rendered output with visible provenance |
| **Surface + Learn mode** | Inline concept annotations for onboarding |
| **effectHandler + Behavior Contract** | Constrained transitions with visible state machines |
| **effectHandler + in-flight Contract** | Real-time AI guardrails |
| **effectHandler + failure model** | Auditable failure with escalation (graceful → crash → human) |
| **Surface + Projection(fixture)** | Storybook stories |
| **Validation failure + Creation Loop** | Recursive fix with escalation (auto → AI → human) |
| **File + Bridge + Datom store** | Artifact with provenance, queryable metadata, and validation |
| **Contract + defaults lifecycle** | Self-documenting configuration that refines per domain and experience |
| **Contract + Contract (meta)** | Contract lifecycle — lock, supersede, conflict detection |
| **Contract + anti-pattern Guard** | Graduated enforcement: explain → warn → block |
| **LLM + lint rules** | Deterministic-first guardrails: LLM authors, system enforces |
| **Domain bundle** | Schema + Behavior Contracts + Surface template + onboarding StateMachine |
| **Export/migration templates** | Bidirectional mapping between vivief and conventional patterns |
| **P2P + Sync Contract** | Conflict-resolved replication with claim protocol |
| **All five + Contracts** | The vivief platform |

---

## 11. Infrastructure

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

## 12. Glossary

| Term | Definition |
|------|-----------|
| **Datom** | Immutable fact: `[Entity, Attribute, Value, Tx, Op]` |
| **Projection** | Query + access + encryption + delivery mode + trust scope over datoms |
| **Surface** | Renderer that consumes a Projection as parameter (8 modes) |
| **Contract** | Declared constraint — simultaneously spec, test, and runtime guard |
| **effectHandler** | `(state, effect) => { datoms, effects }` — function or actor |
| **delivery** | How a Projection delivers updates: snapshot, live, live-persistent, or replay |
| **freshness** | What an actor sees: committed datoms only, or also in-flight tokens |
| **Projection profile** | Convenience factory (snapshot/live/stream/trusted/debug) that sets sensible Projection defaults |
| **debug profile** | Projection factory for common failure patterns (Contract failure, trust escalation, cache invalidation) |
| **Composite Projection** | Named namespace map of Projections — each keeps its own trust scope and delivery mode |
| **ephemeral live Projection** | Surface-bound, dies on unmount, no entity ID. Default for `delivery: "live"` |
| **persistent live Projection** | Independent entity with `:projection/status` datom. Survives Surface. `delivery: "live-persistent"` |
| **provenance** | `:tx/source` and `:tx/trust-score` on every transaction — who created it and how trusted |
| **trust score assignment** | Actor-type defaults (`:human → 1.0`, `:ai → 0.85`, `:web → 0.4`) with handler override |
| **handler override trust boundary** | Verifiable Behavior Contract qualifies by default; Trust Contract can restrict to named list per domain |
| **trust threshold** | Projection filter that excludes datoms below a trust score |
| **trust signal** | Visible provenance in Surface rendering (source badge, trust score) |
| **redaction** | Projection Contract separating compute-access from display-access |
| **trust strategy** | Authoritative (human), gated (AI draft→approve), sandboxed (AI isolated→promote) |
| **bridge** | effectHandler + Contract at a medium boundary — syncs native medium to datom store |
| **artifact** | Datom cluster with provenance — the named output of a creation cycle |
| **Contract lifecycle** | asserted → active → superseded (or conflicted). Newest wins. Lock = meta-Contract |
| **Contract coverage** | declared (constraints only) vs verifiable (has story, fixture, or StateMachine) |
| **Contract defaults** | Configuration points that start `:default` and refine through `:domain-refined` → `:experience-refined` → `:locked` |
| **anti-pattern Guard Contract** | Graduated enforcement of named anti-patterns: explain → warn → block |
| **schema evolution** | Additive by default. Breaking changes require a migration handler |
| **migration handler** | effectHandler that bridges old schema to new — migration IS creation |
| **creation boundary** | Creation = produces datoms. Utility = pure transformation below the concept level |
| **deterministic first** | LLM generates rules, system enforces them. Probabilistic fallback for edge cases |
| **Fact / Feature / Full** | Three conceptual slices: data only, data + logic, all five concepts |
| **graceful failure** | Handler returns error datoms + `:effect/failed` — triggers escalation |
| **crash** | Runtime catches unhandled exception → `:handler/crashed` datom → escalates to human |
| **sandbox promotion** | Re-validation against target Contracts. Promotion Contract specifies approval rule |
| **domain** | Named configuration bundling Schema + Behavior Contracts + Surface template + onboarding StateMachine |
| **onboarding StateMachine** | User journey: unfamiliar → exploring → practicing → comfortable → teaching |
| **explanation datom** | Audience-aware, context-specific concept explanation produced by LLM effectHandler |
| **concept Projection** | Projection over the platform's own structure — Contracts, bindings, trust scopes |
| **lint rule datom** | LLM-generated deterministic validation rule stored as a datom |
| **export template** | Deterministic mapping from vivief concept to conventional equivalent (Projection → SQL view) |
| **migration template** | Deterministic mapping from conventional pattern to vivief concept (REST → Projection + Surface) |
| **Schema Contract** | Constrains what datoms can exist |
| **Projection Contract** | Constrains who can query what, with redaction rules |
| **Render Contract** | Constrains Surface rendering: a11y, required/forbidden display, trust signals |
| **Trust Contract** | Specifies key derivation, roles, consent protocol. Wins over Schema on access conflicts |
| **Sync Contract** | Specifies conflict resolution per attribute type |
| **Behavior Contract** | Constrains effectHandler: accepted effects, state machine, aggregation |
| **Cultural Contract** | In-flight validation of cultural rules for AI-generated content |
| **validation feedback** | When a Contract rejects creation, error datoms + fix effect trigger recursive creation with escalation |

---

*Version: v4 — adds LLM as platform capability and domain as organizing unit, building on v3's implementation-ready foundation. New: composite Projection (named namespace map), live Projection two-tier lifecycle (ephemeral + persistent), debug Projection profiles, handler override trust boundary (hybrid rule), anti-pattern Guard Contracts (graduated enforcement), platform self-documentation domain (onboarding creation stack with StateMachine, explanation handler, concept Projection, learn/explain Surface modes), ecosystem translation via onboarding, deterministic-first guardrails (LLM-generated lint rules, Contract decision tree, debug profiles — "LLM authors, system enforces, LLM refines"), domains as named configuration (Contracts + Surface template + onboarding StateMachine bundled per user population), non-developer interaction model (direct + LLM-mediated blend), counselor-perspective walkthrough, portability via export templates, migration via bidirectional mapping templates. All 17 v3-review opportunities addressed. Five concepts remain sufficient. Replaces v3.*
