# ADR: Vivief P2P — Lean Stack Architecture

**Status**: Brainstorming / Proposal  
**Date**: 2026-03-25  
**Context**: Replace Holepunch (Hypercore/Hyperbee/Hyperswarm/Bare) with a leaner, browser-native P2P stack for datom-based sync.

---

## 1. Decision Summary

Replace the Holepunch ecosystem with three focused libraries:

| Concern | Was (Holepunch) | Becomes |
|---------|----------------|---------|
| P2P connectivity + holepunch | Hyperswarm + Bare runtime | **Iroh** (Rust, QUIC, WASM) |
| Datom multiset sync (frozen/warm/hot) | Hypercore + Hyperbee | **D2TS** (TypeScript, differential dataflow) |
| Rich text collaboration | Loro (unchanged) | **Loro** (Rust→WASM CRDT) |
| Protocol multiplexing | Protomux | **QUIC ALPN** (native to Iroh) |
| Runtime | Bare (~40MB) or Node.js | **Browser-native + optional Rust sidecar** |

---

## 2. Why Drop Holepunch

### The runtime tax

Holepunch requires either Node.js or their custom **Bare** runtime. Bare is genuinely innovative — it supports V8, JavaScriptCore, QuickJS, and JerryScript engines, runs on desktop + mobile, and strips Node's bloated stdlib to a minimal core. Standard binary is ~40MB (down to ~1MB with JerryScript). But it's still *another runtime* you must ship and maintain. Its ecosystem is young and tightly coupled to Holepunch/Tether investment.

### What we actually need from Holepunch

When you list what Holepunch provides vs what vivief needs, there's significant mismatch:

- **Hypercore**: Append-only log with Merkle tree verification. We need this *concept* (frozen datom log is append-only) but not the implementation — our datom log has different semantics (multiset with retractions, not raw byte append).
- **Hyperbee**: B-tree on top of Hypercore. D2TS indexed arrangements replace this entirely.
- **Hyperswarm**: DHT-based peer discovery + holepunching. Iroh does this better (QUIC-native, production-proven at 500K+ nodes/month).
- **Protomux**: Multiplexing protocols on a single connection. QUIC ALPN does this natively — it's literally what ALPN was designed for.

### What we lose

The one significant loss is Hypercore's **Merkle tree verification** of the append-only log — cryptographic proof that historical data hasn't been tampered with. This is addressed in Section 7 (Frozen Storage Verification) using Iroh blobs.

---

## 3. Iroh — P2P Networking Layer

### What it is

Iroh (by n0-computer) is a Rust library for establishing direct peer-to-peer QUIC connections. Each endpoint is identified by the public half of an Ed25519 keypair (32-byte `NodeId`). You dial by public key, not IP address.

- **Repository**: https://github.com/n0-computer/iroh
- **License**: MIT / Apache 2.0
- **Language**: Rust, with FFI bindings (Python, Swift) and WASM compilation
- **Production**: 500K+ unique nodes/month on the public network, used by Nous Research for decentralized LLM training
- **1.0 roadmap**: Committed for H2 2025 (may have shipped by now)

### Core architecture

