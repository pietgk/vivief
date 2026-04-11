# Vivief Concepts Challenge

> Analysis document. Challenges vivief platform concepts against real-world LLM repos and visual architecture tools.
> Not a spec. A thinking document — let it sink in, then decide what to act on.
>
> **Note (2026-04):** This analysis was written against the original 7-concept model. Since then, Lens and Seal were merged into **Projection** and P2P became infrastructure, yielding the current 5 concepts: Datom, Projection, Surface, Contract, effectHandler. References below have been updated to use current terminology.

## 1. Purpose

The vivief platform defines 5 first-class concepts: **Datom, Projection, Surface, Contract, effectHandler** — plus **reactive subscription** as a store property. These were designed by synthesizing devac (code analysis) and counseling platform (clinical workflows) requirements. To test whether they hold up as a general-purpose LLM platform foundation, we challenge them against two repos that solve real problems in the LLM development space:

- **open-webui** — what a mature, full-featured LLM chat platform looks like at scale
- **pi-mono coding-agent** — what a minimal, extensible LLM development harness looks like

We also challenge them against three visual architecture tools that the vivief team uses — **C4/likeC4**, **XState v5**, and **Storybook** — to see if their patterns reveal cleaner concept compositions or unify concepts we currently treat as separate.

The question: do vivief's concepts cover what these systems need? What's missing? What's already stronger? Can we make the concept set smaller or more elegant?

## 2. The Challengers

