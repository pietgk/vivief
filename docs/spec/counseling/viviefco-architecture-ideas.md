# ViviefCo Counseling App — Architecture Ideas

**Purpose:** Brainstorm 4 architecture alternatives that are simpler and more portable than the v2 PostgreSQL + NATS design, run on MacBook, browser, and phone, and showcase vivief's core concepts (datoms, effectHandler, dual-loop AI, Contract-driven development).

**Status:** Brainstorm — for filtering before detail work.

---

## Who uses what surface

This clarification changes the architecture significantly:

| Actor     | Primary surface          | Data access                             |
|-----------|--------------------------|-----------------------------------------|
| Counselor | MacBook native app       | Full access — owns all Hypercores       |
| Client    | Browser (portal)         | Own data only — portal key, read + limited write |
| Counselor | Phone (between sessions) | Full access — sync with MacBook         |

**The browser is the client portal, not the counselor UI.** The counselor never needs the browser version of the app. The browser is for clients: check-ins, homework review, upcoming appointments, secure messages. This is a restricted, read-heavy surface backed by the client's own Hypercore.

This reframes the browser constraint entirely. The question is not "how does the counselor's full app run in a browser" — it's "how does a client's portal connect to their data." Much simpler. Much smaller surface area. And the data never needs to leave the counselor's machine.

---

## The core constraints driving the alternatives

The v2 counseling architecture (PostgreSQL + NATS + DuckDB) is powerful but heavy. The goal here is to find a combination that:

1. Counselor app runs on MacBook (native) and phone (sync with MacBook)
2. Client portal runs in a browser — restricted view of one client's own data
3. Local-first by default — all data lives on the counselor's machine
4. Demonstrates vivief's architectural ideas in a real production app

The table below maps each alternative to what changes vs. v2:

| Layer           | v2 (baseline)        | What all 4 alternatives share   |
|-----------------|----------------------|----------------------------------|
| CRDT hot layer  | Loro                 | Loro (unchanged — WASM runs everywhere) |
| Reactivity / UI | TanStack DB + React  | TanStack DB + React (unchanged) |
| Encryption      | AES-256-GCM + HKDF   | Web Crypto API (same, runs in browser) |
| effectHandler   | TypeScript           | TypeScript (unchanged) |
| Contract system | Runtime validation   | Runtime validation (unchanged) |
| Dual-loop AI    | Ollama + Claude API  | Ollama locally, WebLLM in browser |
| **Datom store** | **PostgreSQL**       | **← this is what changes** |
| **Event bus**   | **NATS**             | **← this is what changes** |
| **Analytics**   | **DuckDB (separate)**| **← varies** |

The NATS event bus becomes an in-process event emitter for single-device scenarios (a simple `EventTarget` or tiny pub/sub). Multi-device sync is handled differently in each alternative.

---

## Clarifications needed before choosing

**Q1. Multi-device shape.** MacBook primary + phone secondary? Or does the counselor work from phone as a primary device sometimes?

**Q2 (updated). Client portal reachability.** The client portal runs in the client's browser. Two sub-questions:
- Does the client access the portal from anywhere (home, between sessions) — requiring the counselor's machine to be reachable over the internet?
- Or only from the same network as the counselor (e.g., in-office check-in)?

This is the key reachability question. If internet-reachable is required, the counselor's MacBook either needs a static IP / Tailscale VPN, or a relay (Hyperswarm relay or small proxy) — but the data still never leaves the counselor's machine in plaintext.

**Q3. Phone: native or PWA?** React Native (Expo) gives access to native storage and Hypercore directly. A PWA has more constraints. For the counselor's phone, native is probably worth it.

**Q4. Offline first priority.** Can the client check in when offline (i.e. queue locally and sync later)? Or is a live connection to the counselor's machine always required for check-ins?

**Q4. Offline first priority.** How critical is working with no internet? (a) "Nice to have — usually has connectivity", (b) "Must work offline — poor clinic WiFi", (c) "Must work offline and sync with another device when reconnected."

**Q5. Multi-counselor future.** Will this ever be a clinic app (multiple counselors sharing some data, separate client lists)? Or always single-counselor? This affects whether sync needs to be P2P or just personal cross-device.

**Q6. vivief demo focus.** Which vivief concepts should the architecture showcase most prominently?
- (a) The devac DuckDB/Parquet pattern — architecture-as-data
- (b) The effectHandler + Contract-driven development model
- (c) The dual-loop AI pattern (human approves, AI proposes)
- (d) Local-first privacy model (Seal / encryption)
- (e) All of the above — the counseling app IS the reference implementation

---

## The four alternatives

---

### Alternative 1: SQLite-Everywhere

**One sentence:** Replace PostgreSQL with SQLite. Keep every other concept from v2 exactly as-is.

**Core idea:**

SQLite now runs everywhere — natively on MacBook, as WASM via OPFS in browsers, and natively on phones. The datom table from v2 section 6.4 translates 1:1 to SQLite (same columns, same indexes, same DatomQuery → SQL). The only thing that changes is the connection driver.

```
MacBook:  better-sqlite3 (Node.js, sync, ~1M reads/s)
Browser:  wa-sqlite + OPFS (WASM, persistent, ~100K reads/s)
Phone:    op-sqlite (React Native, sync, near-native speed)
```

NATS disappears. The event bus for single-device is just a JavaScript `EventTarget` — handlers publish events, Surfaces subscribe. If multi-device sync is needed later, cr-sqlite adds CRDT-based merge to SQLite without changing the schema.

Analytics: DuckDB WASM has a built-in SQLite scanner — it can read the SQLite file directly for trend queries. No Parquet needed unless you want cold archival storage.

**What this preserves from v2:** Everything. All the architecture work done in v2 (DatomQuery API, dispatcher, contracts, handler datoms, Seal) ships unchanged. The only refactor is the storage driver.

**What this is for vivief:** The counseling app becomes a reference implementation of the vivief effectHandler pattern running on SQLite. The DuckDB analytics layer (already used by devac) can attach to the SQLite datom store and run the same Parquet-export pipeline as devac seeds.

**Key tradeoffs:**

| | |
|---|---|
| ✓ | Lowest risk. Fastest to first prototype. |
| ✓ | Exact same schema and DatomQuery API as v2. |
| ✓ | Browser OPFS is now production-grade (Chrome 102+, Firefox 111+, Safari 15.2+). |
| ✓ | cr-sqlite adds P2P-style sync later without schema changes. |
| ~ | pgvector becomes sqlite-vss (vector search). Works, slightly less mature. |
| ~ | NATS's fan-out (multiple subscribers) needs a small in-process pub/sub library. |
| ✗ | Phone: DuckDB WASM + React Native is untested in production. Analytics on phone may need a compromise. |

**Open question for this alternative:** Does DuckDB WASM work well enough in React Native (via JSI) for the analytics queries? Or do we skip analytics on phone entirely and run them only on MacBook/browser?

---

### Alternative 2: DuckDB + Parquet as the Primary Datom Store

**One sentence:** Use DuckDB WASM as both the transactional datom store and the analytics engine, with Parquet files as the durable format — exactly what devac does, applied to application data.

**Core idea:**

This closes the loop between devac and the counseling app. devac already stores code analysis data as datoms in Parquet files, queried by DuckDB. The counseling app uses the same pattern for its application data.

```
Durable storage: Parquet files on local filesystem / OPFS / device storage
Query engine:    DuckDB WASM (browser), DuckDB native (MacBook), DuckDB WASM (phone)
Hot layer:       Loro CRDT (unchanged)
```

