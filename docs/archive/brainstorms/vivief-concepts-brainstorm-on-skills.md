# Vivief Concepts — Brainstorm: Skills, Intent, and the Contract Enforcement Duality

> **Resolved in v6.** Both gaps identified here (Intent formalization, Contract enforcement duality) and all open questions are resolved in vivief-concepts-v6.md and vivief-concepts-v6-implementation-kb.md.

> Skills aren't a missing concept. They're a lens that reveals two deeper gaps in v5: Intent is unformalized, and Contract enforcement is underspecified. This brainstorm resolves both and shows how skills fit naturally once the gaps close.

---

## 1. Why This Brainstorm Exists

The vivief-concepts-v5.md defines five concepts (Datom, Projection, Surface, Contract, effectHandler) and names several patterns (domain, bridge, artifact, slice, profile). Skills appear nowhere. The existing devac plugin, however, already has 13 commands and 10 auto-activating skills with knowledge directories — a working skill infrastructure that predates the v5 conceptual framework.

The initial hypothesis was that "skill" might be a 6th concept or a missing pattern. Three rounds of interrogation revealed something more interesting: **skills aren't missing from v5 because they were forgotten — they're missing because v5 has two gaps that, once closed, make skills fall out naturally.**

**Gap 1: Intent is unformalized.** The creation loop (v5 §3) says `Intent → Contract → Create → Validate` but never defines "Intent." It's the one word in the loop that isn't a concept.

**Gap 2: Contract enforcement is underspecified.** v5 says "A Contract declares. An effectHandler enforces." But in practice, there are two distinct effectHandlers: one doing the work, one enforcing the Contract. Their relationship isn't resolved.

Close these gaps and skills emerge as what they are: effectHandlers implemented in markdown, composing other effectHandlers, governed by Contracts — no new concept needed.

**Structure.** This document first addresses the two gaps (§2–4), then maps skills into the resolved framework (§5–7), explores practical patterns (§8–11), and closes with specific recommendations for v5/v6 and open questions (§12–13).

---

## 2. Gap 1: Intent Is an Effect — Formalize It

### The Problem

The creation loop in v5 §3:

```
Intent → Contract → Create → Validate
```

"Intent" is the entry point to all creation, but v5 never defines it. Every other element in the loop maps to a concept: Contract is a concept, Create maps to effectHandler, Validate maps to Contract enforcement. But Intent? It's a word in a diagram.

### The Resolution

Intent is already in v5 — it's the `effect` parameter in `handler(state, effect)`.

When a counselor clicks "Prepare for 9:00" — that's `:effect/prepare-session`. When `devac sync` runs — that's `:effect/sync-requested`. When an LLM finishes generating — that's `:effect/generation-complete`. Every creation starts with an effect that carries the "what to create" payload.

This isn't a new insight. It's making explicit what v5 already implies:

| v5 term | What it actually is |
|---------|-------------------|
| **Intent** | An effect — the triggering event that enters the creation loop |
| **Contract** | Governance — what's valid for this creation |
| **Create** | An effectHandler — the actor that does the work |
| **Validate** | Contract enforcement — another effectHandler (or the same one) checking the result |

### What Intent Carries

An Intent-effect is richer than a bare event name. It carries context:

```
[:effect/prepare-session  :intent/client     client:42       tx:N  true]
[:effect/prepare-session  :intent/depth      :quick          tx:N  true]
[:effect/prepare-session  :intent/requester  :human          tx:N  true]
```

The Intent-effect specifies *what* to create, *for whom*, and *at what depth*. The Contract specifies *what's valid*. The effectHandler *does the work*. These are three different concerns that v5 already separates — Intent just needs a name.

### Recommendation for v5

Make Intent explicit in §3 "The Creation Loop":

> **Intent.** The effect that triggers creation. Intent is an effect — the `effect` parameter in `handler(state, effect)`. It carries what-to-create, for-whom, and at-what-depth as datom attributes. Formalizing Intent doesn't add a concept — it names what the `effect` parameter already is when it enters the creation loop.

Add to the §11 Glossary:

> **Intent** | The effect that enters the creation loop — carries the what-to-create payload, context, and requester identity.

---

## 3. Gap 2: The Contract Enforcement Duality

### The Problem

v5 §1 says: "A Contract declares. An effectHandler enforces." And v5 §2.4 says: "Every active Contract has an effectHandler that applies it."

But in the creation loop, two different effectHandlers are at work:

