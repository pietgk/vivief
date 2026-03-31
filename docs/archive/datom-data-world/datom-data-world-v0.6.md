# The Datom Data World

## Architecture for a Local-First Practice Management Platform

**Version 0.6 — Unified Diff Architecture**
**Date: 2026-03-24**

---

## 1. Two Core Insights

### 1.1 Datoms ARE a CRDT

An `assert` datom is an add-operation to a grow-only set. A `retract` is
a tagged remove. They're commutative. The datom log is an operation-based
CRDT (an OR-Set variant with LWW tiebreaking on cardinality-one).

We don't need an external CRDT library to merge structured data. We need:
1. An append-only log per peer (Hypercore)
2. A deterministic materializer (our index builder)
3. Causal delivery (version vectors)

Loro's value is specifically in merging **rich text** (Fugue algorithm).
We use Loro for text and ONLY text.

### 1.2 Replay Diffs Is the Universal Operation

Every boundary in the system — between tiers, between peers, between
storage and UI — is crossed the same way: **a consumer behind a producer
catches up by replaying diffs it hasn't seen yet.**

```
Peer A  →  Peer B:           Hypercore replication (replay feed entries)
Frozen  →  Warm:             Materialize new entries into indexes
Warm    →  Hot:              Feed datom diffs into reactive queries
Hot     →  UI:               d2ts outputs render diffs to React
```

These are not four different mechanisms. They are one mechanism —
**incremental diff replay** — applied at four boundaries. The diff is
always the same shape: a datom `[e, a, v, tx, op]` with a multiplicity
(+1 for assert, -1 for retract).

This unification means:
- The same d2ts differential dataflow engine can operate at ALL tiers
- Adding a new tier boundary (e.g., a CDN cache) is the same pattern
- Testing is simpler: one diff-replay primitive to verify
- The "temperature" of data is just how many replay steps it is from
  the frozen log

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

Schema definitions, schema evolution, and domain data share the same
shape. An attribute is an entity with metadata datoms. Schema evolution
is a transaction like any other. This follows the vivief pattern.

### 2.3 Transactions as Entities

Every transaction is an entity with metadata datoms (`tx/time`,
`tx/peer`, `tx/source`). No separate audit log — "who changed what,
when, from where" is a datom query.

### 2.4 Rich Text as ContainerRef

When `db/valueType` is `"text"`, the datom value is a pointer to a Loro
LoroText document. The datom system records the reference; the content
syncs via the Loro Protomux channel independently.

### 2.5 External Identity Resolution

An entity can have multiple external identifiers from different systems:

```
[client-1, "client/personnummer", "19850315-1234",  tx-1, assert]
[client-1, "client/journal-id",   "JNL-2024-0042", tx-1, assert]
[client-1, "client/keet-key",     "ed25519:abc...", tx-2, assert]
```

All point to the same entity. The AVET index enables reverse lookup:
"which entity has `client/personnummer` = `19850315-1234`?"

When entities are shared between practices (referrals), identifier
mappings travel with the datoms. Each practice may know the client by a
different ID, but the datom model unifies them on a single entity.

---

## 3. The Essential Networking Layer: Protomux

Everything flows through one concept: a single encrypted connection
between two peers, multiplexed into independent protocol channels.

### 3.1 The Protocol Stack

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 5: Application protocols (our code)                    │
│                                                              │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Hypercore     │  │ Loro sync    │  │ App RPC         │   │
│  │ replication   │  │ channel      │  │ channel         │   │
│  │               │  │              │  │                 │   │
│  │ Datom feeds   │  │ Rich text    │  │ Queries,        │   │
│  │ sync here     │  │ updates here │  │ subscriptions,  │   │
│  │               │  │              │  │ presence, auth  │   │
│  └───────────────┘  └──────────────┘  └─────────────────┘   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Layer 4: Protomux                                            │
│  Multiplexes named channels over one stream.                 │
│  Channels paired by (protocol, id). Each has typed messages. │
│  Adding a new protocol = one createChannel call.             │
├──────────────────────────────────────────────────────────────┤
│ Layer 3: Noise secret stream (E2E encrypted, framed duplex)  │
│  Each peer identified by ED25519 public key.                 │
├──────────────────────────────────────────────────────────────┤
│ Layer 2: HyperDHT (peer discovery, NAT traversal)            │
├──────────────────────────────────────────────────────────────┤
│ Layer 1: Transport                                           │
│  Pear: UDP direct (UDX)  |  Web: WebSocket via dht-relay    │
│  Neither side knows which the other uses.                    │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 What Protomux IS

