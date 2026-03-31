# Reactive Subscription vs NATS — Gap Analysis

> Analysis document. Not a spec. Helps decide whether vivief-concepts' "reactive subscription" is sufficient or needs extension.

## 1. Context

vivief-concepts.md v1.1 removed "signals" as a handler output concept. Handlers now produce exactly two things:

```typescript
handler(state, effect): { datoms: Datom[], effects: Effect[] }
```

Notification is handled by **reactive subscription** — a property of the datom store, not the handler. When datoms are committed, the store notifies all subscribers whose subscriptions match the committed datoms. The implementation varies (EventTarget, Hypercore append, WebSocket push) but the concept is uniform.

Previous architecture iterations (v1, v2, v4a, v4b) relied on NATS for 10+ distinct capabilities: pub/sub, persistence, KV storage, request-reply, transaction ordering, and more. This document maps which NATS capabilities reactive subscription absorbs, which it does not, and whether the gaps matter.

## 2. Core Mapping — NATS Capabilities to vivief-concepts

| # | NATS Capability | vivief-concepts Equivalent | Reactive Sub? | Notes |
|---|---|---|---|---|
| 1 | **Pub/sub fan-out** (`datom.stream`, `viviefco.tx.committed`) | Datom store notifies matching subscribers on commit | **Yes** | This IS reactive subscription |
| 2 | **Subject-based routing** (attribute namespace filtering) | DatomQuery filter on subscription (`:session/*`, `:client/*`) | **Yes** | Lens filter / DatomQuery replaces NATS subject hierarchy |
| 3 | **JetStream persistence + replay** (startup recovery) | Hypercore (append-only log) + Hyperbee (B-tree indexes) | No | Persistence is the datom store's job, not subscription's |
| 4 | **Request-reply** (synchronous LLM calls) | Direct function calls (in-process) / Protomux IPC (cross-process) | No | Not a notification concern |
| 5 | **KV store** (dedup hashes, active schemas, metrics) | Hyperbee + schema-as-datoms | No | Versioned, P2P-replicated. Strictly better than NATS KV |
| 6 | **Object store** (raw file storage) | Hyperdrive (versioned P2P filesystem) | No | Offline-capable, content-addressed |
| 7 | **Consumer groups** (load balancing across handlers) | Not directly addressed | No | **Watch item** — see section 5 |
| 8 | **Global Tx ordering** (v4b: NATS assigns Tx numbers) | Autobase (causal DAG) / natural single-writer ordering | No | Single-writer: natural. Multi-writer: Autobase causal order |
| 9 | **Backpressure / flow control** | Transport-layer: JS event loop, Protomux streams, Hypercore replication | No | Each layer has its own mechanism. No unified layer needed |
| 10 | **Multi-process coordination** (MCP + CLI + AI workers) | Protomux IPC (daemon mode) | No | Same pattern as devac's hub single-writer IPC |

**Score: 2 of 10 NATS capabilities are reactive subscription. The other 8 were never about notification.**

## 3. What Replaces What

| Replaced By | NATS Capabilities |
|---|---|
| **Reactive subscription** (datom store property) | Pub/sub fan-out, Subject-based routing |
| **Holepunch stack** (Hypercore, Hyperbee, Hyperdrive, Autobase, Protomux) | JetStream persistence, Global Tx ordering, Object store, Multi-process coordination, Backpressure |
| **Datom model** (schema-as-datoms + Hyperbee lookups) | KV store |
| **Dispatcher** (direct calls + IPC routing) | Request-reply, Consumer groups |

## 4. What Reactive Subscription Actually Covers

These are the five use cases defined in vivief-concepts.md §2.7 and §3, mapped to the NATS capability each replaces:

| Reactive Subscription Use Case | Replaces NATS... |
|---|---|
| **Surfaces stay current** — Lens-based subscription triggers re-render | Pub/sub fan-out to UI consumers |
| **AI loop observes** — attribute namespace subscription dispatches analysis | Subject-based routing + pub/sub |
| **P2P replication propagates** — Hypercore append notifies peers | JetStream consumer notification (not persistence) |
| **Reactive datom projections** — TanStack DB collections update | Pub/sub fan-out to client-side state |
| **effectHandler cascade** — committed datoms trigger downstream effects | Pub/sub fan-out to handler chain |