1. **The work handler** — does the creation (e.g., generates a session recap, computes risk level)
2. **The enforcement handler** — validates the work against the Contract (e.g., checks that recap doesn't contain diagnosis language, checks that risk level is a valid enum)

v5 doesn't clearly distinguish these two roles. The creation loop diagram conflates "Create" and "Validate" into separate boxes, but both are effectHandler executions. Who orchestrates them? What's their relationship? Who owns the Contract enforcement — the infrastructure, the handler itself, or both?

This matters because it determines how skills (§5), the deterministic-first loop (§7), and the full creation wiring (§4) are implemented.

### Three Architectural Options

#### Option A: External Enforcement (Contract as Wrapper)

The Contract wraps the work handler externally. An enforcement handler sits between the intent and the worker:

```
Intent → ContractEnforcer(Contract, workHandler) → Result
         │                                    │
         ├─ pre-validate intent               │
         ├─ delegate to workHandler            │
         ├─ post-validate result               │
         └─ reject or pass ─────────────────────┘
```

The ContractEnforcer is infrastructure — a system-level effectHandler that:
- Validates the Intent against Contract preconditions
- Delegates to the work handler
- Validates the result against Contract postconditions
- Emits `:effect/validation-failed` on rejection

**Pros:**

| Advantage | Why it matters |
|-----------|---------------|
| **Clean separation** | Work handler doesn't know about enforcement. It just does its job. Contract enforcement is orthogonal. |
| **Reusable enforcers** | One Schema Contract enforcer validates all datom writes. One in-flight Contract enforcer validates all streaming tokens. No duplication. |
| **Auditable** | Enforcement is visible in the effect log. You can see that validation ran, what it checked, whether it passed. The work handler can't silently skip it. |
| **Testable independently** | Test the enforcer with fixture Contracts. Test the work handler with fixture datoms. Neither depends on the other for testing. |
| **Trust-appropriate** | An LLM-implemented work handler (trust: 0.85) is wrapped by a system enforcer (trust: 1.0). The enforcement is more trusted than the worker — which is exactly right. |

**Cons:**

| Disadvantage | Why it matters |
|-------------|---------------|
| **Two handlers per operation** | Every constrained creation involves two effectHandler executions. Overhead for simple cases. |
| **Routing complexity** | Something must wire Intent → enforcer → worker → enforcer → result. Who does that wiring? |
| **In-flight tension** | For streaming (Dialog mode), the enforcer must validate each chunk without blocking the stream. This is architecturally different from pre/post validation. |
| **Lifecycle coupling** | The enforcer must know which Contract applies to which handler. This is a registry/discovery problem. |

#### Option B: Internal Enforcement (effectHandler Self-Enforces)

The work handler contains its own Contract enforcement internally:

```
Intent → workHandler(state, effect) {
           contractEnforcer.validateInput(effect)
           result = doWork(state, effect)
           contractEnforcer.validateOutput(result)
           return result
         } → Result
```

The handler calls a `contractEnforcer` utility (below the creation boundary — it's a function, not a concept) to validate its own inputs and outputs.

**Pros:**

| Advantage | Why it matters |
|-----------|---------------|
| **Self-contained** | One handler, one responsibility boundary. The handler knows its Contract and enforces it. Simple mental model. |
| **No wiring** | No external orchestrator needed. The handler is the unit of deployment. |
| **Handler-specific validation** | The handler can validate domain-specific constraints that only it understands (e.g., "these two fields are mutually exclusive in this context"). |
| **Gradual adoption** | Handlers can start without enforcement and add it as Contracts mature. No infrastructure change needed. |

**Cons:**

| Disadvantage | Why it matters |
|-------------|---------------|
| **Trust inversion** | An LLM-implemented handler (trust: 0.85) enforcing its own Contract? The enforcer is only as trusted as the handler. An actor can't meaningfully audit itself. |
| **Coupled** | Changing the Contract requires changing every handler that enforces it. If three handlers share one Contract, the enforcement code is duplicated three times. |
| **Silent skipping** | Nothing prevents a handler from skipping validation. In Option A, the infrastructure guarantees enforcement. Here, it's voluntary. |
| **Harder to audit** | The effect log shows the handler ran, but not whether it validated. You'd need explicit validation datoms from inside the handler, which is enforcement-as-creation (a separate concern). |

#### Option C: Layered Enforcement (Both)

Different Contract types get different enforcement strategies:

| Contract type | Enforcement | Rationale |
|---------------|-------------|-----------|
| **Schema Contract** | External (infrastructure) | Data integrity is non-negotiable. The store validates before commit. No handler can skip this. |
| **Trust Contract** | External (infrastructure) | Security is non-negotiable. Key derivation and access control are system concerns. |
| **Render Contract** | External (tooling) | axe scanning is external to the Surface. Storybook stories run outside the component. |
| **Behavior Contract** | Internal (handler) | The handler knows its own state machine. It validates its own transitions. |
| **In-flight Contract** | External (pipeline) | Streaming validation sits between producer and consumer. Neither owns it. |
| **Sync Contract** | External (infrastructure) | Conflict resolution is a replication concern, not a handler concern. |

**Pros:**

| Advantage | Why it matters |
|-----------|---------------|
| **Pragmatic** | Matches how enforcement already works. Schema validation IS infrastructure (the store does it). Behavior validation IS handler-specific (XState does it internally). |
| **Trust-aligned** | Critical Contracts (Schema, Trust) get untrusted-actor-proof enforcement. Domain Contracts (Behavior) get handler-appropriate enforcement. |
| **Already implied by v5** | v5 §2.4 already describes pre-commit (infrastructure), in-flight (pipeline), and post-commit (async) as three temporal validation points. Option C makes this per-Contract-type, not just per-time. |
| **Gradual** | Start with infrastructure enforcement for Schema/Trust. Add handler-level Behavior enforcement as handlers mature. No big-bang architecture. |

**Cons:**

| Disadvantage | Why it matters |
|-------------|---------------|
| **Two mental models** | Developers must know which Contracts are externally enforced and which are internally enforced. The boundary could be confusing. |
| **Fuzzy boundary** | When does a Behavior Contract become critical enough for external enforcement? The line is domain-specific, not universal. |
| **Testing complexity** | External enforcement is tested via infrastructure tests. Internal enforcement is tested via handler tests. Different test strategies for the same concept (Contract). |

### Analysis

Option C is the strongest fit for v5 because **v5 already implies it**. The three temporal validation points (pre-commit, in-flight, post-commit) map naturally to external enforcement. The Behavior Contract with its StateMachine mode maps naturally to internal enforcement (XState validates transitions inside the handler).

The key insight: **the enforcement strategy should follow the trust boundary, not a universal rule.**

- When the handler is less trusted than the Contract requires → external enforcement (the system doesn't trust the handler to check itself)
- When the handler IS the Contract (StateMachine) → internal enforcement (the machine definition IS the constraint)
- When enforcement is domain-specific and the handler understands the domain → internal, with the option to externalize as the Contract matures

This maps directly to the deterministic-first loop: internal enforcement starts as handler-specific logic, and as patterns emerge, the enforcement externalizes into infrastructure. **Enforcement migrates outward as trust increases.**

### Recommendation for v5

Add to §2.4 Contract:

> **Enforcement strategy.** A Contract's enforcement follows the trust boundary:
>
> | When | Strategy | Example |
> |------|----------|---------|
> | Handler is less trusted than Contract requires | **External** — infrastructure enforces | Schema Contract validated by store, Trust Contract by key derivation layer |
> | Handler embodies the Contract | **Internal** — handler IS the constraint | StateMachine Behavior Contract where XState definition is the handler |
> | Enforcement is domain-specific | **Internal, externalizable** — starts in handler, migrates to infrastructure as patterns mature | Clinical Guard Contract starts as handler logic, evolves to infrastructure rule |
>
> Enforcement migrates outward as trust increases. This is the deterministic-first loop applied to Contract enforcement itself.

---

## 4. The Named Wiring: What to Call the Full Creation Cycle

### The Problem

The creation loop `Intent → Contract → Create → Validate` is a cycle, not a named thing. You can draw it, but you can't reference it. The user identified: `Contract(Intent, effectHandler) → Result` needs a name — both for the full wiring and for the output.

### What the Wiring Contains

```
┌─────────────────────────────────────────────┐
│  ???name???                                  │
│                                              │
│  Intent (effect)                             │
│    ↓                                         │
│  Contract (governance — what's valid)        │
│    ↓                                         │
│  effectHandler (execution — does the work)   │
│    ↓                                         │
│  Enforcement (validation — checks result)    │
│    ↓                                         │
│  ???result-name??? (datoms produced)          │
└─────────────────────────────────────────────┘
```

This is the atomic unit of creation. Everything vivief does — a session recap, a code analysis, a skill authoring, a Contract proposal — is an instance of this wiring.

### Candidate Names for the Full Wiring

| Candidate | Argument for | Argument against |
|-----------|-------------|-----------------|
| **Creation** | Already used in v5 §3. Natural language. | Too broad — "creation" also refers to the loop, the philosophy, the section title. Overloaded. |
| **Work** | Simple. "A Work is an Intent governed by a Contract, executed by an effectHandler." | Generic. Doesn't convey the Contract governance aspect. |
| **Task** | Familiar. Implies a unit of work with a defined outcome. | Overloaded in software (async tasks, task queues). Could confuse. |
| **Act** | "An Act of creation." Implies agency, intention, governance. | Theatrical connotations. "ActHandler" is awkward. |
| **Operation** | Used in v5 §3 ("Operations as Creation of Understanding"). Already in the vocabulary. | Also overloaded (database operations, system operations). |
| **Commission** | "To commission = to authorize and direct creation." Carries Contract (authorization) + effectHandler (direction) naturally. | Formal. Might feel heavy for simple cases. |
| **Mandate** | "A Mandate = Intent + Contract + Handler." Carries authority (Contract) and execution (Handler). | Even more formal than Commission. |
| **Engagement** | "An Engagement binds Intent, Contract, and Handler into a governed creation." | Could confuse with user engagement metrics. |

### Candidate Names for the Result

| Candidate | Argument for | Argument against |
|-----------|-------------|-----------------|
| **Outcome** | Neutral. "The Outcome of a creation is datoms." | Doesn't convey that outcomes are datoms specifically. |
| **Product** | "The Product of creation." Manufacturing metaphor fits creation. | Could confuse with product management. |
| **Yield** | "A creation yields datoms." Functional programming connotation (generator yield). | Niche term. |
| **Artifact** | Already in v5 as a pattern. "Creation produces artifacts." | v5 uses "artifact" for source code, images, documents — things in native mediums. Not the same as datoms. |
| **Commit** | "Validated datoms commit to the store." Already in v5 vocabulary. | Too git-specific. Also used for the datom store commit action. |

### Analysis

The wiring doesn't need a heavy name because it's not a new concept — it's the composition of existing concepts. What matters is that v5 makes the composition explicit and referenceable.

**Lightweight approach**: Don't add a new term. Instead, sharpen the creation loop description to make the wiring clear:

```
effect (Intent) → Contract(effectHandler) → datoms (Result)
```

Read as: "An effect enters the creation loop. A Contract governs the effectHandler that processes it. The result is datoms."

This uses only existing v5 vocabulary. No new name needed. The creation loop IS the named thing — it just needs its components mapped to concepts.

**If a name IS needed**, "Commission" captures the essential meaning: authorized (Contract) direction (Intent) of work (effectHandler). "The system commissions a session recap" reads naturally. But this is a style choice, not a conceptual necessity.

**Post-brainstorm resolution**: Keep using effectHandler. An effectHandler can be **Contract-governed** — `Contract(effectHandler)` — where the Contract wraps the handler, enforcing preconditions on intent and postconditions on result. This is the standard pattern inside the creation loop. The handler remains an effectHandler; the Contract adds governance, not identity. No new term needed.

### Recommendation for v5

Add to §2.5 effectHandler:

> An effectHandler can be **Contract-governed**: `Contract(effectHandler)` — the Contract wraps the handler, enforcing preconditions on intent and postconditions on result. This is the standard pattern inside the creation loop. The handler remains an effectHandler; the Contract adds governance, not identity.

Sharpen the creation loop in §3 to map each step to a concept:

```
effect (Intent) → Contract(effectHandler) → datoms (result)
```

Read as: "An effect enters the creation loop. A Contract governs the effectHandler that processes it. The result is datoms." No new name needed — the vocabulary is already sufficient.

---

## 5. A Skill IS an effectHandler

### The Mapping

A skill, as it exists today in the devac plugin, is:

- A **markdown file** that describes a workflow
- **Triggered** explicitly (slash command: `/commit`) or by LLM decision (auto-activation via conversation detection)
- **Executed** by an LLM runtime that interprets the markdown as instructions
- **Composes** other effectHandlers internally (CLI commands like `devac sync`, `devac status`, `git commit`)
- **Produces** effects (datoms, file changes, git operations)

In vivief terms:

```
skill = effectHandler(state, intent-effect) {
  // state: gathered via Projection (context, prior results)
  // internal steps: compose other effectHandlers
  //   - deterministic: CLI commands wrapping effectHandlers
  //   - LLM-mediated: reasoning, drafting, analysis
  // result: datoms + effects
}
```

A skill is not a new concept. It's an **effectHandler implementation strategy** where:
- The implementation language is markdown (natural language instructions)
- The runtime is an LLM (interprets and executes the instructions)
- The internal effects can be deterministic (CLI) or LLM-mediated (reasoning)

### Claude Code Skills vs. Vivief Skills

| Aspect | Claude Code skill | Vivief skill (generalized) |
|--------|------------------|---------------------------|
| **Format** | Markdown file in `commands/` or `skills/` | Datoms describing the effectHandler (stored in the datom store) |
| **Trigger** | Slash command or conversation detection | Effect pattern matching (same as any effectHandler) |
| **Runtime** | Claude (specific LLM) | Any LLM actor, or eventually deterministic runtime |
| **State** | Conversation context + file system | Projection over datom store |
| **Trust** | Implicit (Claude's capability) | Explicit (`:tx/source :ai/text-generation`, trust score 0.85) |
| **Governance** | Implicit (markdown instructions) | Explicit (Behavior Contract on the effectHandler) |
| **Composition** | Calls CLI commands, reads files | Emits effects to other effectHandlers |
| **Lifecycle** | File exists or doesn't | Contract lifecycle (asserted → active → superseded) |

**The generalization**: Claude Code skills are a specific implementation of what vivief calls "an LLM-implemented effectHandler." The vivief generalization adds:
- Trust scoring on skill output
- Contract governance on skill behavior
- Datom-native storage and discovery
- Lifecycle management (versioning, supersession)
- The deterministic-first evolution path (skills become more deterministic over time)

**Both are needed at this stage.** Claude Code skills are the pragmatic implementation. Vivief skills are the conceptual model. The gap is that the conceptual model doesn't yet acknowledge LLM-implemented effectHandlers explicitly — it should.

### Skills Across LLM Platforms — Not a Standard

Claude Code skills are **not** a cross-LLM standard. Each platform has its own approach:

| LLM Platform | "Skill" equivalent | Format | Portable? |
|---|---|---|---|
| **Claude Code** | Skills (markdown in `commands/`, `skills/`) | Markdown with triggers | Claude Code only |
| **OpenAI GPTs** | Custom Instructions + Actions | System prompts + OpenAPI specs | OpenAI only |
| **Google Gemini** | Extensions + Function Declarations | API-based, proprietary | Google only |
| **LangChain/LangGraph** | Tools + Agents | Python functions with schemas | Framework-specific |
| **MCP** | Tools + Prompts + Resources | JSON-RPC protocol | **Cross-LLM** (growing adoption) |

**What devac already demonstrates**: The three-layer architecture separates concerns by portability:

```
effectHandler (devac-core)          → LLM-agnostic, pure logic
  ├── MCP tool (devac-mcp)          → cross-LLM (MCP protocol)
  ├── CLI command (devac-cli)       → universal (any LLM with shell)
  └── skill (plugins/devac/)        → Claude Code-specific orchestration
```

**What skills add that MCP/CLI don't**: MCP exposes *what* an LLM CAN do (individual tools). CLI exposes the same via shell. But a skill defines *how* to orchestrate a multi-step workflow. `/commit` isn't a single tool call — it's "check diff → check blockers → draft message → check changeset → execute → summarize." That orchestration layer is what skills provide.

**The vivief generalization**: In vivief terms, the skill (orchestration layer) is an effectHandler that composes other effectHandlers. The implementation medium (markdown for Claude, Python for LangChain, system prompt for GPTs) varies, but the concept is the same: a higher-level effectHandler that sequences lower-level ones.

This means vivief doesn't need to standardize on a skill format — it needs to ensure effectHandlers are exposable via MCP (cross-LLM) and CLI (universal). The orchestration layer (skill) can be platform-specific without loss, because the underlying effectHandlers are portable.

**For the implementation KB**: The devac pattern (core → MCP + CLI → skill) should be called out as the reference architecture for how effectHandlers become accessible to LLM agents across platforms.

### What This Means

v5 §2.5 effectHandler describes two levels: function and actor. Skills suggest a third dimension: **implementation strategy**.

| Implementation | Runtime | Example |
|---------------|---------|---------|
| **Code** | TypeScript/Node.js | `handler(state, effect) { ... }` — deterministic |
| **Markdown/LLM** | LLM interprets instructions | Skill file → LLM executes workflow |
| **StateMachine** | XState | Machine definition → XState runtime |
| **Hybrid** | Code + LLM | Deterministic steps with LLM for edge cases |

This isn't a new concept — it's acknowledging that effectHandlers can be implemented in different media, and the implementation strategy affects trust scoring, enforcement, and the deterministic-first evolution path.

---

## 6. The Skill Hierarchy — Who Creates and Maintains

### Three Layers

| Layer | Author | Trust | Scope | Example |
|-------|--------|-------|-------|---------|
| **Platform** | Platform team | `:system/analysis` (1.0) | All domains | `/sync`, `/validate`, `/status` |
| **Domain** | Domain experts | `:domain-refined` | Within domain | `/session-prep` (clinical), `/code-review` (developer) |
| **Personal** | Individual user | `:human` (1.0) for structure, `:ai/text-generation` (0.85) for LLM-mediated parts | Own scope | `/my-morning-brief`, `/hobby-tracker` |

### Trust Layering

A common concern: "If a user creates a personal skill that touches clinical data, whose trust wins?"

The answer is already in v5: **trust is orthogonal across these concerns.**

- **Skill trust** follows actor-type defaults (§2.1): the LLM parts of the skill have trust 0.85, the deterministic parts have trust 1.0
- **Data trust** follows datom provenance: each datom has its own `:tx/trust-score` regardless of which skill reads it
- **Propagation** follows the existing rule: `min(source_trusts)` — if the skill (0.85) processes a datom (1.0), the result is 0.85

The skill's trust score doesn't override the input datom's trust. The data's trust score doesn't change because a particular skill processed it. They compose via `min()`. This is already defined in v5 §2.1.

### Authoring as Creation

Skill authoring follows the creation loop — because it IS creation:

```
Intent: "I want to automate my session prep"
  → Contract: Behavior Contract (what the skill may access, what it may produce)
  → effectHandler: LLM drafts the skill definition (gated trust — human approves)
  → Validate: does the skill definition match the Behavior Contract?
  → Result: skill datoms in the store, ready for invocation
```

A counselor creating a skill doesn't think in these terms. They describe their workflow. The platform guides the creation loop. But the mechanics are the same as any other creation — same trust strategies, same validation, same escalation.

---

## 7. Knowledge Directories as Proto-Contracts — Evidence from devac

### What Exists

The devac plugin has 4 knowledge files across 2 skills:

| File | Content | Contract mapping |
|------|---------|-----------------|
| `quality-rules.md` (M1-M4) | Meta-rules for documentation generation | Proto-Behavior Contract |
| `tacit-insights.md` (effects) | Domain knowledge not in code/docs | Pre-proto — tacit knowledge capture |
| `c4-quality-rules.md` (G1-G4) | Quantitative gap metrics for C4 architecture | Proto-Behavior + Aggregation Contract |
| `tacit-insights.md` (architecture) | C4-specific heuristics | Pre-proto — domain-specific tacit knowledge |

### The Evidence: Deterministic-First in Action

The M1-M4 + G1-G4 rules show the deterministic-first loop already running:

```
Prompt v1 (no rules):         composite score ~28%
Prompt v4 (with M1-M4, G1-G4): composite score ~68%
Target:                        >65% (achieved)
```

This is exactly the trajectory v5 §1 describes: "LLM authors rules, system enforces them. The system gets more deterministic over time." The only difference is that these rules live in markdown files (knowledge directories) rather than as formalized Contracts in a datom store.

### The Evolution Path

```
tacit knowledge          → someone notices a pattern but it's not written down
  ↓
knowledge file           → pattern written in markdown, referenced by skill
  ↓
proto-Contract           → pattern has structure (rules, metrics, thresholds)
  ↓
proposed Contract        → formalized as datoms with :contract/type, evidence, confidence
  ↓
active Contract          → reviewed, validated, enforced by the system
  ↓
infrastructure Contract  → enforcement migrated to external (§3 Option C)
```

**Where the devac knowledge files sit**: M1-M4 and G1-G4 are at the "proto-Contract" stage — they have clear structure (numbered rules, quantitative thresholds, applicability conditions) but live in markdown files rather than the datom store. Tacit insights are one step earlier — "knowledge file" stage.

### What This Means

The knowledge directories are **not dead weight**. They're the intermediate form between LLM-discovered patterns and formalized Contracts. In vivief terms, they're what the deterministic-first loop produces *before* the system has Contract infrastructure.

When vivief has a working Contract system, these knowledge files become the first candidates for formalization:
- M1-M4 → Behavior Contract on documentation effectHandlers
- G1-G4 → Behavior + Aggregation Contract on architecture effectHandlers
- Tacit insights → input to the LLM rule-proposal step (v5 §6 "How Rules Are Proposed")

---

## 8. Where Skills Are Most Powerful

### Sweet Spots

**Repeating domain workflows.** A counselor prepares for sessions the same way every time: pull last session, check flagged items, suggest topics. A developer reviews PRs the same way: check diff, run tests, verify types, check for anti-patterns. These workflows are too specific for a generic Surface but too common to do manually each time. A skill captures the workflow as an effectHandler.

**Cross-concept composition.** A skill wires together a Projection (gather context), an effectHandler (process it), Contract constraints (validate the result), and Surface hints (how to present it). Without skills, this wiring is manual each time. With skills, the composition is reusable.

**Non-developer empowerment.** A counselor says "I always do X before Y." That's a skill being born. The platform guides the creation loop (Intent → Contract → Create → Validate), and the result is a new effectHandler — without the counselor knowing what an effectHandler is.

**Teaching the system.** Every skill execution produces effect datoms. Those datoms feed the deterministic-first loop (§7). Each skill run makes the system slightly smarter — patterns emerge, Contracts crystallize, enforcement becomes more deterministic. **Skills are the user-facing vehicle for the deterministic-first loop.**

**Skill-born Contracts.** A skill's knowledge directory (M1-M4 rules) evolves into a formal Contract. The skill was the incubator. The Contract is the graduate. Now the Contract can be enforced without the skill — but the skill continues to use it, plus it governs other handlers too. **Skills produce Contracts that outlive them.**

---

## 9. Where Skills Are Overkill

### Anti-patterns

**Simple CRUD.** If a Surface already handles "create new client" with a form and Schema Contract validation, wrapping it in a skill adds nothing. The Surface IS the interaction. Don't make users invoke `/create-client` when they can just fill out the form.

**One-time actions.** "Migrate the database schema for the v2 release" is a task, not a skill. It happens once. The overhead of creating, testing, and maintaining a skill exceeds the cost of just doing the migration.

**Pure utilities.** Formatting a date, parsing a string, computing a hash — these are below the creation boundary (v5 §1). They don't produce datoms. They don't need Contracts, trust strategies, or escalation. Don't wrap them in skills.

**Over-abstraction.** Creating a skill for every possible workflow is the same anti-pattern as "Contract-on-everything" (v5 §2.4). A skill should earn its existence through repetition. If you've done the workflow twice manually and it felt the same both times, consider a skill. If you've done it once, just do it.

**Decision rule**: Does this workflow (a) repeat, (b) produce datoms, and (c) benefit from governance? If yes to all three → skill. If no to any → just do it directly.

---

## 10. Elegant User-Facing Patterns

### Skill Birth from Conversation

```
Counselor: "Every Monday I check which clients have sessions this week,
            review their last session notes, and flag anyone who mentioned
            sleep issues."

System:    "I notice you've described a repeating workflow. Want me to
            create a skill for it? It would:
            - Query this week's sessions (Projection)
            - Pull last session summaries (Projection)
            - Filter for sleep-related themes (effectHandler)
            - Present flagged clients (Surface hint: Board mode)

            Trust level: AI-drafted, you approve before it activates."

Counselor: "Yes, call it 'Monday prep'"

System:    Creates skill datoms → gated trust → counselor reviews
           → activates → available as /monday-prep
```

The counselor never typed "effectHandler" or "Projection." But the system used the creation loop to create a skill — which is itself an effectHandler. Meta-creation through the same machinery.

### Skill Evolution via Deterministic-First Loop

```
Week 1:   /monday-prep runs → LLM handles all logic
           (trust: 0.85, fully LLM-mediated)

Week 4:   System notices: "sleep flag" always triggers on
           keywords ["insomnia", "can't sleep", "nightmares", "restless"]
           → proposes a Guard Contract for keyword matching

Week 5:   Counselor approves the Guard Contract
           → keyword matching becomes deterministic (trust: 1.0)
           → LLM still handles theme summarization (trust: 0.85)

Week 12:  Theme summarization patterns stabilize
           → system proposes Aggregation Contract for common themes
           → counselor approves → more deterministic

Month 6:  /monday-prep is 80% deterministic, 20% LLM
           → faster, cheaper, more consistent, higher trust
           → LLM handles genuinely novel cases only
```

**This is the compounding.** Each week of skill use feeds the deterministic-first loop. The skill becomes more trustworthy. The Contracts it births apply to other handlers too. The whole system learns.

### Skill Composition

```
/morning-brief
  ├─ for each client today:
  │    └─ /session-prep (another skill, invoked as effectHandler)
  ├─ aggregate flagged items across clients
  └─ render as Board Surface with trust signals
```

Composition follows effectHandler composition — a skill emits effects that trigger other effectHandlers (including other skills). The composite skill's trust is `min(constituent trusts)`. No new mechanism needed.

### Skill Discovery as Projection

Skills are datoms. Discovery is a Projection:

```typescript
Projection.snapshot(
  { filter: { ":skill/domain": "clinical", ":skill/status": "active" },
    sort: { ":skill/usage-count": "desc" },
    trustThreshold: 0.7 },
  capability
)
```

"Show me active clinical skills with trust above 0.7, most-used first." This is just a query — no new discovery mechanism needed.

### Skill Versioning

Skills follow the Contract lifecycle:

```
asserted     → skill defined, not yet available for use
active       → skill available, invocable
superseded   → replaced by newer version, still in log for audit
```

When a skill's governing Contract evolves (knowledge → proto-Contract → active Contract), the skill can be versioned: new version uses the formalized Contract, old version is superseded. Immutable history.

---

## 11. The Compounding Effect

Skills compound the system through four reinforcing loops:

### Loop 1: Skill → Effect Datoms → Pattern Recognition

Every skill execution produces effect datoms (what it did, what it queried, what it produced). These datoms are queryable via Projection. Over time, patterns emerge in the effect data.

### Loop 2: Patterns → Contract Proposals → Deterministic Enforcement

The LLM reads effect datoms, recognizes repeated patterns, and proposes Contracts (v5 §6). Human reviews and approves. The Contract becomes active. What was LLM reasoning becomes system enforcement.

### Loop 3: More Enforcement → Higher Trust → More Autonomy

As Contracts accumulate, more of the system's behavior is deterministically enforced. Trust increases. The system can operate more autonomously — more skills can auto-promote (confidence > 0.9 + all tests pass, per v5 implementation KB §6).

### Loop 4: More Autonomy → More Skill Creation → More Effect Datoms

Higher autonomy enables the system (and users) to create more skills. More skills produce more effect datoms. The cycle continues.

```
Skills → Effects → Patterns → Contracts → Trust → Autonomy → More Skills
  ↑                                                              │
  └──────────────────────────────────────────────────────────────┘
```

**The system genuinely gets smarter through use.** Not through retraining. Not through manual rule writing. Through the natural cycle of: use the system → the system observes itself → the system proposes rules → humans approve → the system enforces. Skills are the user-facing entry point to this cycle.

---

## 12. What This Means for v5 and Implementation KB

### v5 Concepts — Recommended Changes

| Section | Change | Rationale |
|---------|--------|-----------|
| **§1 Core Thesis** | Add: Intent is an effect. The creation loop's entry point is formalized. | Gap 1 resolution (§2) |
| **§2.4 Contract** | Add: enforcement strategy follows the trust boundary (external, internal, layered). Enforcement migrates outward as trust increases. | Gap 2 resolution (§3) |
| **§2.5 effectHandler** | Add: implementation strategy dimension (code, markdown/LLM, StateMachine, hybrid). Skills are LLM-implemented effectHandlers. | §5 mapping |
| **§2.5 effectHandler** | Add: Contract-governed effectHandler — `Contract(effectHandler)` — Contract wraps handler, enforcing preconditions/postconditions. Handler remains an effectHandler; Contract adds governance, not identity. | §4 resolution |
| **§3 Creation Loop** | Sharpen: `effect (Intent) → Contract(effectHandler) → datoms (result)`. Map each step to a concept. No new name needed. | §2 + §4 resolution |
| **§3 Patterns list** | Add "skill" to patterns: "A skill is an effectHandler implemented in markdown, executed by an LLM, composing other effectHandlers. It follows the same trust and Contract rules as any effectHandler." | §5 mapping |
| **§11 Glossary** | Add: Intent, skill, implementation strategy | All sections |

### Implementation KB — Recommended Changes

| Section | Change | Rationale |
|---------|--------|-----------|
| **§2.7 AI/LLM** | Add: skill as effectHandler implementation strategy. Claude Code skills as current implementation, vivief generalizes. Note: skills are NOT a cross-LLM standard — each platform has its own format. MCP is the cross-LLM tool layer. | §5 mapping + interop analysis |
| **§4 Phases** | Note: skills emerge from Phase 4 (effectHandler function) + Phase 7 (effectHandler actor). No separate phase needed. | Skills aren't a build target — they're an implementation strategy |
| **§5 Architecture** | Add: the devac pattern (core → MCP + CLI → skill) as reference architecture for effectHandler exposure to LLM agents. effectHandlers are LLM-agnostic; MCP provides cross-LLM access; skills are platform-specific orchestration. | §5 interop analysis |
| **§5 Architecture** | Add: enforcement strategy as architecture pattern (external, internal, layered) with trust boundary principle. | §3 resolution |
| **§6 Deterministic-First** | Add: knowledge → proto-Contract → Contract evolution path with devac evidence (M1-M4 metrics). This IS the loop in practice. | §7 evidence |

---

## 13. Open Questions for v6

1. ~~**Naming the wiring.**~~ **Resolved**: Keep using effectHandler. A Contract-governed effectHandler is `Contract(effectHandler)` — the Contract adds governance, not identity. No new term needed.

2. **Enforcement boundary.** In Option C (layered enforcement), where exactly is the boundary between external and internal enforcement? The principle is "follows the trust boundary" — but what determines the trust boundary per Contract type? Is this domain-specific or universal?

3. **Skill authoring Surface.** What Surface mode best supports non-developer skill creation? Dialog mode (conversational) seems natural. But the skill definition itself might be better as Canvas mode (structured editing). Or is this a composite — Dialog for creation, Card for review?

4. **Skill sharing scope.** When a domain expert creates a skill, does it automatically replicate to peers (via Sync Contract)? Or is sharing opt-in? The Sync Contract's `scope` field (push/pull queries) handles this, but the default matters for adoption.

5. **Knowledge directory migration.** When vivief has a Contract system, should existing knowledge directories (M1-M4, G1-G4) be migrated automatically? Or do they remain as markdown until someone manually formalizes them? The deterministic-first loop suggests gradual — but "gradual" needs a trigger.

6. **Pattern formalization.** v5 §1 says "domain, bridge, artifact, slice, profile are patterns, not concepts." Adding skill to this list raises: should patterns be more formally defined? Each pattern is a composition of concepts — should we define WHICH concepts each pattern composes? Or is that over-specifying?

7. **Enforcement as creation.** If Contract enforcement produces validation datoms (pass/fail/error), then enforcement IS creation — it follows the creation loop. Does this create infinite recursion? (Enforcement produces datoms → enforcement on those datoms → ...) The creation boundary (§1) suggests not — validation datoms are produced by system actors with trust 1.0 and don't need further validation. But this should be made explicit.

8. **In-flight enforcement architecture.** Option C says in-flight Contracts are externally enforced (pipeline between producer and consumer). But the streaming architecture isn't defined. Is the pipeline a system actor? An infrastructure middleware? How does it interact with the Projection delivery mode (§2.2)?

9. **Skill format portability.** Claude Code skills are markdown. Other platforms use different formats. Should vivief define its own LLM-agnostic skill format (datom-based effectHandler descriptions)? Or accept that the orchestration layer is inherently platform-specific and focus portability efforts on the MCP/CLI layer? The devac pattern suggests the latter — but a vivief-native skill format could enable skill sharing across LLM platforms via the datom store.

---

*Brainstorm produced through three rounds of interrogation plus two follow-up resolutions. Key insight: skills reveal gaps in v5, they don't add to v5. The gaps (Intent formalization, Contract enforcement duality) are more important than the skill mapping itself. Close the gaps and skills fit naturally as LLM-implemented effectHandlers. Post-brainstorm: naming resolved (keep effectHandler, add Contract-governance), interoperability clarified (MCP is the cross-LLM layer, skills are platform-specific orchestration).*
