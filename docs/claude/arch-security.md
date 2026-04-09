---
topic: security
status: canonical
depends-on: [concepts-contract, concepts-projection]
human-version: ../intent/security/security-architecture.md
last-verified: 2026-03-30
---

## Security Architecture

Security in vivief is distributed across concepts rather than being a separate layer.
Encryption lives in Projection, trust enforcement in Contract, and access
control in effectHandler. This is one of the most open design areas.

### Projection Encryption

Each Projection carries its own encryption scope with derived keys:

- **Per-Projection keys** — different Projections of the same datoms can have
  different encryption, matching their access scope
- **Key derivation** — keys derived from a root secret + Projection identity,
  so revoking a Projection revokes its key
- **At-rest and in-transit** — Projection encryption covers datoms in storage and during P2P sync

### Trust Model

Every transaction carries a **trust score** (0.0 to 1.0):

| Score Range | Meaning | Example |
|-------------|---------|---------|
| 0.0 - 0.3 | Low trust | Anonymous user, unverified source |
| 0.3 - 0.6 | Medium trust | Authenticated user, known peer |
| 0.6 - 0.9 | High trust | Verified identity, established history |
| 0.9 - 1.0 | Maximum trust | Local system, cryptographically verified |

### Enforcement Duality

Contracts declare trust requirements. effectHandlers enforce them. The key insight
is the **enforcement trust threshold**:

```
if handler_trust < contract_criticality:
    route to external enforcement (human review, second system)
else:
    handler enforces directly
```

This means high-criticality Contracts (e.g., "never delete patient data") cannot
be enforced by low-trust handlers alone — they escalate to external enforcement
automatically. The duality is: Contract declares what must hold, effectHandler
determines how and whether it can enforce locally.

### Capability Tokens

Access scope is expressed through capability tokens:

| Scope | Access |
|-------|--------|
| `own` | Only datoms created by this identity |
| `consented` | Datoms where explicit consent was granted |
| `all` | Full access (admin, system-level) |

Capability tokens are embedded in Projection definitions — a Projection carries
both its query logic AND its access scope, so there is no separate ACL layer.

### Trust Boundaries in P2P

In peer-to-peer topology, trust boundaries become critical:

- Each peer evaluates trust scores independently
- Relay servers see encrypted datoms only (Projection encryption prevents relay snooping)
- Version vectors prevent replay attacks (causal ordering)
- DHT-relay nodes cannot read content they relay

### Open Design Areas

Security has the most open brainstorms of any architecture area:

- `intent/security/security-architecture.md` — draft v0.3, threat model + bridge security consolidated
- `intent/security/containers-vpn.md` — container isolation and VPN-level
  security for sensitive domains (counseling, procurement)

Key unresolved questions: container boundaries for multi-domain deployments,
VPN-level network isolation, key rotation mechanics, and how secure bridging
works when external APIs have weaker security guarantees than vivief requires.
