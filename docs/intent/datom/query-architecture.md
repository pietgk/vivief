# Brainstorm: Datom Model & Layered Query Architecture

**Status:** Resolved (2026-04-09) — Option A (Clean Datom) from the start
**Date:** 2026-03-27
**Sources:** [vivief-p2p-node-architecture](vivief-p2p-node-architecture.md), [vivief-concepts-v6](../vivief-concepts-v6.md), [viviefco-architecture-ideas §Datoms-vs-typed-structs](../../spec/counseling/viviefco-architecture-ideas.md), current DevAC implementation (devac-core)

**Starting question:** Should DevAC's three-concept data model (Nodes + Edges + Effects) collapse to two (Effects + Edges)?

**Where it went:** The merge question was wrong. Nodes, edges, and effects are all datoms. The real question is: should DevAC adopt a full datom model internally? Answer: yes — with a layered query architecture (TypeScript API + D2TS + DuckDB SQL).

## Resolution

Two design decisions resolved via interview:

1. **Option A (Clean Datom) from the start.** Skip the DuckDB wrapper phase (Option B). Build DatomStore with native Map indexes (EAVT/AEVT/AVET/VAET) from day one. 200MB for a typical 50K-entity codebase, ~1GB for 250K entities — comfortable on any developer machine. DuckDB kept only as a separate Layer 3 analytics engine (materialized views, `query_sql` MCP tool preserved). The wrapper phase would introduce a leaky abstraction (EAV queries over relational store = self-JOINs, pivot queries) that is wasted effort when the spike proves native indexes work.

2. **Spike proceeds as defined** in `virtual-projections-spike.md`. The 4 existential claims remain the make-or-break risks: (1) datom model performance, (2) N+1 elimination, (3) LLM TypeScript generation, (4) template routing. The architecture brainstorm strengthened the case but did not change the spike deliverables.

---

## The Question

DevAC currently has three first-class data concepts:
- **Node** — what EXISTS in code (function, class, variable) — 22 fields, 18 kinds, stable entity_id
- **Edge** — how things RELATE (CALLS, IMPORTS, EXTENDS) — 11 fields, 21 types
- **Effect** — what code DOES (FunctionCall, Store, Send) — 25+ sparse fields, 15 types

The proposal: merge Node into Effect. A function declaration IS an effect — the effect of writing code. The model becomes **Effects + Edges**.

---

## 1. The Merged Model Concretely

### Effect Type Hierarchy

```
Effect
  +-- DeclarationEffect (replaces nodes)
  |     function, class, method, variable, interface, type,
  |     enum, jsx_component, hook, story, etc. (18 kinds)
  |
  +-- BehavioralEffect (current code effects)
  |     FunctionCall, Store, Retrieve, Send, Request,
  |     Response, Condition, Loop, Group
  |
  +-- StructuralEffect (subset of current edges, promoted)
  |     Contains, Extends, Implements, Returns, ParameterOf,
  |     TypeOf, Decorates, Overrides
  |
  +-- WorkflowEffect (unchanged)
        FileChanged, SeedUpdated, ValidationResult,
        IssueClaimed, PRMerged, ChangeRequested
```

### What Changes

| Current | Merged Model |
|---------|-------------|
| Parser outputs `{ nodes[], edges[], externalRefs[], effects[] }` | Parser outputs `{ effects[] }` (all four collapsed) |
| 3 Parquet files (nodes, edges, effects) | 1 primary (effects) + 1 derived (edges as materialized view) |
| `entity_id` for nodes, `effect_id` for effects | Unified ID: content-addressed for declarations, generated for behaviors |
| CALLS edge + FunctionCall effect (redundant) | FunctionCall effect only; CALLS edge derived |
| Structural edges produced by parser | Structural effects produced by parser; edges derived |

### The Pipeline Becomes

```
Source Code
  → Parser (effectHandler)
    → Effects (declarations + behaviors + structural + external refs)
      → Edge Materializer (effectHandler)
        → Edges (materialized view for graph traversal)
      → Rules Engine (effectHandler)
        → Domain Effects
      → Datom Translator (effectHandler)
        → Datoms (for MoQ publishing)
```

Every stage: `(state, intent) => (state', [intent'])`. One pattern. One composition model.

---

## 2. Where This Is Elegant and Clean

### 2a. Perfect V6 Alignment

The vivief formula is `effectHandler = (state, intent) => (state', [intent'])`. If the parser outputs only effects, the entire DevAC pipeline is effectHandler composition:

```
Parser:         (codeState, FileChanged)    => [DeclarationEffect*, FunctionCallEffect*, ContainsEffect*]
Materializer:   (graphState, Effect*)       => [Edge*]
Rules Engine:   (ruleState, CodeEffect*)    => [DomainEffect*]
Validator:      (checkState, Effect*)       => [ValidationEffect*]
Translator:     (datomState, Effect*)       => [Datom*]
```

No special cases. The pipeline IS the architecture.

### 2b. Eliminates the CALLS/FunctionCall Redundancy

Currently the parser produces BOTH:
- `Edge { source: handleClick, target: stripeCharge, type: CALLS }`
- `Effect { type: FunctionCall, source: handleClick, target: stripeCharge, isAsync: true, isExternal: true }`

The effect has strictly more information. The edge is a lossy projection. In the merged model, only the FunctionCall effect exists; the CALLS edge is derived by the materializer. One source of truth instead of two.

### 2c. Schema Evolution for Free

New observation about code = new effect kind. No migration. No new table. No new Parquet file. This mirrors the datom model's additive evolution. The existing `properties: JSON` escape hatch on both nodes AND effects exists precisely because rigid schemas can't evolve cheaply — a unified effect model with kind-based dispatch eliminates this.

### 2d. Datom Translation Becomes Uniform

At the MoQ boundary (P2P node architecture, Section 7):

```
Declaration Effect → pure EAV datoms:
  [fn:abc123, :node/kind, "function", tx1, assert]
  [fn:abc123, :node/name, "handleClick", tx1, assert]

Behavioral Effect → structured-value datom:
  [fn:abc123, :effect/fn-call, { target, isAsync, ... }, tx1, assert]

Structural Effect → structured-value datom:
  [class:Foo, :edge/CONTAINS, { child: method:bar, line: 42 }, tx1, assert]
```

One translation pipeline. Three datom strategies (pure EAV, structured-value, ref) selected by effect category. This is EXACTLY what the viviefco-architecture-ideas analysis recommended (lines 822-831) — we're just getting there through effects instead of keeping separate tables.

### 2e. effectHandler as Actor Maps to P2P Nodes

The P2P node architecture (Section 3) defines DevAC Node actors:
- Code Analyzer → parser effectHandler
- Hub Manager → stateful effectHandler (XState actor)
- Validator → effectHandler
- MoQ Publisher → translator effectHandler

If the parser outputs effects, these actors compose via effects. The Code Analyzer produces effects, the Hub Manager receives and indexes them, the Validator checks them, the Publisher translates them. Cross-node communication is datom streams (which ARE effects). Node-local communication is effect passing between actors.

### 2f. Rules Engine Gets More Powerful

Currently the rules engine only matches on Code Effects (FunctionCall, Store, etc.). If declarations are effects, rules can match on declarations too:

```typescript
defineRule({
  id: "exported-async-no-error-handling",
  match: {
    effectType: "Declaration",
    subkind: "function",
    predicate: (e) => e.is_exported && e.is_async
  },
  emit: { domain: "Reliability", action: "AsyncExportNeedsErrorBoundary" }
})
```

The rules engine becomes a universal pattern matcher over ALL code observations, not just behavioral ones.

---

## 3. Where This Is Totally Wrong

### 3a. Entity Identity Crisis (FATAL if not resolved)

Nodes have **stable** `entity_id`: `{repo}:{package_path}:{kind}:{scope_hash}`. This is the backbone of the entire system — edges reference it, MCP tools query by it, cross-file resolution depends on it, the hub federates by it.

Effects have **ephemeral** `effect_id`: `eff_{timestamp}_{random}`.

