# vivief-concepts-v4 — Review

> Implementation readiness, conceptual evaluation, paradigm assessment, senior developer trade-offs, and improvement opportunities.

---

## 1. Executive Summary

v4 is the most mature and complete iteration of the vivief concepts. It addresses all 17 improvement opportunities identified in the v3 review, adds significant new capabilities (platform self-documentation, domains, portability/migration, deterministic-first guardrails), and does so without adding a sixth concept. The five-concept discipline has held across four major revisions — a strong signal that the conceptual model is structurally sound.

The document has evolved from a conceptual architecture (v1) through an implementation-ready specification (v3) into something that now also serves as a **platform philosophy** (v4). The additions — LLM as rule author, system as enforcer, onboarding as creation, domains as named configuration — transform the concepts from "how to build the platform" into "how the platform thinks about itself." This is both the document's greatest strength and its greatest risk.

**Implementation readiness verdict:** Yes, with important caveats. The concepts are sufficient to begin building. However, v4 has expanded the conceptual surface area significantly compared to v3, and an implementation team needs guidance on what to build first versus what to defer. The v3 review's implementation phases remain valid; the v4 additions (self-documentation, domains, export/migration templates) are all phase 5+ concerns that build on validated foundations.

**The single most important observation:** v4 shifts the document's center of gravity from "what are the concepts?" toward "what does the platform do with itself?" This is intellectually compelling but creates a risk — that the self-referential elegance (the platform explains itself using itself, the platform guards against its own misuse using itself) becomes a distraction from the more mundane work of getting the first datom committed, the first Projection queried, and the first Surface rendered.

---

## 2. v3 Gap Closure — Scorecard

The v3 review identified 17 opportunities across three categories. Every one is addressed in v4.

### A. Concept-level refinements (v3 review §9A)

| Opportunity | v4 resolution | Status |
|-------------|--------------|--------|
| **1. Composite Projection semantics** | Named namespace map — each constituent keeps its own trust scope, delivery mode, and access rules (§2.2). Composition is named slots, not union or precedence. | **Closed** |
| **2. Handler override trust boundary** | Hybrid rule: verifiable Behavior Contract qualifies by default; Trust Contract can restrict to named list per domain (§2.1). | **Closed** |
| **3. Live Projection lifecycle** | Two-tier model: ephemeral (Surface-bound, dies on unmount) and persistent (independent entity with `:projection/status`, survives Surface) (§2.2). | **Closed** |
| **4. Non-developer user walkthrough** | Full counselor-perspective "Day in Creation" added (§3), showing direct vs. LLM-mediated interaction blend, Learn mode progression, and trust badge experience. | **Closed** |

### B. Documentation refinements (v3 review §9B)

| Opportunity | v4 resolution | Status |
|-------------|--------------|--------|
| **5. Contract decision guide** | Anti-pattern Guard Contracts with graduated enforcement: explain → warn → block (§2.4). Contract-on-everything is a named anti-pattern. | **Closed** |
| **6. Anti-patterns section** | Three named anti-patterns: utility-as-creation, Contract-on-everything, Projection-splitting (§2.4). Each with detection criteria and graduated enforcement. | **Closed** |
| **7. Migration path from conventional stack** | Full bidirectional mapping templates: vivief → conventional (export) and conventional → vivief (migration) (§6). | **Closed** |

### C. Verification scenarios (v3 review §9C)

| Scenario | How v4 addresses it | Status |
|----------|---------------------|--------|
| **8. Concurrent Contract evolution** | Newest-wins rule + additive-only default means both promotions succeed if additive (§2.4 lifecycle). | **Addressed by existing mechanics** |
| **9. Trust score cascade on AI chain** | `min(source_trusts)` propagation explicitly preserved. Handler override raises actor contribution, not input trust (§2.1). | **Closed with clarification** |
| **10. Migration handler failure** | Migration is creation in sandbox — failure leaves sandbox dirty, authoritative namespace untouched. Human resolves (§2.1, §3). | **Addressed by existing mechanics** |
| **11. Contract conflict escalation** | Cross-type conflicts surface as `:contract/conflict` datoms + `:effect/contract-conflict`. Trust-over-structure rule for Trust vs Schema. Escalation StateMachine routes to human (§2.4). | **Addressed by existing mechanics** |

### D. v3 review borderline items (v3 review §3)

