# Counseling Practice Platform — Architecture Document

**Version:** 0.6 (Draft)
**Date:** 2026-03-14
**Authors:** Piet (Technical Lead & Architect), Claude (Strategic Thought Partner)
**Status:** Concept Definition complete — ready for prototyping

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
| Entity    | Unique identifier for the thing                     | `:client/42`                     |
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
  filter: DatomQuery       // Which entities/attributes to include
  sort: SortSpec           // Time, attribute value, relevance
  group?: GroupSpec         // Group by attribute (enables Board mode)
  mode: SurfaceMode        // "stream" | "card" | "canvas" | "dialog" | "board"
  depth?: DepthSpec         // How deep to follow references
}
```

A saved Lens is what other apps call a "view," "dashboard," "page," or "workspace." Lenses are themselves datoms — they can be shared, versioned, and composed.

**Examples:**

| Lens name           | Filter                                | Mode     | Purpose                           |
|---------------------|---------------------------------------|----------|-----------------------------------|
| Morning prep        | `type=client, session.next within 1d` | Board    | Today's clients by session time   |
| Maria's journey     | `entity=client:42, depth=all`         | Card     | Full client profile               |
| Session notes       | `entity=doc:session-42-*`             | Canvas   | Editable session document         |
| Activity feed       | `tx.time > 24h ago`                   | Stream   | Recent activity across workspace  |
| AI suggestions      | `tx.source=:ai, status=pending`       | Stream   | Pending AI proposals for review   |

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

**Core insight: a capability scope IS a Lens.** The statement "client Maria can read her own data" is expressed as a Lens `{ filter: entity refs client:42, depth: own-data-only }` combined with Maria's decryption key. The same query engine that renders Surfaces also enforces access control.

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

See sections 10.4, 10.5, and 10.8 for the full resolved analysis including key derivation hierarchy, regulatory compliance mapping, and encryption trade-offs.

### 2.5 The Contract (Development Model)

A Contract is a datom that declares expected behavior. It is simultaneously spec ("what should happen"), test ("did it happen?"), and runtime guard ("prevent it from not happening"). Contracts are enforced by the dispatcher on every effect execution — not just during testing.

Three levels of contracts:

- **Schema contracts:** structural validity of entities ("a client must have a name and status")
- **Effect contracts:** handler output validity ("a session recap must produce themes and mood, must never produce a diagnosis")
- **Invariant contracts:** cross-entity business rules ("a high-risk client must have a session within 7 days")

Contracts are datoms — versioned, auditable, queryable. They evolve through the same five-step flow (Contract → Handler → Verify → Gate → Live) as any other change. Contract violations produce violation datoms, making the test report part of the datom log.

See section 11 for the full development flow built on contracts.

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
[:tx/1087  :tx/how    :effect/voice-recap                             tx:1087  true]
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
| **Loro**        | CRDT library built on Event Graph Walker (Eg-walker) + Fugue algorithm. Rust core with JS/WASM bindings. Native support for text, list, map, tree, movable list, and counter CRDTs. Stores complete editing history in compact form (360K ops in 361KB). Time travel, fork/merge like Git. Aligns with the datom append-only philosophy — Loro's event graph IS an append-only operation log. See section 10.1 for full analysis. |
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
    │  3. Extract structured metadata (themes, mood, flags)
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

**What gets committed as datoms on each bridge crossing:**

```
[:doc/42   :doc/content       <loro-binary-snapshot>            tx:N  true]
[:doc/42   :doc/loro-version  <loro-version-vector>             tx:N  true]
[:doc/42   :doc/themes        ["sleep","anxiety","cbt-i"]       tx:N  true]
[:doc/42   :doc/mood-summary  "anxious but improving"           tx:N  true]
[:tx/N     :tx/how            :effect/crdt-commit               tx:N  true]
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

| Aspect               | Huly                    | Holepunch/Hypercore     | Our system                   |
|-----------------------|-------------------------|-------------------------|------------------------------|
| Data model            | MongoDB docs            | Append-only logs        | Datoms [E,A,V,Tx,Op] in PG  |
| Replication           | Cloud multi-tenant      | P2P via Hyperswarm      | NATS pub/sub                 |
| UI model              | Separate features       | N/A (protocol only)     | 3 primitives: Datom+Lens+Surface |
| AI integration        | Planned (Hulia)         | None                    | Dual-loop (human + AI)      |
| Offline-first         | No                      | Yes                     | Yes                          |
| Privacy               | Cloud or self-host      | Built-in encryption     | Local-first by design        |
| Counseling fit        | Generic PM              | None                    | Domain-native                |

