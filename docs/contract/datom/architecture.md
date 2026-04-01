# The Datom Data World

## Architecture for a Local-First Practice Management Platform

**Version 0.8 — Iroh + MoQ Stack**
**Date: 2026-04-01**
**Supersedes: v0.7 (Holepunch/Hypercore stack)**

---

## 1. Two Core Insights

### 1.1 Datoms ARE a CRDT

An `assert` datom is an add-operation to a grow-only set. A `retract` is
a tagged remove. They're commutative. The datom log is an operation-based
CRDT. We need iroh-blobs for content-addressed frozen storage, a
materializer for indexes, and version vectors for causal delivery. Loro
is for rich text only (Fugue algorithm).

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
content syncs via a dedicated Loro MoQ track.

### 2.5 External Identity Resolution

Multiple external identifiers on one entity, all as datoms, all
queryable via AVET index. Identity mappings travel with the datoms when
entities are shared.

---

## 3. The Networking Layer: MoQ over QUIC via Iroh

MoQ (Media over QUIC) provides track-based pub/sub over QUIC. Iroh
provides P2P transport with NAT traversal (iroh-net, DERP relays).
See `contract/p2p/lean-stack-v2.md` for the full protocol stack.

Key MoQ tracks for datom operations:
1. **Datom sync** (`{namespace}/datoms/{entity-ns}`) — datom multisets as MoQ groups
2. **Loro text sync** (`{namespace}/notes/{doc-id}`) — rich text CRDT updates
3. **Presence** (`{namespace}/presence`) — lightweight status track
4. **Media** (`{namespace}/{peer}/video`, `audio`) — MoQ hang format

All clients (browser + native) connect via the same MoQ protocol.
Browsers use WebTransport over HTTP/3; native clients use QUIC via Iroh.

---

## 4. Temperature Tiers

### 4.1 Three Temperatures, One Diff Shape

```
Frozen (iroh-blobs) ──diffs──► Warm (Indexes) ──diffs──► Hot (UI)
```

### 4.2 Storage Architecture

iroh-blobs provides content-addressed, BLAKE3-verified frozen storage.
Each blob is a batch of datom transactions, content-addressed by hash.

| Property          | Web (browser)       | Native (desktop/mobile) | Server (always-on)  |
|-------------------|---------------------|-------------------------|---------------------|
| Transport         | WebTransport (H3)   | QUIC via Iroh           | QUIC via Iroh       |
| Pub/sub           | MoQ                 | MoQ                     | MoQ                 |
| Frozen store      | IndexedDB / OPFS    | iroh-blobs on disk      | iroh-blobs on disk  |
| Warm indexes      | In-memory (partial) | In-memory (own data)    | In-memory (all)     |
| Cold indexes      | —                   | TBD (open question)     | TBD (open question) |
| Bootstrap         | IndexedDB cache     | iroh-blobs on disk      | iroh-blobs on disk  |
| Offline           | Seconds (tab open)  | Days/weeks              | Always-on           |
| Identity          | Keypair (IDB)       | Keypair (iroh-net)      | Keypair (iroh-net)  |

Note: "In-memory (partial)" means the web client materializes indexes
only for the datoms it has downloaded. "In-memory (own data)" means the
native client materializes its own practice data. "In-memory (all)" means
the server materializes all active entities across all practices.

### 4.3 Index Storage: Same Approach, Different Scope

Both native client and server build EAVT/AEVT/AVET/VAET indexes as
in-memory sorted maps. The source differs:

- **Server**: Materializes from ALL peers' datom blobs → full warm
  indexes. These are derived state, rebuilt on startup by replaying
  blobs through the d2ts materializer.
- **Native client**: Materializes from its own blobs + selectively
  replicated blobs → indexes over its own practice data.
- **Web client**: Materializes from datoms received during the session →
  partial indexes over the current view.

**Open question**: Cold-tier indexing technology is TBD. The old stack
used Hyperbee (B-tree on Hypercore). How Iroh + MoQ best support
range-scannable cold indexes needs a spike. See `intent/` for
exploration.

---

## 5. Diff Replay at Every Boundary

### 5.1 The Datom as Universal Currency

The datom's `op` field is the multiplicity. No separate diff type.

```
MoQ track delivery → datom with op:'assert' or op:'retract'
  → d2ts input: [datom, datom.op === 'assert' ? 1 : -1]
  → operators: resolve LWW, maintain indexes, filter, join, sort
  → output: updated query results
```

### 5.2 d2ts at Every Temperature

**Frozen → Warm**: d2ts materializer pipeline. iroh-blobs deliver
batched datoms as MultiSet entries. d2ts operators resolve LWW conflicts
and maintain the four indexes.

**Warm → Hot**: d2ts query pipeline. Index updates feed into reactive
queries (filter, join, sort, aggregate). Sub-ms UI updates.

One engine, two pipeline stages.

### 5.3 Subscription as Replication Filter

A client's query expression simultaneously drives:
1. MoQ track subscription (which datom tracks to receive)
2. Server push notifications (which diffs to forward)
3. d2ts pipeline input filter (which diffs to process)

One expression, three effects.

### 5.4 Same Operations at Every Layer

| Operation | Frozen (iroh-blobs)      | Warm (Indexes)          | Hot (UI)               |
|-----------|--------------------------|-------------------------|------------------------|
| Read      | `blob.get(hash)`         | `db.entity(id)`         | `useLiveQuery()`       |
| Write     | `blob.put(datoms)`       | `db.transact([...])`    | `useOptimisticMutation()` |
| List      | `blob.list(prefix)`      | `db.datoms('aevt', a)`  | d2ts collection output |
| Watch     | MoQ track subscription   | `db.watch({ a })`       | d2ts subscription      |

