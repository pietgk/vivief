---
topic: effecthandler
status: canonical
depends-on: [concepts-datom, concepts-contract]
human-version: ../contract/vivief-concepts-v6.md#25-effecthandler
last-verified: 2026-03-30
---

# effectHandler

The universal control pattern. Every state transition in vivief is an effectHandler.

## Signature

```typescript
handler(state: State, effect: Effect): { datoms: Datom[], effects: Effect[] }
```

Input: current state (via Projection) and an effect. Output: new datoms and further effects. Pure, testable, composable.

## Two Levels

| Level | What It Adds | When |
|-------|-------------|------|
| **Function** | Stateless. Pure input/output | Validate session notes, format recap output |
| **Actor** | Identity + Projection + message queue + lifecycle + typed protocol | LLM streaming, multi-step workflows, context compaction |

Most handlers are functions. Actors are for stateful, long-running, or streaming scenarios.

## Implementation Strategy (Orthogonal to Level)

A function or actor can use any strategy:

| Implementation | Runtime | Trust | Example |
|---------------|---------|-------|---------|
| **Code** | TypeScript/Node.js | 1.0 | Deterministic validation, data transformation |
| **Markdown/LLM** | LLM interprets instructions | 0.85 | Skills -- multi-step workflows in natural language |
| **StateMachine** | XState | 1.0 | Machine definition IS the handler |
| **Hybrid** | Code + LLM | min() | Deterministic steps with LLM for edge cases |

Implementation strategy affects trust scoring. A skill (markdown/LLM) that stabilizes can migrate to hybrid, then to code -- each step raising trust. This is the deterministic-first evolution path.

## Skills = LLM-Implemented effectHandlers

A skill is an effectHandler implemented in markdown, executed by an LLM, composing other effectHandlers. It follows the same trust and Contract rules as any handler. Skills are a *pattern*, not a new concept.

Skill authoring is itself creation -- same loop, same trust strategies. Sharing is opt-in by default.

## Contract(effectHandler) -- Dual Interpretation

An effectHandler can be Contract-governed:

- **External enforcement** -- the runtime wires validation around the handler (preconditions on intent, postconditions on result)
- **Internal enforcement** -- the handler declares its Contract association and validates its own transitions

The handler remains an effectHandler; the Contract adds governance, not identity.

## Handler Override Trust Boundary

A handler can override its actor-type trust score if its governing Behavior Contract is verifiable. The Contract enforcement has earned that trust. Override raises the actor's contribution to the `min()` calculation, not the input trust.

## Behavior Contract (optional)

```typescript
interface BehaviorContract {
  accepts: EffectType[]
  produces: { required: AttributeKw[], forbidden: AttributeKw[] }
  stateMachine?: XStateMachineDefinition
  aggregates?: { from: DatomQuery, to: EffectType }
}
```

## Failure Model

Two paths, both auditable:

- **Graceful**: handler returns `{ datoms: [error-datoms], effects: [:effect/failed] }` -- triggers escalation
- **Crash**: actor runtime catches exception, produces crash datom -- escalates to human immediately

Both produce datoms in the log. Both enter the creation loop.

## Streaming

LLM handler actors produce in-flight token effects. Surface actors with `freshness: "in-flight"` render them. In-flight Contracts validate them. On completion, the final datom commits.

## Effects as Understanding

The system observes itself through effects. Every meaningful action produces effect datoms. Aggregation Contracts compose low-level effects into high-level effects. Observability IS Projection over effect datoms. The deterministic-first loop feeds on this: LLM reads effects, observes patterns, proposes new Contracts.
