# Linear Meets Vivief — Brainstorm

> Brainstorm document. Maps Linear's "Context → Execution" vision against vivief's creation loop.
> Sparked by Linear's April 2025 announcement: "Issue tracking is dead."
> Linear is becoming a shared product system that turns context into execution via agents, skills, and automations.
> The question: what does vivief already have, what can it adopt, and what emerges from combining the two?
>
> **Core finding:** Linear's four-box model (Context → Rules → Agents → Product) is one iteration of vivief's creation loop with a single new parameter — **aperture** — governing how much possibility flows through the system.

---

## The Mapping

```
Linear:  Context → Rules → Agents → Product
Vivief:  datoms(aperture) → Contract(effectHandler(aperture)) → datoms
```

| Linear concept | Vivief equivalent | Status |
|----------------|-------------------|--------|
| Context (plans, specs, feedback, code) | Datoms queried via Projection | Already exists |
| Rules (automations, skills, permissions) | Contracts + effectHandlers | Already exists |
| Agents | effectHandlers with AI trust scores | Already exists |
| Skills (reusable workflows) | Skills — LLM-implemented effectHandlers | Already exists (concepts-v6) |
| Automations (triage) | effectHandlers triggered by intents | Already exists |
| Code Intelligence | DevAC as persistent wide-aperture Projection | Needs integration |
| Feedback-to-execution compression | Intake pattern (new, seventh pattern) | New |

Linear needed four boxes. Vivief needs one loop and one dial.

---

## The New Concept: Aperture

**Aperture** is a parameter on Projection that controls how much possibility flows through the system at every stage. Borrowed from optics — how wide you open the view.

It is NOT a new primitive. It's a parameter that unifies two existing Projection fields:

- `trustThreshold` — which datoms to include
- `freshness` — committed vs in-flight

Aperture settings:

| Aperture | trustThreshold | freshness | What you see |
|----------|---------------|-----------|-------------|
| Narrow | High (0.8+) | committed | Ground truth only. Verified, human-approved datoms |
| Medium | Medium (0.4+) | committed + in-flight | Active work including streaming LLM output |
| Wide | Low (0.0+) | committed + in-flight + speculative | Everything the system is thinking |

### Aperture Applied to Intent Routing

The same dial governs how intents reach effectHandlers:

| Aperture | Matching | Behavior | Pattern name |
|----------|----------|----------|-------------|
| Narrow | Exact `EffectType` match via `BehaviorContract.accepts` | Single handler fires | Triage |
| Medium | EffectType + semantic similarity above threshold | Multiple match, highest trust wins, alternatives → speculative datoms | Pool |
| Wide | Any handler whose Contract doesn't explicitly reject | All produce, composition handler merges results | Chorus |

### Conflict Resolution at Wide Aperture

When multiple handlers activate on the same intent:

1. If a **composition effectHandler** exists → **chorus**: all produce, composer merges
2. If no composer → **fallback to medium**: trust-weighted selection, losers' candidates become speculative datoms

The composition handler is just another effectHandler. It enters the creation loop with its own Contract and trust score. No special mode needed. Graceful degradation is structural.

### Why One Dial Works

Selecting datoms and selecting handlers are the same question: **"how much possibility do I let in?"**

- Narrow aperture on datoms = only committed, high-trust facts
- Narrow aperture on handlers = only exact Contract match, one fires
- Wide aperture on datoms = everything including speculative
- Wide aperture on handlers = many match, chorus

Same mechanism, applied at two points in the pipeline. The Projection already defines both what data to include and who can access it. Aperture extends that to "who can act on it."

---

## Context Model: Fractal

Three ways of framing context were explored:

1. **Context-as-Projection** — structured, query-driven, datoms through Projection
2. **Context-as-Conversation** — narrative, LLM-generated prose summaries
3. **Context-as-Fractal** — both, layered: Projection at the base, conversation as a Surface over it

**Resolution: Fractal.** Projection is the base. Conversation is a Surface rendering of a Projection. The narrative layer is just another Surface mode (Dialog) consuming the same underlying datoms. No new concept needed.

Conversation is not a context type — it's the **interaction medium** through which humans and agents engage with any layer. This matters because every creative act (brainstorm, ideation, learning) is inherently conversational.

Conversation mode varies by creative phase:

| Phase | Conversation mode | Sweet spot |
|-------|-------------------|-----------|
| Wild (explore) | Generative | Ideate, brainstorm, explore |
| Ambitious (build) | Collaborative | Create, build, learn |
| Pragmatic (ship) | Transactional | Decide, refine, triage |

This is a funnel: **Wild → Ambitious → Pragmatic. Ideas → Creation → Execution.**

---

## Intake: The Seventh Pattern

Linear's diagram shows customer requests, bug reports, and feedback entering from the left. Something must convert external signals into datoms. Abstracting that away is dishonest — a phone call becoming datoms requires STT, diarization, intent extraction, trust scoring. That's real work done by real effectHandlers.

