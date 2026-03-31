# vivief-concepts-v6 — Review

> Implementation readiness, conceptual evaluation, paradigm assessment, and improvement opportunities. First review covering both vivief-concepts-v6.md and vivief-concepts-v6-implementation-kb.md as a paired set.

---

## 1. Executive Summary

**Implementation readiness verdict: Yes.** The concepts are complete enough to begin implementation. Everything needed for foundation phases 1-5 was already specified in v3, refined in v4, trimmed in v5, and remains unchanged in v6. The v6 additions (Intent formalization, enforcement strategy, implementation strategy, skills as pattern) are all extensions that enrich later phases without blocking foundation work. The implementation KB provides a sound phasing plan with dependencies and a decision framework for technology choices.

**The two-gap thesis is correct.** The skills brainstorm's finding — that "skill" wasn't a missing concept but a lens revealing two deeper gaps (Intent unformalized, enforcement underspecified) — is the most intellectually honest moment in the v1-v6 evolution. Rather than adding a 6th concept or forcing skills into the model, v6 closes the gaps and lets skills emerge naturally. This is the kind of discovery that validates a conceptual model: external pressure reveals not what's missing from the framework but what the framework hadn't yet articulated about itself.

**v6 as an additive revision was the right call.** After v5's aggressive trim (857 → 605 lines), v6 adds ~90 targeted lines (605 → 696) to close specific identified gaps. This is surgical, not expansionary. The implementation KB grows modestly (~40 lines) to accommodate enforcement strategy architecture, exposure wrapping patterns, and the knowledge evolution path with devac evidence. The rhythm of trim-then-targeted-add is healthy.

### Strengths

- **Five concepts, six iterations, zero additions.** The strongest signal that the conceptual model is correctly factored. The skills brainstorm explicitly stress-tested the boundary and concluded it holds.
- **The enforcement strategy resolves a real ambiguity.** v5's "A Contract declares, an effectHandler enforces" left unclear which handler enforces. v6's trust-boundary heuristic and per-sub-type defaults give implementable guidance.
- **The implementation KB as companion document works.** The separation of "what and why" (concepts) from "how to decide" (KB) prevents the concepts document from accumulating technology details while still providing implementation teams with a starting framework.
- **Concrete evidence from devac.** The M1-M4 quality rules improving composite scores from 28% to 68%, and the plugin architecture demonstrating exposure wrapping, ground the concepts in working code rather than pure theory.

### Concerns

- **The deterministic-first loop remains the biggest unvalidated claim.** The loop (LLM observes patterns → proposes rules → human reviews → system enforces) is intellectually compelling but untested in practice. The devac M1-M4 evidence validates "structured rules improve LLM output" but not the full loop of LLM-proposed-rules-becoming-system-enforcement.
- **Total cognitive surface area across both documents is substantial.** 696 + 555 = 1,251 lines. Five concepts, six patterns, six Contract sub-types, three modes, three temporal points, four delivery modes, four implementation strategies, three trust strategies, three slices, three anti-patterns, four enforcement strategies, four Contract default states, five onboarding states. The compression is real but the compressed representation is large.
- **The implementation KB frames decisions but makes none.** This is by design — but after six iterations of concept refinement, the project risks perpetual "deciding how to decide" without committing to a technology stack and building.
- **Two documents to cross-reference.** The paired structure adds navigational overhead. A reader evaluating enforcement strategy must now consult §2.4 in concepts (what) and §5 in KB (how). Prior to v5 this was contained in one document.

### The single most important observation

After six iterations, two formal trims, four brainstorms, and three prior reviews, the concepts have reached the point of diminishing returns on further refinement. Every gap identified in reviews has been closed. Every stress test (skills brainstorm, counselor walkthrough, developer walkthrough) has been absorbed without adding a concept. The risk is no longer "the concepts are incomplete" — it's "the concepts have never been implemented." The highest-value next step is not v7 but phase 1.

---

## 2. v4 Review Gap Closure Scorecard

The v4 review identified 15 improvement opportunities. This is the first formal accounting since then — covering both v5 and v6 resolutions.

### A. Structural opportunities (v4 review §9A)

| # | Opportunity | Resolution | Status |
|---|------------|-----------|--------|
| 1 | **Reading guide using conceptual slices** | v5 added reading guide at top: Fact/Feature/Full reading with section references. v6 preserves it with updated section numbers (§9, §11 instead of §8, §12). | **Closed in v5** |
| 2 | **Implementation phase mapping for v4 additions** | v5 created the implementation KB as a companion document with 20+ phases, dependencies, and concept connections. v6 extends with enforcement and exposure wrapping architecture patterns. | **Closed in v5, extended in v6** |
| 3 | **Contract decision tree as first-class artifact** | v5 added decision tree in §2.4: Safety/trust? → Behavior+Trust. Data entering store? → Schema. Surface showing data? → Render. Medium boundary? → Bridge. None? → No Contract needed. | **Closed in v5** |
| 4 | **Operations as creation of understanding** | v5 added "Operations as Creation of Understanding" subsection in §3: monitoring = live-persistent Projection, alerting = Guard Contract, incident response = escalation StateMachine, status reports = scheduled creation. | **Closed in v5** |

### B. Concept-level refinements (v4 review §9B)

| # | Opportunity | Resolution | Status |
|---|------------|-----------|--------|
| 5 | **Model evolution and deprecation** | v5 switched from specific models (`:ai/opus-4`) to capability categories (`:ai/text-generation`). Schema evolution pattern (additive by default) applies to model changes. New models start at `:default` trust and refine through experience. | **Closed in v5** |
| 6 | **Operational Projection patterns** | Named operational factory functions (`Projection.health()`, `Projection.alerts()`, `Projection.audit()`) not explicitly added. The three named profiles (snapshot, live, stream) cover mechanics but not operational semantics. | **Open — deferred to implementation** |
| 7 | **Domain composition rules** | v5 made domains explicitly exclusive per deployment: "one domain active, not composable. Cross-domain composition is a future extension." | **Closed in v5** |
| 8 | **Creation loop exit conditions** | v5 added `:creation/abandoned` terminal state with provenance (`:creation/abandoned-by`, `:creation/abandoned-reason`). | **Closed in v5** |

### C. Documentation refinements (v4 review §9C)

| # | Opportunity | Resolution | Status |
|---|------------|-----------|--------|
| 9 | **Concept count discipline with explicit pattern naming** | v5 added "Concept vs. pattern" paragraph in §1 Core Thesis. v6 extended the pattern list to include "skill" and added the pattern composition table in §3 with all six patterns. | **Closed in v5, reinforced in v6** |
| 10 | **Glossary organization** | v5 reorganized glossary by concept: Datom terms, Projection terms, Surface terms, Contract terms, effectHandler terms, Cross-cutting terms. Trimmed to ~30 entries (from 54). | **Closed in v5** |
| 11 | **Example-driven validation (developer walkthrough)** | v5 added "A Day in Creation — The Developer's Perspective (Feature Slice)" walkthrough showing schema addition, handler writing, validation, and error fixing. System walkthrough dropped in favor. | **Closed in v5** |