If declarations become effects, they MUST adopt the entity_id scheme. But then a "Declaration Effect" is functionally a node with a different name — same identity, same fields, same role. The merge becomes a rename, not a real unification.

**Counter-argument:** This is actually fine. Declaration Effects use entity_id format. Behavioral Effects use content-addressed IDs based on source+target+type. The ID format varies by effect category — just as the datom strategy varies (pure EAV vs structured-value). The unified concept is "Effect"; the varied implementation is "how each effect kind handles identity."

**Verdict:** Solvable but reveals that declarations are fundamentally different from other effects — they ARE entities, not observations about entities.

### 3b. The God Table Problem (REAL but mitigatable)

The effects table already has 37+ sparse columns. Adding node fields (name, qualified_name, kind, type_signature, visibility, is_exported, decorators, type_parameters, documentation — 17 meaningful fields) pushes to 55+ columns.

In DuckDB/Parquet:
- NULL encoding is efficient (columnar format handles sparsity well)
- But `SELECT *` returns a wall of NULLs
- Queries become harder to write: `WHERE effect_type = 'Declaration' AND kind = 'function'` instead of `WHERE kind = 'function'`
- Indexes multiply

**Counter-argument:** This is the wrong framing. The merged model shouldn't use a single wide table. Use the datom approach: effects are stored as structured-value datoms where V is a typed struct. The "table" is conceptual — storage is optimized per effect category. Declaration effects in one partition/file, behavioral effects in another.

**Verdict:** Solvable with partitioned storage. But then you have... separate storage for nodes and effects, which is what we have now, just renamed.

### 3c. Semantic Category Error

A function declaration and a stripe.charge call are categorically different:

| | Declaration | Behavioral Effect |
|---|---|---|
| **Nature** | What EXISTS | What HAPPENS |
| **Persistence** | Exists as long as code exists | Happens each time code runs |
| **Identity** | IS an entity (has stable ID) | IS ABOUT an entity (references one) |
| **Mutability** | Changes when code is edited | Immutable observation |
| **Purpose** | Graph structure, dependency analysis | Behavior understanding, documentation |

Calling both "effects" loses this distinction. The vivief concepts doc says "Intent is an effect" — the `effect` parameter entering the creation loop. A function declaration is NOT an intent; it's a fact about code structure.

**Counter-argument:** In the `(state, intent) => (state', [intent'])` model, the parser takes source code (state) and FileChanged (effect), and produces observations. A declaration IS an observation the parser makes. The parser observes "a function named handleClick exists at line 42." That's an effect of parsing, not an effect of code execution. The semantic shift: effects are observations, not actions.

**Verdict:** This redefines "effect" to mean "observation" — which is coherent but diverges from the V6 definition where effects are closer to "actions that produce state changes." The V6 formula `(state, intent) => (state', [intent'])` reads as "given state and an action, produce new state and new actions." Declarations aren't actions.

### 3d. Only 1 of 21 Edge Types Has Real Redundancy

Verified against current implementation:

| Edge Type | Corresponding Effect? | Redundant? |
|-----------|----------------------|------------|
| CALLS | FunctionCall | YES — true redundancy |
| INSTANTIATES | FunctionCall (is_constructor) | Partial |
| CONTAINS | None | NO — purely structural |
| EXTENDS | None | NO |
| IMPLEMENTS | None | NO |
| RETURNS | None | NO |
| PARAMETER_OF | None | NO |
| TYPE_OF | None | NO |
| IMPORTS | None | NO |
| RENDERS | None | NO |
| PASSES_PROPS | None | NO |
| + 10 more declared types | None | NO |

**18 of 21 edge types have no effect counterpart.** The merge would force these into "Structural Effects" — a category that doesn't naturally exist. The CALLS/FunctionCall redundancy is real but tiny compared to the restructuring cost.

**Counter-argument:** The fact that 18 edge types lack effects is a gap in the current effects system, not evidence against the merge. The parser COULD extract Contains, Extends, Imports as effects — it just doesn't yet because effects were added later (v3.0). If we commit to effects-first, these structural observations get extracted as effects from the start.

**Verdict:** Fair point. But it means the merge requires building 18 new effect extractors for structural relationships that the parser already handles fine as edges. Work for no clear benefit.

### 3e. Performance: Graph Traversal

`graphDeps` and `graphDependents` use recursive CTEs over the edges table with indexes on `source_entity_id` and `target_entity_id`. If edges are derived views, either:
- The materialized edge table still exists (so... we still have edges, just auto-derived)
- Or graph queries scan the effects table (much slower)

**Verdict:** You need the edge table for graph traversal. Period. The question is whether it's auto-derived from effects or independently produced. Auto-derivation is cleaner in theory but adds a materialization step and doesn't save anything at query time.

### 3f. The Prior Analysis Already Found a Better Answer

The viviefco-architecture-ideas analysis (lines 688-831) concluded:
- Nodes → pure EAV datoms (schema evolution, history for free)
- Edges → structured-value datoms (one datom with location metadata)
- Effects → structured-value datoms (one datom per effect, attribute = type)
- Unified at the **API level** (DatomQuery), not the **storage level**

This gives you the conceptual unification (everything is a datom with EAV interface) without the storage problems (god table, identity crisis, semantic confusion). The "merge" already happened — at the datom layer.

---

## 4. The Crazy Idea: What If We Go ALL The Way?

Forget half-measures. What if effects are the ONLY concept?

```
Effect = any observation about code
  - "function handleClick exists at line 42"     → Declaration observation
  - "handleClick calls stripe.charge"            → Behavioral observation
  - "class PaymentService contains processPayment" → Structural observation
  - "handleClick is async and exported"          → Attribute observation
```

No edges. No nodes. Just a stream of observations, each a datom:

```
[fn:handleClick, :exists,        true,                    tx:1, assert]
[fn:handleClick, :kind,          "function",              tx:1, assert]
[fn:handleClick, :name,          "handleClick",           tx:1, assert]
[fn:handleClick, :is-async,      true,                    tx:1, assert]
[fn:handleClick, :calls,         {target: fn:stripeCharge, async: true}, tx:1, assert]
[class:PaymentService, :contains, fn:processPayment,      tx:1, assert]
```

This IS the pure datom model. And it already exists in the architecture — it's what the MoQ boundary translation produces. The "crazy idea" is: what if we use the datom model internally too, not just at the boundary?

**Why this could be powerful:**
- One concept, one storage format, one query API
- Schema evolution = just write new attributes
- History = append-only log of observations
- Sync = operation-based CRDT (assert/retract are commutative)
- The entire code graph is a datom log

**Why this breaks:**
- Performance. The viviefco analysis calculated: 250K nodes × 22 attributes = 5.5M datoms ≈ 1.1GB. Add edges and effects: 15-20M datoms ≈ 3-4GB. Too much for in-memory on dev machines.
- DuckDB excels at columnar queries on typed tables. Datom stores need custom indexing (EAVT, AEVT). We'd lose DuckDB's query performance.
- The current DevAC implementation is working. A full rewrite to datom storage is months of work for unclear benefit in the near term.

**Verdict:** The pure datom model is the right END STATE (as the viviefco analysis concluded). But it's a migration target, not a starting point. The boundary translation approach (current DevAC internals → datoms at MoQ boundary) is the right near-term path.

---

## 5. What's Actually Worth Doing

### The Insight Worth Keeping

The proposal reveals three real insights:

**Insight 1: The CALLS/FunctionCall redundancy is a code smell.** The parser shouldn't produce both a CALLS edge and a FunctionCall effect. One should derive from the other. The effect is richer → derive the edge from the effect.

**Insight 2: effectHandler composition is the right architectural pattern.** Every stage of the DevAC pipeline (parse, resolve, materialize, validate, enrich, publish) follows `(state, intent) => (state', [intent'])`. This should be formalized, not because we merge storage, but because it aligns with V6 and makes the pipeline composable.

