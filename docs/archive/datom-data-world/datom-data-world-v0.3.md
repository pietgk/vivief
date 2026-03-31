# The Datom Data World

## Architecture for a Local-First Practice Management Platform

**Version 0.3 — Deep Research Draft**
**Date: 2026-03-23**

---

## 1. The Core Insight: Datoms ARE a CRDT

Before choosing between Hypercore, Loro, and d2ts, we need to see what's
hiding in plain sight:

**A datom `[e, a, v, tx, op]` is an operation in an operation-based CRDT.**

An `assert` adds a fact to a grow-only set. A `retract` marks a fact as
removed. If we give each datom a globally unique identity (the `tx` + an
ordinal), then:

- **Concurrent asserts of different facts commute.** Two peers adding
  different client records produces the union — order doesn't matter.
- **Concurrent asserts to the same cardinality-one attribute** need a
  tiebreaker (LWW by timestamp + peer ID). This is a standard LWW-Register
  CRDT pattern.
- **Concurrent retractions** are idempotent — retracting the same fact
  twice has no additional effect.
- **Assert + retract of the same fact** is resolved by causal ordering:
  the retract must be causally after the assert.

This means **the datom log itself is a CRDT** — specifically, it's an
observed-remove set (OR-Set) where each element (datom) has a unique tag
(tx + ordinal), and remove operations (retracts) target specific tags.

**Why this matters**: We don't need Loro or any external CRDT library to
get conflict-free merge of structured data. We just need:
1. An append-only log per peer (Hypercore provides this)
2. A deterministic merge function (our datom materializer)
3. Causal delivery (version vectors provide this)

Loro's value is **not** in merging structured datoms. It's in merging
**text** — where the operations are character insertions/deletions that
interleave in complex ways that a simple OR-Set can't handle. This is
the Fugue algorithm, and it's genuinely hard. We should use Loro for
this and ONLY this.

---

## 2. The Datom

### 2.1 Shape

```typescript
type Datom = {
  e: EntityId;          // ULID
  a: Attribute;         // Namespaced: "client/name"
  v: DatomValue;        // Primitive | EntityId (ref) | ContainerRef (Loro)
  tx: TxId;             // ULID of producing transaction
  op: 'assert' | 'retract';
};
```

### 2.2 Schema-as-Datoms

Schema definitions, schema evolution, and domain data all share the same
shape. An attribute is an entity with metadata datoms:

```
[attr-1, "db/ident",       "client/name",  tx-1, assert]
[attr-1, "db/cardinality", "one",          tx-1, assert]
[attr-1, "db/valueType",   "string",       tx-1, assert]
```

Schema evolution is a transaction:
```
[attr-1, "db/valueType", "string",  tx-1, retract]
[attr-1, "db/valueType", "text",    tx-2, assert]  // → Loro container
```

### 2.3 Transactions as Entities

```
[tx-1, "tx/time",   "2026-03-23T14:30:00Z", tx-1, assert]
[tx-1, "tx/peer",   "peer-abc",             tx-1, assert]
[tx-1, "tx/source", "ui:session-form",      tx-1, assert]
```

### 2.4 The Special Case: Rich Text

When `db/valueType` is `"text"`, the datom's value is a **ContainerRef**
— a pointer to a Loro LoroText document. The datom log records:

```
[session-1, "session/notes", "loro://notes-session-1", tx-5, assert]
```

The actual text content lives in a separate Loro document that syncs
independently using Loro's own protocol. The datom system knows nothing
about text merging; it just knows there's a Loro container over there.

---

## 3. Temperature Tiers

### 3.1 The Constraint Model

```
Cold:  Disk. Grows forever. All history. Sparse access.
Warm:  Memory-bounded. Active entities. Full indexes. Serves clients.
Hot:   Tightly scoped. Current view. Reactive. Works offline.
```

