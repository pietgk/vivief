# Intent: Documentation review and Holepunch → Iroh+MoQ stack correction (Archived)

**Status**: Archived 2026-04-09 — tracking doc, all items resolved. Ongoing tracking in [REVIEW.md](../../REVIEW.md).

## The problem

The vivief docs were reorganized into intent/contract/fact/story/archive (2026-03-30). A thorough review found the docs are high quality (grade A) but contain stale references to the **Holepunch stack** (Hypercore, Protomux, Hyperbee, Hyperswarm, Pear/Bare, Keet) which has been replaced by **Iroh + MoQ**.

## Review completed

`docs/REVIEW.md` tracks all findings. Original issues (broken refs, missing guides, terminology gaps) were fixed 2026-04-01.

## Resolved design decisions (2026-04-01 interview)

| Decision | Old (Holepunch) | New (Iroh + MoQ) | Status |
|----------|-----------------|-------------------|--------|
| **Frozen tier storage** | Hypercore (append-only log) | iroh-blobs (BLAKE3 verified) | Decided |
| **Multiplexing** | Protomux channels | MoQ tracks (sole multiplexer) | Decided |
| **Video/media** | Keet (Pear in-room apps) | MoQ hang format (build on MoQ directly) | Decided |
| **Runtime** | Pear/Bare | Browser-native + Rust sidecar | Decided |
| **Peer discovery** | Hyperswarm + HyperDHT | Iroh (iroh-net, iroh-dns, DERP) + MoQ relay | Needs spike |
| **Cold-tier indexes** | Hyperbee (B-tree on Hypercore) | TBD — how Iroh + MoQ support indexing | Open question |

## Document update plan

| Document | Action | Reason |
|----------|--------|--------|
| `contract/datom/architecture.md` | Major update | Replace all Holepunch refs with Iroh + MoQ |
| `claude/arch-p2p.md` | Update window | Remove Hypercore, Protomux, DHT-relay |
| `story/arc.md` | Fix current section | Replace Protomux with MoQ, add Iroh |
| `story/evolution/p2p-stack.md` | Add Iroh era | New evolution entry |
| `story/evolution/datom-model.md` | Fix Hypercore ref | Replace with iroh-blobs |
| `intent/counseling/session-keet-challenge.md` | Archive | Keet/Pear dropped entirely |
| `intent/counseling/concepts-vs-nats.md` | Update | Replace Holepunch refs with Iroh + MoQ context |
| `intent/cross-domain/bridging.md` | Update | Replace Hyperdrive refs |
| `intent/creation/developer-flow.md` | Update | Replace Hyperdrive refs |
| `docs/README.md` | Fix bridge table | Replace Hypercore ref |
| `docs/REVIEW.md` | Fix bridge table | Replace Hypercore ref |
| `contract/datom/architecture.md` Appendix B | Keep as historical | Add note: "influenced design, since replaced by Iroh + MoQ" |
