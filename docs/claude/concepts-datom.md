---
topic: datom
status: canonical
depends-on: []
human-version: ../contract/vivief-concepts-v6.md#21-datom
last-verified: 2026-03-30
---

# Datom

The universal fact. Every piece of data in vivief is a datom.

## Shape

`[Entity, Attribute, Value, Tx, Op]`

- **Entity** -- identifier for the thing being described
- **Attribute** -- keyword naming the property (`:session/themes`, `:client/name`)
- **Value** -- the data
- **Tx** -- transaction identifier (groups related assertions)
- **Op** -- `true` (assert) or `false` (retract)

Datoms are immutable and append-only. The datom log is the shared memory that all actors read from and write to.

## Schema as Datoms

Schema is not external metadata -- it is stored as datoms:

```
[:schema/client-name  :schema/type      :text   tx:1  true]
[:schema/client-name  :schema/required   true   tx:1  true]
```

Schema evolution IS Contract evolution. Schema Contracts are additive by default -- they grow but never remove or tighten. Old datoms are always valid because the Schema only grows. Breaking changes require a migration handler (migration IS creation, same loop, same trust).

## Trust Scores

Every transaction carries provenance:

- `:tx/source` -- who created it (`:human`, `:ai/text-generation`, `:system/analysis`, `:web/scraped`)
- `:tx/trust-score` -- 0.0 to 1.0, set at ingestion

Actor-type defaults: `:human -> 1.0`, `:ai/text-generation -> 0.85`, `:system/analysis -> 1.0`, `:web/scraped -> 0.4`. These are Contract defaults that refine per domain.

For derived content the propagation rule is `min(source_trusts)` -- the chain stays honest. Handler override can raise the actor's contribution to the min calculation if its governing Behavior Contract is verifiable.

## Datoms as CRDT

Datoms ARE a CRDT:
- **assert** (Op=true) = add to a grow-only set
- **retract** (Op=false) = tagged remove
- Operations are commutative -- order of arrival doesn't matter for final state

This means datom stores can replicate and merge without coordination. The Sync Contract specifies conflict resolution per attribute type.

## Observability as Datoms

LLM invocation metadata (tokens, cost, latency, model) is stored as regular datoms alongside results. Queryable via Projection, displayable on Surfaces, aggregatable over time. No separate observability layer.

## Dual Nature

- **At rest** -- a datom is a *fact* in the log
- **In motion** -- a datom is an *intent* (the effect parameter entering the creation loop)

The datom IS the diff unit. In the d2ts (differential dataflow) layer, datoms map directly to multiplicity changes.

## Implementation

See `arch-datom-store.md` for the DatomStore implementation details including storage format, indexing, and compaction.
