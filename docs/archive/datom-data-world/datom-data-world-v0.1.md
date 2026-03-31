# The Datom Data World

## Architecture for a Local-First Practice Management Platform

**Version 0.1 — Brainstorm Draft**
**Date: 2026-03-23**

---

## 1. The Unifying Idea

Every piece of information in the system is a **datom**: an immutable fact
`[entity, attribute, value, transaction, operation]` that flows through three
temperature tiers — cold, warm, hot — without changing shape. The datom is the
universal unit of truth; the tiers differ only in *how* the datom is indexed,
*how long* it stays, and *who* can reach it.

This is the "everything is a location" principle applied to data: a datom about
a client's name is the same datom whether it sits in a Hypercore append log, a
server-side indexed store, or a client's reactive query cache. Only the address
changes.

---

## 2. The Datom

### 2.1 Shape

```typescript
type Datom = {
  e: EntityId;      // ULID — globally unique, no coordination
  a: Attribute;     // Namespaced string: "client/name", "session/date"
  v: DatomValue;    // Primitive | EntityId (for refs) | null (for retraction)
  tx: TxId;         // ULID of the transaction that produced this datom
  op: 'assert' | 'retract';
};

type EntityId = string;   // ULID
type TxId = string;       // ULID
type Attribute = string;  // Namespaced: "domain/attr"
type DatomValue = string | number | boolean | EntityId | null;
```

### 2.2 Why ULID

ULIDs give us: globally unique without coordination (essential for offline-first),
lexicographically sortable by creation time (natural ordering in indexes), and
128-bit collision resistance. Every peer generates its own entity IDs and
transaction IDs independently.

### 2.3 Schema-as-Data

Schema is minimal and lives as datoms itself (or as a replicated LoroMap):

```typescript
type AttrSchema = {
  cardinality: 'one' | 'many';
  valueType?: 'ref' | 'text' | 'instant' | 'number' | 'boolean' | 'string';
  unique?: 'identity' | 'value';
  index?: boolean;      // whether to include in AVET
  doc?: string;         // human description
};
```

Only `cardinality` is required. Everything else is inferred or optional.
`valueType: 'ref'` means the value is an EntityId pointing to another entity —
this enables the VAET reverse-reference index. `valueType: 'text'` signals that
the value should be backed by a LoroText container for collaborative rich-text
editing.

### 2.4 Transactions

A transaction is a batch of datoms that are applied atomically. Every transaction
is itself an entity with its own datoms:

```typescript
// Transaction metadata — stored as datoms about the tx entity
[tx-id, "tx/time",   "2026-03-23T14:30:00Z", tx-id, "assert"]
[tx-id, "tx/peer",   "peer-abc-123",          tx-id, "assert"]
[tx-id, "tx/source", "ui:session-form",       tx-id, "assert"]
```

This means you can query "who changed what, when, from where" using the same
datom query machinery. No separate audit log needed.

---

## 3. The Three Temperatures

### 3.1 Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  HOT (Client)          WARM (Server)         COLD (Storage)     │
│  ┌─────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │ Loro Doc    │◄────►│ Loro Doc     │◄────►│ Hypercore    │   │
│  │ In-memory   │ sync │ In-memory    │ WAL  │ append-log   │   │
│  │ indexes     │      │ full indexes │      │ + Hyperbee   │   │
│  │ Reactive    │      │ Query engine │      │ PostgreSQL   │   │
│  │ queries     │      │ NATS pub/sub │      │ DuckDB       │   │
│  └─────────────┘      └──────────────┘      └──────────────┘   │
│                                                                 │
│  Subset of data        All active data       All data ever      │
│  Optimistic mutations  Indexed, queryable    Durable, archival  │
│  Sub-ms reactivity     Sub-second queries    Analytics, backup  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Cold Tier — Hypercore + Persistent Storage

**What lives here:** Every datom that was ever asserted or retracted. The
complete, immutable, append-only history.

**Hypercore as WAL:**
- Each peer has its own Hypercore feed (single-writer append-only log)
- Cryptographically signed — tamper-evident audit trail for free
- Hyperswarm DHT provides peer discovery without a central server
- Sparse replication: peers only download the ranges they need