### 9.3 Future replication path

Because datoms are append-only facts with transaction IDs, they are naturally replicable:

- **Phase 1 (now):** Single machine. PostgreSQL + NATS. Everything local.
- **Phase 2 (when needed):** Second node (e.g., VPS for client portal). Replicate datoms over NATS between nodes.
- **Phase 3 (if ever needed):** The datom log is structurally identical to a Hypercore — append-only, hash-linkable. Bridge to Hypercore/Holepunch without redesigning the data model.

---

## 10. Live Evolution

The system is designed to be developed while running. There is no deploy downtime, no migration window, no maintenance mode. Code changes, configuration changes, schema changes, and feature experiments all flow through the same datom + effect model and take effect immediately.

This is not a separate capability bolted on — it emerges naturally from the architectural choices already made: datoms are append-only (changes never break history), the effectHandler is the single control plane (all changes are Effects), and NATS provides real-time signaling (external systems react instantly).

### 10.1 Handlers vs. Signals — the critical distinction

Not all effects are NATS messages. The system has two fundamentally different kinds of operations:

**Handlers** are code. A handler is a TypeScript module that processes an effect. It imports other modules, reads datom state, branches on feature flags, calls functions directly, and produces new datoms. Handlers run in-process. Most of the system's logic is handlers calling handlers — ordinary function calls, not message passing.

**Signals** are NATS publications. After a handler completes and writes its datoms, the system publishes signals to NATS for external listeners: Surfaces that need to re-render, the AI loop that needs to analyze, or future cross-device sync. Signals are notifications that something happened — they don't carry the logic of what to do about it.

```
effectHandler(state, effect) {
  // HANDLER: code logic — function calls, feature flags, direct imports
  const config = state.query(':config/*')
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
2. **Resolve handler:** Read handler datoms → find the module + git-ref for this effect type
3. **Check feature flags:** If an override exists and is enabled, use the override handler instead
4. **Dynamic import:** Load the resolved module (hot module reload in dev, file-based import in production)
5. **Execute handler:** Handler reads state, calls other handlers (direct function calls), produces datoms
6. **Write datoms:** Assert new datoms to PostgreSQL
7. **Publish signals:** Notify NATS subscribers (Surfaces, AI loop) that something changed

```
async function dispatch(state: State, effect: Effect) {
  // Resolve handler from datoms
  const handlerDatom = state.query(
    ':handler/* WHERE :handler/effect-type = effect.type AND :handler/active = true'
  )

  // Check feature flag overrides
  const override = state.query(
    ':feature/* WHERE :feature/effect-type = effect.type AND :feature/enabled = true'
  )

  // Resolve git-ref and module path
  const ref = override ?? handlerDatom
  const gitRef = ref.get(':handler/git-ref')   // "main" or "feature-branch"
  const modulePath = ref.get(':handler/module') // "handlers/session-recap"

  // Dynamic import — hot reload
  const handler = await importHandler(modulePath, gitRef)

  // Execute
  const result = await handler(state, effect)

  // Persist + signal
  await writeDatoms(result.datoms)
  await publishSignals(result.signals)
}
```

### 10.3 Handler registration — code as datoms

Every handler is registered as datoms. This makes the system's own behavior queryable, auditable, and time-travelable — "which handler processed session recaps last month?" is just a datom query.

```
[:handler/session-recap  :handler/effect-type  :effect/session-recap    tx:1  true]
[:handler/session-recap  :handler/module       "handlers/session-recap" tx:1  true]
[:handler/session-recap  :handler/git-ref      "main"                  tx:1  true]
[:handler/session-recap  :handler/active       true                    tx:1  true]
```

### 10.4 Feature flags as datoms

A feature flag is a datom that the dispatcher reads at runtime to decide which code path to take. Feature flags can be scoped: all effects, per-client, per-effect-type, or per-handler.

```
// Flag: disabled (new handler loaded but not active)
[:feature/soap-v2  :feature/enabled      false                        tx:N    true]
[:feature/soap-v2  :feature/effect-type  :effect/session-recap        tx:N    true]
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