### D. Verification scenarios (v4 review §9D)

| # | Opportunity | Resolution | Status |
|---|------------|-----------|--------|
| 12 | **Onboarding bootstrap** | Implementation KB §8 defers self-documentation domain until team grows beyond concept authors. Bootstrap problem naturally sequenced by team growth — initial builders hold full concept model. | **Addressed by deliberate deferral** |
| 13 | **Domain conflict** | Resolved by making domains exclusive per deployment. Cross-domain conflicts eliminated by design. Intra-domain conflicts handled by existing Trust-over-structure rule and Contract lifecycle. | **Addressed by domain exclusivity** |
| 14 | **Deterministic-first degradation** | v6 implementation KB §6 describes the full refinement cycle: false positive detected → current rule superseded → LLM observes pattern → proposes refined rule → review → validate → activate. Old rule remains in log for audit. | **Closed in v6** |
| 15 | **Export template accuracy** | Implementation KB §8 defers export/migration templates. The deferral is explicit and well-reasoned — portability proof, not runtime requirement. | **Addressed by deliberate deferral** |

**Scorecard summary:** 11 of 15 fully closed (10 in v5, 1 in v6). 1 open (operational Projection patterns). 3 addressed by deliberate deferral. Zero items regressed or were ignored. This is a clean scorecard.

---

## 3. What v6 Adds — Evaluation

### 3.1 Intent Formalization

**Assessment: Clean and correct.** Intent was the only word in the creation loop diagram (`Intent → Contract → Create → Validate`) that didn't map to a concept. Naming it as the `effect` parameter entering the creation loop is the simplest possible resolution — it formalizes without adding. The additional structure (what-to-create, for-whom, at-what-depth as datom attributes) gives Intent enough shape to be implementable without over-specifying.

**One observation:** The compact formulation `effect (Intent) → Contract(effectHandler) → datoms` coexists with the full loop diagram showing failure and escalation. This is good — the compact form aids recall while the full form handles edge cases. However, the two formulations emphasize different things: the compact form centers the Contract-governed handler relationship; the full form centers validation and failure. Neither is wrong, but a reader comparing them must reconcile the emphasis difference. The current placement (compact in §1, full in §3) handles this adequately through context.

### 3.2 Enforcement Strategy

**Assessment: The most consequential v6 addition.** The trust-boundary heuristic ("handler trust < Contract criticality → external enforcement") converts a design-time ambiguity into an implementable decision rule. The per-sub-type defaults table gives teams a starting point without requiring case-by-case analysis.

**Strengths:**
- The three-way split (external / internal / internal-externalizable) maps to real implementation patterns. External enforcement in the store's write path, internal enforcement via XState machine definitions, and domain-specific Guards that migrate outward — these are all buildable.
- The in-flight enforcer as a system actor sitting between producer and consumer is the right architecture for streaming validation. It resolves a question that was implicit since v3 added streaming.
- Deferring `enforcementTrustThreshold` as a formal field was correct — the principle is sufficient for foundation phases; the field adds mechanical complexity before it's proven necessary.

**One gap:** The enforcement strategy specifies external, internal, and post-commit patterns, but the trigger for migration from internal to external is underspecified. The concept says "enforcement migrates outward as trust increases" and "this is the deterministic-first loop applied to enforcement itself." But what concretely triggers the migration? Who decides? Is it automatic (threshold-based) or manual (human judgment)? The deterministic-first loop section in the KB (§6) describes rule proposal and review for behavioral rules, but doesn't address enforcement migration specifically. This is a Phase 12+ concern, not a blocker, but it should be acknowledged.

### 3.3 Implementation Strategy Dimension

**Assessment: Valuable addition with one weakness.** Making implementation strategy orthogonal to handler level (function/actor) is the right factoring. A skill (markdown/LLM) can be a function or an actor. A StateMachine can be a function or an actor. The trust scoring per strategy (code=1.0, LLM=0.85, StateMachine=1.0, hybrid=min()) is clear and actionable.

**The weakness:** The migration path (markdown/LLM → hybrid → code) is presented as a natural evolution, but the mechanics are unclear. What does "migrating a skill to hybrid" actually entail? Rewriting the markdown instructions as code while keeping LLM for edge cases? At what point does a hybrid handler qualify for migration to pure code? The trust scoring creates an incentive (higher trust = more autonomy), but the mechanical steps are not specified. This is acceptable for the concepts document — it describes what happens, not how — but the implementation KB should address it. Currently it doesn't.

### 3.4 Skill as Pattern

**Assessment: Correct decision, well-executed.** The argument for skill-as-pattern is rigorous: skill has no primitive of its own (it combines effectHandler + Behavior Contract + Projection), it follows the same trust and Contract rules as any effectHandler, and elevating it would break the five-concept boundary that has held for six iterations. The pattern composition table in §3 gives skill equal standing with domain, bridge, artifact, slice, and profile — visible without being elevated.

The implementation KB's treatment is equally well-handled. The distinction between thin wrappers (MCP, CLI — protocol adaptation) and thick wrappers (skills — composition) in §5 is architecturally sound. The devac reference architecture (effectHandler in core, MCP tool in mcp package, CLI command in cli package, skill in plugins/) demonstrates this separation with working code.

**One observation worth noting:** The statement "skills are NOT a cross-LLM standard — each platform has its own format" is pragmatically correct but deserves implementation-time attention. If vivief skills become Claude Code-specific markdown files, portability comes only through the underlying effectHandlers exposed via MCP and CLI. This is fine architecturally, but the team should be intentional about keeping skill orchestration logic thin relative to the effectHandlers it composes.

### 3.5 Contract Sub-types as Closed Set

**Assessment: Defensible and useful.** The six sub-types map one-per-concept plus Trust and Sync for cross-cutting concerns. The claim "if a new sub-type seems needed, it signals a missing concept" is a strong design invariant — it turns the closed set into a canary for conceptual drift.

**One stress test worth noting:** What about a Performance Contract (response time guarantees, throughput limits)? Under the current mapping, performance constraints would be a Behavior Contract (constraining how an effectHandler operates). This feels like a stretch — a Behavior Contract specifying "this handler must respond within 200ms" is governing operational characteristics, not behavioral transitions. However, framing performance as "the handler's acceptable behavior includes timing constraints" is conceptually defensible. The six-sub-type boundary holds, but performance/operational Contracts are the most likely area where it will be tested during implementation.

### 3.6 Compounding Flywheel and Knowledge Evolution Path

**Assessment: The strongest piece of conceptual architecture in v6, grounded by evidence.** The knowledge evolution path (tacit → knowledge file → proto-Contract → proposed Contract → active Contract → infrastructure Contract) names a progression that is already observable in the devac plugin: the M1-M4 quality rules and G1-G4 gap metrics are proto-Contracts living in markdown knowledge files, referenced by skills, measurably improving outcomes (28% → 68% composite score).

