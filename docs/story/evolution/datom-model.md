# Evolution: Datom Data World v0.1 → v0.7

| Version | Date | Focus | Key Insight |
|---------|------|-------|-------------|
| v0.1 | 2026-03 | Brainstorm draft | Unifying idea: datoms flowing through three temperature tiers (hot/warm/cold) |
| v0.2 | 2026-03 | Refinement | Simplified core insight, cleaner tier model |
| v0.3 | 2026-03 | Deep research | **"Datoms ARE a CRDT"** — assert = add to grow-only set, retract = tagged remove, commutative |
| v0.4 | 2026-03 | Research cont. | Decided external CRDT libraries (Loro) only for rich text, not for datoms themselves |
| v0.5 | 2026-03 | Protomux-centric | Append-only logs, deterministic materializers, Protomux as networking layer |
| v0.6 | 2026-03 | Unified diff | **"Replay Diffs Is the Universal Operation"** — every boundary crossed the same way |
| v0.7 | 2026-03 | **Current** — Refined | Datom shape: `{e, a, v, tx, op}`. Op maps to d2ts multiplicity. Protomux channels. Schema-as-datoms. |

## Two core insights (stable since v0.3/v0.6)

1. **Datoms ARE CRDT**: No external CRDT needed for fact storage. iroh-blobs for frozen storage, materializer for indexes, version vectors for causal delivery. Loro for rich text only.
2. **Replay diffs is universal**: Peer sync, index materialization, reactive queries, UI rendering — all crossed by replaying unseen diffs. The datom IS the diff unit.

## Canonical document

`contract/datom/architecture.md` (promoted from v0.7)

## Archives

v0.1–v0.6 in `archive/datom-data-world/`.
