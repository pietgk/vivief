# Brainstorm: Virtual Projections, Query Templates & Spike Definition

**Status:** Brainstorm
**Date:** 2026-03-28
**Sources:** [vivief-datom-model-query-architecture](vivief-datom-model-query-architecture.md), [vivief-concepts-vision](../vivief-concepts-vision.md)

**Starting question:** How do we prove the datom model works — and how far can we push it as a universal query substrate?

**Where it went:** Virtual database projections from datom indexes, a query template system where big models create and small models execute, and a concrete spike definition to validate the architecture.

---

## 1. Starting Point — What the Prior Brainstorm Established

The [datom model brainstorm](vivief-datom-model-query-architecture.md) arrived at:

1. **Nodes, edges, effects are all datoms** — attribute namespaces (`:node/*`, `:edge/*`, `:effect/*`), not separate concepts
2. **Phase distinction, not type distinction** — datom at rest = fact, datom in motion = intent
3. **Entity-centric access via EAVT/AEVT/AVET/VAET indexes** — eliminates N+1 queries
4. **Layered query architecture** — TypeScript API (primary) + D2TS/Datalog (live) + DuckDB SQL (analytics)
5. **Full datom model as end state**, reachable incrementally from current DuckDB storage

This brainstorm extends those findings with virtual projections, query templates, tiered storage, and a spike to prove it all works.

---

## 2. Refined effectHandler Signature

The [vivief-concepts-vision](../vivief-concepts-vision.md) currently defines:

```
effectHandler = (state, intent) => (state', [intent'])
```

The prior brainstorm (Section 11) identified that V6 overloads "effect" to mean both trigger/intent and behavioral observation/datom. The clean model separates these:

```
effectHandler = (Datoms, Intent) => (Datoms', [Intent]')
```

Where:
- `Datoms` = current state (facts at rest in the store)
- `Intent` = what triggered this handler (fact in motion)
- `Datoms'` = new facts produced (go to rest in the store)
- `[Intent]'` = new triggers produced (cascade to downstream handlers)

**The concept name stays "effectHandler."** The name is well-established across all docs and describes what it is. The signature clarification is the real insight — the name is secondary.

**Rationale:** The distinction is PHASE, not TYPE. A datom at rest is a fact (queryable via Projection). A datom in motion is an Intent (entering an effectHandler). The SAME datom can be both, depending on context.

### Datom Naming Convention (from CQRS-ES)

**All datoms use past-tense or noun naming. Never imperative.** Datoms are immutable facts. An imperative ("change this file") is not a fact — it's a contradiction.

From CQRS-ES: commands are imperative (what you WANT), events are past-tense (what HAS happened). In our model, intents are always facts (events), because they're datoms. Even action requests are facts: "it is true that promotion was requested."

| Scenario | Naming | Example |
|----------|--------|---------|
| Something happened externally | Past tense | `:file/changed` |
| Pipeline stage completed | Past tense | `:seed/updated`, `:validation/completed` |
| Someone requests an action | Past tense of request | `:sandbox/promotion-requested`, `:tokenization/requested` |
| Action succeeded | Past tense | `:sandbox/promoted` |
| Action failed | Past tense | `:sandbox/promotion-rejected` |

**There is no `:intent/*` namespace.** Intent is a phase (datom in motion), not a type. Any datom can become an intent when it enters an effectHandler. The effectHandler declares which attributes it reacts to via its Behavior Contract:

```typescript
// Behavior Contract
accepts: [":file/changed", ":seed/updated", ":tokenization/requested"]
```

### Pipeline Example

```
:file/changed  (fact: file was modified on disk)
  -> Parser reacts to :file/changed
     -> (entity datoms + behavioral datoms, [:seed/updated])
       -> Rules Engine reacts to :seed/updated -> (domain datoms, [])
       -> Validator reacts to :seed/updated -> (diagnostic datoms, [:validation/completed])
       -> Index Materializer reacts to :seed/updated -> (edge indexes, [])
```

Every handler: datoms in, datoms out. Facts trigger, facts cascade. One model.

**Note:** vivief-concepts-vision.md will be updated with this refined signature AFTER the spike validates the architecture. This remains a brainstorm finding until then.

