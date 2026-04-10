# effectHandler Roles

> Roles as an attribute on effectHandlers and humans, enabling declarative intent-to-handler dispatch.

**Origin**: Design interview exploring what effectHandlers are *good at* — their professional identity ([archived intent](../../archive/creation/effecthandler-roles.md)).

**Related Documents**:
- [vivief-concepts-v6.md](../vivief-concepts-v6.md) — Five concepts, creation loop
- [creation-loop-extensions.md](creation-loop-extensions.md) — Aperture-based intent routing, confidence-bidding dispatch
- [knowledge-acquisition.md](knowledge-acquisition.md) — Researcher role in depth
- [concepts-effecthandler Claude window](../../claude/concepts-effecthandler.md) — effectHandler definition, levels, strategies
- [concepts-contract Claude window](../../claude/concepts-contract.md) — Behavior Contracts that formalize roles

---

## Summary

Role is an attribute on effectHandlers (and humans) that declares competence — what a handler is good at. It sits alongside the existing two dimensions (Level: Function/Actor, Strategy: Code/LLM/StateMachine/Hybrid) as an orthogonal attribute with optional Contract formalization.

Roles enable a middle ground between hardcoded dispatch and fully-delegated LLM judgment: classify the intent, match it to handlers with the right role, governed by Contracts.

## Role as Attribute

```
[:handler/roles #{:researcher :developer}]
```

A set-valued datom attribute on the handler entity. An effectHandler can have one or more roles. This alone enables basic dispatch: "find handlers with role `:researcher`."

Role applies equally to humans and effectHandlers. A human with role `:counselor` and an effectHandler with role `:counselor` both participate in the same dispatch surface.

## Deterministic-First Maturity

Role follows the same progressive formalization as all vivief concepts:

| Maturity | What it is | When |
|----------|-----------|------|
| **Attribute** | `[:handler/roles #{:researcher}]` — zero ceremony | Day one: tag a handler |
| **Contract** | Behavior Contract declares what a Researcher must do: cite sources, check freshness, disclose contradictions | When trust needs to increase |
| **Pattern** | effectHandler + role + role-specific Contract + role-specific Projection = recognizable shape | When the combination recurs and stabilizes |

These are the same mechanism observed at different levels of formalization. The attribute is always there. The Contract emerges when needed. The pattern is what we call the stable shape.

## Dispatch via Roles

Roles are the mechanism behind aperture-based intent routing (see [creation-loop-extensions.md](creation-loop-extensions.md)):

1. Intent enters the creation loop
2. Classifier categorizes the intent (what kind of work?)
3. Available handlers filtered by: role match + access Contracts + trust level
4. Matching handlers may provide confidence bids
5. Dispatch to handler with best confidence-to-cost ratio

At narrow aperture, a single role-matched handler fires (triage). At wide aperture, all non-rejecting handlers produce and a composition handler merges (chorus). New handlers with the right role automatically become dispatch candidates — no wiring changes.

## Role vs. Skill

- Every skill has at least one role (a research skill has role `:researcher`)
- Not every handler with a role is a skill (a deterministic code validator has role `:validator` but is not a skill)
- Role applies across implementation strategies; skills are LLM-specific

## Starting Role Taxonomy

Roles are an open set. Starting enumeration:

| Role | What it does | Example handlers |
|------|-------------|-----------------|
| **Researcher** | Acquires knowledge from sources | Web search, code graph query, doc lookup |
| **Developer** | Creates and modifies code artifacts | Code generation, refactoring, test writing |
| **Counselor** | Guides through processes, holds context | Session facilitation, recap generation |
| **Organiser** | Classifies, routes, prioritizes | Intent classifier, task dispatcher, triage |
| **Validator** | Checks correctness against Contracts | TypeScript checker, lint runner, a11y scanner |
| **Improver** | Identifies improvement opportunities | Session reviewer, pattern detector |

New roles appear when new competences are needed. No approval process — just add the attribute.