Protomux multiplexes multiple message-oriented protocols over a single
framed stream. Key mechanics:

- `createChannel({ protocol: 'name', id: buffer })` on both sides
- Protomux pairs channels by name — both sides open "loro-text/v1" and
  they connect
- Each channel has typed messages (`addMessage({ encoding, onmessage })`)
- Messages on one channel don't interfere with another
- Cork/uncork for batching efficiently

```javascript
const mux = Protomux.from(secretStream)

// Channel 1: Hypercore replication (automatic via core.replicate)
// Channel 2: Loro text sync (we define)
const loroChannel = mux.createChannel({ protocol: 'loro-text/v1' })
const loroMsg = loroChannel.addMessage({
  encoding: c.raw,
  onmessage(bytes) { loroDoc.import(bytes) }
})
loroChannel.open()
loroDoc.subscribeLocalUpdates((bytes) => loroMsg.send(bytes))

// Channel 3: App RPC (queries, subscriptions, presence)
const rpc = new ProtomuxRPC(secretStream, { protocol: 'datom-app/v1' })
rpc.respond('pull', async (req) => db.pull(req.pattern, req.entityId))
```

### 3.3 The Three Channels

**Hypercore replication** (`hypercore/alpha`): Built-in. Datom feed
entries replicate automatically when you call `core.replicate(stream)`.
Multiple Hypercores share one Protomux. Sparse — peers only download
what they need.

**Loro text sync** (`loro-text/v1`): We define. Carries Loro
`export({ mode: "update" })` bytes. Three message types: sync-request,
sync-response, update. Loro handles all merge semantics.

**App RPC** (`datom-app/v1`): We define using `protomux-rpc`.
Request/response for queries, subscriptions, presence, auth. This is
where **subscription-as-replication-filter** lives (see Section 5.3).

### 3.4 dht-relay: Browsers Join the Mesh

```
Browser ──WebSocket──► dht-relay ──UDP──► Pear peer / Server
                       (blind)
```

The relay forwards bytes without understanding them. Once connected, the
browser has a DHT node, gets Noise streams, gets Protomux, runs the
same code as Pear clients. The only difference is transport underneath.

---

## 4. Temperature Tiers

### 4.1 Three Temperatures, One Diff Shape

```
Frozen (Hypercore)  ──diff replay──►  Warm (Indexes)  ──diff replay──►  Hot (UI)
     │                                     │                              │
     │  Append-only, signed               │  Materialized, bounded       │  Reactive, scoped
     │  All history                        │  Active entities             │  Current view
     │  Disk (TB)                          │  Memory (GB)                 │  Memory (MB)
     │                                     │                              │
     │  Storage: Hypercore feeds           │  Storage: EAVT/AEVT/AVET    │  Storage: d2ts graph
     │  + Hyperbee cold index              │  + DuckDB virtual tables     │  + IndexedDB cache
     │  + DuckDB on-disk                   │  + Loro relay                │  + Loro WASM
     │                                     │                              │
     └─ Peer sync: Hypercore replication ──┘                              │
                     (same diff primitive)                                │
                                                                          │
     Warm → Hot: feed datom diffs into d2ts ──────────────────────────────┘
```

### 4.2 Client Types

| Property          | Web (browser)       | Pear (phone/desktop)| Server (always-on)  |
|-------------------|---------------------|---------------------|---------------------|
| Transport         | WS → dht-relay      | UDP direct          | UDP direct          |
| Connection        | Protomux            | Protomux            | Protomux            |
| HC feed persist   | In-memory only      | Disk (RocksDB)      | Disk (RocksDB)      |
| Local indexes     | In-memory partial   | HyperDB (full own)  | In-memory (all)     |
| Bootstrap         | IndexedDB cache     | Hypercore on disk   | Hypercore on disk   |
| Offline duration  | Seconds (tab open)  | Days/weeks          | Always-on           |
| Identity          | Noise keypair*      | Noise keypair       | Noise keypair       |

