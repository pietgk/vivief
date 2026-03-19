# Vivief Platform Concepts — Vision

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
                                 these
```

At runtime, they are actors. Streaming is native via Projection delivery modes. Contracts cross-cut everything — any concept can have one. Every activity — a counseling session, a code analysis, a morning brief, a cultural adaptation — is creation through this same machinery.

---

## 2. The Five Concepts

### 2.1 Datom

The universal fact. `[Entity, Attribute, Value, Tx, Op]`.

Immutable, append-only, self-describing. Schema is stored as datoms. The datom log is the shared memory that all actors read from and write to.

**Observability as datoms.** LLM invocation metadata (tokens, cost, latency, model) stored as regular datoms alongside results. Queryable via Projection, displayable on Surfaces, aggregatable over time. No special observability layer needed.

**Schema Contract (optional).** Constrains what datoms are valid:

```
[:schema/client-name  :schema/type      :text   tx:1  true]
[:schema/client-name  :schema/required   true   tx:1  true]
```

Schema evolution IS Contract evolution — adding an attribute = asserting a new Schema Contract. At runtime, the Store Actor validates incoming datoms against Schema Contracts before commit.

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
}
```

| Delivery | Behavior |
|----------|----------|
| **snapshot** | Current state. One-shot. |
| **live** | Current state + future matching datoms. This IS reactive subscription. |
| **replay** | Full history from tx:0 or asOf(tx). Time-travel. |

**Trust zones** constrain which Projections can be constructed. Owner, scoped user, AI agent, and system roles have progressively narrower scope and encryption access.

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

**Render Contract (optional).** Constrains how a Surface renders:

```typescript
interface RenderContract {
  required?: AttributeKw[]
  forbidden?: AttributeKw[]
  a11y: { wcag: "2.1-AA" | "2.1-AAA", keyboard: boolean, screenReader: boolean }
  stories?: StoryDefinition[]
}
```

**a11y as Contract term.** Every Surface can have a Render Contract that specifies its WCAG level, keyboard navigability, and screen reader support. axe scanning validates the a11y terms — violations are Contract violations in the datom log.

**Storybook as Contract verification.** `Story = Surface(Projection(fixture-datoms))`. Each story is a test case for a Render Contract — required fields shown, forbidden fields hidden, a11y met.

| Domain | Manifestation |
|--------|---------------|
| **devac** | CLI output, MCP responses, C4 diagrams, live diagnostics |
| **Counseling** | All six modes. a11y validated by Render Contracts. Storybook stories. |

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
| **Render Contract** | Surface | a11y requirements, required/forbidden display, stories |
| **Trust Contract** | Encryption | Key derivation rules, role definitions, consent protocol |
| **Sync Contract** | Replication | Conflict resolution per attribute type, claim protocol |
| **Behavior Contract** | effectHandler | Accepted/produced effects, state machine, aggregation rules |

**Not everything must have a Contract.** A simple validation handler works without a Behavior Contract. A quick CLI Surface works without a Render Contract. Contracts are available when you need guarantees — not required everywhere.

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

### Three Trust Strategies

| Strategy | Trust | Commit behavior |
|----------|-------|-----------------|
| **Authoritative** (human) | Full | Immediate commit. Contract validates, but human has override with `:tx/why`. |
| **Gated** (AI) | Draft | Draft commit (`:tx/source :ai`, `:tx/status :pending`). Human approves before authoritative. |
| **Sandboxed** (AI, low-risk) | Isolated | Commits to sandbox Projection scope. Invisible until promoted. |

**Sandbox as Projection scope.** No separate infrastructure — a sandbox is a scoped Projection plus a gated promotion Contract. Sandboxed datoms commit to the store under a sandbox namespace. Only the creator and reviewers see them. Promotion = re-assert without the sandbox prefix + `:tx/promoted-from` provenance.

**Cache as creation memory.** The platform remembers what it created, under what conditions, and whether those conditions still hold:

```
[creation:X  :creation/inputs-hash     "sha256:..."    tx:N  true]
[creation:X  :creation/contract-hash   "sha256:..."    tx:N  true]
[creation:X  :creation/actor           :ai/opus-4      tx:N  true]
[creation:X  :creation/valid           true             tx:N  true]
```

If inputs-hash and contract-hash still match: return cached output, zero cost. If either changed: re-create. This is content-addressable creation — like Turborepo or Nix, but for everything in the platform. When a Contract evolves, all affected cached creations invalidate, triggering re-creation.

### Validation Feedback

When a Contract rejects a creation, two things happen: error datoms are committed (diagnostics in the log), and an `:effect/validation-failed` is emitted. This effect can trigger a fix handler — and fixing is itself creation, re-entering the loop with error datoms as input state.

**Three fix strategies, mapping to the same trust levels:**

