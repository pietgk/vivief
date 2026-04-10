---
topic: contract
status: canonical
depends-on: [concepts-datom, concepts-effecthandler]
human-version: ../contract/vivief-concepts-v6.md#24-contract
last-verified: 2026-03-30
---

# Contract

The cross-cutting concept. A Contract declares expected behavior -- simultaneously spec, test, and runtime guard. **A Contract declares. An effectHandler enforces.**

## Six Sub-Types (Closed Set)

| Contract Type | Constrains | What It Specifies |
|---------------|-----------|-------------------|
| **Schema** | Datom | What facts can exist (types, required fields, enums) |
| **Trust** | Encryption | Key derivation rules, role definitions, consent protocol |
| **Sync** | Replication | Conflict resolution per attribute type, claim protocol |
| **Render** | Surface | a11y requirements, required/forbidden display, trust signals, stories |
| **Behavior** | effectHandler | Accepted/produced effects, state machine, aggregation rules |
| **Guard** | Safety | Reject invalid state ("session recap must produce themes, never diagnosis") |

The six sub-types map one-per-concept plus Trust and Sync for cross-cutting concerns. If a new sub-type seems needed, it signals a missing concept.

## Three Modes

| Mode | What It Does | Example |
|------|-------------|---------|
| **Guard** | Reject invalid state | "Never output diagnosis language" |
| **Aggregation** | Derive higher-level facts | "HTTP calls aggregate into IO.HTTP" |
| **StateMachine** | Define valid transitions | XState machine definition = handler Contract |

## Enforcement Strategy (Trust Boundary Heuristic)

Universal rule: **if the handler's trust is lower than what the Contract protects, enforcement is external.** Otherwise, enforcement can be internal.

| Strategy | When | Example |
|----------|------|---------|
| **External** | Handler less trusted than Contract requires | Schema validated by store, Trust by key derivation layer |
| **Internal** | Handler embodies the Contract | XState StateMachine where definition IS the handler |
| **Internal, externalizable** | Domain logic that matures | Clinical Guard starts as handler logic, evolves to infrastructure |

### Per Sub-Type Defaults

| Contract Type | Default Enforcement |
|---------------|-------------------|
| Schema, Trust, Sync | External (infrastructure) |
| Render | External (tooling -- axe, Storybook) |
| In-flight | External (system actor pipeline) |
| Behavior | Internal (handler), externalizable as patterns mature |

Enforcement migrates outward as trust increases. This is the deterministic-first loop applied to Contract enforcement itself.

## Contract Lifecycle

Contracts are datoms with a lifecycle:

| State | Meaning |
|-------|---------|
| **asserted** | Declared, exists in the log, not yet enforced |
| **active** | Currently enforced by the Store Actor |
| **superseded** | Replaced by newer version, still in log |
| **conflicted** | Two active Contracts disagree, requires resolution |

Resolution: newest active wins for same-type, same-attribute. Cross-type conflicts surface as `:contract/conflict` datoms entering the creation loop. Trust over structure: when Trust Contract restricts access to something Schema Contract requires, Trust wins.

## Contract Defaults Lifecycle

```
:default            -> works without domain expertise
:domain-refined     -> adapted for specific domain
:experience-refined -> adjusted from actual usage data
:locked             -> frozen after deliberate decision (with :tx/why)
```

## Creating Contracts IS Creation

Creating new Contracts follows the same creation loop with the same trust strategies. This is how the system improves: LLM creates rules (Contracts), system enforces them (effectHandlers), LLM observes and refines.

## Not Everything Needs a Contract

A simple validation handler works without a Behavior Contract. A quick CLI Surface works without a Render Contract. Contracts are available when you need guarantees -- not required everywhere.