*Browser keypair stored in IndexedDB for session persistence.

### 4.3 The Server as Peer

The server is a peer with special properties:
- Always-on, reliably discoverable
- Stores all peers' Hypercore feeds (cold tier on disk)
- Materializes full EAVT/AEVT/AVET/VAET indexes
- Hosts dht-relay for browser clients
- Relays Loro text updates between peers
- Responds to RPC queries from clients without local data
- Runs datom watches for server-side logic

It is NOT a translator, gateway, or protocol bridge. It speaks the
same Protomux channels as every other peer.

---

## 5. Diff Replay at Every Boundary

### 5.1 The Diff as Universal Currency

Every state change in the system can be expressed as:

```typescript
type DatomDiff = {
  datom: Datom;
  multiplicity: 1 | -1;  // +1 = assert, -1 = retract
};
```

This is a d2ts `MultiSet` entry. It's also a Hypercore append. It's
also a datom watch notification. It's also what flows from warm to hot
tier. Same shape everywhere.

### 5.2 d2ts at Every Temperature

d2ts (differential dataflow in TypeScript) isn't just for reactive UI
queries. It's the materializer at all tiers:

**Frozen → Warm (index materialization):**
```
Hypercore append event
  → d2ts input: [datom, +1] or [datom, -1]
  → d2ts operators:
      - resolve LWW for cardinality:one (latest tx wins)
      - maintain EAVT index (keyed by [e, a])
      - maintain AEVT index (keyed by [a, e])
      - maintain AVET index (keyed by [a, v])
      - maintain VAET index (keyed by [v, a] for refs)
  → output: updated index entries
```

**Warm → Hot (reactive queries):**
```
Index update event
  → d2ts input: [entity-view, +1/-1]
  → d2ts operators:
      - filter (only active clients)
      - join (client + their sessions)
      - sort (by session date)
      - aggregate (session count per client)
  → output: updated query results → React re-render
```

**One engine, two pipelines.** The warm-tier pipeline materializes
indexes from raw Hypercore entries. The hot-tier pipeline maintains
reactive queries from those indexes. Both use d2ts's incremental
computation — only recompute what changed.

This means adding a new index is just adding a d2ts operator to the
warm pipeline. Adding a new reactive query is just adding a d2ts
operator to the hot pipeline. Same API, same mental model.

### 5.3 Subscription as Replication Filter

From the Loco brainstorm: a query expression isn't just a read — it's
a **sync subscription**. When a client tells the server "I want all
datoms where `a = 'session/date'` and `e` is in my client set," that's
simultaneously:

1. A Hypercore sparse replication filter (only download matching entries)
2. A d2ts pipeline input filter (only materialize matching datoms)
3. A push notification trigger (server broadcasts matching changes)

Implementation via the App RPC channel:

```javascript
// Client subscribes
rpc.event('subscribe', {
  patterns: [
    { a: 'session/date', e: myClientIds },
    { a: 'client/status', v: 'active' }
  ]
})

// Server registers the subscription
// When matching datoms arrive (from any peer's Hypercore):
//   1. Sparse-replicate matching Hypercore ranges to this client
//   2. Push diff notification via RPC channel
//   3. Client's d2ts pipeline picks it up → UI updates
```

This is TanStack DB's "query-driven sync" concept applied to our
Hypercore replication. The query defines what data flows to the client.

### 5.4 The Same Operations at Every Layer

| Operation | Frozen (Hypercore)       | Warm (Indexes)          | Hot (UI)               |
|-----------|--------------------------|-------------------------|------------------------|
| Read      | `core.get(seq)`          | `db.entity(id)`         | `useLiveQuery()`       |
| Write     | `core.append(datom)`     | `db.transact([...])`    | `useOptimisticMutation()` |
| List      | `core.createReadStream()`| `db.datoms('aevt', a)`  | d2ts collection output |
| Watch     | `core.on('append')`      | `db.watch({ a })`       | d2ts subscription      |
| Sync      | `core.replicate(stream)` | diff replay from frozen | diff replay from warm  |

The tree is the API. Read, write, list, watch, sync — same five
operations at every temperature. The implementation differs, the
semantics are identical.

---

## 6. Keet Integration

Keet runs on the same Pear/Bare runtime, same Hyperswarm, same Protomux.

