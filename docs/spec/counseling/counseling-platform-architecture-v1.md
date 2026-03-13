# Counseling Practice Platform — Architecture Document

**Version:** 0.4 (Draft)
**Date:** 2026-03-13
**Authors:** Piet (Technical Lead & Architect), Claude (Strategic Thought Partner)
**Status:** Brainstorm → Concept Definition (6 of 8 questions resolved)

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

## 10. Open Questions

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

2. **Local LLM sizing:** Which models fit comfortably on a MacBook Pro for structuring session notes? Llama 3.1 8B via Ollama is the baseline. Qwen 3.5 models are promising for multilingual (Swedish/Dutch/English) support.

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

6. **Voice UX:** Push-to-talk vs. wake word vs. ambient. Each has different privacy and UX implications. Needs user testing with the counselor.

7. **Surface morphing implementation:** CSS-based animated transitions vs. React layout animations. TanStack Router integration for deep-linkable surface states.

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

## 11. Next Steps

1. **Define the Type schema** for the three primary entity families in detail (attributes, types, validations, relations).
2. **Prototype the datom store** in PostgreSQL — table design, index strategy, query patterns.
3. **Prototype the NATS topic structure** — which subjects, how the AI loop subscribes, how Surfaces get reactive updates.
4. **Build the first Surface** — start with Card mode for a client entity. Prove the Lens → datom → render pipeline.
5. **Wire Whisper.cpp** — voice-to-text pipeline running locally.
6. **Build the first MCP server** — `mcp-clients` as the bridge between Claude/LLM and the datom store.
7. **Test with the counselor** — mock data, real workflow, iterate on Surface modes and morphing.

---

*This document is a living artifact. It will evolve as we prototype, test, and learn.*
