# Fractal Software Factory

> Vivief's architecture as a self-similar, compounding development system.

**Related Documents**:
- [vivief-concepts-v6.md](../vivief-concepts-v6.md) — Five concepts, creation loop
- [Claude window](../../claude/concepts-fractal-software-factory.md) — Compact summary for AI sessions

---

## Summary

Vivief is a fractal software factory: an AI-native development system where the same retrieve → generate → evaluate pattern repeats at every scale, from a single tool call to the full product lifecycle. Outputs of each cycle become callable skills for the next. Development velocity compounds.

## Context

The term "fractal" is precise. A fractal factory is not a static pipeline. Each layer — retrieval, orchestration, artifact generation, deployment — uses AI to produce and improve the layer above it. The same three-phase pattern (retrieval feeding generation feeding evaluation) recurs at every scale. Unlike conventional CI/CD or code-generation pipelines, the outputs of each build cycle become first-class inputs for the next.

The bottleneck shifts from writing code to knowing what to build — from imperative implementation to intent articulation.

## Decision

Vivief's architecture inherently implements the fractal factory pattern. This document names the structure and maps it to existing primitives.

### Datoms as fractal substrate

Every layer's output — a generated Surface, a refined Projection spec, an ADR decision, a Contract — materializes as `[entity, attribute, value, tx, op]`. This means every artifact is immediately queryable input for the next cycle. No export step, no format conversion. The output *is* the retrieval layer for the next scale up.

### The generative pipeline is the base fractal

The four-phase model already encodes this:

1. **Generative exploration** — LLM produces candidate outputs (generate)
2. **Intent capture as datoms** — results persist as structured data (evaluate + store)
3. **Deterministic replay** — cached intents replay without LLM (retrieve from prior cycles)
4. **Re-entry for novel intents** — only genuinely new intent re-enters the generative phase

This is retrieve → generate → evaluate at interaction scale. The fractal claim is that the same loop governs how Vivief builds itself.

### Skills accumulate structurally

In a conventional system, you'd need an explicit skill registry. In Vivief, any successful generation cycle that persists datoms has already registered itself. D2TS incremental computation means downstream Projections automatically see new capabilities. Compounding is structural, not bolted on.

### Temperature tiers map to fractal scale

| Tier | Scale | Loop frequency | Examples |
|------|-------|----------------|----------|
| Cold | Architectural | Days–weeks | ADRs, new primitive definitions, schema evolution |
| Warm | Session | Minutes–hours | Surface generation, Projection specs, Contract refinement |
| Hot  | Real-time | Milliseconds–seconds | MoQ-transported datom diffs, live collaboration patches, Loro CRDT ops |

Same retrieve → generate → evaluate pattern. Different time constants.

### LLM tiering is the evaluation budget

| Model | Role | Frequency | Cost |
|-------|------|-----------|------|
| Qwen 3.5-27B (local) | Classification, routing, simple generation | High | Free |
| Sonnet | Long-context reasoning, warm-tier generation | Medium | Moderate |
| Opus | Hard architectural decisions, cold-tier evaluation | Low | High |

The factory allocates intelligence where the leverage is highest.

### Local-first constraint as differentiator

The fractal factory runs on the practitioner's machine. Skills compound *per practice*, not in a shared cloud. Each Vivief instance becomes a unique factory tuned to its operational context. This is both the ethical stance (sensitive-data domains demand it) and the moat (network effects are local, not extractable).

## Consequences

- **Intent articulation becomes the primary skill.** The LLM-as-Projection-compiler framing already assumes this. The fractal factory names the recursive structure around it.
- **Every persistent datom is a potential skill.** There is no distinction between "application data" and "development artifact" — both are datoms, both feed future cycles.
- **Velocity compounds per-instance.** A practice that has used Vivief for a year has a fundamentally more capable factory than a fresh install. This is the local-first equivalent of training data advantage.
- **The system is self-describing.** ADRs, Projections, Surfaces, Contracts — all are datoms. The factory can reason about its own structure using the same primitives it uses for everything else.
- **Prompt injection security model holds.** Every persistent injection effect manifests as a state change in the orchestration layer. Mutable surface diffing remains the detection mechanism regardless of fractal depth.

## Relationship to Other Concepts

- **D2TS as intermediate operator state** — D2TS is the incremental computation layer that makes skill accumulation zero-cost. It doesn't store; Loro CRDT remains authoritative.
- **MoQ as hot-tier transport** — MoQ unifies all hot-tier data flows (datom diffs, video, collaboration), making the hot fractal loop possible over a single protocol.
- **Node 24 native TypeScript** — No build step means the factory's own code is as malleable as its outputs. The meta-level loop (improving the factory itself) has minimal friction.
