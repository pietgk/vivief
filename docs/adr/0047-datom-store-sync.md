# ADR-0047: Datom Store and Sync Architecture

## Status

Accepted

## Context

The implementation KB §2.2 (Datom Store) and §2.3 (P2P & Replication) framed five storage candidates and three P2P candidates without making decisions. This ADR closes both decision areas together, because they are not independent — the choice of log store shapes the replication model, and the replication model constrains the warm query layer.

**Sources informing this decision:**
- `vivief-concepts-v6.md` §2.1 (Datom), §2.2 (Projection), §2.4 (Sync Contract, Trust Contract)
- `vivief-concepts-v6-implementation-kb.md` §2.2, §2.3, §4 (implementation phases)
- `docs/vision/brainstorms/datom-data-world-v0.7.md` — concrete architecture proposal for a local-first datom store

**Two key insights from the brainstorm:**

1. **The datom log is already a CRDT.** `assert` is an add-operation to a grow-only set; `retract` is a tagged remove. They are commutative. The datom log is an operation-based CRDT. This means the P2P sync problem is largely solved by the data model — no external CRDT library is needed for structured data conflict resolution.

2. **Replay diffs is the universal operation.** Every boundary in the system — peer sync, index materialization, reactive queries, UI rendering — is crossed the same way: a consumer replays datoms it hasn't seen. The `op` field IS the diff multiplicity. One primitive, one operation, every tier.

**Tension with ADR-0046:** The Holepunch ecosystem (Hypercore, Hyperswarm, Protomux) is Node.js/Bare. ADR-0046 chose Deno as the application runtime. Resolution: Holepunch lives at the infrastructure layer and runs via `npm:` specifiers in Deno on server, and natively in Bare on Pear client. The application layer (effectHandlers, CLI, MCP) benefits from Deno's no-build-step; the infrastructure layer does not need it.

## Decision

### 1. Datom Shape

```typescript
type Datom = {
  e: EntityId;     // ULID — globally unique, coordination-free
  a: Attribute;    // Namespaced: "client/name", "session/date"
  v: DatomValue;   // Primitive | EntityId (ref) | ContainerRef (Loro)
  tx: TxId;        // ULID of producing transaction
  op: 'assert' | 'retract';
};
```

ULIDs for both `e` and `tx` — time-ordered, globally unique, coordination-free. Any peer generates entity IDs offline without collision risk.

Provenance (`:tx/source`, `:tx/trust-score`) is stored as datoms on the transaction entity, not as fields on every individual datom:

```
[session:42  :session/themes   ["sleep","anxiety"]  tx:81  assert]
[tx:81       :tx/source        :ai/text-generation  tx:81  assert]
[tx:81       :tx/trust-score   0.85                 tx:81  assert]
```

This keeps the datom shape lean while making provenance first-class and queryable through the same machinery as domain data.

### 2. Attribute Cardinality

Cardinality is stored as a schema datom:

```
[attr  :db/cardinality  :db.cardinality/one   tx  assert]  // at most one value
[attr  :db/cardinality  :db.cardinality/many  tx  assert]  // multiple values
```

Cardinality governs conflict resolution per the table in §7 below.

### 3. Three Temperature Tiers

```
Frozen (Hypercore) ──diffs──► Warm (d2ts indexes) ──diffs──► Hot (UI)
```

Every tier boundary is crossed by replaying datoms. The `op` field is the diff multiplicity. One primitive, one operation, three tiers.

#### Frozen Tier — Hypercore

Hypercore is the append-only log and source of truth. Each peer owns its own Hypercore feed — no shared writer, no coordination. Merkle-tree integrity verification is built in. Sparse replication means clients only download datoms their subscriptions cover.

Hypercore version by deployment context:

| Context | Version | Storage |
|---------|---------|---------|
| Server | HC 11 | RocksDB on disk (managed by HC) |
| Pear client | HC 11 | RocksDB on disk |
| Browser client | HC 10 | `random-access-memory` (in-memory, session-duration) |

