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

10 lines. Cycle detection is `Set.has()`. No ARRAY type, no UNION ALL, no JOIN. The existing `affected-analyzer.ts` in devac already proves this pattern — the cross-repo affected analysis is already in-memory BFS, not SQL. This just extends that pattern inward.

The three devac query categories in-memory:
- **Simple lookups** (symbol by name, file symbols, diagnostics by severity): trivial index lookups
- **Graph traversal** (deps, dependents, call-graph): BFS — simpler and faster than CTEs
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

## Possible hybrid: Alt 1 or 2 for the app, Alt 3 or 4 as a vivief platform mode

The alternatives don't have to be mutually exclusive. The effectHandler and Lens abstractions are storage-agnostic. A vivief "platform mode" could:

- Use Alt 1 (SQLite) as the default app storage
- Optionally enable Alt 2 (DuckDB/Parquet) export for devac integration
- Let Alt 3 (Loro) handle collaborative documents (Canvas mode) while Alt 1 handles entities
- Consider Alt 4 (Hypercore) as the sync layer on top of Alt 1 or 2

The existing two-tier model (Loro hot + cold store) is already a partial version of this hybrid. The question is how far to push the split.

---

## Recommended next step

Before committing to one alternative, resolve the clarification questions (Q1–Q6 above), particularly:

- **Q2 (browser meaning)** eliminates Alt 4 if pure web app
- **Q1 (multi-device)** determines how much sync complexity is worth adding
- **Q6 (vivief demo focus)** decides between Alt 2 (devac alignment) and the others

If forced to pick today without those answers: **Alt 1 (SQLite) + Alt 2 (DuckDB/Parquet) analytics layer** is the path of least resistance. It reuses 95% of the v2 work, runs on all platforms, and naturally connects to devac's patterns. The DuckDB/Parquet export makes the counseling app a vivief reference implementation without requiring a full architectural pivot.