**open-webui** ([github](https://github.com/open-webui/open-webui)) — Self-hosted LLM chat platform. Multi-model proxy (Ollama, OpenAI, etc.), RAG pipeline, plugin system (Functions/Tools/Pipes), RBAC + groups, real-time collaboration (CRDT notes), Socket.IO streaming, 50k+ stars. Architecture: FastAPI + SQLAlchemy + Svelte. Conventional mutable CRUD model, server-centric.

**pi-mono coding-agent** ([github](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)) — Terminal-based LLM coding harness by Mario Zechner. Dual-loop agent (inner: tool execution, outer: follow-up drain). ~30-hook extension system, append-only JSONL session tree with branching, context compaction with LLM summarization, pluggable bash operations (local/SSH), multi-provider support. Philosophy: core is thin, push everything to extensions.

**C4/likeC4** — Architecture diagram standard with 4 zoom levels (System, Container, Component, Code). vivief uses likeC4 for visualization. C4 DSL files generate interactive React diagrams. The pattern of defining architecture at multiple abstraction levels has deep overlap with Contract and effectHandler hierarchies.

**XState v5** ([xstate.js.org](https://stately.ai/docs/xstate)) — State machine and actor model library. Makes logic visible, explorable in Stately Studio, and testable. Actors have private state, communicate via messages, can be spawned/stopped. The formalism `(state, event) => (state', [actions])` is identical to effectHandler.

**Storybook** ([storybook.js.org](https://storybook.js.org/)) — UI component isolation, visual testing, accessibility scanning (axe), interaction testing (play functions), living documentation. Each story renders a component with controlled props — essentially a Surface with a fixed Projection.

## 3. Challenges by Category

### 3.1 Authorization vs. Confidentiality

**What we observed:** Open-webui has a clean generic `AccessGrant` model — single table with `resource_type`, `principal_type`, `principal_id`, `permission` (read/write). Plus RBAC roles, groups, LDAP/SCIM/OAuth. This is **authorization**: who can access what.

**How vivief covers it today:** Projection covers **confidentiality** (per-Projection encryption keys) and **authorization** (capability tokens). The Projection-as-capability idea ("a capability IS a Projection") is mentioned in concept composition but not fully specified. Access control is a Projection property but the authorization half is underspecified.

**Assessment:** **Strengthen existing concepts.** Projection handles both encryption and query scope. Authorization (who can query what) should be specified as a Projection property — a Projection that cannot be constructed without the right capability token. This needs to be made concrete. Not a new concept — a sharper definition of Projection's access control.

### 3.2 Provider Abstraction / Model Routing

**What we observed:** Both repos normalize heterogeneous LLM providers behind a unified interface. Open-webui's "Manifold Pipe" lets one plugin register N models. Pi has a clean provider abstraction with streaming, thinking levels, and cost tracking per provider.

**How vivief covers it today:** Not addressed. The effectHandler formula assumes "a handler runs" without specifying how it resolves to a specific LLM provider, model, or configuration.

**Assessment:** **Not a concept — a domain pattern.** Provider abstraction is an implementation concern for effectHandlers that invoke LLMs. It would be modeled as: provider configurations stored as datoms (`:provider/anthropic`, `:model/opus-4`), handler reads state to resolve which provider/model to use, Contract validates model selection rules. This works within existing concepts. No new concept needed, but a reference pattern worth documenting.

### 3.3 Progressive / Streaming Values

**What we observed:** LLM responses arrive token-by-token. Both repos stream partial responses to the UI in real-time. This is fundamentally different from reactive subscription (which notifies on committed state transitions). A streaming LLM response is a **partial, in-flight value** — not yet a datom.

**How vivief covers it today:** Reactive subscription notifies when datoms are committed. There is no concept for values that are still forming.

**Assessment:** **Concept refinement needed.** Two options: (a) model streaming as rapid micro-datoms (each token chunk committed as it arrives) — simple but noisy, pollutes the datom log with transient state; (b) treat streaming as a Surface concern — the transport between effectHandler and Surface carries a stream, the final value becomes a datom on completion. Option (b) is cleaner: the datom log only contains completed facts, streaming is a rendering optimization. This means Surface needs to handle both "committed datom snapshots" and "in-flight effect streams." Worth specifying.

### 3.4 Context Window Management / Compaction

**What we observed:** Pi treats context management as a first-class concern. When conversation approaches context limits, it walks backwards to find valid cut points, generates LLM-powered summaries, and tracks file artifacts across compaction boundaries. This is a **lossy transformation** preserving semantic continuity.

**How vivief covers it today:** Not covered. Projection is a filter (selects datoms), not a summarizer (transforms/compresses them). The dual-loop pattern describes human + AI loops but doesn't address how the AI's context window is managed.

**Assessment:** **High-priority gap for AI-centric workflows.** When an effectHandler invokes an LLM, it must construct context from datoms. This is: (1) select relevant datoms (Projection), (2) render them into a prompt (Surface?), (3) compress if needed (new). The selection is Projection. The rendering could be a Surface variant. The compression/summarization is neither — it's a lossy transform that produces a new datom (summary) from old datoms. This could be modeled as an effectHandler itself: `(state, :compaction/requested) => { datoms: [summary-datom], intents: [] }`. The compaction handler reads state via Projection, produces a summary datom, and the AI handler uses that summary datom as context. This works within existing concepts but the pattern should be named and documented.

### 3.5 Composition / Extensibility

**What we observed:** Pi has ~30 hooks across 6 categories (resource, agent-loop, message, tool, input, model). Open-webui has Functions (Filters/Pipes/Actions), external pipeline microservices, and the Valves configuration pattern. Both invest heavily in "how do third parties extend the platform."

**How vivief covers it today:** effectHandler is the extension point — register a new handler, it receives effects matching its type. Contract gates what handlers can do. But there is no concept for **middleware** (before/after interception), **priority ordering**, or **hook points** on the dispatch pipeline itself.

**Assessment:** **Concept refinement needed.** The effectHandler + Contract model is the right foundation — handlers ARE the extension mechanism. But the dispatch pipeline needs specified interception points: before-dispatch (Contract validation is already this), after-commit (reactive subscription is already this), before-handler (input transformation — a handler that wraps another handler). This is achievable as "handlers that wrap handlers" (higher-order effectHandlers) rather than a new concept. The key missing piece is **dispatch priority** — when multiple handlers match an effect, what order do they run? This needs specification.

### 3.6 Interruptibility / Steering

**What we observed:** Pi supports steering messages (interrupt mid-execution, skip remaining tools) and follow-up messages (queued until natural completion). This enables human-in-the-loop control during long-running agent tasks.

**How vivief covers it today:** effectHandler is a pure function `(state, intent) => result`. It runs to completion. The dual-loop pattern has the human loop (synchronous) and AI loop (asynchronous, draft-only), but neither specifies interruption.

**Assessment:** **Medium priority — model as effects.** An interrupt is an intent: `{ type: ':handler/cancel-requested', target: 'intent:running-analysis-42' }`. The dispatcher checks for cancel intents before dispatching each downstream intent in a cascade. Long-running handlers (LLM calls) check for cancellation via an abort signal. This doesn't require a new concept — it requires specifying how the dispatcher handles cancel intents. Worth documenting as a pattern.

### 3.7 Tool Registration Protocol

**What we observed:** Pi has a typed tool registration: TypeBox schema for parameters, async execute function, optional UI renderer, prompt snippets injected into system prompt. Tools are the interface between LLM reasoning and system capabilities.

**How vivief covers it today:** effectHandler registration is via datoms (`:handler/effect-type`, `:handler/module-path`). But the protocol for what an LLM sees (tool schema, description, when to use it) is not specified.

**Assessment:** **Domain pattern, not concept.** Tool registration for LLM consumption is a specific effectHandler pattern: the handler's Contract defines its input schema (this IS the tool schema), the handler's datoms include `:handler/description` and `:handler/prompt-snippet`. An MCP/tool adapter reads handler datoms and exposes them as LLM tools. This works within existing concepts. Document as a reference pattern.

### 3.8 Configuration (Valves Pattern)

**What we observed:** Open-webui's Valves: every plugin defines a Pydantic model for admin configuration and a separate `UserValves` model for per-user settings. Clean separation of "platform operator settings" vs "end-user preferences."

**How vivief covers it today:** Contract defines validation rules. Handler configuration is stored as datoms. But the admin-vs-user configuration split is not addressed.

**Assessment:** **Contract sub-pattern.** A handler's configurable parameters are datoms with two attribute namespaces: `:config/admin/*` (only admin can write, Contract enforces) and `:config/user/*` (user can write within Contract bounds). Projection's access control (capability tokens + encryption) controls who can read/write which config datoms. This is a pattern within existing concepts, not a new concept.

### 3.9 Conflict Resolution Strategy

**What we observed:** Open-webui uses pycrdt (Yjs-compatible CRDTs) for real-time collaborative note editing. Pi uses append-only JSONL with branching — conflicts resolved by tree structure (siblings, not merges).

**How vivief covers it today:** P2P defines four sub-concepts: agent log, peer validation, peer discovery, sync. The sync sub-concept mentions "multi-writer resolution" but doesn't specify a strategy (CRDTs? last-write-wins? manual merge?).

**Assessment:** **P2P needs refinement.** The datom model's append-only nature plus Autobase's causal DAG provides a foundation, but the conflict resolution strategy for concurrent writes to the same entity/attribute needs specification. Options: (a) last-writer-wins per attribute (simplest), (b) CRDT merge for specific value types (text → Yjs, counters → G-counter), (c) manual merge surfaced to human. The answer likely varies by attribute type — this should be specified as part of P2P's sync sub-concept.

### 3.10 Observability (Cost, Tokens, Traces)

**What we observed:** Pi tracks input/output/cache tokens and cost per session. Open-webui has usage logging and arena-style model comparison. Both treat observability as essential for LLM-centric systems.

**How vivief covers it today:** Datom provides audit trail (every state change is a fact with Tx metadata). But cost tracking, token metering, and performance tracing are not addressed.

**Assessment:** **Covered by Datom — just needs attribute conventions.** LLM invocations produce datoms: `[effect:42, :llm/tokens-in, 1500, tx:N, true]`, `[effect:42, :llm/cost-usd, 0.045, tx:N, true]`. These are queryable via Projection, displayable on Surfaces, aggregatable over time. No new concept needed — Datom's universality handles it. Document attribute conventions for LLM observability.

### 3.11 C4 Model / likeC4 — Contract Subsumes Rules

**What we observed:** C4 has 4 zoom levels. vivief already generates C4 diagrams from effect-domain-rules that aggregate low-level effects into higher-level effects. Meanwhile, Contract validates/constrains effects at runtime. The user's insight: "Rules from the current vivief devac and Contract maybe are overlapping concepts."

**How vivief covers it today:** Two separate mechanisms doing similar things. **Rules** (devac): `low-level effects → pattern matching → higher-level effects → C4 diagram`. **Contract** (vivief-concepts): `effect → constraint check → allow/reject`. Both take effects as input and apply declarative patterns to them.

**Assessment:** **Contract should subsume Rules — concept simplification.** A Contract that says "session-recap must produce themes" is structurally identical to a Rule that says "HTTP calls aggregate into IO.HTTP higher-level effect." Both are: `pattern over datoms/effects → derived knowledge`. If Contract is generalized to include effect aggregation (not just validation), then:

- C4 diagrams are generated from Contracts applied to datoms — always up-to-date
- Runtime validation and architecture documentation share the same source of truth
- Contracts define what transitions are valid at each C4 level (System contracts → Container contracts → Component contracts → Code contracts)
- The C4 zoom pattern IS the Contract hierarchy pattern

This is a **concept simplification**: Contract becomes more powerful and Rules (currently a devac-specific mechanism) disappears as a separate concept.

### 3.12 XState v5 — effectHandler as Actor

**What we observed:** XState v5's formalism is `(state, event) => (state', [actions])`. This is identical to effectHandler's `(state, intent) => (state', [intent'])`. XState adds: (a) the state machine is **visible** — you can explore it in Stately Studio before writing implementation code, (b) the **actor model** — each actor has private state, receives messages, sends messages, can be spawned and stopped.

**How vivief covers it today:** effectHandler defines the formula but doesn't surface the state machine explicitly. There's no visual representation, no way to explore transitions before implementation, no formal actor boundaries between handlers.

**Assessment:** **Two high-value insights:**

1. **effectHandler's state machine should be explicit and visual.** An effectHandler's possible states and transitions can be described as an XState machine definition. This machine definition IS the Contract for that handler — it defines what states exist, what effects trigger what transitions, and what downstream effects each transition produces. Designing the XState machine first (in Stately Studio) and implementing the handler second inverts the current flow and makes logic graspable before code exists.

2. **The actor model answers composition and interruptibility.** Each effectHandler instance is an actor:
   - **Private state**: its Projection view of the datom store (not shared mutable state)
   - **Receives**: effects (messages to this actor)
   - **Sends**: downstream effects (messages to other actors) + datoms (committed to store)
   - **Spawnable/stoppable**: the dispatcher spawns actors for effect handling, can stop them (cancel)
   - **Typed protocols**: the messages an actor accepts are its Contract

   This gives formal answers to:
   - **Composition (3.5)**: actors with typed message protocols replace ad-hoc dispatch priority
   - **Interruptibility (3.6)**: actors can receive `:handler/cancel-requested` messages and clean up
   - **Extensibility (3.5)**: new actors register without modifying existing ones — the actor system handles routing

### 3.13 Storybook — Surface as Testable, Documented Component

**What we observed:** Storybook isolates UI components with controlled props, provides visual regression testing, accessibility scanning (axe), interaction testing (play functions), and serves as living documentation. Each story is: component + controlled inputs → visual output.

**How vivief covers it today:** Surface renders datoms via a Projection. But how Surfaces are developed, tested in isolation, and documented is not specified.

**Assessment:** **Surface + Storybook is a natural composition.** A Storybook story IS a Surface with a fixed Projection over fixture datoms:

```
Story = Surface(Projection(fixture-datoms))
```

This means:
- **Stories test Surfaces** with deterministic datom snapshots as input
- **Accessibility testing** validates Surfaces meet a11y Contracts (axe scanning = Contract applied to rendered Surface)
- **Stories ARE documentation** — they show what each Surface renders for given data states
- **Play functions test interactions** — user clicks produce effects, which the test can assert on
- **Visual regression** catches unintended Surface changes across datom schema evolution

Storybook doesn't require a new concept. It's the development methodology for Surfaces — the same way XState/Stately Studio is the development methodology for effectHandlers. Both use the same vivief concepts (Surface, Projection, Contract, effectHandler) but make them visual and testable before production use.

### 3.14 Visual Thinking — Surface is Broader Than UI

**What we observed:** C4 diagrams, XState visualizations, Storybook stories, flow diagrams, sequence diagrams, mindmaps, force graphs — all make different aspects of the system visible and understandable. The user notes: "these visual concepts used and in particular C4, XState and Storybook all have overlapping concepts to make things understandable using the visual way."

**How vivief covers it today:** Surface is defined as rendering datoms for end users (counseling UI, devac CLI output). System-level visualization is not in scope.

**Assessment:** **Surface applies to system understanding, not just end-user UI.** Everything that makes the system understandable is a Surface over datoms:

| What's Visualized | Surface Type | Datom Source | Projection |
|---|---|---|---|
| Application data (counseling UI) | Stream, Card, Canvas | Clinical datoms | `:client/*`, `:session/*` |
| Application data (devac CLI) | Terminal output | Code graph datoms | `:node/*`, `:edge/*` |
| System architecture (C4) | likeC4 diagram | Contract + effect datoms | C4 level filter (System/Container/Component) |
| System behavior (XState) | Stately Studio | effectHandler definition datoms | Handler-specific state machine |
| Component catalog (Storybook) | Story | Fixture datoms | Per-story Projection |
| Execution flow (sequence diagram) | Mermaid/D2 | Tx history datoms | Time-range + entity filter |
| Knowledge map (mindmap/force graph) | Interactive graph | Entity + relationship datoms | Depth + entity type filter |

The unifying pattern: **a Surface renders datoms through a Projection**. Whether those datoms describe a client's therapy journey or the system's own architecture is irrelevant to the concept. This doesn't add a new concept — it broadens Surface's scope and makes explicit that system documentation is a first-class Surface concern, not an afterthought.

This also connects to the develop/use blur from vivief-concepts §4: the developer viewing a C4 diagram (Surface) of handler registrations (datoms) filtered by domain (Projection) is using the exact same conceptual stack as the counselor viewing a client timeline (Surface) of session datoms filtered by date range (Projection).

## 4. Validation — What the Repos and Tools Confirm

Not everything is a gap. The repos and tools validate several vivief design choices:

| vivief Concept | Validation |
|---|---|
| **Datom (append-only immutable facts)** | Pi's session model is an append-only JSONL tree with branching — essentially datoms for conversation state. Open-webui's mutable CRUD model struggles with history, audit, and branching. Datom is the right foundation. |
| **Reactive subscription** | Open-webui uses Socket.IO pub/sub for real-time updates. Pi uses follow-up message queues. Both implement reactive notification patterns that reactive subscription generalizes cleanly. |
| **Contract (validation rules)** | Open-webui's plugin system has no validation — any Python code can be loaded and executed. Pi has basic permission hooks but no declarative constraint model. Contract provides what both lack. C4's architecture rules and XState's valid-transition definitions confirm that Contract is the right abstraction for "what's allowed." |
| **Projection (query/filter/access)** | Both repos have ad-hoc query patterns. Open-webui has SearchParams objects scattered across endpoints. Pi's resource discovery cascade is a multi-layer filter. Projection unifies these under one concept. |
| **effectHandler (state machine)** | Pi's dual-loop IS the effectHandler pattern. XState v5's formalism `(state, event) => (state', [actions])` is literally the same formula. The pattern independently emerges in LLM agents (Pi), state machine libraries (XState), and vivief — strong validation that it's the right universal abstraction. |
| **Surface (rendering)** | Storybook's `Story = Component(props)` maps directly to `Surface(Projection(datoms))`. The visual tools (C4, XState Studio, Storybook) all confirm that Surface should encompass system visualization, not just end-user UI. |
| **P2P (replication)** | Open-webui is server-only — no offline, no local-first. This is the exact limitation vivief's P2P concept solves. |

## 5. Summary

| # | Challenge | Source | Vivief Today | Assessment | Priority |
|---|---|---|---|---|---|
| 1 | Authorization vs. confidentiality | open-webui | Projection access underspecified | Sharpen Projection access model | **High** |
| 2 | Provider abstraction | Both repos | Not addressed | Domain pattern, not concept | Low |
| 3 | Progressive/streaming values | Both repos | Reactive sub = committed only | Surface handles in-flight streams | **High** |
| 4 | Context management / compaction | pi-mono | Not covered | effectHandler pattern for compaction | **High** |
| 5 | Composition / extensibility | Both repos | effectHandler + Contract | Actor model answers this (see 3.12) | **Medium** |
| 6 | Interruptibility / steering | pi-mono | effectHandler runs to completion | Actor model answers this (see 3.12) | **Medium** |
| 7 | Tool registration protocol | pi-mono | Handler datoms exist | Document as LLM-tool pattern | Low |
| 8 | Configuration (Valves) | open-webui | Contract + datoms | Document as admin/user config pattern | Low |
| 9 | Conflict resolution strategy | Both repos | P2P sync underspecified | Specify per-attribute-type strategy | **Medium** |
| 10 | Observability (cost, tokens) | Both repos | Datom provides audit | Document attribute conventions | Low |
| 11 | Contract subsumes Rules | C4/likeC4 | Rules and Contract separate | Unify: Rules become Contract sub-pattern | **High** |
| 12 | effectHandler as XState actor | XState v5 | Formula matches, not explicit | Make state machine visible + actor model for composition | **High** |
| 13 | Surface + Storybook development | Storybook | Surface not testable in isolation | `Story = Surface(Projection(fixture-datoms))` | **Medium** |
| 14 | Visual thinking as Surface | C4 + XState + Storybook | Surface = end-user UI only | Surface applies to system understanding too | **Medium** |

**5 high-priority items** that could make concepts cleaner:
1. Authorization model (Projection access control)
2. Streaming/progressive values (Surface refinement)
3. Context management (compaction as effectHandler pattern)
4. **Contract subsumes Rules** — concept simplification, C4 and runtime validation share source of truth
5. **effectHandler as explicit XState actor** — visible state machines, actor model for composition + interruptibility

**4 medium-priority items** to specify during development:
6. Composition via actor message protocols (replaces dispatch priority question)
7. Cancellation via actor lifecycle (stop/cancel messages)
8. P2P conflict resolution strategy per attribute type
9. Surface + Storybook as development methodology (stories = Surfaces with fixture Projections)
10. Surface scope broadened to include system visualization (C4, XState, sequence diagrams)

**4 low-priority items** are domain patterns within existing concepts — document when implementing.

## 6. Key Insight: The Visual Triangle

C4, XState, and Storybook each make a different vivief concept **visible and explorable**:

| Tool | Makes Visible | vivief Concept |
|---|---|---|
| **C4 / likeC4** | Architecture at multiple zoom levels | Contract (as hierarchical effect aggregation) + Surface |
| **XState / Stately Studio** | State machine logic and transitions | effectHandler (as explicit state machine) + Contract (valid transitions) |
| **Storybook** | UI components with controlled inputs | Surface (with fixture Projection) + Contract (a11y validation) |

The overlap: all three are **Surfaces over datoms, constrained by Contracts**. This validates that the 5 concepts are the right primitives — the visual tools compose from them rather than requiring new concepts. The opportunity is making this composition explicit so the concepts reinforce each other instead of existing in parallel.

## 7. References

- `docs/vision/vivief-concepts.md` — the concepts being challenged
- `docs/spec/counseling/vivief-concepts-vs-nats.md` — reactive subscription gap analysis
- [open-webui](https://github.com/open-webui/open-webui) — v0.6+, FastAPI + Svelte
- [pi-mono coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) — TypeScript, ~30-hook extension model
- [XState v5](https://stately.ai/docs/xstate) — state machine + actor model
- [Storybook](https://storybook.js.org/) — UI component isolation + testing
- [likeC4](https://likec4.dev/) — C4 architecture diagrams with interactive React output