| Fix strategy | Actor | How it works |
|-------------|-------|-------------|
| **Auto-fix** | System (deterministic) | Applies safe mechanical fixes (e.g. `biome --fix`). Immediate. Re-validates. |
| **AI-fix** | AI (sandboxed) | Reads errors + source in sandbox, iterates until all Contracts pass, promotes clean result. |
| **Human-fix** | Human (authoritative) | Errors surfaced via Projection, developer edits directly. |

**Escalation.** Fix strategies compose: auto-fix runs first (cheap, deterministic). If errors remain, AI attempts in sandbox. If AI exhausts retries or errors require judgment, the human is surfaced the remaining errors. The escalation itself can be a StateMachine Contract — max retries, timeout, escalation rules.

**Example: effectHandler with typecheck + lint errors.**

```
Developer creates session-recap handler (authoritative)
  → Behavior Contract: must accept :effect/voice-input, produce :session/themes
  → TypeScript Contract (Guard): type-check fails — 2 errors
  → Lint Contract (Guard): biome reports 3 warnings
  → Error datoms committed + :effect/validation-failed emitted
    → Auto-fix: biome --fix resolves 3 lint warnings (deterministic, immediate)
    → Re-validate: lint passes, typecheck still fails — 2 errors
    → AI-fix: AI reads errors + source in sandbox
      → AI proposes fix (sandboxed creation)
      → Re-validate in sandbox: 1 error remains
      → AI proposes second fix
      → Re-validate: all Contracts pass
      → Promote clean handler from sandbox
    → Or: errors surfaced to developer (human-fix)
```

The sandbox absorbs the messy iteration. The outside world sees only the clean result.

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
       → Developer adds attribute (authoritative)
       → System migrates existing datoms (deterministic)
       → All downstream caches invalidated (Contract changed)

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
```

The streaming path (in-flight tokens → Contract validation → Surface rendering) and the commit path (final datom → Store notification → downstream handlers) coexist naturally. Contracts appear at every boundary — in-flight, pre-commit, render-time — but only where declared.

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
| **Datom + Schema Contract** | Validated facts |
| **Datom + Projection(snapshot)** | Authorized point-in-time view |
| **Datom + Projection(live)** | Reactive subscription |
| **Datom + Projection(live, in-flight)** | Streaming with redaction |
| **Projection + Surface** | Rendered output |
| **Surface + Render Contract** | Accessible, tested, documented output |
| **effectHandler + Behavior Contract** | Constrained transitions with visible state machines |
| **effectHandler + in-flight Contract** | Real-time AI guardrails |
| **Surface + Projection(fixture)** | Storybook stories |
| **Validation failure + Creation Loop** | Recursive fix with escalation (auto → AI → human) |
| **P2P + Sync Contract** | Conflict-resolved replication with claim protocol |
| **All five + Contracts** | The vivief platform |

---

## 8. What Disappeared

| Old Concept | Where It Went | Why |
|-------------|--------------|-----|
| **Lens** | → Projection (query + delivery) | Includes delivery modes and freshness |
| **Seal** | → Projection (access) + Trust Contract (crypto) | Authorization per-Projection, crypto rules as Contract |
| **P2P** | → Infrastructure + Sync Contract | Deployment concern; conflict resolution as Contract |
| **Rules** (devac) | → Contract (aggregation mode) | Same pattern |
| **Reactive subscription** | → Projection(delivery: live) | First-class Projection capability |
| **Dual-loop** | → Creation Loop with trust strategies | One loop, any actor, variable trust |

---

## 9. Infrastructure

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

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **Datom** | Immutable fact: `[Entity, Attribute, Value, Tx, Op]` |
| **Projection** | Query + access + encryption + delivery mode over datoms |
| **Surface** | Renderer that consumes a Projection's output (6 modes) |
| **Contract** | Declared constraint — simultaneously spec, test, and runtime guard |
| **effectHandler** | `(state, effect) => { datoms, effects }` — function or actor |
| **delivery** | How a Projection delivers updates: snapshot, live, or replay |
| **freshness** | What an actor sees: committed datoms only, or also in-flight tokens |
| **redaction** | Projection Contract separating compute-access from display-access |
| **trust strategy** | Authoritative (human), gated (AI draft→approve), sandboxed (AI isolated→promote) |
| **Schema Contract** | Constrains what datoms can exist |
| **Projection Contract** | Constrains who can query what, with redaction rules |
| **Render Contract** | Constrains Surface rendering: a11y, required/forbidden display |
| **Trust Contract** | Specifies key derivation, roles, consent protocol |
| **Sync Contract** | Specifies conflict resolution per attribute type |
| **Behavior Contract** | Constrains effectHandler: accepted effects, state machine, aggregation |
| **Cultural Contract** | In-flight validation of cultural rules for AI-generated content |
| **validation feedback** | When a Contract rejects creation, error datoms + fix effect trigger recursive creation with escalation |

---

*Version: vision — 5 concepts with creation as thesis, actor runtime, native streaming, and cross-cutting Contracts. Creation Loop replaces dual-loop: one loop, any actor, variable trust. Cache as creation memory. Content & culture as domain patterns within existing concepts. Visual triangle: tools as Contract verifiers.*