**Insight 3: The datom layer is where unification happens.** Nodes, edges, and effects are different storage shapes that converge at the datom API level. The merge happens in the query interface, not the storage.

### Recommended: "Effects Pipeline, Datom Interface, Separate Storage"

1. **Parser continues to produce nodes + edges + effects** — separate concepts, separate storage, separate indexes. This works and is optimized.

2. **Eliminate the CALLS/FunctionCall redundancy** — parser produces FunctionCall effects; a materializer derives CALLS edges. This is the one real redundancy worth fixing.

3. **Formalize effectHandler composition** — each pipeline stage is an effectHandler. Parser, materializer, rules engine, validator, enricher, translator. This is naming + typing, not restructuring.

4. **Datom API over all three** — the DatomQuery interface provides `(entity, attribute, value, tx, op)` access regardless of underlying storage. Nodes → pure EAV datoms. Edges → structured-value datoms. Effects → structured-value datoms. Unified query, optimized storage.

5. **At MoQ boundary, emit datoms** — already planned in P2P node architecture Section 7. The translation is straightforward from either three tables or one.

### What NOT To Do

- Don't merge the storage. The god table problem is real. Separate Parquet files with separate indexes is the right storage model.
- Don't rename nodes to "Declaration Effects." It's a forced metaphor that adds confusion without adding capability.
- Don't build 18 new structural effect extractors. The parser handles structural relationships fine as edges.
- Don't rewrite the parser output interface. `{ nodes[], edges[], effects[] }` is clear and well-understood.

---

## 6. Verdict

**The merge is a bad idea as a storage change. It's a good idea as an architectural pattern.**

The storage merge creates problems (identity crisis, god table, semantic confusion, performance regression) to solve a problem that doesn't exist (the three concepts aren't actually redundant — only CALLS/FunctionCall is).

The architectural insight — effectHandler composition, datom unification at the API level, edge derivation from effects — is valuable and should be pursued. But it doesn't require merging the tables. It requires:
1. Fixing the one real redundancy (CALLS ↔ FunctionCall)
2. Formalizing the effectHandler pattern across the pipeline
3. Building the datom API layer over existing storage

The prior viviefco-architecture-ideas analysis got this right: unify at the interface, not the storage.

---

---

## 7. Challenge Round: The Deeper Insight

My Section 6 verdict said "merge is bad at storage, good at architecture." But that's the safe answer. Let me challenge it by pushing on what V6 actually says.

### 7a. V6 Already Unifies — We Just Haven't Noticed

V6 §2.5 (line 372): "Effects are data. What devac extracts from code (function calls, stores, sends) are effects. All queryable as datoms."

V6 §1 (line 9): "All creation follows `(state, intent) => (state', [intent'])`."

V6 (now updated) uses "intent" for the trigger and "effect" for observations:
1. **Trigger/Intent**: the `intent` parameter entering `handler(state, intent)` — `:file/changed`, `:sync/requested`
2. **Observation**: behavioral facts stored as datoms — FunctionCall, Store, Send (still `:effect/*` namespace)

This overloading hides a cleaner model. What if the distinction isn't **type** (trigger vs observation) but **phase**?

### 7b. The Phase Insight: Datoms at Rest vs Datoms in Motion

```
A datom at rest  = a fact in the store (queryable via Projection)
A datom in motion = a trigger entering an effectHandler (causes computation)
```

The SAME data, two roles depending on context:

| Phase | What it is | Example |
|-------|-----------|---------|
| **In motion** | Effect — triggers computation | FunctionCall datom enters Rules Engine |
| **At rest** | Fact — queryable state | FunctionCall datom stored in datom store |

This means:
- Entity datoms (DevAC nodes) have BOTH phases: at rest (entity facts), in motion (trigger edge resolution, Contract checking, C4 updates when new entity appears)
- Behavioral datoms (DevAC code effects) have BOTH phases: at rest (behavioral facts), in motion (trigger rules engine, aggregation)
- Relationship datoms (DevAC edges) have BOTH phases: at rest (graph structure), in motion (trigger dependency analysis)

**There is no separate "effect type." There are only datoms with different attribute namespaces.** The `:node/*` namespace is entity datoms. The `:effect/*` namespace is behavioral datoms. The `:edge/*` namespace is relationship datoms. But they're all datoms. The "effect" role is a phase, not a type.

### 7c. This IS How D2TS Works

D2TS (Differential Dataflow) processes multisets of tuples:
- `assert(+1)` = datom in motion, entering the pipeline
- `retract(-1)` = datom in motion, leaving the pipeline
- `frontier` = datoms at rest (committed state)

Every D2TS operator is an effectHandler:
- Maintains state (arrangements)
- Receives datoms in motion (input changes)
- Produces datoms in motion (output changes)

The DevAC pipeline AS D2TS:
```
FileChanged (datom in motion)
  → Parser Operator
    → entity datoms (in motion)
    → behavioral datoms (in motion)
    → relationship datoms (in motion)
  → Index Operator (maintains edge arrangements)
  → Rules Operator (matches patterns, emits domain datoms)
  → Validator Operator (checks constraints, emits diagnostics)
  → Publisher Operator (translates to MoQ tracks)
```

Every operator is an effectHandler. Every message is a datom. The distinction between "node," "edge," and "effect" dissolves into attribute namespaces.

### 7d. The DevAC Pipeline as Actor Composition

Combining the effectHandler-as-actor model (V6 §2.5: two levels — function and actor) with the datom-in-motion model:

```
FileChanged (datom in motion)
  │
  ▼
Parser Actor (effectHandler, maintains AST cache)
  ├→ [:fn/abc, :node/kind, "function", tx:1, assert]     (entity datom)
  ├→ [:fn/abc, :node/name, "handleClick", tx:1, assert]   (entity datom)
  ├→ [:fn/abc, :effect/calls, {target: :fn/def}, tx:1, assert] (behavioral datom)
  └→ [:class/X, :contains, :fn/abc, tx:1, assert]         (relationship datom)
  │
  ├──────────────────┬───────────────────┐
  ▼                  ▼                   ▼
Index Actor     Rules Actor         Validator Actor
(edge indexes)  (pattern match)     (constraint check)
  │                  │                   │
  ▼                  ▼                   ▼
graph-updated   domain datoms       diagnostic datoms
  │                  │                   │
  └──────────────────┴───────────────────┘
                     │
                     ▼
              Publisher Actor
              (MoQ tracks)
```

All communication = datoms in motion.
All processing = effectHandlers (function or actor level).
All storage = datoms at rest.
Node/edge/effect = attribute namespaces, NOT architectural concepts.

### 7e. What This Means for the Original Question

**Q: Should we merge node and effect?**

**A: The question is wrong.** Node and effect aren't separate things to merge — they're both datoms. The distinction is an attribute namespace (`:node/*` vs `:effect/*`), not a type system boundary.

**The right question: Should DevAC's internal storage adopt the datom model?**

If yes: nodes, edges, effects all become datoms in a unified store with attribute indexes. The "god table" concern dissolves because datoms don't have tables — they have attribute indexes (EAVT, AEVT). Sparsity is natural (each entity only has the attributes it needs).

If no: Keep DuckDB + Parquet internally, translate to datoms at the MoQ boundary. This is the "DuckDB Inside, Datoms Outside" model from the P2P architecture.

### 7f. The Pure Datom End State

If we commit to datoms internally:

**Storage:**
```typescript
// EAVT index: entity → attribute → set of [value, tx, op]
Map<EntityId, Map<Attribute, Set<[Value, Tx, Op]>>>

// AEVT index: attribute → entity → set of [value, tx, op]
Map<Attribute, Map<EntityId, Set<[Value, Tx, Op]>>>
```

**What "nodes" become:**
```
[:fn/abc, :node/kind,      "function",      tx:1, assert]
[:fn/abc, :node/name,      "handleClick",   tx:1, assert]
[:fn/abc, :node/file,      "src/app.ts",    tx:1, assert]
[:fn/abc, :node/line,      42,              tx:1, assert]
[:fn/abc, :node/is-async,  true,            tx:1, assert]
[:fn/abc, :node/exported,  true,            tx:1, assert]
```

