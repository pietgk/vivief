# The Datom Data World

## Architecture for a Local-First Practice Management Platform

**Version 0.2 — Brainstorm Draft**
**Date: 2026-03-23**

---

## 1. The Unifying Idea

Every piece of information in the system is a **datom**: an immutable fact
that flows through three temperature tiers without changing shape. The datom
is the universal unit of truth; the tiers differ only in indexing depth,
retention policy, and memory budget.

This is "everything is a location" applied to data.

---

## 2. The Datom

### 2.1 Shape

```typescript
type Datom = {
  e: EntityId;          // ULID — globally unique, no coordination
  a: Attribute;         // Namespaced: "client/name", "session/date"
  v: DatomValue;        // Primitive | EntityId (for refs) | null
  tx: TxId;             // ULID of the producing transaction
  op: 'assert' | 'retract';
};
```

### 2.2 Schema-as-Datoms

Following the vivief pattern: schema is defined as datoms, with schema
evolution expressed as datoms too. An attribute definition is itself an
entity:

```
[attr-eid, "db/ident",       "client/name",  tx1, assert]
[attr-eid, "db/cardinality", "one",          tx1, assert]
[attr-eid, "db/valueType",   "string",       tx1, assert]
[attr-eid, "db/doc",         "Client name",  tx1, assert]
```

Schema evolution is a transaction like any other:
```
[attr-eid, "db/valueType", "string",  tx1, retract]
[attr-eid, "db/valueType", "text",    tx2, assert]   // upgraded to rich text
```

This means the schema is queryable, versionable, and auditable using the
same datom machinery as domain data.

### 2.3 Transactions as Entities

Every transaction is an entity with metadata datoms:

```
[tx-id, "tx/time",   "2026-03-23T14:30:00Z", tx-id, assert]
[tx-id, "tx/peer",   "peer-abc-123",          tx-id, assert]
[tx-id, "tx/source", "ui:session-form",       tx-id, assert]
```

No separate audit log. "Who changed what, when, from where" is a datom query.

---

## 3. Temperature Tiers

### 3.1 Cold — Grows Unbounded (Disk)

Everything ever recorded. Append-only.

- **Hypercore feeds**: One per peer, cryptographically signed, sparse-
  replicable. This is the WAL.
- **Hyperbee**: B-tree over Hypercore for cold range queries.
- **DuckDB (on-disk)**: Columnar analytics over historical datoms.
  "Sessions per client per month over 2 years."

Cold storage grows over the lifetime of the practice. Hundreds of
thousands of entities, years of history. Disk-bound, never fully in memory.

### 3.2 Warm — Memory-Bounded (Server)

All *active* entities: current clients, recent sessions, open invoices.
Fully indexed in memory. Serves all connected clients.

- **In-memory indexes**: EAVT, AEVT, AVET, VAET (for reverse refs).
  Rebuilt on startup from cold tier, maintained incrementally.
- **DuckDB (in-memory)**: Virtual tables mapped over the indexes with
  minimal glue code, giving SQL access to the warm datom set for ad-hoc
  queries without a separate database.
- **Loro (scoped to shared editing)**: LoroText containers for session
  notes and documents that need concurrent collaborative editing. NOT the
  sync engine for structured datoms — see Section 4.
- **Datom watches**: Subscribers on attribute patterns trigger side
  effects (notifications, derived computations) without external pub/sub.

The warm tier must manage memory pressure: evicting archived entities to
cold, compacting LoroText operation logs, and capping index size.
Estimated working set: 10k–50k entities.

### 3.3 Hot — Tightly Scoped (Client)

A subset of warm: the datoms relevant to *this user's current context*.
Plus optimistic mutations not yet confirmed.

- **Local indexes**: Same EAVT/AEVT shape, smaller scope (100–1000
  entities). Only what the current view needs.
- **Differential dataflow**: Reactive query engine (the core concept from
  TanStack DB / d2ts). When a datom changes, only affected query results
  recompute. Sub-millisecond UI updates.
- **Optimistic state layer**: Mutations apply locally and instantly. If
  the warm tier rejects, the optimistic state rolls back.
- **Local storage bootstrap**: On app launch, load from IndexedDB/SQLite
  cache to render immediately, then sync delta from warm tier.

The hot tier works offline. When reconnected, it exchanges deltas with
warm and resolves any conflicts.

---

## 4. The Sync Problem (What We Need to Decide)

This is the hardest part. We have three technologies that can each move
data between peers, but they solve different problems. The question is:
which one handles which sync?

### 4.1 What Needs Syncing

There are three fundamentally different sync needs:

**A. Structured datom sync** — Moving `[e, a, v, tx, op]` tuples between
tiers and peers. This is the bulk of the data: client records, session
metadata, invoices, schedules.