```
┌─────────────────────────────────────────────┐
│                  Endpoint                    │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐ │
│  │ NodeId  │  │  Relay    │  │ Discovery  │ │
│  │ Ed25519 │  │ fallback  │  │ DNS/DHT    │ │
│  └─────────┘  └──────────┘  └────────────┘ │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │          QUIC (via quinn)            │   │
│  │  • Authenticated encryption (TLS 1.3)│   │
│  │  • Stream multiplexing              │   │
│  │  • Datagram transport               │   │
│  │  • Stream priorities                │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │         Router (ALPN-based)          │   │
│  │  • iroh-blobs   → /iroh-blobs/...   │   │
│  │  • iroh-gossip  → /iroh-gossip/...  │   │
│  │  • vivief-datom → /vivief/datom/1   │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Connection establishment

1. Endpoint binds, gets NodeId from Ed25519 keypair
2. Registers with a "home relay" server via TCP (relay traffic is E2E encrypted — relay can't read it)
3. Uses multiple discovery mechanisms: DNS (dns.iroh.link), DHT (pkarr), local network
4. When dialing another NodeId: tries direct UDP holepunching first, falls back to relay
5. Connections are QUIC — authenticated, encrypted, multiplexed out of the box

### Protocol multiplexing (replaces Protomux)

QUIC uses **ALPN (Application-Layer Protocol Negotiation)** to distinguish protocols on the same connection. Iroh's `Router` accepts incoming connections and routes by ALPN:

```rust
let router = Router::builder(endpoint)
    .accept(iroh_blobs::ALPN, blobs)       // blob transfer
    .accept(iroh_gossip::ALPN, gossip)     // pub/sub
    .accept(b"/vivief/datom/1", datom_sync) // our custom protocol
    .spawn();
```

This is the standard equivalent of Protomux. No custom wire protocol needed.

### WASM / Browser support

As of iroh 0.33+, iroh compiles to `wasm32-unknown-unknown` for use in browsers:

- **What works**: Connections via relay (WebSocket-based), E2E encryption, gossip, blobs
- **What doesn't (browser sandbox)**: Direct UDP holepunching (no raw socket access), local network discovery
- **Practical impact**: Browser nodes route through relay servers. Desktop/mobile nodes can holepunch directly. All traffic is E2E encrypted regardless.
- **Compilation**: `cargo build --target=wasm32-unknown-unknown` with `default-features = false`
- **Future**: WebRTC data channels could enable browser-to-browser direct connections

### Iroh sub-protocols relevant to vivief

#### iroh-blobs (content-addressed transfer)

See Section 7 for details. Key facts:
- BLAKE3 tree hash → 32-byte content address per blob
- Verified streaming: each 1KB chunk is integrity-checked during transfer
- Range requests: fetch verified subsequences of a blob
- HashSeq: a blob containing a sequence of 32-byte BLAKE3 links (for chunked data)
- Resumable transfers

#### iroh-gossip (pub/sub)

Epidemic broadcast tree based on HyParView + PlumTree papers:

- Peers subscribe to **TopicId** (32-byte identifier)
- Messages broadcast via tree overlay (efficient: O(n) messages for n peers)
- Active/passive peer tracking handles churn gracefully
- Works on mobile (low connection count, tree topology)
- Tested at 2000+ node swarms

**Vivief use**: Gossip is the hot-path transport. When a peer creates new datoms, it broadcasts them via gossip to all peers subscribed to that entity/namespace topic. This is the "hot" tier.

```rust
let topic = TopicId::from_bytes(blake3::hash(b"vivief/practice/42").as_bytes());
let (sender, receiver) = gossip.subscribe(topic, bootstrap_peers).await?;

// Broadcast a new datom
sender.broadcast(encode_datom(&datom)).await?;

// Receive datoms from peers
while let Some(event) = receiver.next().await {
    if let Event::Received(msg) = event? {
        let datom = decode_datom(&msg.content);
        d2ts_input.send_data(datom.tx, MultiSet::new(vec![(datom, 1)]));
    }
}
```

#### iroh-docs (eventually-consistent key-value store)

Built on iroh-blobs + iroh-gossip. May or may not be useful — it's author-keyed (each writer has a keypair) which partially overlaps with our datom model. Worth evaluating but not a dependency.

---

## 4. D2TS — Differential Dataflow for Datom Sync

### What it is

D2TS is a TypeScript implementation of **differential dataflow** — Frank McSherry's framework for incremental computation over changing collections. It's built by the ElectricSQL team.

- **Repository**: https://github.com/electric-sql/d2ts
- **License**: Apache 2.0
- **Language**: Pure TypeScript (runs everywhere: browser, Node, Deno, Bun)
- **Persistence**: Optional SQLite backend for operator state
- **Status**: Active development, used by TanStack DB

### Why D2TS is the natural fit for datoms

The fundamental data structure in differential dataflow is the **multiset with signed multiplicities** — exactly what datoms are:

```
Differential dataflow triple:  (data,     time, diff)
Vivief datom:                   (e/a/v,    tx,   +1/-1)
```

A datom `[entity=42, attribute=:name, value="Alice", tx=100, op=assert]` is literally `(data=[42,:name,"Alice"], time=100, diff=+1)`.

A retraction `[entity=42, attribute=:name, value="Alice", tx=105, op=retract]` is `(data=[42,:name,"Alice"], time=105, diff=-1)`.

D2TS natively operates on these triples. No adaptation layer needed.

### Core concepts

#### MultiSet

The fundamental collection. Elements have integer multiplicities:

```typescript
import { MultiSet } from '@electric-sql/d2ts'

