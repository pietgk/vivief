# Counseling Practice Platform — Architecture Document

**Version:** 0.7 (Implementation-ready)
**Date:** 2026-03-15
**Authors:** Piet (Technical Lead & Architect), Claude (Strategic Thought Partner)
**Status:** Implementation-ready — all MUST blockers resolved

**Changes from v0.6:**
- Added section 2.6: DatomQuery API (formal TypeScript definition) — resolves W1, W4
- Updated section 2.2: Lens filter now references formal DatomQuery
- Added section 6.4: PostgreSQL Datom Table Design (full DDL) — resolves W3
- Updated section 10.2: Dispatcher uses real DatomQuery API and concrete importHandler
- Updated section 10.3: Handler registration uses module-path (not git-ref)
- Updated section 10.5: Deployment uses versioned build artifacts (not runtime git-refs) — resolves W2
- Updated section 11.1: Contract invariants use DatomQuery syntax
- Updated section 11.2: Dispatcher failure model added — resolves W6
- Updated Open Questions: all 4 MUST items marked resolved
- Updated Next Steps: reordered for risk (datom store first)

---

## 1. Vision

A fully autonomous, local-first counseling practice platform that runs entirely on a MacBook Pro. It combines LLM reasoning and knowledge with human counseling expertise and senior software architecture skills to deliver a system that is private by design, elegant in its conceptual model, and delightful for both counselor and client.

The system is not a collection of apps bolted together. It is a single coherent system built on three primitives — **Datom**, **Lens**, and **Surface** — that compose to replace what traditional tools deliver as separate products (ClickUp, Notion, Slack, CRM, EHR, scheduling, AI assistant).

### 1.1 Design principles

- **Privacy is non-negotiable.** Client therapy data never leaves the local machine unless explicitly chosen. Local-first is not a preference — it is a competitive and ethical advantage.
- **Everything is a datom.** One universal fact model for all data: messages, tasks, session notes, treatment plans, card attributes, AI suggestions. One storage model, one sync model, one history model.
- **Three primitives, infinite compositions.** Datom + Lens + Surface. No feature sprawl, no separate "apps." New capabilities emerge from composing these three concepts.
- **The counselor's mental model wins.** The system is shaped around therapeutic arcs and client journeys, not sprints, kanban columns, or project hierarchies.
- **AI augments, never replaces.** The AI loop proposes; the human approves. This is both an ethical stance and a regulatory requirement (see Illinois AI therapy legislation, 2025).
- **Multimodal by default.** Voice, keyboard, touch, swipe, and AI-inferred intent are all first-class input channels. The counselor should never need to navigate a menu when a voice command or gesture suffices.

---

## 2. Core Concepts

### 2.1 The Datom

The universal fact primitive. Inspired by Datomic's immutable fact model.

```
[Entity, Attribute, Value, Tx, Op]
```

| Field     | Description                                         | Example                          |
|-----------|-----------------------------------------------------|----------------------------------|
| Entity    | Unique identifier for the thing                     | `client:42`                      |
| Attribute | What property of the entity                         | `:session/mood`                  |
| Value     | The value of that property                          | `"anxious, hopeful"`             |
| Tx        | Transaction identifier (monotonic, timestamped)     | `tx:1087`                        |
| Op        | Assert (true) or Retract (false)                    | `true`                           |

**Key properties:**

- **Immutable.** Datoms are never modified or deleted. A "change" is a retraction of the old value (Op=false) plus an assertion of the new value (Op=true), both in a new Tx.
- **Append-only.** The log only grows. Any historical state is reproducible by querying "as of" a given Tx.
- **Typed.** Values carry type information: text, number, date, enum, reference (to another entity), rich-text (CRDT block sequence), attachment (blob reference).
- **Self-describing.** The schema itself is stored as datoms. Adding a new attribute to a Type is just asserting new schema datoms — no migrations.

### 2.2 The Lens

A Lens is a query combined with rendering intent. It defines **which datoms are visible** and **how they should be rendered**.

```typescript
interface Lens {
  filter: DatomQuery   // Which entities/attributes to include — see section 2.6
  sort: SortSpec       // Time, attribute value, relevance
  group?: GroupSpec    // Group by attribute (enables Board mode)
  mode: SurfaceMode    // "stream" | "card" | "canvas" | "dialog" | "board"
  depth?: DepthSpec    // How deep to follow references
}
```

`DatomQuery` is defined formally in section 2.6. The same query type is used for Lens filters, Seal enforcement, Contract invariants, and the dispatcher's state queries — one model, used everywhere.

A saved Lens is what other apps call a "view," "dashboard," "page," or "workspace." Lenses are themselves datoms — they can be shared, versioned, and composed.

**Examples:**

| Lens name       | Human-readable filter                  | DatomQuery object                                                                                                                    | Mode   |
|-----------------|----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|--------|
| Morning prep    | clients with session today             | `{ attribute: ':client/*', where: [{ attribute: ':session/date', op: 'within', value: '1d', direction: 'future' }] }`               | Board  |
| Maria's journey | everything for client:42               | `{ entity: 'client:42', depth: 'all' }`                                                                                              | Card   |
| Session notes   | doc entities for session 42            | `{ entity: ['doc:session-42-*'] }`                                                                                                   | Canvas |
| Activity feed   | datoms from last 24h                   | `{ where: [{ txAttribute: ':tx/ts', op: 'gt', value: '-24h' }] }`                                                                   | Stream |
| AI suggestions  | pending AI-sourced datoms              | `{ where: [{ txAttribute: ':tx/source', value: ':ai' }, { attribute: ':*/status', value: 'pending' }] }`                            | Stream |

### 2.3 The Surface

The Surface is the renderer. It takes a Lens and the datom store and produces UI. Five modes that morph fluidly based on context:

#### Surface modes

**Stream** — the living timeline.
Absorbs: chat, activity feed, notification log, session history.
Time-ordered datoms flowing past. A message is a datom. A session recap appearing is a datom. An AI suggestion surfacing is a datom. There is no separate chat app, notification center, or activity log. They are all the same stream, filterable by entity, type, or time.

**Card** — the focused entity view.
Absorbs: detail page, form, record view, client profile, Huly-style Cards.
One entity, all its datoms, rendered as typed attributes. The Card layout is generated from the Type schema, not hand-coded per entity. New attribute on the Type → instantly appears on every Card. CRDT-editable when shared. Swipeable (Tinder-style) to navigate between cards in a filtered set.

**Canvas** — the deep document.
Absorbs: Notion doc, Jupyter notebook, session notes, treatment plan editor.
Block-based, CRDT-synchronized document. Each block is a datom or datom cluster. Includes "prompt blocks" where the user types a question and the AI responds inline — both become datoms. Blocks can embed live Cards, filtered Streams, or Boards.

**Dialog** — the conversational effect trigger.
Absorbs: AI chat, voice command, quick capture, "Tarvis"-style interaction.
The multimodal input surface. Voice, text, or gesture → the system interprets intent → proposes an Effect. Available as an overlay from any Surface. The AI can generate ephemeral UI inline (a chart, a comparison, a form) which can be pinned to a Canvas if useful.

**Board** — the spatial overview.
Absorbs: Kanban, list view, table/grid, calendar, client roster.
Cards arranged spatially by a grouping attribute. Group by status → Kanban. Group by date → calendar. Group by nothing → table. Dragging a Card between columns is an Effect (retract old datom, assert new one). The Board is a lens over Cards, not a separate data structure.

#### Surface morphing

The user never "switches apps." Surfaces morph based on:

1. **What she's looking at** — entity type determines Card schema
2. **What she's doing** — browsing → Board/Stream, editing → Canvas/Card, commanding → Dialog
3. **How she's interacting** — voice → Dialog, keyboard → Canvas, swipe → Board/Card, gaze/presence → Stream
4. **What the AI suggests** — generated widget inline, ephemeral or pin-to-Canvas

Transitions are animated morphs, not page navigations. The datoms stay — only the rendering shifts.

### 2.4 The Seal (Privacy Model)

A Seal is not a fourth primitive — it emerges from combining a Lens with cryptographic enforcement. It answers three questions: who are you (identity), what can you do (capability), and what can you see (encryption boundary).

**Core insight: a capability scope IS a Lens.** The statement "client Maria can read her own data" is expressed as a Lens `{ filter: { entity: 'client:42', depth: 'own' } }` combined with Maria's decryption key. The same query engine that renders Surfaces also enforces access control.

**Selective Value encryption.** Only the Value field of sensitive datoms is encrypted. Entity, Attribute, Tx, and Op remain cleartext so the system can route, index, and query without decryption. Which attributes are sensitive is defined in the schema itself (as datoms).

**Deterministic key derivation.** One counselor passphrase → PBKDF2 → master key → HKDF per-client keys. No key database, no key server. Keys exist only in memory during a session. The counselor never manages keys — she just remembers her passphrase.

**Four roles, four Seals:**

| Role       | Key held                    | Can see                                  | Can do                              |
|------------|-----------------------------|------------------------------------------|-------------------------------------|
| Counselor  | Master key (derives all)    | All clients, all data                    | Read all, write all, grant/revoke   |
| Client     | Portal key (own data only)  | Own datoms only                          | Read own, submit check-ins, message |
| AI agent   | AI key (per consented client)| Consented clients' data                 | Read consented, write drafts only   |
| System     | No decryption keys          | Entity + Attribute + Tx (metadata only)  | Route, index, schedule              |

