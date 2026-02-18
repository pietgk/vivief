# Procurement Research

Research exploring procurement intelligence as a domain to stress-test vivief's architecture. These 16 documents examine data pipelines, schema discovery, DuckLake storage, and domain primitives through the lens of procurement data extraction.

**Finding:** vivief's effect system already describes procurement processes. The `(State, Effect) → (State', [Effects])` pattern — effects, rules, diagnostics, improvement loops — generalizes to non-code domains without fundamental architectural changes. The research validates this and identifies concrete refinements.

This README synthesizes the research into a unified technical view anchored to vivief's existing implementation.

---

## The Core Insight: Effects All The Way Down

The parallel that makes everything click:

|  | Code Intelligence (vivief today) | Data Intelligence (procurement research) |
|---|---|---|
| Raw input | Source files | Procurement documents |
| Parse | AST → nodes/edges | Document extraction → structured records |
| Effects | `FunctionCall`, `Store`, `Send`, `Request` | `Acquire`, `Dispose`, `Move`, `Transform` |
| Rules | Pattern → DomainEffect (`Payment:Charge`) | Pattern → DomainEffect (`Acquire:Information`) |
| Diagnostics | tsc error, eslint warning | Missing field, schema drift |
| Improve loop | LLM reads diagnostics → fixes code | LLM reads diagnostics → re-extracts |
| Storage | Parquet seeds, hub for cross-repo | Parquet in DuckLake, hub for cross-source |

`(State, Effect) → (State', [Effects])` is the same at every level. No new architecture needed — only refinements to what exists.

### What vivief has today

| Capability | Implementation |
|---|---|
| 9 code effect types | `FunctionCall`, `Store`, `Retrieve`, `Send`, `Request`, `Response`, `Condition`, `Loop`, `Group` — Zod discriminated unions in `devac-core/src/types/effects.ts` |
| 6 workflow effect types | `FileChanged`, `SeedUpdated`, `ValidationResult`, `IssueClaimed`, `PRMerged`, `ChangeRequested` |
| Rules engine | Pattern match effects → domain effects (`Payment:Charge`, `Auth:TokenVerify`). ~50 builtin rules across 8 domains. First-match-wins evaluation with priority ordering. `devac-core/src/rules/rule-engine.ts` |
| 3 additional rule engines | Grouping (container/layer assignment), Significance (critical/important/minor/hidden), WCAG (accessibility violations) |
| Unified diagnostics | 10 sources, 5 severities, 8 categories. Hub stores and MCP tools query |
| Validate → diagnose → improve loop | Hooks inject diagnostics on prompt submit, validate on stop. LLM reads errors, fixes code, re-validates |
| Seeds as Parquet | nodes/edges/external_refs/effects per package, git-versioned. Hub materializes cross-repo views |
| Effect enrichment → C4 | Low-level effects → `EnrichedDomainEffect` (with `sourceName`, `sourceKind`, `relativeFilePath`) → C4 architecture diagrams |
| Developer-maintained effect mappings | `package-effects.md` → `effect-mappings.ts`, verified against AST |

---

## What the Research Adds

Each subsection: **what vivief has today → what the research refines → why it matters → risk**.

### 3.1 Rule Type Taxonomy

**Today:** Rules are flat `{ match, emit, priority }` pairs. All rules evaluate the same way — first match wins, emit a `DomainEffect`.

**Adds:** Four distinct rule types with different semantics:

| Type | Semantics | Example |
|---|---|---|
| **Validity** | Hard fail — data is wrong | Missing required field in extraction |
| **Quality** | Soft warning — data is suspicious | Date format inconsistency across records |
| **Abstraction** | Pattern → higher-level effect | Multiple `Payment:Charge` + `Auth:TokenVerify` → `CheckoutFlow` |
| **Anomaly** | Expected pattern absent | Function handles payments but never calls auth |

**Change:** Add `type` field to the `Rule` interface. The engine evaluates all rules the same way — `type` is metadata that consumers (diagnostics, grouping) interpret differently.

**Risk:** Over-categorizing what's currently simple. The existing flat model works well for domain effect classification. Adding types is justified only when consumers actually need the distinction.

**Sources:** `mvp/02-vision-document.md`, `procurement-primitives.md`

### 3.2 Provenance on Effects

**Today:** `DomainEffect` tracks `sourceEffectId`, `ruleId`, `ruleName`, `originalEffectType`, `sourceEntityId`, `filePath`, `startLine`. You know which rule matched which effect.

**Adds:** Asserted vs inferred distinction. "This domain effect was inferred by rule `stripe-charge` from `FunctionCall` effect at `checkout.ts:42`" — formalized as a `provenance` field that chains through rule applications.

**Change:** Optional `provenance` field on `DomainEffect`:

```typescript
provenance?: {
  method: "asserted" | "inferred";
  ruleChain: string[];  // rule IDs applied in sequence
  confidence?: number;  // 0-1 for LLM-based inference
}
```

**Risk:** Storage overhead for character-level spans. Start with rule-level provenance; add span-level only if debugging demands it.

**Sources:** `mvp/05-insights-kg-extraction-langextract.md`

### 3.3 Diagnostics-as-Effects (Recognition, Not Code)

**Today:** The validation loop works: hooks inject diagnostics → LLM reads errors → fixes code → re-validates. This is implemented via `ValidationResult` workflow effects and the Stop hook running `devac validate`.

**Adds:** Recognition that this loop IS the general pattern for any domain's quality improvement:
1. Extract data → effects
2. Validate effects → diagnostics
3. LLM reads diagnostics → re-extracts
4. Recurring failures → new rule (automate the fix)

The procurement research describes exactly this cycle for document extraction. Vivief already does it for code.

**Change:** Documentation only. No new code — the pattern already works. The insight is that vivief's validation pipeline is domain-agnostic by accident.

**Sources:** `mvp/02-vision-document.md`, `diagrams/03-hybrid-progressive.md`

### 3.4 DuckLake Hub Upgrade

**Today:** Hub is bare DuckDB with single-writer constraint (ADR-0024). CLI↔MCP coordination via Unix socket IPC. Seeds are git-tracked Parquet. Hub materializes cross-repo views.

**Adds:** DuckLake decouples metadata (SQL database) from data (Parquet files). This gives:
- **Time travel** — snapshot hub state, compare across versions
- **Multiplayer** — multiple writers via metadata coordination (solves ADR-0024's single-writer constraint)
- **Multi-table ACID** — atomic updates across cross_repo_edges, diagnostics, embeddings
- **Data inlining** — small tables stored directly in metadata catalog, large tables stay in Parquet

**Change:** Replace hub backend from bare DuckDB to DuckLake. Seeds stay git-tracked (they're source-deterministic). Derived data (cross_repo_edges, embeddings, metrics) gets versioned snapshots via DuckLake.

**Risk:** DuckLake released May 2025 — young dependency. The metadata catalog adds a SQL database (SQLite or PostgreSQL) alongside DuckDB. More moving parts.

**Sources:** `ducklake/ducklake-technical-overview.md`, `ducklake/ducklake-vivief-brainstorm.md`

### 3.5 Semantic Search (FTS + VSS)

**Today:** Query by symbol name, entity_id, file path, SQL. All queries are exact or pattern-based.

**Adds:** DuckDB's FTS extension (BM25 scoring) + VSS extension (HNSW on embeddings). Hybrid ranking:

```
score = 0.3 × BM25(query, doc) + 0.7 × cosine_similarity(query_embedding, doc_embedding)
```

Enables: "find functions similar to this one", "what code handles checkout?", drift detection via embedding distance.

**Change:** Add embedding pipeline (compute embeddings for code entities) + FTS/VSS index creation during hub sync.

**Risk:** FTS indexes don't auto-update on DuckDB table changes — require rebuild. HNSW indexes are in-memory only. Embedding pipeline adds a Python dependency (or calls an embedding API). Model choice couples index format to a specific embedding model.

**Sources:** `ducklake/ducklake-vs-databases-v2.md`

### 3.6 Effect Grouping → Process-Level Effects

**Today:** Rule engine emits `DomainEffect`. `EnrichedDomainEffect` adds node metadata. `GroupingEngine` assigns container/layer. `Group` effect type exists for C4 diagrams.

**Adds:** Group domain effects into process-level effects. Multiple `Payment:Charge` + `Auth:TokenVerify` + `Database:Query` in the same call chain = "Checkout Flow". In procurement: multiple `Acquire` + `Transform` = "Tender Evaluation".

**Change:** Extend the existing enrichment pipeline. Abstraction rules (from 3.1) are the mechanism — they match patterns of domain effects and emit higher-level effects.

**Risk:** Grouping heuristics need careful design. File-level grouping is too coarse (a file may contain multiple processes). Call-chain grouping captures real flows but is expensive and creates overlapping groups for shared utilities.

**Sources:** `diagrams/05-agentic-catalog.md`, `procurement-primitives.md`

### 3.7 NATS as Event Backbone

NATS JetStream is the central coordination layer in the procurement pipeline research. It provides streams, KV stores, object storage, and request-reply in a single ~20MB binary. The research marks it as "never revisit (architectural)" for procurement.

Vivief has no message broker. This section presents both sides.

#### What the research uses NATS for

- **Streams:** `raw.documents.*`, `extracted.records.*`, `validated.records.*` — typed effect routing between workers
- **KV stores:** Deduplication hashes, active schemas, pipeline metrics — fast state lookups
- **Request-reply:** Synchronous LLM calls (send document, wait for extraction result)
- **Object store:** Raw file storage before processing
- **Subject hierarchy:** Organizing effect flow by domain (`scrape.se`, `extract.with-schema`, `data.validated`)

#### How vivief coordinates today (without NATS)

- Direct function calls within packages (analyze → extract effects → write Parquet)
- Hub IPC via Unix socket for MCP↔CLI coordination (ADR-0024)
- Git hooks + Claude Code hooks for the validation loop
- MCP server as the LLM communication layer
- `devac sync --watch` for file-change-driven re-analysis

#### Arguments for

| Argument | Details |
|---|---|
| Effects ARE events | Vivief's effect types (`FunctionCall`, `Store`, `ValidationResult`) are already typed events. NATS gives them a transport layer — effects flow between producers/consumers instead of being written-then-read from Parquet |
| Decoupled workers | Validation, extraction, enrichment, embedding generation could become independent NATS workers. Today they're sequential function calls in a single process |
| Watch mode done right | File change → NATS event → parallel re-analyze + re-validate + re-embed. Current watch mode is single-threaded sequential |
| Distributed LLM coordination | Multiple LLM agents working on different packages could coordinate via NATS subjects instead of file locks |
| KV for pipeline state | Dedup hashes, active analysis state, metrics — currently scattered across hub tables and in-memory state |
| Natural bridge to procurement | If vivief and procurement share NATS, effects from both domains flow through the same backbone |
| Single binary, laptop-friendly | NATS server is ~20MB, zero config for dev |

#### Arguments against

| Argument | Details |
|---|---|
| Works fine without it | Current architecture handles single-user dev workflows. Direct calls + hooks + MCP cover coordination needs |
| Operational complexity | Another process to run, another thing to debug. "Why isn't my analysis working?" now includes "is NATS running?" |
| YAGNI for code analysis | Single developer analyzing their own code doesn't need a message broker. Bottleneck is AST parsing and LLM calls, not coordination |
| DuckLake may solve the same problems | Multiplayer DuckDB via DuckLake solves the single-writer issue. Time travel solves state tracking. Reduces NATS's unique value proposition |
| Adds deployment surface | Users installing DevAC would need NATS. Current install is `pnpm install` + done |
| Effect-as-data vs effect-as-event | Vivief's effects are data (Parquet rows queried via SQL). NATS makes them events (messages consumed in real-time). Mixing paradigms adds conceptual complexity |

#### When NATS becomes the right choice

- Vivief moves to continuous/watch mode with multiple parallel workers
- Procurement pipeline is built and needs multi-source, multi-worker coordination
- Effect architecture wants true event sourcing (not just query-time analysis)
- Multiple LLM agents need coordinated access to the same codebase
- Team/CI scenarios where multiple processes analyze concurrently

**Recommendation:** Present as "needs discussion" with clear trigger conditions. The effect type system is already event-shaped — that's the bridge. The question is whether coordination benefits justify operational cost.

---

## Tiered Recommendations

### High Confidence

Natural extensions, low risk. These refine what exists without adding new systems.

| # | Item | Change | Source section |
|---|---|---|---|
| 1 | Rule type taxonomy | Add `type` field to `Rule` interface | 3.1 |
| 2 | Provenance on effects | Optional `provenance` field on `DomainEffect` | 3.2 |
| 3 | Diagnostics-as-effects | Documentation only — recognize the existing pattern generalizes | 3.3 |
| 4 | DuckLake hub upgrade | Replace hub backend. Solves known ADR-0024 single-writer constraint | 3.4 |

### Needs Discussion

Higher value, higher complexity. Each has trade-offs that need team input.

| # | Item | Why it needs discussion |
|---|---|---|
| 5 | Semantic search (FTS + VSS) | High value but adds embedding pipeline and Python dependency |
| 6 | Effect grouping | Core to "explain code through effects" vision, but grouping heuristics are hard |
| 7 | NATS event backbone | Natural fit for effect architecture; trigger: multi-worker or procurement expansion |
| 8 | Architectural drift detection | Snapshot hub over time, compare metrics. Depends on DuckLake time travel (4) |
| 9 | CI structural PR comments | Auto-comment structural changes on PRs. Depends on hub data (4) |
| 10 | Agentic catalog | LLM observes patterns, proposes refactorings. Most ambitious — depends on grouping (6) |
| 11 | Procurement as validation domain | Build extraction MVP to prove generalization. Uses NATS (7) + all of above |

---

## Procurement Primitives

Reference section so readers can follow the procurement documents. Not a recommendation to implement.

The research defines procurement through a 5×4 matrix of **what** is being procured × **what operation** is performed:

| | Acquire | Dispose | Move | Transform |
|---|---|---|---|---|
| **Matter** | Purchase raw materials | Sell surplus inventory | Ship goods between warehouses | Manufacture product from materials |
| **Energy** | Contract electricity supply | Decommission power plant | Transmit power across grid | Convert fuel to electricity |
| **Information** | Collect tender documents | Archive expired contracts | Forward RFP to suppliers | Extract structured data from documents |
| **Attention** | Hire evaluators | End consulting engagement | Assign reviewer to tender | Train evaluator on new criteria |
| **Rights** | Acquire patent license | Terminate contract | Transfer IP between entities | Negotiate contract amendment |

### Mapping to vivief's effect types

The five resource types and four operations map onto vivief's existing effect model:

| Procurement operation | Vivief effect type analog | Notes |
|---|---|---|
| Acquire | `Retrieve` / `Request` | Pulling data/resources in |
| Dispose | `Send` / `Store` (delete) | Pushing data/resources out or removing |
| Move | `Send` + `Store` | Transfer = retrieve from source + store at destination |
| Transform | `FunctionCall` | Computation that changes shape/form |

The resource types (Matter, Energy, Information, Attention, Rights) would be metadata on domain effects — equivalent to how `Payment`, `Auth`, `Database` are domains today. `Acquire:Information` is the procurement analog of `Retrieve:Database`.

---

## Dependency Graph

```
Rule Types (1) ──── Effect Grouping (6) ──── Agentic Catalog (10)
                                                  │
DuckLake Hub (4) ──┬── Semantic Search (5)        │
                   ├── Drift Detection (8) ───────┘
                   └── CI PR Comments (9)

Provenance (2) ──── [independent]
Diagnostics-as-Effects (3) ──── [documentation, no code]
NATS (7) ──── [independent, trigger-based]
Procurement MVP (11) ──── [uses NATS (7) + all of above]
```

---

## Open Questions

### Q1: Rule type semantics — single field or distinct evaluation?

Adding `type: "validity" | "quality" | "abstraction" | "anomaly"` to the `Rule` interface is simple. But should each type evaluate differently?

| Alternative | Pros | Cons |
|---|---|---|
| **A: Single `type` field, same evaluation** | Minimal change, backwards compatible. Type is metadata for consumers (diagnostics map type → severity) | Types are just labels — doesn't unlock new behavior. Abstraction rules may need different matching semantics than validity rules |
| **B: Type-specific evaluation strategies** | Each type gets tailored semantics: validity returns pass/fail, quality returns score + threshold, abstraction returns grouped effect, anomaly returns expected-vs-observed | More complex engine, more interfaces, rules harder to write |
| **C: Start with A, evolve to B when needed** | Ship fast, learn from usage | Risk of A calcifying if rules accumulate before the migration |

### Q2: Where do embeddings live — seeds or hub?

| Alternative | Pros | Cons |
|---|---|---|
| **A: Hub only (derived layer)** | Seeds stay small and deterministic. Embeddings are computed artifacts, not source truth. Fits "git owns regeneratable, hub owns computed" | Embeddings lost if hub is rebuilt without re-running pipeline. Can't share via git |
| **B: Seeds (git-tracked)** | Portable — clone repo, get embeddings | Seeds become large. Git not designed for large binary diffs. Model changes require full regeneration |
| **C: Separate artifact store** | Own Parquet files alongside seeds, `.gitignore`d. Cached locally, regenerated on demand | More files to manage. Need cache invalidation strategy |

**Likely answer:** A (hub only). Consistent with the DuckLake brainstorm's "git owns regeneratable, DuckLake owns computed" principle.

### Q3: Effect grouping granularity

| Alternative | Pros | Cons |
|---|---|---|
| **A: File-level** | Simple, deterministic | Too coarse — a file may contain multiple processes |
| **B: Call-chain** | Captures real flows | Expensive (call graph traversal). Overlapping chains for shared utilities |
| **C: User-defined** | Explicit, high-quality | Manual effort, groups go stale |
| **D: Abstraction rules (hybrid)** | Automatic but knowledge-guided. Rules encode domain knowledge | Rule authoring is non-trivial. Need good defaults |

**Likely answer:** D (abstraction rules) with C (user-defined) as override. Abstraction rules are the mechanism, user mappings are the escape hatch.

### Q4: First non-code domain — procurement or something simpler?

| Alternative | Pros | Cons |
|---|---|---|
| **A: Procurement** | Deeply researched (16 documents). Clear effect mapping. Large market | Complex domain. Requires expertise. Risk of splitting focus |
| **B: Log/trace analysis** | Close to code — structured events already exist | Less differentiated. Doesn't test schema discovery |
| **C: API contract analysis** | Analyze OpenAPI/GraphQL specs like code. Close to existing AST parsing | Narrow domain. Specs are already well-structured |
| **D: Don't — deepen code intelligence first** | Focus all effort on code effects | Doesn't validate generalization. Risk of code-specific assumptions hardening |

**No clear winner** — this is a strategic direction question.

### Q5: Generalization vs overengineering boundary

| Alternative | Pros | Cons |
|---|---|---|
| **A: Keep code-specific, extract patterns later** | Ship faster. No abstraction tax | Risk of code-specific assumptions that make later generalization expensive |
| **B: Make core domain-agnostic now** | Effect types, rule engine, diagnostics, hub accept any domain via plugin | Abstraction cost upfront. Core becomes harder to understand |
| **C: Domain-agnostic interfaces, code-specific defaults** | Interfaces are cheap. Another domain implements them differently | Interface design is hard without multiple implementations to test against |

**Likely answer:** C, implemented incrementally. When adding features (rule types, provenance, grouping), design interfaces domain-agnostic even if the only implementation is code. This costs almost nothing extra.

---

## Directory Map

### Root

| File | Description |
|---|---|
| `procurement-primitives.md` | First-principles exploration: 5×4 matrix of resource types × operations as atomic procurement elements |
| `investor-pitches.md` | Brainstorming elevator pitches combining procurement market data with vivief architecture |

### `diagrams/`

| File | Description |
|---|---|
| `01-self-organizing-pipeline.md` | Full self-organizing pipeline: browser agents → NATS backbone → LLM schema discovery |
| `02-schema-first-alternative.md` | Alternative A: humans define schemas, LLMs fill them, lower risk |
| `03-hybrid-progressive.md` | Alternative B: known sources take fast path, unknown sources go through schema discovery |
| `04-tech-stack-and-decisions.md` | Concrete technology choices per layer: Browser-Use, NATS, Claude/Ollama, DuckLake |
| `05-agentic-catalog.md` | Metadata store that observes patterns, detects drift, proposes unifications |

### `ducklake/`

| File | Description |
|---|---|
| `ducklake-technical-overview.md` | DuckLake reference: two-component architecture (SQL metadata + Parquet data), Iceberg comparison |
| `ducklake-vivief-brainstorm.md` | DuckLake × vivief: conflicts and overlaps between git-based and DuckLake-based versioning |
| `ducklake-vs-databases-v2.md` | Extended comparison: DuckLake vs relational/graph/document DBs, FTS and VSS capabilities |
| `ducklake-vs-databases.md` | First comparison: DuckLake vs PostgreSQL across data model, storage, queries, transactions |

### `mvp/`

| File | Description |
|---|---|
| `01-executive-summary.md` | Executive summary: teacher-student LLM distillation, effect-based pipelines, self-correcting loops |
| `02-vision-document.md` | Formalizes `(State, Effect) → (State', [Effects])` as unifying pattern for extraction and rules |
| `03-implementation-architecture.md` | Concrete MVP: laptop-runnable DuckLake + NATS architecture with design principles |
| `04-tech-stack-choices.md` | TypeScript-first stack (Zod, Vercel AI SDK, nats.js, duckdb-node), Python reserved for ML |
| `05-insights-kg-extraction-langextract.md` | Maps LLM failure modes in knowledge graph extraction against procurement pipeline design |