// Assert datom: entity 42, attr :name, value "Alice" at tx 100
const assertions = new MultiSet<Datom>([
  [{ e: 42, a: ':name', v: 'Alice' }, 1],   // +1 = assert
])

// Retract at tx 105
const retractions = new MultiSet<Datom>([
  [{ e: 42, a: ':name', v: 'Alice' }, -1],  // -1 = retract
])
```

#### Version (time / frontier)

Versions are partially ordered. The **frontier** is the set of minimum versions that could still receive new data. Once a version is "closed" (below the frontier), it's final.

```typescript
const graph = new D2(({ initialFrontier: 0 }))
const input = graph.newInput<Datom>()

// Send datoms at version (tx) 100
input.sendData(100, assertions)

// Advance frontier: "no more data before tx 101"
input.advanceTo(101)
```

#### Consolidation (the key operation)

**Consolidation** merges multiplicities for identical `(data, time)` pairs. If an assert (+1) and retract (-1) exist for the same datom at the same version, they cancel to 0 and are removed.

```typescript
input.pipe(
  consolidate(),  // Cancel matching +1/-1 pairs
  output(msg => { /* only non-zero results */ })
)
```

### D2TS compaction — how it maps to frozen/warm/hot

This is the critical concept. In differential dataflow, **compaction** is the process of collapsing history that can no longer be distinguished by any future computation.

#### The math of compaction

The frontier represents the minimum versions that may still arrive. Two historical timestamps `t1` and `t2` are **indistinguishable** if no future timestamp `t_future ≥ frontier` would compare differently to `t1` vs `t2` under the partial order.

When timestamps become indistinguishable, their diffs can be merged:

```
Before compaction (frontier at tx 200):
  (42, :name, "Alice", tx=100, +1)
  (42, :name, "Alice", tx=105, -1)
  (42, :name, "Bob",   tx=105, +1)

After compaction (all three have time < frontier, so times collapse):
  (42, :name, "Bob", tx=200, +1)   // net result: only "Bob" survives
```

The assert+retract of "Alice" cancel (sum to 0), and only the net state remains.

#### Mapping to vivief tiers

| Tier | D2TS concept | Behavior |
|------|-------------|----------|
| **Hot** | Versions above the frontier | Actively receiving new datoms. No compaction possible. Gossip-delivered. |
| **Warm** | Versions at or near the frontier | Closed but not yet compacted. Individual datoms still distinguishable. Useful for recent history queries ("what changed in the last hour"). |
| **Frozen** | Fully compacted collection | All historical diffs consolidated to net state. Only the current truth remains. This is the "frozen log". |

#### How compaction works in practice

D2TS provides a `consolidate()` operator that waits for a version to close, then produces a single consolidated difference collection:

```typescript
const graph = new D2({ initialFrontier: 0 })
const input = graph.newInput<[string, Datom]>()