**What "edges" become:**
```
[:fn/abc, :edge/CALLS, { target: :fn/def, file: "src/app.ts", line: 45 }, tx:1, assert]
[:class/X, :edge/CONTAINS, :fn/abc, tx:1, assert]
```

**What "effects" become:**
```
[:fn/abc, :effect/fn-call, { target: :fn/def, async: true, external: true, args: 2 }, tx:1, assert]
[:fn/abc, :effect/store,   { type: "database", op: "INSERT", target: "users" }, tx:1, assert]
```

**What "workflow triggers" become:**
```
[:file/src-app, :trigger/changed, { type: "modified" }, tx:2, assert]
[:seed/pkg-core, :trigger/updated, { nodes: 250, edges: 1000 }, tx:3, assert]
```

Note: "workflow triggers" are the TRUE effects (datoms in motion entering the creation loop). Everything else is datoms at rest, queryable via Projection.

**Schema evolution:** Add `:node/complexity-score` by writing the datom. No migration.

**History:** Retraction = `[:fn/abc, :node/name, "handleClick", tx:5, retract]`. Full history preserved.

**Sync:** Append-only datom log. Assert/retract are commutative (operation-based CRDT).

**Performance concern:** 250K entities × ~10 attrs each = 2.5M entity datoms. + 1M relationship datoms. + 2M behavioral datoms. ≈ 5.5M datoms. At 200 bytes each ≈ 1.1GB in memory. Tight but feasible with tiered storage (hot/warm indexes, Parquet for cold).

### 7g. The Naming Challenge — What V6 Should Clarify

The V6 overloading of "effect" is the root cause of the confusion. A clean V6 revision would distinguish:

| V6 Current | Problem | Clean Term |
|-----------|---------|------------|
| "effect" (trigger) | Conflated with observations | **Intent** (already named in V6 §1) |
| "effect" (observation) | Conflated with triggers | **Observation datom** or just **datom** |
| "Code Effects" (DevAC) | Not true effects — they're observations | **Behavioral datoms** |
| "Workflow Effects" | Mixed: some are triggers, some are observations | Split into **triggers** and **workflow datoms** |

V6 §1 already says "Intent is an effect." If Intent IS the trigger, then maybe the term "effect" should be reserved for triggers only, and behavioral observations should just be... datoms.

But this might be overengineering the terminology. V6 says "Effects are data" precisely BECAUSE the dual nature (trigger + observation) is a feature. A FunctionCall is data (queryable) AND a trigger (enters rules engine). The duality is real. Maybe the overloading is correct.

---

## 8. Three Possible End States

### Option A: "Clean Datom" — Full datom model internally

Everything is datoms. No separate node/edge/effect tables. Attribute namespaces (`:node/*`, `:edge/*`, `:effect/*`, `:trigger/*`) provide the categories. EAVT/AEVT indexes provide the query layer. D2TS processes datom streams incrementally. MoQ publishes datoms directly (no boundary translation needed).

**Elegance:** Maximum. One primitive. One query API. One sync model.
**Risk:** Performance at scale (5M+ datoms in memory). DuckDB's columnar analytics lost. Requires building a custom datom store.
**Timeline:** Months of work. New storage layer. New query engine.
**Alignment with V6:** Perfect. This IS V6's model.

### Option B: "Pragmatic Bridge" — DuckDB inside, datoms outside

Keep DevAC's current node/edge/effect tables with DuckDB + Parquet. At the MoQ boundary, translate to datoms. The pipeline is effectHandler composition (formalized). The CALLS/FunctionCall redundancy is fixed (edges derived from effects where there's overlap). Internally, three concepts. Externally, one primitive.

**Elegance:** Good. Clear separation of concerns. Optimized storage internally.
**Risk:** Low. Incremental change from current state. No rewrite.
**Timeline:** Weeks. Fix CALLS redundancy. Formalize effectHandler pattern. Build datom translator.
**Alignment with V6:** Partial. Internally diverges (tables vs datoms). Externally aligned.

### Option C: "Hybrid Datom" — Datom API over typed storage

Keep DuckDB + Parquet as the storage engine. Layer a DatomQuery API over it that presents everything as `[E, A, V, Tx, Op]`. The API translates queries to SQL internally. The pipeline is effectHandler composition. Storage is optimized per category (separate tables/indexes). But the programming interface is datoms everywhere.

**Elegance:** High. Datom interface without datom storage cost. Best of both worlds?
**Risk:** Medium. The DatomQuery → SQL translation adds complexity. Two mental models (datoms for API, tables for debugging/optimization).
**Timeline:** Medium. Build DatomQuery layer. Refactor parser to produce datoms (internally stored as typed rows).
**Alignment with V6:** High. API is V6-native. Storage is pragmatic.

---

## 9. Recommendation

**Option C ("Hybrid Datom") is the clean, elegant answer.** It gives you:

1. **V6 alignment** — the API speaks datoms, the pipeline speaks datoms, MoQ speaks datoms
2. **Performance** — DuckDB + Parquet behind the API handles 250K+ entities efficiently
3. **Schema evolution** — new attributes at the datom level, translated to `properties: JSON` or new columns at the storage level
4. **effectHandler composition** — the pipeline is formalized as effectHandlers processing datom streams
5. **No rewrite** — existing storage is wrapped, not replaced
6. **Migration path** — if the DatomQuery API proves to be a bottleneck, migrate storage to native datoms (Option A) behind the same API

The key changes:
- Build `DatomQuery` interface over existing DuckDB storage
- Formalize parser output as datom production (internally stored as nodes/edges/effects)
- Fix CALLS/FunctionCall redundancy (derive CALLS edges from behavioral datoms)
- Rename "Code Effects" to "behavioral datoms" in conceptual model (or keep the name but understand the duality)
- Pipeline stages become effectHandlers with explicit `(state, datom[]) => (state', datom[])` signatures

**The merge question dissolves:** You don't merge node into effect. You recognize both are datoms. The DatomQuery API makes this tangible — query entity datoms AND behavioral datoms through the same interface. Storage remains optimized per category underneath.

---

## 10. Full Datom Model — Deep Dive

The user's intuition: "the datom model is easier to question than the graph model." Let's verify this rigorously.

### 10a. The Current Pain: Entity Questions Require N+1 Queries

Verified against current DevAC implementation. Six concrete pain points:

**Pain 1 — Names aren't in edges.** Every graph traversal (graphDeps, graphCalls, graphDependents) does:
1. Recursive CTE over edges table → gets entity_ids
2. Separate `SELECT * FROM nodes WHERE entity_id IN (...)` → gets names
3. Application-level Map building to join them

See `graph.ts:154-225` — the CTE can't access node metadata during recursion.

**Pain 2 — Effects disconnected from nodes.** The `effect-enricher.ts` exists solely to join effects with node metadata:
```typescript
enrichDomainEffects(effects, nodeLookup: NodeLookupMap, ...)
// Must pre-build a Map<entity_id, {name, kind}> from separate query
// Missing metadata → ugly fallback: "function_abc123" instead of readable names
```

**Pain 3 — Impact analysis needs 3-way joins.** `symbol-affected-analyzer.ts:225-256`:
nodes → external_refs → nodes again. Three separate lookups.

**Pain 4 — "Tell me everything about function X" needs 5+ queries:**
1. `SELECT * FROM nodes WHERE entity_id = X` (identity)
2. `SELECT * FROM edges WHERE source_entity_id = X` (outgoing) + node lookup for targets
3. `SELECT * FROM edges WHERE target_entity_id = X` (incoming) + node lookup for sources
4. `SELECT * FROM effects WHERE source_entity_id = X` (behaviors) + enrichment
5. `SELECT * FROM external_refs WHERE target_entity_id = X` (importers)

**Pain 5 — formatEdges() everywhere.** `formatters.ts` builds nodeMap after every edge query because edges don't carry names. This pattern repeats in data-provider.ts, graph.ts, symbol.ts.