---

## 3. Virtual Projections — 2D Model

### The Insight

The prior brainstorm defined a "layered query architecture" organized by technology (TypeScript API, D2TS, DuckDB). But there's an orthogonal dimension: **what shape the data takes when projected.**

From the four datom indexes (EAVT, AEVT, AVET, VAET), datoms can be projected as:

| Projection Shape | What It Sees | Natural For |
|-----------------|-------------|-------------|
| **Time-series** | Datoms are already time-ordered (Tx) | Progress tracking, history, trends |
| **Graph** | Nodes + Edges + Effects via entity refs | Dependency analysis, call chains, impact |
| **Relational** | Entities as rows, attributes as columns | Tabular queries, filtering, joining |
| **Columnar** | Attributes across many entities | Aggregation, GROUP BY, analytics |
| **Document** | Entity with all attributes as nested structure | Full entity context, LLM answers |
| **Vector** | Token embeddings from `:token/*` datoms | Similarity search, semantic queries |
| **FTS** | Text attributes indexed for search | Name search, content search |

These aren't separate databases. They're virtual projections — different ways of reading the same underlying datom indexes.

### The 2D Matrix: Shape x Engine

The projection shape determines WHAT you're asking. The query engine determines HOW it's executed. Not every combination makes sense — the matrix shows which cells are implemented:

```
              | TS API  | D2TS   | DuckDB |
--------------+---------+--------+--------+
Graph         |    Y    |   Y    |        |
Relational    |    Y    |        |   Y    |
Columnar      |         |        |   Y    |
Document      |    Y    |        |        |
Vector        |         |        |   Y    |
Time-series   |    Y    |   Y    |   Y    |
FTS           |    Y    |        |   Y    |
```

**Three engines, not four.** DuckDB covers columnar + relational + vector (via `vss` extension) + FTS + time-series analytics. The TS API handles entity-centric graph/document/FTS/time-series. D2TS handles live incremental graph and time-series.

### Who Uses What

| User | Shape | Engine | Why |
|------|-------|--------|-----|
| DevAC internal code (graph.ts, symbol.ts) | Graph, Document | TS API | Type-safe, fast, entity-centric |
| MCP tools (query_symbol, query_deps) | Graph, Document | TS API | Direct index lookups replace N+1 SQL |
| MCP tool: query_sql | Relational, Columnar | DuckDB | Backward compatible, ad-hoc analytics |
| LLM generating queries | Graph, Document | TS API | TypeScript code generation is reliable |
| "Count functions by package" | Columnar | DuckDB | Aggregation is DuckDB's strength |
| "Find code similar to X" | Vector | DuckDB (vss) | Semantic search over token datoms |
| Live C4 diagram | Graph | D2TS | Incremental updates as code changes |
| Live diagnostics dashboard | Time-series | D2TS | Reactive Projection |

---

## 4. Three-Tier Storage

### The Tiers

| Tier | What Lives Here | Storage | Access | Eviction |
|------|----------------|---------|--------|----------|
| **Hot** | Active working set — entities in open files, recent queries, token cache | TypeScript Maps (EAVT/AEVT/AVET/VAET) | Sub-ms, direct lookup | LRU per entity |
| **Warm** | Full package datoms — loaded on demand per package | TypeScript Maps, evictable | Ms, lazy-loaded | Per-package, demand-driven |
| **Frozen** | Historical datoms, other packages, embeddings | WAL + Parquet files, indexed | 10ms+, disk read | None (persistent) |

### D2TS Bridges Tiers

D2TS sits between tiers. It maintains live filtered projections from colder tiers into the hot tier. When a Projection subscribes to a subset of warm/frozen datoms, D2TS materializes just that subset into hot. This is how live queries work without loading everything into memory.

### Memory Optimization Strategy

Rather than setting arbitrary memory targets, apply known optimization techniques aggressively and benchmark to see where we land:

- **Interned strings** — attribute names and common values repeat millions of times across datoms. A string intern pool replaces string allocations with integer IDs. Attributes like `:node/kind`, `:node/name`, `:edge/CALLS` become 4-byte IDs instead of 10-20 byte strings.

