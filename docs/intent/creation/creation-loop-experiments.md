# Creation Loop Experiments

> Experimental extensions to the creation loop. Core concepts (aperture, intake, context-as-fractal) are locked in [creation-loop-extensions.md](../../contract/vision/creation-loop-extensions.md). These experiments remain open for validation.

**Origin**: Sparked by Linear's April 2025 "Issue tracking is dead" announcement. See [archived brainstorm](../../archive/brainstorms/linear-meets-vivief.md) for the full mapping exercise.

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

## Stretch Goal: Resonance Field

Pre-computed speculative datoms via D2TS materialized views. Every datom carries a latent "what could follow" embedding computed lazily by local Qwen. Widening aperture doesn't trigger a new LLM call — it reveals latent continuations already encoded in the datom graph.

The system doesn't generate possibilities on demand. It maintains a continuously updated possibility space. The conversation navigates it rather than creates it. Like autocomplete for your entire product reality.

Implementation path: D2TS incremental computation maintains a materialized view of speculative datoms. As committed datoms change, the speculative layer updates incrementally. Aperture reveals the view; it doesn't trigger computation.

---

## Stretch Goal: Adversarial Compounding

Each vivief instance is a competing intelligence. Instead of sharing Contracts cooperatively, instances publish **challenges**: "my intake handler resolves 94% of scheduling conflicts automatically."

Other instances attempt the same challenge with their own handlers. Results are compared via a shared Contract that defines the benchmark. Compounding through competition, not cooperation. Evolutionary pressure across local-first installations.

No data sharing needed — only challenge definitions and scores. Sidesteps the privacy problem entirely.

---

## Parked

| Topic | Why parked | When to revisit |
|-------|-----------|-----------------|
| Anti-goals (what vivief deliberately won't do) | Needs conviction. Premature to force. Candidates explored: "never host code" (DevAC analyzes, doesn't store) and "never build a dashboard" (fundamentally perspectival, no god-view). Neither felt ready. | When aperture and intake are implemented and we can see what the system naturally resists |
