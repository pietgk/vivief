# The Datom Data World

## Architecture for a Local-First Practice Management Platform

**Version 0.4 — Deep Research Draft**
**Date: 2026-03-23**

---

## 1. The Core Insight: Datoms ARE a CRDT

(Unchanged from v0.3 — see that document for the full argument.)

An `assert` datom is an add-operation to a grow-only set. A `retract` is
a tagged remove. They're commutative. The datom log IS an operation-based
CRDT (specifically an OR-Set variant). We don't need Loro or any CRDT
library to merge structured data — just append-only logs and a
deterministic materializer. Loro's value is specifically in merging rich
text (Fugue algorithm).

---

## 2. The Datom

(Unchanged from v0.3 — shape, schema-as-datoms, transactions as entities,
ContainerRef for rich text.)

---

## 3. Two Client Types: Pear-Native vs Web

This is the central architectural addition in v0.4. The practice
management platform has two fundamentally different client contexts:

### 3.1 The Practitioner's Phone/Desktop: Pear-Native Client

A practitioner runs Keet on their phone for encrypted P2P communication.
The same device can run a **Pear app** — our practice management client
built on the Bare runtime. This gives us:

**What Pear/Bare provides on the device:**
- Full Hypercore stack (append, replicate, sparse download)
- Hyperswarm for P2P peer discovery and NAT traversal
- HyperDB/Hyperbee for local indexed storage
- Bare runtime (JS, works on iOS + Android + desktop)
- Native module support (C/Rust FFI)
- No browser sandbox limitations
- Persistent background process (can sync while app is backgrounded)

**What this means architecturally:**
- The Pear client IS a peer — it has its own Hypercore feed
- It can sync directly with other Pear clients (no server needed)
- It has durable local storage (Hypercore, not just IndexedDB)
- It can run the full datom engine with indexed queries
- It can run Loro natively (WASM in Bare)
- It survives being offline for days/weeks

**The Pear client IS a warm-tier node**, just scoped to its owner's data.
It has the same index structure as the server, just over a smaller dataset.

### 3.2 The Web Client: Browser-Based Thin Client

A practitioner (or their admin staff, or a partner practitioner) accesses
the platform via a browser. The web client is constrained:

**What the browser provides:**
- Standard Web APIs (WebSocket, IndexedDB, Service Worker)
- No Hypercore (no raw TCP, no DHT, no NAT traversal)
- No persistent background process (tab can be closed)
- Limited storage (IndexedDB quotas, no Hypercore feeds)
- WASM support (Loro can run here)

**What this means architecturally:**
- The web client CANNOT be a Hypercore peer
- It depends on the warm tier for datom sync (WebSocket)
- It uses IndexedDB for bootstrap caching (best-effort)
- It CAN run Loro for collaborative text editing
- It CAN run d2ts for reactive queries
- It's ephemeral — closing the tab loses in-memory state

**The web client is a pure hot-tier node.** It receives datoms from the
warm tier, materializes partial indexes, runs reactive queries, and
pushes mutations back.

### 3.3 The Key Realization

These two client types connect to the same warm tier, see the same
datoms, and present the same UI. But their sync mechanisms are different:

```
Pear client ──── Hypercore replication ────► Warm tier
                                              (server)
Web client  ──── WebSocket datom sync  ────► Warm tier
                                              (server)
                                                │
Pear client ──── Hypercore replication ────► Pear client
              (direct P2P, no server)
```

The Pear client can also sync directly with other Pear clients when the
server is unavailable. The web client cannot.

---

## 4. Temperature Tiers (Revised)