// The pipeline
const indexed = input.pipe(
  // Key by entity ID for efficient lookups
  keyBy(datom => datom.e.toString()),
  
  // Consolidate: cancel matching assert/retract pairs
  consolidate(),
  
  // Persist consolidated state to SQLite
  // (this is the "warm" tier — compacted but queryable)
  consolidateSQLite(db, 'datoms'),
)

graph.finalize()
```

The SQLite-persisted consolidated state is your **warm tier**. To create the **frozen tier**, you periodically snapshot the consolidated state and advance the frontier past all included versions, making the compaction permanent.

#### Compaction is optimal

From Frank McSherry's proof: the compaction retains distinct times whenever existing input capabilities could distinguish between them, and collapses times whenever they cannot be distinguished. This means:

- You never lose information you could still query
- You always discard information that's become redundant
- The math guarantees correctness across partial orders (important for multi-peer scenarios)

#### D2TS operators for datom queries

```typescript
// "What is the current value of entity 42's :name?"
const currentNames = input.pipe(
  filter(([key, datom]) => datom.e === 42 && datom.a === ':name'),
  consolidate(),  // Net result after all asserts/retracts
  output(msg => console.log('Current name:', msg))
)

// "Show me all entities of type :person"
const allPersons = input.pipe(
  filter(([key, datom]) => datom.a === ':type' && datom.v === ':person'),
  consolidate(),
  output(msg => console.log('Person entity:', msg))
)

// Join: "All person names" (join :type=:person with :name)
const personsByEntity = typeInput.pipe(
  filter(([k, d]) => d.a === ':type' && d.v === ':person'),
  rekey(d => d.e.toString())
)
const namesByEntity = nameInput.pipe(
  filter(([k, d]) => d.a === ':name'),
  rekey(d => d.e.toString())
)
const personNames = personsByEntity.pipe(
  join(namesByEntity),
  consolidate(),
  output(msg => console.log('Person name:', msg))
)
```

#### SQLite persistence

D2TS operators have SQLite-backed variants for persistence and larger-than-memory datasets:

- `consolidateSQLite()` — persists consolidated state
- `joinSQLite()` — persists join operator state  
- `reduceSQLite()` — persists reduce accumulations

This is the natural storage for the warm tier. The SQLite database *is* the warm datom store.

---

## 5. Loro — Rich Text CRDT (Scoped Role)

### What it is

Loro is a high-performance CRDT library for collaborative data. Written in Rust with WASM bindings for JavaScript/TypeScript and Swift bindings.

- **Repository**: https://github.com/loro-dev/loro
- **License**: MIT
- **Language**: Rust core → `loro-crdt` npm package via WASM
- **Browser**: Direct WASM import, works in Vite/Next.js/plain ESM

### Supported CRDT types

- **LoroText**: Rich text with Fugue algorithm (minimizes interleaving anomalies)
- **LoroList**: Ordered collections
- **LoroMap**: LWW (Last-Write-Win) key-value pairs  
- **LoroTree**: Hierarchical data with move support
- **LoroMovableList**: Lists with move operations
- **LoroCounter**: Distributed counters

### Scoped role in vivief

Loro handles **only** the rich text editing use case — session notes, treatment plans, and similar text documents where multiple users may edit concurrently. It does NOT replace the datom model for structured data.

The integration point:

```
Structured data (entities, attributes, values)
  → Datoms → D2TS differential dataflow → SQLite warm store

Rich text documents (session notes, etc.)  
  → Loro LoroDoc → Loro CRDT sync → Stored as blob in datom system
```

A Loro document is referenced by a datom: `[entity=note-123, attribute=:content, value=<loro-doc-hash>, tx=200]`. The Loro document bytes are a blob synced via Iroh blobs. The datom tracks *which* document version is current; Loro handles the internal CRDT merge.

### Sync model

```typescript
import { LoroDoc } from 'loro-crdt'

const docA = new LoroDoc()
const text = docA.getText('content')
text.insert(0, 'Hello')

// Export updates for sync
const bytes: Uint8Array = docA.export({ mode: 'update' })

