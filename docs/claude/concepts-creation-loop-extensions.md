---
topic: creation-loop-extensions
status: canonical
depends-on: [concepts-datom, concepts-projection, concepts-effecthandler, concepts-contract, concepts-creation-loop]
human-version: ../contract/vision/creation-loop-extensions.md
last-verified: 2026-04-07
---

## Creation Loop Extensions

Three extensions to the creation loop. No new primitives — the five concepts hold.

### Aperture

Parameter on Projection that controls how much possibility flows through the system.
Unifies `trustThreshold` + `freshness` into one dial.

| Aperture | trustThreshold | freshness | What you see |
|----------|---------------|-----------|-------------|
| Narrow | 0.8+ | committed | Ground truth. Verified, human-approved |
| Medium | 0.4+ | committed + in-flight | Active work, streaming LLM output |
| Wide | 0.0+ | all + speculative | Everything the system is thinking |

### Aperture Applied to Intent Routing

Same dial governs handler dispatch:

| Aperture | Matching | Pattern |
|----------|----------|---------|
| Narrow | Exact `BehaviorContract.accepts` match | **Triage** — single handler |
| Medium | EffectType + semantic similarity | **Pool** — trust-weighted, losers → speculative |
| Wide | Any non-rejecting Contract | **Chorus** — all produce, composer merges |

Wide aperture conflict: if composition handler exists → chorus. If not → fallback to medium.

### Intake (Seventh Pattern)

Unidirectional bridge converting external signals into datoms with provenance.
Unlike bridge (bidirectional sync), intake is ingest-only.

| Source | Trust | Rationale |
|--------|-------|-----------|
| `:human/direct` | 1.0 | Human typed/spoke |
| `:customer/direct` | 0.7 | External, unverified |
| `:system/integration` | 0.9 | API webhook |
| `:ai/transcription` | 0.85 | STT output |
| `:web/scraped` | 0.4 | Uncontrolled |

### Context-as-Fractal

Projection is the base. Conversation is a Surface rendering of a Projection.
The narrative layer is just another Surface mode (Dialog) consuming datoms.

Phase funnel: **Wild** (generative) → **Ambitious** (collaborative) → **Pragmatic** (transactional).

### DevAC as Code Intelligence

DevAC = persistent **wide-aperture Projection**. Always available as context.
DevAC datoms are first-class — queryable via Projection, renderable on Surfaces.

### Local-First Compounding

Vivief compounds per-instance — each practice's factory is uniquely tuned.
Opt-in sharing: generalized Contracts (not datoms) with `trust-score: 0.3`, requiring human approval.