**Intake** is the seventh pattern, a specialization of bridge:

| Pattern | Composes | Produces |
|---------|----------|---------|
| **intake** | bridge effectHandler + source-specific trust scoring + Schema Contract for external signals | Datoms from external world with provenance |

The distinction from bridge: a bridge is bidirectional (sync). Intake is unidirectional (ingest). A phone call doesn't need datoms pushed back to it.

Source-appropriate trust scores:

| Source | Trust score | Rationale |
|--------|------------|-----------|
| `:human/direct` | 1.0 | Human typed/spoke it |
| `:customer/direct` | 0.7 | External human, unverified |
| `:system/integration` | 0.9 | API webhook, structured |
| `:ai/transcription` | 0.85 | STT output |
| `:web/scraped` | 0.4 | Uncontrolled source |

---

## DevAC as Code Intelligence

Linear is building Code Intelligence — understanding, querying, and debugging the codebase from within the product system.

Vivief already has DevAC for code analysis. The integration: DevAC becomes a **persistent wide-aperture Projection** that is always available as context for any creation loop iteration. When you brainstorm a feature in Wild mode, the system already knows what code exists and what's feasible.

DevAC datoms are first-class in the creation loop — not a separate tool, but datoms like any other, queryable via Projection, renderable on Surfaces.

---

## Compounding: Local-First as Moat

Linear compounds across their entire customer base — agents get better by seeing patterns across thousands of teams.

Vivief compounds per-instance. This is the point, not the limitation.

A practice that has used Vivief for a year has a factory uniquely tuned to their context — their clients, their patterns, their language. Not replicable by a cloud service.

**Opt-in sharing:** practitioners can contribute generalized Contracts (not datoms) to a shared pool. A shared Contract arrives with `:tx/source :community/shared` and `trust-score: 0.3`, requiring human approval before activation. Knowledge sharing without data exposure.

---

## Experiment: Dialog-as-effectHandler

**Hypothesis:** A conversation can be the creation loop itself, not merely observed by it. Every utterance is an intent. Every response is candidate datoms. The Dialog Surface and the effectHandler are the same thing.

**Current model (recommended):** Dialog Surface + observer effectHandler that extracts intents from the conversation stream, crystallizing them as datoms when they cross a confidence threshold. Human can also explicitly crystallize.

**Experiment model:** The Dialog Surface both renders and creates. The conversation doesn't produce intents as a byproduct — it's intents all the way down.

**Activation:** As a vivief experiment — a creation loop iteration with:
- Low trust score (hypothesis)
- BehaviorContract with explicit success/failure criteria
- Bounded lifecycle (`:experiment/active` → `:experiment/concluded`)
- Results are datoms that feed the next decision

---

## Stretch Goals

### Resonance Field

Pre-computed speculative datoms via D2TS materialized views. Every datom carries a latent "what could follow" embedding computed lazily by local Qwen. Widening aperture doesn't trigger a new LLM call — it reveals latent continuations already encoded in the datom graph.

The system doesn't generate possibilities on demand. It maintains a continuously updated possibility space. The conversation navigates it rather than creates it. Like autocomplete for your entire product reality.

Implementation path: D2TS incremental computation maintains a materialized view of speculative datoms. As committed datoms change, the speculative layer updates incrementally. Aperture reveals the view; it doesn't trigger computation.

### Adversarial Compounding

Each Vivief instance is a competing intelligence. Instead of sharing Contracts cooperatively, instances publish **challenges**: "my intake handler resolves 94% of scheduling conflicts automatically."

Other instances attempt the same challenge with their own handlers. Results are compared via a shared Contract that defines the benchmark. Compounding through competition, not cooperation. Evolutionary pressure across local-first installations.

No data sharing needed — only challenge definitions and scores. Sidesteps the privacy problem entirely.

---

## Parked

| Topic | Why parked | When to revisit |
|-------|-----------|-----------------|
| Anti-goals (what Vivief deliberately won't do) | Needs conviction. Premature to force. Candidates explored: "never host code" (DevAC analyzes, doesn't store) and "never build a dashboard" (fundamentally perspectival, no god-view). Neither felt ready. | When aperture and intake are implemented and we can see what the system naturally resists |

---

## Summary: What Vivief Gains

One new parameter (**aperture**), one new pattern (**intake**), one experiment (**dialog-as-effectHandler**), and two stretch goals (**resonance field**, **adversarial compounding**).

No new primitives. The five concepts hold. The creation loop holds. Aperture makes the existing architecture do more by asking the same question — "how much possibility do I let in?" — at every point in the pipeline.

Linear is building a great product system for cloud-native teams. Vivief is building the local-first equivalent where the practitioner owns the factory, the factory compounds per-instance, and the bottleneck shifts from managing process to articulating intent.
