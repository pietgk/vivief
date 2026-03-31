# The Datom Data World

## Architecture for a Local-First Practice Management Platform

**Version 0.5 — Protomux-Centric Architecture**
**Date: 2026-03-24**

---

## 1. The Core Insight: Datoms ARE a CRDT

An `assert` datom is an add-operation to a grow-only set. A `retract` is
a tagged remove. They're commutative — two peers asserting different facts
produces the union regardless of order. The datom log is an operation-based
CRDT (an OR-Set variant with LWW tiebreaking on cardinality-one attributes).

We don't need an external CRDT library to merge structured data. We need:
1. An append-only log per peer (Hypercore)
2. A deterministic materializer (our index builder)
3. Causal delivery (version vectors)

Loro's value is specifically in merging **rich text** — character-level
insertions/deletions that interleave in complex ways (Fugue algorithm).
We use Loro for text and ONLY text.

---

## 2. The Datom

### 2.1 Shape

```typescript
type Datom = {
  e: EntityId;          // ULID — globally unique, no coordination
  a: Attribute;         // Namespaced: "client/name", "session/date"
  v: DatomValue;        // Primitive | EntityId (ref) | ContainerRef (Loro)
  tx: TxId;             // ULID of producing transaction
  op: 'assert' | 'retract';
};
```

### 2.2 Schema-as-Datoms

Schema is defined as datoms. Schema evolution is datom transactions. This
follows the vivief pattern — the schema is queryable, versionable, and
auditable using the same datom machinery as domain data.

### 2.3 Transactions as Entities

Every transaction is an entity with metadata datoms (`tx/time`, `tx/peer`,
`tx/source`). "Who changed what, when, from where" is a datom query.

### 2.4 Rich Text as ContainerRef

When `db/valueType` is `"text"`, the datom's value is a pointer to a Loro
LoroText document. The datom system records the reference; the actual text
content syncs independently via Loro's own protocol.

---

## 3. The Essential Networking Layer: Protomux

This is the architectural centerpiece of vivief's networking. Everything
flows through one concept: a single encrypted connection between two
peers, multiplexed into independent protocol channels.

### 3.1 The Protocol Stack

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Application protocols (our code)                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Hypercore    │  │ Loro sync    │  │ App RPC          │  │
│  │ replication  │  │ channel      │  │ channel          │  │
│  │              │  │              │  │                  │  │
│  │ Datom feeds  │  │ Rich text    │  │ Queries,         │  │
│  │ sync here    │  │ updates here │  │ presence, auth   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         ▲                 ▲                  ▲               │
│         └─────────────────┼──────────────────┘               │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│ Layer 4: Protomux                                            │
│                                                              │
│  Multiplexes named protocol channels over one stream.        │
│  Channels are paired by (protocol, id) — both sides open     │
│  a channel with the same name and they connect.              │
│  Each channel has its own message types (compact-encoding).  │
│  Adding a new protocol is just mux.createChannel({...}).     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Layer 3: Secret stream (Noise-encrypted framed duplex)       │
│                                                              │
│  One encrypted connection between two peers.                 │
│  Noise protocol key exchange. E2E encrypted.                 │
│  Each peer identified by ED25519 public key.                 │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Layer 2: HyperDHT                                            │
│                                                              │
│  Peer discovery via distributed hash table.                  │
│  NAT traversal via UDP hole punching.                        │
│  No central server needed for discovery.                     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Layer 1: Transport                                           │
│                                                              │
│  Pear client: UDP direct (via UDX)                           │
│  Web client:  WebSocket → dht-relay → UDP                    │
│                                                              │
│  Neither side knows which transport the other uses.          │
│  Protomux sees the same framed stream either way.            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 What Protomux IS

Protomux multiplexes multiple message-oriented protocols over a single
framed stream. It's the composability layer that lets us say "one
connection, three protocols" instead of "three connections."

Key mechanics:
- You `createChannel({ protocol: 'name', id: optionalBuffer })` on both
  sides of a connection
- Protomux **pairs** channels by name — first remote channel with matching
  (protocol, id) connects to yours