// On another peer
const docB = new LoroDoc()
docB.import(bytes)

// Incremental sync: only send changes since last known version
const version = docB.oplogVersion()
// ... edits happen ...
const delta = docB.export({ mode: 'update', from: version })
```

### Time travel

Loro supports `checkout` to any historical frontier, and `revert_to` for undo. This complements the datom model's inherent temporal query capability.

---

## 6. Protocol Multiplexing — QUIC ALPN vs Protomux

### What Protomux does

Protomux (Holepunch) multiplexes multiple "channels" over a single connection. Each channel has a protocol identifier and a handshake. It handles backpressure, channel lifecycle, and protocol negotiation.

### Why QUIC ALPN replaces it

QUIC natively supports:

- **ALPN**: Application-Layer Protocol Negotiation. Each connection specifies which protocol it speaks. Iroh's Router dispatches by ALPN.
- **Stream multiplexing**: Multiple independent bidirectional streams per connection, with flow control per stream.
- **Stream priorities**: Higher-priority streams (like gossip heartbeats) can preempt lower-priority ones (like bulk blob transfer).
- **Datagram transport**: Unreliable, unordered messages for latency-sensitive data.

For vivief, the ALPN mapping would be:

| ALPN | Purpose | Transport |
|------|---------|-----------|
| `/vivief/datom/1` | Datom sync (hot tier gossip + warm tier catch-up) | Bidirectional stream |
| `/iroh-blobs/3` | Frozen tier blob transfer | Request/response stream |
| `/iroh-gossip/0` | Gossip overlay for real-time datom broadcast | Gossip protocol |
| `/vivief/loro/1` | Loro document sync | Bidirectional stream |

No custom multiplexing code needed. QUIC handles it at the transport level.

---

## 7. Frozen Storage Verification — Iroh Blobs + BLAKE3

### The gap: what Hypercore provided

Hypercore gives you a **Merkle tree** over the append-only log. Every entry gets a cryptographic hash, and the tree lets you prove:
- Entry N exists and has content X
- The log hasn't been tampered with (any modification changes the root hash)
- Efficient range proofs (verify a subsequence without downloading the whole log)

We need an equivalent for the frozen datom tier.

### Iroh blobs: BLAKE3 verified streaming

Iroh blobs are content-addressed using BLAKE3, a tree hash function:

```
Input blob (arbitrary bytes)
    ↓ split into 1KB chunks
    ↓
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│Chunk0│ │Chunk1│ │Chunk2│ │Chunk3│
└──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘
   │hash    │hash    │hash    │hash
   └───┬────┘        └───┬────┘
       │combine           │combine
       └───────┬──────────┘
               │combine
          Root Hash (32 bytes)
```

Key properties:

- **Content-addressed**: The 32-byte BLAKE3 root hash IS the blob identifier. Same content → same hash, always.
- **Verified streaming**: During transfer, each chunk is verified against the tree. A corrupted or tampered chunk fails immediately — you don't need to download the entire blob first.
- **Range requests**: You can request and verify a contiguous subsequence of the blob by streaming only the BLAKE3 tree nodes needed for that range.
- **Outboard**: Iroh stores chunk hashes as external metadata ("outboard"), leaving the original blob bytes unmodified. The outboard is ~6% overhead at 1KB chunk size.
- **Resumable**: If transfer is interrupted, resume where you left off — already-verified chunks don't need re-transfer.
- **Chunk groups**: Iroh processes chunks in groups of 16 for SIMD parallelism during hashing.

### HashSeq: sequences of blobs

A `HashSeq` is a blob that contains a sequence of 32-byte BLAKE3 links. This is the building block for chunked/tree data structures:

```
HashSeq blob = [hash_0 | hash_1 | hash_2 | ... | hash_n]
                  ↓        ↓        ↓              ↓
               Blob_0   Blob_1   Blob_2   ...   Blob_n