**Pain 6 — Summary/Details code paths split.** `symbol.ts:69-154` has 3 separate code paths (counts/summary/details) because enriching relationships requires additional queries that aren't needed for counts.

### 10b. How the Datom Model Dissolves These Pain Points

**The fundamental shift: entity-centric access.**

In the datom model with EAVT index, "everything about entity X" is ONE lookup:

```
EAVT.get("fn:handleClick") →
  :node/kind        → "function"
  :node/name        → "handleClick"
  :node/file        → "src/app.ts"
  :node/line        → 42
  :node/is-async    → true
  :node/exported    → true
  :node/signature   → "(event: MouseEvent) => void"
  :edge/CALLS       → [{ target: "fn:stripeCharge", file: "src/app.ts", line: 45 }]
  :edge/CALLS       → [{ target: "fn:logEvent", file: "src/app.ts", line: 48 }]
  :edge/CONTAINS    → ["fn:innerHelper"]
  :effect/fn-call   → [{ target: "fn:stripeCharge", async: true, external: true, args: 2 }]
  :effect/send      → [{ target: "stripe.com", method: "POST", third_party: true }]
```

**ONE lookup. No JOINs. No enrichment. No N+1. No nodeMap building.**

Pain-by-pain comparison:

| Pain Point | Current (3 tables) | Datom Model |
|-----------|-------------------|-------------|
| Names not in edges | CTE + separate node query + Map building | EAVT: entity → all attributes including name AND edges |
| Effects need enrichment | effect-enricher.ts + NodeLookupMap | EAVT: entity → all attributes including effects AND name |
| Impact analysis 3-way | nodes → refs → nodes | VAET: target entity → all referencing entities |
| "Everything about X" | 5+ queries | EAVT.get(X) → complete picture |
| formatEdges everywhere | nodeMap after every edge query | Not needed — edges carry context in structured value |
| Summary/Details split | 3 code paths | One path, vary which attributes to include |

### 10c. The Four Indexes

The datom model needs four indexes (standard from Datomic/DataScript):

```
EAVT — Entity → Attribute → Value → Tx
  "Everything about entity X"
  "What is entity X's name?"
  PRIMARY index for entity-centric queries

AEVT — Attribute → Entity → Value → Tx
  "All functions" → :node/kind → entities where value = "function"
  "All exported symbols" → :node/exported → entities where value = true
  Replaces column indexes on nodes table

AVET — Attribute → Value → Entity → Tx
  "Find symbol named 'handleClick'" → :node/name → "handleClick" → entity
  "All entities in file X" → :node/file → "src/app.ts" → entities
  Replaces name-based search indexes
  Only built for searchable attributes (name, kind, file, qualified_name)

VAET — Value → Attribute → Entity → Tx
  "Who calls fn:stripeCharge?" → fn:stripeCharge → :edge/CALLS → [fn:handleClick, fn:checkout]
  "Who imports module:react?" → module:react → :edge/IMPORTS → [...]
  THE graph traversal index — replaces edge target_entity_id index
  Only built for ref-type attributes (edges, relationship datoms)
```

### 10d. Query Comparison — Concrete Examples

**Q: "What functions exist in auth.ts?"**

Current:
```sql
SELECT * FROM nodes WHERE file_path = 'src/auth.ts' AND kind = 'function'
```

Datom:
```
AVET.get(:node/file, "src/auth.ts") → [entity1, entity2, ...]
  filter: EAVT.get(entity, :node/kind) == "function"
```

Verdict: Similar. AVET index does the same work as a column index.

---

**Q: "What does handleClick call, and are those calls async?"**

Current (3 queries + code join):
```sql
-- Query 1: find the entity
SELECT entity_id FROM nodes WHERE name = 'handleClick'
-- Query 2: find outgoing CALLS edges
SELECT target_entity_id FROM edges WHERE source_entity_id = ? AND edge_type = 'CALLS'
-- Query 3: fetch target details + check effects for async
SELECT * FROM nodes WHERE entity_id IN (...)
SELECT * FROM effects WHERE source_entity_id = ? AND effect_type = 'FunctionCall'
-- Code: merge edge targets with effect metadata
```

Datom (1 lookup):
```
EAVT.get("fn:handleClick") →
  :effect/fn-call → [
    { target: "fn:stripeCharge", async: true, external: true },
    { target: "fn:logEvent", async: false, external: false }
  ]
```

Verdict: **Datom is dramatically simpler.** The behavioral observation IS an attribute of the entity. No JOIN needed.

---

**Q: "Who calls stripeCharge?" (reverse dependency)**

Current (2 queries + code join):
```sql
SELECT source_entity_id FROM edges WHERE target_entity_id = ? AND edge_type = 'CALLS'
SELECT * FROM nodes WHERE entity_id IN (...)  -- get names
```

Datom (1 lookup):
```
VAET.get("fn:stripeCharge", :edge/CALLS) → [fn:handleClick, fn:checkout, ...]
  then EAVT.get(each) → name, file, kind for each caller
```

Verdict: VAET replaces the reverse edge index. Still need EAVT for names, but it's an index lookup not a SQL query. Could also denormalize by storing caller name in the structured value.

---

**Q: "What external APIs does the auth module use?"**

Current (3+ queries):
```sql
-- Find all entities in auth module
SELECT entity_id FROM nodes WHERE file_path LIKE 'src/auth/%'
-- Find external effects for each
SELECT * FROM effects WHERE source_entity_id IN (...) AND is_external = true
-- Enrich with node metadata
SELECT * FROM nodes WHERE entity_id IN (...)
```

Datom (2 lookups):
```
AVET.get(:node/file, "src/auth/*") → [entity1, entity2, ...]
for each: EAVT.get(entity) → :effect/send, :effect/fn-call where external=true
```

Verdict: **Datom eliminates the enrichment step entirely.** Entity name + external calls are attributes of the same entity.

---

**Q: "Generate C4 diagram for this package"**

Current (`data-provider.ts:241+`):
```
1. Query Group effects for system/container/component boundaries
2. Query nodes for all functions/classes
3. Query edges for relationships
4. Query effects for external calls
5. enrichDomainEffects() to add names
6. Build C4 model from 5 separate data sources
```

Datom:
```
AEVT.get(:effect/group) → all entities with group effects
for each: EAVT.get(entity) → complete picture including:
  - group metadata (system/container/component)
  - relationships (edges)
  - behaviors (external calls, stores)
  - identity (name, kind, file)
All in one pass. No enrichment. No 5-query assembly.
```

Verdict: **Datom dramatically simplifies C4 generation.** The entity-centric model means every entity carries its full context.

### 10e. Performance Analysis

**Scale assumptions (large codebase like TypeScript compiler):**
- 250K entities (functions, classes, methods, variables, etc.)
- ~10 attributes per entity = 2.5M entity datoms
- 1M relationship datoms (structured-value, one per edge)
- 2M behavioral datoms (structured-value, one per effect)
- Total: ~5.5M datoms

**Memory for datoms:**
- Entity datoms (scalar values): ~100 bytes avg → 250MB
- Relationship datoms (structured value): ~200 bytes avg → 200MB
- Behavioral datoms (structured value): ~200 bytes avg → 400MB
- Total datom storage: **~850MB**

**Memory for indexes:**
- EAVT: 250K entity entries × pointer overhead → ~50MB
- AEVT: ~50 attribute entries × entity lists → ~50MB
- AVET: built for ~5 searchable attributes → ~30MB
- VAET: built for ref-type attributes → ~40MB
- Total index overhead: **~170MB**

**Grand total: ~1.02GB** for a 250K-entity codebase.

For typical codebases (50K entities): **~200MB**. Very comfortable.

**Comparison with current model:**
- DuckDB loads Parquet files into memory anyway for queries
- Current memory: nodes Parquet + edges Parquet + effects Parquet ≈ similar order of magnitude
- The datom model adds index overhead but eliminates the need for application-level Maps