---

## 6. Video and Media

Video is built directly on MoQ using the `hang` format (WebCodecs-based).
No external dependency on Keet or Pear. See `contract/p2p/lean-stack-v2.md`
§4 for the hang format details, track patterns, and congestion priority.

---

## 7. Index Architecture

EAVT/AEVT/AVET/VAET in-memory sorted maps with dictionary encoding.
DuckDB virtual tables on server for analytics (L3 query layer).
Cold-tier range queries: **open question** — was Hyperbee, needs spike
to determine best approach with Iroh + MoQ.

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

### 11.2 Browser Storage — RESOLVED

With the move to Iroh + MoQ, the Hypercore-in-browser problem is
eliminated. Browsers connect via WebTransport (HTTP/3) to a MoQ relay.
Frozen datom blobs are cached locally using IndexedDB or OPFS (Origin
Private File System). No native code dependency in the browser.

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

1. Native client generates keypair on first launch (iroh-net manages
   this automatically)
2. Web client generates keypair, stores in IndexedDB
3. Practitioner creates a "device link" transaction on the native client:
   ```
   [practitioner-eid, "identity/device", web-pubkey-hex, tx, assert]
   [practitioner-eid, "identity/device-name", "Office Chrome", tx, assert]
   ```
4. This datom replicates to the server via MoQ datom track
5. When web client connects, server checks its handshake pubkey
   against `identity/device` datoms → grants workspace access

Linking mechanism: QR code displayed by native app, scanned by browser.
The QR contains the Iroh endpoint ID + a one-time token. Browser
connects via MoQ relay, presents its pubkey, native client creates the
device claim datom.

### 11.5 d2ts Runtime — RESOLVED

With the move to browser-native + Rust sidecar (no Bare/Pear), d2ts
runs in two proven environments: browser (TypeScript, already validated)
and Node.js/Bun for the optional server component. No Bare runtime
compatibility concern.

---

## 12. Remaining Open Questions

1. **Cold-tier indexing**: How do Iroh + MoQ support range-scannable
   cold indexes? Was Hyperbee (B-tree on Hypercore). Options: DuckDB
   for analytics-only cold queries, SQLite for general-purpose cold
   indexes, or a custom B-tree on iroh-blobs. **Needs spike.**

2. **Peer discovery details**: iroh-net provides NAT traversal (DERP
   relays, iroh-dns). MoQ relay provides track catalog/announcement.
   How these compose for room-based discovery (counseling sessions,
   collaborative workspaces) **needs spike and implementation**.

3. **d2ts warm-tier startup**: How fast is replaying 500k datoms through
   d2ts? Needs benchmarking in Phase 1. If slow, hybrid approach: direct
   materialization for cold start, d2ts for incremental updates.

4. **Loro document granularity**: One LoroDoc per text attribute instance
   (e.g., per session note) vs. one LoroDoc per workspace with nested
   containers. Per-instance is simpler, more documents to manage.
   Per-workspace consolidates but the oplog grows. **Lean toward
   per-instance** — each session note is independent, rarely co-edited
   across notes simultaneously.

5. **Warm tier eviction policy**: When does an entity go warm → cold?
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

3. **One transport, many tracks.** MoQ over QUIC via Iroh. Adding a
   new data flow = one MoQ track subscription.

4. **Transport-agnostic peers.** Same code on native (QUIC via Iroh)
   and web (WebTransport via MoQ relay).

5. **Subscriptions are replication filters.** A query drives sparse
   download, server push, and d2ts pipeline input.

6. **Identity is datoms.** External IDs, Noise keypairs, device links
   — all datoms on the same entity.

## Appendix B: Influences

> These sources influenced the design. Technologies marked † have since
> been replaced by Iroh + MoQ (see §3 and `contract/p2p/lean-stack-v2.md`).

| Source | What we take | What we leave |
|--------|-------------|---------------|
| **DataScript** | Datom shape, 3+1 indexes, pull API | Datalog, ClojureScript |
| **Datomic** | Immutable facts, tx-as-entity, schema-as-data | Server arch |
| **Hexastore/RDF-3X** | Dictionary encoding, index selection | RDF, SPARQL |
| **Kappa Architecture** | Log as truth, materialized views | Kafka, JVM |
| **Loco** | Temperature model, replay-diffs-universal, tree-is-API, subscription-as-filter, external identity | C#/.NET, Starcounter |
| **TanStack DB / d2ts** | Differential dataflow at all tiers, optimistic mutations | ElectricSQL, TanStack Query |
| **Loro** | LoroText (Fugue), LoroTree, version vectors | Using as total sync |
| **Iroh** | P2P transport, NAT traversal (DERP), content-addressed blobs (BLAKE3) | — (current stack) |
| **MoQ** | Track-based pub/sub over QUIC, hang media format, relay infrastructure | — (current stack) |
| **Protomux** † | Channel multiplexing concept (influenced MoQ track design) | Replaced by MoQ tracks |
| **Hypercore** † | Append-only log concept, Merkle verification, sparse replication | Replaced by iroh-blobs |
| **Hyperswarm** † | Peer discovery concept, NAT traversal | Replaced by Iroh (iroh-net, DERP) |
| **Keet / Pear** † | Demonstrated P2P-first UX, room-based collaboration | Replaced by MoQ hang for video |
| **CRDT theory** | Datoms as OR-Set, commutativity | Complex CRDTs for structured data |