**Hyperbee for indexed cold queries:**
- B-tree built on top of Hypercore
- Enables key-range scans over the cold store
- Useful for: "give me all datoms for entity X from 2024"

**PostgreSQL for relational cold queries:**
- Datoms materialized into a `datoms` table with proper indexes
- Serves as the "system of record" for compliance/legal
- Enables SQL-based reporting that the datom model doesn't optimize for

**DuckDB for analytics:**
- Columnar engine for analytical queries over historical datoms
- "How many sessions per client per month over the last 2 years"
- Fed from PostgreSQL or directly from Hypercore exports

**Key principle:** Cold storage is write-once, read-seldom. It exists for
durability, auditability, and analytics — not for serving the application.

### 3.3 Warm Tier — Server-Side Indexed Datoms

**What lives here:** All *active* datoms — the current state of every entity
that hasn't been archived. Fully indexed, queryable, and the authority for
resolving conflicts.

**Loro Document as the sync substrate:**
- One LoroDoc per "workspace" (a practitioner's practice, or a shared practice)
- The LoroDoc contains:
  - `LoroList("datoms")` — the append-only datom log
  - `LoroMap("schema")` — attribute definitions
  - `LoroMap("entity-state")` — materialized current state per entity
  - `LoroMap("tx-meta")` — transaction metadata
- Loro handles CRDT merge for concurrent operations
- Export/import for sync between peers and cold storage

**In-memory indexes (rebuilt from Loro state on startup):**
- **EAVT** — entity lookup: "all facts about client X"
- **AEVT** — attribute scan: "all entities with session/date"
- **AVET** — value lookup: "entity where client/email = 'x@y.com'"
- **VAET** — reverse refs: "all sessions referencing client X"

Indexes are ephemeral sorted maps (e.g., B+ tree or sorted array). They are
NOT stored in Loro — they are derived state, rebuilt on startup and maintained
incrementally via Loro's `subscribe` events.

**NATS for real-time distribution:**
- Transaction events published to NATS subjects per workspace
- Enables server-to-server replication and client notifications
- Subject pattern: `workspace.{id}.tx.{entity-type}`

**Key principle:** Warm tier is the working set. Fast, indexed, always
consistent. It's the source that feeds the hot tier.

### 3.4 Hot Tier — Client-Side Reactive Store

**What lives here:** A *subset* of the warm tier — the datoms relevant to the
current user's current view. Plus optimistic mutations not yet confirmed.

**Design influenced by TanStack DB:**

TanStack DB's core ideas that we adopt:
- **Collections as typed views** — each UI concern (clients list, session
  calendar, notes editor) maps to a "collection" that is a filtered, indexed
  subset of datoms
- **Differential dataflow for reactive queries** — when a datom changes, only
  the affected query results recompute, not all queries
- **Optimistic mutations with rollback** — UI updates instantly; if the warm
  tier rejects the transaction, the optimistic state rolls back
- **Three sync modes** — eager (small reference data), on-demand (large sets),
  progressive (collaborative workspaces)

**Loro on the client:**
- The client holds its own LoroDoc, synced with the warm tier
- Local mutations append to the client's Loro datom list
- Loro's CRDT merge handles concurrent edits from other peers
- `subscribe` events drive incremental index updates → reactive query
  invalidation

**In-memory indexes (same shape as warm, smaller scope):**
- Same EAVT/AEVT/AVET/VAET structure
- Only contains datoms for entities the client has loaded
- Populated via sync from warm tier (Loro export/import)

**Reactive query layer:**
```typescript
// Conceptual API — influenced by TanStack DB's live queries
const activeClients = useLiveQuery(db => 
  db.datoms('avet', 'client/status', 'active')
    .map(d => db.pull(['client/name', 'client/email', {'session/_client': ['session/date']}], d.e))
);
// Returns reactive array, updates when any referenced datom changes
```

**Key principle:** Hot tier is about speed and UX. It holds just enough data
for the current view, updates optimistically, and reconciles lazily.

---

## 4. Data Flow

### 4.1 Write Path (Client → Cold)

```
1. User action (UI)
   │
2. Optimistic mutation → hot tier indexes update → UI re-renders (<1ms)
   │
3. Datoms appended to client LoroDoc
   │
4. Loro sync → warm tier LoroDoc (via NATS or direct)
   │
5. Warm tier validates, indexes, publishes tx event
   │
6. Datoms appended to peer's Hypercore feed (WAL)
   │
7. Periodic materialization → PostgreSQL / DuckDB
```

### 4.2 Read Path (Cold → Client)

```
1. Client opens a view (e.g., "Client Detail for entity X")
   │
2. Hot tier checks: do I have entity X's datoms?
   │
3. If not → request from warm tier (Loro sync or query)
   │
4. Warm tier serves from in-memory indexes
   │
5. If warm tier doesn't have it (archived) → cold tier lookup
   │
6. Datoms flow back to hot tier, indexes update, UI renders
```

### 4.3 Sync Between Peers

```
Peer A (client)                    Peer B (client)
    │                                  │
    └──── Loro export (updates) ──────►│
    │◄─── Loro export (updates) ───────┘
    │                                  │
    │         ┌─────────┐             │
    └────────►│ Warm    │◄────────────┘
              │ (merge) │
              └─────────┘
                  │
          Hypercore append
```

Loro's CRDT merge is the core conflict resolution mechanism. The warm tier
acts as a reliable relay but is not strictly required — two clients with
Hyperswarm connectivity can sync directly via Loro.

---

## 5. Index Architecture

### 5.1 Index Shape

Each index is a sorted map where the key is a composite of datom components
in a specific order, and the value is the full datom reference.

```typescript
// Conceptual — actual implementation uses sorted arrays or B+ trees
type DatomIndex = SortedMap<CompositeKey, Datom>;

// EAVT: lookup by entity, then attribute, then value, then tx
// Key: `${e}|${a}|${v}|${tx}`
// Query: "all facts about entity X" → prefix scan on `${e}|`

// AEVT: lookup by attribute, then entity
// Key: `${a}|${e}|${v}|${tx}`
// Query: "all clients" → prefix scan on `client/name|`

// AVET: lookup by attribute+value (requires schema index:true)
// Key: `${a}|${v}|${e}|${tx}`
// Query: "entity with email x@y.com" → exact match on `client/email|x@y.com|`

// VAET: reverse refs (only for valueType:ref attributes)
// Key: `${v}|${a}|${e}|${tx}`
// Query: "sessions for client X" → prefix scan on `${clientId}|session/client|`
```

### 5.2 Dictionary Encoding

Inspired by Hexastore and RDF-3X: don't store full strings in index keys.

```typescript
class Dictionary {
  private termToId = new Map<string, number>();
  private idToTerm = new Map<number, string>();
  private nextId = 0;
  
  encode(term: string): number {
    if (!this.termToId.has(term)) {
      this.termToId.set(term, this.nextId);
      this.idToTerm.set(this.nextId, term);
      this.nextId++;
    }
    return this.termToId.get(term)!;
  }
  
  decode(id: number): string {
    return this.idToTerm.get(id)!;
  }
}
```

Integer comparison in sorted indexes is dramatically faster than string
comparison. The dictionary can be stored in a LoroMap for replication.

### 5.3 Incremental Index Maintenance

Indexes are never fully rebuilt after startup. On each Loro `subscribe` event:

```typescript
function onDatomAdded(datom: Datom) {
  const key = compositeKey(datom);
  if (datom.op === 'assert') {
    // For cardinality:one, retract previous value first
    if (schema[datom.a].cardinality === 'one') {
      const prev = eavtIndex.get(prefix(datom.e, datom.a));
      if (prev) removeFromAllIndexes(prev);
    }
    addToAllIndexes(datom);
  } else {
    removeFromAllIndexes(datom);
  }
  // Notify reactive queries that depend on datom.a or datom.e
  invalidateQueries(datom);
}
```

---

## 6. Loro Integration Details

### 6.1 Document Structure

```typescript
const doc = new LoroDoc();

// The datom log — append-only, CRDT-safe (concurrent appends interleave)
const datomLog = doc.getList("datoms");

// Materialized entity state — LWW per attribute via LoroMap
const entities = doc.getMap("entities");
// Structure: { [entityId]: LoroMap { [attr]: value } }

// Schema definitions
const schema = doc.getMap("schema");

// Transaction metadata
const txMeta = doc.getMap("tx-meta");
```

### 6.2 Why Both a Log and Materialized State?

The **datom log** (LoroList) is the source of truth — it preserves full history,
retractions, and transaction boundaries. Concurrent appends from different peers
interleave safely via Loro's list CRDT.

The **entity state** (LoroMap) is the fast-access materialized view. When the
UI needs "current name of client X", it reads `entities.get(x).get("client/name")`
directly — no index scan needed. Loro's LWW semantics on LoroMap resolve
concurrent updates to the same attribute automatically.

The log feeds the indexes (for queries). The entity state feeds the UI (for
direct lookups). Both are derived from the same transactions, kept consistent
by the `transact` function.

### 6.3 Rich Text and Collaborative Editing

For attributes with `valueType: 'text'` (e.g., session notes), the value in
the entity state LoroMap is not a string but a **LoroText container**:

```typescript
// Creating a text-valued attribute
const sessionEntity = entities.getOrCreateContainer(sessionId, new LoroMap());
const notes = sessionEntity.setContainer("session/notes", new LoroText());
notes.insert(0, "Initial session notes...");
```

This means session notes get full CRDT collaborative editing — two practitioners
reviewing the same session can edit notes concurrently with character-level
merge. The datom log records a single datom pointing to the LoroText container
ID, not the full text content.

### 6.4 LoroTree for Hierarchical Data

For hierarchical domain concepts (organizational structure, treatment plan
phases, folder-like categorization):

```typescript
const orgTree = doc.getTree("org-structure");
const practiceNode = orgTree.createNode();
practiceNode.data.set("name", "Main Practice");
const teamNode = orgTree.createNode(practiceNode.id);
teamNode.data.set("name", "Clinical Team");
```

Each tree node has an associated LoroMap (`.data`) — this naturally holds
entity attributes. The tree provides ordered, movable hierarchy with CRDT
semantics (Kleppmann's movable tree algorithm).

---

## 7. Holepunch Stack Integration

### 7.1 Hypercore — The WAL

Each peer maintains its own Hypercore feed:

```
Peer A's feed: [tx1-datoms, tx2-datoms, tx3-datoms, ...]
Peer B's feed: [tx4-datoms, tx5-datoms, ...]
```

Every transaction is serialized and appended. The feed is:
- **Append-only** — datoms are never modified after writing
- **Cryptographically signed** — each entry references the previous hash
- **Sparse-replicable** — peers download only the ranges they need

### 7.2 Hyperswarm — Peer Discovery

```
Practitioner's laptop  ◄──── Hyperswarm DHT ────►  Office server
         │                                              │
         └──── direct connection (noise protocol) ──────┘
```

No central server required for peer discovery. The office server is just
another peer (with more storage and always-on connectivity). When the
practitioner is at a coffee shop, Hyperswarm finds their home server through
the DHT and establishes an encrypted connection.

### 7.3 Hyperbee — Cold Index

Hyperbee provides a B-tree on top of Hypercore:

```typescript
// Cold tier lookup
const bee = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' });
await bee.put(`eavt|${entityId}|client/name`, datom);

// Range query
for await (const entry of bee.createReadStream({ 
  gte: `eavt|${entityId}|`, 
  lte: `eavt|${entityId}|~` 
})) {
  // All datoms for this entity from cold storage
}
```

### 7.4 Autobase — Multi-Writer Coordination

For scenarios where multiple peers need to write to a shared logical feed,
Autobase (Holepunch's multi-writer primitive) linearizes concurrent Hypercore
feeds into a single deterministic view. This complements Loro's CRDT merge:

- **Loro** resolves concurrent *datom-level* conflicts (same attribute edited)
- **Autobase** resolves concurrent *feed-level* ordering (which tx comes first)

Together they provide: Loro for semantic merge, Autobase for causal ordering,
Hypercore for durable storage.

---

## 8. The Query API

### 8.1 Core Primitives (Inspired by DataScript)

```typescript
interface DatomDB {
  // Raw index access
  datoms(index: 'eavt' | 'aevt' | 'avet' | 'vaet', ...components: unknown[]): Datom[];
  
  // Entity as a map
  entity(id: EntityId): Record<Attribute, DatomValue>;
  
  // Declarative pull (recursive, with refs)
  pull(pattern: PullExpr, id: EntityId): unknown;
  
  // Filtered view (same interface, different data)
  filter(predicate: (datom: Datom) => boolean): DatomDB;
}
```

### 8.2 Pull Expressions

```typescript
// "Give me client name, email, and their sessions with dates and notes"
db.pull([
  'client/name',
  'client/email',
  { 'session/_client': [    // reverse ref: sessions pointing to this client
    'session/date',
    'session/duration',
    'session/notes'
  ]}
], clientId);

// Returns:
{
  'client/name': 'Anna Svensson',
  'client/email': 'anna@example.com',
  'session/_client': [
    { 'session/date': '2026-03-20', 'session/duration': 50, 'session/notes': '...' },
    { 'session/date': '2026-03-13', 'session/duration': 50, 'session/notes': '...' },
  ]
}
```

### 8.3 Reactive Queries (TanStack DB Influence)

```typescript
// Live query — re-evaluates incrementally when datoms change
const upcomingSessions = useLiveQuery(db =>
  db.datoms('avet', 'session/date')
    .filter(d => d.v >= today())
    .map(d => db.pull(['session/date', 'session/duration', {'session/client': ['client/name']}], d.e))
    .sort((a, b) => a['session/date'].localeCompare(b['session/date']))
);

// Optimistic mutation — UI updates immediately, syncs in background
const reschedule = useOptimisticMutation(async (sessionId, newDate) => {
  return db.transact([
    { e: sessionId, a: 'session/date', v: newDate }
  ]);
});
```

### 8.4 No Datalog

We deliberately do NOT implement Datalog. The practice management domain has
well-known query patterns: entity lookup, attribute scan, reverse ref
traversal, date range filtering. These are all served by index range scans +
pull expressions. Datalog's power (arbitrary joins, recursive rules) is
unnecessary complexity for this domain.

If analytical queries are needed, they go to DuckDB in the cold tier.

---

## 9. Conflict Resolution

### 9.1 Strategy by Attribute Type

| Attribute type | Conflict strategy | Mechanism |
|----------------|-------------------|-----------|
| cardinality:one, primitive | Last-writer-wins | Loro LoroMap LWW |
| cardinality:many | Union (add-wins) | Both values kept |
| valueType:text | Character-level merge | Loro LoroText (Fugue) |
| valueType:ref | Last-writer-wins | Loro LoroMap LWW |
| Tree structure | Move-wins | Loro LoroTree (Kleppmann) |

### 9.2 The Datom Log as Conflict Record

Because the datom log preserves ALL assertions and retractions (including
concurrent ones), it serves as a permanent record of conflicts. Even after
Loro resolves a conflict via LWW, the log shows both assertions — enabling:

- Audit: "Client name was changed to 'A' by peer X and to 'B' by peer Y at
  the same time; 'B' won because peer Y had a later timestamp"
- Undo: roll back to the state before the conflicting transactions
- Manual review: surface conflicts that might need human attention (e.g.,
  two practitioners changing a treatment plan concurrently)

---

## 10. Security Boundaries

### 10.1 Per-Workspace Isolation

Each practitioner's practice is a separate LoroDoc, Hypercore feed set, and
set of indexes. No data crosses workspace boundaries without explicit sharing.

### 10.2 Filtered Views for Multi-Practitioner

Within a shared practice, filtered database views (Section 8.1) enforce
visibility rules:

```typescript
const myClientsView = db.filter(datom =>
  datom.a.startsWith('client/') && 
  assignedTo(datom.e, currentPractitionerId)
);
// Same DatomDB interface, but only shows my clients
```

### 10.3 Encryption at Rest

Hypercore feeds are encrypted per-peer. The warm tier LoroDoc can be encrypted
at the document level. Client-side (hot tier) operates in-memory only.

---

## 11. Open Questions

1. **Datom log granularity in Loro**: Should each datom be a sub-LoroMap in the
   LoroList, or a serialized JSON string? Maps give per-field CRDT semantics
   (unnecessary for immutable datoms) but add overhead. Strings are compact but
   opaque to Loro.

2. **Entity state as LoroMap vs. derived**: Maintaining both a log AND a
   materialized entity state in Loro doubles the storage. Is the entity state
   LoroMap worth it, or should we derive it purely in-memory from the log?

3. **Hypercore ↔ Loro boundary**: Should Loro sync happen over Hypercore
   (datoms written to Hypercore, then materialized into Loro), or should Loro
   sync independently (its own export/import) with Hypercore as a parallel
   persistence layer?

4. **Index data structure**: Sorted array with binary search (simple, cache-
   friendly) vs. B+ tree (better for large datasets, range iteration) vs.
   skip list (good concurrent access). For <100k datoms on the client, sorted
   arrays are likely sufficient.

5. **Transaction validation**: Where does validation live? If the warm tier
   validates (schema conformance, uniqueness constraints), what happens to
   optimistic mutations that the warm tier rejects?

6. **Archival boundary**: When does an entity move from warm to cold-only?
   After a time threshold? After explicit archival? How does the hot tier
   handle requests for archived entities?

7. **LoroText lifecycle**: When a session note (LoroText) is "done", should
   it be frozen/compacted? How do we handle the growing operation log of
   a LoroText container that's been heavily edited?

---

## 12. Implementation Phases

### Phase 1 — Core Datom Engine (TypeScript)
- Datom type, schema, entity ID generation (ULID)
- In-memory indexes (EAVT, AEVT, AVET)
- `transact` function with tx-reports
- `entity`, `pull`, `datoms` query API
- Unit tests for all query patterns

### Phase 2 — Loro Integration
- LoroDoc structure (datom log + entity state)
- Incremental index maintenance via `subscribe`
- Two-peer sync (export/import)
- LoroText for session notes

### Phase 3 — Reactive Query Layer
- `useLiveQuery` hook (React)
- Optimistic mutations with rollback
- Collection-based sync modes (eager, on-demand, progressive)

### Phase 4 — Holepunch Integration
- Hypercore feed per peer
- Hyperbee cold indexes
- Hyperswarm peer discovery
- Autobase multi-writer linearization

### Phase 5 — Persistent Cold Storage
- PostgreSQL materialization
- DuckDB analytics views
- Archival/restoration flow

---

## Appendix A: Influences and Attributions

| Source | What we take | What we leave behind |
|--------|-------------|---------------------|
| **DataScript** | Datom shape, 3+1 indexes, tx-reports, pull API, filtered DBs, schema-as-data | Datalog query engine, ClojureScript runtime, BTSet implementation |
| **Datomic** | Immutable facts, time-travel, tx-as-entity, attribute namespacing | Server architecture, Cassandra/DynamoDB storage, ions |
| **Hexastore** | Dictionary encoding, the insight that 3 indexes cover real query patterns (6 is overkill) | RDF/SPARQL, 6-fold index redundancy |
| **TanStack DB** | Reactive live queries, optimistic mutations, differential dataflow, sync modes (eager/on-demand/progressive) | TanStack Query dependency, ElectricSQL coupling, REST/GraphQL adapter model |
| **Loro** | CRDT containers (Map, List, Text, Tree), Fugue text algorithm, version vectors, subscription events | — (we use it wholesale) |
| **Holepunch** | Hypercore WAL, Hyperswarm discovery, Hyperbee cold index, Autobase multi-writer | Keet, Pear runtime, desktop app model |
| **NATS** | Pub/sub for tx distribution, subject-based routing, JetStream persistence | Request/reply RPC pattern (we use datom sync instead) |