**Consent as datom.** Every privacy decision is stored as an auditable datom with a Why chain. Revoking consent is a retraction datom — the same operation used for any other change. The effectHandler processes it and triggers key rotation as a downstream Effect'.

**Client-side search.** Because Values are encrypted in PostgreSQL, search over encrypted fields is handled by an in-memory index built on login (decrypt searchable fields once, filter locally). PostgreSQL never sees search queries for sensitive content.

See sections 12.4, 12.5, and 12.8 for the full resolved analysis including key derivation hierarchy, regulatory compliance mapping, and encryption trade-offs.

### 2.5 The Contract (Development Model)

A Contract is a datom that declares expected behavior. It is simultaneously spec ("what should happen"), test ("did it happen?"), and runtime guard ("prevent it from not happening"). Contracts are enforced by the dispatcher on every effect execution — not just during testing.

Three levels of contracts:

- **Schema contracts:** structural validity of entities ("a client must have a name and status")
- **Effect contracts:** handler output validity ("a session recap must produce themes and mood, must never produce a diagnosis")
- **Invariant contracts:** cross-entity business rules ("a high-risk client must have a session within 7 days")

Contracts are datoms — versioned, auditable, queryable. They evolve through the same five-step flow (Contract → Handler → Verify → Gate → Live) as any other change. Contract violations produce violation datoms, making the test report part of the datom log.

See section 11 for the full development flow built on contracts.

### 2.6 The DatomQuery API

`DatomQuery` is the single query model for the entire system. It is used by:
- Lens filters (section 2.2) — which datoms a Surface renders
- Seal enforcement (section 2.4) — which datoms a role can access
- Contract invariants (section 11.1) — cross-entity business rule conditions
- Dispatcher state reads (section 10.2) — handler and feature flag resolution

**Core types:**

```typescript
// Entity IDs: string keys like "client:42", "handler:session-recap", "tx:1087"
type EntityId = string

// Attribute keywords: Clojure-style namespace/name, wildcards with *
// Examples: ":client/name", ":session/*", ":*/status", ":handler/effect-type"
type AttributeKw = string

// Transaction reference
type TxId = number | "now" | "-24h" | "-7d" | "-30d"  // absolute or relative

interface WhereClause {
  attribute?: AttributeKw   // filter on datom attribute (supports wildcards)
  txAttribute?: AttributeKw // filter on tx metadata attribute (:tx/source, :tx/who, :tx/ts)
  op?: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "within" | "contains" | "startsWith"
  value?: string | number | boolean | null
  direction?: "future" | "past"  // used with "within" for temporal filters
}

interface DatomQuery {
  entity?: EntityId | EntityId[]    // single entity, list, or omit for all
  attribute?: AttributeKw           // exact or wildcard attribute filter
  where?: WhereClause[]             // additional filters (ANDed together)
  asOf?: TxId                       // time-travel: query the log as of this tx
  depth?: "own" | "refs" | "all"    // how deep to follow :ref type values
  limit?: number                    // cap results (default: no limit)
}

// Result type returned by state.query()
interface DatomResult {
  datoms: Datom[]
  // Convenience accessors — return the current (latest Op=true) value
  get(attribute: AttributeKw): unknown
  getAll(attribute: AttributeKw): unknown[]
  // Resolve an entity ID to a typed view of its current datoms
  entity(id: EntityId): EntityView
  // Check if any datoms matched
  isEmpty(): boolean
}

// A typed view of a single entity's current state
interface EntityView {
  id: EntityId
  get(attribute: AttributeKw): unknown
  getAll(attribute: AttributeKw): unknown[]
  refs(attribute: AttributeKw): EntityView[]  // resolve reference datoms
}

// State: a snapshot of the datom log (point-in-time or current)
interface State {
  query(q: DatomQuery): DatomResult
  // Create a scoped snapshot for time-travel queries
  asOf(tx: TxId): State
}
```

**SQL compilation.** The DatomQuery builder compiles to PostgreSQL queries against the `datoms` table (section 6.4). Attribute wildcards (`:handler/*`) compile to `a LIKE ':handler/%'`. The `within` operator with `direction: 'future'` compiles to `v_date BETWEEN NOW() AND NOW() + INTERVAL '1 day'`. The `asOf` parameter adds `AND tx <= $txId` to all clauses.

**Query examples — all dispatcher uses:**

```typescript
// Resolve handler for an effect type
state.query({
  attribute: ':handler/effect-type',
  where: [
    { op: 'eq', value: effect.type },
    { attribute: ':handler/active', op: 'eq', value: true }
  ]
})

// Check feature flag overrides
state.query({
  attribute: ':feature/effect-type',
  where: [
    { op: 'eq', value: effect.type },
    { attribute: ':feature/enabled', op: 'eq', value: true }
  ]
})

// Load contracts for an effect type
state.query({
  attribute: ':contract/effect-type',
  where: [{ op: 'eq', value: effect.type }]
})

// Session recap handler reads state
state.query({ entity: effect.clientId, depth: 'refs' })

// AI loop queries pending suggestions
state.query({
  where: [
    { txAttribute: ':tx/source', op: 'eq', value: ':ai' },
    { attribute: ':*/status', op: 'eq', value: 'pending' }
  ]
})

// Time-travel: client state as of a past session
state.asOf(session.tx).query({ entity: 'client:42', depth: 'all' })
```

---

## 3. The effectHandler Model

Borrowed from the vivief project's effect handler pattern, applied to the counseling domain.

### 3.1 Core formula

```
effectHandler: (State, Effect) => (State', [Effect'])
```