The deployment model connects git branches to the handler datom system. No CI/CD pipeline needed for a single-MacBook system — the git repo IS the deployment artifact.

**Development flow:**

1. Developer creates a git branch, edits handler code
2. Registers a handler datom pointing to the branch:
   ```
   [:handler/session-recap-v2  :handler/module   "handlers/session-recap"        tx:N  true]
   [:handler/session-recap-v2  :handler/git-ref  "improve-soap-structuring"      tx:N  true]
   [:handler/session-recap-v2  :handler/active   true                            tx:N  true]
   ```
3. Creates a feature flag (enabled: false) — new code loaded but gated
4. Flips the flag when ready to test — new effects use branch code, old code available as fallback
5. When satisfied: merges PR, updates handler datom git-ref to "main", retracts feature flag
6. System never stopped. Rollback = retract merge datom, re-assert old git-ref. Old code reloads instantly.

**In practice on the MacBook:**

- In dev mode: this is Vite HMR (hot module replacement). Edit a file, module reloads, effect behavior changes immediately.
- In "production" mode (still the MacBook): `git pull` on the local repo + module re-import achieves the same. The handler datoms and feature flags formalize and audit what developers already do informally with branches and env variables.
- Future: if the system moves to a VPS, the same model works with a webhook from GitHub triggering `git pull` + handler re-import on the server.

### 10.6 Three actors, one running system

Each actor can change the system at a different level, all through the same datom + effect model:

| Actor     | Changes what                    | How                                                  | Approval needed? |
|-----------|---------------------------------|------------------------------------------------------|-----------------|
| Counselor | Config datoms, feature flag toggles | Dialog surface ("switch to wake word") or Card settings | No — direct write |
| Developer | Handler code, handler datoms, feature flags | Git branch + handler registration + flag toggle | No — owns the system |
| Claude/AI | Schema proposals, handler drafts, config suggestions | MCP → writes `:tx/status :pending` datoms | Yes — human approves |

