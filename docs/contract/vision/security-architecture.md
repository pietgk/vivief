# Security Architecture

> Security is Contract enforcement at bridge boundaries. No new concept — infrastructure IS effectHandler enforcement.

**Status**: Proposed — pending validation through first bridge implementation with trust boundaries.

**Origin**: Design interview resolving sandbox model, detection layers, and trust configuration ([archived intent](../../archive/security/security-architecture.md)).

**Related Documents**:
- [vivief-concepts-v6.md](../vivief-concepts-v6.md) — Contract types, enforcement strategy, trust boundary heuristic
- [bridging.md](bridging.md) — Every bridge boundary is a security boundary
- [effecthandler-roles.md](effecthandler-roles.md) — System actors (trust 1.0)
- [concepts-contract Claude window](../../claude/concepts-contract.md) — Contract enforcement modes

---

## Summary

Five design decisions define vivief's security model:

| Decision | Resolution |
|----------|-----------|
| Enforcement model | Contract-driven infrastructure wiring |
| Detection layers | Guard Contracts + enforcement effectHandlers |
| Trust score shape | Scalar (0.0-1.0), evolve to vector per domain |
| Human review threshold | All convention-changing writes, domain overrides |
| Trust propagation | `min(source_trusts)`, no automatic increase |

## Enforcement Model: Contract-Driven Infrastructure Wiring

Contract datoms declare security policy:

```clojure
[sandbox:ingestion :sandbox/network-policy    :allowlist-only          tx:1 true]
[sandbox:ingestion :sandbox/allowed-domains   ["api.example.com"]      tx:1 true]
[sandbox:ingestion :sandbox/filesystem        :read-only               tx:1 true]
[sandbox:ingestion :sandbox/process-isolation true                     tx:1 true]
```

A system-actor effectHandler (trust 1.0) reads these Contract datoms and applies OS primitives (seccomp profiles, cgroup limits, network namespaces, filesystem bind mounts).

**Why this works within the 5-concept model**: The Contract IS the specification. The infrastructure effectHandler IS the enforcement. `Contract(effectHandler)` where the effectHandler happens to call OS APIs. No new concept needed.

**Trust boundary heuristic** (from v6 §2.4): handler trust < Contract criticality → external enforcement. System actors have trust 1.0, so they enforce external Contracts for lower-trust handlers.

### Sandbox Levels

```
Sandbox = scoped Projection + gated promotion Contract
```

| Level | Projection Scope | Contract | Network | Trust |
|-------|-----------------|----------|---------|-------|
| **Ingestion** | Untrusted content only | Schema + instruction detection Guard | Allowlisted domains | Lowest |
| **Creation** | Own sandbox + scoped context | Behavior + Trust Contract | Depends on handler | Medium |
| **Recap** | Stored validated content | Schema only | None | Higher |

Each sandbox is a Projection scope + Behavior Contract + Trust Contract. No special infrastructure.

## Detection Layers: Guard Contracts + Enforcement effectHandlers

Each detection mechanism is a Guard Contract (declares WHAT) paired with a system-actor effectHandler (implements HOW):

| Detection | Guard Contract | Enforcement effectHandler |
|-----------|---------------|--------------------------|
| **Instruction detection** | "Flag input matching injection patterns" | Regex + embedding similarity on incoming content |
| **Behavioral validation** | "No unexpected state changes" | Snapshot state before/after handler execution, compute diff |
| **Surface diffing** | "Output matches expected structure" | Hash Surface output, compare to expected |
| **Trust aggregation** | "Derive trust datom from source trusts" | Compute `min(source_trusts)` over input provenance chain |

Guard Contracts are **advisory** (flags, not blocks) unless the Contract declares them as blocking. This prevents false positives from disrupting workflows while still surfacing concerns.

## Trust Configuration

### Trust Score: Scalar

Start with a single `0.0-1.0` scalar. Simpler to reason about, display, compare, and threshold.

```clojure
[:datom:X :trust/score 0.7 tx:42 true]
```

Trust score shape is a Contract configuration point — stored as a datom. When a domain requires dimensions (e.g., clinical needs source-trust vs content-trust vs temporal-trust), that domain adds dimensions. Platform machinery (Projection filtering by trust threshold) remains the same.

### Human Review Threshold

**Default**: All convention-changing writes require human review.

Domain-specific overrides via Contract configuration:

| Domain | Threshold | Rationale |
|--------|-----------|-----------|
| Clinical | All AI writes | Patient safety — no autonomous decisions |
| DevAC | Project-level changes only | Developer productivity — trust for file-level changes |
| Procurement | Schema + Contract changes | Data quality — extraction is routine, schema evolution is critical |

Start strict, relax based on tracked false-positive rates. The creation loop already has the approval mechanism: effectHandler proposes, human approves. The threshold determines WHICH proposals require approval.

### Trust Propagation

**Rule**: `min(source_trusts)` — a chain is only as trusted as its weakest link.

```
source_A (trust 0.9) + source_B (trust 0.3) → derived datom (trust 0.3)
```

**No automatic trust increase.** Trust rises only through human approval: "this curated source has proven reliable."

Maps to Contract evolution lifecycle: `:default` → `:domain-refined` → `:experience-refined` → `:locked`.

This prevents trust laundering — untrusted content cannot gain trust by passing through a trusted intermediary.

## Threat Model Reference

The complete threat model (attack taxonomy, concrete vectors, defense mapping) remains in the [archived intent](../../archive/security/security-architecture.md). The contract here captures the resolved design decisions; the archive preserves the analysis that led to them.

Key threats and their Contract-level defenses:

| Threat | Defense Contract |
|--------|-----------------|
| Direct injection | Schema Contract (input validation) |
| Indirect injection | Guard Contract (instruction detection) + Trust Contract (untrusted source trust) |
| Multi-step chained attacks | Behavioral validation Guard Contract (state diff across turns) |
| Tool-use exploitation | Behavior Contract (parameter validation) + Trust Contract (tool access control) |
| Semantic manipulation | Aggregation Contract (quality drift detection over time) |
| Trust laundering | `min(source_trusts)` propagation rule |