- Each channel can `addMessage({ encoding, onmessage })` to define typed
  message handlers
- Messages on one channel don't interfere with another
- Cork/uncork for batching messages efficiently

```javascript
// Both peers do this on the same Noise stream:
const mux = Protomux.from(secretStream)

// Channel 1: Hypercore replication (automatic via core.replicate)
// Channel 2: Loro text sync (we define this)
const loroChannel = mux.createChannel({ protocol: 'loro-text/v1' })
const loroMsg = loroChannel.addMessage({
  encoding: c.raw,
  onmessage(bytes) { loroDoc.import(bytes) }
})
loroChannel.open()

// Send Loro updates
loroDoc.subscribeLocalUpdates((bytes) => loroMsg.send(bytes))

// Channel 3: App RPC (queries, presence)
const rpc = new ProtomuxRPC(secretStream, { protocol: 'datom-app/v1' })
rpc.respond('query', async (req) => {
  return db.pull(req.pattern, req.entityId)
})
```

### 3.3 Why Protomux Matters for vivief

**Without Protomux**, we'd need to manage:
- A WebSocket for datom sync (custom protocol, reconnect logic, auth)
- A WebSocket for Loro text sync (separate connection, separate auth)
- Possibly a third for RPC/presence
- Different protocols for Pear clients vs. web clients
- Server-side translation between protocol worlds

**With Protomux**, we manage:
- ONE connection per peer pair (encrypted, authenticated by Noise keypair)
- Multiple independent channels over that connection
- Same code runs on Pear (UDP) and web (WebSocket via relay)
- Adding a new protocol (e.g., AI inference channel, file sync) is one
  `createChannel` call

### 3.4 The Three Channels We Need

**Channel 1: Hypercore replication** (`hypercore/alpha`)

This is built-in. When you call `core.replicate(stream)`, Hypercore
creates its own Protomux channel automatically. Multiple Hypercores
share the same Protomux instance — they multiplex internally too.

What flows here: datom feed entries. Each peer's append-only log of
`[e, a, v, tx, op]` tuples. Sparse replication means a peer only
downloads the entries it needs.

We don't write this code. Hypercore's replication protocol handles
discovery of which blocks the remote has, requesting missing blocks,
verifying Merkle proofs, and streaming new appends in real-time.

**Channel 2: Loro text sync** (`loro-text/v1`)

We define this. It carries Loro export bytes between peers for
collaborative text editing. The protocol is minimal:

```
Message types:
  1: sync-request  { docId: string, version: VersionVector }
  2: sync-response { docId: string, bytes: Uint8Array }
  3: update        { docId: string, bytes: Uint8Array }
```

When a practitioner opens a session note, the client sends a
sync-request with its version vector for that document. The peer
responds with missing updates. Ongoing edits flow as `update` messages.

Loro handles all merge semantics — we just shuttle bytes.

**Channel 3: App RPC** (`datom-app/v1`)

We define this using `protomux-rpc`. It handles request/response
patterns that aren't covered by Hypercore replication or Loro sync:

- **Queries**: Web client asks server "give me all active clients" →
  server runs index scan → returns datoms. (Pear clients can query
  their own local indexes, but web clients need server-side help for
  data they haven't downloaded yet.)
- **Presence**: "Practitioner A is viewing client record X" — ephemeral,
  not worth storing in Hypercore.
- **Auth handshake**: On first connection, exchange workspace membership
  proofs.
- **Subscription management**: "Notify me when any `session/date` datom
  changes for my clients."

### 3.5 How dht-relay Bridges the Web

The browser can't do UDP or raw TCP. It can do WebSocket.
`hyperswarm-dht-relay` solves this:

```
Browser                     dht-relay server              Pear peer / Server
  │                              │                              │
  │  WebSocket connect           │                              │
  │─────────────────────────────►│                              │
  │                              │                              │
  │  Protomux framing over WS   │  UDP (HyperDHT)             │
  │◄────────────────────────────►│◄────────────────────────────►│
  │                              │                              │
  │  Browser gets a DHT node     │  Relay is BLIND:            │
  │  Can swarm.join(topic)       │  forwards bytes,             │
  │  Gets Noise secret stream    │  doesn't understand them     │
  │  Gets Protomux channels      │                              │
  │  Identical code to Pear      │                              │
```

The relay server is **blind** — it forwards UDX stream messages between
peers without understanding the content. It doesn't need our application
code, datom logic, or Loro integration. It's pure infrastructure, similar
to a TURN server in WebRTC.

Once the browser has a DHT node through the relay:
1. It joins the workspace's Hyperswarm topic
2. Gets Noise-encrypted connections to other peers
3. Gets Protomux with all three channels
4. Runs the same Hypercore replication, Loro sync, and App RPC code
   as a Pear client

**What the browser STILL can't do**: persist a Hypercore feed across
sessions. When the tab closes, the in-memory Hypercore is gone. On
next visit, the browser re-connects, re-joins the swarm, and catches
up via Hypercore replication (which is efficient — it only downloads
what it's missing based on the remote's bitfield).

For faster startup, the browser caches materialized datom state in
IndexedDB. On reconnect, it loads from cache (instant render), then
catches up from peers (eventual consistency).

---

## 4. Temperature Tiers (Revised for Protomux)

### 4.1 Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  HOT                         WARM                     COLD          │
│                                                                     │
│  ┌─── Web client ────────┐  ┌─── Server ───────────┐              │
│  │ In-memory Hypercore    │  │ Persistent Hypercore  │              │
│  │ IndexedDB cache        │  │ Full datom indexes    │ ┌── Disk ──┐│
│  │ d2ts reactive queries  │  │ DuckDB virtual tables │ │ HC feeds ││
│  │ Loro (WASM)            │  │ Loro relay            │ │ DuckDB   ││
│  └────────┬───────────────┘  │ dht-relay gateway     │ │ Loro snp ││
│           │                  └──────────┬────────────┘ └──────────┘│
│  ┌─── Pear client ───────┐             │                           │
│  │ Persistent Hypercore   │             │                           │
│  │ HyperDB local indexes  │             │                           │
│  │ d2ts reactive queries  │             │                           │
│  │ Loro (WASM/native)     │             │                           │
│  └────────┬───────────────┘             │                           │
│           │                             │                           │
│           └─── ALL connected via ───────┘                           │
│                Protomux channels                                    │
│                over Hyperswarm                                      │
│                (UDP direct or WS relay)                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 One Protocol, Three Client Types

| Property          | Web (browser)       | Pear (phone/desktop)| Server (always-on)  |
|-------------------|---------------------|---------------------|---------------------|
| Transport         | WS → dht-relay      | UDP direct          | UDP direct          |
| Connection        | Protomux            | Protomux            | Protomux            |
| HC feed persist   | In-memory only      | Disk (RocksDB)      | Disk (RocksDB)      |
| Local indexes     | In-memory partial   | HyperDB (full own)  | In-memory (all)     |
| Bootstrap         | IndexedDB cache     | Hypercore on disk   | Hypercore on disk   |
| Offline duration  | Seconds (tab open)  | Days/weeks          | Always-on           |
| P2P direct        | Via relay only      | Yes (Hyperswarm)    | Yes (Hyperswarm)    |
| Identity          | Noise keypair*      | Noise keypair       | Noise keypair       |
| Rich text         | Loro (WASM)         | Loro (WASM/native)  | Loro relay          |
| Reactive queries  | d2ts                | d2ts                | Datom watches       |

*Browser Noise keypair is ephemeral unless we store it in IndexedDB.

### 4.3 The Server's Role in the Protomux World

The server is NOT a translator or gateway. It's a **peer** — but a
special one:

1. **Always-on peer**: It's reliably discoverable on Hyperswarm. New
   clients connect to it first.
2. **Full feed replica**: It stores all peers' Hypercore feeds (cold
   tier on disk).
3. **Index materializer**: It maintains EAVT/AEVT/AVET/VAET indexes
   over the full active dataset.
