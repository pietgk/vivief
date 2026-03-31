# The Datom Data World

## Architecture for a Local-First Practice Management Platform

**Version 0.7 — Refined Architecture**
**Date: 2026-03-24**

---

## 1. Two Core Insights

### 1.1 Datoms ARE a CRDT

An `assert` datom is an add-operation to a grow-only set. A `retract` is
a tagged remove. They're commutative. The datom log is an operation-based
CRDT. We need Hypercore for logs, a materializer for indexes, and version
vectors for causal delivery. Loro is for rich text only (Fugue algorithm).

### 1.2 Replay Diffs Is the Universal Operation

Every boundary — peer sync, index materialization, reactive queries, UI
rendering — is crossed the same way: a consumer replays diffs it hasn't
seen. The diff is always a datom. The datom's `op` field IS the
multiplicity.

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

The `op` field serves dual purpose: it defines the datom's semantic
meaning (a fact is being stated or withdrawn) AND it maps directly to
d2ts multiplicity (`assert` = +1, `retract` = -1). There is no separate
"diff" type. The datom IS the diff unit.

```typescript
// At the d2ts boundary — a one-liner, not a type
function datomToEntry(d: Datom): [Datom, 1 | -1] {
  return [d, d.op === 'assert' ? 1 : -1];
}
```

### 2.2 Schema-as-Datoms

Schema is defined as datoms. Schema evolution is datom transactions.
Queryable, versionable, auditable with the same machinery as domain data.

### 2.3 Transactions as Entities

Every transaction is an entity with metadata datoms. No separate audit
log.

### 2.4 Rich Text as ContainerRef

When `db/valueType` is `"text"`, the datom value is a Loro pointer. The
content syncs via the Loro Protomux channel.

### 2.5 External Identity Resolution

Multiple external identifiers on one entity, all as datoms, all
queryable via AVET index. Identity mappings travel with the datoms when
entities are shared.

---

## 3. The Essential Networking Layer: Protomux

(Unchanged from v0.6 — see that document for full protocol stack,
channel definitions, and dht-relay explanation.)

Three channels over one Noise-encrypted stream:
1. **Hypercore replication** (`hypercore/alpha`) — datom feeds
2. **Loro text sync** (`loro-text/v1`) — rich text deltas
3. **App RPC** (`datom-app/v1`) — queries, subscriptions, presence

All clients (Pear + Web) use the same Protomux stack. Web clients reach
Hyperswarm via dht-relay (WebSocket → blind relay → UDP).

---

## 4. Temperature Tiers

### 4.1 Three Temperatures, One Diff Shape

```
Frozen (Hypercore) ──diffs──► Warm (Indexes) ──diffs──► Hot (UI)
```

### 4.2 Storage Clarification

Hypercore 11 uses RocksDB internally as its storage engine. We don't
introduce RocksDB as a separate technology — it's how Hypercore persists
feed entries to disk. When we say "Hypercore on disk," that's RocksDB
underneath, managed entirely by Hypercore.

| Property          | Web (browser)       | Pear (phone/desktop)| Server (always-on)  |
|-------------------|---------------------|---------------------|---------------------|
| Transport         | WS → dht-relay      | UDP direct          | UDP direct          |
| Connection        | Protomux            | Protomux            | Protomux            |
| Datom feed store  | In-memory HC        | Hypercore on disk   | Hypercore on disk   |
| Warm indexes      | In-memory (partial) | In-memory (own data)| In-memory (all)     |
| Cold indexes      | —                   | Hyperbee on HC      | Hyperbee on HC      |
| Bootstrap         | IndexedDB cache     | Hypercore on disk   | Hypercore on disk   |
| Offline           | Seconds (tab open)  | Days/weeks          | Always-on           |
| Identity          | Noise keypair (IDB) | Noise keypair       | Noise keypair       |

Note: "In-memory (partial)" means the web client materializes indexes
only for the datoms it has downloaded. "In-memory (own data)" means the
Pear client materializes its own practice data. "In-memory (all)" means
the server materializes all active entities across all practices.