**The Monday prep example is persuasive.** The week-by-week progression from fully LLM-mediated (week 1) to 80% deterministic (month 6) is concrete enough to evaluate and realistic enough to be credible. Each transition (keyword matching becomes a Guard Contract, theme summarization becomes an Aggregation Contract) follows the creation loop: LLM proposes, human approves, system enforces.

**The gap:** The evidence validates "structured rules improve LLM output" (proto-Contracts in knowledge files → better results). It does not yet validate the full loop of "LLM proposes rules that become system enforcement." The difference: in devac, a human wrote the M1-M4 rules. The vivief vision is that the LLM writes them. This is the single biggest untested claim in the entire concept set. The gated trust strategy mitigates the risk (human reviews before activation), but the quality of LLM-proposed rules is an empirical question that can only be answered by building and testing. See §5.1 for deeper analysis.

### 3.7 Validation Recursion Exemption

**Assessment: Necessary, well-placed, narrow.** Without this exemption, the system faces infinite recursion: a Schema Contract produces a validation datom, that datom triggers Schema Contract validation, which produces another validation datom, ad infinitum. The exemption — system actors (trust 1.0) produce validation datoms that commit directly — is the minimal fix.

**Edge case worth tracking:** The exemption relies on the trust 1.0 marker. If a non-system actor somehow produces datoms with trust 1.0 (via handler override on a Behavior Contract with very high confidence), those datoms would not be exempt — only system actors are. This is correct behavior, but the distinction between "trust 1.0 datoms from system actors" and "trust 1.0 datoms from overriding handlers" should be explicit in implementation. The concept document handles this correctly (it says "system actors," not "trust 1.0 datoms").

### 3.8 Pattern Composition Table

**Assessment: Clean and complete.** The six patterns (domain, bridge, artifact, slice, profile, skill) with their composition relationships and outputs are well-defined. Each pattern's composition is expressed in terms of the five concepts, reinforcing the concept/pattern boundary.

The addition of skill ("effectHandler (LLM-implemented) + Behavior Contract + Projection (context)") integrates cleanly. The table makes visible that skill and domain are the two "heaviest" patterns (composing the most concepts), while slice and profile are the "lightest" (subsetting rather than combining).

---

## 4. Implementation KB Evaluation

### 4.1 Decision Framework Approach

The "decisions framed, not made" posture was the right approach when the KB was created alongside v5. After v6's maturity and with implementation on the horizon, this posture creates a tension: the concepts are ready, but the technology stack is still entirely open. The KB successfully frames 9 technology decisions with criteria derived from concepts, candidate approaches, and tradeoffs. The format is consistent and useful.