| Component  | In this system                                                     |
|------------|--------------------------------------------------------------------|
| **State**  | A query over the datom log — a point-in-time view. `State = f(Lens, DatomLog)`. Always valid because history is preserved. |
| **Effect** | An intent with three facets: **What** (new datom(s) to assert), **How** (the handler/operation that processes it), **Why** (therapeutic or business reasoning). |
| **State'** | The datom log after new facts are asserted. Append-only.            |
| **[Effect']** | Downstream side-effects triggered by the state transition: AI analysis, schedule updates, notifications, alerts. |

### 3.2 The Why layer

Every transaction carries metadata as first-class datoms:

```
[:tx/1087  :tx/what   [:session/42 :session/mood "anxious, hopeful"]  tx:1087  true]
[:tx/1087  :tx/how    :session/voice-recapped                             tx:1087  true]
[:tx/1087  :tx/who    :therapist/anna                                 tx:1087  true]
[:tx/1087  :tx/why    "Client reported sleep regression → exploring CBT-I"  tx:1087  true]
```

This makes the entire history auditable ("why was this treatment plan changed?"), queryable ("show me all decisions related to sleep issues across all clients"), and AI-analyzable ("are there patterns in how the counselor responds to sleep regression?").

### 3.3 Effect cascade example

A single counselor action — a 2-minute voice recap after a session — triggers a chain:

```
Voice input (multimodal)
  → Whisper.cpp transcription (local)
    → LLM structuring: extract mood, themes, interventions, risks
      → Assert datoms (State transition, tx:1087)
        → [Effect' 1]: Pattern detection — "sleep issues mentioned 3 sessions in a row" → flag
        → [Effect' 2]: Treatment plan update — AI suggests adding CBT-I → draft plan datom
        → [Effect' 3]: Schedule effect — next session in 7 days → reminder datom
          → Each Effect' produces more datoms → State'' (tx:1088, 1089, 1090)
```

The counselor dictated once. The system did the rest. All traceable via the Tx chain.

---

## 4. Dual-Loop Architecture (Model C)

Two effectHandler loops running in parallel, connected by the shared datom stream.

### 4.1 Counselor loop

Human actions → datoms → immediate effects.

```
[Counselor Input] → effectHandler → [Datom Store] → [Surface Render]
      ↑                                    |
      └────────────────────────────────────┘
              (Surface shows State')
```

Direct, synchronous. The counselor sees the result of her action immediately. Voice recap → structured notes appear. Drag card → status updates. Type in Canvas → blocks saved.

### 4.2 AI loop

Subscribes to the datom stream → runs analysis → emits draft datoms.

```
[Datom Stream via NATS] → AI Analysis → [Draft Datoms (:tx/source = :ai)]
                                              |
                                              ↓
                                    [Counselor Review]
                                        ↙        ↘
                                   Approve      Reject/Edit
                                      ↓             ↓
                              Assert Datom    Discard / Modify
```

**Critical constraint:** The AI never directly mutates State. It proposes Effect' candidates marked with `:tx/source :ai` and `:tx/status :pending`. The counselor approves, rejects, or modifies. This satisfies both ethical requirements and emerging legislation (e.g., Illinois, 2025) that prohibits AI from making independent therapeutic decisions.

### 4.3 AI capabilities

| Capability                | Trigger                          | Output                                     |
|---------------------------|----------------------------------|---------------------------------------------|
| Session note structuring  | Voice recap received             | SOAP/DAP formatted note datoms              |
| Pattern detection         | New session datoms asserted      | Flag datoms when patterns cross threshold   |
| Treatment plan suggestion | Goal + session history query     | Draft plan datoms with evidence references  |
| Session prep              | Upcoming session detected        | Prep card with context + suggested focus    |
| Sentiment trending        | Periodic (daily)                 | Trend datoms per client                     |
| Risk flagging             | Keywords/patterns in session data| Alert datom with urgency level              |
| Between-session analysis  | Client check-in received         | Summary datom + optional counselor alert    |

---

## 5. Domain Model — Entity Families

Three primary entity families in the counseling domain, plus supporting entities.

### 5.1 Client entity (`:client/*`)

The central entity. All other entities reference back to a client.

| Attribute                  | Type       | Description                                    |
|----------------------------|------------|------------------------------------------------|
| `:client/name`             | text       | Full name                                      |
| `:client/intake-date`      | date       | When the client started                        |
| `:client/presenting-issue` | text       | Initial reason for seeking counseling           |
| `:client/treatment-goals`  | ref[]      | References to `:plan/*` entities               |
| `:client/risk-level`       | enum       | low / moderate / high / crisis                 |
| `:client/status`           | enum       | intake / active / maintenance / discharged     |
| `:client/therapist-notes`  | rich-text  | Free-form private notes (CRDT)                 |
| `:client/contact-info`     | text       | Email, phone (encrypted at rest)               |
| `:client/emergency-contact`| text       | Emergency contact details                      |

### 5.2 Session entity (`:session/*`)

One per session per client. Append-only per session — facts accumulate but never change.

| Attribute                  | Type       | Description                                    |
|----------------------------|------------|------------------------------------------------|
| `:session/client`          | ref        | Reference to `:client/*`                       |
| `:session/date`            | datetime   | When the session occurred                      |
| `:session/type`            | enum       | individual / couple / group / intake / review  |
| `:session/mood-pre`        | text/enum  | Client mood at session start                   |
| `:session/mood-post`       | text/enum  | Client mood at session end                     |
| `:session/recap`           | rich-text  | Voice-transcribed and AI-structured recap      |
| `:session/themes`          | text[]     | AI-extracted themes                            |
| `:session/interventions`   | text[]     | Therapeutic interventions used                 |
| `:session/homework`        | ref[]      | References to homework/task datoms             |
| `:session/risk-flags`      | text[]     | Any risk indicators noted                      |
| `:session/transcript`      | attachment | Raw Whisper transcription (if consented)       |

### 5.3 Plan entity (`:plan/*`)

Treatment plans, versioned over time. Each edit creates new datoms, preserving the full history of plan evolution.

| Attribute                  | Type       | Description                                    |
|----------------------------|------------|------------------------------------------------|
| `:plan/client`             | ref        | Reference to `:client/*`                       |
| `:plan/goal`               | text       | Treatment goal description                     |
| `:plan/intervention`       | text       | Planned therapeutic approach                   |
| `:plan/progress`           | enum       | not-started / in-progress / achieved / revised |
| `:plan/homework`           | text       | Current homework assignment                    |
| `:plan/review-date`        | date       | Next scheduled review                          |
| `:plan/ai-suggestion`      | text       | AI-proposed modifications (pending approval)   |
| `:plan/evidence`           | text       | Clinical evidence supporting the approach      |

### 5.4 Supporting entities

| Entity family         | Purpose                                  | Key attributes                           |
|-----------------------|------------------------------------------|------------------------------------------|
| `:schedule/*`         | Appointments and reminders               | client ref, datetime, type, status       |
| `:message/*`          | Chat/communication datoms                | from, to, content, channel, thread-ref   |
| `:alert/*`            | AI-generated flags and notifications     | source, severity, entity-ref, status     |
| `:checkin/*`          | Client self-reported between-session data| client ref, mood, notes, date            |
| `:doc/*`              | Canvas documents (session notes, plans)  | blocks (Loro CRDT), loro-binary, type, entity-refs |
| `:type/*`             | Schema definitions (meta-datoms)         | attributes, relations, display config    |
| `:lens/*`             | Saved views/queries                      | filter, sort, group, mode                |

---

## 6. Infrastructure Stack

All running locally on a MacBook Pro. No cloud dependencies for core operations.

### 6.1 Stack components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Surface Layer (UI)                          │
│  React + TanStack (Router, Query, DB)                          │
│  Five modes: Stream | Card | Canvas | Dialog | Board           │
│  CRDT: Loro for Canvas, Card, and Board collaborative editing  │
├─────────────────────────────────────────────────────────────────┤
│                     Effect Layer                                │
│  effectHandler: (State, Effect) => (State', [Effect'])         │
│  Input handlers: voice, keyboard, touch, AI-inferred           │
│  MCP Servers: mcp-clients, mcp-sessions, mcp-schedule,        │
│               mcp-notes, mcp-plans                             │
├─────────────────────────────────────────────────────────────────┤
│                     Seal Layer (Privacy)                         │
│  Key derivation: passphrase → PBKDF2 → master → HKDF per-client│
│  Selective Value encryption: AES-256-GCM on sealed attributes  │
│  Consent enforcement: datom-based, per-client, per-scope       │
│  Client-side search index: decrypt-on-login, filter in memory  │
├─────────────────────────────────────────────────────────────────┤
│                     Intelligence Layer                          │
│  Whisper.cpp — local speech-to-text                            │
│  Local LLM (Ollama) — privacy-critical structuring             │
│  Claude API — complex reasoning (when permitted)               │
│  Pattern detection — streaming analysis over NATS              │
├─────────────────────────────────────────────────────────────────┤
│                     Data Layer                                  │
│  PostgreSQL — datom store (relational + vector + FTS)          │
│  NATS — event bus (pub/sub, sync, agent coordination)          │
│  DuckDB — analytics (workload, trends, business metrics)       │
│  Blob store — attachments, transcriptions (local filesystem)   │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Component rationale

| Component       | Why                                                                 |
|-----------------|---------------------------------------------------------------------|
| **PostgreSQL**  | Polyglot substrate: relational, vector (pgvector), full-text, JSON. Stores datoms efficiently. Proven, reliable, runs beautifully on Mac. |
| **NATS**        | Replaces Kafka + Redis + service mesh + API gateway. Single binary, embedded, perfect for local. Pub/sub for the datom stream. Agent coordination. Future replication. |
| **DuckDB**      | Analytics over the datom log without loading PostgreSQL. Attach to Postgres via DuckDB's Postgres scanner. Client trend analysis, business metrics, workload tracking. |
| **Whisper.cpp** | Local speech-to-text. No cloud dependency. Runs on Apple Silicon efficiently. Session recap transcription. |
| **Ollama**      | Local LLM for privacy-critical operations: note structuring, theme extraction, basic pattern matching. No data leaves the machine. |
| **Claude API**  | For complex reasoning when the counselor explicitly opts in: treatment plan suggestions, cross-client pattern analysis, evidence-based intervention recommendations. |
| **TanStack DB** | Reactive UI layer. Client-side query cache that syncs with the datom store. Surfaces re-render automatically when relevant datoms change. |
| **Loro**        | CRDT library built on Event Graph Walker (Eg-walker) + Fugue algorithm. Rust core with JS/WASM bindings. Native support for text, list, map, tree, movable list, and counter CRDTs. Stores complete editing history in compact form (360K ops in 361KB). Time travel, fork/merge like Git. Aligns with the datom append-only philosophy — Loro's event graph IS an append-only operation log. See section 12.1 for full analysis. |
| **AES-256-GCM** | Symmetric encryption for datom Values. Industry-standard authenticated encryption — fast on Apple Silicon (GB/s), detects wrong-key attempts (integrity check), widely audited. Used for selective Value encryption of sealed attributes. |
| **PBKDF2 + HKDF** | Key derivation chain. PBKDF2 turns the counselor's passphrase into a master key (slow by design — 600K rounds to resist brute force). HKDF deterministically derives per-client and per-role keys from the master. No key storage needed — all keys recomputed on login from the passphrase alone. |
| **MCP Servers** | The vivief pattern. Claude (or local LLM) connects to the system via MCP servers, one per domain. Enables the "Tarvis" conversational interface. |

### 6.3 Data flow — two-tier model

The system uses a two-tier data model to reconcile real-time editing performance with datom transactional integrity.

**The core tension:** Datom transactions through PostgreSQL take 1-5ms per round-trip. At typing speed (10-20 keystrokes/second), writing a datom per keystroke is not viable. The solution: the CRDT handles real-time editing in memory, and the datom store handles structured meaning on commit.

```
Tier 1 — CRDT hot layer (Loro, in-memory, real-time)
═══════════════════════════════════════════════════════

[Keystroke / touch / voice partial]
    │  < 1ms
    ▼
[LoroDoc in memory]  ◄────►  [Peer sync via NATS]
    │                              ~5-50ms to peers
    │  Event graph grows (append-only ops)
    │
    │  Commit triggers:
    │  • Debounce (2s idle)
    │  • Canvas blur / unfocus
    │  • Explicit save (Cmd+S)
    │  • Session end
    │  • Voice recap processed
    ▼
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
[Commit bridge]
    │  1. Snapshot LoroDoc state
    │  2. Diff against last commit
    │  3. Extract structured metadata (themes, mood, flags) — see note below
    │  4. Package as Effect: {what, how, why}
    ▼
Tier 2 — Datom cold layer (PostgreSQL, persistent)
═══════════════════════════════════════════════════════

[effectHandler] ──────► [PostgreSQL: assert datom(s)]
    │                         │
    │                         ▼
    │                   [NATS: publish to datom stream]
    │                         │
    │              ┌──────────┼──────────┐
    │              ▼          ▼          ▼
    │         [AI Loop]  [Surface]  [DuckDB Sync]
    │         analysis   re-render   analytics
    │              │
    │              ▼
    │     [Draft datoms: :tx/source :ai]
    │              │
    │              ▼
    │     [Counselor review via Surface]
    │              │
    └──────────────┘ (approve → new Effect)
```

