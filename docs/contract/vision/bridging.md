# Bridging — The Universal Connection Pattern

> Bridge is a named pattern: `effectHandler + Contract at a medium boundary`. Every connection between the datom world and a native medium is a bridge.

**Status**: Proposed — pending validation through second domain (procurement or counseling).

**Origin**: Design interview on whether bridge should be a concept, pattern, or dissolved into existing concepts ([archived intent](../../archive/cross-domain/bridging.md)).

**Related Documents**:
- [vivief-concepts-v6.md](../vivief-concepts-v6.md) — Five concepts, six patterns (bridge is the 7th)
- [creation-loop-extensions.md](creation-loop-extensions.md) — Aperture, intake pattern
- [security-architecture.md](security-architecture.md) — Every bridge boundary is a security boundary
- [concepts-effecthandler Claude window](../../claude/concepts-effecthandler.md) — effectHandler definition, strategies
- [concepts-contract Claude window](../../claude/concepts-contract.md) — Contract enforcement at boundaries

---

## Summary

Bridge is a **named pattern** (Alt B from the brainstorm) — not a 6th concept. It gives vocabulary for communication ("the GitHub bridge", "the LLM memory bridge") without extending the concept model.

**Definition**: `Bridge = effectHandler + Contract at a medium boundary`

The test that confirms bridge is a pattern: both inbound and outbound bridges have a **consistent shape**.

| Direction | Shape | Example |
|-----------|-------|---------|
| **Inbound** | read native medium → validate via Contract → produce datoms | GitHub sync reads commits → Schema Contract validates → commit datoms |
| **Outbound** | receive intent → validate via Contract → write to native medium → confirm | Deploy handler receives deploy intent → Behavior Contract validates → writes to filesystem → confirms |

Bridge is the 7th pattern alongside: domain, artifact, slice, profile, skill, intake.

## Bridge Boundaries

Every bridge boundary is simultaneously:
- A **data boundary** — native medium ↔ datoms
- A **trust boundary** — external content enters the system
- A **Contract enforcement point** — validation happens here

This means security is not a separate concern at bridges — it IS the bridge's Contract. See [security-architecture.md](security-architecture.md).

## Sources (Inbound Bridges)

| Source | What it provides | Bridge mechanism |
|--------|-----------------|-----------------|
| **Datom store** | Existing facts, prior creations | Projection (not a bridge — already datoms) |
| **Local filesystem** | Source code, documents, images | effectHandler reads files → Schema Contract validates |
| **Git** | History, branches, commits | effectHandler reads git → Schema Contract validates |
| **Web / APIs** | External content, data feeds | effectHandler fetches → Trust Contract + Schema Contract |
| **LLM reasoning** | Generated content, analysis | effectHandler captures output → Behavior Contract validates |
| **Peers (P2P)** | Replicated datoms from other nodes | MoQ track subscription → Sync Contract validates |

## Landing (Outbound Bridges)

| Target | What it receives | Bridge mechanism |
|--------|-----------------|-----------------|
| **Native filesystem** | Generated files, artifacts | effectHandler writes → Render/Schema Contract validates output |
| **Git** | Commits, branches | effectHandler commits → Behavior Contract governs workflow |
| **External APIs** | Notifications, data pushes | effectHandler sends → Trust Contract + rate limiting |
| **Surfaces** | UI rendering, notifications | Projection → Surface rendering (not a bridge — Projection is the mechanism) |
| **Peers (P2P)** | Datom replication | MoQ track publishing → Sync Contract governs replication |

## LLM Bridging (Verification Scenario)

LLM interaction maps to the bridge pattern without new machinery:

| LLM Concept | Vivief Mapping | Bridge Direction |
|-------------|----------------|-----------------|
| **Context loading** | Projection (select relevant datoms for LLM window) | Outbound: datoms → LLM context |
| **Memory** | Datom store (`:memory/*` attribute namespace) | Bidirectional: LLM reads/writes memory datoms |
| **Tool calls** | effectHandler invocations via bridge endpoints | Outbound: LLM intent → effectHandler |
| **Skills** | Composed effectHandlers with LLM strategy | Internal: effectHandler composition |
| **Reasoning output** | Inbound bridge: LLM output → datoms via Schema Contract | Inbound: LLM text → validated datoms |

This is a verification scenario, not new architecture. The same 5 concepts + bridge pattern explain LLM interaction completely.

## The Gathering Phase (Teaching Model)

For domain-user documentation (counselors, analysts), the creation flow is named:

```
Intent → Gather → Create → Land
```

- **Gather** = effectHandler reads inputs via inbound bridges + Projection
- **Create** = effectHandler processes, governed by Contract
- **Land** = effectHandler writes via outbound bridges

This naming is for teaching purposes. In technical architecture, "gather" and "land" are just "the effectHandler reads and writes through bridges." The technical formulation remains: `effect (Intent) → Contract(effectHandler) → datoms`.

## Cross-Domain Sharing

Bridge pattern applies across vivief domains (DevAC, Counseling, Procurement):

**Shared (platform-level)**:
- Datom format (EAVT) — universal
- Projection mechanics — query/access/delivery
- Surface rendering — 6 modes serve all domains
- Contract enforcement — enforcement machinery

**Domain-specific**:
- Attribute namespaces — `:session/*` (counseling) vs `:node/*` (devac)
- effectHandlers — domain-specific logic
- Domain Contracts — specific validation rules
- Bridge implementations — each domain bridges different external systems

**Cross-domain references**: Qualified entity IDs with domain prefix:
```clojure
[:procurement/rule:42 :rule/validated-by :devac/fn:handleValidation tx:100 true]
```

**Cross-domain Projections**: Allowed, governed by a cross-domain Projection Contract that declares which domains are in scope. The user must have access to all referenced domains.