The key property: **no handler specifies who to notify**. The store's reactive subscription model handles it. Adding a new Surface, AI handler, or peer requires zero changes to existing handlers.

## 5. Do the Gaps Matter?

| Gap | Matters? | Why / Why Not |
|---|---|---|
| No persistence in subscription | **No** | Hypercore IS the durable log. Hyperbee avoids full replay on startup. The datom store handles this independent of notification. |
| No request-reply | **No** | Handlers call handlers directly (in-process). Cross-process: dispatcher routes via Protomux IPC. Request-reply is a dispatch pattern, not a notification pattern. |
| No KV store | **No** | Hyperbee (B-tree on Hypercore) + schema-as-datoms. Versioned, P2P-replicated, content-addressed. Strictly better than NATS KV for vivief's needs. |
| No object store | **No** | Hyperdrive. Versioned filesystem, P2P-replicated, offline-capable. NATS Object Store was a convenience that Hyperdrive replaces with stronger guarantees. |
| No consumer groups | **Maybe** | Single-device (embedded mode): one process, no load balancing needed. Multi-device: Autobase handles multi-writer coordination, but that is different from distributing work across consumers. If multi-device AI analysis requires load balancing (e.g., "only one device runs the expensive LLM analysis"), this needs explicit design. Current mitigation: the `:tx/source` datom attribute can prevent duplicate analysis, but it is reactive dedup, not proactive routing. |
| No global Tx ordering | **No** | Single-writer embedded mode has natural monotonic ordering. Multi-writer uses Autobase's causal DAG — weaker than global ordering, but sufficient for counseling (no strict serializability required across peers). |
| No explicit backpressure | **No** | JS event loop provides natural backpressure for in-process subscriptions. Protomux provides stream-level flow control for IPC. Hypercore replication has built-in backpressure. No single unified mechanism is needed because each transport boundary has its own. |
| No multi-process coordination | **No** | Protomux IPC in daemon mode. Same architecture as devac's hub single-writer pattern (ADR-0024). NATS was overkill for local multi-process coordination on a single machine. |

### The one watch item: consumer groups

NATS consumer groups provide: "N consumers subscribe, each message goes to exactly one." This is useful when you want to distribute expensive work (LLM analysis) across multiple workers without duplication.

In vivief's current model (single-device, embedded), this is unnecessary — there is one process. In a future multi-device scenario, the question becomes: "If both the MacBook and the phone are online, who runs the expensive AI analysis?"

Current approach: both run it, `:tx/source :ai` + Contract dedup prevents conflicting results. This works but wastes compute.

Future option if needed: a "claim" datom pattern — before running expensive analysis, a device asserts `[effect:X, :effect/claimed-by, device:macbook, tx:N, true]`. Other devices see the claim via reactive subscription and skip. This is reactive coordination, not infrastructure — it uses the existing datom + reactive subscription model without adding a new concept.

## 6. Conclusion

Reactive subscription cleanly replaces the 2 NATS capabilities that were conceptually about notification: pub/sub fan-out and subject-based routing. These were the capabilities that made NATS feel essential in v1/v2 — every handler "published signals" to NATS, and every Surface/AI-loop "subscribed" via NATS. Reactive subscription captures this pattern without coupling it to a specific transport.

The remaining 8 NATS capabilities were never about notification. They were about persistence (JetStream → Hypercore), storage (KV → Hyperbee, Object Store → Hyperdrive), coordination (consumer groups → dispatcher, multi-process → Protomux), ordering (global Tx → Autobase), and transport (backpressure → per-layer). These are handled by the Holepunch stack, the dispatcher, and the datom model itself. Reactive subscription does not need extension. The one area to watch is consumer-group-style work distribution if multi-device AI analysis becomes a requirement — addressable via a "claim" datom pattern within the existing model.

## 7. References

- `docs/vision/vivief-concepts.md` §2.7 (effectHandler output + reactive subscription), §3 (concept composition + connective tissue)
- `docs/spec/counseling/counseling-platform-architecture-v1.md` §6.1 (NATS as event backbone), §10.1 (handlers produce signals)
- `docs/spec/counseling/viviefco-architecture-v4.md` v4a (NATS backbone), v4b (NATS as coordinator), v4c (NATS-optional)
- `docs/spec/counseling/viviefco-architecture-ideas.md` §"5 elegant patterns" (NATS replaced by EventTarget for single-device)