**B. Collaborative text sync** — Two practitioners editing the same session
notes simultaneously, with character-level merge. A much smaller volume of
data, but with much stricter conflict resolution needs.

**C. Reactive UI sync** — Keeping the hot tier's query results in sync with
the warm tier's indexed state. Not about moving data between peers, but
about efficient change propagation within a single client.

### 4.2 Three Sync Mechanisms Compared

#### Hypercore / Autobase (via Holepunch)

**What it is**: Append-only logs with P2P replication.

**Naturally good at**:
- Durable, ordered, cryptographically verified history
- Peer discovery without central server (Hyperswarm DHT)
- Sparse replication (only fetch the ranges you need)
- WAL semantics (append, never mutate)

**The catch**:
- Single-writer per feed (my feed, my key, only I append)
- Multi-writer requires Autobase: linearizes concurrent feeds into a
  deterministic view via a DAG, with indexer quorum for checkpoints
- No built-in conflict resolution for concurrent edits to the same entity
- Text editing conflict resolution is not something it handles

**Best fit**: Structured datom sync (type A). Each peer appends their
transactions to their own Hypercore. Autobase linearizes the combined
view. The linearized view is the warm tier's input.

**Verdict for our stack**:
- (+) Natural WAL for datoms — append-only matches datom immutability
- (+) Hyperswarm gives us serverless peer discovery
- (+) Cryptographic audit trail for compliance
- (+) Sparse replication lets hot tier fetch just what it needs
- (-) Autobase adds complexity (indexer quorum, reordering on forks)
- (-) Not suitable for collaborative text editing
- (?) Can Autobase's linearized view BE the warm tier's index input?

#### Loro CRDT

**What it is**: Conflict-free replicated data types with rich containers
(Map, List, Text, Tree, MovableList, Counter).