- **ArrayBuffer-backed sorted arrays** — if Map per-entry overhead (~100-150 bytes) is too high, sorted typed arrays with binary search provide the same O(log n) lookup with ~10x less memory overhead.

- **Structured-value datoms** — the prior brainstorm's recommendation: one datom per edge with a structured value `{ target, file, line }` instead of 3-5 scalar datoms. Reduces datom count significantly.

- **Structural sharing** — for the append-only datom log, persistent data structures (HAMT) reduce copy cost on updates.

The spike benchmarks naive Maps first. If they're adequate, keep them (simplest implementation wins). If not, the optimization techniques above are well-understood and can be applied incrementally. The point is to measure, not guess.

---

## 5. Query Template System

### The Problem

LLMs can generate queries against the DatomStore API. But each generation costs tokens and latency. Many questions are variations of the same pattern: "how does X work" and "how does Y work" are the same query with different parameters.

### The Solution: Parameterized Query Templates

A query template is a parameterized TypeScript function that encodes a query pattern:

```typescript
// Template: howDoesXWork
// Intent pattern: "how does {concept} work", "explain {concept}", "what does {concept} do"
// Parameters: concept: string
// Engine: Graph + TS API

function howDoesXWork(store: DatomStore, concept: string): AnswerDatoms {
  const entities = store.findByValue(":node/name", concept)
  const views = entities.map(id => store.get(id))
  // trace calls, dependencies, structure
  // produce answer datoms
}
```

### The Flow

1. **User asks** "how does invoice work"
2. **Small model (router)** recognizes intent matches template `howDoesXWork`, extracts parameter `concept = "invoice"`
3. **Execute deterministically** — call `howDoesXWork(store, "invoice")`, no LLM needed
4. **Answer datoms** produced, Surface renders them

When no template matches:

1. **User asks** a genuinely novel question
2. **Big model** generates a new TypeScript function against DatomStore API
3. **If it works** — extract as parameterized template, add to library
4. **Small model** can now route future similar questions to this template

### Templates ARE effectHandlers

A template is an effectHandler: `(Datoms, Intent) => (Datoms', [Intent]')` where:
- `Datoms` = the datom store state
- `Intent` = the user's question (with extracted parameters)
- `Datoms'` = the answer datoms
- `[Intent]'` = possible follow-up intents (e.g., "show me the code" after blast radius analysis)

This is the same creation loop from vivief-concepts-vision.md. The template system is just the creation cache applied to query effectHandlers. Content-addressable creation, but at the template level (signature + parameters) not the literal query level.

### Templates as Artifacts with Bridge

Templates follow the artifact + bridge pattern from the vision doc:

```
template.ts (native medium) <-> Bridge <-> Datoms (intent pattern, params, provenance, usage stats)
```

The template IS a TypeScript file — testable, version-controlled, debuggable. The datom store holds metadata ABOUT the template:

```
[:template/howDoesXWork, :template/intent-pattern, "how does {concept} work", tx:1, assert]
[:template/howDoesXWork, :template/parameters,     [{name: "concept", type: "string"}], tx:1, assert]
[:template/howDoesXWork, :template/engine,          "ts-api", tx:1, assert]
[:template/howDoesXWork, :template/projection,      "graph+document", tx:1, assert]
[:template/howDoesXWork, :template/created-by,      "claude-opus-4", tx:1, assert]
[:template/howDoesXWork, :template/usage-count,     47, tx:42, assert]
```

The small model routes by querying `:template/intent-pattern` datoms.

### Knowledge Evolution Path

This connects to the knowledge evolution path from the v6 decisions:

```
ad-hoc LLM query -> cached template -> named effectHandler -> platform capability
     (tacit)      (knowledge file)    (proto-Contract)       (infrastructure)
```

Over time, the template library grows. The ratio of "small model handles it" to "big model needed" improves. The economic model: front-load big model investment, amortize over many cheap small model executions.

---

## 6. Token Datoms

Token datoms support Vector and FTS virtual projections. They live in the datom store with a `:token/*` attribute namespace:

```
[:fn/handleClick, :token/embedding,  Float32Array([0.12, 0.34, ...]), tx:5, assert]
[:fn/handleClick, :token/model,      "text-embedding-3-small",        tx:5, assert]
[:fn/handleClick, :token/source-hash, "sha256:abc...",                tx:5, assert]
```

**Why datoms, not a separate vector store:**
- Participate in the same Projection/Contract model
- Have provenance (which tokenizer, which model, when)
- Invalidate naturally via creation cache — when `:token/source-hash` no longer matches the source entity's content hash, the embedding is stale and re-creation triggers
- Queryable alongside code/domain datoms (find functions semantically similar to X AND called by Y)

**Storage tier:** Token datoms are large (embedding vectors). They live in the Frozen tier by default. Vector search loads them into DuckDB `vss` extension on demand. Hot/Warm tiers don't carry embedding data unless actively queried.

**Tokenizers and parsers:** Different content types need different tokenization:
- Code: AST-aware tokenizers that understand function boundaries
- Clinical notes: Domain-specific tokenizers for therapeutic concepts
- Natural language: General-purpose text embeddings

The tokenizer IS an effectHandler: `(Datoms [source content], :tokenization/requested) => (Datoms' [token datoms], [])`.

**Status:** Design only. Not included in the spike. The architecture supports it; implementation is deferred until graph/document projections are proven.

---

## 7. Counselor Domain Paper Exercise

**Purpose:** Verify the architecture is universal — same DatomStore API, same template shape, different attribute namespace.

### The Question

"Summarize themes across client X's last 5 sessions."

### Datom Schema (`:session/*` namespace)

```
[:session/42,  :session/client,     :client/X,           tx:100, assert]
[:session/42,  :session/date,       "2026-03-15",        tx:100, assert]
[:session/42,  :session/themes,     ["anxiety", "work"],  tx:101, assert]
[:session/42,  :session/notes,      "Client discussed...", tx:101, assert]
[:session/42,  :session/risk-level, "low",                tx:101, assert]

[:client/X,    :client/name,        "Jane Doe",          tx:50,  assert]
[:client/X,    :client/counselor,   :counselor/Y,        tx:50,  assert]
```

### Query Template

```typescript
// Template: summarizeClientThemes
// Intent pattern: "summarize themes for {client}", "how is {client} progressing"
// Parameters: client: string, sessionCount: number (default 5)
// Engine: Graph + Time-series + TS API

function summarizeClientThemes(store: DatomStore, client: string, sessionCount = 5): AnswerDatoms {
  const clientEntity = store.findByValue(":client/name", client)[0]
  const sessions = store.reverseRefs(clientEntity, ":session/client")
    .map(id => store.get(id))
    .sort((a, b) => b.attributes.get(":session/date") - a.attributes.get(":session/date"))
    .slice(0, sessionCount)

  const themes = sessions.flatMap(s => s.attributes.get(":session/themes") ?? [])
  const themeCounts = countBy(themes)
  // produce answer datoms with theme summary, trend, risk trajectory
}
```

### Verification

| Aspect | Code Domain (blast radius) | Counselor Domain (theme summary) |
|--------|---------------------------|----------------------------------|
| DatomStore API | `store.get()`, `store.findByValue()`, `store.reverseRefs()` | Same API, same methods |
| Template shape | Parameterized TS function, effectHandler signature | Identical shape |
| Projection shapes used | Graph, Document | Graph, Time-series, Document |
| Attribute namespace | `:node/*`, `:edge/*`, `:effect/*` | `:session/*`, `:client/*` |
| Entity-centric access | Everything about a function in one lookup | Everything about a session in one lookup |

**Result:** The architecture holds. Same machinery, different namespaces. No new concepts needed for counseling. The DatomStore API is domain-agnostic.

---

## 8. Deferred Items

