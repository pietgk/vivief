# Evolution: P2P Architecture

| Version | Date | Focus | Key Decision |
|---------|------|-------|-------------|
| Holepunch era | 2025 | Initial P2P approach | Holepunch/Hypercore ecosystem, Keet-inspired |
| Lean stack v1 | 2026-03 | Simplification | Replace Holepunch with leaner, browser-native stack |
| Lean stack v2 (MoQ) | 2026-03 | **Current** — Unified protocol | MoQ (Media over QUIC) as single protocol stack |

## Key transitions

- **Holepunch → Lean v1**: Holepunch too heavyweight and opinionated. Browser-native WebRTC + lighter primitives.
- **Lean v1 → Lean v2**: Unified under MoQ. Media over QUIC replaces fragmented protocol choices. Single stack for datom sync, rich text CRDT, signaling.

## Current architecture

- **MoQ**: Unified transport layer (pub/sub over QUIC)
- **Protomux**: Multiplexed channels per concern (datom-sync, loro-crdt, signaling)
- **Loro**: Rich text CRDT only (Fugue algorithm). Datoms ARE their own CRDT.
- **Hypercore**: Append-only logs for datom persistence
- **DHT-relay**: NAT traversal

Progressive complexity: single-user (local store) → relay (WebSocket) → full P2P (QUIC direct).

## Canonical document

`contract/p2p/lean-stack-v2.md`

## Archives

Lean stack v1 in `archive/p2p/`.