### 4.1 Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  HOT                    WARM                    COLD                │
│                                                                     │
│  ┌─── Web client ───┐  ┌─── Server ──────────┐                    │
│  │ IndexedDB cache   │  │ Full datom indexes   │                    │
│  │ d2ts queries      │  │ DuckDB virtual tbls  │ ┌── Disk ───────┐ │
│  │ Loro (text)       │  │ Loro relay (text)    │ │ Hypercore WAL  │ │
│  │ WebSocket sync    │  │ Datom watches        │ │ DuckDB on-disk │ │
│  └───────────────────┘  │ Hypercore relay      │ │ Loro snapshots │ │
│                         └──────────┬───────────┘ └───────────────┘ │
│  ┌─── Pear client ──┐             │                                │
│  │ Local Hypercore   │◄───────────┘                                │
│  │ HyperDB indexes   │  Hypercore replication                      │
│  │ d2ts queries      │                                              │
│  │ Loro (text)       │◄──────────── Direct P2P ─────►              │
│  │ Full offline      │           (other Pear clients)               │
│  └───────────────────┘                                              │
│                                                                     │
│  Web = pure hot tier           Server = warm + cold                 │
│  Pear = hot + mini-warm        (always-on, bounded memory)          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Tier Characteristics

| Property          | Cold (Disk)     | Warm (Server)     | Hot-Web (Browser) | Hot-Pear (Device) |
|-------------------|-----------------|-------------------|--------------------|-------------------|
| Storage           | TB (disk)       | GB (memory)       | MB (IndexedDB)     | GB (Hypercore)    |
| Entity scope      | All ever        | All active        | Current view       | My practice data  |
| Sync mechanism    | Hypercore feeds | —                 | WebSocket protocol | Hypercore repl.   |
| Offline duration  | N/A             | N/A               | Minutes (cache)    | Days/weeks        |
| P2P capable       | N/A             | Relay only        | No                 | Yes (Hyperswarm)  |
| Rich text         | Snapshots       | Loro relay        | Loro (WASM)        | Loro (WASM/native)|
| Reactive queries  | DuckDB batch    | DuckDB + watches  | d2ts (sub-ms)      | d2ts (sub-ms)     |
| Audit trail       | Hypercore signed| Derived           | None               | Hypercore signed  |

### 4.3 The Pear Client as "Mini-Warm"

The Pear client is not just a hot-tier cache. Because it has Hypercore,
it maintains a persistent, signed, append-only record of its transactions.
It has real indexes (via HyperDB or in-memory). It can serve data to
other Pear clients directly.

This means the Pear client is **a warm tier for its own data**. The
server's warm tier is the *aggregated* warm tier for all practitioners'
data, but each Pear client is authoritative for its own writes.

Implications:
- If the server is down, two Pear clients can still sync directly
- If a practitioner switches devices, their Hypercore feed migrates
  (or replicates) to the new device
- The server doesn't need to be the first to see a write — it catches
  up via Hypercore replication when available
- The web client always goes through the server (it has no choice)

---

## 5. Sync Architecture

### 5.1 Three Sync Paths

**Path 1: Pear ↔ Server (Hypercore replication)**

The Pear client and server replicate Hypercore feeds bidirectionally.
The server has all peers' feeds. Each Pear client has its own feed plus
a selective replica of other relevant feeds (e.g., shared clients).

```
Pear client A                    Server
  [my-feed: tx1,tx2,tx3]  ──►  [A-feed: tx1,tx2,tx3]
                           ◄──  [B-feed: tx4,tx5]
                                [C-feed: tx6]
```

No custom sync protocol needed — Hypercore's replication protocol handles
discovery, encryption, sparse download, and exactly-once delivery.

**Path 2: Web ↔ Server (WebSocket datom sync)**

The web client uses the lightweight version-vector protocol from v0.3:

```
Web client                       Server
  { hello, version: VV }    ──►
                             ◄──  { catch-up, datoms: [...] }
  { tx, datoms: [...] }     ──►
                             ◄──  { tx-broadcast, datoms: [...] }
```

The server translates between the two paths: when a Pear client's
Hypercore feed delivers new datoms, the server materializes them into
indexes and broadcasts to connected web clients.

**Path 3: Pear ↔ Pear (Direct P2P)**

