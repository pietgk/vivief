# Evolution: P2P Architecture

| Version | Date | Focus | Key Decision |
|---------|------|-------|-------------|
| Holepunch era | 2025 | Initial P2P approach | Holepunch/Hypercore ecosystem, Keet-inspired |
| Lean stack v1 | 2026-03 | Simplification | Replace Holepunch with leaner, browser-native stack |
| Lean stack v2 (MoQ) | 2026-03 | Unified protocol | MoQ (Media over QUIC) as single protocol stack |
| Iroh + MoQ | 2026-04 | **Current** — Full stack | Iroh transport, MoQ pub/sub, iroh-blobs, Keet/Pear dropped |

## Key transitions

- **Holepunch → Lean v1**: Holepunch too heavyweight and opinionated. Browser-native WebRTC + lighter primitives.
- **Lean v1 → Lean v2**: Unified under MoQ. Media over QUIC replaces fragmented protocol choices. Single stack for datom sync, rich text CRDT, signaling.
- **Lean v2 → Iroh + MoQ**: Iroh replaces Hyperswarm for transport and peer discovery. iroh-blobs replaces Hypercore for frozen storage. MoQ replaces Protomux for multiplexing. Keet/Pear/Bare dropped entirely — video via MoQ hang format.

## Current architecture

- **Iroh**: P2P transport (iroh-net, iroh-dns, DERP relays) + frozen storage (iroh-blobs, BLAKE3 verified)
- **MoQ**: Unified pub/sub over QUIC (tracks for datom-sync, loro-crdt, media, presence)
- **Loro**: Rich text CRDT only (Fugue algorithm). Datoms ARE their own CRDT.
- **D2TS**: Differential dataflow for warm-tier materialization and reactive queries
- **Video**: MoQ hang format (WebCodecs-based) — built directly on MoQ, no Keet dependency

Progressive complexity: single-user (local store) → relay (MoQ relay) → full P2P (QUIC via Iroh).

**Open questions**: Cold-tier indexing (how Iroh + MoQ support range queries — was Hyperbee). Peer discovery details (iroh-net + MoQ relay/catalog — needs spike).

## Canonical document

`contract/p2p/lean-stack-v2.md`

## Archives

Lean stack v1 in `archive/p2p/`.