```

Each blob in the sequence is independently content-addressed and verifiable.

### Mapping frozen datom tiers to Iroh blobs

The frozen tier is a compacted snapshot — the net state of all datoms after consolidation. Here's how to make it verifiable:

#### Option A: Snapshot-as-blob (simple)

```
1. D2TS compacts warm tier → produces consolidated datom set
2. Serialize consolidated datoms to deterministic binary format
   (sorted by [entity, attribute, value] for determinism)
3. Store as Iroh blob → get BLAKE3 hash
4. That hash IS the frozen tier identifier
5. To sync frozen tier to new peer: transfer blob via iroh-blobs
   (verified streaming ensures integrity)
```

**Verification**: The BLAKE3 hash of the frozen snapshot proves the content is intact. Any modification changes the hash. Peers can independently produce the same hash from the same datom set if they agree on the serialization format.

**Limitation**: No incremental proofs. You can't prove "entity 42 has attribute :name = Bob" without downloading the entire snapshot. For small practices (thousands of entities), this is fine.

#### Option B: Merkle tree of datom segments (incremental proofs)

```
1. D2TS compacts warm tier → produces consolidated datom set
2. Sort datoms deterministically
3. Split into fixed-size segments (e.g., 1000 datoms each)
4. Serialize each segment → store as Iroh blob → get segment hash
5. Create HashSeq of all segment hashes → store as blob → root hash
6. The root hash identifies the entire frozen tier
```

```
        Root HashSeq
       /      |      \
  Seg_0    Seg_1    Seg_2
  hash     hash     hash
   ↓        ↓        ↓
[datoms   [datoms   [datoms
 0-999]    1000-    2000-
            1999]    2999]
```

**Verification**: 
- Whole-tier integrity: root HashSeq hash
- Segment integrity: individual segment BLAKE3 hashes
- Range queries: fetch and verify only the segments containing your entities
- Incremental sync: only transfer changed segments when the frozen tier is updated

**This is analogous to Hypercore's Merkle tree** but built on standard BLAKE3 + Iroh blob primitives.

#### Option C: DAG sync for deep history (event sourcing)

Iroh has experimental DAG sync support for deep directed acyclic graphs (like commit histories, event logs, blockchains). From their blog:

> When syncing DAGs, especially deep DAGs such as the ones formed by event sourcing systems, it is essential to minimize the number of roundtrips.

The protocol:
1. Deterministic traversal of the DAG from a given root
2. Receiver validates: (a) data matches BLAKE3 hash, (b) data is valid per application rules, (c) all referenced CIDs come from roots asked for or local data
3. Only missing subtrees are transferred

**Vivief use**: If you want to preserve the full history of datom transactions (not just the compacted net state), you can build a DAG where each "epoch" blob links to its predecessor:

```
Epoch_3 → Epoch_2 → Epoch_1 → Epoch_0 (genesis)
  ↓          ↓          ↓          ↓
[datoms    [datoms    [datoms    [datoms
 tx 200-    tx 100-    tx 50-     tx 0-
 299]       199]       99]        49]