| Item | v4 resolution | Status |
|------|--------------|--------|
| **Live Projection lifecycle** | Two-tier model (ephemeral + persistent) fully specified. Compaction handled via `:effect/compaction-complete`. | **Resolved** |
| **Composite Projection semantics** | Named namespace map with explicit "no lossy merging" rule. | **Resolved** |
| **Handler override trust boundary** | Hybrid rule with clear escalation path from default to domain-restricted. | **Resolved** |

**All 17 items from the v3 review are addressed.** The scorecard is clean.

---

## 3. Implementation Readiness

### What can be built today

Everything identified as buildable in the v3 review remains buildable, with the same phasing. v4 does not introduce any new dependencies in the foundation phases.

**Phases 1-4 are unchanged and fully specified:**
- Phase 1: Datom + Schema Contract (unchanged from v3)
- Phase 2: Projection snapshot + profiles + debug profiles (v4 adds profiles but these are convenience, not structural)
- Phase 3: effectHandler function + failure model (unchanged from v3)
- Phase 4: Surface Card + binding + Render Contract (unchanged from v3)

**Phase 5+ now has more content but the same structure:**
- v4 adds: composite Projection, live-persistent Projections, platform self-documentation, domains, export/migration templates, anti-pattern Guards, deterministic-first guardrails
- All of these build on validated foundations from phases 1-4
- None require earlier phases to change

### What v4 adds to implementation scope

| v4 addition | Implementation phase | Dependency |
|-------------|---------------------|------------|
| Composite Projection | Phase 5 (first multi-source Surface) | Projection (phase 2) |
| Live-persistent Projection | Phase 6 (background monitoring) | Live Projection (phase 6) |
| Debug Projection profiles | Phase 2 (convenience, can ship early) | Projection (phase 2) |
| Anti-pattern Guard Contracts | Phase 5+ (can be graduated) | Contract Guard (phase 5) |
| Onboarding StateMachine | Phase 7+ (self-documentation) | StateMachine Contract (phase 5+) |
| Explanation handler | Phase 7+ (LLM-powered) | effectHandler actor (phase 6) |
| Learn/Explain Surface modes | Phase 7+ (self-documentation) | Surface (phase 4) |
| Domain bundles | Phase 8+ (packaging) | All prior phases |
| Export templates | Phase 8+ (portability proof) | All prior phases |
| Migration templates | Phase 8+ (adoption aid) | All prior phases |
| Deterministic-first guardrails | Phase 7+ (LLM-generated lint rules) | Contract + effectHandler |

### What requires implementation decisions (not concept decisions)

The v3 review's list of appropriate deferrals remains valid. v4 adds two new implementation decisions:

| Decision | What the concepts specify | What implementation decides |
|----------|--------------------------|----------------------------|
| Onboarding state tracking | StateMachine with 5 states, per-user per-concept | Storage of user state, UI for state transitions |
| LLM-generated lint rules | Rules stored as datoms, deterministic after generation | Rule language/format, generation trigger, review workflow |

### What is borderline — concept or implementation?

v3 had three borderline items, all resolved in v4. v4 introduces two new borderlines:

1. **Explanation handler specificity.** The concept says the explanation handler "takes the current feature's concept structure as input, produces explanation datoms." But what constitutes "the current feature's concept structure"? Is it a fixed Projection? A dynamic query based on the user's current context? This determines whether onboarding explanations are generic or truly contextual. **Verdict: implementable with a fixed Projection per concept first, then made dynamic when usage data guides refinement.**

2. **Domain bundle composition.** The concept says domains are "composable" but doesn't define what composition means. Can two domains be active simultaneously? Do they merge or overlay? What happens when domain A's Schema Contract conflicts with domain B's? **Verdict: start with single-domain deployments. Cross-domain composition is a future extension, not a blocker.**

---

## 4. Conceptual System Evaluation

### The five concepts: stability across four iterations

| Property | v1 | v2 | v3 | v4 |
|----------|-----|-----|-----|-----|
| Concept count | 5 | 5 | 5 | 5 |
| Concepts changed | — | 0 | 0 | 0 |
| Concepts added | — | 0 | 0 | 0 |
| Additions within concepts | — | Trust, provenance, creation | Lifecycle, failure, evolution, slices | Self-documentation, domains, portability, guardrails |

The five concepts have absorbed: trust scoring, provenance, creation loop, contract lifecycle, failure model, schema evolution, conceptual slices, composite Projection, live-persistent Projection, debug profiles, anti-pattern guards, onboarding, domains, export/migration templates, deterministic-first guardrails, and the counselor-perspective UX. None of these required a sixth concept. This is the strongest evidence that the conceptual model is correctly factored.

### v4's distinctive contribution: the platform as its own domain