| Constraint        | Cold          | Warm              | Hot               |
|-------------------|---------------|-------------------|-------------------|
| Storage           | Disk (TB)     | Memory (GB)       | Memory (MB)       |
| Entity count      | 100k+         | 10k–50k           | 100–1000          |
| History           | Complete      | Current state      | Current state     |
| Latency           | Seconds       | Milliseconds      | Sub-millisecond   |
| Availability      | Offline OK    | Always-on server  | Works offline     |
| Persistence       | Hypercore     | Derived from cold | IndexedDB cache   |

### 3.2 The Datom Doesn't Change Shape

A datom in cold storage has the same `[e, a, v, tx, op]` shape as one in
the hot tier's reactive query. What changes across tiers:

- **Indexing depth**: Cold has sparse B-tree (Hyperbee). Warm has full
  EAVT/AEVT/AVET/VAET in memory. Hot has partial indexes for loaded data.
- **Retention**: Cold keeps everything. Warm evicts archived entities.
  Hot only loads what the current view needs.
- **Reactivity**: Cold is batch (analytics). Warm has watches (triggers).
  Hot has differential dataflow (sub-ms UI updates).

---

## 4. Three Architecture Variants

We present three complete compositions. Each tells a coherent story about
how datoms flow from creation to UI rendering. They share the datom
model and index architecture but differ in sync mechanics.

### 4.1 Variant A: "Kappa Datoms" — Hypercore-Native

**Philosophy**: The append-only log IS the database. Everything else is
a materialized view. Loro is a sidecar for text only.

This follows the kappa architecture pattern pioneered by kappa-core:
the log is the source of truth, views are derived and regenerable.

```
HOT (Client)                WARM (Server)               COLD (Disk)
┌──────────────────┐       ┌──────────────────┐       ┌──────────────┐
│ Local Hypercore   │──────►│ Autobase         │──────►│ Hypercore    │
│ (my writes)       │◄──────│ (linearized view)│       │ feeds (all)  │
│                   │       │                   │       │              │
│ Materialized      │       │ Materialized      │       │ Hyperbee     │
│ datom indexes     │       │ datom indexes     │       │ (B-tree)     │
│ (partial)         │       │ (full active set) │       │              │
│                   │       │                   │       │ DuckDB       │
│ d2ts reactive     │       │ DuckDB in-memory  │       │ (on-disk)    │
│ query engine      │       │ virtual tables    │       │              │
│                   │       │                   │       │              │
│ Loro clients      │◄─────►│ Loro relay        │       │ Loro         │
│ (text editing)    │       │ (text sync)       │       │ snapshots    │
└──────────────────┘       └──────────────────┘       └──────────────┘
```

**How sync works**:

1. Every peer (client or server) has its own Hypercore feed
2. When a client transacts, datoms are appended to their local feed
3. Autobase on the warm tier consumes all peer feeds
4. Autobase's DAG linearizer produces a deterministic total order
5. The linearized output drives the warm tier's datom materializer
6. Materializer maintains EAVT/AEVT/AVET/VAET indexes in memory
7. Clients sync by replicating Hypercore feeds (sparse, encrypted)
8. For text: Loro documents sync separately (WebSocket or Hyperswarm)

**Conflict resolution**:
- Structured datoms: Autobase linearization + LWW on cardinality-one
- Rich text: Loro Fugue algorithm (independent channel)

**Pros**:
- Single source of truth (the log), everything else is derived
- View regeneration: change your index schema? Replay from log
- Crypto-signed audit trail built into Hypercore
- P2P without central server (Hyperswarm DHT)
- Sparse replication: client fetches only what it needs
- Autobase handles multi-writer coordination
- Clean separation: Hypercore for structure, Loro for text

**Cons**:
- Autobase adds significant complexity (indexer quorum, DAG reordering)
- Autobase is less battle-tested than Hypercore itself
- Two sync channels to manage (Hypercore + Loro)
- Client needs a local Hypercore (heavier than IndexedDB)
- Cold → warm → hot startup requires replaying/catching up feeds
- Sparse replication means the client doesn't have a complete local DB

**Best when**: You want maximal P2P capability, the server is just
another peer, and the crypto audit trail matters (compliance, legal).

---

### 4.2 Variant B: "Datom Sync" — Custom Protocol, Loro for Text