Two Pear clients on the same network (or via Hyperswarm) replicate
feeds directly. No server involvement. Same Hypercore protocol as
Path 1, just without the relay.

**Path 4: Loro text sync (all clients)**

Loro documents sync via their own protocol, transported over whatever
channel is available: WebSocket for web clients, Hyperswarm for Pear
clients, or the server as relay. Loro's version-vector-based sync
(`export({ mode: "update", from: peerVersion })`) works identically
regardless of transport.

### 5.2 How the Server Bridges Paths

```
Pear client A ───Hypercore──► Server ───WebSocket──► Web client X
                                 │
Pear client B ───Hypercore──► Server ───WebSocket──► Web client Y
                                 │
                            Server materializes all feeds
                            into warm-tier indexes
                            Broadcasts deltas to web clients
```

The server is a **Hypercore peer that also speaks WebSocket**. It:
1. Replicates feeds with all Pear clients
2. Materializes incoming datoms into EAVT/AEVT/AVET/VAET indexes
3. Pushes deltas to connected web clients via WebSocket
4. Accepts transactions from web clients and writes them to its own
   Hypercore feed (on behalf of the web client, since web can't have
   its own feed)
5. Relays Loro document sync between all clients

### 5.3 Web Client Writes

Since the web client can't have its own Hypercore feed, its writes go:

```
Web client ──tx──► Server ──validate──► Server's Hypercore feed
                                              │
                            Server indexes the datoms
                            Server broadcasts to all clients
                            Pear clients receive via replication
```

The web client gets an optimistic local update immediately (d2ts), then
the confirmed version arrives via the broadcast. If validation fails,
the optimistic state rolls back.

The server signs the web client's transactions in its own feed, noting
`tx/source: "web:user-xyz"` so the audit trail preserves who initiated
the write even though the server authored the Hypercore entry.

### 5.4 Keet Integration Points