```

Each epoch is a HashSeq linking to its datom segment blobs + a predecessor epoch hash. This gives you:
- Full audit trail with cryptographic linking
- Efficient sync (only fetch missing epochs)
- Verified streaming per epoch

### Recommendation

**Start with Option A** (snapshot-as-blob). It's the simplest and sufficient for a single-practice deployment. The frozen snapshot is small enough (~MBs) that whole-blob transfer is fast and verification is trivial.

**Upgrade to Option B** when the data grows or when you need range proofs (e.g., "prove this entity's state to an auditor without revealing other entities").

**Consider Option C** only if you need a full audit trail with cryptographic chaining — regulatory or compliance requirements for the practice management domain.

---

## 8. Sync Protocol Design

### Three-tier sync flow

```
┌─────────────────────────────────────────────────────┐
│                    Peer A                            │
│                                                      │
│  [Hot]  ←──gossip──→  [Hot]    Peer B               │
│    ↓                     ↓                           │
│  [Warm] ←─catch-up──→ [Warm]   (D2TS bidirectional) │
│    ↓                     ↓                           │
│  [Frozen] ←─blobs───→ [Frozen] (iroh-blobs on       │
│                                  demand)             │
└─────────────────────────────────────────────────────┘
```

#### Hot tier: iroh-gossip broadcast

New datoms are broadcast immediately via gossip:
- TopicId per namespace/workspace (e.g., hash of practice ID)
- Messages are `(datom, tx_version)` tuples
- Gossip provides best-effort, eventual delivery
- Hot datoms feed into D2TS input streams on each peer

#### Warm tier: D2TS state sync

When a peer comes online after being offline, it needs to catch up:
1. Exchange frontier positions (version vectors)
2. Send all datoms between peer's frontier and current frontier
3. D2TS consolidation handles any duplicate deliveries (idempotent by nature — duplicate `(data, time, +1)` just means multiplicity temporarily doubles, then consolidates)

Custom ALPN protocol `/vivief/datom/1` for this catch-up stream.

#### Frozen tier: iroh-blobs snapshot transfer

Periodic compaction produces a frozen snapshot:
1. D2TS advances frontier past all warm-tier versions
2. Compaction produces net-state blob
3. Blob is stored locally and hash is advertised
4. New peers or recovering peers fetch the frozen blob first, then catch up warm/hot

---

## 9. What We Don't Need

| Technology | Why not |
|-----------|---------|
| **Holochain** | Heavy Rust conductor, WASM sandbox for app logic, agent-centric DHT validation. Designed for trustless multi-party scenarios. Vivief is a small trusted-party system. Massive overhead. |
| **libp2p** | Modular but kitchen-sink. JS version is large, Rust version requires significant configuration. Iroh is more focused and production-proven for our use case. |
| **Yjs** | Good for text collab but no multiset semantics, no differential dataflow, no incremental computation. Loro is strictly better for our CRDT text needs. |
| **Automerge** | JSON document model doesn't map cleanly to datoms. Historically slow (improved in v2 but still not as lean as D2TS for our specific multiset use case). |
| **Bare runtime** | We don't need a custom JS runtime. Browser + optional Rust sidecar covers our deployment targets. |
| **Hypercore** | Append-only log is the wrong abstraction for a multiset with retractions. D2TS consolidation is the right primitive. |

---

## 10. Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                     Vivief Client                        │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │   UI Layer   │  │  Loro CRDT   │  │  D2TS Engine   │ │
│  │  (React)     │  │  (text only) │  │  (all datoms)  │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘ │
│         │                 │                   │          │
│  ┌──────┴─────────────────┴───────────────────┴────────┐ │
│  │              Vivief Sync Layer                       │ │
│  │  • Hot:    gossip broadcast (new datoms)             │ │
│  │  • Warm:   D2TS catch-up (version exchange)         │ │
│  │  • Frozen: blob transfer (snapshot + verification)  │ │
│  │  • Text:   Loro doc sync (CRDT updates)             │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────┴──────────────────────────────┐ │
│  │                   Iroh Endpoint                      │ │
│  │  • QUIC + holepunching + relay fallback             │ │
│  │  • ALPN-routed protocols                            │ │
│  │  • Ed25519 identity (NodeId)                        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  SQLite      │  │  Blob Store  │  │  Loro Store    │ │
│  │  (warm tier  │  │  (frozen +   │  │  (CRDT docs)   │ │
│  │   D2TS state)│  │   outboards) │  │                │ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
└──────────────────────────────────────────────────────────┘

Runtime options:
  Browser:   WASM (Iroh + Loro) + JS (D2TS) — relay-only networking
  Desktop:   Rust sidecar (Iroh native) + JS (D2TS + Loro WASM) — direct holepunching
  Mobile:    Same as desktop via Iroh's mobile embedding support
```

---

## 11. Open Questions for Brainstorming

