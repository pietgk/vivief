---
topic: p2p
status: canonical
depends-on: [concepts-datom, arch-datom-store]
human-version: ../contract/p2p/lean-stack-v2.md
last-verified: 2026-04-01
---

## P2P Architecture

Vivief uses **MoQ (Media over QUIC)** as its unified pub/sub protocol, with
**Iroh** for P2P transport and NAT traversal. This replaces the earlier
Holepunch/Hypercore stack entirely.

### Protocol Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Transport | QUIC via Iroh (iroh-net, DERP relays) | P2P holepunch, encrypted, multiplexed |
| Pub/sub | MoQ (moq-lite) | Track-based publish/subscribe with priority and ordering |
| Media | hang (MoQ WebCodecs format) | Video/audio for conferencing |
| CRDT | Loro (Fugue algorithm) | Rich text collaboration |
| Frozen storage | iroh-blobs (BLAKE3) | Content-addressed datom epoch storage |
| Incremental compute | D2TS | Differential dataflow for warm materialization |
| Ordering | Version vectors | Causal delivery guarantees |

### MoQ Tracks

MoQ multiplexes all data as named tracks over QUIC:

- **Datom sync** (`{ns}/datoms/{entity-ns}`) — datom multisets as MoQ groups
- **Loro CRDT** (`{ns}/notes/{doc-id}`) — rich text CRDT updates
- **Media** (`{ns}/{peer}/video`, `{ns}/{peer}/audio`) — hang format
- **Presence** (`{ns}/presence`) — lightweight status

### Progressive Complexity

The architecture supports three deployment stages without rewriting:

```
Stage 1: Single-user (local)
  DatomStore → local disk (iroh-blobs)
  No network, no sync

Stage 2: Multi-user relay (MoQ relay)
  DatomStore → MoQ → relay server → other clients
  Works behind NATs, corporate firewalls

Stage 3: Full P2P (QUIC via Iroh)
  DatomStore → QUIC → direct peer connections
  Iroh DERP relays for NAT traversal, no central server needed
```

Each stage adds a transport layer; the DatomStore API and Projection mechanics
remain identical. Application code does not change between stages.

### Loro CRDT Details

Loro implements the Fugue algorithm for rich text — superior to older CRDTs
(Yjs/Automerge) for intention preservation in concurrent edits. Used for:

- Counseling session notes (real-time collaborative editing)
- Shared document Surfaces (feed, detail modes)
- Any text content that multiple users edit concurrently

Loro state is separate from datom state. Datoms are facts; Loro documents are
living collaborative artifacts. A bridge effectHandler converts Loro operations
into datoms when a document is "committed" or snapshotted.

### iroh-blobs Frozen Storage

Each peer stores frozen datom epochs as iroh-blobs:

- Content-addressed (BLAKE3 hash) — integrity verified automatically
- Efficiently replicable between peers
- Browser storage via IndexedDB/OPFS; native via iroh-blobs on disk

Version vectors across peers establish causal ordering for multi-peer sync.

### Open Questions

- **Cold-tier indexing**: How Iroh + MoQ support range-scannable cold indexes (was Hyperbee). Needs spike.
- **Peer discovery**: iroh-net + MoQ relay/catalog compose for room-based discovery. Needs spike.
- `archive/p2p/webrtc-signaling.md` — WebRTC over Protomux (archived — superseded by MoQ)
- `archive/p2p/node-architecture.md` — relay nodes, super-peers (archived — core decisions in ADR-0051)