Keet (Holepunch's P2P chat) runs on the same Pear runtime. This creates
natural integration opportunities:

**Shared infrastructure**: Both Keet and our practice management app use
Hyperswarm for peer discovery. They share the same DHT. A practitioner's
device running Keet is already discoverable — our app can piggyback on
the same Hyperswarm instance for its own peer connections.

**Communication + data in one context**: Keet rooms support launching
Pear apps inside a conversation. This means a practitioner could:
- Open a Keet room with a colleague
- Launch the practice management app inside the room
- Both see the same client record, co-edit session notes (Loro)
- The Hyperswarm connection that powers the Keet call also powers the
  datom sync and Loro text sync

**Identity**: Keet uses ED25519 key pairs for identity. Our app can
reuse the same key pair — the practitioner's Keet identity IS their
practice management identity. No separate auth system needed for
Pear clients.

**Offline relay**: Keet has a "personal relay" feature — an always-on
Pear node (e.g., Raspberry Pi or VPS) that caches messages when the
practitioner is offline. This same relay can serve as the warm tier
server, or as a bridge between the Pear network and web clients.

---

## 6. Conflict Resolution

(Largely unchanged from v0.3.)

| Data type | Strategy | Mechanism |
|-----------|----------|-----------|
| Structured, cardinality:one | LWW (timestamp + peer tiebreaker) | Materializer logic |
| Structured, cardinality:many | Union (both kept) | OR-Set semantics |
| Rich text | Character-level merge | Loro Fugue |
| Tree structures | Move-wins | Loro Kleppmann |

**Additional for two-client-type**: When a web client and a Pear client
concurrently edit the same entity, the server sees both transactions
(from its own feed for the web client, from the Pear client's feed via
replication). Standard LWW resolution applies — same as two Pear clients
conflicting.

---

## 7. Index Architecture

(Unchanged from v0.3 — EAVT/AEVT/AVET/VAET, dictionary encoding.)

**Additional for Pear client**: The Pear client can use HyperDB (Holepunch's
new P2P-first database, backed by Hyperbee or RocksDB) for its local
indexes. HyperDB provides:
- Schema definitions via Hyperschema
- Collections with primary keys and secondary indexes
- Backed by Hyperbee (P2P-replicable) or RocksDB (fast local)

This is a natural fit: define datom collections in HyperDB, use its
index infrastructure instead of building our own sorted maps on the
Pear client. The server warm tier uses in-memory sorted maps (faster,
no persistence needed since it's derived from Hypercore feeds).

---

## 8. The Full Data Flow

### 8.1 Practitioner Creates a Session (Pear Client)

```
1. Practitioner taps "New Session" on phone (Pear app)
2. Pear client creates datoms: [session-eid, "session/date", ...] etc.
3. Datoms appended to practitioner's Hypercore feed (signed, durable)
4. Local HyperDB indexes updated (sub-ms)
5. d2ts re-evaluates active queries → UI updates instantly
6. Hypercore replication sends new feed entries to server
7. Server materializes datoms into warm indexes
8. Server broadcasts delta to connected web clients
9. Web client d2ts re-evaluates → browser UI updates
10. If another Pear client is online, they receive via replication too
```

### 8.2 Admin Books a Session (Web Client)

```
1. Admin clicks "Book Session" in browser
2. Web client creates datoms locally (optimistic)
3. d2ts applies optimistic state → UI updates instantly
4. Web client sends transaction to server via WebSocket
5. Server validates, appends to its Hypercore feed (on behalf of web)
6. Server materializes into warm indexes
7. Server broadcasts delta to all clients (web + Pear)
8. Web client receives confirmation → optimistic state becomes permanent
9. Pear clients receive via Hypercore replication
10. If validation fails: server sends rejection, web client rolls back
```

### 8.3 Two Practitioners Co-Edit Session Notes (Loro)

```
1. Practitioner A opens session notes on Pear app
2. A's Loro LoroText container loads from local Loro snapshot
3. A starts typing — Loro operations generated locally
4. subscribe_local_update sends Loro delta bytes to server
5. Server relays Loro delta to Practitioner B (web or Pear)
6. B's Loro imports the delta, merges automatically (Fugue)
7. B's edits flow back the same way
8. Both see real-time collaborative editing
9. Periodically: Loro shallow snapshot saved to cold tier
10. The datom log has one datom: [session, "session/notes", "loro://doc-xyz"]
    The datom doesn't change — the Loro document evolves independently
```

---

## 9. Memory Management

### 9.1 Server Warm Tier
- Materialized indexes for active entities only (10k–50k)
- Entities archived after configurable inactivity period → cold only
- DuckDB virtual tables reference indexes (zero duplication)
- Loro documents: evict from memory when no active editors, keep snapshot
- Hypercore feeds: only buffer recent entries, older entries on disk

### 9.2 Pear Client
- HyperDB indexes for practitioner's own data (1k–10k entities)
- Hypercore feed stored on device (grows slowly, <100MB/year typical)
- Loro documents: cached locally, loaded on demand
- Full offline capability — no memory eviction needed for small practices

### 9.3 Web Client
- IndexedDB: cached datoms for recent views (bootstrap on reload)
- In-memory: d2ts dataflow graph + partial indexes
- No Hypercore, no persistent feeds
- Progressive loading: load current view first, prefetch related data

---

## 10. Implementation Phases (Revised)

### Phase 1 — Core Datom Engine
- Datom type, schema-as-datoms, ULID
- In-memory indexes (EAVT/AEVT/AVET/VAET)
- `transact`, `entity`, `pull`, `datoms`, `watch`
- Version vector implementation
- Tests for all query patterns and conflict scenarios

### Phase 2 — Server Warm Tier + Web Client Sync
- WebSocket server with version-vector datom sync
- Datom store with validation and materialization
- DuckDB virtual table glue
- Web client: IndexedDB bootstrap, optimistic mutations
- d2ts integration for reactive queries in browser
- `useLiveQuery`, `useOptimisticMutation` hooks

### Phase 3 — Pear Client
- Bare/Pear runtime project setup
- Local Hypercore feed for writes
- HyperDB for local indexes (or in-memory, evaluate)
- Hypercore replication to/from server
- Same d2ts query layer as web client
- Offline TX queue (already durable in Hypercore)

### Phase 4 — Loro for Collaborative Text
- LoroText per text-valued attribute
- Loro sync multiplexed over WebSocket (web) and Hyperswarm (Pear)
- Server as Loro relay between clients
- Loro snapshot lifecycle (shallow snapshots for cold tier)

### Phase 5 — Keet Integration
- Shared Hyperswarm instance between Keet and our app
- Identity federation (reuse Keet ED25519 key pair)
- Launch practice management views inside Keet rooms
- Direct Pear ↔ Pear sync via same Hyperswarm connections
- Personal relay as lightweight warm-tier server

### Phase 6 — Cold Tier + Analytics
- Hypercore feed archival
- DuckDB on-disk analytics over cold datoms
- Warm → cold eviction policies
- Historical reporting

### Phase 7 — Advanced P2P
- Pear ↔ Pear direct sync without server
- Multi-device identity (sync Hypercore across practitioner's devices)
- Autobase evaluation (if multi-writer coordination needed beyond LWW)

---

## 11. Open Questions (Narrowed Further)

1. **HyperDB vs. custom indexes on Pear client**: HyperDB gives us
   schema'd collections and indexes on Hyperbee, but it's designed for
   its own data model, not datom tuples. Do we model datoms as HyperDB
   collections (e.g., one collection per attribute namespace) or use
   HyperDB's RocksDB backend with our own index layout?

2. **Web client identity**: The web client can't have a Hypercore feed
   or ED25519 key pair (without a server-side key agent). Do we issue
   web clients a signing key that the server recognizes, or do all web
   writes attribute to the server's identity with a `tx/on-behalf-of`
   field?

3. **Keet room ↔ workspace mapping**: Does a Keet room correspond to a
   practice workspace? Or is the mapping more flexible (a room per case,
   per team, per session)?

4. **Personal relay as warm tier**: The Keet personal relay (always-on
   VPS or Raspberry Pi) is a natural candidate for the warm tier server.
   But it needs DuckDB, Loro relay, and WebSocket gateway — is a
   Raspberry Pi enough? Probably yes for a small practice.

5. **d2ts on Bare runtime**: d2ts is a TypeScript library. Bare runs JS
   but is not Node.js. Does d2ts work in Bare? If not, does our own
   datom-watch-based reactivity suffice for the Pear client (which may
   not need the same sub-ms latency as the browser)?

---

## Appendix: Influences

| Source | What we take | What we leave |
|--------|-------------|---------------|
| **DataScript** | Datom shape, 3+1 indexes, tx-reports, pull API | Datalog, ClojureScript |
| **Datomic** | Immutable facts, tx-as-entity, schema-as-data | Server arch, Cassandra |
| **Hexastore/RDF-3X** | Dictionary encoding, index selection | RDF, SPARQL |
| **Kappa Architecture** | Log as truth, materialized views | Kafka, JVM |
| **kappa-core** | Hypercore + views pattern | Abandoned codebase |
| **TanStack DB / d2ts** | Differential dataflow, optimistic mutations, sync modes | ElectricSQL, TanStack Query |
| **Loro** | LoroText (Fugue), LoroTree, version vectors, shallow snapshots | Using as total sync engine |
| **Holepunch/Pear** | Hypercore, Hyperswarm, Hyperbee, HyperDB, Bare runtime | — |
| **Keet** | P2P rooms, identity, in-room apps, personal relay | Chat UI |
| **CRDT theory** | Datoms as OR-Set, commutativity, version vectors | Complex CRDTs for structured data |