**Philosophy**: Keep it simple. Datoms sync via a lightweight custom
protocol (version vectors + delta exchange). Hypercore is cold WAL only.
Loro handles text editing. No Autobase.

```
HOT (Client)                WARM (Server)               COLD (Disk)
┌──────────────────┐       ┌──────────────────┐       ┌──────────────┐
│ IndexedDB cache   │       │ Datom store       │──────►│ Hypercore    │
│ (bootstrap)       │       │ (in-memory)       │       │ feeds (WAL)  │
│                   │       │                   │       │              │
│ Materialized      │◄─────►│ Materialized      │       │ DuckDB       │
│ datom indexes     │ sync  │ datom indexes     │       │ (on-disk)    │
│ (partial)         │ proto │ (full active set) │       │              │
│                   │       │                   │       │              │
│ d2ts reactive     │       │ DuckDB in-memory  │       │              │
│ query engine      │       │ virtual tables    │       │              │
│                   │       │                   │       │              │
│ Loro clients      │◄─────►│ Loro relay        │──────►│ Loro         │
│ (text editing)    │       │ (text sync)       │       │ snapshots    │
└──────────────────┘       └──────────────────┘       └──────────────┘
```

**How sync works**:

1. Client transacts locally: datoms go to local indexes + IndexedDB
2. Client sends pending datoms to warm tier via WebSocket
3. Warm tier validates, assigns causal ordering, stores in memory
4. Warm tier appends to its Hypercore feed (cold WAL)
5. Warm tier broadcasts delta to other connected clients
6. On reconnect: client sends its version vector, warm tier responds
   with all datoms the client hasn't seen
7. For text: Loro sync via same WebSocket (multiplexed)

**The sync protocol is trivial**:
```typescript
// Client → Server
{ type: 'sync-request', myVersion: VersionVector }
// Server → Client
{ type: 'sync-response', datoms: Datom[], serverVersion: VersionVector }
// Client → Server (after local mutation)
{ type: 'tx', datoms: Datom[] }
// Server → Client (push)
{ type: 'tx-broadcast', datoms: Datom[], txMeta: TxMeta }
```

