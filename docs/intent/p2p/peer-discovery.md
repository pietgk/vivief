# Intent: Peer Discovery with Iroh + MoQ

**Status**: Resolved (2026-04-09) — spike plan ready to execute

## Resolution

Two key design decisions resolved via interview:

1. **Room-based discovery**: Shared room code that maps to a MoQ broadcast namespace. A room code is a short, human-shareable identifier (e.g., 6-character alphanumeric) that the system maps to a MoQ broadcast namespace. The counselor starts a session, gets a room code, shares it with the client (verbally, via text, or QR). The client's device connects to the MoQ relay and subscribes to that namespace. QR code is a convenience wrapper encoding the same room code + relay address. iroh-dns is reserved for always-on device-to-device linking (question 2), not session-based discovery.

2. **Relay topology**: Default to a shared public MoQ relay (Cloudflare) with a self-hosted option for privacy-sensitive deployments. Public relay minimizes infrastructure burden for practitioners. Data is encrypted end-to-end via Iroh, so the relay sees ciphertext only. Self-hosted relay is a deployment-time configuration, not an architectural decision.

Remaining open questions (3-5) can be resolved through the spike.

---

## The problem

Peers need to find each other for real-time collaboration: counseling sessions, shared workspaces, device linking. The previous stack used **Hyperswarm + HyperDHT** for peer discovery and NAT traversal. With the move to Iroh + MoQ, we have two discovery mechanisms that need to compose:

1. **Iroh** (iroh-net, iroh-dns, DERP relays) — transport-level peer discovery and NAT traversal
2. **MoQ relay** (announced tracks, catalog) — application-level discovery of available broadcasts

## What Iroh provides

- **iroh-net**: Direct QUIC connections with automatic NAT traversal
- **iroh-dns**: DNS-based peer discovery (publish and resolve peer endpoints)
- **DERP relays**: Fallback relay servers when direct connections fail (similar to TURN)
- **Endpoint IDs**: Stable peer identifiers independent of IP address

## What MoQ provides

- **`announced()` mechanism**: Live discovery of broadcasts on a relay
- **Track catalog**: JSON-based description of available tracks per broadcast
- **Relay infrastructure**: MoQ relays can be public (Cloudflare) or private

## How they compose (hypothesis)

```
1. Peer publishes its Iroh endpoint ID + MoQ relay address
   → via iroh-dns, QR code, or shared link

2. Other peer connects to the MoQ relay
   �� discovers available tracks via announced()

3. MoQ relay bridges to Iroh for direct P2P
   → or relays traffic if direct connection fails
```

## Open questions

1. **Room-based discovery**: A counselor starts a session. How does the client's device discover and join? Options: shared room code (maps to MoQ broadcast namespace), QR code with Iroh endpoint, iroh-dns lookup.
2. **Always-on discovery**: For device linking and background sync, peers need to find each other without an active session. iroh-dns seems right for this — publish endpoint IDs to DNS.
3. **Relay topology**: Single MoQ relay per practice? Shared public relay? Self-hosted? This affects latency, privacy, and cost.
4. **Browser peer discovery**: Browser clients connect via WebTransport to a MoQ relay. Can they also participate in iroh-dns discovery or is that native-only?
5. **Offline → online transition**: When a peer comes online, how does it announce availability and catch up on missed datoms?

## Spike plan

1. Set up an iroh-net connection between two peers (native → native)
2. Add MoQ relay in between (publish/subscribe a datom track)
3. Add browser client via WebTransport to the same relay
4. Test NAT traversal via DERP relay fallback
5. Measure: connection establishment time, relay latency, discovery latency

## Related documents

- `contract/p2p/lean-stack-v2.md` §1, §3 (MoQ track discovery)
- `contract/datom/architecture.md` §3, §11.4 (device linking)
- `archive/p2p/node-architecture.md` (relay nodes, super-peers — archived, core decisions in ADR-0051)