**Shared infrastructure**: One Hyperswarm instance per device. Both Keet
and vivief join topics on it. Same DHT presence.

**Shared identity**: One ED25519 Noise keypair = one identity across both
apps. A practitioner's Keet identity IS their vivief identity.

**In-room apps**: Keet rooms support launching Pear apps. A practitioner
in a Keet call opens vivief — both participants sync datoms over the
same Protomux connection carrying the call.

**Personal relay**: Keet's always-on relay doubles as vivief's server.
One process, one Hyperswarm presence, both apps.

---

## 7. Index Architecture

### 7.1 Four Indexes

- **EAVT**: "All facts about entity X" — entity detail view
- **AEVT**: "All entities with attribute Y" — list views
- **AVET**: "Entity where attr=value" — lookup by email, date range,
  external ID
- **VAET**: "Reverse refs" — sessions referencing client X

### 7.2 Dictionary Encoding

Integer IDs for strings in index keys. `"client/name"` → `42`.
Dramatically faster comparison in sorted indexes.

### 7.3 DuckDB Virtual Tables

Server warm tier maps indexes to DuckDB virtual tables:

```sql
SELECT e, v as name FROM datoms_avet
WHERE a = 'client/name' AND v LIKE 'Anna%';
```

SQL access to the datom store with minimal glue code. No separate
database.

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

### 8.2 Pull Expressions

```typescript
db.pull([
  'client/name',
  'client/email',
  { 'session/_client': ['session/date', 'session/notes'] }
], clientId);
```

### 8.3 Reactive Queries (d2ts)

```typescript
const activeClients = useLiveQuery(db =>
  db.datoms('avet', 'client/status', 'active')
    .map(d => db.pull(['client/name', 'client/email'], d.e))
);
```

### 8.4 Remote Queries (via App RPC)

Web clients without local data query through the Protomux App channel:

```typescript
const result = await rpc.request('pull', {
  pattern: ['client/name', 'client/email'],
  entityId: 'client-xyz'
});
```

---

## 9. Conflict Resolution

| Data type | Strategy | Mechanism |
|-----------|----------|-----------|
| Structured, cardinality:one | LWW (timestamp + peer tiebreaker) | d2ts warm materializer |
| Structured, cardinality:many | Union (both kept) | OR-Set semantics |
| Rich text | Character-level merge | Loro Fugue (Loro channel) |
| Tree structures | Move-wins | Loro Kleppmann |

The datom log (frozen tier) preserves ALL assertions including
concurrent conflicting ones. The warm materializer picks winners via
LWW. The full conflict history is always available for audit or
manual review.

---

## 10. Memory Management

**Server**: Indexes for active entities (10k–50k). Evict archived to
cold. DuckDB virtual tables (zero duplication). Loro docs evicted when
no editors.

**Pear**: HyperDB for own data (1k–10k). Hypercore on disk. Loro local.

**Web**: In-memory Hypercore (session-lived). IndexedDB datom cache.
d2ts graph. Progressive loading via subscription filters.

---

## 11. Implementation Phases

### Phase 1 — Core Datom Engine + d2ts Foundation
- Datom type, schema-as-datoms, ULID, external identity
- d2ts-based materializer: raw diffs → EAVT/AEVT/AVET/VAET indexes
- `transact`, `entity`, `pull`, `datoms`, `watch`
- Conflict resolution (LWW in materializer)
- Tests: diff replay correctness at all boundaries

### Phase 2 — Hypercore + Protomux Networking
- Hypercore feed per peer
- Hyperswarm peer discovery
- Protomux: three channels (HC replication, Loro, App RPC)
- Hypercore append → d2ts materializer pipeline (frozen → warm)
- Server: feed storage, warm index materialization
- Subscription-as-replication-filter via RPC channel

### Phase 3 — Web Client via dht-relay
- dht-relay server
- Browser: DHT client over WebSocket
- Browser: ephemeral Hypercore
- Browser: IndexedDB datom cache for bootstrap
- Browser: same Protomux code as Pear
- Browser: keypair persistence in IndexedDB

### Phase 4 — Hot Tier Reactive Queries
- d2ts hot pipeline: warm diffs → reactive query results
- `useLiveQuery`, `useOptimisticMutation` hooks
- Progressive loading (eager/on-demand/progressive subscriptions)
- Optimistic mutations with rollback

