---
topic: creation-loop
status: canonical
depends-on: [concepts-datom, concepts-contract, concepts-effecthandler]
human-version: ../contract/vivief-concepts-v6.md#3-the-creation-loop
last-verified: 2026-03-30
---

# The Creation Loop

Everything vivief does is creation. A counselor writing session notes, AI analyzing patterns, devac extracting a code graph -- all follow one loop with variable trust.

## Compact Formula

```
effect (Intent) -> Contract(effectHandler) -> datoms (result)
```

An effect enters the loop. A Contract governs the effectHandler that processes it. The result is datoms.

## Intent = The Parameter

Intent is not a new concept. It is the `intent` parameter entering the creation loop. Intents use domain-specific namespaces with past-tense names (no `:intent/*` namespace), consistent with CQRS-ES convention. When a counselor clicks "Prepare for 9:00," that's `:session/preparation-requested`. When `devac sync` runs, that's `:sync/requested`. Intent carries what-to-create, for-whom, and at-what-depth as datom attributes.

## Full Loop with Failure and Escalation

```
Intent -> Contract -> Create -> Validate --- pass --> Cache
             |          |         |
          (defines    (human,   fail
           what's     AI, or     |
           valid      system)    v
           + trust)         error datoms + :fix/requested
                                 |
                          Fix (another creation,
                           reading errors as input)
                                 |
                                 --> re-Validate --> ...
```

Validation failure re-enters the loop. Three fix strategies compose: auto-fix (deterministic) -> AI-fix (sandbox, iterates until Contracts pass) -> human-fix (errors surfaced via Projection). `:creation/abandoned` is the terminal state when all strategies exhaust.

## Validation Exemption from Recursion

Validation datoms produced by system actors (trust 1.0) are exempt from re-entering the creation loop. They commit directly. This prevents infinite recursion -- enforcement produces datoms, but those datoms don't trigger further enforcement.

## Creation Boundary

Creation = producing datoms. Pure transformations that don't produce datoms (formatting a date, parsing a string) are utilities -- functions that handlers call internally, below the concept boundary. Utilities don't need Contracts, trust strategies, or escalation.

## Six Patterns

Patterns compose the five concepts but don't extend them:

| Pattern | Composes | Produces |
|---------|----------|---------|
| **domain** | Schema + Behavior Contracts + Surface template + onboarding StateMachine | Named configuration for a user population |
| **bridge** | effectHandler + Contract at medium boundary | Sync between native medium and datom store |
| **artifact** | Datoms about something in a native medium + bridge | Metadata representation of external content |
| **slice** | Subset of the five concepts (Fact / Feature / Full) | Entry path for incremental adoption |
| **profile** | Projection with preset dimensions | Convenience factory for common queries |
| **skill** | effectHandler (LLM) + Behavior Contract + Projection (context) | Reusable multi-step workflow orchestration |

## The Compounding Flywheel

```
Skills -> Effects -> Patterns -> Contracts -> Trust -> Autonomy -> More Skills
  ^                                                                    |
  +--------------------------------------------------------------------+
```

Every skill execution produces effect datoms. LLM observes patterns, proposes Contracts. Humans approve. System enforces deterministically. Trust increases. More autonomy enables more skill creation. The system gets smarter through use -- not retraining, but the natural cycle of use -> observe -> propose -> enforce.

Knowledge matures through a predictable path:

```
tacit knowledge -> knowledge file -> proto-Contract -> proposed Contract -> active Contract -> infrastructure Contract
```

The system proposes formalization (`:rule/proposal-needed`) but a human approves each transition. Enforcement migrates outward as patterns stabilize.

## The Chicken-and-Egg

Vivief creates itself using its own creation loop. Documentation is the first creation-loop artifact -- asserted as datoms, governed by Schema Contracts, rendered on Surfaces. The platform bootstraps by applying its own concepts to its own construction. This is not metaphor; it is the literal implementation path.