**Commit bridge — step 3, extraction schema:**

The LLM extraction step (step 3) uses a structured output prompt. The extraction schema is:

```typescript
interface CommitBridgeExtraction {
  themes: string[]          // e.g., ["sleep", "anxiety", "cbt-i"]
  moodSummary: string       // e.g., "anxious but improving"
  interventions: string[]   // e.g., ["psychoeducation", "sleep hygiene"]
  riskFlags: string[]       // e.g., ["passive ideation mentioned"]
  requiresReview: boolean   // true if extraction is uncertain or incomplete
}
```

Fallback when LLM extraction fails or times out (60s): commit the Loro snapshot datom with `requiresReview: true` and an empty extraction. The datom is flagged `:tx/status :needs-review`. The counselor sees it in the Stream with a "Review required" badge. The extraction can be re-triggered manually.

**What gets committed as datoms on each bridge crossing:**

```
[:doc/42   :doc/content       <loro-binary-snapshot>            tx:N  true]
[:doc/42   :doc/loro-version  <loro-version-vector>             tx:N  true]
[:doc/42   :doc/themes        ["sleep","anxiety","cbt-i"]       tx:N  true]
[:doc/42   :doc/mood-summary  "anxious but improving"           tx:N  true]
[:tx/N     :tx/how            :doc/crdt-committed               tx:N  true]
[:tx/N     :tx/why            "Session recap auto-save (2s idle)" tx:N  true]
```

The Loro binary snapshot is stored as a blob alongside the structured datom extractions. This gives two complementary time travel models:

- **Loro time travel (hot):** "Show me exactly how this note looked at 2:35 PM during editing" — keystroke-granularity replay from the Loro event graph.
- **Datom time travel (cold):** "Show me this client's treatment trajectory over 6 months" — fact-granularity query over the datom log.

**Commit timing budget:**

| Trigger              | Latency budget | What's committed                                    |
|----------------------|----------------|-----------------------------------------------------|
| Debounce (2s idle)   | 5-10ms fine    | Loro snapshot + extracted metadata                  |
| Canvas blur/unfocus  | 5-10ms fine    | Full snapshot                                       |
| Explicit save        | 5-10ms fine    | Full snapshot + user intent in Why                  |
| Session end          | 50-100ms OK    | Full snapshot + AI structuring trigger              |
| Voice recap processed| 200ms+ OK      | Structured SOAP note + themes + flags               |

### 6.4 PostgreSQL Datom Table Design

The foundation of the system. Every handler reads from and writes to this schema.

**Value storage strategy: discriminated union with typed columns.** Multiple nullable columns — one per value type — with a `v_type` discriminator. This is better than JSONB for indexed queries (partial indexes by `v_type` are highly efficient), better than a single text column (no casting), and cleaner than a key-value `v_key`/`v_value` pair.

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Main datom store
CREATE TABLE datoms (
  -- Core 5-tuple
  e            TEXT        NOT NULL,  -- Entity ID: "client:42", "tx:1087", "handler:session-recap"
  a            TEXT        NOT NULL,  -- Attribute keyword: ":client/name", ":tx/how"
  tx           BIGINT      NOT NULL,  -- Transaction ID (monotonic, from sequence below)
  op           BOOLEAN     NOT NULL,  -- true = assert, false = retract

  -- Polymorphic Value — exactly one v_* column is non-null per row (enforced by CHECK)
  v_type       TEXT        NOT NULL,  -- 'text' | 'num' | 'bool' | 'date' | 'ref' | 'bytes' | 'vec' | 'encrypted'
  v_text       TEXT,                  -- text, keyword, enum values
  v_num        NUMERIC,               -- number, integer values
  v_bool       BOOLEAN,               -- boolean values
  v_date       TIMESTAMPTZ,           -- date/datetime values
  v_ref        TEXT,                  -- reference to another entity ID
  v_bytes      BYTEA,                 -- binary/blob AND encrypted values
  v_vec        vector(1536),          -- embedding vector (pgvector)

  -- Convenience: denormalized assertion time (avoids joining to transactions for time range queries)
  asserted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT v_type_valid CHECK (
    v_type IN ('text', 'num', 'bool', 'date', 'ref', 'bytes', 'vec', 'encrypted')
  ),
  CONSTRAINT v_text_match   CHECK (v_type != 'text'      OR v_text  IS NOT NULL),
  CONSTRAINT v_num_match    CHECK (v_type != 'num'       OR v_num   IS NOT NULL),
  CONSTRAINT v_bool_match   CHECK (v_type != 'bool'      OR v_bool  IS NOT NULL),
  CONSTRAINT v_date_match   CHECK (v_type != 'date'      OR v_date  IS NOT NULL),
  CONSTRAINT v_ref_match    CHECK (v_type != 'ref'       OR v_ref   IS NOT NULL),
  CONSTRAINT v_bytes_match  CHECK (v_type NOT IN ('bytes', 'encrypted') OR v_bytes IS NOT NULL),
  CONSTRAINT v_vec_match    CHECK (v_type != 'vec'       OR v_vec   IS NOT NULL)
);

-- Monotonic Tx sequence
CREATE SEQUENCE datom_tx_seq START 1;