**Mitigation for large codebases:**
- Lazy loading per package (only load active packages into EAVT)
- Tiered: hot (Map indexes for current package), warm (Parquet for other packages)
- Structured-value datoms reduce count (1 datom per edge instead of 5)

### 10f. What We'd Lose from DuckDB

DuckDB gives us things the datom model doesn't have natively:

| DuckDB Capability | Datom Model Equivalent | Status |
|-------------------|----------------------|--------|
| SQL queries | DatomQuery API (custom) | Must build |
| Columnar analytics (GROUP BY, COUNT, AVG) | Attribute-level aggregation | Must build |
| Parquet read/write | Custom serialization | Must build |
| Recursive CTEs for graph traversal | VAET recursive walk | Natural fit |
| Complex JOINs | Not needed (entity-centric) | Eliminated |
| Ad-hoc SQL via MCP `query_sql` | DatomQuery language | Must design |

**The biggest loss:** `query_sql` — the ability for users/LLMs to write arbitrary SQL. This is powerful for exploration. The datom model needs a query language.

**Options for query language:**
1. **Datalog** (like Datomic) — natural fit for datom stores, pattern matching
2. **Custom DatomQuery DSL** — TypeScript API, compilable to efficient index lookups
3. **SQL over datoms** — translate SQL to datom index operations (Option C from earlier)
4. **Keep DuckDB as a query engine** — load datoms into DuckDB for complex analytics, use datom indexes for entity-centric queries

Option 4 is interesting: datom store as source of truth, DuckDB as analytics layer. Best of both worlds.

### 10g. The Migration Path

DevAC doesn't need a big-bang rewrite. The path:

**Step 1: DatomStore interface** (no storage change)
```typescript
interface DatomStore {
  assert(entity: EntityId, attr: Attribute, value: Value): Tx
  retract(entity: EntityId, attr: Attribute, value: Value): Tx
  get(entity: EntityId): Map<Attribute, Value[]>            // EAVT
  find(attr: Attribute, value: Value): EntityId[]           // AVET
  reverseRefs(entity: EntityId, attr: Attribute): EntityId[] // VAET
  query(pattern: DatomPattern): DatomResult                 // Datalog-style
}
```

**Step 2: Implement over current storage** (wrap DuckDB)
- `assert()` → INSERT INTO nodes/edges/effects
- `get()` → SELECT * FROM nodes WHERE entity_id = ? UNION SELECT * FROM edges WHERE source/target = ? UNION SELECT * FROM effects WHERE source_entity_id = ?
- `find()` → SELECT from appropriate table based on attribute namespace

**Step 3: Migrate callers** (one at a time)
- Replace graph.ts queries with datomStore.get() + datomStore.reverseRefs()
- Replace effect-enricher.ts with datomStore.get() (enrichment is free)
- Replace data-provider.ts multi-query patterns with single datomStore.get()

**Step 4: Native datom storage** (when ready)
- Replace DuckDB backend with TypeScript Map-based indexes
- Keep DuckDB as optional analytics layer (load datoms into it for complex queries)
- Parquet becomes the cold/frozen tier (serialize datom store to Parquet for persistence)

**Step 5: D2TS integration** (end state)
- D2TS operators process datom streams incrementally
- DatomStore is fed by D2TS output
- MoQ publishes datoms directly from the store

---

## 11. V6 Naming Clarification

The analysis revealed V6 overloaded "effect" to mean both trigger and observation. This has been resolved:
- **Intent**: the `intent` parameter in `handler(state, intent)` — what causes state change (domain-specific namespace, e.g. `:file/changed`, `:sync/requested`)
- **Observation/Datom**: behavioral facts about code — what we observe about code behavior (`:effect/*` namespace)

This overloading caused the original "merge node and effect" question. If "effects" are just datoms, and "nodes" are just datoms, then of course they should merge — they're the same thing.

### V6 Clarification (RESOLVED)

**The duality is now named explicitly:**

```
Datom = universal fact, at rest in the store
  Entity datoms:      [:fn/abc, :node/kind, "function", tx, assert]
  Relationship datoms: [:fn/abc, :edge/CALLS, {target}, tx, assert]
  Behavioral datoms:   [:fn/abc, :effect/fn-call, {struct}, tx, assert]
  Workflow datoms:     [:seed/X, :workflow/updated, {stats}, tx, assert]

Intent = datom in motion, entering the creation loop
  Any datom can become an Intent when it triggers an effectHandler.
  :file/changed triggers Parser
  :seed/updated triggers Rules Engine, Validator
  A new behavioral datom entering the Rules Engine is an Intent for that handler.

effectHandler = processes Intents, produces Datoms (and possibly new Intents)
  handler(state: Datom[], intent: Intent) → { datoms: Datom[], intents: Intent[] }
```

**Key insight: the distinction is PHASE, not TYPE.**
- A datom at rest = a fact (queryable via Projection)
- A datom in motion = an Intent (entering an effectHandler)
- The SAME datom can be both, depending on context

**What changed (RESOLVED):**
- "Code Effects" → behavioral datoms (facts about what code does, `:effect/*` namespace)
- "Workflow Effects" → split: some are workflow datoms (facts), some are Intents (domain-specific namespace, e.g. `:file/changed`)
- The handler parameter renamed from `effect` to `intent`: `(state, intent) => (state', [intent'])`
- "effectHandler" name stays (it handles effects/side-effects, the parameter is what flows through it)
- Return type: `{ datoms, intents }` (outputs are new intents for other handlers)

**What stays the same:**
- Five concepts: Datom, Projection, Surface, Contract, effectHandler
- Creation loop: intent → Contract(effectHandler) → datoms
- Trust model, provenance, all Contract types

### The Cleaner Formula (RESOLVED — now canonical)

```
Canonical: (state, intent) => (state', [intent'])
Refined:   (datoms, intent) => (datoms', [intent'])
```

Where:
- `datoms` = current state (facts at rest)
- `intent` = what triggered this handler (fact in motion)
- `datoms'` = new facts produced (go to rest in the store)
- `intent'` = new triggers produced (go to downstream handlers)

This makes the pipeline crystal clear:
```
:file/changed
  → Parser (datoms, intent) → (entity datoms + behavioral datoms, [:seed/updated])
    → Rules Engine (datoms, intent) → (domain datoms, [])
    → Validator (datoms, intent) → (diagnostic datoms, [:validation/completed])
    → Index Materializer (datoms, intent) → (edge indexes, [])
```

Every handler: datoms in, datoms out. Intents trigger, intents cascade. One model.

---

## 12. Synthesis — The Clean End State

### What We Started With
"Should we merge node and effect?"

### What We Found
The question was wrong. Nodes, edges, and effects are all datoms — facts about code in different attribute namespaces. The real insight:

1. **The datom model makes code questioning dramatically easier** — entity-centric access eliminates N+1 queries, enrichment steps, and multi-table JOINs that plague the current implementation.

2. **The distinction is phase, not type** — a datom at rest is a fact (queryable). A datom in motion is an intent (triggers computation). Same data, different role.

3. **V6 should clarify the effect/intent duality** — "Code Effects" are behavioral datoms (facts). "Workflow triggers" are intents. The formula becomes `(datoms, intent) => (datoms', [intent'])`.

4. **The full datom model is the clean end state** — EAVT/AEVT/AVET/VAET indexes, ~1GB for 250K entities, entity-centric access. Can be reached incrementally via DatomStore interface over current DuckDB.

5. **DuckDB doesn't disappear** — it becomes the analytics layer (complex aggregation, ad-hoc SQL) over the datom store. Not the primary query path, but available when needed.

### The Architecture

```
Source Code → Parser (effectHandler) → Datoms (entity + relationship + behavioral)
                                          ↓
                                     DatomStore (EAVT/AEVT/AVET/VAET)
                                       ↓          ↓            ↓
                                    Projection  D2TS          MoQ
                                       ↓        (incremental)  (publish)
                                    Surface
                                       ↓
                                    User sees code understanding
```

### Files This Affects