v4's most significant addition is the realization that the platform's self-documentation, onboarding, and guardrails are themselves instances of the five concepts. This is more than reflexive elegance — it has practical consequences:

1. **Onboarding is testable.** Because the explanation handler has a Behavior Contract, the platform's explanations can be verified against the actual concept structure. An explanation that references a non-existent Contract or misnames a Surface mode is a Contract violation.

2. **Guardrails improve over time.** The "LLM authors, system enforces, LLM refines" loop means the platform's anti-pattern detection starts probabilistic and becomes deterministic. This is the correct trajectory — and it's modeled by the concepts rather than bolted on.

3. **Domains package the platform.** The insight that a domain is "Schema + Behavior Contracts + Surface template + onboarding StateMachine" bundled per user population means the platform doesn't need separate configuration systems for different audiences. A clinical deployment and a developer deployment are the same platform with different domain datoms.

### Where v4 extends beyond v3's strengths

| v3 strength | v4 extension |
|-------------|-------------|
| Creation loop as universal pattern | Creation loop applied to the platform itself (onboarding, explanation, guardrails) |
| Contract as spec + test + guard | Anti-pattern Guards as graduated enforcement (explain → warn → block) |
| Conceptual slices as entry points | Domains as audience-specific packaging of slices, Contracts, Surfaces |
| Trust strategies for AI collaboration | Deterministic-first loop: LLM authors rules, system enforces, LLM refines |
| Failure as auditable datoms | Debug Projection profiles for common failure patterns |
| Cache as creation memory | Export/migration templates as portability proof |

### Where v4 introduces new tensions

**1. Document scope creep.** v3 was 627 lines (including glossary). v4 is 857 lines. The additional 230 lines are: platform self-documentation (§4), domains (§5), portability/migration (§6), and expanded glossary entries. The document is transitioning from a concept specification to a concept specification + philosophy + strategy document. This makes it harder to use as a pure implementation reference.

**2. Self-referential complexity.** The platform explaining itself using itself is conceptually clean but implementation-complex. The explanation handler needs to query the platform's own Contract structure, generate explanations from it, cache those explanations, and adapt them per user state — all using the same Projection/Surface/Contract/effectHandler machinery it's explaining. This works conceptually but creates a bootstrap problem: you can't explain the platform until the platform is built, and you can't onboard users until you can explain it.

**3. Domain as concept vs. domain as packaging.** v4 introduces "domain" as a named configuration bundle. Is this a concept? The document says "no new concept — a domain is a named composite of existing concepts, recorded as datoms." But it gets a full section (§5), domain-specific examples throughout, and multiple glossary entries. The document treats it as something between a concept and a pattern — which may cause confusion about where it sits in the hierarchy.

---

## 5. Evaluation: Expressing Development with Humans, AI, and Deterministic Systems

### The deterministic-first principle

v4's strongest new contribution to the human+AI+system paradigm is the explicit statement of the **deterministic-first principle**: "Each actor does what it's best at. The system validates deterministically — fast, consistent, auditable. The LLM generates the rules the system enforces — pattern recognition, rule authoring, natural language explanation. The human approves, judges, and decides domain questions."

This is more than a division of labor — it's an **improvement trajectory**. The LLM starts by handling edge cases via reasoning. As it handles them, it observes patterns. It proposes new deterministic rules from those patterns. The system absorbs them. The LLM's probabilistic work shrinks; the system's deterministic coverage grows. Over time, the platform becomes more deterministic, more auditable, and less dependent on LLM reasoning for routine operations.

This maps directly to how experienced development teams work: manual processes get automated, ad hoc decisions become policies, individual knowledge becomes institutional knowledge. The vivief concepts formalize this trajectory and make it structural rather than cultural.

### Where the paradigm excels

**AI as rule author, not just rule follower.** Most AI-integrated development tools use AI as an executor (generate code, fix bugs, answer questions). Vivief positions AI as a **meta-contributor** — it observes its own patterns and proposes rules that make the system smarter. An AI that repeatedly explains the same anti-pattern proposes a lint rule. An AI that repeatedly generates the same debug narrative proposes a debug profile. The system absorbs these proposals after human review. This is a fundamentally different relationship than "AI writes code, human reviews code."

**Three trust strategies mapped to real workflows.** The authoritative/gated/sandboxed mapping works:
- A senior developer committing a schema change = authoritative
- An AI drafting a session summary for counselor review = gated
- An AI experimenting with a new analysis approach = sandboxed

These aren't abstract — they map directly to daily workflows. The insight that they're the SAME concept at different trust levels is what makes the system coherent.

