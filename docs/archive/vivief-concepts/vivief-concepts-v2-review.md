# vivief-concepts-v2 — Review

> Three angles: concepts as a conceptual system, paradigm fit for human+AI+deterministic work, and senior developer trade-offs.

---

## 1. Executive Summary

The five concepts form a genuinely coherent conceptual system. They're not a taxonomy — they compose. A Datom is fact, a Projection is how you see facts, a Surface is how you render what you see, a Contract is what constrains all three, and an effectHandler is how you transition between states. That's a complete loop. The concepts have real internal consistency: trust is threaded from Datom provenance through Projection filtering through Surface signals through Contract enforcement without breaking the thread. The creation loop is elegant and genuinely expressive as a thesis, not just as a description.

The gap to implementation is real but mostly appropriate. Most of what's missing is implementation decisions deliberately deferred — storage choice, actor runtime protocol, query syntax specifics. However, four things are underspecified at the concept layer itself, not just the implementation layer: how trust scores are assigned, what makes a Contract active or superseded, who wires a Surface to a Projection, and what happens when a handler fails. These four gaps need to be closed in the concepts before any implementation starts. Everything else is a matter of building on a solid foundation — the concepts are ready to guide the first phase of implementation today.

---

## 2. The Concepts as a Conceptual System

### Datom

**What it does well.** Minimal, self-describing, provenance-first. The `[Entity, Attribute, Value, Tx, Op]` tuple is well-chosen: it carries enough to be self-contained without carrying implementation specifics. The decision to store provenance as datoms (`[:tx/source`, `:tx/trust-score`) rather than as metadata is the right architectural move — it makes trust queryable, aggregatable, and auditable through the same mechanisms as everything else. Schema-as-datoms is elegant: schema evolution is just datom assertion, and schema history is just the datom log.

**Where the concept is incomplete.** Trust score assignment is the key gap. The document says `:tx/trust-score` "is set at ingestion" and the implementation KB lists a default rule (`min(source_trusts)` for derived content). But for originating content — what rule sets 0.85 vs 0.9 vs 1.0 for an AI actor? Is it declared by actor type (all `:ai/opus-4` writes get 0.85)? Computed from Projection scope? Asserted by the effectHandler that produced the datom? Currently the concept implies "someone decides" without defining who or how. This is a conceptual gap, not an implementation detail.

**What's genuinely novel.** Provenance as a first-class datom rather than metadata or out-of-band audit log. In virtually every system, provenance is bolted on — log tables, audit fields, event sourcing side channels. Here it's native: trust is queryable through the same Projection mechanism, displayable through the same Surface rendering, enforceable through the same Contract system. That's not incremental — it's a different architecture.

---

### Projection

**What it does well.** The three delivery modes (snapshot/live/replay) are clean and well-distinguished. The trustThreshold field is an elegant solution to a hard problem: LLM context contamination by low-quality data without a separate filtering layer. The `freshness: "in-flight"` dimension for streaming is necessary and correctly placed — it's a Projection property, not a Surface property.

**Where the concept is incomplete.** Projection is doing a lot: query language, access control, encryption scope, subscription handle, trust filter, and delivery protocol. The document claims this is "Lens + Seal merged" — a deliberate unification. The question is whether this is principled unification or conceptual conflation. The case for unification: all five dimensions are answers to the same question ("what datoms can this actor see and how?"). The case for conflation: `delivery: "live"` and `capability: CapabilityToken` are solving different problems (streaming vs authorization) that have different failure modes and different lifecycle concerns.

The deeper gap at concept level: `delivery: "live"` is described as "Current state + future matching datoms. This IS reactive subscription." — but the concept says nothing about what happens when a live Projection's subscription is interrupted, when the underlying datom stream is compacted, or how long a live Projection persists. The implementation KB marks this as an implementation decision, but subscription lifecycle is actually a concept-level question: is a live Projection stateful? Can it be paused? Who owns its lifecycle?

