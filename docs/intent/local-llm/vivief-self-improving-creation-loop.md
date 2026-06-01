# Vivief: the self-improving creation loop

> Companion document to the intro deck. Start with the presentation for the high-level story, then read this for the detail.
> **Updated 2026-04-11**: Revised with TanStack Code Mode integration decisions. See `vivief-code-mode-integration.md` for the full interview (25 decisions).

## What this document is

This document explains how Vivief's creation loop can learn to build itself better over time, using two complementary techniques — autoresearch and ATLAS-style pipelines — running on local models. It's written so that anyone joining the project can understand the vision, judge the approach, and contribute ideas.

The document is layered: start at the top for the big picture, go deeper for implementation detail. Each section builds on the previous one.

---

## Part 1: The big picture

### What Vivief builds

Vivief is a local-first platform where a practitioner and AI collaborate to create. The platform generates TypeScript code for many things: queries over datoms (the atomic data unit), surface UIs that render datoms visually, effectHandlers that process state transitions, and contracts that validate what's produced. Today, that generation happens via LLM calls — the AI produces code, the human reviews it, and if it works, it gets captured as a reusable template.

### The problem

Three things limit this process:

1. **Every generation starts cold.** The LLM doesn't remember what worked last time. The same prompt produces the same kinds of mistakes. There's no learning across sessions.

2. **Hard tasks fail silently.** When generating complex TypeScript — an effectHandler with multiple state transitions, a projection query joining several datom streams — single-shot generation often produces code that doesn't typecheck or doesn't satisfy the contract. The practitioner retries manually, which is slow and frustrating.

3. **Cloud dependency.** The hard reasoning tasks currently require frontier cloud models (Opus, Sonnet). We want local-first sovereignty over our creation process, not just our data.

### The solution in one sentence

Make the creation loop self-improving by combining two techniques: one that evolves prompts over time (autoresearch), and one that amplifies code quality on hard individual tasks (ATLAS-style pipelines), both running on local models — with TanStack Code Mode providing the sandboxed TypeScript execution layer that ties them together.

### The two techniques