-- Transactions table — denormalized index for fast Tx metadata without self-join
-- The authoritative tx metadata is in the datoms table ([:tx/N :tx/who ...] etc.)
-- This table is a fast lookup index only, populated by the dispatcher alongside datom writes
CREATE TABLE transactions (
  tx           BIGINT PRIMARY KEY DEFAULT nextval('datom_tx_seq'),
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effect_type  TEXT,   -- mirrors :tx/how datom — indexed for pattern queries
  who          TEXT    -- mirrors :tx/who datom — indexed for audit queries
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────

-- EAVT: entity + attribute + time — primary lookup: "give me all facts for client:42"
CREATE INDEX idx_eavt ON datoms (e, a, tx DESC);

-- AEVT: attribute + entity + time — "give me all clients with risk-level = high"
CREATE INDEX idx_aevt ON datoms (a, e, tx DESC);

-- TXID: time range queries — "give me all facts since tx:1000"
CREATE INDEX idx_tx ON datoms (tx DESC);

-- AVET: attribute + value (text) — "find handler where effect-type = :session/recap-requested"
CREATE INDEX idx_avet_text ON datoms (a, v_text, e)
  WHERE v_type = 'text';

-- AVET: attribute + value (ref) — reverse reference traversal: "find sessions for client:42"
CREATE INDEX idx_avet_ref ON datoms (a, v_ref, e)
  WHERE v_type = 'ref';

-- AVET: attribute + value (date) — temporal queries: "sessions within next 7 days"
CREATE INDEX idx_avet_date ON datoms (a, v_date)
  WHERE v_type = 'date';

-- Time range on asserted_at — "activity in last 24 hours" via denormalized column
CREATE INDEX idx_asserted_at ON datoms (asserted_at DESC);

-- pgvector: semantic similarity search on embedding datoms
-- ivfflat is appropriate for <1M vectors; switch to hnsw for larger collections
CREATE INDEX idx_vec_cosine ON datoms
  USING ivfflat (v_vec vector_cosine_ops)
  WHERE v_type = 'vec';

-- ─── ENCRYPTED VALUE DESIGN ───────────────────────────────────────────────────
--
-- Sealed attributes (defined by schema datoms like [:attr/session-recap :attr/sealed true tx:1 true])
-- store their Value as AES-256-GCM ciphertext in v_bytes with v_type = 'encrypted'.
--
-- The plaintext type is stored in the schema: [:attr/session-recap :attr/plaintext-type 'text' tx:1 true]
-- On read: query layer checks schema datoms → if sealed, decrypts v_bytes using derived key → returns plaintext
-- PostgreSQL never receives plaintext of sensitive Values in queries
--
-- Encryption envelope (v_bytes layout):
--   [12 bytes: GCM nonce] [N bytes: ciphertext] [16 bytes: GCM auth tag]
--
-- Key used: HKDF(client_key, "attr:" + attribute_keyword)
-- This makes the encryption key attribute-specific — different keys for :client/name vs :session/recap

-- ─── PGVECTOR INTEGRATION ─────────────────────────────────────────────────────
--
-- Embeddings are ordinary datoms with v_type = 'vec':
--   [:client/42 :client/embedding <vector> tx:N true]
--   [:session/42 :session/embedding <vector> tx:N true]
--
-- To update an embedding: retract old datom + assert new one (same as any datom change)
-- Semantic search query: SELECT e, a, v_vec <=> $query_vec AS distance
--                        FROM datoms WHERE v_type = 'vec' AND a = ':client/embedding'
--                        ORDER BY distance LIMIT 10;
--
-- Embeddings are generated by the AI loop after each session commit and stored as datoms
-- They are NOT sealed — the embedding vector does not contain plaintext sensitive content
```

**Access pattern reference:**

| Query                             | Index used        | SQL pattern                                      |
|-----------------------------------|-------------------|--------------------------------------------------|
| All attributes of client:42       | `idx_eavt`        | `WHERE e = 'client:42' ORDER BY tx DESC`         |
| All clients with risk-level=high  | `idx_avet_text`   | `WHERE a = ':client/risk-level' AND v_text = 'high'` |
| Sessions for client:42            | `idx_avet_ref`    | `WHERE a = ':session/client' AND v_ref = 'client:42'` |
| Sessions in next 7 days           | `idx_avet_date`   | `WHERE a = ':session/date' AND v_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'` |
| All handlers for effect type      | `idx_avet_text`   | `WHERE a = ':handler/effect-type' AND v_text = effect.type` |
| Recent activity (last 24h)        | `idx_asserted_at` | `WHERE asserted_at > NOW() - INTERVAL '24 hours'` |
| Semantic search over clients      | `idx_vec_cosine`  | `ORDER BY v_vec <=> $vec LIMIT 10`               |

---

## 7. Counselor's Day — Workflow Walkthrough

This section illustrates how the system supports a typical counselor day using the Surface morphing model.

### 7.1 Morning prep (Board → Card)

The counselor opens the app. The default Lens is "morning prep" — a Board showing today's clients grouped by session time. Each card shows the client name, last session mood, and any AI-flagged items.

She swipes through client Cards to review. Maria's Card shows: "Sleep issues mentioned 3 consecutive sessions. AI suggests: explore CBT-I protocol." The counselor taps to expand — the Card morphs to show the full treatment arc, session history, and the AI's draft suggestion.

### 7.2 During session

The system is silent. The counselor is fully present with the client. Optionally, with client consent, ambient transcription runs via Whisper.cpp — but the counselor never interacts with the system during the session.

### 7.3 Post-session recap (Dialog → Canvas)

After the session, the counselor holds the voice button and dictates a 2-minute recap. The system:

1. Transcribes via Whisper.cpp
2. Structures into SOAP format via LLM
3. Extracts themes, mood indicators, and intervention types
4. Asserts all as datoms (one Tx, full Why chain)
5. Renders the result as a Canvas — the structured session note

The counselor reviews, edits any details, and approves. The Effect cascade fires: pattern detection, plan update suggestions, scheduling reminders.

### 7.4 Between sessions (Stream)

The Stream shows activity: client check-ins, AI alerts, colleague messages, system notifications. Tapping any item morphs to the relevant Card or Canvas. Responding morphs to Dialog mode.

### 7.5 End of day (Board)

The counselor switches to the "weekly overview" Lens — a Board grouped by client status. She drags a client from "active" to "maintenance." That's an Effect: retract the old status datom, assert the new one. The AI loop picks it up and suggests adjusting the session frequency.

---

## 8. Client Portal (Future Phase)

A simple, privacy-first portal where clients can:

- Check in with a mood rating (→ `:checkin/*` datom)
- View their homework from the last session
- See upcoming appointments
- Send a secure message (→ `:message/*` datom)

The portal is a restricted Surface — it renders only datoms the client is authorized to see, through a filtered Lens. Built with the same TanStack stack, deployed as a separate route or lightweight web app.

The AI pre-processes incoming check-ins so the counselor sees a dashboard before each day: "3 clients checked in, 1 flagged low mood, suggested priority order for today."

---

## 9. Relation to Existing Systems

### 9.1 What this replaces

| Traditional tool       | Replaced by                                           |
|------------------------|-------------------------------------------------------|
| ClickUp / Asana        | Board + Card surfaces with Lens-based views           |
| Notion                 | Canvas surface with CRDT editing                      |
| Slack                  | Stream surface filtered to messages                   |
| CRM (client records)   | Card surface with `:client/*` Type                    |
| EHR (session notes)    | Canvas surface with `:session/*` and `:doc/*` Types   |
| Google Calendar        | Board surface grouped by date + `:schedule/*` datoms  |
| AI assistant (ChatGPT) | Dialog surface with MCP-connected AI loop             |
| Separate billing tool  | Card surface with `:invoice/*` Type (future)          |

### 9.2 Architectural comparison

| Aspect               | Huly                    | Holepunch/Hypercore (prev) | Iroh + MoQ (current)     | Our system                   |
|-----------------------|-------------------------|----------------------------|--------------------------|------------------------------|
| Data model            | MongoDB docs            | Append-only logs           | Datom blobs (iroh-blobs) | Datoms [E,A,V,Tx,Op]        |
| Replication           | Cloud multi-tenant      | P2P via Hyperswarm         | P2P via MoQ + Iroh      | MoQ pub/sub                  |
| Multiplexing          | N/A                     | Protomux channels          | MoQ tracks               | MoQ tracks                   |
| UI model              | Separate features       | N/A (protocol only)        | N/A (protocol only)      | 3 primitives: Datom+Lens+Surface |
| AI integration        | Planned (Hulia)         | None                       | None                     | Dual-loop (human + AI)      |
| Offline-first         | No                      | Yes                        | Yes                      | Yes                          |
| Privacy               | Cloud or self-host      | Built-in encryption        | QUIC encryption          | Local-first by design        |
| Browser support       | Yes (cloud)             | Limited (Bare runtime)     | Native (WebTransport)    | Yes (browser-first)          |
| Counseling fit        | Generic PM              | None                       | None                     | Domain-native                |

### 9.3 Future replication path

Because datoms are append-only facts with transaction IDs, they are naturally replicable:

- **Phase 1 (now):** Single machine. Local datom store. Everything local.
- **Phase 2 (when needed):** Second node (e.g., VPS for client portal). Replicate datoms over MoQ between nodes.
- **Phase 3 (target):** Full P2P via Iroh + MoQ. The datom log is structurally content-addressable (iroh-blobs, BLAKE3). Datoms are already CRDT-compatible (assert/retract = add/remove operations).

---

## 10. Live Evolution

The system is designed to be developed while running. There is no deploy downtime, no migration window, no maintenance mode. Code changes, configuration changes, schema changes, and feature experiments all flow through the same datom + effect model and take effect immediately.

This is not a separate capability bolted on — it emerges naturally from the architectural choices already made: datoms are append-only (changes never break history), the effectHandler is the single control plane (all changes are Effects), and NATS provides real-time signaling (external systems react instantly).

### 10.1 Handlers vs. Signals — the critical distinction

Not all effects are NATS messages. The system has two fundamentally different kinds of operations:

**Handlers** are code. A handler is a TypeScript module that processes an effect. It imports other modules, reads datom state, branches on feature flags, calls functions directly, and produces new datoms. Handlers run in-process. Most of the system's logic is handlers calling handlers — ordinary function calls, not message passing.

**Signals** are NATS publications. After a handler completes and writes its datoms, the system publishes signals to NATS for external listeners: Surfaces that need to re-render, the AI loop that needs to analyze, or future cross-device sync. Signals are notifications that something happened — they don't carry the logic of what to do about it.

```typescript
effectHandler(state: State, effect: Effect) {
  // HANDLER: code logic — function calls, feature flags, direct imports
  const config = state.query({ attribute: ':config/*' })
  const structurer = config.get(':feature/soap-v2')
    ? structureSOAP_v2
    : structureSOAP
  const structured = await structurer(effect.transcript)
  const patterns = await detectPatterns(state, structured)
  const reminders = await scheduleFollowup(state, structured)

  // Write datoms to PostgreSQL
  const datoms = [...structured.datoms, ...patterns.datoms, ...reminders.datoms]

  // SIGNAL: publish to NATS for external listeners only
  const signals = ['datom.session.new', 'datom.alert.*']

  return { datoms, signals }
}
```

### 10.2 The Dispatcher — resolving which code runs

The dispatcher is the runtime core. When an effect arrives, it resolves which handler module to load and call:

1. **Effect arrives** (from voice input, UI action, AI proposal, timer, or another handler)
2. **Resolve handler:** Read handler datoms → find the module path for this effect type
3. **Check feature flags:** If an override exists and is enabled, use the override handler instead
4. **Dynamic import:** Load the resolved module by file path (hot module reload in dev via Vite HMR, file-path import in production)
5. **Execute handler:** Handler reads state, calls other handlers (direct function calls), produces datoms
6. **Validate contracts:** Check all applicable contracts — abort and record violation if any fail
7. **Write datoms:** Assert new datoms to PostgreSQL and transactions table (atomic)
8. **Publish signals:** Notify NATS subscribers (Surfaces, AI loop) that something changed — with retry

```typescript
async function dispatch(state: State, effect: Effect): Promise<void> {
  // 1. Resolve handler from datoms
  const handlerDatoms = state.query({
    attribute: ':handler/effect-type',
    where: [
      { op: 'eq', value: effect.type },
      { attribute: ':handler/active', op: 'eq', value: true }
    ]
  })

  // 2. Check feature flag overrides
  const overrideDatoms = state.query({
    attribute: ':feature/effect-type',
    where: [
      { op: 'eq', value: effect.type },
      { attribute: ':feature/enabled', op: 'eq', value: true }
    ]
  })

  // 3. Resolve module path (override takes priority)
  const resolved = overrideDatoms.isEmpty() ? handlerDatoms : overrideDatoms
  const modulePath = resolved.get(':handler/module-path') as string

  // 4. Dynamic import by file path
  const handler = await importHandler(modulePath)

  // 5. Execute handler with timeout
  const result = await withTimeout(
    () => handler(state, intent),
    30_000,
    () => handleTimeout(intent)
  )

  // 6. Contract validation — abort atomically if any fail
  const contracts = state.query({
    attribute: ':contract/effect-type',
    where: [{ op: 'eq', value: effect.type }]
  })
  for (const contract of contracts.datoms) {
    validateContract(contract, result.datoms, effect)
    // validateContract throws ContractViolation if check fails
    // ContractViolation is caught below — writes violation datom, does NOT commit effect datoms
  }

  // 7. Write datoms — PostgreSQL first (persistent), then transactions table
  await writeDatoms(result.datoms, effect)

  // 8. Publish signals — retry 3x on failure, then write signal-failed datom
  await publishSignalsWithRetry(result.signals)
}

// Handler module loader — file-path based dynamic import
async function importHandler(modulePath: string): Promise<Handler> {
  const absPath = path.resolve(process.cwd(), modulePath)
  // Timestamp suffix busts Node module cache on hot-reload (dev mode only)
  const url = `file://${absPath}` + (DEV_MODE ? `?t=${Date.now()}` : '')
  const module = await import(/* @vite-ignore */ url)
  if (typeof module.default !== 'function') {
    throw new Error(`Handler module ${modulePath} must export a default function`)
  }
  return module.default
}