The datom log is append-only Parquet. Each commit-bridge crossing writes a new Parquet "segment" file. DuckDB scans across all segments for queries (exactly like devac's seed files). Periodic compaction merges small segments into larger ones.

The DatomQuery API from v2 compiles to DuckDB SQL (barely different from PostgreSQL SQL — mostly the same). The big win: analytics and transactional queries use the same tool, the same file format, and the same SQL dialect. No separate analytics pipeline.

For the vivief demo: the devac MCP tools can query the counseling datoms directly. The counseling app's data is in the same format as a devac seed — the boundary between "code data" and "application data" disappears. Everything is datoms in Parquet.

```
Sync story: Parquet files are just files.
→ iCloud Drive / Dropbox for personal multi-device sync
→ S3-compatible bucket for team sync
→ git LFS for versioned snapshots
No special sync protocol needed.
```

**Key tradeoffs:**

| | |
|---|---|
| ✓ | Direct alignment with devac patterns — vivief concepts are demonstrable across both tools. |
| ✓ | DuckDB WASM runs in browser today (duckdb-wasm). |
| ✓ | Parquet files are portable, inspectable, versionable. |
| ✓ | Analytics and transactional queries in one tool. |
| ✓ | Sync via file systems — no protocol complexity. |
| ~ | DuckDB is OLAP-optimized. Write throughput is lower than SQLite for individual INSERTs. The two-tier model mitigates this (batched writes only). |
| ~ | DuckDB WASM on React Native is not yet production-grade. Needs validation. |
| ✗ | No native vector index in DuckDB (yet — it's coming). Semantic search needs a workaround. |
| ✗ | Real-time multi-user writes to Parquet require careful segment management (concurrent writes to the same file are unsafe). |

**Open question for this alternative:** What is the actual write latency of DuckDB WASM in a browser for batched INSERT of 10-50 datoms? The two-tier model means writes are batched (not per-keystroke), but the commit bridge fires every 2 seconds during active editing. Is that within DuckDB WASM's comfortable write budget?

---

### Alternative 3: Loro-Native — Remove the Two-Tier Model

**One sentence:** Loro is not just the hot layer — it IS the store. The commit bridge goes away. Loro's event graph is the datom log.

**Core idea:**

The two-tier model (Loro hot + PostgreSQL cold) exists to solve the "datom per keystroke is not viable" problem. But what if we embraced Loro as the entire data model? Loro's event graph is already an append-only operation log. Each Loro operation is `[peer_id, counter, operation_type, path, value]` — structurally equivalent to a datom `[E, A, V, Tx, Op]`.

Instead of extracting structured data from Loro and writing it to PostgreSQL, we query Loro documents directly. The DatomQuery API becomes a query over Loro's in-memory data structure rather than SQL.

```
Data model:
  Each client entity → one LoroDoc
  Attributes → Loro Map keys
  Rich text → Loro Text or Tree
  Collections → Loro List

Query:
  state.query({ entity: 'client:42' })
  → read from LoroDoc('client:42').toJSON()

  state.query({ attribute: ':session/*' })
  → scan all 'session' LoroDoc instances

Storage:
  Loro binaries persisted to OPFS (browser),
  filesystem (MacBook), device storage (phone)

Sync:
  Loro's built-in binary diff sync
  → over WebSocket, WebRTC, BLE, or any transport
```

Privacy / Seal: Instead of per-attribute encryption, encrypt the entire Loro binary per-client with AES-256-GCM. The Seal becomes a document-level encryption envelope. Simpler to implement, slightly less granular (can't expose cleartext metadata while keeping values encrypted — the whole document is either decryptable or not).

For analytics (DuckDB layer): periodically export Loro documents to Parquet/JSON. DuckDB runs analytics over the exported snapshots. Less real-time than v2 but acceptable for trend analysis.

**What this removes:** The commit bridge, the datom table, the PostgreSQL DDL, the two-tier complexity. The system becomes: Loro + OPFS + DuckDB (analytics only).

**What this is for vivief:** Demonstrates that the effectHandler pattern works over a CRDT store, not just a relational store. A more radical claim: "the data model IS the CRDT." Potentially very compelling for the vivief demo.

**Key tradeoffs:**

| | |
|---|---|
| ✓ | Runs natively in browser (Loro WASM), on MacBook (Loro JS or Rust), on phone (Loro WASM in RN). |
| ✓ | Sync is Loro's job — well-designed, binary-diff based. |
| ✓ | Eliminates the two-tier model and commit bridge entirely. |
| ✓ | Maximum simplicity — one library for storage, CRDT, sync, and time travel. |
| ~ | DatomQuery over Loro's data structure requires reimplementing the SQL compilation layer as Loro traversals. More work upfront. |
| ~ | Relational queries ("find all clients with risk-level=high") are less natural over Loro's document model. Needs a thin materialization index. |
| ✗ | Seal granularity is coarser — document-level encryption, not attribute-level. The "E, A cleartext for routing" property of v2 is lost. |
| ✗ | DuckDB analytics only over snapshots, not the live log. Time-travel is Loro's checkout() — good for document-level, awkward for cross-entity queries. |

**The key question for this alternative:** Is the DatomQuery API's relational nature (cross-entity queries, attribute-level filtering) compatible with Loro's document-oriented model? Or does this require a hybrid — Loro for document data, a lightweight in-memory index for cross-entity queries?

---

### Alternative 4: Hypercore + In-Memory — No Database, No Server, Across Both Apps

**One sentence:** Hypercore replaces Parquet files everywhere in the vivief ecosystem — both in the counseling app and in devac — making the in-memory datom store the universal query layer across both tools.

**Core idea:**

This goes further than the counseling context. The insight is that Parquet files in devac and the datom store in the counseling app are solving the same problem: durable, append-only storage for datoms. Hypercore is the single format that works for both.

In devac today: each `devac sync` writes `nodes.parquet` + `edges.parquet` seeds per package. The hub aggregates them via DuckDB SQL views.

In the Hypercore model: each `devac sync` appends datoms to a per-repo Hypercore. The hub becomes an in-memory datom store that replays the Hypercore logs from all repos. The counseling app's client/session data lives in separate Hypercores (one per client, following the Seal model).

```
MacBook:  Hypercore (Node.js)
Phone:    Hypercore (Pear mobile runtime or React Native bridge)
Browser:  ← requires companion process or Electron (see below)

In-memory store (4 indexes):
  entity index:    Map<EntityId, Attribute[]>      — "give me everything about client:42"
  outbound edges:  Map<EntityId, Edge[]>           — "what does session:87 call/reference?"
  inbound edges:   Map<EntityId, Edge[]>           — "what uses function:handleClick?"
  name index:      Map<name, EntityId[]>           — "find all symbols named 'dispatch'"

Rebuilt by replaying Hypercore logs on startup.
Updates on every append: O(1) index insert.
Reads: O(1) to O(k) where k = result size.
```

**Why the devac graph queries are better in-memory than DuckDB CTEs:**

The devac `query_deps` and `query_dependents` tools are currently implemented as 30-line recursive CTEs in `packages/devac-core/src/queries/graph.ts`. CTEs are SQL's hack for graph traversal — they force a naturally recursive algorithm into tabular form. In-memory, the same query is:

```typescript
function findDeps(entityId, maxDepth, edgeType?) {
  const visited = new Set()
  const result = []
  const queue = [{ id: entityId, depth: 0 }]
  while (queue.length) {
    const { id, depth } = queue.shift()
    if (visited.has(id) || depth >= maxDepth) continue
    visited.add(id)
    for (const edge of outbound.get(id) ?? []) {
      if (!edgeType || edge.type === edgeType) {
        result.push({ ...edge, depth: depth + 1 })
        queue.push({ id: edge.target, depth: depth + 1 })
      }
    }
  }
  return result
}
```

10 lines. Cycle detection is `Set.has()`. No ARRAY type, no UNION ALL, no JOIN. The existing `affected-analyzer.ts` in devac already proves this pattern — the cross-repo affected analysis is already in-memory BFS (Breadth-First Search — the standard graph traversal algorithm), not SQL. This just extends that pattern inward.

*BFS = Breadth-First Search. It is the graph traversal algorithm: start from a node, visit all immediate neighbors, then their neighbors, level by level, until you reach max depth or exhaust the graph. The in-memory graph store is just the data structure (Map indexes) that BFS runs over — BFS is the query algorithm, not the store type.*

The three devac query categories in-memory:
- **Simple lookups** (symbol by name, file symbols, diagnostics by severity): trivial Map index lookups — `O(1)`
- **Graph traversal** (deps, dependents, call-graph): BFS over Map indexes — simpler and faster than recursive CTEs
- **Aggregations** (schema stats, diagnostics counts): one-pass array reduce — slightly more code than GROUP BY, but these are infrequent queries

**Only meaningful loss:** `query_sql` raw SQL passthrough. Mitigation: DuckDB WASM kept as an optional analytics overlay on top of the in-memory store, for historical trend queries and ad-hoc SQL.

**Hypercore vs Parquet for devac:**

devac's current branch delta model (`branch: "base" | "delta"`) is a manual version of what Hypercore gives you natively. A retraction datom IS the delta. The incremental sync story becomes: append new datoms + retractions on each `devac sync`. No special-case branch logic needed.

Scale for devac hub: ~250K datoms per large TS project × 10 repos = ~2.5M datoms ≈ 500MB RAM. Startup replay ≈ 1 second. Fine for a dev machine. The IPC model (MCP owns the store, CLI routes via Unix socket) stays unchanged.

**Privacy alignment for the counseling app:** Hypercore's public-key model maps directly to the Seal. Each client's data lives in a separate Hypercore with a separate key pair. The counselor holds all private keys (master key → HKDF per-client). Only the counselor can read all Hypercores. A client portal key gives read-only access to one Hypercore. This is enforced by Hypercore's cryptography — not application-level access control.

**The browser is the client portal — and this changes the browser problem entirely.**

Since the browser is for clients (not counselors), the question shifts from "how does the full app run in a browser" to "how does a client's restricted portal connect to their Hypercore." The client portal is read-heavy (view homework, check in, see appointments) and much smaller than the counselor UI.

**Option A — Web server as a feature of the counselor's app (preferred for now):**

The counselor's app includes a lightweight HTTP + WebSocket server as a built-in feature. When the counselor enables "client portal," a server spins up on a local port. The client's browser connects to it.

```
Counselor's MacBook
  ├── Hypercore + in-memory store  (the data layer)
  ├── Counselor UI  (React native app / Electron)
  └── Client portal server  (built-in Express/Hono WebSocket server)
        │  serves the portal React app (static files)
        │  WebSocket: client sends portal key → server decrypts client's Hypercore
        │  → streams only the client's own datoms to the browser
        └── Client's browser connects via:
              - Local network (same office WiFi)
              - Tailscale (counselor enables VPN, client gets invite link)
              - Port forward / reverse proxy (counselor's domain name)
```

The portal server never decrypts on the wire — the client's portal key is held by the client's browser (delivered at intake via QR code, stored in `localStorage`). The server sends the client's encrypted Hypercore data; the browser decrypts locally using the portal key and Web Crypto API. The server only sees ciphertext, same as the Seal model in v2.

**Option B — Hyperswarm relay (no open port on the counselor's machine):**

A tiny relay server (run anywhere — even a $5 VPS or a shared relay pool) acts as a Hyperswarm DHT bridge. The counselor's machine connects to the relay as a Hyperswarm peer. The client's browser connects to the same relay via WebSocket. The relay forwards encrypted bytes between them — it sees only ciphertext and cannot read the data.

```
Counselor's MacBook  ←──encrypted bytes──→  Relay  ←──WebSocket──→  Client's browser
```

This means the counselor's machine doesn't need a static IP or open port. The relay is infrastructure, not a server — it holds no data, cannot decrypt anything, and can be shared across many counselor instances. It's essentially a TURN server for Hyperswarm.

**Option C — Wait for Holepunch browser support.** Holepunch is actively working on this. When available, the client's browser connects directly to the counselor's Hypercore peer-to-peer without any relay.

**For now, Option A is simplest.** The web server is a feature of the counselor's app, not separate infrastructure. Tailscale gives internet reachability without port forwarding or a cloud server. Option B becomes attractive when the counselor doesn't want to manage network access or when serving many clients. Option C is the end state.

**What this is for vivief:** The most coherent platform story. devac seeds, counseling app data, and platform metadata are all datoms in Hypercores. The in-memory datom store is the universal query layer. The MCP tools for devac and for the counseling app speak the same DatomQuery language over the same data primitive. The demo shows one model — datom + Hypercore + in-memory index — running across code analysis and application domains simultaneously.

**Key tradeoffs:**

| | |
|---|---|
| ✓ | Hypercore replaces Parquet in devac — one format across the entire vivief ecosystem. |
| ✓ | Graph queries (deps, affected, call-graph) are simpler and faster in-memory than DuckDB CTEs. |
| ✓ | No server, no cloud, no database — maximum privacy for healthcare data. |
| ✓ | P2P sync between MacBook and phone without internet (same WiFi or BLE). |
| ✓ | Hypercore's key model maps directly to the Seal — privacy enforced by cryptography. |
| ✓ | devac's affected-analyzer.ts already proves the in-memory BFS pattern works. |
| ~ | Hypercore's Bare runtime is separate from Node.js. Electron-like deployment, not a standard Node server. |
| ~ | DuckDB WASM kept as optional analytics overlay for `query_sql` and historical trend queries. |
| ~ | Client portal browser: served from counselor's built-in web server (Option A) or via Hyperswarm relay (Option B). Not a hard blocker — a design choice. |
| ✗ | Replacing devac's Parquet seeds with Hypercore requires migrating the devac-core storage layer — not a small change. |
| ✗ | Multi-writer Hypercore (Autobase) adds complexity for multi-device writes to the same entity. |

---

## Quick comparison

| | Alt 1: SQLite | Alt 2: DuckDB+Parquet | Alt 3: Loro-Native | Alt 4: Hypercore |
|---|---|---|---|---|
| **Client portal in browser** | ✓ (OPFS) | ✓ (duckdb-wasm) | ✓ (Loro WASM) | ✓ (built-in web server or relay) |
| **Runs on phone** | ✓ | ~ (needs validation) | ✓ | ~ (Pear mobile) |
| **Offline-first** | ✓ | ✓ | ✓ | ✓ |
| **P2P sync** | ~ (cr-sqlite later) | ~ (file sync) | ✓ (Loro built-in) | ✓ (native) |
| **Keeps v2 DatomQuery API** | ✓ identical | ✓ minimal changes | ~ requires rework | ✓ (over in-memory) |
| **Analytics story** | DuckDB reads SQLite | DuckDB IS the store | DuckDB reads snapshots | DuckDB reads Parquet export |
| **devac alignment** | ~ (different store) | ✓✓ (same pattern) | ~ (different store) | ~ (different store) |
| **Complexity vs. v2** | ↓↓ simpler | ↓ simpler | ↓↓↓ simplest | ↔ different complexity |
| **Time to first prototype** | Fastest | Fast | Fast | Slower |
| **Privacy strength** | Strong | Strong | Strong | Strongest |
| **vivief demo story** | "works everywhere" | "data is data" | "CRDT is the store" | "one primitive, two apps" |

---

## What each alternative demonstrates as a vivief platform reference

Each alternative tells a different story about vivief's architectural principles:

**Alt 1 — SQLite-Everywhere** tells the story: *"The datom model is substrate-independent. The same concepts work on any SQL store. Swap the driver, keep the architecture."* Good demo of portability. The vivief effectHandler and Contract patterns are the stars.

**Alt 2 — DuckDB+Parquet** tells the story: *"Application data and code analysis data are the same thing. Everything is datoms in Parquet. devac and your app speak the same language."* The most compelling demo for vivief as a unified platform concept. The boundary between development tool and application disappears.

**Alt 3 — Loro-Native** tells the story: *"The CRDT event graph IS the database. Time travel is free. History is free. Sync is free. You don't need a separate store — Loro is enough."* The most minimalist. Good for showing that complex collaborative apps don't need complex infrastructure.

**Alt 4 — Hypercore** tells the story: *"One primitive — datom + Hypercore + in-memory index — runs devac's code analysis and the counseling app's clinical data. The boundary between development tool and application disappears. Every graph query that was a CTE is now just BFS."* The most architecturally ambitious and the most coherent vivief platform statement. Also the strongest privacy story for healthcare.

---

## Holepunch deep dive: full stack mapping and the most elegant patterns

*This section extends Alt 4 by mapping every component of the Holepunch/Pear ecosystem to a vivief architectural concept, identifying the 5 most elegant Holepunch-native patterns, and designing the in-memory store's embedded vs. daemon duality.*

---

### The full Holepunch stack mapped to vivief concepts

The Holepunch ecosystem has 12 modules. The mapping reveals which ones vivief needs, which ones it gets for free, and which ones replace things in v2.

| Holepunch module | What it is | vivief equivalent / role |
|---|---|---|
| **Hypercore** | Append-only log, cryptographically signed per-entry | Datom log — `[E, A, V, Tx, Op]` sequence per entity |
| **Hyperbee** | B-tree key-value store built *on top of* a Hypercore | Persistent index — eliminates startup replay cost |
| **Corestore** | Hypercore factory: master key → named Hypercores via key derivation | **The Seal** — one line replaces the entire HKDF key hierarchy |
| **Autobase** | Multi-writer causal DAG linearization | Multi-device sync + multi-counselor collaboration |
| **HyperDHT** | Kademlia DHT with holepunching | Peer discovery without servers |
| **Hyperswarm** | Connection management over HyperDHT | MacBook ↔ phone sync transport |
| **Protomux** | Protocol multiplexer over a single stream | IPC channel between daemon and UI (replaces Unix socket) |
| **Secretstream** | Encrypted stream (Noise protocol variant) | Transport layer encryption — wraps all Hyperswarm connections |
| **Hyperdrive** | Versioned filesystem over Hyperbee | Handler artifact store — `dist/handlers/session-recap.v2.mjs` |
| **Localdrive** | Local filesystem with same API as Hyperdrive | Dev mode — handler files on disk, same interface as Hyperdrive |
| **Mirrordrive** | Sync between Localdrive and Hyperdrive | `pnpm build:handler` → mirror built artifacts into Hyperdrive |
| **Bare** | Minimal JS runtime (V8/JSC/QuickJS, not Node.js) | Counselor app and data daemon runtime |
| **Pear** | P2P app runtime + deployment on top of Bare | App distribution — no App Store, no cloud, no installer |

What's **not** in the Holepunch stack (you bring these):
- In-memory datom store (you build this — 4 Map indexes)
- DatomQuery API (you build this — TypeScript typed builder)
- effectHandler pattern (you build this)
- Contract validation (you build this)
- Loro CRDT hot layer (external — runs on Bare via WASM)

---

### The 5 most elegant Holepunch-native patterns

#### Pattern 1: Corestore IS the Seal

The v2 Seal model describes a key derivation hierarchy: passphrase → PBKDF2 → master key → HKDF per-client. This maps exactly to Corestore's built-in design.

Corestore derives all writable Hypercore keypairs from a single master key plus a user-provided name. It uses deterministic derivation — the same master key + name always produces the same keypair.

```typescript
// v2 Seal model (manual HKDF implementation needed)
const masterKey = await pbkdf2(passphrase, salt, 100000, 32, 'sha256')
const clientKey = await hkdf('sha256', masterKey, '', `client:${clientId}`, 32)

// Holepunch model (zero implementation needed)
const store = new Corestore('./data', { masterKey })
const clientCore = store.get({ name: `client:${clientId}` })  // ← deterministically derived
```

This is not an approximation — Corestore's `get({ name })` internally performs exactly the HKDF derivation the Seal requires. The counselor holds one Corestore (one master key). Each client gets a core derived from that master key. A client's portal key is just the discovery key of their core — it cannot derive any other client's key.

**Seal = Corestore. Zero additional cryptographic code needed.**

#### Pattern 2: Hyperbee as the persistent index

Alt 4 described an in-memory store that replays all Hypercore logs on startup. For devac this is fine (~1 second for 2.5M datoms). For the counseling app with years of session history, startup replay could become slow.

Hyperbee solves this. It is a B-tree that *lives inside a Hypercore* — its index nodes are just Hypercore entries. The B-tree structure persists to disk. Queries (`bee.get(key)`, `bee.createReadStream({ gt, lt })`) read only the necessary B-tree nodes, not the entire log.

```typescript
// Two persistent structures per client entity:
const writeLog = store.get({ name: `client:${id}:log` })    // Hypercore — append-only datom log
const indexBee = new Hyperbee(store.get({ name: `client:${id}:index` }))  // Hyperbee — queryable index

// On sync commit: append datoms to writeLog + update indexBee
await writeLog.append(encode(datom))
await indexBee.put(`:client/risk-level`, 'high')   // attribute index
await indexBee.put(`tx:${txId}`, encode(datom))     // tx index

// On query (no startup replay needed):
const riskLevel = await indexBee.get(':client/risk-level')
const txHistory = indexBee.createReadStream({ gt: `tx:${from}`, lt: `tx:${to}` })
```

The in-memory store becomes a hot cache on top of Hyperbee — loaded only for the entities currently active in the UI, evicted when not needed. Hyperbee is the durability layer; the Map indexes are the speed layer.

**In-memory = hot cache. Hyperbee = cold index. No startup replay cost for large datasets.**

#### Pattern 3: Autobase for multi-device writes without conflicts

The counselor uses MacBook and phone. Both can write to the same client's data. Without Autobase, concurrent writes create merge conflicts.

Autobase's causal DAG model handles this natively. Each device has its own writer Hypercore. Autobase tracks causal dependencies between writes — it knows device B's write happened after device A's write based on explicit causal references. When both devices come back online, Autobase linearizes the concurrent writes deterministically.

```
MacBook writes:  [session-summary → tx:104]
Phone writes:    [check-in → tx:105]  (causal ref: nothing — written offline)

Autobase merge:  → linearizes to [session-summary, check-in] or [check-in, session-summary]
                   based on causal DAG analysis, deterministic across all peers
```

This is exactly the merge problem the two-tier model defers to "manual conflict resolution." Autobase makes it automatic.

For the vivief counseling app:
- Single counselor, single device: Autobase with one writer — just Hypercore, no overhead
- Single counselor, multi-device: Autobase with two writers (MacBook + phone)
- Future clinic mode: Autobase with N writers (one per counselor)

The API is the same for all three cases. Adding a writer is `autobase.addWriter(key)`. No architectural change needed to go from single to multi.

**Autobase = the sync story for multi-device, built into the data layer.**

#### Pattern 4: Hyperdrive for handler artifacts

The v2 handler hot-swap mechanism builds `.mjs` artifacts per version and loads them by file path. This works but couples handler deployment to the local filesystem.

Hyperdrive is a versioned filesystem over Hyperbee — it stores files by path, tracks versions, and can replicate over Hyperswarm. The handler module store becomes a Hyperdrive:

```typescript
const handlerDrive = new Hyperdrive(store.get({ name: 'handlers' }))

// Deploy a new handler version:
await handlerDrive.put('/session-recap/v2.mjs', builtModule)

// Dispatcher loads handler by path from Hyperdrive:
async function importHandler(name: string, version: string): Promise<Handler> {
  const buffer = await handlerDrive.get(`/${name}/${version}.mjs`)
  const blob = new Blob([buffer], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  const module = await import(url)
  return module.default
}

// Handler registration datom now points to Hyperdrive path:
{ entity: 'handler:session-recap-v2', attribute: ':handler/drive-path', value: '/session-recap/v2.mjs' }
```

The key benefit: handlers can be pushed to a phone over Hyperswarm without `git pull` or file system access. The counselor's MacBook and phone always run the same handler version because they share the same Hyperdrive.

**Hyperdrive = versioned handler module store, replicated to all devices automatically.**

#### Pattern 5: Protomux for IPC (replaces Unix socket)

devac's HubClient uses a Unix socket (`<workspace>/.devac/mcp.sock`) for IPC between the CLI and the MCP server. This is platform-specific (Windows needs named pipes) and requires socket file management.

Protomux multiplexes multiple typed protocol channels over a single stream. The "stream" can be a Unix socket, a WebSocket, a TCP connection, or a Hyperswarm connection. The protocol definition is just a list of message types:

```typescript
// Define a datom store protocol
const protocol = mux.createChannel({
  protocol: 'datom-store/1.0.0',
  messages: [
    { encoding: 'json' },   // 0: query request
    { encoding: 'json' },   // 1: query response
    { encoding: 'json' },   // 2: subscribe (push updates)
    { encoding: 'json' },   // 3: effect dispatch
  ]
})
```

The same Protomux channel definition works over any transport. When the UI and daemon are on the same machine, they use a local pipe. When the phone connects to the MacBook, they use a Hyperswarm connection — same Protomux protocol, different transport underneath. The HubClient pattern becomes transport-agnostic.

**Protomux = the IPC story that works locally and over P2P without code changes.**

---

### The in-memory store: embedded vs. daemon

This duality is the core architectural decision for the counseling app's data layer. Both modes use the same in-memory store code — the difference is *where the process lives*.

```
┌─────────────────────────────────────────────────────────────────┐
│ Mode A: Embedded (in-app)                                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Counselor App Process                                    │   │
│  │   ├── Bare runtime                                      │   │
│  │   ├── Hypercore / Corestore                             │   │
│  │   ├── Hyperbee indexes                                  │   │
│  │   ├── In-memory datom store (4 Map indexes)             │   │
│  │   ├── effectHandler + dispatcher                        │   │
│  │   └── React UI (rendered via Pear)                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Everything in one process. Direct function calls.             │
│  Zero IPC latency. Single-device use case.                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Mode B: Daemon (in-server)                                      │
│                                                                 │
│  ┌──────────────────────┐     Protomux IPC      ┌────────────┐ │
│  │ Data Daemon Process  │◄─────────────────────►│ Counselor  │ │
│  │  ├── Hypercore       │                        │ App (Pear) │ │
│  │  ├── Hyperbee        │     Protomux IPC      ├────────────┤ │
│  │  ├── In-memory store │◄─────────────────────►│ MCP Server │ │
│  │  ├── dispatcher      │                        ├────────────┤ │
│  │  └── Autobase        │     Hyperswarm         │ Phone App  │ │
│  └──────────────────────┘◄──────────────────────│ (remote)   │ │
│                                                  └────────────┘ │
│  Daemon owns the data. Clients connect via Protomux.           │
│  Multi-client: UI + MCP + phone all read the same live store.  │
└─────────────────────────────────────────────────────────────────┘
```

**When to use which mode:**

| Scenario | Mode | Why |
|---|---|---|
| Single counselor, single MacBook | Embedded | Simplest, no IPC overhead, fastest prototype |
| Counselor + phone sync | Daemon | Phone connects via Hyperswarm to daemon on MacBook |
| Counselor + MCP AI tools | Daemon | MCP server and UI share the same live data state |
| Multi-device + client portal | Daemon | Portal server is a Protomux client of the daemon |
| Future clinic (multi-counselor) | Daemon + Autobase | Daemon handles multi-writer merge |

The embedded mode is how you build and test. The daemon mode is how you run in production when multiple consumers (UI, MCP, phone, client portal server) need live access to the same data. The switch from embedded to daemon is a process boundary change — the store code itself doesn't change.

**This mirrors devac exactly.** devac's MCP server owns the hub (daemon mode). The CLI routes via IPC when MCP is running (HubClient). The counseling app data daemon IS the counseling equivalent of devac's MCP hub.

---

### Revised Alt 4 component picture

The full Holepunch-native Alt 4 looks like this:

```
vivief counseling app — full component picture

Storage layer (on disk / Bare FS):
  Corestore (master key)
    ├── client:42:log      ← Hypercore — datom append-only log
    ├── client:42:index    ← Hyperbee — persistent B-tree index
    ├── client:43:log      ← Hypercore
    ├── client:43:index    ← Hyperbee
    ├── handlers           ← Hyperdrive — versioned handler modules
    └── contracts          ← Hypercore — contract datoms

Hot layer (in memory, per active entity):
  Map<EntityId, Datom[]>       ← entity index
  Map<EntityId, Edge[]>        ← outbound refs
  Map<EntityId, Edge[]>        ← inbound refs
  Map<AttributeKw, EntityId[]> ← attribute index

Query layer:
  DatomQuery → Hyperbee range query (cold, persistent)
  DatomQuery → in-memory Map lookup (hot, for active entities)

Effect layer:
  Dispatcher → effectHandler → writeDatoms → appendToHypercore + updateHyperbee
  ContractValidator → validates DatomQuery invariants before commit
  Loro CRDT → hot editing layer, commit bridge → datoms

Sync layer:
  Autobase — multi-device write linearization
  Hyperswarm — peer discovery + encrypted transport (Secretstream)
  Protomux — IPC channels between daemon and clients

Client portal:
  Option A: data daemon includes built-in Hono WebSocket server
            client browser ← WebSocket ← daemon (portal endpoint)
  Option B: hyperswarm-dht-relay bridges browser ↔ daemon
            (browser uses dht-universal package)

Analytics (optional overlay):
  DuckDB WASM reads Hyperbee-exported Parquet snapshots
  OR reads Hypercore log directly via arrow serialization
```

---

### What this changes about Alt 4's tradeoffs

| Previous concern | Holepunch-native answer |
|---|---|
| "Hypercore startup replay can be slow for large datasets" | Hyperbee eliminates replay — queries go directly to B-tree |
| "Multi-device writes to same entity" | Autobase's causal DAG — deterministic linearization built in |
| "Seal = custom HKDF code" | Corestore key derivation IS the Seal — zero crypto code |
| "Unix socket IPC is platform-specific" | Protomux channels work on any transport |
| "Browser client portal is hard" | dht-universal + dht-relay works today (some known edge cases) |
| "Handler hot-swap tied to filesystem" | Hyperdrive gives versioned, P2P-replicated module store |

The remaining genuine concern: **Bare runtime is not Node.js.** The Bare JS ecosystem is smaller. `better-sqlite3`, many Node.js native modules, and some npm packages don't run on Bare. The counseling app would need to use the Holepunch-native equivalents or run compatibility shims. This is a real adoption cost.

Mitigation: start with Mode A (embedded) running in Node.js (Hypercore works fine in Node.js). Migrate to Bare/Pear when the app is mature and P2P deployment becomes the priority.

---

### The devac connection revisited

If the counseling app uses this Holepunch-native model, and devac migrates from Parquet to Hypercore, the full vivief platform stack unifies:

```
devac                           vivief counseling app
─────────────────────────────   ──────────────────────────────────
repo:vivief:log (Hypercore)     client:42:log (Hypercore)
repo:vivief:index (Hyperbee)    client:42:index (Hyperbee)
Corestore (devac master key)    Corestore (counselor master key)
In-memory graph store (BFS)     In-memory datom store
DatomQuery (code graph)         DatomQuery (clinical data)
MCP server (daemon mode)        Data daemon (daemon mode)
Protomux IPC (CLI ↔ MCP)        Protomux IPC (UI ↔ daemon)
```

Same primitive. Same query API. Same daemon pattern. Same IPC model. Different data, same architecture. The vivief platform concept — one model that works for code analysis and application data — becomes a concrete reality.

---

### Datoms vs. typed structs: the right model for nodes, edges, external-refs, and effects

The devac graph today uses four typed tables: `nodes`, `edges`, `external_refs`, and `effects`. The question is whether these should be rewritten as pure EAV datoms (following the counseling app model) or kept as typed structs — and whether the in-memory store needs to be "datoms all the way down" to achieve the unified platform story.

This is not a trivial question. Each table has distinct characteristics that affect how well the datom model fits.

---

#### Nodes → fits the datom model cleanly

A Node has 22 typed fields (entity_id, name, qualified_name, kind, file_path, start/end line/column, is_exported, visibility, is_async, is_generator, is_static, is_abstract, type_signature, documentation, decorators, type_parameters, properties, source_file_hash, branch, is_deleted, updated_at).

As pure EAV datoms, a node becomes ~22 datoms:
```
[node:abc123, :node/name,            "handleClick",       tx:1, true]
[node:abc123, :node/kind,            "function",          tx:1, true]
[node:abc123, :node/file,            "src/handlers.ts",   tx:1, true]
[node:abc123, :node/start-line,      42,                  tx:1, true]
[node:abc123, :node/is-async,        true,                tx:1, true]
[node:abc123, :node/is-exported,     true,                tx:1, true]
... etc
```

What this buys:
- **Schema evolution for free** — add `:node/complexity-score` by just writing the datom. No migration. The existing `properties: JSON` fallback field exists precisely because the typed schema can't evolve cheaply — datoms eliminate this escape hatch.
- **The `branch: "base" | "delta"` pattern becomes retraction ops** — instead of `is_deleted: true` (a mutation of a row), a deletion is a retraction datom: `[node:abc123, :node/kind, "function", tx:2, false]`. The history of every node is preserved automatically.
- **Incremental sync becomes append-only** — each `devac sync` appends new/changed node datoms. No UPDATE. No special delta file. The Hypercore append model is a perfect fit.

Cost: 22 datoms instead of 1 row. For 250K nodes: 5.5M datoms. At ~200 bytes per datom in memory: ~1.1GB — approaching the limit for a dev machine. Mitigation: only load node datoms for active files; keep the rest in Hyperbee. Or use attribute packing (see below).

**Verdict for nodes: pure datom model is the right long-term model.**

---

#### Edges → requires a design choice between three representations

An Edge has: source_entity_id, target_entity_id, edge_type, source_file_path, source_line, source_column, properties, source_file_hash, branch, is_deleted, updated_at.

Unlike a node (which is an entity with attributes), an edge is a *relationship between two entities* — and that relationship itself carries metadata (where in the source file it appears). This is the classic "relationship with attributes" problem in graph/entity modeling. Three options:

**Option E1: Ref datom (simple, loses metadata)**
```
[source:abc123, :edge/CALLS, target:def456, tx:1, true]
```
Pure and clean. But source_file_path, source_line, source_column are lost. For `query_deps` this is fine — you just need the graph structure. For "show me where this call happens in the code" (navigation, hover-to-definition), the location is essential.

**Option E2: Reified edge entity (full metadata, more datoms)**
Each edge becomes its own entity with a content-addressed ID:
```
[edge:sha256(src+type+target), :edge/source,  "node:abc123",       tx:1, true]
[edge:sha256(src+type+target), :edge/target,  "node:def456",       tx:1, true]
[edge:sha256(src+type+target), :edge/type,    "CALLS",             tx:1, true]
[edge:sha256(src+type+target), :edge/file,    "src/handlers.ts",   tx:1, true]
[edge:sha256(src+type+target), :edge/line,    42,                  tx:1, true]
```
5 datoms per edge. Full metadata. Can query: "find all edges from file X" or "find all CALLS edges originating at line 42." The in-memory indexes work naturally: `:edge/source` index maps to the outbound edge index.

For 1M edges: 5M edge datoms. Combined with 5.5M node datoms: ~10.5M total — about 2GB in memory. Still feasible for a dev machine; Hyperbee handles overflow for inactive repos.

**Option E3: Structured-value datom (practical compromise)**
```
[source:abc123, :edge/CALLS, { target: "def456", file: "src/handlers.ts", line: 42 }, tx:1, true]
```
One datom per edge. The V field is a structured object, not a scalar. This breaks the strict EAV scalar model — but for an in-memory store that never needs to be queried column-by-column in SQL, it's a practical choice. The in-memory outbound edge index stores these structured values directly:
```typescript
outbound.get('node:abc123')  // → [{ type: 'CALLS', target: 'node:def456', file: '...', line: 42 }]
```
This is what the in-memory store effectively does today with the existing `Edge` typed struct — it's just a structured datom with a named value.

**Verdict for edges: Option E3 for the in-memory store (practical, keeps existing edge semantics), with an Option E2 path available if full datom queryability on edge metadata becomes needed.** The 20 edge types (CALLS, IMPORTS, EXTENDS, CONTAINS, etc.) map cleanly to datom attributes: `:edge/CALLS`, `:edge/IMPORTS`, etc. — enabling "give me all CALLS edges from this entity" as a direct index lookup, not a scan.

---

#### External refs → fits perfectly as ref datoms

An ExternalRef links a source entity to an external module symbol (before resolution). After resolution, it becomes a ref edge to the target entity.

Two states:
```
-- Unresolved (import not yet matched to a cross-repo node):
[node:abc123, :imports/external, "@react::useState",   tx:1, true]
[node:abc123, :imports/style,    "named",              tx:1, true]
[node:abc123, :imports/line,     15,                   tx:1, true]

-- Resolved (semantic pass matched it to a real entity):
[node:abc123, :edge/IMPORTS,  "ext:react:function:useState", tx:2, true]
-- The unresolved datom is retracted, replaced by the real edge datom.
```

This is cleaner than the current model where `is_resolved: false` and `target_entity_id: null` sit in the same table as resolved refs. In the datom model, resolution is a state transition: retract the unresolved datom, assert the edge datom. The history of the resolution is preserved in the log.

External packages become synthetic entities: `[ext:react, :npm/name, "react", tx:1, true]`. Their symbols are entities too: `[ext:react:useState, :symbol/kind, "function", tx:1, true]`. Once resolved, cross-package edges are just ref datoms between real entities — the external_refs table dissolves into the edge space.

**Verdict for external refs: pure datom model is cleaner than the current typed table. Resolution becomes a retract+assert, not a row mutation.**

---

#### Effects → typed structs are the better fit here

The Effects table is the most complex. It has 25+ columns, most of which are effect_type-specific — `callee_name` is only meaningful for `function-call` effects; `store_type` is only meaningful for `store-write` effects; `route_pattern` is only meaningful for HTTP effects. The table already uses `properties: JSON` as an overflow for untyped data.

Two approaches:

**Option F1: Pure datom per field**
```
[effect:uuid, :effect/type,          "function-call",  tx:1, true]
[effect:uuid, :effect/source,        "node:abc123",    tx:1, true]
[effect:uuid, :effect/callee-name,   "fetch",          tx:1, true]
[effect:uuid, :effect/is-async,      true,             tx:1, true]
[effect:uuid, :effect/is-external,   true,             tx:1, true]
... (5–15 datoms for common effect types)
```
Works, but the effect_type-specific attributes (`:effect/store-type`, `:effect/route-pattern`) only appear on some effects — the attribute space becomes sparse. For 5M effects across a large workspace: 25–75M datoms. This is the outer limit of what's practical in-memory; you'd need Hyperbee as the primary store with a small hot cache.

**Option F2: Structured-value datom per effect (recommended)**
```
[node:abc123, :effect/function-call, {
  callee: "fetch",
  isAsync: true,
  isExternal: true,
  module: "node:fetch",
  argCount: 2,
  file: "src/api.ts",
  line: 87
}, tx:1, true]
```
One datom per effect. The V field is a typed struct matching the existing Zod schema shape. The attribute is the effect type (`:effect/function-call`, `:effect/store-write`, etc.) — which enables "find all store-write effects in this entity" as a direct attribute index lookup. The effect content is the V struct.

This also matches the existing `properties: JSON` pattern — it's just a first-class structured datom instead of an overflow escape hatch. The `properties: JSON` column goes away; the content IS the value.

**Verdict for effects: structured-value datom per effect (Option F2). One datom per effect, attribute = effect type, value = typed struct. The attribute-as-type pattern enables efficient "find all effects of type X" queries without scanning all effects.**

---

#### Summary: which model for each table

| Table | Pure EAV datom | Structured-value datom | Recommendation |
|---|---|---|---|
| **nodes** | ✓ clean fit — ~22 datoms/node | n/a | Pure EAV datoms — schema evolution, history for free |
| **edges** (simple graph) | ✓ ref datom: `[src, :edge/CALLS, target, tx, op]` | E3: `[src, :edge/CALLS, { target, file, line }, tx, op]` | Structured-value — one datom with location metadata |
| **external_refs** | ✓ clean fit — resolution = retract+assert | n/a | Pure EAV datoms (or dissolve into edges after resolution) |
| **effects** | ~ sparse attribute space, 25-75M datoms | F2: `[src, :effect/fn-call, { struct }, tx, op]` | Structured-value per effect — attribute = effect type |

The in-memory store does **not** need to be "pure EAV scalars all the way down." The V field of a datom can be a typed struct for complex records (edges, effects). What matters is the EAV *interface* — every piece of data is addressed by entity, attribute, and version — not whether V is always a scalar.

---

#### The datom wrapper: unified API over typed structs

This design means the in-memory graph store can start from the existing Zod schemas and wrap them in a datom interface — no full rewrite required. The `Node` typed struct becomes an entity whose attributes are accessed via the DatomQuery API:

```typescript
// Today (typed struct access):
const node = nodeIndex.get('node:abc123')
const name = node.name
const file = node.file_path

// Tomorrow (DatomQuery wrapper over the same struct):
const result = store.query({ entity: 'node:abc123', attribute: ':node/name' })
const name = result.get(':node/name')   // → "handleClick"

// Both read from the same in-memory Map. The wrapper adds:
// - time-travel (asOf)
// - retraction history
// - uniform DatomQuery interface across nodes, edges, effects, and counseling data
```

The Hypercore storage layer stores typed structs as entries (preserving compactness). The in-memory indexing layer presents them as datom entities. The DatomQuery API sits on top. This layering means:

1. **devac keeps its Zod schemas** — no rewrite of parsers, CLI, or MCP tools
2. **The in-memory store gains a datom API** — uniform query language for both devac and counseling app
3. **Hypercore replaces Parquet** — append-only, content-addressed, with retraction ops replacing `is_deleted: true` and the `branch: "delta"` pattern

The vivief platform story: both apps share the DatomQuery interface and the Hypercore storage format, but the internal data shape is appropriate to each domain — EAV datoms for counseling (flexible, evolving clinical data), typed structs wrapped in a datom API for devac (structured code graph with known schema).

---

The alternatives don't have to be mutually exclusive. The effectHandler and Lens abstractions are storage-agnostic. A vivief "platform mode" could:

- Use Alt 1 (SQLite) as the default app storage
- Optionally enable Alt 2 (DuckDB/Parquet) export for devac integration
- Let Alt 3 (Loro) handle collaborative documents (Canvas mode) while Alt 1 handles entities
- Consider Alt 4 (Hypercore) as the sync layer on top of Alt 1 or 2

The existing two-tier model (Loro hot + cold store) is already a partial version of this hybrid. The question is how far to push the split.

---

### Struct-as-Value: a thorough analysis of compound V in the datom model

The "datoms vs typed structs" analysis above recommends structured-value datoms for edges and effects (Options E3, F2). This section examines whether struct-as-V is conceptually sound, when it breaks, and how to make the overall datom store memory-friendly.

The question matters because it sits at the intersection of three forces:
1. **Conceptual purity** — Datomic's model assumes scalar V. Violating this has consequences for indexing, history, and query semantics.
2. **Memory constraints** — Pure EAV for 250K nodes × 22 attributes = 5.5M datoms ≈ 1.1GB. That's the limit for a dev machine before counting edges and effects.
3. **Migration feasibility** — devac's existing Zod-typed structs (Node, Edge, ExternalRef, Effect) need a realistic path to the datom world without a full rewrite.

---

#### Part 1: When is V a scalar and when is V a struct?

The key distinction is between **identity attributes** and **component attributes**.

**Identity attributes** describe an entity's own properties — things you query, filter, index, and track history on independently. `:client/name`, `:node/kind`, `:client/risk-level` are identity attributes. They must be scalar datoms because:
- You need per-attribute history: "when did the risk level change?"
- You need per-attribute indexing: "find all clients with risk-level = high"
- You need per-attribute reactive subscription: "notify me when any risk-level changes"
- You need per-attribute Contracts: "risk-level must be one of [low, moderate, high, crisis]"

**Component attributes** describe a *relationship or event* that is atomic — you never query, index, or track history on its sub-parts independently. An edge's `{ target, file, line }` is a component — you never ask "find all edges pointing to line 42" (you ask "find all edges from entity X"). An effect's `{ callee, isAsync, argCount }` is a component — you query by effect type (the attribute), not by individual struct fields.

The rule: **if you would never put a WHERE clause on a sub-field independently, it's a component and belongs in a struct V. If you would, it must be a scalar datom.**

This is not a compromise — it's a principled distinction. Datomic's own composite tuples (tupleAttrs) recognize the same pattern: some groups of values are semantically atomic.

---

#### Part 2: What struct-as-V preserves and what it loses

**Preserved:**
- **Entity identity** — `[source:abc, :edge/CALLS, {...}, tx, op]` still addresses by E and A
- **Attribute indexing** — "find all CALLS edges from entity X" works via `:edge/CALLS` index
- **Transaction history** — the struct is versioned by Tx; retraction retracts the whole struct
- **Reactive subscription** — subscribers to `:edge/CALLS` on entity X fire when the struct changes
- **Contract validation** — Contracts can validate the struct shape (Schema contracts) and the struct content (Effect contracts)
- **P2P peer validation** — the full datom (including struct V) is validated against Contracts on receipt

**Lost:**
- **Per-sub-field history** — you cannot ask "when did this edge's line number change?" because the whole struct is one V. You see "the edge was retracted and re-asserted with a different struct" — same outcome, but at struct granularity not field granularity.
- **Per-sub-field indexing** — you cannot put an index on `edge.line` or `effect.callee` at the datom store level. If you need "find all effects calling fetch", you scan all `:effect/function-call` datoms for entity X and filter in application code.
- **Per-sub-field reactive subscription** — the subscription fires on the whole attribute, not on a sub-field change. Acceptable because struct-V attributes represent atomic units.

**The test:** For every struct-V attribute in the system, verify: "Would I ever need to independently query, index, or track history on a sub-field?" If the answer is ever "yes" for a sub-field, extract it as a separate scalar datom.

Applied to devac:

| Struct-V attribute | Sub-fields | "Need independent query on sub-field?" | Verdict |
|---|---|---|---|
| `:edge/CALLS` | target, file, line, column | **target: YES** — "find what entity X calls" → extract target as a ref. **file/line: no** — navigation metadata, never queried independently | Split: target as ref datom, location as struct |
| `:effect/function-call` | callee, isAsync, isExternal, module, argCount, file, line | **callee: maybe** — "find all calls to fetch" across entities. But this is a scan by effect type, not a direct index lookup. Acceptable as struct scan. | Keep as struct. If callee queries become frequent, add a secondary index (see Part 3) |
| `:effect/store-write` | table, operation, file, line | No — queried by entity + effect type | Keep as struct |

This suggests a refinement of Option E3: **split the edge into a ref datom + a location struct**, rather than one monolithic struct:

```
[source:abc, :edge/CALLS,    target:def,                           tx:1, true]  ← ref datom (indexed)
[source:abc, :edge-loc/CALLS, { file: "src/api.ts", line: 42 },   tx:1, true]  ← location struct (not indexed)
```

Two datoms per edge instead of one struct or five pure EAV. The graph traversal index uses the ref datom (O(1) lookup). The location metadata is only loaded when navigating to source. This is the sweet spot between purity and practicality.

---

#### Part 3: Memory optimization techniques for the datom store

The memory budget analysis from the original section: 250K nodes × 22 datoms = 5.5M node datoms ≈ 1.1GB. With edges and effects this could reach 15-20M datoms ≈ 3-4GB. Too much for a dev machine. Here's how to cut it by 3-5x.

**Technique 1: String interning (saves 30-50%)**

In a code graph, the same strings appear thousands of times:
- **File paths** — 500 files × (avg 10 entities per file) = each path repeated 10x
- **Attribute names** — 200 distinct attributes × millions of datoms = massive redundancy
- **Kind/visibility enums** — "function", "class", "public", "private" repeated everywhere
- **Entity ID prefixes** — "myrepo:packages/api:" repeated for every entity in a package

String interning stores each unique string once in a pool. All datoms reference the interned string by pointer. In JavaScript, this is a `Map<string, string>`:

```typescript
const internPool = new Map<string, string>()

function intern(s: string): string {
  const existing = internPool.get(s)
  if (existing !== undefined) return existing
  internPool.set(s, s)
  return s
}
```

V8 already interns short literal strings, but dynamically constructed strings (entity IDs, file paths, qualified names) are NOT interned by default. Explicit interning for these high-repetition fields saves 30-50% of total string memory.

Additional win: string comparison becomes identity comparison (`===` on same-pool strings is a pointer comparison in V8), making index lookups faster.

**Technique 2: Dictionary encoding for attributes (saves 60-90% on A column)**

There are at most a few hundred distinct attribute names in the system. Instead of storing the full string `:node/qualified-name` on every datom, store a `Uint16` dictionary ID:

```typescript
// Attribute dictionary — built once, shared across all datoms
const attrDict: string[] = [':node/name', ':node/kind', ':node/file', ':edge/CALLS', ...]
const attrToId = new Map<string, number>()  // reverse lookup
attrDict.forEach((a, i) => attrToId.set(a, i))

// Each datom stores attrId (2 bytes) instead of attribute string (20-40 bytes)
```

For 10M datoms, this saves ~200-400MB (20-40 bytes per datom × 10M). The dictionary itself is negligible (<50KB for 200 attributes).

**Technique 3: Columnar storage for numeric fields (saves ~3x on numbers)**

Node line/column numbers, Tx IDs, and boolean flags are currently stored as JavaScript `number` values inside objects. Each `number` in a V8 object uses 8 bytes (boxed double). A `Uint32Array` uses 4 bytes.

For a store with many numeric datoms (line numbers, column numbers, Tx IDs), switching the numeric V values to typed arrays reduces memory by ~50% per numeric field.

In practice this means: store datom tuples in a columnar layout (array-of-columns) rather than row-of-objects:

```typescript
// Row layout (current intuition): array of {e, a, v, tx, op} objects
// ~120 bytes per datom (object overhead + string pointers + boxed numbers)

// Columnar layout: parallel arrays
const entities: string[]        // interned entity IDs
const attributes: Uint16Array   // dictionary-encoded attribute IDs
const values: unknown[]         // mixed: interned strings, numbers, structs
const txIds: Uint32Array        // transaction IDs (4 bytes vs 8)
const ops: Uint8Array           // boolean ops (1 byte vs 8)
```

Estimated per-datom cost: ~60-80 bytes (vs ~120-200 bytes for object layout). For 10M datoms: ~600-800MB instead of 1.2-2GB.

**Technique 4: Working set + cold storage (eliminates the scaling problem)**

The most impactful technique: don't hold all datoms in memory.

The devac usage pattern has strong locality — when working on a file, you need datoms for entities in that file and their direct dependencies. You don't need the entire 250K-node graph in memory simultaneously.

Split the store into two tiers:

| Tier | What's in it | Storage | Access time |
|---|---|---|---|
| **Hot cache** | Entities in active files + 1-hop dependencies | In-memory (Map indexes) | Microseconds |
| **Cold index** | Everything else | Hyperbee (persistent B-tree on disk) | Low milliseconds |

The hot cache holds ~5-10K entities (the "working set") using ~50-100MB. The cold index holds the full graph on disk, accessed only for graph traversals that reach beyond the working set.

Cache population strategy:
- On file open / `devac sync`: load all entities in the file + 1-hop dependencies into hot cache
- On graph traversal (query_deps, query_affected): lazy-load from Hyperbee into hot cache as the BFS expands
- Eviction: LRU by file — when a file hasn't been active for N minutes, evict its entities from hot cache

This is exactly what Datomic does with its object cache + segment cache. The key insight: **you don't need to solve the "10M datoms in memory" problem — you need to solve the "10K datoms in memory + fast access to the rest" problem.**

**Technique 5: Struct-V as memory optimization (closes the circle)**

Struct-V datoms are themselves a memory optimization technique. Compare:

```
Pure EAV for one edge (5 datoms):
  5 × { e: string, a: string, v: string|number, tx: number, op: boolean }
  ≈ 5 × 120 bytes = 600 bytes

Struct-V for one edge (1 datom):
  1 × { e: string, a: string, v: { target, file, line }, tx: number, op: boolean }
  ≈ 200 bytes
```

For 1M edges: 600MB (pure EAV) vs 200MB (struct-V). The struct-V approach is 3x more memory-efficient because it eliminates 4 copies of entity ID + attribute ID + tx + op per edge.

Combined with string interning and dictionary encoding on the remaining datom fields, struct-V edges drop to ~120-150 bytes each = 120-150MB for 1M edges.

**Combined savings estimate:**

| Approach | 250K nodes | 1M edges | 2M effects | Total |
|---|---|---|---|---|
| **Naive pure EAV** | 5.5M datoms × 150B = 825MB | 5M datoms × 150B = 750MB | 15M datoms × 150B = 2.25GB | ~3.8GB |
| **Struct-V only** | 5.5M × 150B = 825MB | 1M × 200B = 200MB | 2M × 250B = 500MB | ~1.5GB |
| **+ String interning** | 500MB | 140MB | 350MB | ~1.0GB |
| **+ Dictionary encoding** | 400MB | 120MB | 300MB | ~0.8GB |
| **+ Working set (hot/cold)** | 30MB hot | 10MB hot | 20MB hot | **~60MB hot** + disk |

The working set approach is the decisive win. All other techniques are multipliers on top.

---

#### Part 4: Conceptual impact on vivief-concepts.md

Does struct-as-V change the seven concepts? No — it refines the Datom definition:

> **Datom V can be scalar or struct.** The `[E, A, V, Tx, Op]` shape is preserved. When V is a scalar (text, number, date, ref, bool, vec, encrypted), the datom supports per-value indexing and history. When V is a struct (a typed record with named fields), the datom supports per-attribute indexing and history at struct granularity. The choice of scalar vs struct is made per-attribute based on whether sub-fields need independent querying.

This is NOT a compromise. It's a principled design: V is typed, and "struct" is a type. The DatomQuery API works the same — you query by entity + attribute. Contract validation works the same — Contracts can validate struct shapes. Reactive subscription works the same — subscribers fire on attribute changes. P2P peer validation works the same — the full datom (including struct V) is validated.

What changes:
- **DatomQuery** gains an optional `structField` accessor for struct-V attributes: `result.get(':edge/CALLS').target` navigates into the struct
- **Contracts** can validate struct shapes as Schema contracts: "an `:edge/CALLS` value must have target, file, line"
- **Indexes** are per-attribute (not per-struct-field) for struct-V datoms — sub-field lookups are application-level scans within the attribute result set

What stays the same: everything else. The Lens, Surface, Seal, Contract, P2P, and effectHandler concepts are unaffected. The DatomQuery interface is the same — it just returns structs as V values for struct-typed attributes.

---

#### Part 5: The migration path from devac's typed structs

The techniques above define a concrete migration path:

**Phase 1 (now): Datom wrapper over existing Zod structs**
- Keep the existing Node, Edge, ExternalRef Zod schemas unchanged
- Add a DatomQuery wrapper that presents typed structs as datoms
- The in-memory Map indexes stay as they are
- devac CLI, MCP tools, and parsers remain untouched
- **Cost: small. Value: uniform query API across devac and counseling.**

**Phase 2 (when adding Hypercore): Nodes become pure EAV, edges/effects become struct-V**
- Nodes decompose into ~22 scalar datoms (schema evolution, per-attribute history)
- Edges become ref datom + location struct (2 datoms per edge)
- Effects become struct-V datoms (1 datom per effect, attribute = effect type)
- String interning + dictionary encoding applied
- Hyperbee as cold index, in-memory as hot cache
- **Cost: moderate. Value: append-only storage, P2P replication, history for free.**

**Phase 3 (at scale): Full memory optimization**
- Columnar storage layout for hot cache
- Working set eviction (LRU by file)
- Hyperbee-first reads with in-memory cache
- **Cost: significant engineering. Value: handles 10x codebase growth without memory issues.**

Each phase is independently valuable. Phase 1 can ship this week. Phase 2 aligns with the Hypercore adoption timeline. Phase 3 is triggered by actual memory pressure, not speculation.

---

## Recommended next step

Before committing to one alternative, resolve the clarification questions (Q1–Q6 above), particularly:

- **Q2 (browser meaning)** eliminates Alt 4 if pure web app
- **Q1 (multi-device)** determines how much sync complexity is worth adding
- **Q6 (vivief demo focus)** decides between Alt 2 (devac alignment) and the others

If forced to pick today without those answers: **Alt 1 (SQLite) + Alt 2 (DuckDB/Parquet) analytics layer** is the path of least resistance. It reuses 95% of the v2 work, runs on all platforms, and naturally connects to devac's patterns. The DuckDB/Parquet export makes the counseling app a vivief reference implementation without requiring a full architectural pivot.