### 4.3 Index Storage: Same Approach, Different Scope

Both Pear client and server build EAVT/AEVT/AVET/VAET indexes as
in-memory sorted maps. The source differs:

- **Server**: Materializes from ALL peers' Hypercore feeds → full warm
  indexes. These are derived state, rebuilt on startup by replaying
  feeds through the d2ts materializer.
- **Pear client**: Materializes from its own feed + selectively
  replicated feeds → indexes over its own practice data.
- **Web client**: Materializes from datoms received during the session →
  partial indexes over the current view.

We do NOT use HyperDB's collection abstraction for our datom indexes.
HyperDB is designed for typed collections with named fields — a different
shape than EAV tuples. Instead, we use Hyperbee directly for cold-tier
indexes (range-scannable B-tree on Hypercore) and plain sorted maps for
warm-tier indexes (fastest in-memory access).

HyperDB remains useful if we need a standalone queryable database on
the Pear client for non-datom data (e.g., local app settings, cached
UI state), but it's not the datom index engine.

---

## 5. Diff Replay at Every Boundary

### 5.1 The Datom as Universal Currency

The datom's `op` field is the multiplicity. No separate diff type.

```
Hypercore append event → datom with op:'assert' or op:'retract'
  → d2ts input: [datom, datom.op === 'assert' ? 1 : -1]
  → operators: resolve LWW, maintain indexes, filter, join, sort
  → output: updated query results
```

### 5.2 d2ts at Every Temperature

**Frozen → Warm**: d2ts materializer pipeline. Hypercore appends feed
datoms as MultiSet entries. d2ts operators resolve LWW conflicts and
maintain the four indexes.

**Warm → Hot**: d2ts query pipeline. Index updates feed into reactive
queries (filter, join, sort, aggregate). Sub-ms UI updates.

One engine, two pipeline stages.

### 5.3 Subscription as Replication Filter

A client's query expression simultaneously drives:
1. Sparse Hypercore download (which feed ranges to fetch)
2. Server push notifications (which diffs to forward)
3. d2ts pipeline input filter (which diffs to process)

One expression, three effects.

### 5.4 Same Operations at Every Layer

| Operation | Frozen (Hypercore)       | Warm (Indexes)          | Hot (UI)               |
|-----------|--------------------------|-------------------------|------------------------|
| Read      | `core.get(seq)`          | `db.entity(id)`         | `useLiveQuery()`       |
| Write     | `core.append(datom)`     | `db.transact([...])`    | `useOptimisticMutation()` |
| List      | `core.createReadStream()`| `db.datoms('aevt', a)`  | d2ts collection output |
| Watch     | `core.on('append')`      | `db.watch({ a })`       | d2ts subscription      |

---

## 6. Keet Integration

(Unchanged from v0.6 — shared Hyperswarm, shared identity, in-room
apps, personal relay as server.)

---

## 7. Index Architecture

(Unchanged — EAVT/AEVT/AVET/VAET in-memory sorted maps, dictionary
encoding, DuckDB virtual tables on server, Hyperbee for cold-tier
range queries.)

---

## 8. Query API

(Unchanged — `datoms`, `entity`, `pull`, `filter`, `watch`,
`useLiveQuery`, `useOptimisticMutation`, remote queries via App RPC.)

---

## 9. Conflict Resolution

(Unchanged — LWW for cardinality:one, OR-Set for cardinality:many,
Loro Fugue for text, Loro Kleppmann for trees.)

---

## 10. Implementation Phases

(Unchanged from v0.6.)

---

## 11. Resolved Questions (Previously Open)

### 11.1 d2ts as Warm Materializer — YES, with caveats

d2ts benchmarks show sub-millisecond updates on 100k-item collections.
Our warm tier (10k-50k entities, ~500k datoms) is within that range.

