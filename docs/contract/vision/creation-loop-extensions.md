# Creation Loop Extensions

> Three extensions to the vivief creation loop: a governing parameter (aperture), a new pattern (intake), and a context model (fractal). No new primitives — the five concepts hold.

**Origin**: Brainstorm mapping Linear's "Context → Execution" vision against vivief's creation loop ([archived source](../../archive/brainstorms/linear-meets-vivief.md)).

**Related Documents**:
- [vivief-concepts-v6.md](../vivief-concepts-v6.md) — Five concepts, creation loop
- [fractal-software-factory.md](fractal-software-factory.md) — Same loop at every scale
- [Claude window](../../claude/concepts-creation-loop-extensions.md) — Compact summary for AI sessions
- [Experiments](../../intent/creation/creation-loop-experiments.md) — Dialog-as-effectHandler, resonance field, adversarial compounding

## Related Decisions

*(Placeholder — ADRs referencing this vision doc will be listed here.)*

---

## Summary

Linear needed four boxes (Context → Rules → Agents → Product). Vivief needs one loop and one dial.

```
Linear:  Context → Rules → Agents → Product
Vivief:  datoms(aperture) → Contract(effectHandler(aperture)) → datoms
```

| Linear concept | Vivief equivalent | Status |
|----------------|-------------------|--------|
| Context (plans, specs, feedback, code) | Datoms queried via Projection | Exists |
| Rules (automations, skills, permissions) | Contracts + effectHandlers | Exists |
| Agents | effectHandlers with AI trust scores | Exists |
| Skills (reusable workflows) | Skills — LLM-implemented effectHandlers | Exists (v6) |
| Automations (triage) | effectHandlers triggered by intents | Exists |
| Code Intelligence | DevAC as persistent wide-aperture Projection | Needs integration |
| Feedback-to-execution compression | Intake pattern (new, seventh pattern) | New |

---

## Aperture

**Aperture** is a parameter on Projection that controls how much possibility flows through the system at every stage. Borrowed from optics — how wide you open the view.

It is NOT a new primitive. It unifies two existing Projection fields:

- `trustThreshold` — which datoms to include
- `freshness` — committed vs in-flight

### Aperture Settings

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

Three framings of context were explored:

1. **Context-as-Projection** — structured, query-driven, datoms through Projection
2. **Context-as-Conversation** — narrative, LLM-generated prose summaries
3. **Context-as-Fractal** — both, layered: Projection at the base, conversation as a Surface over it

**Resolution: Fractal.** Projection is the base. Conversation is a Surface rendering of a Projection. The narrative layer is just another Surface mode (Dialog) consuming the same underlying datoms. No new concept needed.

Conversation is not a context type — it's the **interaction medium** through which humans and agents engage with any layer.

Conversation mode varies by creative phase:

| Phase | Conversation mode | Sweet spot |
|-------|-------------------|-----------|
| Wild (explore) | Generative | Ideate, brainstorm, explore |
| Ambitious (build) | Collaborative | Create, build, learn |
| Pragmatic (ship) | Transactional | Decide, refine, triage |

This is a funnel: **Wild → Ambitious → Pragmatic. Ideas → Creation → Execution.**

---

## Intake: The Seventh Pattern

Something must convert external signals into datoms. Abstracting that away is dishonest — a phone call becoming datoms requires STT, diarization, intent extraction, trust scoring. That's real work done by real effectHandlers.

**Intake** is the seventh pattern, a specialization of bridge:

| Pattern | Composes | Produces |
|---------|----------|---------|
| **intake** | bridge effectHandler + source-specific trust scoring + Schema Contract for external signals | Datoms from external world with provenance |

The distinction from bridge: a bridge is bidirectional (sync). Intake is unidirectional (ingest). A phone call doesn't need datoms pushed back to it.

### Source-Appropriate Trust Scores

| Source | Trust score | Rationale |
|--------|------------|-----------|
| `:human/direct` | 1.0 | Human typed/spoke it |
| `:customer/direct` | 0.7 | External human, unverified |
| `:system/integration` | 0.9 | API webhook, structured |
| `:ai/transcription` | 0.85 | STT output |
| `:web/scraped` | 0.4 | Uncontrolled source |

---

## DevAC as Code Intelligence

DevAC becomes a **persistent wide-aperture Projection** — always available as context for any creation loop iteration. When you brainstorm a feature in Wild mode, the system already knows what code exists and what's feasible.

DevAC datoms are first-class in the creation loop — not a separate tool, but datoms like any other, queryable via Projection, renderable on Surfaces.

---

## Compounding: Local-First as Design Principle

Vivief compounds per-instance. This is the point, not the limitation.

A practice that has used vivief for a year has a factory uniquely tuned to their context — their clients, their patterns, their language. Not replicable by a cloud service.

**Opt-in sharing:** practitioners can contribute generalized Contracts (not datoms) to a shared pool. A shared Contract arrives with `:tx/source :community/shared` and `trust-score: 0.3`, requiring human approval before activation. Knowledge sharing without data exposure.

---

## Term Definitions

| Term | Definition | Type |
|------|-----------|------|
| **Aperture** | Parameter on Projection that unifies trustThreshold + freshness to control how much possibility flows through the system | Parameter (not a primitive) |
| **Intake** | Seventh pattern — unidirectional bridge that converts external signals into datoms with provenance and source-appropriate trust scores | Pattern (specialization of bridge) |