### Phase 5 — Loro Collaborative Text
- Loro Protomux channel
- LoroText per text-valued attribute
- Loro sync over Protomux
- Loro snapshot lifecycle (shallow snapshots → cold)

### Phase 6 — Keet + Pear Integration
- Shared Hyperswarm
- Identity federation
- In-room app launch
- Personal relay as server

### Phase 7 — Cold Tier + Analytics
- DuckDB on-disk
- Warm → cold eviction
- Historical reporting
- Hypercore archival

---

## 12. Open Questions

1. **d2ts as universal materializer**: Can d2ts handle the warm-tier
   index building efficiently? The warm pipeline processes ALL datoms
   (not just one view's subset). d2ts is designed for 100k items — does
   it scale to the full active set? If not, the warm tier uses a simpler
   direct materializer and d2ts is hot-tier only.

2. **Hypercore in the browser**: Does the full Hypercore module work in
   browser JS via dht-relay? May need a compatibility shim or
   browser-specific Hypercore build.

3. **Subscription filter granularity**: How fine-grained should
   subscription-as-replication-filter be? Per-attribute? Per-entity-set?
   Per-query? Finer granularity = less data transfer but more filter
   evaluation overhead on the server.

4. **Keypair and device linking**: How does "link this browser to my
   Keet identity" work? Likely: scan QR code in Keet → signed proof
   exchanged → server associates browser keypair with practitioner
   entity.

5. **d2ts on Bare runtime**: Does d2ts work in Bare (Pear's JS runtime)?
   Not Node, not browser. May need minimal shim or alternative
   incremental query engine for Pear clients.

---

## Appendix A: Principles

1. **The datom is the universal primitive.** Everything is expressed as
   `[e, a, v, tx, op]`. Schema, domain data, transactions, identity.

2. **Replay diffs is the universal operation.** Every boundary — peer
   sync, index materialization, reactive queries, UI rendering — is
   crossed by replaying diffs the consumer hasn't seen.

3. **One connection, many protocols.** Protomux multiplexes Hypercore
   replication, Loro text sync, and App RPC over a single Noise-
   encrypted stream. Adding a new protocol is one call.

4. **Transport-agnostic peers.** Pear (UDP) and web (WebSocket relay)
   run the same code. Neither knows what the other uses.

5. **Subscriptions are replication filters.** A query defines what data
   flows to a client. The same expression drives sparse Hypercore
   download, server push notifications, and d2ts pipeline input.

6. **Identity is datoms.** External IDs, Noise keypairs, and cross-
   system references are all datoms on the same entity. No separate
   identity layer.

## Appendix B: Influences

| Source | What we take | What we leave |
|--------|-------------|---------------|
| **DataScript** | Datom shape, 3+1 indexes, pull API, filtered DBs | Datalog, ClojureScript |
| **Datomic** | Immutable facts, tx-as-entity, schema-as-data | Server arch |
| **Hexastore/RDF-3X** | Dictionary encoding, index selection | RDF, SPARQL |
| **Kappa Architecture** | Log as truth, materialized views, view regeneration | Kafka, JVM |
| **Loco** | Temperature model, "replay diffs is universal", tree-is-API, subscription-as-replication-filter, external identity resolution | C#/.NET, Starcounter, ClearScript |
| **TanStack DB / d2ts** | Differential dataflow at all tiers, optimistic mutations, query-driven sync | ElectricSQL, TanStack Query |
| **Loro** | LoroText (Fugue), LoroTree, version vectors | Using as total sync |
| **Protomux** | Channel multiplexing, compact-encoding | — (as-is) |
| **Hypercore** | Append-only log, Merkle verify, sparse replication | — (as-is) |
| **Hyperswarm + HyperDHT** | Peer discovery, NAT traversal, Noise encryption | — (as-is) |
| **hyperswarm-dht-relay** | WebSocket bridge for browsers | — (as-is) |
| **protomux-rpc** | Request/response over channels | — (as-is) |
| **Keet / Pear** | Shared Hyperswarm, identity, in-room apps, relay | Chat UI |
| **CRDT theory** | Datoms as OR-Set, commutativity | Complex CRDTs for structured data |