The browser does not need durable feed storage — it needs the replication protocol to download sparse datoms for the current session. HC 10 with in-memory storage is sufficient. The Protomux replication protocol is identical between HC 10 and HC 11 — the server never needs to know which version the browser is running.

**Spike required (Phase 3):** Validate HC 10 + in-memory in current Holepunch browser environment before committing.

#### Warm Tier — d2ts

`@electric-sql/d2ts` (differential dataflow) serves as the engine for both warm index materialization (Frozen→Warm) and reactive UI queries (Warm→Hot). The datom's `op` field maps directly to d2ts multiplicity — no translation layer:

```typescript
function datomToEntry(d: Datom): [Datom, 1 | -1] {
  return [d, d.op === 'assert' ? 1 : -1];
}
```

d2ts maintains four indexes over the warm datom set:

| Index | Key order | Primary use |
|-------|-----------|-------------|
| **EAVT** | entity → attribute → value → tx | Entity lookup — "everything about entity X" |
| **AEVT** | attribute → entity → value → tx | Attribute scan — "all entities with attribute A" |
| **AVET** | attribute → value → entity → tx | Value lookup — "find entity by email" |
| **VAET** | value → attribute → entity → tx | Reverse reference — "all sessions for client X" (ref-typed attributes only) |

All four indexes are required. VAET is what makes graph traversal cheap — the Projection `depth` field for nested pulls depends on efficient reverse reference lookups.

**Startup performance:** d2ts supports a SQLite backend for snapshotting operator state. On clean shutdown, snapshot the d2ts state. On restart, load the snapshot and replay only new datoms since the snapshot. If benchmarks show the snapshot approach is insufficient, fallback: direct imperative materialization for cold start, d2ts taking over for incremental updates once warm.

**Spike required (Phase 1):** Benchmark replaying 500k datoms through d2ts. Establish whether SQLite snapshot is needed from the start or can be deferred.

**Spike required (Phase 2):** Validate d2ts on Bare runtime. d2ts is pure TypeScript (`Map`, `Array`, `Set`) with no Node.js-specific APIs — expected to work on Bare without modification, but must be confirmed.

#### Cold Tier — Hyperbee

Hyperbee (B-tree built on Hypercore) stores cold-tier entities for range queries. It is part of the Holepunch stack — no new dependency. HyperDB is explicitly not used for datom indexes; its typed collection model does not fit the EAV tuple shape.

**Eviction policy:**
1. **Explicit archival** (primary): practitioner asserts `[client-1 :client/status "archived" tx assert]` — the materializer watches for this datom and evicts the entity from warm indexes
2. **Time-based fallback**: no datom activity in 90 days triggers eviction

Archived entities remain queryable via Hyperbee range scans when needed.

### 4. Analytics Layer — DuckDB (Server-Side Only)

DuckDB runs on the server only, as an analytics layer accessed via virtual tables over the warm indexes. It is not the primary store, not a sync participant, and does not run on Pear or browser clients.

Primary use cases:
- Complex aggregations over large time ranges (historical reporting)
- Pattern detection for the deterministic-first loop — LLM queries effect datom patterns via DuckDB
- Cross-entity analytics that exceed d2ts's intended scope

This is the same role DuckDB plays in devac — batch analytics queries — validated by the devac PoC.

### 5. P2P Transport (Architecture Decided, Phase 20+ Build)

**Protomux** multiplexes three channels over one Noise-encrypted stream per peer connection:

| Channel | Protocol | Purpose |
|---------|----------|---------|
| `hypercore/alpha` | Hypercore replication | Datom feed sync |
| `loro-text/v1` | Loro delta sync | Rich text collaborative editing |
| `datom-app/v1` | protomux-rpc | Queries, subscriptions, presence |

Noise protocol provides transport-level E2E encryption — no separate TLS layer required. Adding new protocols later is a single `createChannel` call.