**Startup concern**: Replaying 500k datoms through d2ts on cold start
could be slow (seconds to tens of seconds). Mitigation: d2ts supports
a SQLite backend for persisting operator state. On clean shutdown,
snapshot the d2ts state. On startup, load the snapshot and replay only
new datoms since the snapshot. This gives fast restart without losing
the benefits of d2ts materialization.

**Memory concern**: d2ts maintains internal state per operator. For the
warm pipeline (4 index maintenance operators + LWW conflict resolution),
this is proportional to the active dataset — same as our in-memory
sorted maps. No additional memory overhead beyond what we'd need anyway.

**Decision**: Use d2ts for warm materialization. If it proves too heavy
for startup, the fallback is a simple imperative materializer for cold
start (replay datoms into sorted maps directly) with d2ts taking over
for incremental updates once warm.

### 11.2 Hypercore in the Browser — SPIKE NEEDED

Hypercore 11's storage engine is RocksDB (native C++), which cannot run
in the browser. However, what the browser needs is NOT the storage engine
— it needs the Hypercore replication PROTOCOL running over a dht-relay
WebSocket connection.

Two possible approaches:

**Approach A**: Use Hypercore 10 (or a branch) with `random-access-memory`
storage in the browser. HC 10 supports pluggable storage backends
including in-memory. This is proven to work in browser environments.
Trade-off: using an older Hypercore version, potentially missing HC 11
features.

**Approach B**: Use Corestore with a browser-compatible storage adapter.
Corestore 7 + Hypercore 11 may work if we provide a RocksDB-compatible
shim (e.g., IndexedDB-backed). The `hypercore-storage` module would need
a browser polyfill. This is more work but keeps us on HC 11.

**Decision**: Spike in Phase 3. Start with Approach A (HC 10 + RAM in
browser). If it works, ship it. Evaluate Approach B as an optimization
later. The Protomux protocol is the same regardless of which Hypercore
version the browser uses.

### 11.3 Subscription Filter Granularity — START COARSE

Start with per-attribute-namespace subscriptions:

```javascript
// "Give me all session/* datoms for entities in my workspace"
subscribe({ a: 'session/*', workspace: 'ws-123' })
```

The server maintains a simple map: `Map<peerId, SubscriptionFilter[]>`.
When a datom arrives, check it against each connected peer's filters.
At small scale (5-10 peers, ~10 filters each), this is a trivial loop.

If bandwidth becomes an issue, refine to per-entity-set filters:

```javascript
// "Give me session/* datoms only for these specific client entities"
subscribe({ a: 'session/*', e: ['client-1', 'client-5', 'client-12'] })
```

The server can then use an inverted index (attribute → subscriber list)
for O(1) dispatch. This optimization is deferred to when we have real
usage data.

### 11.4 Keypair and Device Linking — DATOM-BASED

The flow, entirely in datoms:

1. Pear client generates ED25519 keypair on first launch (Hypercore
   stores this automatically)
2. Web client generates keypair, stores in IndexedDB
3. Practitioner creates a "device link" transaction on the Pear client:
   ```
   [practitioner-eid, "identity/device", web-pubkey-hex, tx, assert]
   [practitioner-eid, "identity/device-name", "Office Chrome", tx, assert]
   ```
4. This datom replicates to the server via Hypercore
5. When web client connects, server checks its Noise handshake pubkey
   against `identity/device` datoms → grants workspace access

Linking mechanism: QR code displayed by Pear app, scanned by browser.
The QR contains the Pear client's Hyperswarm topic + a one-time token.
Browser connects, presents its pubkey, Pear client creates the device
claim datom.

Alternative: both are in the same Keet room. Exchange signed proofs
over the Keet connection.

### 11.5 d2ts on Bare Runtime — LIKELY WORKS

d2ts is pure TypeScript: `Map`, `Array`, `Set`, basic JS constructs.
No Node.js-specific APIs (`fs`, `net`, `crypto`). Bare runs ES2020+
JavaScript with full `Map`/`Set`/`Array` support.

**Assessment**: d2ts should work on Bare without modification.