| Item | Why Deferred | When to Revisit |
|------|-------------|-----------------|
| **Datalog** | Value is with D2TS for live incremental queries. Without D2TS, it's just another syntax LLMs generate less reliably than TypeScript. | When D2TS integration begins |
| **D2TS tier bridging** | Important for live queries but not existential risk. Known technology. | After spike validates datom store fundamentals |
| **Vector/FTS** | Designed (Section 6) but not needed for blast-radius showcase. | After graph/document projections proven |
| **P2P** | DatomStore's append-only nature aligns with operation-based CRDT for sync. Compatible, not coupled. | P2P implementation phase |
| **Surface rendering** | Existing Surface concept from vision doc is sufficient. Spike produces answer datoms; Surface rendering is future. | App/UI implementation phase |
| **Memory tiering (Hot/Warm/Frozen)** | Engineering problem with known solutions. Spike uses single-tier (all in memory) for simplicity. | When scaling to large codebases |
| **Virtual projection breadth** | Only Graph + Document needed for spike. Other shapes (Columnar, Relational, etc.) are additive. | After core projections work |

---

## 9. Spike Definition

### Goal

Prove four claims that are existential risks for the architecture. If any fail, the design needs rethinking.

### Claims to Prove

| # | Claim | Risk if Wrong |
|---|-------|---------------|
| 1 | Datom model with 4 indexes is fast enough in-memory | Whole architecture collapses |
| 2 | Entity-centric access actually eliminates N+1 pain | Trading one complexity for another |
| 4 | LLM can reliably generate TypeScript against DatomStore API | Query enablement fails |
| 5 | Big model -> template -> small model routing works | Economic model fails |

### Showcase Question

**"What is the blast radius if I change function X?"**

This exercises:
- **Graph projection** — who calls X, transitively
- **Document projection** — human-readable answer with context
- **DatomStore API** — TypeScript query, entity-centric access
- **N+1 elimination** — each entity in the chain needs name + calls + effects + files (exactly the pain the datom model solves)

### Spike Deliverables

#### 1. DatomStore with EAVT/AEVT/AVET/VAET Indexes

```typescript
interface DatomStore {
  // Core EAVT — "everything about entity X"
  get(entity: EntityId): EntityView
  getAttribute(entity: EntityId, attr: Attribute): Value[]

  // AEVT — "find by attribute"
  findByAttribute(attr: Attribute, value?: Value): EntityId[]

  // AVET — "search by value"
  findByValue(attr: Attribute, value: Value): EntityId[]

  // VAET — "reverse references"
  reverseRefs(target: EntityId, attr?: Attribute): EntityId[]

  // Convenience
  callers(entity: EntityId): EntityView[]
  callees(entity: EntityId): EntityView[]

  // Transitive traversal
  transitiveDeps(entity: EntityId, attr: Attribute, depth: number): EntityView[]
}
```

Start with naive TypeScript Maps. Apply memory optimizations (interned strings, ArrayBuffer-backed arrays) if benchmarks show they're needed.

#### 2. Loader from Existing DevAC Data

Populate DatomStore from current Parquet/DuckDB data. Translate:
- Nodes -> entity datoms (`:node/*` namespace)
- Edges -> relationship datoms (`:edge/*` namespace, structured values)
- Effects -> behavioral datoms (`:effect/*` namespace, structured values)

This proves the datom model can represent everything DevAC currently stores.

#### 3. Ported graphDeps

Rewrite `graphDeps` (currently `graph.ts:68-140`, 72 lines, 3+ SQL queries) using DatomStore.

**Compare:**
- Lines of code (target: ~15 vs ~72)
- Number of queries/lookups (target: 1-2 vs 3-5)
- Latency at 50K entities
- Correctness (same results)

#### 4. LLM Query Generation Test

Present the DatomStore API to Claude and ask 10 diverse questions:

1. "What functions exist in auth.ts?"
2. "What does handleClick call, and are those calls async?"
3. "Who calls stripeCharge?"
4. "What external APIs does the auth module use?"
5. "What is the blast radius if I change function X?"
6. "Find all exported async functions without error handling"
7. "What's the most called function in this codebase?"
8. "Show me the dependency chain from App.tsx to the database"
9. "Which files would break if I rename UserService?"
10. "What code effects does the payment module produce?"

**Evaluate:**
- Does the generated TypeScript compile against the DatomStore interface?
- Does it produce correct results?
- How much guidance does the LLM need (zero-shot vs few-shot)?

#### 5. Template Extraction Test