**Escalation as StateMachine.** Auto-fix → AI-fix → human-fix with a StateMachine Contract governing retries, timeouts, and escalation rules is a better model than most incident response systems. It's deterministic (the escalation rules are declared), auditable (every step is a datom), and composable (different domains can have different escalation Contracts).

### Where the paradigm has gaps

**1. LLM capability assumptions.** The deterministic-first loop assumes the LLM can reliably: observe its own patterns, propose deterministic rules from those patterns, generate accurate explanations from concept structure, and adapt communication per audience. Current LLMs can do all of these — sometimes. The concepts don't specify what happens when the LLM's pattern observation is wrong, when its proposed rule is incorrect, or when its explanation contradicts the actual concept state. The gated trust strategy provides a safety net (human reviews LLM proposals), but the quality of LLM-generated rules is a domain concern that the concepts don't address.

**2. The "comfortable" developer who never was a beginner here.** The onboarding StateMachine (unfamiliar → exploring → practicing → comfortable → teaching) assumes a progression. But some developers will never reach "comfortable" — they'll use the platform through LLM-mediated interactions, treating it as a tool rather than internalizing the concepts. The concepts handle this user via the non-developer interaction model (direct + LLM-mediated blend), but it's worth acknowledging that a developer who interacts with vivief primarily through Claude Code is a different user than one who writes effectHandlers directly.

**3. The gap between "creation" and "operations."** The creation loop models building: intent → contract → create → validate → cache. But running a system also involves operations: monitoring, alerting, scaling, incident response, deployment. The concepts touch this via live-persistent Projections (monitoring), escalation StateMachines (incident response), and observability as datoms. But the operations perspective — "the system is running and something went wrong at 3 AM" — is not as well modeled as the development perspective. Failure datoms and escalation are creation-centric; they model the response to failure as creation. This is conceptually correct but may feel awkward to an on-call engineer who wants to understand system state, not enter a creation loop.

**4. Multi-LLM and model evolution.** The concepts use `:ai/opus-4` as a named actor type with a default trust score of 0.85. But the AI landscape is rapidly changing: models get replaced, new capabilities emerge, costs change, quality varies across tasks. The concepts handle model identity via `:tx/source` provenance but don't address: what happens when a model is deprecated? How do you compare trust scores across model generations? What if the same logical task should use different models based on cost/quality trade-offs? These are domain concerns that the concepts push to Contract defaults refinement, which is the right architectural answer but leaves a lot of practical work unnamed.

---

## 6. Senior Developer — What You Gain

### Everything from v3, plus:

**Graduated complexity management.** The anti-pattern Guards (utility-as-creation, Contract-on-everything, Projection-splitting) give a senior developer named patterns for the most common over-engineering mistakes. This is the conceptual equivalent of a code review checklist — it prevents the predictable errors that come from over-internalizing a powerful model. The graduated enforcement (explain → warn → block) means teams can adopt these guardrails progressively.

**Deterministic improvement trajectory.** The "LLM authors, system enforces, LLM refines" loop gives a senior developer a structural answer to "how does this system get better over time?" Instead of relying on team discipline and code review to capture patterns, the platform has a formal mechanism: LLM observes repeated patterns, proposes rules, team reviews, system enforces. The platform's quality improves by design, not by accident.

**Portability confidence.** The export templates (Projection → SQL view, effectHandler → Express route, Contract → JSON Schema) give a senior developer confidence that the investment in vivief concepts isn't irreversible. The proof that every vivief concept maps to a conventional equivalent reduces the perceived lock-in risk. This is psychologically important even if no team ever actually exports.

**Domain packaging.** A senior developer leading a team can package a domain (Schema + Behavior Contracts + Surface template + onboarding StateMachine) and hand it to a less experienced developer as a coherent starting point. The domain bundles the "how we do things in this context" into a queryable, evolvable artifact rather than tribal knowledge.