**What to verify in a spike**: `npm install @electric-sql/d2ts`, run a
basic pipeline in a Bare script. If it fails, check for:
- `process.env` references (Bare has `Bare.env` instead)
- `Buffer` usage (Bare has `Buffer` but may differ subtly)
- Import path resolution (Bare uses bare-module-resolve)

The d2ts SQLite backend would need `bare-sqlite` or similar, but
in-memory d2ts should be clean.

**Decision**: Spike early in Phase 2. If d2ts fails on Bare, the Pear
client uses a simpler datom-watch-based reactivity (less elegant, same
functionality). The web client uses d2ts in browser (proven environment).

---

## 12. Remaining Open Questions

1. **Hypercore version for browser**: HC 10 vs HC 11 in browser context.
   Needs Phase 3 spike. Not blocking — both speak the same Protomux
   replication protocol.

2. **d2ts warm-tier startup**: How fast is replaying 500k datoms through
   d2ts? Needs benchmarking in Phase 1. If slow, hybrid approach: direct
   materialization for cold start, d2ts for incremental updates.

3. **Loro document granularity**: One LoroDoc per text attribute instance
   (e.g., per session note) vs. one LoroDoc per workspace with nested
   containers. Per-instance is simpler, more documents to manage.
   Per-workspace consolidates but the oplog grows. **Lean toward
   per-instance** — each session note is independent, rarely co-edited
   across notes simultaneously.

4. **Warm tier eviction policy**: When does an entity go warm → cold?
   Options: explicit archival (practitioner marks client as inactive),
   time-based (no datom activity in 90 days), LRU (when memory pressure
   exceeds threshold). **Lean toward explicit + time-based fallback**.
   Archival itself is a datom: `[client-1, "client/status", "archived",
   tx, assert]`. The materializer watches for this and evicts.

---

## Appendix A: Principles

1. **The datom is the universal primitive.** `[e, a, v, tx, op]` for
   everything: schema, domain data, transactions, identity.

2. **Replay diffs is the universal operation.** Every boundary is
   crossed by replaying datoms. The `op` field IS the multiplicity.

3. **One connection, many protocols.** Protomux over Noise. Adding a
   new protocol = one `createChannel` call.

4. **Transport-agnostic peers.** Same code on Pear (UDP) and web
   (WebSocket relay).

5. **Subscriptions are replication filters.** A query drives sparse
   download, server push, and d2ts pipeline input.

6. **Identity is datoms.** External IDs, Noise keypairs, device links
   — all datoms on the same entity.

## Appendix B: Influences

| Source | What we take | What we leave |
|--------|-------------|---------------|
| **DataScript** | Datom shape, 3+1 indexes, pull API | Datalog, ClojureScript |
| **Datomic** | Immutable facts, tx-as-entity, schema-as-data | Server arch |
| **Hexastore/RDF-3X** | Dictionary encoding, index selection | RDF, SPARQL |
| **Kappa Architecture** | Log as truth, materialized views | Kafka, JVM |
| **Loco** | Temperature model, replay-diffs-universal, tree-is-API, subscription-as-filter, external identity | C#/.NET, Starcounter |
| **TanStack DB / d2ts** | Differential dataflow at all tiers, optimistic mutations | ElectricSQL, TanStack Query |
| **Loro** | LoroText (Fugue), LoroTree, version vectors | Using as total sync |
| **Protomux** | Channel multiplexing, compact-encoding | — (as-is) |
| **Hypercore** | Append-only log, Merkle verify, sparse replication | HyperDB collection model |
| **Hyperswarm + HyperDHT** | Peer discovery, NAT traversal, Noise encryption | — (as-is) |
| **hyperswarm-dht-relay** | WebSocket bridge for browsers | — (as-is) |
| **protomux-rpc** | Request/response over channels | — (as-is) |
| **Keet / Pear** | Shared Hyperswarm, identity, in-room apps, relay | Chat UI |
| **CRDT theory** | Datoms as OR-Set, commutativity | Complex CRDTs for structured data |