**Autoresearch** (from Andrej Karpathy's research pattern) is an evolutionary loop that runs overnight. It takes a prompt, generates a batch of outputs, scores them with binary pass/fail criteria, and if the batch scored better, keeps the mutated prompt. If not, reverts. This repeats indefinitely. The output isn't better code — it's *better prompts* that make every future generation start from a stronger baseline. Think of it as training without training: the model stays frozen, but the instructions it receives get better with every cycle.

**ATLAS pipeline** (from the ATLAS benchmark infrastructure) is a quality amplifier for hard individual tasks. Instead of generating one answer and hoping it works, it extracts constraints from the task specification, generates three diverse candidates, verifies each against the contract, and if all fail, has the model write its own test cases and do multi-perspective repair. The model goes from ~55% pass rate to ~75% on the same benchmark — purely through smarter infrastructure around it.

**They're not alternatives — they're layers.** Autoresearch is the slow outer loop (days/weeks) that improves prompts across all runs. ATLAS is the fast inner amplifier (minutes) that squeezes more out of the model on specific hard tasks right now. Together, they make the creation loop compound: better prompts → higher first-pass rate → more templates captured → less generative work → wider local aperture.

---

## Part 2: How the pieces connect

### Vivief's existing creation flow

```
Intent (natural language)
  → Contract (what must be true about the output)
    → effectHandler generates TypeScript
      → Verification: typecheck + contract validation
        → If pass: capture as reusable template
        → If fail: retry (currently manual)
```

The self-improving creation loop adds two things to this flow:

1. The "retry" path becomes intelligent (ATLAS-style repair instead of blind retry)
2. A background loop continuously improves the prompts feeding the generation step

### The layered architecture

```
┌─────────────────────────────────────────────────────────┐
│  AUTORESEARCH — slow loop (runs overnight, days/weeks)  │
│  Evolves prompt families across all runs                │
│                                                         │
│  ┌──────────────────┐    ┌────────────────────────┐     │
│  │  Simple tasks     │    │  Hard tasks             │     │
│  │  (~80% of work)   │    │  (~20%, highest value)  │     │
│  │                   │    │                         │     │
│  │  Classification,  │    │  effectHandlers,        │     │
│  │  intent matching, │ ──►│  projections, surfaces  │     │
│  │  labels           │ ap │                         │     │
│  │                   │ er │  ATLAS pipeline:        │     │
│  │  Single-shot      │ tu │  PlanSearch + K=3       │     │
│  │  local model      │ re │  + self-test repair     │     │
│  └──────────────────┘    └────────────────────────┘     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  SHARED VERIFICATION LAYER                       │    │
│  │  tsc --noEmit + Contract.validate + Surface test │    │
│  │  Binary pass/fail. ~200ms. Every result = datom. │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

The **aperture** (a Vivief concept) governs how much flows to the simple path vs. the hard path. As prompts improve via autoresearch and more templates get captured, the aperture widens — more tasks can be handled locally and cheaply. The system literally gets better at deciding what it can handle.

### The compound effect

```
Prompt garden       Template forge      More templates     Cheaper local
runs overnight  →   uses better     →   captured       →   inference
                    prompts
better prompts      higher first-       less generative    wider aperture
                    pass rate           work
        ↑                                                        │
        └────────────────────────────────────────────────────────┘
                    each cycle starts stronger
```

This is the core insight: the creation loop doesn't just build artifacts — it builds the *capability* to build better artifacts.

---

## Part 3: The two techniques in detail

### Autoresearch: evolving the recipe

**Origin:** Andrej Karpathy released `autoresearch` in early 2026 — a pattern where an AI agent autonomously modifies code, measures the result against an objective metric, keeps improvements, reverts regressions, and repeats forever. A universal skill layer was built on top that adapts this to any codebase.

**How it works in Vivief:**

```
┌─────────────┐
│ Prompt v1   │  "Generate a projection query that..."
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Generate    │  Run prompt 8 times → 8 TS outputs
│ batch       │  Using local model (Gemma 26B-A4B)
└──────┬──────┘
       │
       ▼
┌─────────────┐  For each output, 4 binary criteria:
│ Score       │  1. Does it typecheck?          (tsc --noEmit)
│ (binary)    │  2. Does contract validate?     (Contract.validate)
│             │  3. Does projection return data? (test dataset)
└──────┬──────┘  4. Types match expected shape?  (schema check)
       │         Score = count of passes across 8 × 4 = max 32
       ▼
┌─────────────┐
│ Compare     │  Score improved? Keep new prompt. Worse? Revert.
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Mutate      │  Apply one of: tighten language, add constraint,
│ prompt      │  add counter-example, restructure, remove bloat
└──────┬──────┘
       │
       └──────► back to Generate (repeat forever)
```

**Prompt families:** We don't have one prompt to optimise — we have families. Each gets its own loop:

| Family | What it generates | Binary eval criteria |
|--------|-------------------|---------------------|
| Projection query | TypeScript querying datoms | Typechecks, returns expected datoms, shape matches |
| Surface template | HTML/TS rendering datoms | Typechecks, renders without error, contract validates |
| effectHandler | State transition logic | Typechecks, handles all contract states, no side effects |
| Intent matcher | Template selection logic | Correct template selected for known test intents |

**State is stored as datoms.** The prompt family is an entity, the current best prompt is an attribute, the score history is datoms with tx ordering. The prompt garden is a Vivief dataset — queryable, syncable, versionable.

**Strengths:**
- Dead simple to implement
- Works with any model (no fine-tuning needed)
- Runs unattended overnight
- Binary eval is deterministic and honest
- Composable — multiple loops run in parallel
- State fits naturally into Vivief's datom model

**Weaknesses:**
- Only optimises the instructions, not the model's execution on specific tasks
- Plateaus when the model fundamentally can't produce correct code regardless of prompt
- Needs 8-10 generations per cycle for statistical significance (~5-10 min per cycle on M1 Pro)
- Quality of binary criteria determines quality of the optimised prompt

### ATLAS pipeline: amplifying the answer

**Origin:** ATLAS achieves 74.6% pass rate on LiveCodeBench with a frozen 14B model on consumer hardware — up from 55% baseline — purely through infrastructure wrapping. No fine-tuning, no cloud. The ablation study shows two techniques matter: PlanSearch (+12.4 percentage points) and self-verified repair (+7.3 percentage points).

**How it works in Vivief:**

```
┌──────────────────┐
│ Task: generate    │  e.g. "effectHandler for session booking
│ an effectHandler  │       with cancellation and rescheduling"
└────────┬─────────┘
         │
         ▼
┌──────────────────┐  Extract constraints from the Contract:
│ PlanSearch       │  - Must handle states: pending, confirmed, cancelled
│ (from ATLAS)     │  - cancellation must emit refund effect
│                  │  - rescheduling preserves original booking ID
└────────┬─────────┘  → Produces a structured plan
         │
         ▼
┌──────────────────┐  Generate 3 candidates with different
│ Best-of-3        │  temperatures (0.4, 0.6, 0.8)
│ generation       │  Each follows the PlanSearch plan
└────────┬─────────┘  but explores different implementations
         │
         ▼
┌──────────────────┐
│ Verify each      │  Run through shared verification layer:
│ (spike 1)        │  tsc + Contract.validate
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
  pass?     all fail?
    │         │
    ▼         ▼
 ┌──────┐  ┌──────────────────┐
 │ Done │  │ Self-test gen    │  Model generates its own
 │      │  │ + PR-CoT repair  │  test cases from contract spec,
 └──────┘  │                  │  then does multi-perspective repair
           └────────┬─────────┘
                    │
                    ▼
              Verify repaired
              code → Done or
              escalate to cloud
```

**PlanSearch** is the key insight: instead of asking the model "generate an effectHandler," you first have it analyse the Contract to extract every constraint, then generate a structured plan that addresses each constraint. This is essentially making the model think before it codes. ATLAS showed this alone adds +12.4 percentage points to pass rate.

**Self-test generation** is the repair mechanism. When all candidates fail verification, the model reads the Contract specification and generates its own input/output test cases. It then uses failures against its own tests to guide repair — a multi-perspective chain-of-thought (PR-CoT) that looks at the problem from 4 different angles. In ATLAS, this rescued 42 out of 194 failures (85.7% rescue rate for the PR-CoT path).

**Why this maps cleanly to Vivief:** Your Contract primitive already *is* the specification that PlanSearch would extract constraints from. ATLAS has to parse unstructured problem statements. You have structured datoms. And your verification layer (tsc + Contract.validate) is the sandbox.

**What we skip from ATLAS:**
- Geometric Lens (energy-based candidate scoring) — contributed 0pp in their own ablation due to insufficient training data
- DivSampling (12 prompt perturbations) — unnecessary complexity for now
- Thompson Sampling router — build this later as optimisation
- K3s/Redis infrastructure — we run on Ollama locally

**Strengths:**
- Massive quality lift on hard tasks (potentially +20pp over baseline)
- Works with frozen model — no training needed
- Contract-as-spec is a natural fit for Vivief
- Self-test repair is self-supervised — no human labelling needed
- Compute scales with task difficulty (simple tasks skip the pipeline)

**Weaknesses:**
- Expensive per task: 3-5 minutes on M1 Pro for a full pipeline run
- Doesn't learn across tasks — each starts fresh
- Only works for tasks with clear verification criteria (TS code, not fuzzy design tasks)
- PlanSearch quality depends on the model's ability to reason about the Contract spec

---

## Part 4: The local model landscape

### Current stack (revised 2026-04-11)

| Role | Model | Where | Performance |
|------|-------|-------|-------------|
| Classification + routing | E4B (Gemma 4, native function calling) | LiteRT-LM or Ollama (local) | <100ms, handles both intent + skill selection |
| Code Mode generation | E4B (simple) / 26B MoE (complex, offline) | LiteRT-LM or Ollama (local) | TypeScript generation in sandbox |
| Complex skill authoring | Sonnet | Cloud API | Quality Code Mode generation |
| Architectural skills | Opus | Cloud API | Hard problems, training data generation |

**Key change from prior version**: Start with E4B for all local tasks including routing. No fine-tuned VivRouter initially — add it only if E4B classification accuracy proves inadequate. Skills-first approach: lean toward Code Mode skill accumulation over fine-tuning for capability building. See `vivief-code-mode-integration.md` Q17, Q20, Q24.

### What changes with Code Mode + Gemma 4

Gemma 4 26B-A4B is a Mixture of Experts model: 26B total parameters, but only 4B active during inference. This means it runs fast like a small model but produces quality closer to a large one. At 4-bit quantization, it needs ~18GB RAM — feasible on an M1 Pro with 32GB.

The benchmark numbers are striking: 77.1% on LiveCodeBench (competitive coding), versus Sonnet 4's 71.4%. A local model outperforming a cloud frontier model on code generation is the inflection point for local-first AI.

TanStack Code Mode adds a critical layer: instead of the LLM making individual tool calls, it writes TypeScript programs that compose tools in a sandbox (QuickJS WASM primary, Node V8 dev fallback). This eliminates N+1 round-trips, moves math/computation to the runtime, and enables skill accumulation — working TypeScript saved as persistent, typed, trust-progressing skills.

For Vivief, this means: the ATLAS pipeline runs as a Code Mode meta-skill, autoresearch optimizes Code Mode system prompts, and skills compound — each successful execution adds to the system's capability set.

### The aperture in practice

The aperture governs the split. As Code Mode skills accumulate and prompts get optimised:

| Aperture | Simple (local) | Hard (ATLAS local) | Cloud |
|----------|----------------|---------------------|-------|
| Today | ~60% | ~20% | ~20% |
| After spikes | ~70% | ~25% | ~5% |
| With Gemma 5 era + skill compounding | ~85% | ~13% | ~2% |

The skill compounding effect (Q21) accelerates the aperture shift: trusted skills become `external_*` functions for future Code Mode executions, expanding capability without model improvement.

---

## Part 5: The four spikes (revised 2026-04-11)

> Updated to include Spike 0 (Sandbox Integration) as foundation, and to integrate Code Mode into Spikes 1-3. See `vivief-code-mode-integration.md` for full rationale.

### Spike 0: Sandbox Integration (foundation, new)

**What:** Install TanStack Code Mode (`@tanstack/ai-code-mode` + `@tanstack/ai-isolate-quickjs`) and build the bridge between Code Mode's sandbox and vivief's effectHandler/datom infrastructure.

**Why first:** All three original spikes benefit from running inside Code Mode's sandbox. The sandbox provides: isolated TypeScript execution, typed `external_*` function stubs (so the LLM generates correct calls), timeout/memory limits, and AG-UI streaming events. This foundation spike makes Spikes 1-3 more powerful and more concrete.

**Implementation:**
- Install `@tanstack/ai-code-mode` + `@tanstack/ai-isolate-quickjs` (primary) and `@tanstack/ai-isolate-node` (dev fallback)
- Implement `external_queryProjection` — bridge from sandbox to vivief DatomStore Projection queries
- Implement `external_dispatchEffect` — bridge from sandbox to vivief effectHandler dispatch
- Contract enforcement at sandbox boundary: preconditions before execution, postconditions after, each `external_*` call validated against target's Behavior Contract
- AG-UI event streaming (`code_mode:execution_started`, `code_mode:console`, `code_mode:external_call`, etc.)
- System prompt generation: typed function stubs for all available effectHandlers, enforcing `{ datoms: Datom[], intents: Intent[] }` return type

**Success criteria:** An LLM (E4B or Sonnet) writes TypeScript inside the sandbox that queries the DatomStore via `external_queryProjection`, transforms the results, and returns datoms. The execution is isolated, timed out if too slow, and produces AG-UI streaming events.

### Spike 1: The contract verifier (~2 days, depends on Spike 0)

**What:** A single function `verify(artifact: string) → { pass: boolean, failures: string[] }` that chains three checks: TypeScript compilation, Contract validation, and optionally Surface render testing. Also exposed as `external_verify` inside the Code Mode sandbox.

**Why second:** This is the binary oracle both loops depend on. Autoresearch needs it to score prompt batches. The ATLAS pipeline needs it to verify candidates and guide repair. Without it, nothing else works. With Code Mode, the verifier is also callable from inside the sandbox — the LLM's TypeScript can verify its own output.

**Implementation:**

```typescript
interface VerifyResult {
  pass: boolean
  failures: string[]
  checks: {
    typecheck: boolean
    contract: boolean
    render?: boolean
  }
  durationMs: number
}

async function verify(
  artifact: string,           // Generated TypeScript
  contract: Contract,         // The spec it must satisfy
  options?: { skipRender?: boolean }
): Promise<VerifyResult> {
  const failures: string[] = []

  // Check 1: TypeScript compilation
  const tscResult = await runTsc(artifact)
  if (!tscResult.pass) failures.push(...tscResult.errors)

  // Check 2: Contract validation
  const contractResult = await contract.validate(artifact)
  if (!contractResult.pass) failures.push(...contractResult.violations)

  // Check 3: Surface render (optional)
  if (!options?.skipRender) {
    const renderResult = await renderTest(artifact)
    if (!renderResult.pass) failures.push(renderResult.error)
  }

  return {
    pass: failures.length === 0,
    failures,
    checks: { typecheck: tscResult.pass, contract: contractResult.pass, render: renderResult?.pass },
    durationMs: /* measured */
  }
}
```

**The elegant part:** This verifier is itself a Vivief Contract with effectHandlers for each check. The results are datoms — every pass/fail ever recorded becomes queryable history. This is the dataset that eventually trains better routing, better prompts, and potentially an embedding-based quality predictor (the Geometric Lens concept, when we have enough data).

**Minimal scope:** Start with `tsc --noEmit` + `Contract.validate` only. Add render testing when surfaces are actually in play.

**Sandbox exposure:** The verifier is registered as `external_verify` inside the Code Mode sandbox. This means sandbox-generated TypeScript can verify its own output — critical for the ATLAS meta-skill (Spike 3) where the LLM writes self-repair code.

**Success criteria:** The function runs in <500ms, produces accurate binary results, persists results as datoms, and is callable as `external_verify` from inside the sandbox.

### Spike 2: The prompt garden (~3 days after spike 1)

**What:** A Karpathy-style autoresearch loop running per Code Mode prompt family, using Spike 1 as the eval oracle. Prompts now target Code Mode TypeScript generation (not raw LLM output).

**Why third:** It's cheap, simple, runs unattended, and produces data that Spike 3 benefits from. Every night it runs, your Code Mode system prompts get a little better — and successful executions accumulate as skills.

**Implementation:**

```
.vivief-prompt-garden/
├── families/
│   ├── projection-query/
│   │   ├── prompt.txt           Current prompt being tested
│   │   ├── best_prompt.txt      Highest-scoring prompt
│   │   ├── state.json           Scores, run count, plateau counter
│   │   └── results.jsonl        Every cycle's results
│   ├── surface-template/
│   │   └── ...
│   └── effect-handler/
│       └── ...
└── config.json                  Families, batch size, model, schedule
```

**One cycle:**

```
1. Load current Code Mode system prompt for "projection-query" family
2. Generate 8 sandbox TypeScript programs using prompt + test intents
   (via E4B on LiteRT-LM/Ollama, or Sonnet API)
3. Execute each in Code Mode sandbox, run output through external_verify
4. Score = total passes across 8 outputs × 4 criteria = max 32
5. If score > best_score: save prompt as best, update state
   If score <= best_score: revert to best_prompt.txt
6. Mutate: apply random operator (tighten, add example, restructure...)
7. Log to results.jsonl. Register successful TypeScript as skill candidates.
8. Sleep 2 minutes, repeat
```

**The compounding flywheel (from Code Mode integration interview, Q21):**
1. Autoresearch improves Code Mode system prompts
2. Better prompts -> higher-quality sandbox TypeScript
3. Higher-quality TypeScript -> more successful skill executions
4. More successful executions -> faster trust progression
5. Trusted skills -> new `external_*` functions available in sandbox
6. More functions -> expanded capability set
7. Autoresearch evolves new prompts for expanded capability set

Each cycle makes the next one stronger. This is vivief's deterministic-first thesis made concrete.

**State as datoms:** The state files above are the initial implementation. Migration path: each prompt family becomes a Vivief entity, scores and prompt versions become datoms with tx ordering, the `.vivief-prompt-garden/` directory becomes a Projection over those datoms. Skills accumulated from successful executions are also datoms (with flexible code refs — string, file, or GitHub link).

**Start with one family:** "projection query" has the clearest binary eval (typecheck + returns expected datoms for a test dataset). Expand to others only after the loop proves itself.

**Success criteria:** The loop runs unattended for 24 hours. Prompt scores improve measurably. At least one successful execution is registered as a skill candidate.

### Spike 3: The template forge (~1 week, depends on Spikes 0+1)

**What:** An ATLAS pipeline for hard TypeScript generation tasks, implemented as a Code Mode meta-skill — a skill that orchestrates other skills inside the sandbox. Uses PlanSearch + best-of-3 + self-test repair.

**Why fourth:** This is the most complex spike but also the highest-value one. It turns "hard task failed, retry manually" into "hard task failed, system repairs it automatically." It benefits from Code Mode's `Promise.all` for parallel candidate generation and `external_verify` for Contract checking. It also benefits from already-improved prompts from Spike 2's prompt garden.

**Implementation as Code Mode meta-skill:**

The forge is itself TypeScript that runs inside the Code Mode sandbox. The LLM writes orchestration code that calls `external_*` functions for each phase:

```typescript
// This TypeScript runs INSIDE the Code Mode sandbox
// It's a meta-skill: a skill that orchestrates other skills

// Phase 1: PlanSearch — extract constraints from contract
const constraints = await external_extractConstraints(contract)

// Phase 2: Generate 3 diverse candidates IN PARALLEL (eliminates sequential overhead)
const candidates = await Promise.all([
  external_generate(intent, constraints, { temperature: 0.4 }),
  external_generate(intent, constraints, { temperature: 0.6 }),
  external_generate(intent, constraints, { temperature: 0.8 }),
])

// Phase 3: Verify each (using Spike 1's external_verify)
for (const candidate of candidates) {
  const result = await external_verify(candidate.code, contract)
  if (result.pass) return {
    datoms: [{ e: `skill:${intent}`, a: ":skill/code", v: candidate.code, tx: "pending", op: "assert" }],
    intents: []
  }
}

// Phase 4: Self-test repair (all candidates failed)
const selfTests = await external_generateSelfTests(contract, constraints)
let repaired = candidates[0].code

for (let i = 0; i < 3; i++) {
  const failures = await external_runSelfTests(repaired, selfTests)
  if (failures.length === 0) {
    const finalCheck = await external_verify(repaired, contract)
    if (finalCheck.pass) return {
      datoms: [{ e: `skill:${intent}`, a: ":skill/code", v: repaired, tx: "pending", op: "assert" }],
      intents: []
    }
  }
  repaired = await external_prCotRepair(repaired, failures, constraints)
}

return {
  datoms: [{ e: `forge:${intent}`, a: ":forge/best-effort", v: repaired, tx: "pending", op: "assert" }],
  intents: [{ type: ":forge/escalate-requested", payload: { intent, bestEffort: repaired } }]
}
```

**What changed from the original forge design:** The forge is no longer a host-side orchestration function — it's TypeScript inside the sandbox. This means: (1) `Promise.all` for parallel candidate generation eliminates sequential overhead, (2) the forge itself can be saved as a skill and reused, (3) Contract enforcement at the sandbox boundary validates the forge's output, and (4) AG-UI streaming events let the user watch the forge work in real-time.

**Future experiment (from Q22):** If the meta-skill approach proves too rigid for complex repair decisions (the if/else on `result.pass` is less flexible than letting the LLM reason between steps), try ATLAS as an outer loop around Code Mode — each step triggers a sandbox execution, the LLM decides what to do next based on the result.
```

**PlanSearch for Vivief contracts:**

```typescript
async function planSearch(contract: Contract, intent: string): Promise<Constraint[]> {
  const prompt = `
    Given this Vivief Contract specification:
    ${JSON.stringify(contract.spec)}

    And this intent: "${intent}"

    Extract every constraint the generated code must satisfy.
    For each constraint, specify:
    - What must be true
    - How to verify it
    - What a violation looks like
  `
  return await callModel(prompt, { structured: true })
}
```

The power here is that your Contract already *is* a structured spec. ATLAS has to parse free-text problem statements; you have typed datoms with explicit validation rules.

**Self-test generation:**

```typescript
async function generateSelfTests(contract: Contract, constraints: Constraint[]): Promise<SelfTest[]> {
  const prompt = `
    Given these constraints: ${JSON.stringify(constraints)}

    Generate test cases that would verify the code satisfies each constraint.
    For each test:
    - Input state (datoms to start with)
    - Action to invoke
    - Expected output state
    - Which constraint it verifies
  `
  return await callModel(prompt, { structured: true })
}
```

**PR-CoT repair** (the multi-perspective chain-of-thought):

When code fails self-tests, instead of a single "fix this" prompt, the model examines the failure from four perspectives: (1) what the constraint requires, (2) what the code actually does, (3) why the specific test case fails, (4) what minimal change would fix it. In ATLAS, this pattern rescued 85.7% of failures that reached the repair phase.

**Success criteria:** The forge produces valid effectHandlers or projection queries that single-shot generation fails on. Measured: forge pass rate is at least 15 percentage points higher than single-shot on a set of 20 hard test tasks.

---

## Part 6: How to contribute

### The principles

1. **Everything is a datom.** Verification results, prompt scores, template captures, repair attempts, skills — all are datoms with tx ordering. This is non-negotiable; it's how the system learns from its own history. Skills use flexible code refs (string, file, or GitHub link).

2. **Binary eval or nothing.** If you can't express a quality criterion as pass/fail with a deterministic check, it doesn't go into an automated loop. Fuzzy criteria produce garbage-optimised prompts. (LLM-as-judge is acceptable only with adversarial re-eval as a cross-check.)

3. **Local first.** Cloud is the escalation path, not the default. Every capability we build should work on a local model first, with cloud as the fallback for tasks that genuinely exceed local capability.

4. **The model stays frozen. Skills compound.** We don't fine-tune (unless E4B routing proves inadequate — see `vivief-code-mode-integration.md` Q17). We make the infrastructure around the model smarter via Code Mode skill accumulation. Skills are TypeScript — version-controlled, diffable, automatically benefit from model improvements.

5. **Code Mode is the deterministic-first mechanism.** LLM generates TypeScript (non-deterministic). Sandbox executes it (deterministic). Skills accumulate (infrastructure improvement). Trust progresses (0.0 -> 1.0). The system gets more deterministic over time without retraining.

6. **AG-UI for real-time, datoms for persistence.** Execution events stream via AG-UI for interactive display. Events commit as datoms after execution for debugging, monitoring, and the self-improving loop itself.

### What we need ideas on

- **New prompt families.** What other generation tasks have clear binary eval criteria? Add them to the prompt garden.
- **Better binary criteria.** The quality of the self-improving loop is bounded by the quality of its eval. If you can express "good TypeScript" more precisely, the loop improves faster.
- **Repair strategies.** PR-CoT is one repair pattern. Are there others? What about repair guided by the type error message? Repair guided by similar passing examples from history?
- **Aperture heuristics.** How should the system decide which tasks are "simple" (single-shot) vs. "hard" (full pipeline)? Contract complexity? Historical pass rate for similar tasks? Embedding distance from known templates?
- **Template generalization.** When a template gets captured, how aggressively should we generalize its argument spec? Too narrow = rarely reused. Too wide = generates garbage for edge cases.

### Where to find things

| Resource | Location |
|----------|----------|
| This document | `docs/intent/creation/self-improving-creation-loop.md` |
| Intro deck | `docs/intent/creation/self-improving-creation-loop-intro.pptx` |
| Vivief architecture | `docs/claude/INDEX.md` (start here) |
| Creation loop concept | `docs/intent/creation/creation-is-what-we-do.md` |
| Aperture concept | `docs/intent/creation/linear-meets-vivief.md` |
| Template capture flow | `docs/intent/creation/generative-ui-spike.md` |

### References

| Project | What we take from it | Link |
|---------|---------------------|------|
| ATLAS | PlanSearch, self-test-gen, PR-CoT repair, best-of-K | `github.com/itigges22/ATLAS` |
| Autoresearch | The Karpathy loop: generate, score, keep/revert, mutate | `github.com/karpathy/autoresearch` |
| Autoresearch as Skill | Universal skill wrapper with repo scanning | `github.com/balukosuri/Andrej-Karpathy-s-Autoresearch-As-a-Universal-Skill` |
| Gemma 4 | 26B-A4B MoE model for local inference | `ollama.com/library/gemma4:26b` |
| TanStack Code Mode | Sandbox execution, skills system, AG-UI streaming | `tanstack.com/ai` |

### Related documents

| Document | Relationship |
|----------|-------------|
| `vivief-code-mode-integration.md` | 25 resolved decisions on Code Mode integration (this doc was updated based on those decisions) |
| `vivief-local-llm-intent.md` | Five-tier LLM architecture (also updated with Code Mode changes) |
| `vivief-code-mode-tanstack.md` | TanStack Code Mode blog post (source material) |

---

*Last updated: 2026-04-11. Revised with TanStack Code Mode integration decisions. This is a living document — add your ideas, challenge assumptions, propose new spikes.*