**What's genuinely novel.** `trustThreshold` as a Projection field — not a query predicate, but a scope-level filter — is a clean primitive. It prevents trust contamination at the right abstraction level: not in the query, not in the handler, but in what the actor is allowed to see. That's the right place.

---

### Surface

**What it does well.** Six modes are clear, well-distinguished, and cover the actual surface space: stream (activity), card (record), canvas (document), dialog (conversation), board (grouped view), diagram (system view). The mapping is earned — each mode has a natural input type and a natural output, and they don't obviously overlap. Trust signals in rendering are a necessary concept and correctly placed in Surface rather than in Projection.

**Where the concept is incomplete.** The concept-level gap is wiring: who connects a Surface to a Projection? The actor runtime section shows a `DialogSurfaceActor` consuming a Projection, but how a Surface knows *which* Projection to consume is unnamed. Is there a binding declaration? Is it wired by the effectHandler that spawns them? Is there a concept for this? In every concrete usage scenario in the document, the connection is implied — and that implication is the gap.

This is not a trivial wiring detail. The answer determines a lot: can one Surface consume multiple Projections? Can a Projection feed multiple Surfaces? When a live Projection updates, how does the Surface know? The wiring model is conceptually prior to all of those questions.

**What's genuinely novel.** The `Diagram` mode rendering "Contract + effect datoms" as architecture diagrams is not obvious. The insight that C4 diagrams, XState visualizations, and Storybook stories are all Surfaces over datoms constrained by Contracts — the "visual triangle" section — is genuine. It makes tool integration a concept-level property of the system, not an integration chore.

---

### Contract

**What it does well.** Three modes × three temporal points × six sub-types is a lot of structure, but it's earned — each combination is meaningful and produces a different enforcement behavior. The unification of spec + test + runtime guard into one concept is the right call. In most systems these are three separate layers (documentation, test suite, validation library) that drift apart. Making them one declared artifact with one lifecycle is architecturally correct.

The Contract defaults lifecycle (`:default` → `:domain-refined` → `:experience-refined` → `:locked`) is one of the document's strongest concepts. Configuration that tracks its own evolution through the datom log is not just clever — it closes a real problem: configuration that was once deliberate but becomes invisible over time.

**Where the concept is incomplete.** The Contract lifecycle is the key gap. The document describes what Contracts *declare* and how they *validate*, but not what it means for a Contract to be active, superseded, or in conflict. In a system with six Contract types that can all evolve as datoms, you will inevitably have:

- A Schema Contract at tx:1 and a revised Schema Contract at tx:200 — which is authoritative?
- A Trust Contract and a Schema Contract that disagree about the same attribute — which wins?
- A Contract that was locked and then someone asserts a new version — is the lock respected?

None of these questions have a conceptual answer. The document says "Schema evolution IS Contract evolution — adding an attribute = asserting a new Schema Contract" but doesn't define what "supersedes" means. This is a concept-level gap: Contract state (asserted, active, superseded, conflicted) is not defined.

**What's genuinely novel.** Guard + Aggregation + StateMachine as three modes of the same concept rather than three separate concepts is genuinely new. In most systems, validation rules, derived facts, and state machines are three separate subsystems that interact awkwardly. Making them modes of the same declared Contract — each with the same temporal points, same datom-based lifecycle, same provenance — is a real conceptual contribution. Cultural Contracts using the same in-flight mechanism as clinical guardrails is elegant: the concept is general enough to hold both.

---

### effectHandler

**What it does well.** The function signature `handler(state, effect) => { datoms, effects }` is conceptually airtight: pure, testable, composable. The two-level model (function vs actor) is the right distinction — it gives a simple path for simple cases and a full actor model for cases that need identity, lifecycle, and message queuing. The context compaction handler as a named pattern for LLM context management is important and correctly placed at the handler level.

