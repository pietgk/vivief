---
topic: p2p
status: canonical
depends-on: [concepts-datom, arch-datom-store]
human-version: ../contract/p2p/lean-stack-v2.md
last-verified: 2026-03-30
---

## P2P Architecture

Vivief uses **MoQ (Media over QUIC)** as its unified protocol stack, replacing the
earlier Holepunch exploration. The stack is designed for progressive complexity —
single-user first, P2P last.

### Protocol Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Transport | QUIC | Reliable, multiplexed, encrypted streams |
| Protocol | MoQ | Pub/sub over QUIC with relay support |
| Channels | Protomux | Multiplexed logical channels over one connection |
| CRDT | Loro (Fugue algorithm) | Rich text collaboration, conflict-free merging |
| Logs | Hypercore | Append-only logs for datom history |
| Ordering | Version vectors | Causal delivery guarantees |
| NAT | DHT-relay | NAT traversal via distributed hash table relays |

### Protomux Channels

Protomux multiplexes several logical channels over a single QUIC connection:

- **datom-sync** — Datom replication between peers using version vectors
- **loro-crdt** — Real-time rich text collaboration (session notes, documents)
- **signaling** — Peer discovery, connection negotiation, relay coordination

### Progressive Complexity

The architecture supports three deployment stages without rewriting:

```
Stage 1: Single-user (local)
  DatomStore → local disk
  No network, no sync

Stage 2: Multi-user relay (WebSocket bridge)
  DatomStore → WebSocket → relay server → other clients
  Works behind NATs, corporate firewalls

Stage 3: Full P2P (QUIC direct)
  DatomStore → QUIC → direct peer connections
  DHT-relay for NAT traversal, no central server needed
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

### Hypercore Append-Only Logs

Each peer maintains a Hypercore log of its datom transactions. Logs are:

- Append-only (immutable history)
- Efficiently replicable (Merkle tree verification)
- The source of truth for datom ordering per peer

Version vectors across Hypercore logs establish causal ordering for multi-peer sync.

### Open Brainstorms

- `intent/p2p/webrtc-signaling.md` — WebRTC as fallback when QUIC is blocked
- `intent/p2p/node-architecture.md` — how relay nodes, super-peers, and
  lightweight clients compose in production deployments
