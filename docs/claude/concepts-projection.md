---
topic: projection
status: canonical
depends-on: [concepts-datom]
human-version: ../contract/vivief-concepts-v6.md#22-projection
last-verified: 2026-03-30
---

# Projection

Lens + Seal merged into one concept. Query + access + encryption + delivery + freshness + trust in a single unit.

## Interface

```typescript
interface Projection {
  filter: DatomQuery         // what datoms to include
  sort: SortSpec             // ordering
  group?: GroupSpec          // grouping (for Board surfaces)
  depth?: DepthSpec          // traversal depth
  capability: CapabilityToken // who is asking
  scope: "own" | "consented" | "all"
  decryptionKey?: DerivedKey // client-side decryption
  delivery: "snapshot" | "live" | "live-persistent" | "replay"
  freshness?: "committed" | "in-flight"
  trustThreshold?: number    // exclude datoms below this trust score
}
```

## Delivery Modes

| Mode | Behavior |
|------|----------|
| **snapshot** | Current state, one-shot |
| **live** | Current state + future matching datoms. Ephemeral -- dies on Surface unmount |
| **live-persistent** | Like live but independent entity with lifecycle. Survives Surface unmount. Recorded as datoms with `:projection/status` (active/paused/stopped) |
| **replay** | Full history from tx:0 or asOf(tx). Time-travel |

Live Projections are ephemeral by default. Mark persistent when they must outlive any particular Surface. On Store compaction, persistent Projections re-snapshot automatically via `:effect/compaction-complete`.

## Named Profiles

Three built-in convenience factories:

```typescript
Projection.snapshot(query, capability)  // delivery: snapshot, freshness: committed
Projection.live(query, capability)      // delivery: live, freshness: committed
Projection.stream(query, capability)    // delivery: live, freshness: in-flight
```

Teams define domain-specific profiles (debug, trusted, audit) using the same factory mechanism.

## Composite Projection

A Surface needing multiple data sources composes Projections by name:

```typescript
CompositeProjection({
  session: Projection.live(sessionQuery, cap),
  notes: Projection.snapshot(notesQuery, cap),
  metrics: Projection.stream(metricsQuery, cap)
})
```

Each constituent keeps its own trust scope, delivery mode, and access rules -- no lossy merging.

## Trust-Scoped Filtering

The `trustThreshold` field filters datoms by `:tx/trust-score`. An LLM context load with `trustThreshold: 0.7` excludes low-trust datoms from the context window. A human reviewing all sources uses `trustThreshold: 0.0`.

## Projection Contract (optional)

Constrains what a Projection is allowed to query -- making authorization explicit:

```typescript
interface ProjectionContract {
  requiredCapability: CapabilityToken
  maxScope: "own" | "consented" | "all"
  redacted?: AttributeKw[]  // readable for compute, forbidden for display
}
```

Redaction separates compute-access from display-access: "The AI actor can read `:client/ssn` for fraud analysis, but no Surface may display it."

## Key Relationships

- A Surface consumes a Projection: `Surface(projection, mode)`
- Multiple Surfaces can share one Projection
- Projections are the trust boundary between stored datoms and actors that consume them