| Current File | What Changes |
|-------------|-------------|
| `storage/parquet-schemas.ts` | Wrap with DatomStore interface, eventually replace |
| `queries/graph.ts` | Replace multi-query + nodeMap with datomStore.get() |
| `queries/symbol.ts` | Replace SQL with datomStore.find() |
| `views/effect-enricher.ts` | DELETE — enrichment is free with entity-centric access |
| `parsers/parser-interface.ts` | StructuralParseResult → DatomBatch (emit datoms, not typed structs) |
| `types/effects.ts` | Behavioral datom schemas (Zod schemas become datom attribute specs) |
| `rules/rule-engine.ts` | Already effectHandler pattern — just type to DatomStore |
| `devac-mcp/src/data-provider.ts` | Massively simplify — single datomStore.get() per entity |

---

## 13. The Query Engine — Three Approaches Compared

The datom model is only as good as how you query it. This is the make-or-break question.

### 13a. Approach 1: TypeScript DatomStore API (Programmatic)

The datom store exposes typed TypeScript functions. Direct Map lookups. Maximum performance.

```typescript
interface DatomStore {
  // Core EAVT
  get(entity: EntityId): EntityView                    // all attrs of entity
  getAttribute(entity: EntityId, attr: Attribute): Value[]  // single attr

  // AEVT — "find by attribute"
  findByAttribute(attr: Attribute, value?: Value): EntityId[]
  // :node/kind = "function" → all function entities

  // AVET — "search by value"
  findByValue(attr: Attribute, value: Value): EntityId[]
  // :node/name = "handleClick" → entity

  // VAET — "reverse references"
  reverseRefs(target: EntityId, attr?: Attribute): EntityId[]
  // who has :edge/CALLS pointing to fn:stripeCharge?

  // Convenience (built on core)
  callers(entity: EntityId): EntityView[]
  callees(entity: EntityId): EntityView[]
  exported(file: string): EntityView[]
  externalCalls(entity: EntityId): BehavioralDatom[]

  // Transitive traversal
  transitiveDeps(entity: EntityId, attr: Attribute, depth: number): EntityView[]
}

// EntityView = everything about an entity, pre-resolved
interface EntityView {
  entity: EntityId
  name: string
  kind: string
  file: string
  line: number
  attributes: Map<Attribute, Value[]>     // all :node/* attrs
  outgoing: Map<Attribute, StructuredValue[]>  // :edge/*, :effect/*
}
```

**Example: "What does handleClick call, and are those calls async?"**

Current (graph.ts:68-140 — 72 lines, 3 queries):
```typescript
// Query 1: SELECT * FROM edges WHERE source = ? AND type = 'CALLS'
// Query 2: SELECT * FROM nodes WHERE entity_id IN (...)
// Query 3: (effect-enricher if you want async info)
// Code: build nodeMap, merge, format
```

DatomStore (3 lines):
```typescript
const view = store.get("fn:handleClick")
const calls = view.outgoing.get(":effect/fn-call") // [{target, async, external, args}]
return calls.map(c => ({ target: store.get(c.target).name, async: c.async }))
```

**The LLM query generation angle** — this is your key insight:

Instead of a query language, the LLM writes TypeScript against the DatomStore API:

```typescript
// User asks: "What external APIs does the auth module use?"
// LLM generates:
const authEntities = store.findByAttribute(":node/file", "src/auth/**")
const apis = authEntities
  .flatMap(id => store.getAttribute(id, ":effect/send") ?? [])
  .filter(s => s.third_party)
  .map(s => ({ service: s.target, method: s.method }))
```

Why this is powerful:
- **LLM already knows TypeScript** — no Datalog learning curve
- **Type-safe** — IDE catches errors, no runtime query syntax mistakes
- **Testable** — standard unit tests on generated query code
- **Composable** — chain .map/.filter/.flatMap naturally
- **Debuggable** — step through in a debugger, unlike opaque query engines
- **Evolvable** — LLM can observe which queries work well and propose new convenience methods

**Pros:**
- Maximum performance (direct Map O(1) lookups)
- TypeScript-native, type-safe, IDE autocomplete
- LLM generates fluent query code
- Convenience functions eliminate boilerplate for common patterns
- EntityView = entity-centric access (ONE lookup for everything)

**Cons:**
- Not declarative (imperative code describes HOW, not WHAT)
- Complex ad-hoc queries need code, not just a query string
- No built-in query optimization (developer must choose right index)

### 13b. Approach 2: DuckDB as Analytics Layer (SQL)

Keep DuckDB, but as a SECONDARY query engine over the datom store. The datom store materializes SQL-friendly views:

```sql
-- Materialized view: reconstruct "nodes" table from entity datoms
CREATE VIEW v_nodes AS
SELECT entity, attributes->':node/name' as name,
       attributes->':node/kind' as kind,
       attributes->':node/file' as file_path,
       attributes->':node/exported' as is_exported
FROM datom_entities
WHERE has_namespace(entity, ':node/');

-- Materialized view: reconstruct "edges" table from relationship datoms
CREATE VIEW v_edges AS
SELECT entity as source_entity_id,
       attr as edge_type,
       value->>'target' as target_entity_id,
       value->>'file' as source_file_path
FROM datom_relationships;
```

**Why this matters:** The `query_sql` MCP tool is one of DevAC's most powerful features. It lets LLMs write arbitrary SQL to explore code. We can't lose this.

**But:** DuckDB doesn't need to be the PRIMARY store. It's the analytics layer:

```
DatomStore (Map indexes) ──── primary for entity-centric queries
     │
     └──► DuckDB (materialized views) ──── secondary for analytics/SQL
           - GROUP BY, COUNT, aggregation
           - Complex JOINs when needed
           - query_sql MCP tool
           - Ad-hoc exploration
```

The materialization can be lazy — build DuckDB views when SQL queries arrive, not eagerly.

**Pros:**
- `query_sql` preserved — LLMs can still write SQL
- Familiar for developers
- DuckDB's optimizer handles complex analytics
- Columnar aggregation (GROUP BY kind, COUNT by file, etc.)

