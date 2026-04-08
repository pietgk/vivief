# Intent: effectHandler Roles

**Status**: Open — discovered during knowledge-acquisition interview, not yet locked

## The Problem

effectHandlers currently have two orthogonal dimensions: **level** (Function/Actor) and **implementation strategy** (Code/LLM/StateMachine/Hybrid). But there is no way to express what an effectHandler is *good at* — its professional identity. Humans naturally have roles (Counselor, Developer, Organiser). effectHandlers need the same: a way to declare their competence that enables intent-to-handler matching.

Without Roles, dispatch is either hardcoded (this intent goes to this handler) or fully delegated to LLM judgment (give all tools, let the model pick). Roles enable a middle ground: classify the intent, match it to handlers with the right role, governed by Contracts.

## Role: A Third Orthogonal Dimension

Role is orthogonal to both level and implementation strategy:

```
effectHandler dimensions:

  Level:          Function ←→ Actor
  Strategy:       Code | LLM | StateMachine | Hybrid
  Role:           Researcher | Developer | Counselor | Organiser | Validator | Improver | ...
```

A Function can be a Researcher. An Actor can be a Researcher. A Code-implemented handler can be a Researcher. An LLM-implemented handler can be a Researcher. Role is independent of how the handler works — it describes what it does.

An effectHandler can have **one or more roles**: `[:handler/roles #{:researcher :developer}]`. Roles are a set, not a singleton.

## Deterministic-First Maturity

Role follows the same maturity path as all vivief formalizations — the same thing at three zoom levels:

### Level 1: Attribute (always present)

```
[:handler/roles #{:researcher}]
```

A set-valued datom attribute on the handler entity. Zero ceremony. Tag any handler with its role on day one. This alone enables basic dispatch: "find handlers with role `:researcher`."

### Level 2: Contract (earned through use)

A Behavior Contract declares what a role *means*:

- What intents the handler accepts
- What it must produce
- What quality guarantees it provides
- What sources/tools it may access

Example — Researcher role Contract:
- MUST cite sources (`:knowledge/origin` on every claim)
- MUST check freshness before reusing cached knowledge
- MUST disclose contradictions between sources
- MUST carry confidence signal on synthesis

Not every handler with `:researcher` role needs this Contract. But high-trust research paths earn it. The Contract is the formalization step on the deterministic-first path.

### Level 3: Pattern (recognized when stable)

When a role + its Contract + role-specific Projections (context) recur as a recognizable shape, that's a pattern. The Researcher pattern is: effectHandler + `:researcher` role + quality Behavior Contract + source-access Projection + synthesis output shape.

Patterns are named for communication, not for enforcement. "That's a Researcher" is shorthand for the full composition.

## Roles Enable Dispatch

Roles are the mechanism behind "ask who can handle this intent" — the aperture-based intent routing model defined in [creation-loop-extensions.md](../../contract/vision/creation-loop-extensions.md). At narrow aperture, a single role-matched handler fires (triage). At wide aperture, all non-rejecting handlers produce and a composition handler merges (chorus).

Dispatch flow:

1. Intent enters the creation loop
2. Classifier categorizes the intent (what kind of work?)
3. Available handlers are filtered by: role match + access Contracts + trust level
4. Among matching handlers, the system can ask for confidence bids: "how confident are you that you can handle this?"
5. Dispatch to the handler with the best confidence-to-cost ratio

This replaces hardcoded routing with declarative matching. New handlers with the right role automatically become dispatch candidates — no wiring changes needed.

## Roles Apply to Humans Too

Humans in vivief already have implicit roles: Counselor, Developer, Organiser. Formalizing Role as a concept makes the parallel explicit. A human with role `:counselor` and an effectHandler with role `:counselor` both participate in the same dispatch surface for counseling-related intents. The handler might auto-fix; the human handles what the handler can't — same escalation path.

## Role vs. Skill

A skill is a pattern: effectHandler (LLM) + Behavior Contract + Projection (context). A role is a dimension of any effectHandler. Their relationship:

- Every skill has at least one role (a research skill has role `:researcher`)
- Not every handler with a role is a skill (a deterministic code validator has role `:validator` but is not a skill)
- Role is broader: it applies across implementation strategies. Skills are LLM-specific.

## Starting Role Taxonomy

Roles are an open set (new roles emerge as new competences appear), but here is a starting enumeration:

| Role | What it does | Example handlers |
|------|-------------|-----------------|
| **Researcher** | Acquires knowledge from sources | Web search, code graph query, doc lookup |
| **Developer** | Creates and modifies code artifacts | Code generation, refactoring, test writing |
| **Counselor** | Guides through processes, holds context | Session facilitation, recap generation |
| **Organiser** | Classifies, routes, prioritizes | Intent classifier, task dispatcher, triage |
| **Validator** | Checks correctness against Contracts | TypeScript checker, lint runner, a11y scanner |
| **Improver** | Identifies improvement opportunities | Session reviewer, pattern detector |

This is a starting taxonomy. New roles appear when new competences are needed. No approval process — just add the attribute.

## Relationship to Knowledge Acquisition

The Researcher role was the catalyst for formalizing Roles. See [knowledge-acquisition.md](knowledge-acquisition.md) for the full design of how Researcher effectHandlers acquire, synthesize, and attribute knowledge.

## Related Documents

- [knowledge-acquisition.md](knowledge-acquisition.md) — Researcher role in depth, sources, dispatch, provenance
- [creation-loop-extensions.md](../../contract/vision/creation-loop-extensions.md) — aperture-based intent routing, confidence-bidding via dispatch model
- [concepts-effecthandler](../../claude/concepts-effecthandler.md) — effectHandler definition, levels, implementation strategies
- [concepts-contract](../../claude/concepts-contract.md) — Behavior Contracts that formalize what roles mean