1. **Frozen tier verification depth**: Option A (simple blob hash) vs Option B (segmented Merkle) vs Option C (epoch DAG). What are the actual regulatory requirements for session note integrity in the practice management domain?

2. **D2TS frontier coordination**: How do multiple peers agree on when to advance the frontier? Is this a leader-based decision or can any peer propose a frontier advance?

3. **Conflict resolution policy**: D2TS multiset consolidation handles concurrent writes mathematically (assert+retract pairs cancel). But what about semantic conflicts (two peers set different :name values for the same entity at the same tx)? Both survive as separate datoms — do we need LWW semantics on top, or is "both visible, human resolves" acceptable?

4. **Iroh relay dependency**: The public relay network (run by n0-computer) is a convenience but also a dependency. Should vivief run its own relay for the practice? (It's open source, can self-host.) For a practice management tool handling sensitive data, self-hosted relay is probably mandatory.

5. **Loro scope creep**: Currently scoped to text. Should LoroMap/LoroTree handle any structured data, or should ALL structured data go through the datom/D2TS path?

6. **D2TS maturity**: D2TS is relatively young. What's the fallback if it doesn't scale? The concepts are sound (differential dataflow is proven at Materialize/Naiad scale), but the TypeScript implementation may hit performance walls. Consider: could we run the Rust `differential-dataflow` crate via WASM for the hot path, with D2TS as the lightweight query layer?

7. **Offline-first cold start**: When a device starts with no data, what's the bootstrap sequence? Fetch frozen blob → apply warm catch-up → subscribe to hot gossip? What if the frozen blob is large?

---

## 12. References

### Iroh
- Iroh GitHub: https://github.com/n0-computer/iroh
- Iroh docs: https://docs.iroh.computer
- Iroh blobs: https://www.iroh.computer/docs/protocols/blobs
- Iroh gossip: https://docs.iroh.computer/connecting/gossip
- Iroh WASM: https://docs.iroh.computer/deployment/wasm-browser-support
- Iroh DAG sync: https://www.iroh.computer/blog/iroh-dag-sync
- BLAKE3 hazmat: https://www.iroh.computer/blog/blake3-hazmat-api
- Lambda Class interview: https://blog.lambdaclass.com/the-wisdom-of-iroh/
- 1.0 roadmap: https://www.iroh.computer/blog/road-to-1-0

### D2TS / Differential Dataflow
- D2TS GitHub: https://github.com/electric-sql/d2ts
- D2TS npm: https://www.npmjs.com/package/@electric-sql/d2ts
- Frank McSherry's DD: https://github.com/TimelyDataflow/differential-dataflow
- DD compaction math: Appendix A of https://github.com/TimelyDataflow/differential-dataflow/blob/master/sigmod2019-submission.pdf
- Materialize "Building DD from Scratch": https://materialize.com/blog/differential-from-scratch/
- Materialize "Managing Memory": https://materialize.com/blog/managing-memory-with-differential-dataflow/

### Loro
- Loro GitHub: https://github.com/loro-dev/loro
- Loro docs: https://loro.dev/docs/tutorial/get_started
- Loro Rust API: https://docs.rs/loro/

### Holepunch (for reference / what we're replacing)
- Holepunch: https://holepunch.to
- Bare runtime: https://bare.pears.com
- Hypercore: https://docs.holepunch.to/building-blocks/hypercore

### Papers
- HyParView (gossip membership): https://asc.di.fct.unl.pt/~jleitao/pdf/dsn07-leitao.pdf
- PlumTree (epidemic broadcast): https://asc.di.fct.unl.pt/~jleitao/pdf/srds07-leitao.pdf
- Differential Dataflow (original): http://michaelisard.com/pubs/differentialdataflow.pdf
- Foundations of DD: https://homepages.inf.ed.ac.uk/gdp/publications/differentialweb.pdf
- Fugue (Loro's text algorithm): https://arxiv.org/abs/2305.00583