From the 10 queries above:
- Big model (Opus) generates templates — parameterized functions with intent patterns
- Identify which questions share templates (e.g., Q1/Q6 are "find entities matching criteria", Q2/Q3/Q5 are "trace relationships from X")
- Test small model (Haiku) routing: given a new question, can it match to existing template and extract parameters?

**Evaluate:**
- How many distinct templates cover the 10 questions? (expect 4-6)
- Does Haiku reliably route to correct template?
- Does parameter extraction work for variations? ("how does invoice work" -> `howDoesXWork("invoice")`)

#### 6. Memory Benchmark

Load real DevAC data (vivief repo, ~5K entities as baseline; if possible, a larger codebase ~50K entities) into the DatomStore.

**Measure:**
- Total memory with all 4 indexes
- Memory per entity (to extrapolate to 250K)
- Index build time
- Single entity lookup latency (EAVT)
- Attribute search latency (AVET)
- Reverse ref lookup latency (VAET)

#### 7. Counselor Paper Design

Already completed in Section 7 above. Validate that the same DatomStore API works for `:session/*` datoms without modification.

### Spike Success Criteria

| Claim | Pass | Fail |
|-------|------|------|
| 1. Performance | Sub-ms entity lookup, <5s index build for 50K entities | >10ms lookup or >30s build |
| 2. N+1 elimination | graphDeps is simpler AND same/faster performance | More complex or significantly slower |
| 4. LLM query generation | 8/10 questions produce correct TypeScript (zero or one-shot) | <6/10 correct |
| 5. Template routing | Haiku correctly routes 8/10 variations to existing templates | <6/10 correct |

### What the Spike Does NOT Prove

- Virtual projection breadth (only Graph + Document exercised)
- D2TS live queries
- Vector/FTS search
- P2P sync compatibility
- Memory tiering (all in memory for spike)
- Surface rendering
- Production-grade storage (WAL, persistence, crash recovery)

These are all engineering problems with known solutions. The spike proves the conceptual architecture; the engineering follows.

---

## 10. Synthesis

### The Journey

Started with: "How do we prove the datom model works, and how far can we push it?"

Arrived at: **Datoms are a universal query substrate. Virtual projections give you 7 database paradigms from 4 indexes. Query templates let big models create and small models execute. A focused spike on 4 existential claims validates the whole architecture.**

### Core Insights

1. **effectHandler signature clarified**: `(Datoms, Intent) => (Datoms', [Intent]')` — same concept name, cleaner semantics

2. **Datom naming convention from CQRS-ES**: all datoms use past-tense or noun naming, never imperative. No `:intent/*` namespace — intent is a phase, not a type. effectHandlers declare which fact-attributes they react to.

3. **Virtual projections are 2D**: shape (what) x engine (how). Three engines (TS API, D2TS, DuckDB) serve all 7 projection shapes. Only useful cells get implemented.

4. **Query templates ARE effectHandlers** — the template system is the creation cache applied to queries. Big model creates, small model routes, templates evolve from ad-hoc to infrastructure.

5. **Three tiers (Hot/Warm/Frozen)** with D2TS bridging. Memory optimization is benchmark-driven, using known techniques (interning, typed arrays, structured values).

6. **Architecture is domain-agnostic** — code analysis and counseling use the same DatomStore API, same template pattern, different attribute namespaces.

7. **The spike is focused** — prove 4 existential claims (performance, N+1 elimination, LLM generation, template routing) with blast-radius as the showcase question. Everything else is deferred engineering.

### Connection to Vision

This brainstorm extends, but does not modify, [vivief-concepts-vision.md](../vivief-concepts-vision.md). After the spike:

| If spike proves... | Vision update |
|--------------------|---------------|
| Claims 1+2 (datom store works) | Section 2.1 Datom: add EAVT/AEVT/AVET/VAET as the runtime model |
| Claim 4 (LLM generates TS) | Section 2.2 Projection: add TypeScript code generation as a query mode |
| Claim 5 (template routing) | Section 2.5 effectHandler: add query template as a creation pattern |
| Signature clarification | Section 2.5 effectHandler: `(Datoms, Intent) => (Datoms', [Intent]')` |
| Virtual projections | Section 2.2 Projection: add virtual projection shapes as Projection capability |