4. **dht-relay host**: It runs the WebSocket relay for browser clients.
5. **Loro relay**: It relays Loro text updates between peers that aren't
   directly connected.
6. **RPC responder**: It answers queries from web clients that don't
   have local data.

It does NOT:
- Translate between protocols (there's only one: Protomux)
- Own a special "server feed" for web client writes (see below)
- Run application logic that clients can't run

### 4.4 Web Client Writes (Revised)

In v0.4, web client writes went through the server's Hypercore feed.
With Protomux, we have a better option:

The web client creates an **ephemeral Hypercore in memory**. It appends
its transactions there. Hypercore replication syncs this feed to the
server and other peers. The server persists the feed to disk on behalf
of the web client.

When the browser tab closes, the in-memory Hypercore is lost — but the
server (and any connected Pear clients) already replicated it. When the
browser reopens, it creates a new ephemeral Hypercore and catches up.

This means:
- Every client type has its own Hypercore feed
- Every client is a first-class peer (via Protomux)
- No "writes on behalf of" hack
- The server just stores what it receives (same as for Pear clients)

The web client's keypair can be persisted in IndexedDB to maintain
identity across sessions, or regenerated (with a "device linking" flow
to associate the new key with the practitioner's identity).

---

## 5. Sync Architecture

### 5.1 Everything Over Protomux

There is ONE sync mechanism: Hyperswarm connection → Noise stream →
Protomux → channels. Every peer-to-peer interaction uses this stack.

**Datom sync**: Hypercore replication channel. Automatic. Efficient
(sparse, incremental, Merkle-verified).

**Text sync**: Loro channel. Minimal protocol (version vectors + deltas).
Piggybacked on the same Protomux connection.

**Queries/RPC**: App channel. Request/response via `protomux-rpc`.
Used when a client needs data it hasn't downloaded yet.

**Presence**: App channel. Fire-and-forget messages ("I'm viewing X").
Could also use Loro's EphemeralStore for this.

### 5.2 Connection Topology

```
                    Hyperswarm DHT
                    (peer discovery)
                         │
            ┌────────────┼────────────┐
            │            │            │
       Pear client A  Server     Pear client B
            │            │            │
            └──── Protomux ────┘      │
            │     connections  │      │
            │                  │      │
            │            ┌─────┘      │
            │            │            │
            │       Web client X      │
            │       (via relay)       │
            │                         │
            └──── Direct P2P ─────────┘
                  (if on same LAN
                   or Hyperswarm
                   connects them)
```

Any peer can connect to any other peer. The server is not a mandatory
relay — it's a reliable one. If two Pear clients are on the same LAN,
Hyperswarm may connect them directly, and they sync without the server.

### 5.3 What Happens When a Peer Connects

```
1. Hyperswarm discovers peer (via DHT or LAN)
2. Noise handshake → encrypted secret stream
3. Protomux initialized on the stream
4. Hypercore replication channel opens automatically
   - Peers exchange bitfields (what blocks each has)
   - Missing datom feed entries start streaming
5. Loro sync channel opens (if either side has open text docs)
   - Version vectors exchanged per document
   - Missing updates streamed
6. App RPC channel opens
   - Auth handshake (workspace membership)
   - Subscription setup ("notify me about session changes")
7. Ongoing: all three channels active simultaneously
   - New datom appends → immediately replicated
   - Text edits → immediately synced via Loro
   - Queries → request/response via RPC
```

---

## 6. Keet Integration

Keet runs on the same Pear/Bare runtime and uses the same Hyperswarm +
Protomux stack. Integration points:

**Shared Hyperswarm instance**: The practitioner's device runs one
Hyperswarm. Both Keet and vivief join topics on it. Keet's connections
and vivief's connections share the same DHT presence.

**Shared identity**: Keet uses ED25519 Noise keypairs. vivief uses the
same. One keypair = one identity across both apps.

**In-room apps**: Keet allows launching Pear apps inside a conversation
room. A practitioner in a Keet call can open the vivief practice
management app, and both participants see the same data — synced over
the same Protomux connection that carries the Keet call.

**Personal relay**: Keet's always-on relay (for offline message caching)
can double as vivief's server/relay node. One process, one Hyperswarm
presence, serving both apps.

---

## 7. Index Architecture

(Unchanged — EAVT/AEVT/AVET/VAET, dictionary encoding, DuckDB virtual
tables on the server.)

---

## 8. Query API

### 8.1 Core Primitives

```typescript
interface DatomDB {
  datoms(index: IndexName, ...components: unknown[]): Datom[];
  entity(id: EntityId): Record<Attribute, DatomValue>;
  pull(pattern: PullExpr, id: EntityId): unknown;
  filter(predicate: (datom: Datom) => boolean): DatomDB;
  watch(pattern: WatchPattern, callback: WatchCallback): Unsubscribe;
}
```

### 8.2 Reactive Queries (d2ts)

Datom watches feed MultiSet diffs into d2ts pipelines. d2ts maintains
incremental query results. React renders. Sub-millisecond UI updates.

```typescript
const activeClients = useLiveQuery(db =>
  db.datoms('avet', 'client/status', 'active')
    .map(d => db.pull(['client/name', 'client/email'], d.e))
);
```

### 8.3 Remote Queries (via App RPC channel)

When a web client needs data it hasn't downloaded:

```typescript
// Client side
const result = await rpc.request('pull', {
  pattern: ['client/name', 'client/email'],
  entityId: 'client-xyz'
});

// Server side (RPC handler)
rpc.respond('pull', async (req) => {
  return db.pull(req.pattern, req.entityId);
});
```

The RPC travels over the Protomux App channel. The server queries its
warm-tier indexes and returns the result. The client caches the datoms
locally for future queries.

---

## 9. Conflict Resolution

| Data type | Strategy | Mechanism |
|-----------|----------|-----------|
| Structured, cardinality:one | LWW (timestamp + peer tiebreaker) | Materializer logic |
| Structured, cardinality:many | Union (both kept) | OR-Set semantics |
| Rich text | Character-level merge | Loro Fugue (via Loro channel) |
| Tree structures | Move-wins | Loro Kleppmann |

---

## 10. Memory Management

**Server**: Full indexes for active entities (10k–50k). Evict archived
entities to cold (Hypercore on disk). DuckDB virtual tables reference
indexes (zero duplication). Loro documents evicted from memory when no
active editors.

**Pear client**: HyperDB indexes for own data (1k–10k entities).
Hypercore on disk (grows slowly). Loro cached locally.

**Web client**: In-memory Hypercore (session-lived). IndexedDB for
materialized datom cache. d2ts dataflow graph. Progressive loading
(current view first, related data in background).

---

## 11. Implementation Phases

### Phase 1 — Core Datom Engine
- Datom type, schema-as-datoms, ULID
- In-memory indexes (EAVT/AEVT/AVET/VAET)
- `transact`, `entity`, `pull`, `datoms`, `watch`
- Conflict resolution (LWW, OR-Set)
- Tests

### Phase 2 — Hypercore + Protomux Foundation
- Hypercore feed per peer
- Hyperswarm peer discovery
- Protomux channel setup (three channels)
- Hypercore replication for datom sync
- Basic Protomux-RPC for app channel
- Server: feed storage, index materialization

### Phase 3 — Web Client via dht-relay
- dht-relay server (alongside main server)
- Browser: DHT client over WebSocket
- Browser: ephemeral Hypercore (in-memory)
- Browser: IndexedDB datom cache for bootstrap
- Browser: Protomux channels (same code as Pear)
- Browser: identity management (keypair in IndexedDB)

### Phase 4 — Reactive Queries (d2ts)
- d2ts integration on client (Pear + web)
- `useLiveQuery`, `useOptimisticMutation` hooks
- Datom watch → d2ts MultiSet feed
- Progressive loading (eager/on-demand/progressive)

### Phase 5 — Loro for Collaborative Text
- Loro Protomux channel definition
- LoroText per text-valued attribute
- Loro sync protocol over Protomux
- Loro snapshot lifecycle (shallow snapshots → cold)

### Phase 6 — Keet Integration
- Shared Hyperswarm instance
- Identity federation (shared Noise keypair)
- In-room app launch
- Personal relay as server node

### Phase 7 — Cold Tier + Analytics
- DuckDB on-disk analytics
- Warm → cold eviction policies
- Historical reporting
- Hypercore feed archival

---

## 12. Open Questions (Further Narrowed)

1. **Hypercore in the browser**: The ephemeral in-memory Hypercore
   approach needs validation. Does Hypercore work in browser JS (via
   dht-relay's stream)? Or do we need a Hypercore-compatible shim?
   The `random-access-memory` storage backend should work, but the full
   Hypercore module may have Node.js dependencies.

2. **d2ts on Bare**: Does d2ts work in the Bare runtime (not Node, not
   browser)? If not, what's the minimal shim? Alternatively, our own
   incremental query maintenance using datom watches may be simpler and
   sufficient for Pear clients.

3. **Loro channel protocol**: The three-message protocol (sync-request,
   sync-response, update) is simple. But should we use Loro's own
   `subscribeLocalUpdates` → `import` pattern directly, or add framing
   for multi-document multiplexing within the channel?

4. **Keypair management**: Web clients need stable identity across
   sessions. Storing the Noise keypair in IndexedDB works, but what
   about "link this browser to my Keet identity"? This needs a device-
   linking protocol (exchange signed proofs via Keet room or QR code).

5. **dht-relay scaling**: For a small practice (2-5 practitioners),
   the dht-relay can run on the same process as the server. For larger
   deployments, should it be a separate service? The relay is stateless
   and lightweight — multiple instances behind a load balancer would work.

---

## Appendix: The Protomux Advantage (Summary)

| Without Protomux (v0.4)                | With Protomux (v0.5)                    |
|-----------------------------------------|-----------------------------------------|
| Two sync protocols (HC + WebSocket)     | One protocol everywhere                 |
| Server translates between worlds        | Server is just another peer             |
| Web writes via server's identity        | Web has own ephemeral HC feed           |
| Separate connections per concern        | One connection, multiple channels       |
| Adding Loro = another WebSocket         | Adding Loro = one createChannel call    |
| Two codebases (web sync + Pear sync)    | One codebase, transport-agnostic        |
| WebSocket reconnect/auth logic          | Hyperswarm handles reconnection         |
| Custom binary framing                   | compact-encoding (Holepunch standard)   |
| Keet integration = separate bridge      | Keet shares the same Protomux stack     |

---

## Appendix: Influences

| Source | What we take | What we leave |
|--------|-------------|---------------|
| **DataScript** | Datom shape, 3+1 indexes, tx-reports, pull API | Datalog, ClojureScript |
| **Datomic** | Immutable facts, tx-as-entity, schema-as-data | Server arch, Cassandra |
| **Hexastore/RDF-3X** | Dictionary encoding, index selection | RDF, SPARQL |
| **Kappa Architecture** | Log as truth, materialized views | Kafka, JVM |
| **TanStack DB / d2ts** | Differential dataflow, optimistic mutations | ElectricSQL, TanStack Query |
| **Loro** | LoroText (Fugue), LoroTree, version vectors | Using as total sync engine |
| **Protomux** | Channel multiplexing, compact-encoding, protocol pairing | — (we use it as-is) |
| **Hypercore** | Append-only log, Merkle verification, sparse replication | — (we use it as-is) |
| **Hyperswarm + HyperDHT** | Peer discovery, NAT traversal, Noise encryption | — (we use it as-is) |
| **hyperswarm-dht-relay** | WebSocket bridge for browsers into Hyperswarm | — (we use it as-is) |
| **protomux-rpc** | Request/response over Protomux channels | — (we use it as-is) |
| **Keet / Pear** | Shared Hyperswarm, identity, in-room apps, personal relay | Chat UI, Keet-specific features |
| **CRDT theory** | Datoms as OR-Set, commutativity, version vectors | Complex CRDTs for structured data |