**Hyperswarm + HyperDHT** handle peer discovery and NAT traversal. Peers announce on a topic derived from their workspace identity — the workspace IS the trust boundary. No central directory.

**dht-relay** bridges browser clients to UDP Hyperswarm via a blind WebSocket relay. "Blind" means the relay sees only Noise-encrypted bytes — no content access. The always-on server doubles as the dht-relay endpoint.

**Deployment model for the always-on server:**
- **Self-hosted**: practitioner operates their own server (Pear relay + dht-relay + warm index for all peers)
- **Managed service**: hosted server provided as a service

Both deployment models are supported from the start.

**Phase 1 deployment:** Single-peer Hypercore (local log, no replication). The replication protocol is present but inactive. Enabling multi-peer replication in Phase 20+ is additive — no rearchitecture required. This is the critical property: use Hypercore from Phase 1 so the P2P path is never blocked by a storage migration.

### 6. Subscription as Replication Filter

A client's subscription expression simultaneously drives three effects:
1. **Sparse Hypercore download** — which feed ranges to fetch from peers
2. **Server push** — which diffs to forward to this client
3. **d2ts pipeline input** — which diffs to process locally

The Projection's `filter` expression IS the subscription IS the download hint. This implements Projection live delivery without a separate subscription mechanism.

**Starting granularity:** Per-attribute-namespace subscriptions:

```javascript
// "Give me all session/* datoms for entities in my workspace"
subscribe({ a: 'session/*', workspace: 'ws-123' })
```

The server maintains `Map<peerId, SubscriptionFilter[]>` and dispatches via a simple loop — trivial at small scale (5–10 peers, ~10 filters each). Refine to per-entity-set filters with inverted index dispatch when real usage shows bandwidth pressure.

### 7. Conflict Resolution

| Data type | Resolution strategy |
|-----------|-------------------|
| `:one` scalar attribute | Last-writer-wins (highest tx ULID) |
| `:many` scalar attribute | OR-Set (assert adds, retract removes; commutative) |
| `:one` ref attribute | Produces `:contract/conflict` datom — human resolution required |
| `:many` ref attribute | OR-Set (same as `:many` scalar) |
| Rich text attribute | Loro Fugue algorithm via `loro-text/v1` channel |

`:one` ref conflicts are NOT silently resolved by LWW — they produce `:contract/conflict` datoms that enter the creation loop for human review. The risk of silently re-assigning a relationship (e.g., a session silently pointing to a different client) is too high for a healthcare context.

### 8. Rich Text — Loro

Loro is the CRDT library for rich text only. All structured datom data is handled by the datom model itself (see §7). Loro provides:
- Fugue algorithm for text (correct interleaving of concurrent character-level edits)
- Rust core with WASM bindings (works in Bare, browser, and Deno via `npm:`)
- Version vectors that integrate with Hypercore's causal ordering

**Per-instance LoroDoc:** One LoroDoc per text attribute instance (e.g., one per session note). Each session note is an independent document — counselors rarely co-edit across different notes simultaneously. Per-instance bounds each doc's oplog and makes archival clean.

Rich text datoms store a `ContainerRef` pointer; the actual content syncs via the `loro-text/v1` Protomux channel independently of datom replication.

### 9. Identity

Two-layer model:

| Layer | Mechanism | What it governs |
|-------|-----------|----------------|
| Transport | Noise keypair (ED25519) | Peer authentication — who you are |
| Application | Trust Contract + Projection Contract | Authorization — what you can read/write |

The Noise keypair (generated by Hypercore/Hyperswarm on first launch) IS the peer identity. Device linking is datom-based: a practitioner asserts `identity/device` datoms from their primary Pear client to authorize new device public keys. The server validates Noise handshake pubkeys against these datoms.

The keypair handles transport authentication. Trust Contract + Projection Contract govern application-level authorization — these are separate concerns and must not be conflated.

### 10. Sync Contract Correction