**Assessment:** The decision framework is sound, but the project now needs to transition from framing to deciding. The KB should remain as-is (it's a valuable reference for evaluating candidates), but the next step should be making decisions — not adding more candidates or criteria. A "Technology Decisions Record" (separate from the KB) would capture actual choices without polluting the framework.

### 4.2 Concept-to-Technology Mapping

The mapping table (KB §3) accurately translates concepts to technology needs. Each concept has clear requirements: Datom needs append-only store, Projection needs query engine + subscription, Surface needs UI framework with 6 modes, Contract needs validation runtime, effectHandler needs execution runtime + message queue.

The cross-cutting needs (serialization, event bus, content-addressed hashing, key derivation) are complete for foundation phases. One gap: no mention of observability infrastructure needs, despite observability being central to the deterministic-first loop (LLM needs to query effect datoms to observe patterns). This is a Phase 16 concern, but the observability tooling decision could affect earlier choices (e.g., whether the datom store needs to support efficient time-range queries over effect datoms).

### 4.3 Implementation Phases

**Phase structure is sound.** The three-tier structure (foundation 1-5, extension 6-12, advanced 13-16, deferred 17+) with explicit dependencies is well-organized. Dependencies are accurate — each phase builds on validated foundations from prior phases.

**v6 phase updates are correctly placed.** Phase 7 noting in-flight enforcer as system actor and Phase 12 noting internal enforcement are appropriate additions that don't restructure the phasing.

**One dependency concern:** Phase 16 (Deterministic-first loop: LLM rule proposal + review + activation) depends on Phase 12 (Behavior Contract + StateMachine) and Phase 7 (effectHandler actor + streaming). But the deterministic-first loop also implicitly depends on the datom store being queryable enough for the LLM to observe patterns (Phase 1) and Projections being sophisticated enough to provide pattern context (Phase 3). These are listed as Phase 16 dependencies on Phase 12 and 7, but the observation mechanism (how the LLM queries effect datoms efficiently) touches Phase 1 and 3 decisions. This isn't a blocking issue — foundation phases should be built to support query flexibility — but it's worth noting that Phase 16's success is seeded by decisions made in Phase 1.

**The skill emergence note is correct.** "Skills emerge from Phase 4 (effectHandler function) + Phase 7 (effectHandler actor). No separate phase needed — skills are an implementation strategy, not a build target." This is consistent with the concepts document's treatment of skills as patterns.

### 4.4 Architecture Patterns

**Exposure wrapping (thin vs thick wrappers):** Clear, implementable, and validated by devac's existing architecture. The devac-core / devac-mcp / devac-cli / plugins separation is a working reference implementation.

**Enforcement strategy architecture:** The three enforcement patterns (external/infrastructure, internal/handler, post-commit/async) map cleanly to implementation. External enforcement in the store write path, in-flight enforcer as system actor between producer and consumer, internal enforcement via XState — each has a clear implementation target.

**Bridge pattern:** Sufficient for implementation. The `Bridge` interface extending effectHandler with medium-specific configuration is the right abstraction. The middleware layer for Contract enforcement at the boundary is well-specified.

**Actor runtime:** The four decision areas (message routing, supervision, concurrency, lifecycle) are the right decomposition. The Node.js single-threaded event loop as the natural concurrency model is pragmatic. One addition that would help: guidance on whether actor state should be in-memory (ephemeral actors) or persisted as datoms (durable actors). The concepts document implies datom-backed state (Projection subscription), but the KB doesn't address the performance implications.

**Trust scoring 5-stage flow:** The assignment → storage → propagation → filtering → display pipeline is implementable. The `min(source_trusts)` propagation rule is clear. One concern: the filtering stage (Projection trustThreshold) needs efficient implementation — if every Projection query must filter by trust score, the datom store needs trust score as an indexed attribute, not just a queryable one.

### 4.5 Deterministic-First Loop Practical Mechanics

This is the KB's strongest section — it takes the concepts document's most abstract claim and makes it concrete.

**Trigger conditions are reasonable.** "Repeated patterns" (same edge case handled N times), "repeated explanations," and "repeated debug narratives" are all detectable through Projection queries over effect datoms. The configurable threshold (N repetitions) is the right parameter to tune.

**Rule proposal format is well-specified.** Datoms with `:contract/type`, `:contract/rule`, `:tx/source`, `:tx/trust-score`, `:proposal/confidence`, and `:proposal/evidence` give the review workflow enough information to make informed decisions.

**Confidence thresholds are reasonable starting points.** < 0.7 manual, 0.7-0.9 human review with auto-approve suggestion, > 0.9 auto-promote eligible. These will need calibration through experience, but the structure is right.

**The knowledge evolution path with devac evidence is the KB's best addition.** Connecting the abstract path (tacit → infrastructure Contract) to concrete devac artifacts (M1-M4 rules, knowledge directories, composite score improvement) grounds the vision in observable reality.

### 4.6 Quality Approach

The 5-level testing strategy (unit, integration, contract-as-test, StateMachine, a11y) covers the needs. The concept connection column (handler with fixture datoms, end-to-end creation loop, Storybook stories, XState transitions, axe scanning) gives each level a clear purpose.

Contract coverage (declared vs verifiable) is a more meaningful metric than line coverage. "Show me all declared-but-not-verifiable Contracts" as a technical debt Projection is a powerful tool for maintaining Contract quality.

### 4.7 Deferred Items

The deferred items list is well-reasoned. Each item has a clear "why defer" and "when to revisit." The addition of `enforcementTrustThreshold` to the deferred list is correct — the principle is sufficient for now.

**One item to reconsider:** "Content worlds" (deep locale adaptation) is deferred to "when internationalization is needed." If the counseling domain is a primary use case, and counseling happens in specific cultural/linguistic contexts (Dutch therapy, for example, is explicitly mentioned in the concepts), internationalization may be needed earlier than "deferred" implies. Not a blocker — the Projection dimension approach (locale as a Projection dimension with fallback chains) handles the basics — but worth flagging.

---

## 5. Paradigm Evaluation — Human + AI + Deterministic Systems

### 5.1 Does the Deterministic-First Loop Actually Work?

The loop has three phases: (1) LLM handles edge cases, (2) LLM observes its own patterns and proposes rules, (3) system enforces approved rules. Phase 1 is proven — LLMs handle edge cases via reasoning today. Phase 3 is conventional software engineering — deterministic rule enforcement is well-understood. The critical question is Phase 2: can an LLM reliably observe patterns in its own behavior and propose useful deterministic rules?

**Current evidence says: partially.** LLMs can identify patterns in data they're shown (given a Projection of effect datoms, an LLM can identify recurring sequences). LLMs can propose rules from patterns (given examples, an LLM can generate a regex, a keyword list, or an aggregation rule). What's less proven is the complete cycle operating autonomously — the LLM noticing that it's handling the same edge case repeatedly, without being explicitly asked to look.

**The gated trust strategy is the right safety net.** Even if the LLM proposes poor rules, human review catches them. Even if the LLM misses patterns, a human can manually trigger rule proposals. The system degrades gracefully to "human authors rules, system enforces" — which is conventional development. The deterministic-first loop is an improvement over the baseline, not a requirement for the baseline to work.

**The Monday prep example stress-tests correctly.** Week 1 (fully LLM) → Week 4 (system flags repeated pattern) → Week 5 (counselor approves Guard Contract) → Week 12 (Aggregation Contract) → Month 6 (80% deterministic). Each transition is individually credible. The cumulative effect over months is the compelling part — and it's the part that can only be validated by building.

**Verdict:** The loop is architecturally sound. Phase 2 (LLM pattern observation) is the riskiest part. The risk is managed by gated trust (human review) and by the fallback to manual rule authoring. Early implementation should validate Phase 2 with a simple, low-stakes example (e.g., anti-pattern detection in code analysis) before relying on it for clinical or high-trust domains.

### 5.2 Is the Trust Model Practical?

**Actor-type defaults are useful starting points.** Human=1.0, AI/text-generation=0.85, system/analysis=1.0, web/scraped=0.4. These are reasonable and refinable per domain through the Contract defaults lifecycle.

**`min(source_trusts)` propagation is honest but creates trust sinks.** If any input to a derived datom has low trust, the output inherits that low trust — even if 9 of 10 inputs are trust 1.0 and the 10th is trust 0.4 (web-scraped). The chain stays honest, but practical consequence: any pipeline that touches web-scraped data produces low-trust output. The handler override mechanism mitigates this (a handler with a verifiable Behavior Contract can raise its own contribution), but the input trust remains the floor.

**Assessment:** The trust model is practical for its primary use case: distinguishing human-authored from AI-drafted from web-scraped content, and filtering by trust threshold. The `min()` propagation is conservative by design — it prevents trust inflation. For pipelines that genuinely mix high and low trust inputs, the domain can refine the propagation rule (the default is refinable). This is the right starting position.

### 5.3 Skill-to-Contract Evolution Path

The path (markdown/LLM skill → hybrid → code, with trust increasing) is conceptually coherent. Each step represents a concrete change: the skill's orchestration logic moves from natural language instructions to code while retaining LLM for edge cases (hybrid), then to pure code when the edge cases are resolved.

**The incentive structure works:** higher trust enables more autonomy (gated → authoritative), which motivates evolution. A skill that reaches trust 1.0 through code implementation can commit authoritatively, bypassing the human review step.

**The gap is in the mechanics.** What triggers the decision to evolve a skill? Who performs the rewrite from markdown to hybrid to code? Is it the original skill author? An automated migration? The concepts describe the destination (code handler with trust 1.0) and the benefit (more autonomy) but not the journey. This is an implementation concern — the concepts document is not required to specify migration mechanics — but the implementation KB should address it, and currently doesn't.

### 5.4 Are the Enforcement Strategies Implementable?

**External enforcement (infrastructure):** Yes. Schema Contract validation in the store's write path is standard database constraint enforcement. Trust Contract key derivation is standard cryptography. In-flight Contract as a system actor in the streaming pipeline is architecturally straightforward — it's middleware that validates each chunk. All buildable with current technology.

**Internal enforcement (handler as constraint):** Yes. XState validates its own transitions — the machine definition IS the constraint. This is the simplest enforcement pattern and the most proven (XState is battle-tested).

**Internal, externalizable (migrating to infrastructure):** This is the hardest pattern to implement mechanically. A domain-specific Guard starts as handler logic (e.g., a keyword check in a counseling handler). When the pattern stabilizes, it "externalizes into infrastructure rules." But what does externalization look like concretely? Moving the check from handler code into a Contract evaluated in the store write path? Creating a new system actor for it? The migration path is clear conceptually but needs implementation-time design for each specific case.

**Verdict:** The first two patterns are directly implementable. The third requires design decisions during implementation, per case. This is acceptable — the concepts describe the trajectory, not the implementation of every specific migration.

### 5.5 Actor Role Clarity

**Human:** Approve, judge, decide domain questions. This is the right scope — humans are the authority on domain correctness, ethical judgment, and policy decisions. The trust strategies (authoritative for humans, gated/sandboxed for AI) encode this authority structurally.

**AI:** Pattern recognition, rule authoring, natural language explanation, edge case handling. This is realistic for current LLMs. The important nuance: AI handles edge cases initially but the system absorbs its patterns over time, shrinking the AI's scope to genuinely novel cases. This is the deterministic-first trajectory — AI is not permanently handling edge cases; it's temporarily handling them while proposing rules that make them routine.

**System:** Validate deterministically, enforce, persist, replicate. Well-bounded and well-understood. The system does what it's good at (fast, consistent, auditable enforcement) and delegates what it's bad at (judgment, novelty, language) to humans and AI.

**The role boundaries are the right division.** Each actor does what it's best at, and the interfaces between them (Contracts, trust strategies, creation loop) are well-defined. The key insight — that these roles shift over time (AI handles edge cases → system absorbs them) — is what makes this paradigm more sophisticated than a static division of labor.

---

## 6. Five-Concept Stability Assessment

### 6.1 Evolution Table

| Aspect | v1 | v2 | v3 | v4 | v5 | v6 |
|--------|----|----|----|----|----|----|
| Concept count | 5 | 5 | 5 | 5 | 5 | 5 |
| Document lines | ~300 | ~500 | ~627 | ~857 | ~605 | ~696 |
| Concepts added | — | 0 | 0 | 0 | 0 | 0 |
| Trust model | Zones, roles | +Provenance, scoring | +Assignment, propagation | +Override boundary | +Capability categories | (unchanged) |
| Contract model | 6 sub-types | +Security, defaults | +Lifecycle, coverage | +Anti-patterns, graduated | +Decision tree, closed set claim | +Enforcement strategy, sub-type defaults |
| Creation model | Single loop | +Bridge, non-dev | +Slices, promotion, cache | +Counselor walkthrough | +Dev walkthrough, operations-as-creation | +Compact formulation, flywheel, knowledge path |
| Projection model | Full interface | +trustThreshold | +Named profiles | +Composite, two-tier live | Trimmed to 3 profiles | (unchanged) |
| Surface model | 6 modes | Same | +Binding as datom | +Learn, Explain modes | Trimmed to 6 modes | (unchanged) |
| effectHandler model | Function signature | Same | +Failure model | Same | +Creation boundary | +Implementation strategy, Contract-governed notation |
| Enforcement | Not specified | Not specified | Not specified | Implicit | Implicit | **External/internal/externalizable with per-sub-type defaults** |
| Pattern count | 0 named | 0 | 3 (bridge, slice, profile) | 5 (+ domain, artifact) | 5 | 6 (+ skill) |
| Implementation readiness | Conceptual | Near-ready | **Ready** | Ready + visionary | Ready + trimmed | **Ready + gap-closed** |

### 6.2 Absorption Capacity

Across six iterations, the five concepts have absorbed: trust scoring, provenance, schema evolution, contract lifecycle, failure model, conceptual slices, composite Projection, live-persistent Projection, anti-pattern guards, onboarding, domains, portability, deterministic-first loop, Intent formalization, enforcement strategy, implementation strategy, skills, compounding flywheel, knowledge evolution path, validation recursion exemption, and pattern composition.

None required a sixth concept. The absorption follows a consistent pattern: each addition is either a refinement of one concept (enforcement strategy refines Contract, implementation strategy refines effectHandler) or a composition of multiple concepts (skill = effectHandler + Contract + Projection, domain = Schema + Behavior + Surface + StateMachine).

**Assessment: The absorption is genuine, not forced.** Each addition fits its host concept's semantic scope. Enforcement strategy belongs in Contract because enforcement is Contract's responsibility. Implementation strategy belongs in effectHandler because how a handler is implemented is the handler's concern. The five-concept boundary has not been stretched to accommodate additions that don't naturally belong.

### 6.3 The Skills Brainstorm as Stress Test

The skills brainstorm is the strongest evidence that five is the right number. It began with a hypothesis ("skill might be a 6th concept"), conducted three rounds of interrogation, and concluded that skill is a pattern — not because of dogmatic attachment to five, but because skill lacks a primitive of its own. The brainstorm then did something more valuable than adding a concept: it found two gaps in the existing five that, once closed, made skills emerge naturally.

This is the mark of a mature conceptual model — external pressure reveals not what's missing from the framework but what the framework hadn't yet articulated about itself.

### 6.4 Concept Count vs. Pattern Count

The cognitive load inventory: 5 concepts, 6 patterns, 6 Contract sub-types, 3 Contract modes, 3 temporal validation points, 4 delivery modes, 4 implementation strategies, 3 trust strategies, 3 conceptual slices, 3 named Projection profiles, 3 anti-patterns, 4 Contract lifecycle states, 4 Contract default states, 4 enforcement strategies (external, internal, externalizable, post-commit), 5 onboarding states.

**Total named entities: ~56.** This is substantial — but the hierarchical organization compresses it. A developer building Phase 1 needs: 1 concept (Datom), 1 Contract sub-type (Schema), 1 delivery mode (snapshot), and the creation boundary. That's ~4 named entities. The rest unfolds progressively through phases.

**The compression is real but requires discipline.** The reading guide, conceptual slices, and phase ordering all exist to prevent a developer from encountering all 56 entities at once. If these navigational aids are ignored — or if the document is read linearly — the cognitive load is significant.

---

## 7. Senior Developer Perspective

### 7.1 What v5+v6 Add to Gains

| Gain | Source |
|------|--------|
| **Trimmed surface area** | v5 cut from 857 to 605 lines (concepts doc) |
| **Progressive reading guide** | v5 added Fact/Feature/Full reading paths |
| **Paired documents with clear separation** | v5 created implementation KB; v6 refined it |
| **Enforcement clarity** | v6's trust-boundary heuristic answers "who validates what?" |
| **Skill as named pattern** | v6 names what developers already build (Claude Code skills) |
| **Implementation evidence** | v6 KB references devac composite score improvement |
| **Implementation strategy as evolution dimension** | v6 makes the markdown→code migration path explicit |
| **Pattern composition table** | v6 shows how the six patterns compose the five concepts |

### 7.2 What v5+v6 Add to Losses/Risks

| Loss/Risk | Source |
|-----------|--------|
| **Two-document navigation** | Must cross-reference concepts (what) and KB (how) |
| **Open technology decisions** | KB frames 9 decisions without resolving any |
| **Enforcement strategy adds a dimension** | Every Contract decision now also involves enforcement strategy |
| **Implementation strategy adds a dimension** | Every effectHandler decision now also involves implementation strategy |
| **Knowledge evolution path lifecycle overhead** | 6 stages of knowledge maturation to manage |
| **Deterministic-first temporal complexity** | "This handler WILL evolve" adds planning horizon to every handler design |

### 7.3 Risk Reassessment

| Risk | v4 Severity | Current Severity | What Changed |
|------|------------|-----------------|--------------|
| **Over-modeling** | Medium | **Low-Medium** | Creation boundary (v5) + anti-pattern Guards + enforcement strategy giving clearer guidance on what needs Contracts |
| **Ecosystem isolation** | Medium | **Medium** | Export templates still deferred. Reduced by devac PoC demonstrating MCP/CLI portability |
| **Upfront conceptual investment** | Medium-High | **Medium** | Reading guide + conceptual slices + paired documents. Still the steepest cost |
| **Debugging complexity** | Low-Medium | **Low-Medium** | Unchanged from v4 |
| **Contract proliferation** | Low-Medium | **Low** | Contract decision tree + anti-patterns + enforcement strategy defaults reduce ambiguity |
| **Lock-in depth** | Medium | **Medium** | Unchanged. Export templates remain deferred |
| **Conceptual surface area** (v4 biggest risk) | Medium | **Low-Medium** | v5 trimming (857→605) + reading guide. v6 added ~90 lines but targeted |
| **Document overload** (v4 new) | Medium | **Low** | Split into two focused documents instead of one sprawling one |
| **Deterministic-first over-promise** (v4 new) | Medium | **Medium** | KB added practical mechanics + evidence, but the core claim remains unvalidated by implementation |

---

## 8. What Is Genuinely Novel (Worth Protecting)

### New in v5/v6

- **Enforcement strategy as trust-boundary-driven.** The heuristic (handler trust < Contract criticality → external enforcement) is not found in other systems. Most platforms either always externalize (middleware validates everything) or always internalize (handlers check themselves). The trust-driven selection with migration trajectory is genuinely new.

- **Implementation strategy as evolution dimension.** The formalization that a handler's implementation can migrate from markdown/LLM to hybrid to code, with trust increasing at each step, is a novel way to think about the lifecycle of automated workflows.

- **Knowledge evolution path.** Tacit knowledge → knowledge file → proto-Contract → proposed Contract → active Contract → infrastructure Contract. This names a progression that many teams experience informally but no system formalizes as a first-class lifecycle.

- **Intent as effect without concept inflation.** The resolution of Intent as "what the effect parameter already is" avoids the common trap of adding concepts to name every important thing. The discipline of recognizing that Intent was already modeled — just unnamed — is worth protecting.

- **Validation recursion exemption.** A small but necessary rule that prevents a systemic failure mode. Worth preserving exactly as specified.

- **Skills as thick wrappers vs. thin wrappers (MCP, CLI).** The distinction between protocol adaptation (thin) and orchestration composition (thick) is an architecturally useful separation.

### Carried Forward (still novel, still worth protecting)

- **Trust score as flowing attribute** (v2+): provenance and trust on every datom, filterable via Projection
- **Contract lifecycle as self-hosting** (v3+): Contracts stored as datoms, governed by the same creation loop
- **Redaction as compute/display separation** (v3+): Projection Contract separating what AI can read from what Surfaces can display
- **Creation boundary** (v5+): clear line between datom-producing creation and utility functions
- **Deterministic-first as improvement trajectory** (v4+): the system's quality trajectory, not just its current state
- **The five-concept discipline** (v1+): six iterations, zero additions

---

## 9. Improvement Opportunities

These continue the numbering from the v4 review (which ended at #15) to maintain traceability across the review series.

### A. Structural opportunities

**16. Quick reference card.** The two documents total 1,251 lines. A 1-2 page quick reference card (the five concepts, their relationships, the creation loop, the six patterns, and the phase ordering) would aid new readers and serve as a desk reference during implementation. Not a replacement for the documents — a navigation aid.

**17. Technology decisions record.** The implementation KB frames 9 technology decisions without making any. The project now needs a separate "Technology Decisions" document that records actual choices as they're made, with rationale linking back to the KB's criteria. This prevents the KB from being modified with decisions (keeping it useful as a framework) while providing the team with a concrete technology stack.

### B. Concept-level refinements

**18. Enforcement migration trigger.** v6 states that enforcement "migrates outward as trust increases" and calls this "the deterministic-first loop applied to enforcement itself." But what triggers the migration? Is it automatic when a handler's track record exceeds a threshold? Manual when a developer decides? Proposed by the LLM like other rules? The current description is a trajectory without a mechanism. Specify the trigger — even if it's simply "human judgment, informed by handler metrics" — to make the migration actionable.

**19. Implementation strategy migration mechanics.** Similarly, the skill→hybrid→code evolution path describes destinations but not journeys. What does migrating a markdown skill to a hybrid handler entail concretely? Who initiates it? What artifacts change? The concepts document needn't specify this (it's an implementation concern), but the implementation KB should. Currently it doesn't.

**20. Trust propagation in mixed-trust pipelines.** The `min(source_trusts)` rule creates trust sinks: any pipeline touching web-scraped data (trust 0.4) produces trust 0.4 output, regardless of how much human verification or system analysis was applied. The handler override mechanism raises the handler's contribution, not the input trust. For pipelines that genuinely transform low-trust input into high-quality output (e.g., a fact-checking handler that verifies web claims against authoritative sources), the current model may under-rate the output. Consider whether the KB should address "trust amplification" as a pattern — a handler that can raise output trust above input trust when its verification is itself verifiable.

**21. Operational Projection patterns** (carried forward from v4 review item #6). Named factory functions for operational use cases (health, alerts, audit) remain unaddressed. The three named profiles (snapshot, live, stream) cover delivery mechanics but not operational semantics. This becomes more relevant as the implementation approaches Phase 16 (deterministic-first loop) where operational Projections over effect datoms are central.

### C. Documentation refinements

**22. Cross-document navigation aids.** The concepts document and implementation KB reference each other implicitly (concepts §2.4 on enforcement → KB §5 on enforcement architecture) but lack explicit cross-references. Adding section references in both directions ("see KB §5 for implementation architecture" / "see concepts §2.4 for the trust-boundary heuristic") would reduce the navigational overhead of the paired structure.

**23. Implementation strategy in glossary.** v6 adds "implementation strategy" to the glossary (Cross-cutting terms). But the glossary entry reads: "How an effectHandler is implemented: code, markdown/LLM, StateMachine, or hybrid." This is a definition, not an explanation. A brief note connecting it to the trust implications (code=1.0, LLM=0.85, etc.) and the evolution path would make the glossary entry self-contained.

### D. Verification scenarios

These scenarios should pass a concept-level walkthrough before implementation:

**24. Skill evolution end-to-end.** A markdown skill (trust 0.85) that handles counselor session prep is used weekly for 3 months. The system flags repeated keyword-matching logic. The LLM proposes a Guard Contract. The counselor approves. The skill is now hybrid (deterministic keyword matching + LLM for themes). Six months later, theme summarization stabilizes. The skill migrates to code. **Verify:** at each transition, does the trust score change correctly? Does the Contract lifecycle track the evolution? Is the old skill version preserved in the log?

**25. In-flight enforcement rejection.** An LLM actor is generating a session summary via streaming. The in-flight enforcer (system actor) detects diagnosis language in chunk #47. **Verify:** the chunk is rejected, error datoms are produced without stopping the stream, the Surface receives the error signal, and the final committed datom excludes the rejected content. Does the system handle partial rejection gracefully?

**26. Knowledge file formalization rejection.** The system proposes formalizing a knowledge file as a Contract (`:effect/rule-proposal-needed`). The human reviews and rejects the proposal. **Verify:** the proposal is retracted with `:tx/why`, the knowledge file remains as-is (still usable by skills), and the rejection is itself a datom in the log. Does rejection re-enter the creation loop correctly?

**27. Post-commit cross-entity invariant failure.** A high-risk client's last session was 8 days ago (exceeding the 7-day post-commit invariant). The system actor checks the invariant after a session commit for a different client. **Verify:** the invariant failure produces error datoms, `:effect/validation-failed` is emitted, the escalation routes to the appropriate human, and the failure is visible on the operational Surface.

---

## 10. Reflection on the Journey (v1 through v6)

### 10.1 The Compression Trajectory

```
v1:  ~300 lines  establishing    → "these are the five concepts"
v2:  ~500 lines  expanding       → "trust is a first-class dimension"
v3:  ~627 lines  completing      → "every gap is closed, you can build"
v4:  ~857 lines  visioning       → "the platform thinks about itself"
v5:  ~605 lines  trimming        → "same concepts, fewer words, paired with KB"
v6:  ~696 lines  gap-closing     → "Intent and enforcement resolved"
```

The v4→v5 transition was the first contraction. It came at the right moment — v4 had reached 857 lines mixing specification and philosophy, and the v4 review identified surface area growth as the biggest risk. v5's trim was aggressive but disciplined: it cut Surface modes (8→6), Projection profiles (8→3), and separated infrastructure details into the implementation KB without losing conceptual content.

v6 being additive after v5's trim is the right rhythm. The additions are surgical: ~90 lines addressing two specific gaps identified through stress-testing (the skills brainstorm). The document has found a mature length range (~600-700 lines for concepts) that balances completeness with navigability.

### 10.2 The Role of Brainstorms

The brainstorm documents reveal a consistent pattern: each brainstorm starts with a hypothesis about what's missing and ends by discovering something more subtle. The v1 "Reducer" brainstorm hypothesized 7 concepts and discovered that 5 suffice. The v2 "Actor Network" brainstorm hypothesized actors as a separate concern and discovered they're a runtime manifestation of effectHandlers. The v3 "Stream" brainstorm hypothesized streaming as a new concept and discovered it's a Projection delivery mode. The v4 "Contract First" brainstorm hypothesized one meta-concept and discovered that six sub-types within one concept is the right factoring.

The skills brainstorm is the purest example: it hypothesized a 6th concept and discovered two gaps in the existing five. The brainstorm process itself — hypothesis → interrogation → deeper discovery — has been the primary driver of conceptual quality. Each brainstorm has made the five concepts more articulate without making them more numerous.

### 10.3 The Relationship Between PoC and Concepts

DevAC occupies an interesting dual role: it predates the vivief concepts (devac was built first, concepts were extracted from reflection on it) and it validates them (the M1-M4 evidence, the plugin architecture, the exposure wrapping pattern). This duality has been productive — devac provides grounding without constraining. The concepts go beyond what devac implements (trust scoring, P2P, domains, surfaces) while devac proves that the patterns work where they've been applied (code graph analysis, diagnostic pipelines, MCP integration).

The risk is that devac evidence is mistaken for vivief validation. devac validates: DuckDB+Parquet for code graphs, effectHandler patterns in code analysis, exposure wrapping via MCP/CLI/skill, knowledge files improving LLM output quality. devac does NOT validate: the full deterministic-first loop (LLM proposing rules), trust scoring at the datom level, Contract enforcement at commit time, Projection delivery modes, or Surface rendering. These remain untested — and they represent the core of what makes vivief different from devac.

### 10.4 The "Not Yet Built" Question

After six iterations, the concepts have never been fully implemented. This is simultaneously a strength and a risk.

**The strength:** The concepts have withstood four formal brainstorms, three formal reviews, and a gap-driven stress test (skills) without structural change. Five concepts, six iterations, zero additions. This level of stability under scrutiny is unusual for conceptual architecture — most frameworks evolve structurally through their first few implementations.

**The risk:** Concepts that haven't been implemented can carry invisible assumptions. The datom tuple structure seems obvious until you try to store it efficiently. The trust score propagation seems clean until you encounter a real pipeline with 20 mixed-trust inputs. The in-flight Contract seems straightforward until you implement streaming validation without adding intolerable latency. Implementation reveals these tensions — and no amount of conceptual iteration substitutes for it.

**The minimum viable implementation that would validate the framework:** A single Feature-slice cycle: datom store with Schema Contract validation → effectHandler function producing datoms → Projection snapshot query → the creation loop handling a validation failure. This exercises four of five concepts (all except Surface) in a minimal loop. Add a Surface Card rendering the Projection output and all five concepts are exercised. This is essentially Phase 1-5 of the implementation KB — and it's achievable before any of the advanced features (live Projections, actors, streaming, trust, P2P) are needed.

---

## 11. Risk Assessment

### Risks Carried Forward (updated severity)

| Risk | v4 Severity | Current | Change |
|------|------------|---------|--------|
| **Over-modeling** | Medium | **Low-Medium** | Creation boundary + anti-patterns + enforcement defaults reduce judgment calls |
| **Ecosystem isolation** | Medium | **Medium** | Unchanged — export templates still deferred |
| **Upfront conceptual investment** | Medium-High | **Medium** | Reading guide + slices + paired docs. Still steep for newcomers |
| **Debugging complexity** | Low-Medium | **Low-Medium** | Unchanged |
| **Contract proliferation** | Low-Medium | **Low** | Decision tree + anti-patterns + enforcement defaults |
| **Lock-in depth** | Medium | **Medium** | Unchanged — deeply structural, export deferred |
| **Surface area growth** | Medium | **Low-Medium** | v5 trimmed aggressively; v6 adds surgically |
| **Deterministic-first over-promise** | Medium | **Medium** | KB added mechanics + evidence, but core claim remains unvalidated |

### New Risks in v5/v6

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Two-document maintenance burden** | Low-Medium | Clear separation of concerns (what/why vs how). Risk is primarily navigational, not structural |
| **Implementation KB's "open decisions" posture** | Medium | Addressed by recommendation #17 (Technology Decisions Record). Decisions must be made before building, not just framed |
| **Enforcement strategy adds decision complexity** | Low | Per-sub-type defaults reduce case-by-case analysis. The heuristic is simple: "can you trust the handler to check itself?" |
| **Implementation strategy adds lifecycle complexity** | Low-Medium | The migration path (LLM→hybrid→code) is clear in direction but underspecified in mechanics (see opportunity #19) |

### The Meta-Risk: Over-Designing Before Building

After six iterations, four brainstorms, and three prior reviews, the most important question is no longer "are the concepts right?" but "are we building yet?" The concepts have reached the point where further refinement yields diminishing returns. Every identified gap has been closed. The five-concept boundary has survived every stress test. The implementation KB provides a phasing plan.

The meta-risk is that the quality of the conceptual work becomes its own obstacle — that the elegance of the model creates reluctance to confront the messiness of implementation, where the datom store is slow, the streaming pipeline drops tokens, and the trust scoring adds complexity that no user requested.

**Severity: Medium-High.** Not because the concepts are wrong, but because the gap between conceptual completion and working software must be closed — and only implementation closes it.

**Mitigation:** Start Phase 1. Accept that the first implementation will be imperfect. Use the concepts as a compass, not a blueprint. Revise when reality contradicts theory.

---

## 12. Final Assessment

### 12.1 Are the concepts usable and complete to start implementation?

**Yes.** The concepts are the most mature iteration of a conceptual model that has been refined across six versions, stress-tested by brainstorms, and reviewed three times. Every identified gap has been closed. The implementation KB provides phasing, architecture patterns, and decision criteria. The foundation phases (1-5) are fully specified and have been stable since v3.

What specifically is ready: the datom tuple structure, Schema Contract validation, Projection interface with named profiles, effectHandler function signature and failure model, Surface Card mode with Projection binding, Render Contract with a11y terms, and the creation loop with validation and escalation.

What needs resolution during (not before) implementation: technology stack decisions (the KB frames them but they must be made), actor runtime design (the KB identifies the decision areas), and the deterministic-first loop's LLM observation mechanism (Phase 16, dependent on validated foundations).

### 12.2 Do the concepts express development using humans + LLMs + deterministic systems?

**Yes — this is the concepts' strongest dimension.** The deterministic-first principle gives each actor what it's best at: humans approve and judge, AI observes and proposes, systems enforce and persist. The trust strategies encode the authority gradient structurally. The creation loop unifies all three actors under one pattern with variable trust.

The key insight — that AI's role shrinks over time as its patterns become deterministic rules — is more sophisticated than most human+AI collaboration models. Most systems treat AI as a permanent executor. Vivief treats AI as a transitional pattern-discoverer whose best work becomes the system's permanent intelligence.

**Where the paradigm excels:**
- The division of labor is clear and non-overlapping
- The trust model encodes authority without hard boundaries (trust scores, not boolean permissions)
- The evolution trajectory (probabilistic → deterministic) aligns with how mature systems actually develop
- The creation loop applies uniformly — counseling notes, code analysis, rule proposals, and error fixes all follow the same pattern

**Where the paradigm has gaps:**
- LLM pattern observation (Phase 2 of the loop) is the least proven capability
- The mechanics of skill evolution (markdown → code) are directional but not specified
- Enforcement migration triggers are described as trajectories without mechanisms
- The trust model may be too conservative for mixed-trust pipelines (min() propagation)

### 12.3 Reflection on the Thinking and Brainstorming Journey

Six iterations of a conceptual framework is unusual — most projects either build from a rough sketch or over-specify before building. The vivief approach — iterative conceptual refinement with brainstorms that challenge the framework's boundaries — has produced a model of unusual coherence and stability.

What was gained through iteration that could not have been designed in one pass:
- **The five-concept boundary** emerged through successive attempts to add a 6th (actors, streams, contracts-as-meta-concept, skills) — each attempt reinforcing the boundary rather than breaking it
- **The trust model** evolved from zones (v1) through scoring (v2) through assignment rules (v3) through capability categories (v5) — each step grounded in the prior step's inadequacy
- **The deterministic-first principle** emerged in v4 as a philosophical statement and became mechanically specified in v6's implementation KB — maturation that required both vision and engineering
- **The concept/pattern distinction** crystallized through the repeated temptation to elevate patterns (domain, skill) to concept status — the discipline of resistance clarified the boundary

The brainstorms have been the project's most valuable activity. Each one began with a hypothesis about what was missing and ended with a deeper understanding of what was already there. This is the hallmark of a conceptual model that's approaching its natural structure — external pressure reveals articulation opportunities, not structural deficiencies.

### 12.4 What to Improve (prioritized)

**Before or during early implementation:**
1. **Make technology decisions** (opportunity #17) — the KB frames them; now commit to a stack
2. **Add cross-document navigation** (opportunity #22) — explicit section cross-references between concepts and KB
3. **Specify enforcement migration triggers** (opportunity #18) — even "human judgment" is better than unspecified

**During implementation:**
4. **Address implementation strategy migration mechanics** (opportunity #19) — design the skill→hybrid→code journey
5. **Consider trust amplification patterns** (opportunity #20) — for handlers that genuinely raise output trust above input trust
6. **Add operational Projection patterns** (opportunity #21) — named profiles for health, alerts, audit

**When needed:**
7. **Create a quick reference card** (opportunity #16) — after the first developer beyond the concept author joins
8. **Expand glossary entries** (opportunity #23) — as terms prove confusing in practice

### 12.5 What to Protect

Through implementation, protect:

1. **The five-concept boundary.** Six iterations, zero additions. If implementation pressure suggests a 6th concept, examine what gap the existing five haven't articulated — the answer has been there every time so far.

2. **Deterministic-first as an improvement trajectory.** The system should measurably become more deterministic over time. Track the ratio of LLM-handled to system-handled operations as a platform-level metric.

3. **Trust score as a flowing attribute.** Every datom carries provenance and trust. Resist the temptation to make trust optional or computed-on-demand — its value comes from being universal.

4. **The creation loop as the universal pattern.** Everything is creation: features, validation, error fixing, rule proposals, onboarding, operations. Resist creating separate loops for special cases.

5. **Contract lifecycle as self-hosting.** Contracts are datoms, governed by the creation loop. Creating Contracts is itself creation.

6. **The concept/pattern distinction.** Patterns compose concepts; they don't extend them. When a new entity is proposed, ask: "Does this have its own primitive, or does it compose existing primitives?"

### 12.6 Single Biggest Risk and Single Biggest Opportunity

**Biggest risk: The gap between conceptual maturity and implementation validation.** The concepts are refined, coherent, and stable. They've survived every review and brainstorm. But they've never been built. The datom store might be slow. The trust scoring might be overhead. The in-flight enforcer might add intolerable streaming latency. Implementation will reveal tensions that conceptual work cannot. The risk is not that the concepts are wrong — it's that delaying implementation delays the discovery of what needs adaptation.

**Biggest opportunity: Validating the deterministic-first loop with a real example.** If the compounding flywheel works — if skills genuinely produce patterns that become Contracts that increase trust that enables more autonomy — it creates a platform that improves through use. Not through retraining, not through version updates, but through the natural cycle of use → observe → propose → enforce. The devac M1-M4 evidence hints at this. A working implementation proving it would be the platform's defining achievement.

---

*Review document. Written against vivief-concepts-v6.md (696 lines) and vivief-concepts-v6-implementation-kb.md (555 lines) as a paired set. First review covering both documents together. Covers: executive summary (§1), v4 review gap closure scorecard (§2, 15 items tracked), evaluation of v6 additions (§3, 8 additions assessed), implementation KB evaluation (§4, first formal review), paradigm evaluation for human+AI+deterministic systems (§5), five-concept stability assessment (§6), senior developer perspective (§7), novel primitives worth protecting (§8), improvement opportunities (§9, items 16-27 continuing v4 numbering), reflection on the v1-v6 journey (§10), risk assessment (§11), and final assessment (§12). Written in the context of the full concept evolution from v1 through v6, including four brainstorm documents, three prior reviews, the skills brainstorm, and the implementation KB. Key findings: the two-gap thesis (Intent + enforcement) was correct, five concepts remain structurally sound after six iterations and an explicit stress test, the deterministic-first loop is the biggest unvalidated claim, and the highest-value next step is implementation (Phase 1) not further conceptual refinement.*