**Naturally good at**:
- Multi-writer merge with automatic conflict resolution
- Rich text editing (Fugue algorithm — character-level merge)
- Hierarchical data (movable tree CRDT for Kleppmann's algorithm)
- Version vectors, time travel, undo/redo
- Subscription events for change notification

**The catch**:
- Every container operation grows the operation log (needs compaction)
- Memory footprint scales with edit history, not just current state
- Designed for document-shaped data, not database-shaped data
- Using LoroMap for every entity's every attribute creates massive
  operational overhead vs. plain datom append

**Best fit**: Collaborative text editing (type B). LoroText for session
notes, treatment plans, any long-form content edited by multiple people.
Possibly LoroTree for hierarchical structures like org charts.

**Verdict for our stack**:
- (+) Solves collaborative text editing perfectly
- (+) LoroTree for movable hierarchies
- (+) Version vectors give us "sync from where you left off"
- (+) Subscribe events can feed datom watches
- (-) Using Loro as the sync engine for ALL datoms is overkill — we'd be
  wrapping immutable facts in CRDT containers that are designed for
  mutable, concurrent editing
- (-) Memory grows with operation history, not just current state
- (?) Could Loro export/import ride on Hypercore as transport?

#### Differential Dataflow (d2ts / TanStack DB pattern)

**What it is**: An incremental computation engine. When input data changes,
it recomputes only the affected parts of derived results.

**Naturally good at**:
- Sub-millisecond query updates on 100k+ item collections
- Joins, filters, aggregates that maintain themselves
- Optimistic mutations with automatic rollback
- Reactive UI subscriptions

**The catch**:
- NOT a sync mechanism between peers — it's a query engine
- Assumes data arrives from somewhere else (a collection, a sync engine)
- No persistence, no replication, no conflict resolution

**Best fit**: Reactive UI sync (type C). The hot tier's query layer. When
datoms arrive from the warm tier, differential dataflow incrementally
updates all active queries and the UI re-renders only what changed.

**Verdict for our stack**:
- (+) Exactly what the hot tier needs for reactive queries
- (+) Optimistic mutations give instant UI feedback
- (+) Collection/sync-mode concepts (eager, on-demand, progressive)
  solve the "how much to load on the client" problem
- (-) Not a replacement for Hypercore or Loro sync
- (-) We'd either use d2ts directly or build the same concept over our
  datom indexes + watches
- (?) Do we use TanStack DB directly, or implement the differential
  dataflow concept ourselves over datom indexes?

### 4.3 How They Compose

The key insight: these three are NOT competing. They operate at different
layers:

```
Layer 4: UI                 Differential dataflow (reactive queries)
                            Subscribes to datom changes, recomputes views
                                       ↑
Layer 3: Conflict resolution Loro CRDT (for text), datom merge (for structured)
                            Resolves concurrent edits, produces clean state
                                       ↑
Layer 2: Transport           Hypercore + Hyperswarm (peer-to-peer)
                            Moves bytes between peers, persists them
                                       ↑
Layer 1: Data model          Datoms [e, a, v, tx, op]
                            The universal shape everything flows as
```

### 4.4 Open Sync Questions (Need Decisions)

**Q1: Datom transport — Hypercore directly, or Hypercore + Autobase?**

Option A: Each peer has one Hypercore feed. They exchange feeds directly.
The warm tier reads all feeds and builds the merged index. Simple, but the
warm tier does all the merge work.

Option B: Use Autobase to linearize feeds into a single deterministic view.
The warm tier reads the linearized view. More complex setup, but merge
logic is handled by Autobase, and the view can be a Hyperbee (indexed).

Option C: Skip Hypercore for sync entirely. Use a simpler datom-exchange
protocol (e.g., "send me all datoms with tx > X"). Hypercore is only the
cold WAL, not the live sync channel.

**Q2: Where does Loro live — client, server, or both?**

Option A: Loro only on the client, scoped to LoroText containers for
rich text. The client syncs Loro documents to the warm tier for storage,
but Loro is not the sync mechanism for structured datoms.

Option B: Loro on both client and server, but only for collaborative
content (notes, plans). Structured datoms sync via Hypercore/Autobase
separately.

Option C: Loro everywhere — structured datoms also stored in LoroMap
containers. This gives us CRDT merge for free but has the overhead issues
discussed above.

**Q3: Hot ↔ warm sync — pull or push?**

Option A: Client pulls. On connect, client sends its version vector (or
latest tx it knows about). Warm tier responds with missing datoms. Client
integrates them into local indexes.

Option B: Warm pushes. Client subscribes to a "my relevant datoms"
channel. Warm tier streams changes as they happen.

Option C: Both. Pull on connect (catch up), push while connected (stay
current). This is what most sync engines do.

**Q4: Hot tier offline — what's the source of truth?**

When the client is offline and makes mutations, those mutations must
survive app restart (local storage) and eventually sync to warm.

Option A: Client persists its pending transactions to IndexedDB. On
reconnect, replays them to the warm tier.

Option B: Client has its own Hypercore feed (local append-only log). On
reconnect, the warm tier replicates the client's feed.

Option C: Client persists a Loro document snapshot. On reconnect, uses
Loro sync to merge with the warm tier's state.

---

## 5. Index Architecture

### 5.1 Four Indexes

Same structure at warm and hot tier, different scope:

- **EAVT**: "All facts about entity X" — client detail view
- **AEVT**: "All entities with attribute Y" — client list, session list
- **AVET**: "Entity where attr=value" — lookup by email, date range
- **VAET**: "Reverse refs" — sessions referencing client X

### 5.2 Dictionary Encoding

Inspired by Hexastore/RDF-3X: integer IDs instead of strings in index
keys. `"client/name"` → `42`. Integer comparison in sorted indexes is
dramatically faster. The dictionary is small and replicates easily.

### 5.3 DuckDB Virtual Tables

The warm tier maps its in-memory indexes to DuckDB virtual tables:

```sql
-- This is DuckDB querying the in-memory datom indexes
SELECT e, v as name FROM datoms_avet 
WHERE a = 'client/name' AND v LIKE 'Anna%';

-- Join across attributes via entity ID
SELECT c.v as name, s.v as date 
FROM datoms_avet c 
JOIN datoms_avet s ON c.e = s.v  -- s.v is a ref to client entity
WHERE c.a = 'client/name' AND s.a = 'session/date';
```

This gives SQL access to the datom store without a separate database.
The glue code maps index iterators to DuckDB's table function interface.

---

## 6. Query API

### 6.1 Core Primitives

```typescript
interface DatomDB {
  datoms(index: IndexName, ...components: unknown[]): Datom[];
  entity(id: EntityId): Record<Attribute, DatomValue>;
  pull(pattern: PullExpr, id: EntityId): unknown;
  filter(predicate: (datom: Datom) => boolean): DatomDB;
}
```

### 6.2 Pull Expressions

```typescript
db.pull([
  'client/name',
  'client/email',
  { 'session/_client': ['session/date', 'session/notes'] }
], clientId);
```

### 6.3 Datom Watches (Replaces NATS)

```typescript
// Watch for changes to any session date
db.watch({ a: 'session/date' }, (datoms, txReport) => {
  // Trigger calendar sync, notifications, etc.
});

// Watch for new entities of a type
db.watch({ a: 'client/status', v: 'active' }, (datoms, txReport) => {
  // New active client — update dashboard
});
```

Watches are local pub/sub on the datom stream. No external messaging
system needed. The warm tier has watches for server-side reactions; the
hot tier has watches for UI reactivity.

### 6.4 Reactive Queries (Hot Tier)

Whether we use TanStack DB's d2ts directly or build our own differential
dataflow over datom watches, the client API looks like:

```typescript
const activeClients = useLiveQuery(db =>
  db.datoms('avet', 'client/status', 'active')
    .map(d => db.pull(['client/name', 'client/email'], d.e))
);
// Re-evaluates incrementally when a client's status changes
```

### 6.5 No Datalog

Pull expressions + index scans + watches cover our domain. Analytical
queries go to DuckDB.

---

## 7. Conflict Resolution

### 7.1 By Data Type

| Data type | Conflict strategy | Mechanism |
|-----------|-------------------|-----------|
| Structured datom, cardinality:one | Last-writer-wins (by tx timestamp + peer tiebreaker) | Warm tier merge logic |
| Structured datom, cardinality:many | Union (both kept) | Append-only log |
| Rich text (session notes) | Character-level merge | Loro LoroText (Fugue) |
| Hierarchical structure | Move-wins | Loro LoroTree (Kleppmann) |

### 7.2 The Datom Log as Conflict Record

Both assertions survive in the cold tier, even after the warm tier picks a
winner. This enables audit ("both peers changed the name"), undo, and
manual review of concurrent modifications.

---

## 8. Security Boundaries

- **Per-workspace isolation**: Separate Hypercore feed sets, separate warm
  indexes, separate Loro documents per practice.
- **Filtered views**: Within a shared practice, `db.filter()` enforces
  per-practitioner visibility. Same DatomDB interface, scoped data.
- **Encryption at rest**: Hypercore feeds encrypted per-peer. Loro
  documents encrypted at document level.

---

## 9. Implementation Phases

### Phase 1 — Core Datom Engine
- Datom type, schema-as-datoms, ULID generation
- In-memory indexes (EAVT, AEVT, AVET, VAET)
- `transact`, `entity`, `pull`, `datoms`, `watch`
- Tests for all query patterns

### Phase 2 — Hypercore Integration
- Per-peer Hypercore feed for datom persistence
- Warm tier reads feeds, builds indexes
- Hyperbee cold indexes
- Hyperswarm peer discovery

### Phase 3 — Hot Tier + UI
- Client-side local indexes
- Reactive queries (differential dataflow or d2ts)
- Optimistic mutations
- IndexedDB bootstrap cache
- Offline support

### Phase 4 — Loro for Collaborative Text
- LoroText containers for session notes
- Loro sync between peers editing the same note
- LoroTree for hierarchical structures (if needed)

### Phase 5 — DuckDB + Analytics
- DuckDB virtual tables over warm indexes
- On-disk DuckDB for cold tier analytics
- Reporting queries

---

## 10. Open Questions

1. **Autobase yes/no?** Does the complexity of Autobase's DAG linearization
   and indexer quorum earn its keep, vs. simpler "each peer sends their
   feed, warm tier merges"?

2. **d2ts vs. own differential dataflow?** TanStack DB's d2ts is proven
   fast but is designed for collections of objects, not datom indexes.
   Adapting it vs. building incremental query maintenance on our own
   datom watches.

3. **Loro transport**: Can Loro export/import ride on Hypercore? Or is that
   mixing two replication channels unnecessarily — simpler to use WebSocket
   for Loro sync and Hypercore for datom sync?

4. **Warm tier eviction**: When does an entity go warm → cold-only? Time-
   based? Explicit archival? LRU? This directly affects memory budgets.

5. **Client Hypercore feed**: Should the client have its own Hypercore
   (Option B in Q4 above) for offline durability, or is IndexedDB
   sufficient? Hypercore gives us crypto guarantees but adds complexity
   on the client.

6. **LoroText compaction**: Heavily-edited session notes accumulate large
   operation logs. When/how do we compact? Snapshot + discard ops? This
   needs a lifecycle policy.

---

## Appendix: Influences

| Source | What we take | What we leave |
|--------|-------------|---------------|
| **DataScript** | Datom shape, 3+1 indexes, tx-reports, pull API, filtered DBs | Datalog, ClojureScript, BTSet |
| **Datomic** | Immutable facts, tx-as-entity, schema-as-data | Server arch, Cassandra |
| **Hexastore** | Dictionary encoding, index selection insight | RDF/SPARQL, 6-fold redundancy |
| **TanStack DB** | Differential dataflow concept, optimistic mutations, sync modes, collection model | TanStack Query dependency, ElectricSQL |
| **Loro** | LoroText (Fugue), LoroTree (Kleppmann), version vectors, subscribe | Using it as total sync engine |
| **Holepunch** | Hypercore WAL, Hyperswarm, Hyperbee, Autobase | Keet, Pear runtime |
