# Intent: Container & VPN-Level Security

**Status**: Open — needs brainstorming

## Context

Vivief's security model has trust scores and capability tokens at the concept level (Projection). But deployment-level security — containers, VPN, network isolation — needs design work.

## Open questions

- How do containers fit into the vivief deployment model (Tauri + P2P)?
- What VPN-level security is needed for relay nodes?
- How does container isolation interact with the trust boundary model?
- What's the threat model for a P2P network of developer/counselor nodes?

## Related

- `intent/security/security-architecture.md` — Draft v0.3 (threat model + bridge security consolidated)
- `contract/vivief-concepts-v6.md` §2.4 — Contract enforcement trust boundaries