**Where the concept is incomplete.** The failure model is absent at the concept level. The document defines what a handler produces on success — datoms and effects. It does not define what happens on failure: is failure a datom? An effect? A special error channel? What does the system do when a handler throws? When an actor crashes mid-stream?

This is not just an implementation question. The answer determines:
- Whether failures are auditable (if failure is a datom, yes; if it's an exception, no)
- Whether the creation loop's escalation mechanism can distinguish "handler produced nothing" from "handler crashed"
- Whether a Behavior Contract can specify failure behavior

The fix escalation section (auto → AI → human) implies handlers can fail and the system routes failures forward — but the concept doesn't specify what a "failure" looks like in the datom model.

**What's genuinely novel.** Nothing in the function signature is new — it's Elm/Redux with explicit datom typing. What's novel is the composition: this specific function signature, constrained by a Behavior Contract with XState, producing datoms into a store with provenance, with a two-level model that handles both pure functions and stateful actors. That combination isn't found elsewhere.

---

## 3. Conceptual Completeness vs. Implementation Gaps

### A. Concept-level gaps — must be resolved before implementation

These are unclear at the concept layer itself. No implementation choice will resolve them — they require a conceptual answer first.

| Gap | Why it's concept-level | What needs to be defined |
|-----|------------------------|--------------------------|
| **Trust score assignment** | Sets the rules by which datoms get their trust score at origination — not derivation | Is trust assigned by actor type? By Projection scope? By the handler that produced the datom? What's the rule for `:human` vs `:ai/opus-4` vs `:system/devac`? |
| **Contract lifecycle** | Defines what it means for Contracts to coexist, supersede, or conflict | Active / superseded / conflicted state. What happens when two Schema Contracts disagree about the same attribute? What does "locked" mean when a new version is asserted? |
| **Surface → Projection wiring** | Determines the conceptual model for binding consumers to sources | Named concept for Surface–Projection binding. Whether one Surface can consume multiple Projections. Who is responsible for the binding. |
| **effectHandler failure model** | Determines whether failures are auditable and how escalation works | Is failure a datom? An effect? How does the creation loop distinguish "handler produced nothing" from "handler crashed"? |
| **Schema evolution mechanics** | Determines what happens to existing datoms when a Schema Contract changes | Is old datoms' validity retroactively changed? Are they migrated? Is there a migration Contract? |

### B. Implementation decisions deferred by design — appropriate gaps

These are deliberate conceptual deferrals. They're not weaknesses — they're the right things to leave to implementation.

| Deferred decision | Why it's appropriate to defer |
|-------------------|-------------------------------|
| Storage layer (DuckDB vs Hyperbee vs both) | The Datom concept is storage-agnostic; the implementation KB's phase 1 decision is correct to defer this |
| Actor runtime protocol (Protomux specifics) | The actor runtime section correctly describes behavior without specifying wire protocol |
| Concrete Projection query syntax (`DatomQuery` type) | The Projection concept correctly specifies semantics without specifying syntax |
| Trust key derivation cryptographic specifics | Trust Contract describes roles and rules; PBKDF2/HKDF specifics are implementation |
| Conflict resolution algorithm (CRDT specifics) | Sync Contract correctly specifies *what* to resolve (text/scalar/ref) without specifying *how* |
| Subscription protocol for `delivery: "live"` | Live delivery semantics are defined; wire protocol is correctly an implementation choice |

### C. Missing conceptual bridges — gaps between concepts

These fall between concepts, where two concepts interact in a way the concepts themselves don't specify.

| Missing bridge | Which concepts | What's unclear |
|----------------|----------------|----------------|
| **Schema evolution → existing datoms** | Datom + Schema Contract | When a Schema Contract changes, what is the status of datoms that were valid under the old Schema but not the new? No migration concept is defined. |
| **Trust Contract vs Schema Contract conflict** | Contract + Contract | Both can constrain attributes. If a Trust Contract says "`:client/ssn` is encrypted-only" and a Schema Contract says "`:client/ssn` is required", and the encryption key isn't available — which Contract wins? |
| **Sandbox promotion mechanics** | Projection + Contract | Promotion is described as "re-assert without the sandbox prefix + `:tx/promoted-from`". But the concept of what makes a sandbox "clean enough to promote" (what contracts must pass? who approves?) is not defined at concept level. |
| **Contract + Cache invalidation** | Contract + Creation | When a Contract evolves, "all affected cached creations invalidate." But which cached creations are "affected"? The link from a Contract change to a cache invalidation set is not defined. |

---

## 4. Paradigm Evaluation — Human + AI + Deterministic System

### Strengths

**Trust as a first-class dimension, not a security layer.** Most systems treat security as a permission check at API boundaries. Here, trust is an attribute of every fact, flows through every Projection, constrains every Surface, and is enforced by every Contract. An AI actor can't accidentally leak a low-trust datom into a high-trust context — the Projection's trustThreshold makes that structural. This is the right architecture for a system where AI actors are first-class participants.

**The creation loop as a universal pattern.** The loop works identically for a counselor dictating a session note, an AI analyzing code, and a CI pipeline running tests. The trust strategy (authoritative / gated / sandboxed) is the *only* thing that varies. This is not just conceptually elegant — it means every developer who understands the loop understands every use case. That's a real cognitive economy.

**Contracts collapse spec + test + guard.** In the human+AI collaboration model, this is load-bearing. An AI acting on a Behavior Contract is constrained at concept level, not by an ad hoc system prompt or an informal convention. A clinical guardrail is a formal Contract with temporal points — the AI can't produce a clinical diagnosis because the in-flight Contract rejects it, not because someone remembered to add a disclaimer to a prompt.

**Projection(live) as the reactive primitive.** The choice to make reactive subscription a delivery mode of Projection — not a separate pub/sub layer — is correct for AI agents. An LLM context window loading as a snapshot Projection and an AI agent subscribing as a live Projection are the *same concept* at different delivery modes. That unification is meaningful.

**Context compaction as a named architectural pattern.** Most teams that use LLMs encounter the context window problem and solve it ad hoc. Naming it — `(state, :effect/compact) => { datoms: [summary-datom], effects: [] }` — and giving it a first-class place in the effectHandler model is genuinely new. It makes LLM context management an architectural concern, not an operational hack.

**Sandbox as Projection scope.** No separate infrastructure means AI experimentation costs nothing to set up. The sandbox is the same concept the human uses for a git branch — just scoped to a Projection namespace. This is the right way to give AI actors room to work without risk.

### Weaknesses

**"Everything is a datom" risks over-abstraction.** Datomic's history shows this path: eventually you discover that some things — large binary content, streaming media, real-time sensor data, high-frequency logs — are better expressed as external storage with metadata datoms. The concept handles this via the bridge pattern, but the bridge is underspecified at concept level (section 3C). The risk is that an implementation team takes "everything is a datom" literally before the bridge concept is fully defined, and builds storage architecture that has to be undone.

**Projection is overloaded.** It carries: query semantics, access control, encryption scope, subscription handle, trust filter, and delivery protocol. The document argues this is "Lens + Seal merged" — deliberate unification. But these dimensions have different failure modes, different lifecycle concerns, and different modification rules. Access control changes require different handling than query changes. Subscription lifecycle is different from snapshot retrieval. The unification is intellectually clean but the concept may be too large to implement incrementally. A developer building Projection(snapshot) will be surprised how much of the Projection interface is irrelevant to their case — and a developer building Projection(live) will need much of what the snapshot developer never touches.

**No entry point for a small feature.** The five concepts presume you're designing the whole system or at least a complete slice: Datom → Projection → Surface → Contract → effectHandler is a complete stack. A developer who wants to add a single field to a form needs to think about all five. There's no concept of "a small thing that lives entirely within one concept." The implementation KB's phase ordering helps with build sequence, but a small-feature path through the *conceptual* model is missing.

**The relationship between Contract and Test is implicit.** The document says "Contract = spec + test + guard" and "Storybook stories = Contract verification." But how do you know when a Contract is *complete*? Can you have a Behavior Contract that accepts effects but has no stories and no StateMachine? There's no concept of Contract coverage — no way to reason about whether the Contract says enough.

**The LLM integration is architecturally sound** — the LLM is another actor, its output is gated by trust level, its context window is a Projection, its decisions are datoms. This is the correct model. It doesn't require special infrastructure for AI — just the same Contracts with the right trust strategies. That's the strongest validation of the paradigm fit.

---

## 5. Senior Developer: What You Gain

These are gains at the *concept level* — before any implementation technology is chosen.

**One mental model replaces many.** A senior developer who adopts these concepts doesn't need to separately reason about: access control (Projection Contract), reactive state management (Projection live), event sourcing (Datom log), feature flags (Sandbox as Projection scope), AI supervision (gated trust strategy), observability (LLM invocation as datoms), and audit logging (provenance on every transaction). All of these are instances of the same five concepts. The cognitive compression is real.

**The creation loop tells you how to build anything.** Most development frameworks tell you where to put code and how to structure data. The creation loop tells you *how to think about building a feature*: what's the intent, what Contract governs it, who creates (human/AI/system), what validates, what does failure look like, how does escalation work. That's a framework for reasoning about features, not just organizing code.

**History and replay are free.** An immutable Datom log with `delivery: "replay"` means full system history, time-travel debugging, and causation tracing are structural properties, not features that have to be built. The cost is paid once in storage design; the benefit recurs across every feature.

**AI behavior is specifiable, testable, and auditable.** This is the gain that matters most for AI-collaborative systems. A Behavior Contract on an LLM handler specifies what effects it accepts and what attributes it must produce. An in-flight Contract validates its streaming output. Its decisions are datoms with `:tx/source :ai/opus-4` and a trust score. A future developer auditing why the system did something has a complete picture — not just the output, but the actor, the trust level, the Contract that governed it, and the provenance of every fact it consumed.

**Security is architectural, not library-level.** A developer cannot add a new feature path without making trust explicit. The Projection requires a capability token. The Contract defines the trust threshold. The Surface requires trust signals when rendering low-trust content. Security is not an afterthought — it's structural in the concept model. A code review catching a security issue becomes "you violated a Contract" rather than "you forgot to validate this field."

---

## 6. Senior Developer: What You Lose or Risk

These are trade-offs at the *concept level*.

**Partial adoption is not an option.** The five concepts form a closed system. A complete feature needs Datoms (facts), a Projection (how to read them), a Surface (how to render them), likely a Contract (what constrains them), and an effectHandler (how to produce them). There's no "just use the Datom layer" path. A developer who wants to add a simple notification feature will encounter all five concepts before they can ship. The concepts don't compose partially — they compose completely or not at all.

**Familiar patterns don't map cleanly.** REST endpoints, SQL queries, Redux stores, GraphQL subscriptions — none of these map directly onto the five concepts. They have rough equivalents (a SQL query ≈ a snapshot Projection, Redux action ≈ an effect, a GraphQL subscription ≈ a live Projection) but the mapping requires conceptual re-translation, not skill transfer. A senior developer who is expert in React + REST + PostgreSQL will need to unlearn their instincts before adopting these concepts, not just learn new syntax.

**The mental model is non-mainstream.** The Datom model is Datomic-inspired. Datomic is excellent and well-designed, but it's uncommon. The concepts assume a non-mainstream mental model as baseline. Hiring, onboarding, and code review all have a higher floor. A developer who doesn't understand EAV stores, immutable logs, and provenance-first data modeling cannot contribute meaningfully until they do.

**Junior developers cannot ramp up incrementally.** Because the concepts don't compose partially, there's no incremental contribution path for someone new. A junior developer can't implement one handler without understanding how it fits into the creation loop, what Contract governs it, and how its output becomes datoms. The abstraction barrier is high and uniform.

**There is no escape hatch.** The concepts don't define what you do when they don't fit. What happens when you need a high-throughput, low-latency event stream where datom-level provenance is too expensive? What happens when a third-party library produces side effects that don't fit the effectHandler model? The concepts are totalizing — which is a strength (coherence) and a risk (brittleness at the edges).

**The "all creation follows one loop" thesis may be too totalizing.** Some things are better as stateless transformations — a pure function that formats a date doesn't need a creation loop, a trust strategy, or a Contract. The concepts acknowledge this ("not everything must have a Contract") but don't define a conceptual boundary between "this is creation" and "this is a utility." Without that boundary, the tendency will be to model everything as creation — including things that are better as simple functions.

---

## 7. What's Genuinely Novel (Worth Protecting)

Not incremental improvements to existing patterns, but new conceptual primitives:

**Redaction as compute-access vs. display-access.** A Projection Contract can allow `:client/ssn` for computation while forbidding it from any Surface. This distinction — the right to *process* data vs. the right to *display* it — is not available as a first-class primitive in any common framework. It's usually handled by ad hoc application code or complex RBAC rules. Here it's a one-field declaration on the Projection Contract.

**Contract defaults lifecycle** (`:default` → `:domain-refined` → `:experience-refined` → `:locked`). Configuration that tracks its own evolution through the datom log. The insight that configuration refinement is just datom evolution, and that the "why" of every configuration change is auditable through `:tx/why`, closes a real gap. This is worth specifying precisely and protecting carefully.

**Sandbox as Projection scope.** The equivalence of "AI sandbox" to "scoped Projection namespace + promotion Contract" means AI experimentation needs no dedicated infrastructure — it's just a naming convention plus a Contract. That's a conceptual economy that produces a real implementation economy.

**Context compaction as a named architectural pattern.** LLM context window management as `(state, :effect/compact) => { datoms: [summary-datom], effects: [] }` — a named, first-class handler type — is new. Giving it a canonical form makes it designable and contractable, not just operational.

**Trust score as a flowing datom attribute.** Trust propagation (derived content inherits `min(source_trusts)`) without a separate trust infrastructure layer. Trust flows through the same datom log as everything else, filtered by the same Projection mechanism, displayed by the same Surface rendering. That integration is not found in standard architectures.

**Creation loop with escalation** (auto → AI → human). A universal three-strategy pattern for any creative act, composable as a StateMachine Contract with max retries and timeout. The insight that code linting auto-fix, AI-assisted session note drafting, and CI failure remediation all follow the same loop is genuinely unifying.

---

## 8. Opportunities to Improve the Concepts

At the concept layer, before implementation begins:

**1. Trust score assignment rule.** Define a conceptual model for how scores are assigned at origination (not derivation). Is it: (a) actor-type-default (`:human → 1.0`, `:ai/model → 0.85`, `:web/scraped → 0.4`), (b) handler-declared (the effectHandler that produces a datom asserts its score), or (c) Projection-scoped (the Projection through which data enters sets the floor)? All three are reasonable; any one of them closes the gap. Currently the concept implies assignment happens without defining the rule.

**2. Contract lifecycle.** Define four Contract states: *asserted* (declared), *active* (in use), *superseded* (replaced by a later version), *conflicted* (two active Contracts disagree). Define what happens at each state transition and which Contract wins when two active Contracts disagree about the same attribute. This is a small conceptual addition that prevents a large class of implementation ambiguity.

**3. Surface → Projection wiring.** Name the binding. Whether it's a Binding Declaration, a Surface parameter, or something else — the concept needs a name for the relationship between a Surface and the Projection it consumes. Without a name, the wiring is implicit and every implementation will invent its own convention.

**4. effectHandler failure model.** Define failure as a datom. When a handler fails, it produces `[:effect/failed :handler/name "reason" tx:N true]` — or some equivalent. This makes failures auditable, makes escalation formally possible, and makes the creation loop's "fix" path conceptually complete. Without this, the escalation StateMachine can't distinguish "handler produced nothing" from "handler threw."

**5. Schema evolution.** Define what happens to existing datoms when a Schema Contract changes. Three options, all defensible: (a) old datoms retain their validity under the Schema version at their tx; (b) schema changes trigger a migration handler that produces new datoms; (c) old datoms are marked with a schema-version reference. Pick one and name it. Currently the document says "adding an attribute = asserting a new Schema Contract" without defining what happens to pre-existing datoms under the old schema.

**6. Small-feature path.** Add a conceptual "entry point" for a developer implementing something small: a feature that uses two or three concepts without requiring all five. This doesn't weaken the complete model — it gives developers a minimum viable slice. The implementation KB's phase ordering gets close, but a *conceptual* description of the minimal slice (Datom + Schema Contract + effectHandler function, with no Projection or Surface) would help adoption.

**7. Contract coverage.** Define what makes a Contract complete. A Behavior Contract with no stories and no StateMachine is valid by the current concept — but is it useful? Define a minimum completeness criterion: a Contract with only `accepts` and `produces` is a *stub*; a Contract with at least one story or one StateMachine transition is *verifiable*. This closes the gap between "Contract as declared artifact" and "Contract as useful spec."

---

## 9. Starting Recommendation — Concept-First Implementation Order

This order respects concept dependencies and surfaces the concept-level gaps at the earliest possible point, so they can be resolved before they become implementation debt.

**Phase 1: Datom + Schema Contract**

The foundation. Validates the storage choice. Forces resolution of the trust score assignment gap — you can't implement `:tx/trust-score` without knowing who sets it. Validates the schema-evolution mechanics before anything depends on them.

**Phase 2: Projection(snapshot)**

Read-only queries with access control. Validates the query model without streaming complexity. Validates the capability token model. Does not require the wiring concept — snapshot Projections can be constructed explicitly by a handler without a binding concept.

**Phase 3: effectHandler (function level)**

Pure handlers: `(state, effect) => { datoms, effects }`. Validates the function signature against the real datom model from Phase 1. Forces definition of the failure model — a function-level handler that fails must produce something, and that something needs to be a concept.

**Phase 4: Surface(Card)**

Simplest renderer. One entity, one view. Validates the Projection → Surface pipeline. Forces resolution of the wiring concept — even a simple Card Surface needs to know *which* Projection to consume. This is the earliest point at which the wiring gap becomes a blocker.

**Phase 5: Contract(Guard, pre-commit)**

First runtime enforcement. Pre-commit Schema Contract validation. Validates the Contract enforcement model before adding delivery or streaming complexity. Forces resolution of the Contract lifecycle question — what happens when a pre-commit Guard rejects a datom?

**Phase 6: Projection(live) + effectHandler(actor)**

Reactive subscriptions and stateful actors. Builds on the validated snapshot model. Forces resolution of the live Projection subscription lifecycle.

**Phase 7: In-flight Contract + Dialog Surface**

Streaming with validation. Builds on live Projection. Forces resolution of how in-flight failure propagates to the Surface.

Everything after Phase 7 — Trust Contract, Sync Contract, sandbox, cache, context compaction — builds on a foundation that has been validated at every concept-level gap point.

---

*Review document. Written against vivief-concepts-v2.md. Covers: concepts as a conceptual system (§2), concept-level vs. implementation-level gaps (§3), paradigm fit for human+AI+deterministic work (§4), senior developer gains and losses (§5–6), novel primitives worth protecting (§7), concept improvements (§8), and concept-first implementation order (§9).*