**Version vectors** track "which peer's datoms have I seen, up to what
tx?". This is the same concept Loro uses internally, but applied to our
datom layer. It gives us:
- Exactly-once delivery (skip datoms the peer already has)
- Catch-up after disconnect (send everything since their last known version)
- Duplicate detection (ignore datoms we've already processed)

**Conflict resolution**:
- Structured datoms: Version vector detects concurrency, LWW resolves
- Rich text: Loro Fugue (separate document, same transport)

**Pros**:
- Dramatically simpler than Variant A (no Autobase)
- Tiny sync protocol (< 200 lines of code)
- Client uses IndexedDB (lighter than Hypercore)
- Single transport (WebSocket) for both datoms and Loro
- Warm tier is the authority — simpler reasoning
- Fast startup: client loads from IndexedDB cache, syncs delta
- Hypercore is just a cold WAL, no runtime dependency on it

**Cons**:
- Server is required for sync (not pure P2P)
- No crypto-signed audit trail (unless we add signing ourselves)
- Client's IndexedDB cache is "best effort" — not a full replica
- Two version vector systems (ours for datoms, Loro's for text)
- If server dies, you lose the warm tier (cold tier + clients survive)
- No sparse replication — client gets all relevant datoms

**Best when**: You want to ship fast, the server is available, and P2P
is a future optimization, not a launch requirement.

---

### 4.3 Variant C: "Loro-Native" — Loro as Universal Substrate

**Philosophy**: What if we embrace Loro fully? Structure datoms as Loro
operations. The CRDT library handles all merge semantics. Hypercore is
cold backup only.

```
HOT (Client)                WARM (Server)               COLD (Disk)
┌──────────────────┐       ┌──────────────────┐       ┌──────────────┐
│ LoroDoc replica   │◄─────►│ LoroDoc replica   │──────►│ Loro         │
│ (workspace)       │ Loro  │ (workspace)       │       │ snapshots    │
│                   │ sync  │                   │       │              │
│ Materialized      │       │ Materialized      │       │ Hypercore    │
│ datom indexes     │       │ datom indexes     │       │ (WAL backup) │
│ (from Loro state) │       │ (from Loro state) │       │              │
│                   │       │                   │       │ DuckDB       │
│ d2ts reactive     │       │ DuckDB in-memory  │       │ (on-disk)    │
│ query engine      │       │ virtual tables    │       │              │
└──────────────────┘       └──────────────────┘       └──────────────┘
```

**The key design**: Each entity is a LoroMap inside a top-level LoroMap:

```typescript
const doc = new LoroDoc();
const entities = doc.getMap("entities");

// Transacting: create a client entity
const client = entities.setContainer("client-ulid-1", new LoroMap());
client.set("client/name", "Anna Svensson");
client.set("client/email", "anna@example.com");
client.set("client/status", "active");

// For text-valued attributes: nested LoroText
const notes = client.setContainer("session/notes", new LoroText());
notes.insert(0, "Initial session notes...");
```

**How sync works**:

1. All data lives in a LoroDoc per workspace
2. Client and server each hold a LoroDoc replica
3. Loro's native sync: exchange version vectors, send delta updates
4. One sync mechanism for everything — structured data AND text
5. Indexes are materialized from Loro state via `subscribe_root`
6. Cold backup: periodic Loro snapshot export to Hypercore

**But where are the datoms?** They're implicit. Every Loro operation
(set a key on a map, insert text, etc.) IS a datom-equivalent. But we
lose the explicit `[e, a, v, tx, op]` tuple. We can reconstruct it from
Loro's event diffs:

```typescript
doc.subscribe((event) => {
  for (const e of event.events) {
    if (e.diff.type === 'map') {
      for (const [key, change] of Object.entries(e.diff.updated)) {
        // This IS a datom: entity=container path, attr=key, val=change
        materializeToIndex(e.path, key, change);
      }
    }
  }
});
```

**Transaction metadata** becomes datoms in a separate `tx-meta` LoroMap:
```typescript
const txMeta = doc.getMap("tx-meta");
const tx = txMeta.setContainer(txId, new LoroMap());
tx.set("tx/time", new Date().toISOString());
tx.set("tx/peer", peerId);
tx.set("tx/source", "ui:session-form");
```

**Conflict resolution**:
- Structured data: Loro's LWW on LoroMap (automatic)
- Rich text: Loro's Fugue on LoroText (automatic)
- Hierarchies: Loro's Kleppmann tree CRDT (automatic)
- ALL conflict resolution is handled by ONE system

**Pros**:
- Single sync mechanism for everything (simplest mental model)
- Conflict resolution is automatic and well-tested (Loro)
- Rich text and structured data share the same document
- Version vectors, time travel, undo/redo come free
- Subscription events are the unified change feed
- LoroTree for hierarchical structures (org, categories)
- Shallow snapshots for cold tier compaction
- One less technology to integrate (no custom sync protocol)

**Cons**:
- Loro's operation log grows with ALL edits (not just current state)
  - Every `client.set("client/name", ...)` adds to the oplog
  - On a server with 50k entities, this becomes significant
- Memory footprint is higher: Loro stores operations AND state
- We lose the clean datom tuple — it's reconstructed from events
- Schema-as-datoms is awkward (schema IS the Loro container structure)
- No crypto-signed audit trail (Loro doesn't sign)
- Shallow snapshots lose history — tension with audit requirements
- Transaction boundaries are implicit (Loro's commit, not our tx entity)
- DuckDB integration is harder (need to export Loro state to tables)
- Vendor lock on Loro's internal format

**Best when**: Collaborative editing is the dominant use case (multiple
practitioners co-editing session notes, treatment plans) and you want
the simplest possible sync story.

---

## 5. Variant Comparison

### 5.1 Decision Matrix

| Concern                    | A: Kappa Datoms    | B: Datom Sync      | C: Loro-Native     |
|----------------------------|--------------------|---------------------|---------------------|
| Sync complexity            | High (Autobase)    | Low (custom proto)  | Low (Loro built-in) |
| P2P capability             | Full (Hyperswarm)  | Server-required     | Peer-via-relay      |
| Audit trail                | Crypto-signed      | Manual signing      | None built-in       |
| Conflict resolution        | Autobase + LWW     | Version vectors+LWW| Loro automatic      |
| Text editing               | Loro sidecar       | Loro sidecar        | Loro native         |
| Memory efficiency          | Good (log+views)   | Good (indexes only) | Higher (Loro oplog) |
| Startup speed              | Slow (replay log)  | Fast (IndexedDB)    | Medium (Loro load)  |
| Offline capability         | Full (local feed)  | Partial (IndexedDB) | Full (local LoroDoc)|
| Schema-as-datoms           | Natural            | Natural             | Awkward             |
| View regeneration          | Free (replay)      | Manual migration    | Loro state export   |
| Implementation effort      | Highest            | Lowest              | Medium              |
| Datom purity               | Pure               | Pure                | Reconstructed       |

### 5.2 The Elegant Hybrid: B + Selective C

After analyzing all three, a fourth option emerges: **use Variant B as
the backbone, with Variant C's approach for specific containers.**

The insight: most datoms (client records, session metadata, invoices,
schedules) are simple key-value facts that rarely conflict. A lightweight
custom sync with version vectors handles these efficiently. But some
entities — session notes, treatment plans, shared documents — need
real-time collaborative editing. For THESE, use a Loro document.

```
Structured datoms  ──►  Custom sync (version vectors + delta)
                        Hypercore WAL (cold)
                        In-memory indexes (warm/hot)
                        d2ts reactive queries (hot)

Collaborative text ──►  Loro LoroText per document
                        Loro sync (version vectors + delta)
                        Loro snapshots (cold)

Both share:        ──►  Same WebSocket transport
                        Same warm tier server
                        Same hot tier React hooks
```

**How the datom model unifies them**: A structured datom like
`[session-1, "session/date", "2026-03-20", tx-5, assert]` flows through
the custom sync path. A text-backed datom like
`[session-1, "session/notes", "loro://doc-xyz", tx-5, assert]` is a
pointer — the datom establishes the relationship, but the content lives
in a Loro document that syncs on its own channel.

The datom indexes don't care about the distinction. A query for
`db.entity(sessionId)` returns both the date (from the index) and the
notes (by resolving the Loro pointer). The UI layer sees a unified entity.

---

## 6. The Recommended Architecture (Variant B+)

### 6.1 The Full Picture

```
┌─────────────────────────────────────────────────────────────────────┐
│ HOT (Client — laptop/phone, works offline)                         │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ IndexedDB   │  │ Local datom  │  │ d2ts differential        │   │
│  │ cache       │─►│ indexes      │─►│ dataflow engine           │   │
│  │ (bootstrap) │  │ EAVT/AEVT   │  │ (reactive queries, sub-ms)│   │
│  └─────────────┘  └──────────────┘  └──────────────────────────┘   │
│                          ▲                       │                   │
│  ┌─────────────┐         │              ┌────────▼───────────────┐  │
│  │ Loro docs   │         │              │ React components       │  │
│  │ (text only) │         │              │ useLiveQuery()         │  │
│  └──────┬──────┘         │              │ useOptimisticMutation()│  │
│         │                │              └────────────────────────┘  │
│         │          ┌─────┴──────┐                                   │
│         │          │ Pending TX │ (optimistic, not yet confirmed)   │
│         │          │ queue      │                                    │
│         │          └─────┬──────┘                                   │
└─────────┼────────────────┼──────────────────────────────────────────┘
          │                │
    Loro sync         Datom sync
    (updates)         (version vector + delta)
          │                │
    ┌─────▼────────────────▼──────────────────────────────────────────┐
    │ WARM (Server — always-on, memory-bounded)                       │
    │                                                                  │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
    │  │ Full datom   │  │ DuckDB       │  │ Loro relay           │  │
    │  │ indexes      │  │ in-memory    │  │ (text doc sync)      │  │
    │  │ EAVT/AEVT   │  │ virtual tbls │  │                      │  │
    │  │ AVET/VAET   │  │ over indexes │  │                      │  │
    │  └──────┬───────┘  └──────────────┘  └──────────┬───────────┘  │
    │         │     Datom watches (triggers)           │              │
    │         │     ┌────────────────────┐             │              │
    │         ├────►│ Notifications      │             │              │
    │         ├────►│ Derived calcs      │             │              │
    │         ├────►│ Validation rules   │             │              │
    │         │     └────────────────────┘             │              │
    └─────────┼───────────────────────────────────────┼──────────────┘
              │                                        │
        Append to                                Loro snapshots
        Hypercore feed                           to disk
              │                                        │
    ┌─────────▼────────────────────────────────────────▼──────────────┐
    │ COLD (Disk — grows unbounded)                                    │
    │                                                                  │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
    │  │ Hypercore    │  │ Hyperbee     │  │ DuckDB on-disk       │  │
    │  │ feeds (WAL)  │  │ (B-tree)     │  │ (analytics)          │  │
    │  │ per peer     │  │ cold index   │  │                      │  │
    │  │ signed       │  │              │  │ Loro snapshots       │  │
    │  └──────────────┘  └──────────────┘  └──────────────────────┘  │
    └──────────────────────────────────────────────────────────────────┘
```

### 6.2 Why d2ts Specifically

d2ts (the differential dataflow engine behind TanStack DB) is a
standalone TypeScript library. It doesn't require TanStack Query or
ElectricSQL. Its core concept:

- Data enters as a **MultiSet**: `[[datom, +1]]` (add) or `[[datom, -1]]`
  (retract)
- Operations (map, filter, join, reduce) form a **dataflow graph**
- When input changes, only affected paths in the graph recompute
- Output is a **stream of diffs**, not full results

This maps perfectly onto datom watches:

```typescript
// Feed datom changes into d2ts
db.watch({ a: 'session/date' }, (datoms) => {
  for (const d of datoms) {
    d2tsInput.sendData(version, [
      [d, d.op === 'assert' ? 1 : -1]  // MultiSet diff
    ]);
  }
  d2tsInput.sendFrontier(version + 1);
});

// d2ts pipeline: upcoming sessions with client names
const pipeline = d2tsInput
  .filter(([d]) => d.v >= today())
  .map(([d]) => [d.e, d])           // key by entity
  .join(clientNames)                 // join with client name index
  .reduce((key, datoms) => /* build view object */);
```

Sub-millisecond query updates. The datom watch feeds d2ts, d2ts feeds
React, React renders. No polling, no full re-query.

### 6.3 The Sync Protocol (< 200 Lines)

```typescript
// Version vector: { [peerId]: lastSeenTxOrdinal }
type VersionVector = Record<string, number>;

// Client connects
client.send({ type: 'hello', version: myVersionVector });

// Server computes delta
const missingDatoms = store.datomsSince(clientVersion);
server.send({ type: 'catch-up', datoms: missingDatoms, version: serverVersion });

// Client transacts (optimistic)
client.send({ type: 'tx', datoms: [...], txMeta: {...} });

// Server validates, stores, broadcasts
server.broadcast({ type: 'tx', datoms: [...], txMeta: {...} });
// Each client integrates: update local indexes, feed d2ts, UI updates

// Offline reconnect: same as initial connect
// Client sends stale version vector, server sends accumulated delta
```

### 6.4 Memory Management

**Warm tier eviction**:
- Entities not accessed in N days → evict from indexes (keep in cold)
- Loro documents not actively edited → export shallow snapshot, release
- DuckDB virtual tables reference indexes (no duplication)
- Monitor total index size; evict LRU entities when pressure exceeds threshold

**Hot tier scoping** (TanStack DB sync modes applied to datoms):
- **Eager**: Small reference data (practitioners, room list) — load all
- **On-demand**: Large sets (full client history) — load on navigate
- **Progressive**: Working set (this week's sessions) — load subset
  immediately, sync rest in background

**Cold tier compaction**:
- Hypercore feeds are immutable (no compaction needed)
- Loro documents: periodic shallow snapshot (discards old operations)
- DuckDB: standard columnar compaction

---

## 7. Index Architecture

(Unchanged from v0.2 — EAVT/AEVT/AVET/VAET, dictionary encoding,
DuckDB virtual tables over warm indexes.)

---

## 8. Open Questions (Narrowed)

1. **d2ts integration depth**: Use d2ts as a library directly, feeding
   it MultiSet diffs from datom watches? Or build a thinner reactive
   layer specific to our index structure? d2ts gives us joins and
   aggregates for free, but adds a dependency.

2. **Loro document granularity**: One LoroDoc per text-valued entity
   (e.g., per session note), or one LoroDoc per workspace with nested
   LoroText containers? Per-entity is simpler to reason about but means
   many small documents. Per-workspace consolidates but grows the single
   document's oplog.

3. **Version vector implementation**: Roll our own (simple — a map of
   peer IDs to ordinals) or find a library? Our datom-level version
   vector is simpler than Loro's (which tracks per-operation causality).

4. **Warm tier eviction policy**: Time-based (archive after 90 days of
   no access)? LRU? Explicit archival UI? Probably: explicit archival
   for client records, LRU for cached query results.

5. **Signing**: Variant B doesn't have Hypercore's crypto signatures on
   the live sync path. Do we need to sign transactions ourselves for
   compliance? If so, each peer signs their tx with a keypair.

---

## 9. Implementation Phases

### Phase 1 — Core Datom Engine + Indexes
- Datom type, schema-as-datoms, ULID
- EAVT/AEVT/AVET/VAET indexes (sorted arrays or B+ tree)
- `transact`, `entity`, `pull`, `datoms`, `watch`
- Version vector implementation
- Tests

### Phase 2 — Warm Tier + Sync Protocol
- WebSocket server with version-vector sync
- Datom store with validation
- DuckDB virtual table glue
- Broadcast to connected clients

### Phase 3 — Hot Tier + d2ts
- Client-side indexes + IndexedDB bootstrap
- d2ts integration for reactive queries
- `useLiveQuery`, `useOptimisticMutation`
- Offline TX queue with reconciliation

### Phase 4 — Loro for Collaborative Text
- LoroText per text-valued attribute
- Loro sync over same WebSocket (multiplexed)
- Loro snapshot lifecycle (compaction)

### Phase 5 — Cold Tier
- Hypercore WAL on server
- Hyperbee cold indexes
- DuckDB on-disk analytics
- Warm → cold eviction flow

### Phase 6 — P2P (Future)
- Hyperswarm peer discovery
- Direct client-to-client sync
- Move toward Variant A if P2P becomes critical

---

## Appendix: Influences

| Source | What we take | What we leave |
|--------|-------------|---------------|
| **DataScript** | Datom shape, 3+1 indexes, tx-reports, pull API, filtered DBs | Datalog, ClojureScript |
| **Datomic** | Immutable facts, tx-as-entity, schema-as-data | Server arch, Cassandra |
| **Hexastore/RDF-3X** | Dictionary encoding, index selection theory | RDF, SPARQL, 6 indexes |
| **Kappa Architecture** | Log as source of truth, materialized views, view regeneration | Kafka, JVM ecosystem |
| **kappa-core** | Hypercore + materialized views pattern, view versioning | Abandoned codebase |
| **TanStack DB** | Differential dataflow concept, optimistic mutations, sync modes | TanStack Query, ElectricSQL |
| **d2ts** | TypeScript differential dataflow engine, MultiSet diffs, pipeline API | ElectricSQL integration |
| **Loro** | LoroText (Fugue), LoroTree (Kleppmann), version vectors, shallow snapshots | Using as total sync engine |
| **Holepunch** | Hypercore WAL, Hyperswarm (future P2P), Hyperbee, Autobase (evaluated, deferred) | Pear runtime |
| **CRDT theory** | Datoms as OR-Set CRDT, operation-based commutativity, version vectors | Complex CRDT types for structured data |
