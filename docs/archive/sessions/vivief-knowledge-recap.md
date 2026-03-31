# Vivief Knowledge Recap

*Accumulated knowledge from Claude sessions — context document for new conversations*
*Last updated: February 2026*

---

## 1. Vision-View-Effects Framework (ViViEf)

### Core Pattern

```
(State, Effect) → (State', [Effect'])
```

This elegantly unifies HTTP requests, actor messages, state machines, navigation, and architectural patterns. Effects are **immutable data** describing observations about code behavior. The EffectHandler is the processor.

```typescript
type Effect = /* immutable data union */
type EffectHandler = (state: State, effect: Effect) => [State, Effect[]]
```

### Three Transformation Pipelines

1. **Effect.Vision → Effect.View**
   - WHO: Humans create (natural language specs), LLMs + Systems implement, Humans validate (diagrams)
   - PURPOSE: Think at highest level, validate with eyes

2. **Effect.Question → Effect.Answer**
   - WHO: Humans ask, LLMs reason, Systems execute
   - PURPOSE: LLMs as reasoning partners using System capabilities

3. **Effect.Query → Effect.Data**
   - WHO: Systems extract and process
   - PURPOSE: Reliable execution against stored Effects

### Effect Categories

- **Data**: Event, Message, Request, Response, Vision, Question, Query, Answer, View
- **Do**: FunctionCall, Send, Store, Retrieve
- **Flow**: Condition, Loop
- **Group**: System, Container, Component, Directory, File, Class

### Intelligence Division

- **Humans**: Create Vision, validate Views (high-level thinking only)
- **LLMs**: Reasoning, pattern finding, code generation, proposing Rules
- **Systems**: Execution, extraction, reliable processing

### Actor Pipeline Architecture

```
Repos → OrchestratorActor → ExtractorActors → PresenterActors → ViewerActors
```

- **Orchestrators**: Stream repo configs to Extractors
- **Extractors**: Parse code into Effect streams (generous — emit everything)
- **Presenters**: Filter/transform Effects for specific outputs (C4, sequence diagrams, graph DB, LLM queries)
- **Viewers**: Display in browser

### Key Design Principle

Extractors emit ALL Effects. Presenters filter what they need:
- C4 diagrams: use Actor, Container, Message Effects
- Sequence diagrams: use Condition, Message, timing Effects
- Graph database: stores everything
- LLM query interface: traverses full detail

### Rules

Rules transform/enrich Effects using context and accumulated state:

```typescript
type Rule = (context: RuleContext, effect: Effect) => Effect[]
type RuleContext = {
  state: State        // accumulated knowledge
  fileInfo: FileInfo   // current file
  repoInfo: RepoInfo   // repo context
}
```

Rules can be stateful (need context like "component already seen?", "current package?"). Rules are created and maintained by Humans and LLM-Agents alongside Specs.

### Languages Flow

- **Natural language** (English, Given/When/Then) → for Vision and Questions
- **Compiled language** (TypeScript with types) → for Code, Tests, Queries
- **Presentation language** (Diagrams, structured data) → for Views and Answers

### Progressive Instrumentation

Tests work at every stage:
1. Start with zero effect wrappers (tests pass)
2. Add wrappers incrementally (tests still pass)
3. More wrappers = more Effects = richer Views
4. Same code behavior, increasing architectural visibility

---

## 2. DevAC — Developer Analytics Centre

### Architecture: Parquet + DuckDB

**Key decision**: Moved from Neo4j to Parquet files with DuckDB for federated queries.

```
GitHub Repo (e.g., some-mobile-app)
├── src/                              ← source code (git versioned)
├── .devac/
│   └── packages/
│       └── auth-module/
│           ├── nodes.parquet         ← AST nodes (regenerated from source)
│           ├── edges.parquet         ← relationships (regenerated)
│           ├── external_refs.parquet ← cross-package refs (regenerated)
│           └── effects.parquet       ← Vision-View-Effects (regenerated)

Hub (local DuckDB)
├── repo_registry                     ← which repos are registered
├── cross_repo_edges                  ← computed from external_refs across repos
└── federated queries via read_parquet() glob patterns
```

### Key Properties

- **Seeds are deterministic** — regenerated from source, not incrementally updated
- **Git is the version system** — branches, commits, PRs version both code AND seeds
- **Hub is read-mostly** — only cross_repo_edges are computed/stored centrally
- **Per-package partitioning** — max 6 Parquet files per package (ADR-0002)
- **Atomic writes** — temp file + rename + fsync (ADR-0004)
- **Single writer** — DuckDB constraint managed via IPC (ADR-0024)

### Why Parquet + DuckDB over Neo4j

- Zero infrastructure (embedded, serverless)
- Columnar storage great for aggregations (call counts, dependency metrics)
- Federated queries across multiple Parquet files in one SQL statement
- Easy to version/ship analysis alongside code
- No operational overhead of a graph database server

### Graph Traversal Limitation

DuckDB handles graph traversals via recursive CTEs — limited hop support but sufficient for code intelligence queries. Full graph database not needed for the use cases explored.

### Hierarchical Retrieval Pattern