Claude's role in the development cycle: Claude (via MCP) can propose a new handler by writing code to a branch, registering the handler datom, and creating the feature flag — all as pending datoms. The developer reviews the code (it's a PR), approves the datoms, and the new handler goes live. Claude never directly changes live behavior — it proposes, a human gates.

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
[:contract/recap  :contract/effect-type  :effect/session-recap       tx:1  true]
[:contract/recap  :contract/requires     :session/themes             tx:1  true]
[:contract/recap  :contract/requires     :session/mood-pre           tx:1  true]
[:contract/recap  :contract/requires     :tx/why                    tx:1  true]
[:contract/recap  :contract/forbids      :session/diagnosis          tx:1  true]
```
Enforced on every dispatch of `:effect/session-recap`.

**Invariant contracts** — cross-entity business rules:
```
[:contract/high-risk  :contract/invariant    true                    tx:1  true]
[:contract/high-risk  :contract/condition    ":client/risk-level = high"  tx:1  true]
[:contract/high-risk  :contract/requires     ":schedule/* within 7d" tx:1  true]
```
Enforced periodically by an invariant checker handler subscribed to datom changes.

### 11.2 The dispatcher enforces contracts at runtime

The dispatcher doesn't just route effects to handlers — it validates every handler's output against applicable contracts before committing datoms. This is not a test that runs in CI — it's a live guardrail on every effect, always.

```typescript
async function dispatch(state: State, effect: Effect) {
  const handler = resolveHandler(state, effect)
  const result = await handler(state, effect)

  // Contract validation — runs on EVERY dispatch, not just tests
  const contracts = state.query(
    ':contract/* WHERE :contract/effect-type = effect.type'
  )
  for (const contract of contracts) {
    const required = contract.getAll(':contract/requires')
    const forbidden = contract.getAll(':contract/forbids')

    for (const attr of required) {
      if (!result.datoms.some(d => d.attribute === attr)) {
        throw new ContractViolation(contract, `Missing required: ${attr}`)
      }
    }
    for (const attr of forbidden) {
      if (result.datoms.some(d => d.attribute === attr)) {
        throw new ContractViolation(contract, `Forbidden: ${attr}`)
      }
    }
  }

  // Passed all contracts — commit
  await writeDatoms(result.datoms)
  await publishSignals(result.signals)
}
```

Contract violations produce datoms too — they are queryable, auditable test reports:
```
[:violation/v1  :violation/contract  :contract/recap              tx:N  true]
[:violation/v1  :violation/reason    "Missing required: :session/themes"  tx:N  true]
[:violation/v1  :violation/handler   :handler/session-recap-v2    tx:N  true]
[:violation/v1  :violation/effect    <effect-reference>           tx:N  true]
```

### 11.3 The five-step development flow

**Step 1 — Contract:** Define what the handler must produce. Assert contract datoms. Who: developer writes, Claude proposes, counselor validates business rules. Replaces: spec documents and test design.

**Step 2 — Handler:** Write the handler code on a git branch. Register handler datom with git-ref. Who: developer writes or Claude writes and developer reviews. Replaces: implementation phase.

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
| Branch                  | Kept        | Git branches, handler datom points to git-ref                  |
| PR / Review             | Transformed | Code review + contract verification results as datoms          |
| Approval                | Transformed | Feature flag scope change (datom with Why chain)               |
| Merge                   | Transformed | Git merge + handler datom git-ref update (no deploy step)      |
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
   | Language support         | JS, Rust (y-crdt)           | Rust, JS, Python, Go, Swift | Rust, JS/WASM, Swift           |

   **Why Loro wins for this system:**

   *a) Datom philosophy alignment.* Loro's Event Graph Walker stores the complete editing history as an append-only operation log where each op has a peer ID + counter — structurally equivalent to our [Entity, Attribute, Value, Tx, Op] model. Yjs actively garbage-collects history, which contradicts our "never delete, always append" principle. Automerge preserves history but at significantly higher memory and storage cost.

   *b) The Eg-walker architecture solves the typing-speed problem.* Unlike traditional CRDTs that maintain complex metadata structures on every operation, Eg-walker records only the original operation description (e.g., "insert at index 5"). The CRDT structure is reconstructed from history only when merging remote changes. This means local operations are essentially free (< 1ms), while the expensive CRDT math only runs when a peer sync arrives. This is ideal for our two-tier model where the CRDT handles real-time editing and PostgreSQL handles structured persistence.

   *c) Native tree and movable list CRDTs.* Our Canvas surface is a tree of blocks (headings, paragraphs, embedded cards, prompt/response pairs). Our Board surface needs drag-and-drop reordering. Loro provides LoroTree (hierarchical CRDT with move operations) and LoroMovableList (reorderable list as a CRDT operation). Yjs and Automerge have neither — you'd need to simulate moves with delete+insert, which can cause duplicates under concurrent editing.

   *d) Fork and merge enables the AI dual-loop pattern.* Loro supports `fork_at()` to create a branch and `import()` to merge it back — exactly like Git. This maps directly to our Model C architecture: the AI loop can fork a treatment plan document, propose edits on the fork, and the counselor reviews and merges (or discards) the branch. This is cleaner than Automerge's or Yjs's model where AI edits would be indistinguishable from human edits in the CRDT history.

   *e) NATS-friendly sync.* Loro's `export({ mode: "update", from: versionVector })` produces a compact binary diff. Publish to a NATS subject. Other clients call `import(bytes)`. No specialized sync server required. This integrates cleanly with the existing NATS event bus architecture.

   *f) Compact history storage.* Loro demonstrated 360,000+ operations stored in 361KB on disk and 8.4MB in memory with full time-travel capability. This means we can persist the raw Loro binary alongside structured datom extractions, giving us keystroke-level replay within a Canvas editing session without polluting the datom store with per-character facts.

   **Trade-offs accepted:**

   - Loro's editor ecosystem is younger than Yjs's. The loro-prosemirror binding exists but has fewer production references than y-prosemirror. Mitigation: ProseMirror/TipTap integration patterns are well-understood and the binding API is similar.
   - Loro uses WASM (~300KB bundle). Yjs is pure JS (~65KB). For a local-first desktop/tablet app this is acceptable. For a thin client portal, the WASM overhead needs consideration.
   - Loro is a younger project. Mitigation: MIT licensed, Rust core is high quality, active development, and the underlying Eg-walker algorithm has academic backing (Seph Gentle / Diamond-types research).

   **Integration pattern — the two-tier model:**

   The CRDT (Loro) and the datom store (PostgreSQL) serve different purposes and operate at different timescales:

   - **Tier 1 — Loro (hot layer):** Every keystroke, drag, and edit goes here. In-memory, < 1ms local ops. Syncs to peers via NATS binary updates. The Loro event graph is the "hot history" — full keystroke-level replay within an editing session.
   - **Tier 2 — Datoms (cold layer):** On commit (debounce, blur, save, session end), the commit bridge snapshots the LoroDoc, extracts structured metadata (themes, mood, interventions), and asserts datoms through the effectHandler. The datom log is the "cold history" — structured, queryable, AI-analyzable facts spanning the entire client journey.

   The Loro binary snapshot is stored as a blob value in a datom (`[:doc/42 :doc/content <loro-binary> tx:N true]`), preserving the ability to reconstruct the full editing timeline from any commit point. See section 6.3 for the complete data flow diagram.

2. **Local LLM sizing** *(deferred to config datom — see section 10.7)*

   Initial config: `[:config/llm-model :config/value "qwen3.5:8b" tx:1 true]`. Will be evaluated empirically during prototyping. The handler hot-swap model (section 10.2) allows switching models at runtime without code changes. Candidates: Llama 3.1 8B for general structuring, Qwen 3.5 models for multilingual (Swedish/Dutch/English) support. The right answer will change as models improve — the system handles this by design.

3. **Schema evolution: Schema-as-of-Tx** *(resolved)*

   **Decision:** No explicit version numbers on Types. The datom log's Tx dimension IS the version history. Schema changes are just more datoms — subject to the same append-only, time-traveling rules as all other data.

   **Core insight:** Traditional databases need migration scripts because the schema is a separate mutable structure that lives outside the data. In our system, the schema IS data. Schema evolution is not a special problem — it's just more datoms.

   **The four cases and how each is handled:**

   *a) Add attribute — zero migration:*
   Assert a new `:type/attr` datom with a `:attr/default` value. Old entities that lack a datom for this attribute → Surface renders the default. No backfill, no data changes.
   ```
   [:type/client  :type/attr  :client/preferred-lang   tx:5000  true]
   [:attr/preferred-lang  :attr/type     :enum          tx:5000  true]
   [:attr/preferred-lang  :attr/default  "sv"           tx:5000  true]
   ```

   *b) Remove attribute — retract from Type, data preserved:*
   Retract the `:type/attr` datom. The Surface stops rendering the attribute. Existing datoms remain in the log — they're historical facts. A time-travel query (as-of before the retraction) still shows them.
   ```
   [:type/client  :type/attr  :client/emergency-contact  tx:8000  false]
   ```

   *c) Rename attribute — alias via display-name:*
   Assert a `:attr/display-name` datom. The internal attribute ID stays stable (code and queries never break). The Surface renders the display name. For true renames (rare), add the new attribute with a `:attr/migrated-from` hint — the Surface falls back to the old attribute's value for entities that predate the change.
   ```
   [:attr/presenting-issue  :attr/display-name  "Referral reason"  tx:9000  true]
   ```

   *d) Change attribute type — schema-aware rendering per Tx:*
   Retract the old type, assert the new type. The Surface checks the attribute type contemporary to each datom's Tx: old data renders with its original type, new data with the new type. Both coexist without data conversion.
   ```
   [:attr/mood-pre  :attr/type  :text   tx:1     true]
   [:attr/mood-pre  :attr/type  :text   tx:9500  false]
   [:attr/mood-pre  :attr/type  :enum   tx:9500  true]
   [:attr/mood-pre  :attr/enum-range  [1,10]  tx:9500  true]
   ```

   **Why explicit version numbers are unnecessary:** The Tx on each schema datom IS the version. "Show me Type:client as of 6 months ago" is just `query(schema-datoms, as-of: tx)`. Explicit version numbers would group unrelated changes together and add a concept that the datom model already provides through its time dimension.

   **Trade-off accepted:** The Surface rendering logic must be schema-aware per Tx for the type-change case (case d). This adds complexity to the rendering pipeline — each datom's Value is interpreted according to the attribute schema contemporary to its Tx. For a counseling practice where type changes are rare (maybe once or twice a year), this complexity is minimal and well-contained.

4. **Consent model: Consent-as-datom with Seal** *(resolved)*

   **Decision:** Consent is a first-class datom with full Why chain. It controls the Seal — the combination of Lens (what's visible) and cryptographic key (what's decryptable) — that governs each role's access.

   **How consent works:**

   Every privacy decision is stored as datoms in the same append-only log as everything else:

   ```
   [:consent/c1  :consent/client      :client/42                              tx:100  true]
   [:consent/c1  :consent/scope       :ai-analysis                            tx:100  true]
   [:consent/c1  :consent/granted-by  :identity/maria                         tx:100  true]
   [:consent/c1  :consent/valid-from  2026-03-13                              tx:100  true]
   [:consent/c1  :consent/why         "Discussed benefits, Maria opted in"    tx:100  true]
   ```

   Revoking consent = asserting a retraction datom (same pattern as any datom change):

   ```
   [:consent/c1  :consent/scope  :ai-analysis  tx:500  false]  ← retract
   ```

   **Effect on encryption keys:** The AI agent's key for a client is derived from the consent transaction: `ai_key = HKDF(client_key, "ai:" + consent_tx)`. When consent is revoked, the consent_tx changes, so the AI key changes. The old key is discarded. New data encrypted with the client key is no longer decryptable by the AI agent. Old AI-generated datoms remain in the log (auditable) but the agent cannot generate new ones.

   **Consent scopes defined:** ai-analysis, transcription, portal-access, data-sharing, supervisor-review. Each scope is independent — a client can consent to portal access but not AI analysis.

5. **Regulatory compliance: Patientdatalagen + GDPR** *(resolved — architecturally addressed, legal review still recommended)*

   **Decision:** The architecture satisfies the key regulatory requirements by design. A formal legal review is recommended before production use, but the structural compliance is strong.

   **How each requirement is met:**

   | Requirement (Patientdatalagen / GDPR) | How the architecture addresses it |
   |----------------------------------------|-----------------------------------|
   | Confidentiality of patient data | Selective Value encryption with per-client AES-256-GCM keys. Entity/Attribute cleartext for routing; sensitive content encrypted at rest. |
   | Access restricted to authorized personnel | Four roles (counselor, client, ai-agent, system) with Seal-enforced access. Each role holds only the keys it needs. System layer cannot decrypt any Values. |
   | Audit trail of access and changes | Every datom is immutable with Tx timestamp. The Why chain records who did what, when, and why. Consent changes are datoms. AI actions are tagged `:tx/source :ai`. |
   | Data controller responsibility | Counselor holds the master key. All data is local-first on the counselor's machine. No third-party data transfer unless explicitly chosen. |
   | Right to erasure (GDPR Art. 17) | Datom Values can be re-encrypted with a destroyed key (crypto-shredding). The Entity/Attribute skeleton remains for audit trail integrity, but Values become permanently unrecoverable. |
   | Data minimization | Attribute schema marks fields as sealed (sensitive) or cleartext (operational). Only necessary operational metadata is exposed. |
   | Data protection impact assessment | Required for health data processing. The local-first, per-client encryption architecture significantly reduces the risk profile compared to cloud-based alternatives. |
   | AI-in-therapy legislation (emerging) | AI agent operates in draft-only mode (:tx/source :ai, :tx/status :pending). Counselor approval required for all AI-generated content. AI cannot make independent therapeutic decisions. Consent required per-client for AI analysis. |

   **Strongest compliance position:** Because all data resides locally on the counselor's machine and no patient data is transmitted to third-party servers (including AI providers for the local LLM path), the system avoids the most common GDPR compliance failures in healthcare — unauthorized third-party data transfer and inadequate data processing agreements.

   **Remaining action:** Engage a Swedish healthcare data protection lawyer to review the architecture document, confirm the Patientdatalagen interpretation, and advise on any registration or notification requirements for the practice.

6. **Voice UX** *(deferred to config datom — see section 10.7)*

   Initial config: `[:config/voice-ux :config/value "push-to-talk" tx:1 true]`. Will be evaluated with the counselor during user testing. Push-to-talk is the safest default (no ambient listening). Can be switched to wake-word or ambient at runtime via config datom change.

7. **Surface morphing implementation** *(deferred to config datom — see section 10.7)*

   Initial config: `[:config/surface-lib :config/value "react-dom" tx:1 true]`. The handler/dispatcher model (section 10.2) allows the Surface rendering layer to be swapped (e.g., react-dom → react-native) by registering new handler modules and toggling feature flags. The Lens and datom layers are renderer-agnostic — only the Surface layer needs to change.

8. **Encryption at rest: Selective Value encryption with deterministic key derivation** *(resolved)*

   **Decision:** Per-datom selective Value encryption using AES-256-GCM, with deterministic key derivation from a single counselor passphrase. FileVault provides defense-in-depth as the outer encryption layer.

   **Architecture summary:**

   The Seal model provides three layers of the encryption design:

   *Layer 1 — Key derivation (no key storage):*
   - Counselor passphrase → PBKDF2 (600,000 rounds, with salt) → master key (in memory only)
   - Per-client key: `HKDF(master, "client:" + client_id)` — deterministic, computed on demand
   - Portal key (for client access): `HKDF(client_key, "portal")` — delivered to client at intake via QR code or magic link
   - AI agent key: `HKDF(client_key, "ai:" + consent_tx)` — bound to consent, invalidated on revocation
   - No key database, no key file, no key server. Keys exist only in memory during a session.

   *Layer 2 — Selective encryption:*
   - Attribute schema defines which attributes are sealed: `[:attr/client-name :attr/sealed true tx:1 true]`
   - Sealed attributes: `:client/name`, `:client/contact-info`, `:session/recap`, `:session/themes`, `:client/risk-level`, `:plan/goal`, all rich-text content
   - Cleartext attributes: `:client/status`, `:session/date`, `:schedule/next-date`, `:session/type` — operational metadata needed for routing, indexing, and scheduling
   - Entity, Attribute, Tx, and Op fields are always cleartext — PostgreSQL can index and query on these without decrypting

   *Layer 3 — Search over encrypted data:*
   - Client-side in-memory search index, built on login by decrypting searchable fields (name, status, presenting issue)
   - 100 clients × 3 fields = 300 decryptions = ~10-30ms on Apple Silicon
   - Index maintained in real-time via NATS subscription (new/changed datoms decrypted and inserted incrementally)
   - PostgreSQL never receives search queries for encrypted content — all filtering happens in the browser/app
   - Future optimization: encrypted index blob (entire search index encrypted with master key, persisted to disk for faster cold start)

   *Defense-in-depth:*
   - FileVault (macOS full-disk encryption) as the outer layer — protects against physical theft when the machine is off
   - Per-client Value encryption as the inner layer — protects against unauthorized access even if the disk is mounted (e.g., compromised system process, future multi-user scenario)
   - On logout/sleep: master key and all derived keys are wiped from memory. Only the passphrase can regenerate them.

   **Trade-offs accepted:**
   - Cleartext Entity/Attribute fields reveal the *structure* of the data (that client:42 has a session on a given date) but not the *content* (who client:42 is or what was discussed). For a single-counselor local-first practice, this metadata exposure is acceptable. For a multi-counselor or cloud-hosted scenario, Entity IDs could be pseudonymized.
   - The counselor's passphrase is the single point of trust. If forgotten, all encrypted data is unrecoverable. Mitigation: standard recovery phrase pattern (12-word BIP39 mnemonic generated at setup, stored offline by the counselor).
   - Per-datom encryption adds CPU overhead on read. At the scale of a counseling practice (hundreds, not millions, of datoms per session), this overhead is negligible — AES-256-GCM on Apple Silicon runs at GB/s.
   - Portal key delivery (QR code or magic link) requires a one-time in-person or secure-channel exchange. This is actually a feature for a counseling practice — it happens naturally at the intake session.

---

## 13. Next Steps

1. **Define the Type schema** for the three primary entity families in detail (attributes, types, validations, relations).
2. **Prototype the datom store** in PostgreSQL — table design, index strategy, query patterns.
3. **Define the first contracts** — schema contracts for client/session/plan entities, effect contracts for the session recap flow.
4. **Build the dispatcher** — the runtime core that resolves handlers from datoms, checks feature flags, and enforces contracts.
5. **Prototype the NATS signal structure** — which subjects for signals, how the AI loop subscribes, how Surfaces get reactive updates.
6. **Build the first Surface** — start with Card mode for a client entity. Prove the Lens → datom → render pipeline.
7. **Build the first handler** — session recap (voice → Whisper → LLM → structured datoms) with contract validation.
8. **Build the first MCP server** — `mcp-clients` as the bridge between Claude/LLM and the datom store.
9. **Set up the git-integrated handler workflow** — handler registration datoms, feature flag datoms, hot module reload.
10. **Test with the counselor** — mock data, real workflow, feature-flagged per client, iterate on Surface modes and morphing.
11. **Legal review** — engage a Swedish healthcare data protection lawyer to confirm Patientdatalagen compliance.
