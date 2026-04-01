---
topic: counseling-domain
status: canonical
depends-on: [vivief-identity, concepts-datom, concepts-projection, concepts-surface]
human-version: ../contract/counseling/platform-v2.md
last-verified: 2026-03-30
---

## Counseling Domain

Counseling is the second vivief domain — a lifelong developer experience mapping
platform, local-first and peer-to-peer. Design maturity: v0.7 (implementation-ready).

### The Catalyst Insight

The counseling domain proved that vivief's five concepts (Datom, Projection, Surface,
Contract, effectHandler) are universal — not specific to developer analytics. When
session notes, therapeutic goals, and client progress all modeled naturally as datoms
viewed through role-based Projections on appropriate Surfaces, it became clear that
DevAC was just one domain of a general platform. The counseling domain was the
catalyst that turned DevAC into vivief.

### Session Model

Counseling sessions follow a three-phase workflow:

```
Prepare → Conduct → Review
  |          |         |
counselor  real-time  progress
reads      session    tracking
history    with       over time
           client
```

1. **Prepare** — Counselor loads client history via Projections, reviews themes,
   goals, and previous session datoms
2. **Conduct** — Real-time session: notes as Loro CRDT (rich text), observations
   as datoms, guided by therapeutic framework
3. **Review** — Progress tracked through theme/goal Projections, patterns emerge
   across sessions over time

### Everything Is Datoms

All session data lives in the datom model:

| Data | Datom Example |
|------|--------------|
| Session note | `[session-1, "note:text", "Client discussed...", tx, true]` |
| Theme | `[client-1, "theme:active", "career-transition", tx, true]` |
| Goal | `[goal-1, "status", "in-progress", tx, true]` |
| Observation | `[session-1, "observation", "increased-confidence", tx, true]` |

### Role-Based Projections

Different roles see different Projections of the same datoms:

| Role | Projection | Scope |
|------|-----------|-------|
| Counselor | Full session history, all themes, clinical notes | `consented` |
| Client | Own progress, goals, session summaries | `own` |
| Supervisor | Anonymized patterns, counselor effectiveness | `consented` + aggregated |

Projections carry encryption — client data encrypted with per-Projection keys,
so even at rest, role separation is cryptographic, not just access-control.

### Surface Modes

Counseling uses multiple Surface modes from the vivief Surface concept:

- **Detail** — Full session view during conduct phase
- **Dashboard** — Counselor overview of all active clients, themes, upcoming sessions
- **Brief** — Morning summary of today's sessions and key client updates
- **Feed** — Timeline of session notes and observations for a single client
- **Chat** — Async messaging between counselor and client between sessions

### Privacy and Trust

Counseling has the highest trust requirements of any vivief domain:

- All session data encrypted at rest (Projection encryption)
- P2P sync means no central server holds unencrypted client data
- Contract enforcement: "never share client data without consent" is a
  high-criticality Contract that escalates to external enforcement
- Capability tokens: clients control their own data scope

### Open Brainstorms

Design documents in `intent/counseling/` and contracts in `contract/counseling/`.
The platform-v2 contract locks the session model and role-based Projection patterns.