**Self-documenting system.** The concept Projection (over the platform's own datoms) means a senior developer can always ask "show me the Contracts governing this entity" or "show me which handlers have unverifiable Behavior Contracts." The platform's structure is queryable — not just readable in documentation that may be stale.

### What the progressive entry looks like in practice

| Developer profile | Entry point | What they need to know |
|-------------------|-------------|----------------------|
| Schema designer | Fact slice | Datom structure, Schema Contract, additive evolution |
| Backend developer | Feature slice | + effectHandler function, failure model, Behavior Contract |
| Full-stack developer | Full slice | + Projection (all modes), Surface, Render Contract, wiring |
| Platform engineer | Full + infrastructure | + Trust Contract, Sync Contract, actor runtime, P2P |
| Domain lead | Full + domain | + Domain packaging, onboarding StateMachine, Contract decision tree |

---

## 7. Senior Developer — What You Lose or Risk

### Everything from v3, plus:

**Increased conceptual surface area.** v4 adds: composite Projection, live-persistent Projection, debug profiles, handler override trust boundary, anti-pattern Guards, onboarding StateMachine, explanation handler, Learn/Explain Surface modes, domains, export/migration templates, deterministic-first guardrails. That's 13 new named patterns on top of v3's already substantial model. A senior developer must now hold: 5 concepts + 6 Contract sub-types + 3 Contract modes + 3 temporal points + 4 delivery modes + 3 trust strategies + 3 slices + 5 Projection profiles + 3 debug profiles + 3 anti-patterns + 5 onboarding states + domain bundles. The cognitive compression is real but the compressed representation is getting larger.

**Philosophy vs. engineering tension.** v4's deterministic-first principle, platform self-documentation, and domain packaging are philosophically compelling. But they add a layer of abstraction between "here's what I need to build" and "here's the specification." A senior developer reading v4 for the first time may struggle to separate "what I build in phase 1" from "what the platform will eventually do with itself." The v3 review noted that v3 was implementation-ready; v4 is implementation-ready-plus-visionary, and the vision adds reading burden.

**Bootstrap complexity for self-documentation.** A senior developer who wants to ship onboarding features must build: the explanation handler (an LLM-powered effectHandler actor), the concept Projection (over the platform's own Contract/binding/trust structure), the onboarding StateMachine (tracking per-user per-concept state), and the Learn/Explain Surface modes. Each of these is a non-trivial feature that depends on the core platform being functional. The self-documentation domain is a second-order feature that requires first-order features to work.

**Domain bundling overhead.** For a single-domain deployment (which is likely the first several iterations), domains add overhead without benefit. The domain abstraction becomes valuable when you need to package the platform for different audiences — but that's a scale concern, not a phase 1 concern. A senior developer may be tempted to build domain packaging infrastructure before it's needed.

**Export template maintenance.** The bidirectional mapping between vivief concepts and conventional equivalents is a portability promise. But mapping maintenance is ongoing: when a concept evolves (as they have from v1 through v4), the export templates must evolve too. This is a documentation burden that scales with concept complexity.

**The anti-pattern Guards can become their own anti-pattern.** The three named anti-patterns (utility-as-creation, Contract-on-everything, Projection-splitting) are correct. But graduated enforcement (explain → warn → block) means someone must decide when to advance from "warn" to "block." That decision is a judgment call that the concepts push to the team — which is the right architectural answer but means the Guards are only as effective as the team's willingness to advance them.

---

## 8. What's Genuinely Novel (Worth Protecting)

Everything identified in the v3 review remains novel and worth protecting. v4 adds:

**Deterministic-first as an improvement trajectory.** The loop "LLM handles edge case via reasoning → LLM observes pattern → LLM proposes deterministic rule → team reviews → system enforces" is not found in other platforms. Most AI-integrated systems either stay fully probabilistic or fully deterministic. The formalized progression from one to the other — with the LLM as the agent of that progression — is genuinely new.

**Anti-pattern Guards with graduated enforcement.** Named anti-patterns with "explain → warn → block" progression, where the advancement is itself a datom assertion with provenance, is a novel approach to team-level quality management. It's not just linting — it's linting that teaches, then warns, then enforces, with the progression tracked and auditable.

**Composite Projection as named namespace map.** The decision that composition is "named slots, not union or precedence" with each constituent keeping its own trust scope, delivery mode, and access rules is a clean answer to a hard problem. Most systems that compose data sources either merge (losing provenance) or layer (creating precedence ambiguity). Named slots avoid both.

**Live Projection two-tier lifecycle.** The distinction between ephemeral (Surface-bound, garbage collected) and persistent (independent entity, survives Surface unmount) is the right architectural distinction for reactive subscriptions. Most reactive frameworks have one tier — vivief's two-tier model prevents the common problems of subscription leak (ephemeral dies with Surface) and subscription loss (persistent survives).

**Domain as a named composite of existing concepts.** Not a new concept — just a packaging pattern. But the explicit packaging of Schema + Behavior Contracts + Surface template + onboarding StateMachine into a queryable, evolvable bundle is valuable. Most platforms that support multiple audiences do so through feature flags and configuration; vivief does so through concept composition.

**Platform self-documentation as a creation domain.** The insight that onboarding IS creation (explanation datoms produced by an LLM effectHandler under a Behavior Contract, cached, trust-scored, audience-tailored) is not found in other platforms. Most platforms have documentation; vivief has documentation that is structurally identical to any other feature.

---

## 9. Opportunities to Improve

These are not gaps — the concepts are implementation-ready. These are refinements that would strengthen the document or become necessary during implementation.

### A. Structural opportunities

**1. Separate the specification from the philosophy.** v4's 857 lines contain two documents: a concept specification (comparable to v3's 627 lines) and a platform philosophy (the deterministic-first principle, self-documentation, domains, portability). Consider restructuring: the core specification (§1-§3, §8, §10-§12) as the implementer's reference, and the platform philosophy (§4-§7, §9) as a companion document. This reduces the implementer's reading burden and lets the philosophy evolve independently.

**2. Implementation phase mapping for v4 additions.** v3 had an implementation KB that mapped concepts to phases. v4's additions need similar guidance. Without it, a team may attempt to build the onboarding domain before the core platform is functional. A brief "what to build when" appendix would prevent this.

**3. Contract decision tree as a first-class artifact.** The anti-patterns section names three things NOT to do, and §4 mentions a "Contract decision tree" as an LLM-generated artifact. But the positive guidance — "when SHOULD I add a Contract?" — is still distributed across examples rather than consolidated. A concise decision tree ("Does this handler have safety implications? → Behavior Contract. Is this Surface user-facing? → Render Contract with a11y. Is this data from an external source? → Schema Contract + trust scoring.") would reduce decision paralysis.

**4. Operations perspective.** The creation loop models building well. Add a brief "Operations" section or named pattern that covers: system health monitoring (live-persistent Projection), incident response (escalation StateMachine), deployment validation (Contract enforcement at deploy boundary), and post-deployment observation (observability datoms). This would close the gap between "building with vivief" and "running vivief in production."

### B. Concept-level refinements

**5. Model evolution and deprecation.** `:tx/source` captures which model produced a datom. But when a model is deprecated (`:ai/opus-4` → `:ai/opus-5`), what happens to trust score defaults? To existing datoms attributed to the old model? To Behavior Contracts that reference the old model? A brief model evolution pattern — perhaps analogous to schema evolution (additive by default, migration handler for breaking changes) — would address this.

**6. Operational Projection patterns.** Debug profiles are specified for development-time failure analysis. Add named patterns for operations: `Projection.health(domain)` for system health dashboards, `Projection.alerts(severity, timeWindow)` for alerting Projections, `Projection.audit(entity, actor, timeRange)` for compliance audits. These are factory functions like the existing profiles — convenience without concept change.

**7. Domain composition rules.** v4 says domains are "composable" but doesn't define composition. Before any deployment needs two domains simultaneously, specify: are domains exclusive (one active per deployment) or composable (multiple active, with merge rules)? If composable, how do Contract conflicts between domains resolve? The "newest wins" rule may not apply across domains.

**8. The creation loop's exit conditions.** The creation loop re-enters on validation failure with escalation. But the loop needs explicit termination conditions beyond "human resolves." What if the human doesn't resolve? What if all fix strategies exhaust? A "creation abandoned" state with provenance (`:creation/abandoned-by`, `:creation/abandoned-reason`) would make incomplete creation auditable rather than silently stalled.

### C. Documentation refinements

**9. Concept count discipline.** The document is at exactly the right concept count (5). But v4 introduces terminology that feels concept-adjacent: "domain," "bridge," "artifact," "anti-pattern Guard," "deterministic-first loop." These are patterns within the five concepts, not new concepts — but the document should explicitly maintain this distinction. A brief note in §1: "The following are patterns, not concepts: domain, bridge, artifact, slice, profile. They compose the five concepts but don't extend them."

**10. Glossary organization.** The glossary (§12) has grown to 54 entries. Consider grouping by concept (Datom terms, Projection terms, Surface terms, Contract terms, effectHandler terms, Cross-cutting terms) rather than the current alphabetical listing. This would help developers find related terms and understand which concept owns each term.

**11. Example-driven validation.** v4 has two walkthroughs: "A Day in Creation" (system perspective) and "A Day in Creation — The Counselor's Perspective." Add a third: "A Day in Creation — The Developer's Perspective" showing a developer implementing a new Feature-slice feature. This would validate the developer experience in the same way the counselor walkthrough validates the non-developer experience.

### D. Verification scenarios

These scenarios should pass a concept-level walkthrough before implementation:

**12. Onboarding bootstrap.** The explanation handler needs concept Projections to work. Concept Projections need the platform to be running. The platform needs to be built. What does onboarding look like before the explanation handler exists? (Expected: static documentation first, replaced by explanation handler when the platform is mature enough.)

**13. Domain conflict.** A clinical domain has a Schema Contract requiring `:session/diagnosis`. A regulatory update adds a Contract forbidding `:session/diagnosis` in certain jurisdictions. Both are active in the same domain. (Expected: `:contract/conflict` datom, escalation to human, resolved by jurisdiction-scoped Contract with Trust-over-structure rule.)

**14. Deterministic-first degradation.** The LLM proposes a lint rule that is accepted and enforced. Later, the rule produces false positives in a new context. (Expected: rule can be superseded via Contract lifecycle. Team asserts a new version. Old rule still in the log for audit. LLM observes the false positives and proposes a refined rule.)

**15. Export template accuracy.** A vivief Projection with trustThreshold, redaction, and live-persistent delivery is exported to a "conventional equivalent." The conventional equivalent (SQL view + WebSocket + RBAC) doesn't capture trust scoring. (Expected: export template marks incomplete mappings. Export is a best-effort read-only snapshot, not a runtime equivalent. The limitations are documented in the export.)

---

## 10. Evolution Assessment — v1 → v2 → v3 → v4

| Aspect | v1 | v2 | v3 | v4 |
|--------|-----|-----|-----|-----|
| Concept count | 5 | 5 | 5 | 5 |
| Document lines | ~300 | ~500 | ~627 | ~857 |
| Trust model | Zones, roles | + Provenance, scoring, scoped Projection | + Assignment rules, propagation, override | + Override boundary (hybrid), min-propagation clarification |
| Contract model | Cross-cutting, 6 sub-types | + Security, defaults lifecycle | + Lifecycle (4 states), coverage, trust-over-structure | + Anti-pattern Guards, graduated enforcement |
| Creation model | Single loop, 3 strategies | + Bridge, LLM context, non-dev | + Slices, promotion, cache invalidation, boundary | + Counselor walkthrough, deterministic-first loop |
| Projection model | Full interface | + trustThreshold | + Named profiles | + Composite, two-tier live, debug profiles |
| Surface model | 6 modes | Same | + Binding as datom | + 2 new modes (Learn, Explain), trust signals expanded |
| Failure model | Not specified | Not specified | Graceful + crash | Same (no change needed) |
| Schema evolution | Not specified | Not specified | Additive + migration handler | Same (no change needed) |
| Self-documentation | Not addressed | Not addressed | Not addressed | **Full domain: onboarding, explanation, guardrails** |
| Portability | Not addressed | Not addressed | Not addressed | **Export + migration templates** |
| Domain packaging | Not addressed | Not addressed | Not addressed | **Named configuration bundles** |
| Implementation readiness | Conceptual | Near-ready (gaps) | **Ready** | **Ready + visionary** |

**The trajectory:** v1 established the model. v2 added trust and creation. v3 closed the operational gaps. v4 added the meta-layer: the platform's relationship with itself (self-documentation), its users (domains, onboarding), and the outside world (portability, migration). A hypothetical v5 would likely focus on implementation learnings rather than concept additions — the conceptual surface area is comprehensive.

---

## 11. Risk Assessment

### Risks carried forward from v3

| Risk | v3 status | v4 status | Mitigation |
|------|-----------|-----------|------------|
| **Over-modeling** | Named as biggest risk | Mitigated by creation boundary + anti-pattern Guards | Anti-pattern Guards are the right response. Still requires team discipline. |
| **Ecosystem isolation** | Named as loss | Mitigated by export/migration templates | Templates reduce perceived lock-in. Actual portability requires implementation. |
| **Upfront conceptual investment** | Named as loss | Partially mitigated by onboarding StateMachine + domains | Still the steepest cost. Domains and onboarding help at scale, not at day 1. |
| **Debugging complexity** | Named as loss | Mitigated by debug Projection profiles | Named debug profiles for common patterns reduce the "query the log" burden. |
| **Contract proliferation** | Named as loss | Mitigated by anti-patterns + decision guidance in §4 | Better than v3 but still requires judgment. No mechanical guard against proliferation. |

### New risks in v4

| Risk | Description | Severity | Mitigation |
|------|-------------|----------|------------|
| **Document overload** | 857 lines, mixing specification and philosophy. Harder to use as pure reference. | Medium | Separate spec from philosophy (opportunity #1). |
| **Self-documentation bootstrap** | Explanation handler requires working platform. Onboarding features are second-order. | Low | Acknowledge in implementation guide. Static docs first. |
| **Domain complexity before need** | Domain packaging is overhead for single-domain deployments. | Low | Defer domain implementation until second domain is needed. |
| **Deterministic-first over-promise** | The "system gets more deterministic over time" trajectory depends on LLM quality. | Medium | Frame as aspirational trajectory, not guaranteed outcome. Track rule quality metrics. |
| **Concept count inflation via patterns** | 54 glossary entries, 13+ named patterns. Risk of feeling like more than 5 concepts. | Medium | Explicitly maintain concept vs. pattern distinction (opportunity #9). |

---

## 12. Final Assessment

### Are the concepts usable and complete enough to start implementation?

**Yes.** Everything needed for phases 1-4 was already in v3 and remains unchanged. v4 adds no new dependencies or blockers. The additions are all phase 5+ concerns that enrich the platform after its foundations are proven. A team that starts building today can use the v3 phasing with v4 as the expanded vision for where they're going.

### Are the concepts a good way to express development with humans, AI, and deterministic systems?

**Yes, and v4 makes this significantly stronger than v3.** The deterministic-first principle ("LLM authors, system enforces, LLM refines") is the document's best new idea. It gives the human+AI+system paradigm an improvement trajectory — not just a division of labor but a direction of travel. The system gets more deterministic over time, which means more auditable, more predictable, and less dependent on probabilistic reasoning for routine operations.

The three trust strategies remain the right model. The escalation StateMachine remains the right fix mechanism. The creation loop remains the right universal pattern. v4 doesn't change any of these — it adds the meta-layer that lets the platform improve itself using the same patterns.

### What does a senior developer gain?

One mental model for everything (unchanged from v3). Plus: graduated guardrails against over-modeling, a deterministic improvement trajectory for the system's quality, portability confidence via export templates, domain packaging for team scaling, self-documenting system structure, and named debug profiles for common failure investigation.

### What does a senior developer lose?

Familiarity (unchanged from v3). Plus: a larger conceptual surface area to hold in mind (54 glossary entries vs. v3's 37), a document that mixes specification with philosophy, a self-documentation domain that's compelling but second-order, and the expectation that the deterministic-first trajectory will deliver on its promise.

### What should be protected through implementation?

Everything from the v3 review (trust score as flowing attribute, Contract lifecycle as self-hosting, redaction as compute/display separation, creation boundary, additive schema, failure as datoms, conceptual slices). Plus:

- **Deterministic-first as improvement trajectory.** The formalized loop from probabilistic to deterministic is v4's most important new idea.
- **Anti-pattern Guards with graduated enforcement.** The named patterns plus explain → warn → block progression.
- **Composite Projection as named namespace map.** The "no lossy merging" design decision.
- **Live Projection two-tier lifecycle.** Ephemeral vs. persistent is the right distinction.
- **The five-concept discipline.** Four iterations, zero concept additions. Protect this boundary.

### What's the single biggest risk?

**Document scope.** v4 is trying to be three things: a concept specification, a platform philosophy, and an adoption strategy. It succeeds at all three, but the combination makes the document harder to use for any single purpose. The risk is that an implementation team reads v4 and feels the need to build everything before they can build anything — the self-documentation domain, the domain packaging, the export templates — when what they need is to commit the first datom.

The mitigation is structural: separate the specification from the philosophy (opportunity #1), provide explicit phase guidance for v4 additions (opportunity #2), and maintain the concept vs. pattern distinction (opportunity #9). The concepts are ready. The document needs editorial discipline to match.

### What's the single biggest opportunity?

**The deterministic-first loop in practice.** If the "LLM authors, system enforces, LLM refines" trajectory works as described, it produces a platform that genuinely improves with use — where the LLM's contributions become the system's permanent intelligence over time. This is the most ambitious claim in the document. If it works, it's the platform's defining characteristic. Validating it early — even with a simple example like anti-pattern detection — would be the highest-value implementation milestone after the core platform is functional.

---

*Review document. Written against vivief-concepts-v4.md. Covers: v3 gap closure scorecard (§2), implementation readiness (§3), conceptual system evaluation (§4), paradigm fit for human+AI+deterministic work (§5), senior developer gains (§6) and losses (§7), novel primitives worth protecting (§8), improvement opportunities (§9), evolution assessment v1→v2→v3→v4 (§10), risk assessment (§11), and final assessment (§12). Written in the context of the full concept evolution from v1 through v4, including brainstorm documents, previous reviews, and the implementation KB.*
