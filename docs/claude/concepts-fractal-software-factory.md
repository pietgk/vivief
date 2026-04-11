---
topic: fractal-software-factory
status: canonical
depends-on: [concepts-creation-loop, concepts-datom, arch-query]
human-version: ../contract/vision/fractal-software-factory.md
last-verified: 2026-03-31
---

# Fractal Software Factory

Vivief is a fractal software factory: the same retrieve → generate → evaluate pattern repeats at every scale, from a single tool call to the full product lifecycle. Outputs of each cycle become callable skills for the next. Development velocity compounds.

## Why "Fractal"

Not a static pipeline. Each layer — retrieval, orchestration, artifact generation, deployment — uses AI to produce and improve the layer above it. The outputs of each build cycle become first-class inputs for the next. The bottleneck shifts from writing code to knowing what to build.

## Datoms as Fractal Substrate

Every layer's output materializes as `[entity, attribute, value, tx, op]`. Every artifact is immediately queryable input for the next cycle. No export step, no format conversion. The output *is* the retrieval layer for the next scale up.

## The Base Fractal

The creation loop (see concepts-creation-loop) encodes the base pattern:

1. **Generative exploration** — LLM produces candidate outputs
2. **Intent capture as datoms** — results persist as structured data
3. **Deterministic replay** — cached intents replay without LLM
4. **Re-entry for novel intents** — only genuinely new intent re-enters the generative phase

This is retrieve → generate → evaluate at interaction scale. The fractal claim is that the same loop governs how Vivief builds itself.

## Structural Skill Accumulation

No explicit skill registry needed. Any generation cycle that persists datoms has already registered itself. D2TS incremental computation (see arch-query) means downstream Projections automatically see new capabilities. Compounding is structural, not bolted on.

## Temperature Tiers

| Tier | Scale | Loop frequency | Examples |
|------|-------|----------------|----------|
| Cold | Architectural | Days–weeks | ADRs, new primitive definitions, schema evolution |
| Warm | Session | Minutes–hours | Surface generation, Projection specs, Contract refinement |
| Hot  | Real-time | Milliseconds–seconds | MoQ datom diffs, collaboration patches, Loro CRDT ops |

Same pattern. Different time constants.

## LLM Tiering as Evaluation Budget

| Model | Role | Frequency | Cost |
|-------|------|-----------|------|
| Qwen 3.5-27B (local) | Classification, routing, simple generation | High | Free |
| Sonnet | Long-context reasoning, warm-tier generation | Medium | Moderate |
| Opus | Hard architectural decisions, cold-tier evaluation | Low | High |

The factory allocates intelligence where the leverage is highest.

## Local-First Differentiator

The fractal factory runs on the practitioner's machine. Skills compound *per practice*, not in a shared cloud. Each instance becomes a unique factory tuned to its operational context — the ethical stance (sensitive-data domains) and the moat (local network effects, not extractable).

## Key Consequences

- **Intent articulation becomes the primary skill.** The fractal factory names the recursive structure around the LLM-as-Projection-compiler framing.
- **Every persistent datom is a potential skill.** No distinction between "application data" and "development artifact" — both are datoms, both feed future cycles.
- **Velocity compounds per-instance.** A practice that has used Vivief for a year has a fundamentally more capable factory than a fresh install. The local-first equivalent of training data advantage.
- **The system is self-describing.** ADRs, Projections, Surfaces, Contracts — all are datoms. The factory reasons about its own structure using the same primitives it uses for everything else.