// Contract validation — throws ContractViolation if check fails
function validateContract(contract: Datom, resultDatoms: Datom[], effect: Effect): void {
  const contractView = state.query({ entity: contract.e }).entity(contract.e)
  const required = contractView.getAll(':contract/requires') as string[]
  const forbidden = contractView.getAll(':contract/forbids') as string[]

  for (const attr of required) {
    if (!resultDatoms.some(d => matchesAttribute(d.a, attr))) {
      throw new ContractViolation(contract.e, `Missing required: ${attr}`, effect)
    }
  }
  for (const attr of forbidden) {
    if (resultDatoms.some(d => matchesAttribute(d.a, attr))) {
      throw new ContractViolation(contract.e, `Forbidden attribute: ${attr}`, effect)
    }
  }
}

// Failure model — called when dispatch() catches ContractViolation or other errors
async function handleDispatchFailure(err: unknown, effect: Effect): Promise<void> {
  if (err instanceof ContractViolation) {
    // Write violation datom — the only thing committed when a contract fails
    await writeDatoms([
      datom('violation/' + uuid(), ':violation/contract', err.contractId, 'text'),
      datom('violation/' + uuid(), ':violation/reason',   err.message,    'text'),
      datom('violation/' + uuid(), ':violation/effect',   effect.id,      'ref'),
    ], effect)
    // Effect datoms are NOT written — atomically aborted
  } else if (err instanceof HandlerTimeout) {
    await writeDatoms([
      datom('effect-timeout/' + uuid(), ':timeout/effect', effect.id, 'ref'),
    ], effect)
  }
  // Other errors bubble up to the caller (UI shows error state)
}
```

**Failure model summary:**

| Failure                       | Behavior                                                                  |
|-------------------------------|---------------------------------------------------------------------------|
| ContractViolation             | Effect aborted (no datoms committed). Violation datom written. Alert surfaced. |
| Handler throws / crashes      | Effect aborted. Error datom written. Counselor sees error badge.           |
| Handler timeout (30s)         | Effect aborted. Timeout datom written. Counselor can retry.               |
| LLM timeout (60s)             | Handler falls back to stub result. Datom flagged `:tx/status :needs-review`. |
| writeDatoms fails             | Effect aborted. No partial state. Error propagates to caller.             |
| publishSignals fails          | Datoms already committed. Retry 3x. If still fails: signal-failed datom written. Surface re-renders on next NATS reconnect. |

### 10.3 Handler registration — code as datoms

Every handler is registered as datoms. The key change from v0.6: `module-path` replaces `git-ref`. Git-refs are a development-time concept; the runtime resolves handlers by file path to a built artifact.

```
[:handler/session-recap  :handler/effect-type  :session/recap-requested                    tx:1  true]
[:handler/session-recap  :handler/module-path  "dist/handlers/session-recap.v1.mjs"     tx:1  true]
[:handler/session-recap  :handler/active       true                                     tx:1  true]
```

This makes the system's own behavior queryable, auditable, and time-travelable — "which handler processed session recaps last month?" is a DatomQuery against `:handler/module-path` as-of the past tx.

### 10.4 Feature flags as datoms

A feature flag is a datom that the dispatcher reads at runtime to decide which code path to take. Feature flags can be scoped: all effects, per-client, per-effect-type, or per-handler.

```
// Flag: disabled (new handler built but not active)
[:feature/soap-v2  :feature/enabled      false                        tx:N    true]
[:feature/soap-v2  :feature/effect-type  :session/recap-requested        tx:N    true]
[:feature/soap-v2  :feature/handler      :handler/session-recap-v2    tx:N    true]

// Enable for one client first (testing)
[:feature/soap-v2  :feature/enabled      true                        tx:N+1  true]
[:feature/soap-v2  :feature/scope        :client/42                  tx:N+1  true]

// Promote to all
[:feature/soap-v2  :feature/scope        :client/42                  tx:N+2  false]
[:feature/soap-v2  :feature/scope        :all                        tx:N+2  true]
```

The counselor can toggle features via the Dialog surface ("turn on mood charts for Maria"). The developer can toggle them via code or the Stream surface. Claude can propose them as `:tx/status :pending` datoms.

### 10.5 Git-integrated deployment cycle

The deployment model separates two concerns that v0.6 conflated: **version control** (git, branches, PRs) and **runtime loading** (file paths, dynamic import). Git-refs never appear in handler datoms. The runtime only knows about module file paths.

**Handler module path convention:**

| Mode           | Path format                                    | Loader         |
|----------------|------------------------------------------------|----------------|
| Development    | `src/handlers/{name}.ts`                       | Vite HMR       |
| Production     | `dist/handlers/{name}.{semver}.mjs`            | Node dynamic import |

**Development flow:**

1. Developer creates branch `improve-soap-structuring`, edits `src/handlers/session-recap.ts`
2. In dev mode, Vite HMR picks up file changes instantly — no handler datom update needed during development
3. When ready: `pnpm build:handler session-recap` → outputs `dist/handlers/session-recap.v2.mjs`
4. Register new handler datom pointing to the built artifact:
   ```
   [:handler/session-recap-v2  :handler/effect-type  :session/recap-requested              tx:N  true]
   [:handler/session-recap-v2  :handler/module-path  "dist/handlers/session-recap.v2.mjs" tx:N  true]
   [:handler/session-recap-v2  :handler/active       true                               tx:N  true]
   ```
5. Create feature flag (enabled: false) — artifact exists, gated
6. Flip flag for testing scope → dispatcher loads `session-recap.v2.mjs` for matching effects
7. When satisfied: merge PR (built artifact is committed to repo), update feature flag scope to `:all`
8. Old artifact (`session-recap.v1.mjs`) remains on disk. Rollback = retract v2 handler datom, re-assert v1 handler datom. Old module reloads instantly.

**System never stops.** No restart required. Module cache busting (timestamp URL suffix in dev mode) handles hot reload. In production, each version is a different file path — no cache conflict.

### 10.6 Three actors, one running system

Each actor can change the system at a different level, all through the same datom + effect model:

| Actor     | Changes what                    | How                                                  | Approval needed? |
|-----------|---------------------------------|------------------------------------------------------|-----------------|
| Counselor | Config datoms, feature flag toggles | Dialog surface ("switch to wake word") or Card settings | No — direct write |
| Developer | Handler code, handler datoms, feature flags | Git branch + build artifact + handler registration + flag toggle | No — owns the system |
| Claude/AI | Schema proposals, handler drafts, config suggestions | MCP → writes `:tx/status :pending` datoms | Yes — human approves |

Claude's role in the development cycle: Claude (via MCP) can propose a new handler by writing code to a branch, building the artifact, registering the handler datom, and creating the feature flag — all as pending datoms. The developer reviews the code (it's a PR), approves the datoms, and the new handler goes live. Claude never directly changes live behavior — it proposes, a human gates.

### 10.7 Config datoms for deferred decisions

The remaining open architectural questions (voice UX mode, LLM model choice, Surface rendering library) are not unsolved — they are intentionally deferred to config datoms that can be changed at any time:

```
[:config/voice-ux       :config/value  "push-to-talk"   tx:1  true]
[:config/llm-model      :config/value  "qwen3.5:8b"     tx:1  true]
[:config/surface-lib    :config/value  "react-dom"       tx:1  true]
```

These can be changed by any actor at runtime. The Why chain records who changed them and why. The history shows every previous value. Rollback is a retraction + assertion.

---

## 11. Development Flow — Contract-Driven Development

The system's development workflow is redesigned for the LLM age. The traditional 13-step flow (spec → types → lint → unit test → integration test → e2e test → coverage → human test → branch → PR → approval → merge → release) collapses into 5 steps that all run in the same system, against the same data, using the same datom primitives.

The key new concept is the **Contract** — a datom that is simultaneously spec, test, and runtime guard.

### 11.1 The Contract primitive

A Contract is a datom that declares: "when this Effect arrives, these datoms must result." It serves as:

- **Spec:** documents expected behavior, readable by humans and machines
- **Test:** the dispatcher validates handler output against it on every execution
- **Runtime guard:** violations are caught in production, not just in CI
- **Documentation:** queryable, versioned, always up to date because it IS the enforcement

Contracts operate at three levels:

**Schema contracts** — structural validity of entities:
```
[:contract/schema-client  :contract/entity-type  :client              tx:1  true]
[:contract/schema-client  :contract/requires     :client/name         tx:1  true]
[:contract/schema-client  :contract/requires     :client/status       tx:1  true]
```
Enforced on every datom write for a `:client` entity.

**Effect contracts** — handler output validity:
```
[:contract/recap  :contract/effect-type  :session/recap-requested       tx:1  true]
[:contract/recap  :contract/requires     :session/themes             tx:1  true]
[:contract/recap  :contract/requires     :session/mood-pre           tx:1  true]
[:contract/recap  :contract/requires     :tx/why                    tx:1  true]
[:contract/recap  :contract/forbids      :session/diagnosis          tx:1  true]
```
Enforced on every dispatch of `:session/recap-requested`.

**Invariant contracts** — cross-entity business rules, expressed as `DatomQuery` conditions:
```
[:contract/high-risk  :contract/invariant    true                    tx:1  true]
[:contract/high-risk  :contract/condition    <DatomQuery-as-JSON>    tx:1  true]
[:contract/high-risk  :contract/requires     <DatomQuery-as-JSON>    tx:1  true]
```

The invariant conditions use DatomQuery objects (section 2.6), stored as JSON in a text datom:
```typescript
// Condition: "when a client has risk-level = high"
const condition: DatomQuery = {
  attribute: ':client/risk-level',
  where: [{ op: 'eq', value: 'high' }]
}