**Cons:**
- Two copies of data (Map indexes + DuckDB memory)
- Materialization latency (datom changes must propagate to views)
- EAV-in-SQL is painful for entity-centric queries (self-JOINs)
- Not the right tool for entity-centric access (that's what DatomStore is for)

### 13c. Approach 3: Datalog (Declarative Pattern Matching)

Datalog is THE query language designed for datom stores (Datomic, DataScript, Logica).

```
;; "What functions call external APIs?"
[:find ?name ?api
 :where
 [?e :node/kind "function"]
 [?e :node/name ?name]
 [?e :effect/send ?call]
 [(get ?call :third_party) true]
 [(get ?call :target) ?api]]

;; "Transitive dependencies of handleClick (depth 3)"
[:find ?dep-name ?depth
 :in $ ?root
 :where
 (transitive-calls ?root ?dep ?depth 3)
 [?dep :node/name ?dep-name]]
```

**D2TS connection:** D2TS is a differential dataflow engine. Differential dataflow CAN evaluate Datalog queries as incremental arrangements + joins. So D2TS could be the Datalog execution engine:

```typescript
// Datalog query compiled to D2TS pipeline:
const result = d2ts.query(
  d2ts.join(
    eavt.filter(a => a === ":node/kind"),
    eavt.filter(a => a === ":effect/fn-call"),
    (left, right) => left.entity === right.entity
  )
)
// Result updates INCREMENTALLY when datoms change
```

This means: live Datalog queries. A Projection over code graph that updates in real-time as code changes. The C4 diagram query is a Datalog query that D2TS evaluates incrementally.

**Pros:**
- Designed for datom stores (EAV pattern matching is native)
- Declarative (describe WHAT, not HOW)
- Recursive queries natural (transitive closure built-in)
- D2TS can execute Datalog incrementally (live queries!)
- Rich prior art (Datomic, DataScript)

**Cons:**
- Unfamiliar syntax (most developers don't know Datalog)
- LLMs generate Datalog less reliably than TypeScript or SQL
- Implementation overhead (need parser + planner + executor)
- Structured-value datoms need extensions (`get` function for nested fields)

### 13d. The Answer: Layered Query Architecture

**All three approaches serve different users and use cases. Layer them:**

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: DuckDB SQL                                     │
│  For: ad-hoc analytics, query_sql MCP tool, aggregation │
│  When: complex GROUP BY, COUNT, window functions         │
│  How: materialized views over datom store                │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Datalog / D2TS                                 │
│  For: live Projections, pattern matching, recursion      │
│  When: C4 diagrams, live dashboards, incremental queries│
│  How: D2TS arrangements over datom indexes              │
├─────────────────────────────────────────────────────────┤
│  Layer 1: TypeScript DatomStore API                      │
│  For: all internal code, MCP tools, LLM-generated queries│
│  When: entity-centric access, known query patterns      │
│  How: direct Map index lookups (EAVT/AEVT/AVET/VAET)   │
└─────────────────────────────────────────────────────────┘
                          │
                    DatomStore (Map indexes)
                    Source of truth
```

**Who uses what:**

| User | Layer | Why |
|------|-------|-----|
| DevAC internal code (graph.ts, symbol.ts) | Layer 1 | Type-safe, fast, entity-centric |
| MCP tools (query_symbol, query_deps) | Layer 1 | Direct index lookups replace N+1 SQL |
| MCP tool: query_sql | Layer 3 | Backward compatible, ad-hoc analytics |
| LLM generating queries | Layer 1 | TypeScript code generation is reliable |
| Live C4 diagram Surface | Layer 2 | Incremental updates via D2TS |
| Live diagnostics dashboard | Layer 2 | Reactive Projection via D2TS |
| One-off analytics ("count functions by package") | Layer 3 | DuckDB excels at aggregation |

**Build order:**

1. **Layer 1 first** — this is the primary query path. Replaces all current N+1 patterns. Makes effect-enricher.ts deletable. EntityView gives entity-centric access.

2. **Layer 3 second** — wrap existing DuckDB, expose materialized views over datom store. query_sql keeps working. Familiar SQL for ad-hoc exploration.

3. **Layer 2 last** — D2TS integration for live queries. This is the vivief platform end state (Projections with `delivery: "live"`). Not needed for DevAC's current batch analysis, but essential for vivief-app Surfaces.

### 13e. Concrete: How graphDeps Transforms

**Current code** (`graph.ts:68-140` — 72 lines):
```typescript
// 1. Build SQL WHERE clause
// 2. Execute edge query (SQL)
// 3. Execute node query for target names (SQL)
// 4. Build nodeMap manually
// 5. Format edges with node names
// 6. Handle counts/summary/details separately
```

**With DatomStore** (~15 lines):
```typescript
export async function graphDeps(store: DatomStore, params: GraphDepsParams) {
  const { entity, edgeType, depth, level, limit } = params

  if (depth === 1) {
    // ONE lookup — entity-centric access
    const view = store.get(entity)
    let edges = [...(view.outgoing.entries())]
      .filter(([attr]) => attr.startsWith(":edge/"))
      .filter(([attr]) => !edgeType || attr === `:edge/${edgeType}`)
      .flatMap(([attr, values]) => values.map(v => ({ type: attr, ...v })))
      .slice(0, limit)

    // Names are FREE — resolve target in one more lookup
    return edges.map(e => ({
      source: view.name,
      target: store.get(e.target).name,
      type: e.type,
      file: e.file,
      line: e.line
    }))
  }

  // Recursive: walk VAET/EAVT indexes directly
  return store.transitiveDeps(entity, edgeType ? `:edge/${edgeType}` : ":edge/*", depth)
    .slice(0, limit)
    .map(dep => ({ name: dep.name, kind: dep.kind, file: dep.file, depth: dep.depth }))
}
```

**What's eliminated:**
- SQL string building
- N+1 node lookup queries
- nodeMap construction
- formatEdges() helper
- counts/summary/details code paths (EntityView has everything, format at the Surface level)

### 13f. Concrete: How effect-enricher Transforms

**Current** (`effect-enricher.ts` — entire file):
```typescript
// Pre-build NodeLookupMap from separate query
// For each effect: lookup source entity → get name, kind
// Handle missing metadata with ugly fallbacks
// Return enriched effects with readable names
```

**With DatomStore:**
```typescript
// DELETE THIS FILE — enrichment is free

// When you need effect context:
const view = store.get(effectSourceEntity)
// view.name, view.kind, view.attributes, view.outgoing — all there
// No lookup map. No separate query. No fallbacks.
```

The entire effect-enricher.ts file becomes unnecessary. Entity-centric access means every entity carries its own context.

---

## 14. Final Synthesis

### The Journey

Started with: "Should we merge node and effect?"

Arrived at: **The datom model makes code questioning dramatically easier, and the right query architecture is a layered stack: TypeScript API (primary) + D2TS/Datalog (live) + DuckDB SQL (analytics).**

### The Core Insights

1. **Nodes, edges, effects are all datoms** — attribute namespaces (`:node/*`, `:edge/*`, `:effect/*`), not separate concepts. The merge question was wrong.

2. **The distinction is phase, not type** — datom at rest = fact. Datom in motion = intent. Same data, different role.

3. **Entity-centric access eliminates the N+1 problem** — EAVT index gives everything about an entity in ONE lookup. No JOINs, no enrichment, no nodeMap building.

4. **V6 should clarify intent vs observation** — "Code Effects" are behavioral datoms (facts). True effects are intents (triggers entering the creation loop).

5. **The query engine is layered** — TypeScript API for internal code + LLM queries. DuckDB SQL for analytics. D2TS/Datalog for live projections.

6. **LLM writes TypeScript, not query language** — the DatomStore API IS the query interface. LLM generates type-safe TypeScript code against it.

### The Architecture

```
Parser (effectHandler)
  → Datoms (entity + relationship + behavioral)
    → DatomStore (EAVT/AEVT/AVET/VAET Map indexes)
      → TypeScript API (entity-centric queries — primary)
      → DuckDB views (SQL analytics — secondary)
      → D2TS arrangements (live queries — future)
    → MoQ tracks (P2P publishing — datoms native)
```

### Files Affected

| File | Impact |
|------|--------|
| NEW: `datom-store.ts` | Core DatomStore with Map indexes |
| NEW: `datom-query.ts` | TypeScript query API + EntityView |
| SIMPLIFY: `queries/graph.ts` | 72 lines → ~15 lines |
| SIMPLIFY: `queries/symbol.ts` | SQL → DatomStore.find() |
| DELETE: `views/effect-enricher.ts` | Enrichment is free |
| SIMPLIFY: `devac-mcp/data-provider.ts` | Multi-query → single store.get() |
| WRAP: `storage/parquet-schemas.ts` | DatomStore over existing DuckDB (migration step) |
| EVOLVE: `parsers/parser-interface.ts` | Eventually: emit datoms, not typed structs |

### Migration Path

1. **DatomStore interface** — define the API
2. **Implement over DuckDB** — wrap current storage (no data migration)
3. **Port queries one by one** — graph.ts, symbol.ts, data-provider.ts
4. **Delete effect-enricher** — verify enrichment is free
5. **Benchmark** — 50K and 250K entities, memory + latency
6. **Native Map indexes** — replace DuckDB backend if benchmarks pass
7. **DuckDB as analytics layer** — materialized views for query_sql
8. **D2TS integration** — live queries for vivief platform

### Verification Plan

1. **Prototype DatomStore** with Map-based EAVT/AEVT indexes
2. **Port graphDeps** — compare code complexity and performance vs current
3. **Port effect-enricher usage** — verify it becomes trivial (should be deletable)
4. **Port symbolFind** — compare query performance
5. **Benchmark** at 50K and 250K entities — measure memory and query latency
6. **Test LLM query generation** — can Claude generate correct TypeScript against DatomStore API?
7. **If benchmarks pass**: proceed with full migration
8. **If benchmarks fail**: keep DatomStore API, implement over DuckDB (Option C fallback)