```
modules.parquet  → module-level summaries, export counts, dependency edges
files.parquet    → file summaries, function signatures, complexity
symbols.parquet  → detailed symbol info, call relationships
```

LLM sees ~200 tokens from module overview, decides what matters, drills down to ~300 tokens of ranked matches, then into symbol detail only as needed. Keeps under 1000 tokens for most queries instead of dumping entire files.

---

## 3. Vector Search, Full-Text Search, and Hybrid Retrieval

### DuckDB Extensions

- **vss** (Vector Similarity Search): HNSW indexes, `array_distance()` for cosine/L2
- **fts** (Full-Text Search): BM25 ranking via `match_bm25()`
- **Important caveat**: Both vss and fts indexes live IN DuckDB, not in Parquet files themselves. Parquet stores the raw data (vectors as FLOAT[] columns, text as VARCHAR), but indexes must be built in a DuckDB database file.

### Hybrid Search Pattern

Combine structural (SQL), semantic (vector), and keyword (BM25) search with Reciprocal Rank Fusion (RRF):

```sql
WITH structural AS (...), semantic AS (...), keyword AS (...),
combined AS (
  SELECT id, 1.0/(60 + structural_rank) + 1.0/(60 + semantic_rank) + 1.0/(60 + keyword_rank) AS rrf_score
  FROM ...
)
SELECT * FROM combined ORDER BY rrf_score DESC LIMIT 10;
```

### Vector Storage Options Explored

1. **DuckDB vss** — Zero dependencies, same query interface. Start here.
2. **LanceDB** — "Parquet for vectors," columnar with built-in vector indexes. Best philosophical match if DuckDB vss hits limits.
3. **Hybrid Parquet + sidecar index** (USearch) — Store vectors in Parquet, maintain lightweight index file alongside.

**Recommendation**: Start with DuckDB vss, migrate to LanceDB later if needed.

---

## 4. DuckLake Integration

### The Clean Separation Principle

> "Git owns what's regeneratable, DuckLake owns what's computed."

- **Seeds** (nodes, edges, external_refs, effects): Deterministic from source → git versioning
- **Derived layer** (cross-repo edges, embeddings, architectural metrics): Computed data → DuckLake versioning

### DuckLake Value for Vivief

- Solves ADR-0024 single-writer IPC headache (PostgreSQL catalog gives multiplayer DuckDB)
- Snapshot-per-commit: structural diffs in PR comments ("47 functions added, 12 removed, 3 changed signatures")
- Time travel queries: `VERSION AS OF` for comparing code evolution
- Hybrid FTS + VSS + vivief Effects in one SQL query

### The Convergence Point

FTS + VSS + vivief Effects + DuckLake time travel in one query: "Find authentication-related effects added in the last month that are semantically similar to this pattern."

---

## 5. Code Property Graphs and Deeper Analysis

### Journey from AST to CPG

1. **AST extraction** (ts-morph): Parse TypeScript/JavaScript into syntax trees
2. **Code Property Graph** (Joern-inspired): Combine AST + Control Flow Graph + Program Dependency Graph
3. **Taint analysis**: Track data flow from sources to sinks for security analysis
4. **Cross-repo awareness**: External references link packages across repositories

### SCIP (Sourcegraph Code Intelligence Protocol)

- Protobuf-based, successor to LSIF
- Human-readable symbol identifiers: `npm package-name 1.0.0 src/File.ts#className.methodName()`
- Document-centric, designed for streaming
- Cross-repository navigation built-in
- Potential integration: Use SCIP output to enrich/validate vivief's own extraction pipeline

### LSP as Data Source for DevAC

Instead of just using LSP for navigation, **harvest LSP data** to enrich the graph:
- `documentSymbol` → validate/enrich node extraction
- `definition` → validate edge relationships
- `references` → verify reference counts
- `diagnostic` → feed validation layer (type errors → issues.parquet)
- `hover` → enrich type metadata

Architecture: LSP Harvester as a programmatic LSP client feeding into DevAC's Parquet files.

---

## 6. RAG Architecture for Code Intelligence

### Vivief RAG Facade

Not "RAG for code" but **structured code intelligence with a natural language interface**:

```typescript
interface ViviefAnswer {
  content: string
  confidence: 'high' | 'medium' | 'low' | 'speculative'
  provenance: Provenance  // code refs, runtime refs, graph paths, external refs
  suggestedFollowups?: string[]
}

interface ViviefRAG {
  query(question: string): Promise<ViviefAnswer>
  queryStream(question: string): AsyncIterableIterator<ViviefAnswer>
  retrieve(question: string): Promise<RetrievalResult[]>  // raw sources without synthesis
  explain(answer: ViviefAnswer): Promise<ExplanationChain>  // show reasoning
}
```

### Key Differentiator from Generic RAG

Vivief understands **structure**, not just text. "What breaks if I change User.email?" traverses the dependency graph and finds all code paths that assume email exists. Generic RAG would just do text similarity.

### Question Classification → Strategy Weighting

Different question types route to different retrieval strategies:
- Structural queries → graph traversal
- Semantic queries → vector similarity
- Temporal queries → time-series analysis
- Cross-cutting → hybrid with RRF fusion