// Requirement: "there must be a session scheduled within 7 days"
const requirement: DatomQuery = {
  attribute: ':schedule/date',
  where: [{ op: 'within', value: '7d', direction: 'future' }]
}
```

The invariant checker handler runs on every session commit and periodically (daily), evaluating condition queries against live State and asserting violation datoms when requirements fail.

### 11.2 The dispatcher enforces contracts at runtime

The dispatcher doesn't just route effects to handlers — it validates every handler's output against applicable contracts before committing datoms. This is not a test that runs in CI — it's a live guardrail on every effect, always.

The full dispatcher implementation is shown in section 10.2. Contract validation is step 6 — runs after the handler returns, before any datoms are committed. If validation fails, nothing is committed. The violation becomes a datom.

```typescript
// Contract validation (excerpt from section 10.2 dispatcher)
const contracts = state.query({
  attribute: ':contract/effect-type',
  where: [{ op: 'eq', value: effect.type }]
})
for (const contract of contracts.datoms) {
  validateContract(contract, result.datoms, effect)
}
// If any validateContract() throws ContractViolation:
// → violation datom written
// → effect datoms NOT committed
// → no signals published
// → counselor sees alert in Stream
```

Contract violations produce datoms — they are queryable, auditable test reports:
```
[:violation/v1  :violation/contract  :contract/recap              tx:N  true]
[:violation/v1  :violation/reason    "Missing required: :session/themes"  tx:N  true]
[:violation/v1  :violation/handler   :handler/session-recap-v2    tx:N  true]
[:violation/v1  :violation/effect    <effect-reference>           tx:N  true]
```

**Failure model for violations:** The counselor sees a notification in the Stream ("Session recap failed: missing required fields"). The voice recap effect can be re-dispatched after the developer deploys a fix. Because nothing was committed, no partial state exists to clean up.

### 11.3 The five-step development flow

**Step 1 — Contract:** Define what the handler must produce. Assert contract datoms. Who: developer writes, Claude proposes, counselor validates business rules. Replaces: spec documents and test design.

**Step 2 — Handler:** Write the handler code on a git branch. Build the artifact. Register handler datom with module-path. Who: developer writes or Claude writes and developer reviews. Replaces: implementation phase.

**Step 3 — Verify:** Enable the feature flag with scope `:test`. Dispatch test effects through the real dispatcher against the real datom store. Contracts validate output. Violations become datoms. Who: automated (dispatcher does it) + developer reviews violations. Replaces: unit tests, integration tests, type checking at the effect level.

**Step 4 — Gate:** Developer reviews code + verification results. Counselor tests UX via feature flag scoped to one client. Approval = feature flag scope change from `:test` to `:client/42` to `:all`. Both gates are datoms with Why chain. Replaces: PR review, approval, merge.

**Step 5 — Live:** Handler is live. Contracts keep validating on every dispatch — continuously, forever. Violations trigger alert signals. Rollback = retract feature flag. Replaces: deploy and release (which no longer exist as separate steps).

### 11.4 What stays from traditional development

The Contract model does not replace everything. These traditional tools remain because they catch failure modes that contracts cannot:

- **TypeScript** — type checking for handler code. Catches structural code errors (wrong variable name, missing import, logic errors in loops). TypeScript validates the code; contracts validate the output.
- **Linting** (ESLint/Biome) — code style consistency. Especially valuable when Claude writes handler code — linting enforces project conventions.
- **Git + branches** — version control for handler code. The handler datom system builds on top of git, not instead of it.
- **Code review** — human eyes on handler logic. Claude can pre-review ("does this handler satisfy contract/c1?") but a developer validates the approach, not just the output.
- **Handler tests** — traditional test files that feed test effects through the dispatcher and check results. Written by developer or Claude. Simpler than traditional tests because the dispatcher does the contract assertion — the test just provides input and checks for violations.

### 11.5 What's new — didn't exist in traditional development

- **Runtime contract enforcement.** Contracts validate continuously in production, not just in a test run. If a handler regression happens, the contract catches it before the bad datom is committed. Tests that never stop running.
- **Violation datoms.** Test failures are first-class datoms. Queryable: "show me all violations this week." Trendable: "is handler/soap-v2 producing more violations than v1?" The test report is part of the datom log.
- **Counselor-in-the-loop testing.** Feature flags with per-client scope let the counselor be the final gate — not a QA team in a staging environment, but the actual user with actual client data.
- **Claude as co-developer.** Claude writes contracts, writes handlers, writes handler tests, reviews code, and proposes schema changes — all as pending datoms that a human approves. The flow is designed for human+AI collaboration at every step.
- **No CI/CD pipeline.** The dispatcher IS the deployment mechanism. Feature flags ARE the release gates. Git merge IS the promotion. No Jenkins, no GitHub Actions, no build server.
- **No releases.** The system is always "released." Features appear when flags enable them. There is no version number, no release notes, no big-bang deploy moment.

### 11.6 Coverage metrics

Traditional line coverage ("78% of code lines exercised") is replaced by more meaningful metrics:

| Metric              | What it measures                                             | Target    |
|---------------------|--------------------------------------------------------------|-----------|
| Contract coverage   | % of effect types that have at least one contract            | 100%      |
| Schema coverage     | % of entity types that have schema contracts                 | 100%      |
| Invariant coverage  | % of business rules expressed as invariant contracts         | Best effort |
| Violation rate      | Contract violations per 1000 dispatches (should trend to 0)  | < 0.1%   |
| Handler test coverage | % of handlers with at least one test dispatching through contracts | 100% |

### 11.7 The old flow mapped to the new

| Traditional step        | Status      | In the new flow                                                |
|-------------------------|-------------|----------------------------------------------------------------|
| Spec / PRD              | Transformed | Contract datoms (living, executable, versioned)                |
| Type checking           | Kept + extended | TypeScript for code + dispatcher schema validation for datoms |
| Lint rules              | Kept        | ESLint/Biome for handler code quality                          |
| Unit tests              | Transformed | Handler tests: given state + effect → contracts pass?          |
| Integration tests       | Transformed | Dispatcher with real datom store + contract validation         |
| E2E tests               | Transformed | Lens verification (pure data) + counselor feature-flag testing |
| Test coverage           | Transformed | Contract coverage + effect coverage + violation rate           |
| Human testing           | Kept        | Counselor tests via per-client feature flags                   |
| Branch                  | Kept        | Git branches, handler build artifacts per version              |
| PR / Review             | Transformed | Code review + contract verification results as datoms          |
| Approval                | Transformed | Feature flag scope change (datom with Why chain)               |
| Merge                   | Transformed | Git merge + build artifact committed (no separate deploy step) |
| Release                 | Replaced    | Gone. Continuous. Features appear when flags enable them.      |

---

## 12. Open Questions

1. **CRDT choice: Loro** *(resolved)*

   **Decision:** Use Loro as the CRDT layer for all collaborative and editable Surfaces (Canvas, Card rich-text fields, Board drag-and-drop).

   **Context:** Three candidates were evaluated — Yjs, Automerge, and Loro — against the system's datom-centric, append-only, history-preserving architecture.

   **Comparison summary:**

   | Aspect                  | Yjs                          | Automerge                  | Loro                            |
   |-------------------------|------------------------------|----------------------------|---------------------------------|
   | Core algorithm          | YATA (RGA variant)           | JSON CRDT (Kleppmann)      | Eg-walker + Fugue               |
   | Text editing perf       | Fastest (benchmark leader)   | Slowest (OOM on large replays) | Near-Yjs (competitive)     |
   | History model           | GC-oriented (discards history)| Full DAG (expensive)      | Full event graph (compact: 360K ops in 361KB) |
   | Datom alignment         | Weak — GC fights append-only | Partial — ops log exists   | Strong — event graph IS append-only log |
   | Tree CRDT (for Canvas blocks) | None (hack on Y.Map)  | None (nested JSON only)    | Native LoroTree with move ops   |
   | Movable list (for Board)| None (delete+insert risk)    | None                       | Native LoroMovableList          |
   | Fork/merge              | No                           | No                         | Yes — fork_at / import like Git |
   | Time travel             | Extra overhead per version   | Possible but expensive     | Native checkout() to any version |
   | Rich text               | Mature (ProseMirror, TipTap, CodeMirror, Quill, Monaco) | Peritext-based, fewer bindings | Fugue+Peritext, loro-prosemirror binding |
   | Bundle size             | ~65KB (native JS)            | ~800KB (WASM)              | ~300KB (WASM)                   |
   | Maturity                | Production (JupyterLab, Liveblocks) | Maturing (Ink&Switch) | Young but solid (v1.0, MIT)    |

   **Why Loro wins:** Datom philosophy alignment, Eg-walker's sub-1ms local ops, native LoroTree + LoroMovableList, fork/merge for AI dual-loop, NATS-friendly binary sync, compact history storage. See v0.6 for full analysis.

2. **Local LLM sizing** *(deferred to config datom — see section 10.7)*

   Initial config: `[:config/llm-model :config/value "qwen3.5:8b" tx:1 true]`. Will be evaluated empirically during prototyping.

3. **Schema evolution: Schema-as-of-Tx** *(resolved)*

   **Decision:** No explicit version numbers on Types. The datom log's Tx dimension IS the version history. Four cases handled: add attribute (assert new `:type/attr` datom), remove attribute (retract `:type/attr`), rename attribute (assert `:attr/display-name`), retype attribute (retract old type, assert new type with Surface rendering schema-aware per Tx). See v0.6 for full analysis.

4. **Consent model: Consent-as-datom with Seal** *(resolved)*

   **Decision:** Consent is a first-class datom with full Why chain. Controls the Seal. Revocation = retraction datom. AI agent key bound to consent_tx via HKDF — revocation changes the key. Consent scopes: ai-analysis, transcription, portal-access, data-sharing, supervisor-review. See v0.6 for full analysis.

5. **Regulatory compliance: Patientdatalagen + GDPR** *(resolved — architecturally addressed, legal review still recommended)*

   Architecture satisfies key requirements by design: selective encryption, four-role Seal, append-only audit trail with Why chain, local-first (no third-party data transfer), crypto-shredding for right-to-erasure, AI draft-only mode. Legal review with Swedish healthcare data protection lawyer recommended before production.

6. **Voice UX** *(deferred to config datom — see section 10.7)*

   Initial: push-to-talk. Switchable at runtime.

7. **Surface morphing implementation** *(deferred to config datom — see section 10.7)*

   Initial: react-dom. Handler/dispatcher model allows Surface renderer to be swapped at runtime.

8. **Encryption at rest: Selective Value encryption with deterministic key derivation** *(resolved)*

   **Decision:** Per-datom selective Value encryption using AES-256-GCM with PBKDF2 → HKDF key derivation chain. Sealed values stored in `v_bytes` column with `v_type = 'encrypted'`. FileVault as outer defense-in-depth layer. Client-side in-memory search index (decrypt on login, 100 clients ≈ 10-30ms). See section 6.4 for storage design and v0.6 for full key derivation analysis.

9. **State query API: DatomQuery typed builder** *(resolved — new in v0.7)*

   **Decision:** TypeScript typed query builder that compiles to SQL against the `datoms` table. One query model used for Lens filters, Seal enforcement, Contract invariants, and dispatcher state reads. Attribute wildcards supported (`:handler/*` → `a LIKE ':handler/%'`). Time-travel via `asOf(tx)`. See section 2.6 for full type definitions and examples.

10. **PostgreSQL datom table design** *(resolved — new in v0.7)*

    **Decision:** Discriminated union with typed columns (`v_text`, `v_num`, `v_bool`, `v_date`, `v_ref`, `v_bytes`, `v_vec`) plus `v_type` discriminator. Sealed values in `v_bytes` with `v_type = 'encrypted'`. pgvector embeddings as ordinary datoms with `v_type = 'vec'`. Four primary indexes (EAVT, AEVT, AVET-text, AVET-ref) plus partial indexes for date and vector queries. See section 6.4 for full DDL.

11. **Lens filter language** *(resolved — new in v0.7)*

    **Decision:** The Lens `filter: DatomQuery` uses the same `DatomQuery` type as the state query API (section 2.6). No separate DSL. One query model everywhere. The inconsistent notation examples in v0.6 (SQL-ish, key=value pairs, keyword references) are all expressible as typed `DatomQuery` objects. See section 2.2 for updated Lens examples.

12. **Handler hot-swap mechanism** *(resolved — new in v0.7)*

    **Decision:** File-path based dynamic import. Git-refs are a development-time concept — they do not appear in runtime handler datoms. Each handler version is a built ESM artifact (`dist/handlers/{name}.{version}.mjs`). Handler datoms store `module-path` pointing to the artifact file. Dynamic import by file URL. Module cache busting via timestamp URL suffix in dev mode. Vite HMR handles dev-time hot reload. See section 10.2 (`importHandler`) and section 10.5 (updated deployment cycle) for full details.

13. **Dispatcher failure model** *(resolved — new in v0.7)*

    **Decision:** ContractViolation is atomic abort (no datoms committed, violation datom written). writeDatoms/publishSignals use two-phase approach (PostgreSQL first, NATS with 3x retry). Handler timeout 30s → timeout datom + alert. LLM timeout 60s → stub result flagged `:tx/status :needs-review`. See section 10.2 for full failure table.

14. **Why-chain population for implicit actions** *(open — can resolve during prototyping)*

    For non-verbal, non-narrated actions (dragging a card, toggling a feature flag, approving an AI suggestion), the Why chain must be populated from context. Proposed approach: each implicit action type has a default Why template (e.g., dragging to "maintenance" → "Status change: counselor moved client to maintenance phase"), with an optional prompt for the counselor to add detail. AI suggestions carry their reasoning from the generation step. Needs user testing to validate whether default templates are sufficient or whether they create noise.

15. **Contract versioning and retroactive invariants** *(open — can resolve during prototyping)*

    Contracts evolve through the same flow as handlers. The Tx dimension handles temporal contract validity (a contract is enforced starting from its assertion tx). Invariant tightening (e.g., 14-day window → 7-day window) should be non-retroactive by default — new contract applies from its Tx forward. Old violations under the old contract remain in the log; new checker applies the new threshold. Implementation detail: invariant checker passes `asOf: contract.tx` to evaluate conditions only against datoms that postdate the contract change.

16. **Bootstrapping sequence** *(open — can resolve during prototyping)*

    The system uses datoms to store handler registrations, feature flags, and contracts. On first run, bootstrap datoms must exist before the dispatcher can function. Proposed: a seed file (`bootstrap/seed.ts`) that the installer runs once to write the initial handler, contract, and config datoms. The dispatcher has a hardcoded fallback mode (bypasses handler datom lookup, loads bootstrap handlers directly) until the seed is complete. Once seeded, the fallback is never used again.

---

## 13. Next Steps

Reordered from v0.6 to follow the review recommendation: prove the hardest parts (data model, query API) before building the dynamic dispatch layer on top.

1. **Prototype the datom store** — implement the PostgreSQL schema (section 6.4), write the DatomQuery → SQL compiler (section 2.6), validate the primary access patterns against realistic data shapes. This is the foundation everything else builds on.

2. **Build the first handler with manual dispatch** — session recap handler (voice → Whisper → LLM → structured datoms). No meta-datom lookup yet — hard-code the handler call. Prove the effectHandler formula and the commit bridge extraction schema.

3. **Add contract validation to the dispatcher** — implement the full dispatcher (section 10.2) including ContractViolation handling. Define schema and effect contracts for session recap. Prove violation datoms work.

4. **Wire up handler registration datoms and feature flags** — switch from hard-coded dispatch to datom-driven handler resolution. This is where the bootstrapping sequence becomes real.

5. **Build the first Surface** — Card mode for a client entity. Prove the Lens → DatomQuery → SQL → render pipeline end-to-end.

6. **Build the first MCP server** — `mcp-clients` as the bridge between Claude and the datom store. Minimum tool signatures: `query_client(id)`, `list_clients(filter)`, `assert_datoms(datoms)`.

7. **Prototype the NATS signal structure** — datom stream subjects, AI loop subscription, Surface reactive updates.

8. **Build the second handler and prove hot-swap** — register v2 handler datom pointing to a new built artifact, toggle feature flag, verify rollback.

9. **Test with the counselor** — mock data, real workflow, feature-flagged per client, iterate on Surface modes and morphing.

10. **Define the Type schema** in full — primary entity families with complete attribute tables, validations, relations.

11. **Legal review** — engage a Swedish healthcare data protection lawyer to confirm Patientdatalagen compliance before handling real client data.