`vivief-concepts-v6.md` §2.4 defines the Sync Contract with `resolution: { text: "crdt-yjs" }`. This is superseded by this ADR: rich text resolution uses **Loro** (Fugue algorithm), not Yjs. All other Sync Contract fields remain as specified:

```typescript
interface SyncContract {
  resolution: { text: "crdt-loro", scalar: "last-writer-wins", ref: "manual-merge" }
  scope: { push: DatomQuery, pull: DatomQuery }
  claim: { pattern: ":effect/claimed-by", timeout: "30s" }
}
```

## Consequences

### Positive

- **Architectural coherence:** the datom is the universal primitive at every layer — storage, sync, conflict resolution, and UI reactivity all operate on the same unit with the same operation
- **P2P by design:** using Hypercore from Phase 1 (even single-peer) means multi-peer replication is additive, not a rearchitecture
- **No CRDT library for structured data:** the datom model solves structured conflict resolution; Loro is scoped to rich text only, eliminating Yjs and Automerge
- **One query engine:** d2ts powers both index materialization and UI reactivity — consistent behavior, one mental model
- **Offline-first from Phase 1:** Pear client stores full Hypercore feed on disk; browser tolerates network loss for session duration
- **Encryption by default:** Noise encrypts all peer connections without a separate TLS layer

### Negative

- **Holepunch ecosystem coupling:** Hypercore, Hyperswarm, and Protomux are Node.js/Bare libraries; Deno compatibility via `npm:` must be re-validated on each Holepunch version upgrade
- **Three spikes required before Phase 1–3 commitments:** d2ts startup performance, d2ts on Bare, and HC 10 browser compatibility (see table below)
- **Warm tier is fully in-memory:** the server must hold all active entities' warm indexes in RAM; memory budget must be planned explicitly as the number of practices grows
- **P2P deferred to Phase 20+:** multi-user collaboration is a late-phase feature; the replication architecture is decided but untested against real workloads until late

### Neutral

- **DuckDB is preserved as analytics:** devac's proven DuckDB usage continues as a server-side analytics layer, not the primary store
- **HC 10 in browser:** deliberately using an older Hypercore version in the browser trades version uniformity for proven reliability; revisit when offline persistence is needed
- **Coarse subscriptions will need refinement:** per-attribute-namespace granularity is correct for early scale; expect a refinement pass once real bandwidth data exists
- **Both deployment models add operational surface:** self-hosted requires practitioner to operate a server process; managed adds a hosted service to operate

## Spikes Required

| Spike | Phase | What it unblocks |
|-------|-------|-----------------|
| d2ts startup benchmark (replay 500k datoms) | Phase 1 | Warm tier commitment; determines if SQLite snapshot is needed from day one |
| d2ts on Bare runtime | Phase 2 | Pear client warm tier; determines if Pear client needs a fallback materializer |
| HC 10 + in-memory in browser | Phase 3 | Browser client architecture; determines if Approach B (HC 11 + IndexedDB shim) is needed |

## References

- [vivief-concepts-v6-implementation-kb.md §2.2, §2.3](../vision/vivief-concepts-v6-implementation-kb.md) — Datom Store and P2P decision frames
- [vivief-concepts-v6.md §2.1, §2.4](../vision/vivief-concepts-v6.md) — Datom concept, Sync Contract, Trust Contract
- [datom-data-world-v0.7.md](../vision/brainstorms/datom-data-world-v0.7.md) — Architecture brainstorm (primary source)
- [ADR-0046](0046-runtime-and-language.md) — Runtime and Language (Deno/TS; explains Holepunch coupling)
- [Hypercore Protocol](https://docs.holepunch.to/building-blocks/hypercore)
- [Hyperswarm](https://docs.holepunch.to/building-blocks/hyperswarm)
- [Protomux](https://docs.holepunch.to/helpers/protomux)
- [d2ts — differential dataflow](https://github.com/electric-sql/d2ts)
- [Loro CRDT](https://loro.dev)
- [DataScript](https://github.com/tonsky/datascript) — index design influence