### Build Phases

1. Graph + simple vector search with existing extractors
2. Question classifier (start rules-based)
3. Runtime correlation when OTel traces available
4. Provenance UI for DevAC visualization
5. External system connectors (one at a time)

---

## 7. MCP Server and Claude Plugin Architecture

### DevAC MCP Server

Exposes vivief/DevAC functionality to any AI assistant (Claude, Copilot, Gemini):
- `get_skill` tool returns relevant SKILL.md content
- Skill content embedded in tool descriptions
- Prefix tool responses with relevant guidance

### Skills Pattern

Structured instruction files that guide AI behavior for specific task types:
- Dynamic discovery and composition based on task type
- Multiple skills can be combined per task
- The `view` tool pattern means skills can reference each other
- Differentiated from Cursor's `.cursorrules` and GitHub Copilot's `copilot-instructions.md` by dynamic loading

### Claude Plugin Setup

- Uses `--plugin-dir` or workspace `.claude-plugin/marketplace.json`
- Skills, commands, CLI commands all using devac-core
- Developers can use Claude Code, Copilot, or Gemini — all access DevAC via MCP

---

## 8. EventCatalog Comparison

EventCatalog.dev is an open-source documentation platform for event-driven architectures. Overlap with vivief:

- Both: document services, events, ownership, architectural relationships
- EventCatalog: static documentation from specs (AsyncAPI, OpenAPI)
- Vivief: dynamic extraction from code + runtime, richer Effect taxonomy
- Vivief goes deeper: code-level effects, runtime traces, LLM-queryable graphs
- EventCatalog is complementary: could be a Presenter target for vivief Effects

---

## 9. Data Extraction Pipeline (Procurement Context)

Explored a TypeScript-first extraction pipeline for processing documents:

- **Architecture**: NATS messaging, DuckLake storage, diagnostics-driven feedback loop
- **Pattern**: Acquirer → Extractor (LLM + Zod schemas) → Validator (YAML rules) → Loader
- **Validation rule types**: Validity, Quality, Abstraction, Anomaly
- **Key insight**: Asserted vs augmented data provenance, source span preservation for audit trails
- **Tech preferences**: TypeScript first, Python where it provides genuine advantages (ML training, advanced NLP)

---

## 10. Vivief vs Claude Code LSP (Comparison)

Claude Code's LSP integration is **tactical** (point-in-time, file-scoped navigation):
- goToDefinition, findReferences, documentSymbol, hover, getDiagnostics

Vivief/DevAC is **strategic** (architectural understanding):
- Code Property Graph with full relationships
- Cross-repo awareness
- Architectural pattern detection
- Effect propagation tracking
- Runtime correlation (OTel traces linked to code paths)
- Time dimension (code evolution over time)
- Multi-language unified graph

They're complementary: LSP helps navigate code moment-to-moment; vivief answers architectural questions.

---

## 11. Database Alternatives Explored

| Database | Verdict |
|----------|---------|
| **Neo4j** | Used initially, replaced by Parquet + DuckDB |
| **ArangoDB** | Multi-model (graph + document + key-value), recommended for early POC before Parquet switch |
| **PostgreSQL + Apache AGE** | Adds Cypher support, good if already using PG |
| **DuckDB** | ✅ Current choice. Embedded, analytical, Parquet-native |
| **LanceDB** | Vector-native complement to Parquet, good future option |
| **DuckLake** | Lakehouse format on top of Parquet, for derived/computed data |

---

## 12. Key Technical Decisions and ADRs

- **ADR-0002**: Per-package partitioning, max 6 Parquet files per package
- **ADR-0004**: Atomic writes via temp file + rename + fsync
- **ADR-0024**: Single writer constraint managed via IPC (DuckLake could solve this)
- **Parquet over Neo4j**: Zero infrastructure, columnar performance, git-versionable
- **DuckDB as hub**: Federated queries across repos via `read_parquet()` glob patterns
- **Effects as universal IR**: Extractors emit everything, Presenters filter what they need

---

## 13. OpenTelemetry Integration (Future)

### Vision

Correlate static code analysis with runtime behavior:
- Decorator, Wrapper, or Proxy patterns for TypeScript instrumentation
- Custom graph exporter sends traces to vivief's storage
- Parquet files for OTel data (popular format for log/trace storage)
- Link runtime traces to code paths in the graph

### Implementation Patterns Explored

1. **Decorator pattern**: Cleanest TypeScript approach for manual instrumentation
2. **Proxy-based**: Automatic wrapping of service boundaries
3. **Custom exporter**: Sends OTel spans directly to DuckDB/Parquet

---

## Summary: The Vivief Philosophy

1. **Effects are data** — immutable observations about code, not executable code
2. **Universal IR** — one representation that flows between all tools
3. **Files as truth** — Parquet files, git-versioned, no server infrastructure
4. **DuckDB as compute** — SQL for everything, federated across repos
5. **Progressive depth** — start simple, add more extractors/rules for richer views
6. **LLM-queryable** — structured data designed for efficient token consumption
7. **Humans think, LLMs reason, Systems execute** — each does what they do best
