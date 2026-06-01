# Vivief Intent: TanStack Code Mode Integration

> **Status**: Resolved (2026-04-11) — 25 design decisions from interview
> **Session**: Claude Code interview, 2026-04-11
> **Builds on**: `vivief-code-mode-tanstack.md`, `vivief-local-llm-intent.md`, `vivief-self-improving-creation-loop.md`
> **Next**: Spike 0 — Sandbox Integration (foundation for revised spike sequence)

## Resolution Summary

TanStack Code Mode (April 2026) provides sandboxed TypeScript execution and a skills system with trust progression. This interview resolved how to integrate it with vivief's five-concept architecture.

**Root decision (Q1): Adopt infrastructure, adapt patterns.** Use TanStack's sandbox (`@tanstack/ai-code-mode`, isolate drivers, AG-UI streaming) as adopted infrastructure. Adapt the conceptual patterns (skills, trust, composition) to vivief's native primitives (datoms, Contracts, effectHandlers). The impedance mismatch between layers is minimal — TanStack's infrastructure layers slot cleanly beneath vivief's conceptual layers.

---

## What TanStack Code Mode Is

A single `execute_typescript` tool replaces many individual LLM tool calls. Instead of the LLM orchestrating tools one-by-one, it writes a short TypeScript program that composes tools with loops, conditionals, and data transformations, then executes it in a secure sandbox. One call in, one structured result out.

Key properties:
- **Sandbox isolation**: Fresh context per execution, configurable timeout/memory limits
- **Three isolate drivers**: Node V8 (fastest), QuickJS WASM (portable, browser), Cloudflare (edge)
- **Typed function stubs**: Tools become `external_*` functions with full TypeScript types in the system prompt
- **Skills**: LLM saves working code as persistent, typed, named skills that earn trust through executions
- **AG-UI streaming**: Custom events during execution (console, external calls, errors)
- **Provider agnostic**: Any model that writes TypeScript

---

## Resolved Decisions

### Branch A: Execution Runtime

**Q2: QuickJS WASM primary, Node V8 dev fallback.** QuickJS for cross-platform portability (desktop, browser, mobile). Node V8 for fast development iteration. `IsolateDriver` interface makes this swappable.

**Q3: Clean separation between inference and execution.** LiteRT-LM (or Ollama) handles inference; Code Mode isolate handles execution. Typed bridge via `external_*` functions. They never share a process. Both inference backends are viable — the bridge doesn't care which sits behind `external_invokeLocalModel`.

**Q4: Build web progressive enhancement now.** QuickJS WASM (sandbox) + LiteRT-LM WebGPU (inference) in browser is a compelling proof-of-concept. Tauri desktop can wait while web validates the cross-platform story early.

### Branch B: Skill System Unification

**Q5: Skills stored as datoms, with flexible code refs.** Skill code can be a datom string value, a file reference, or a GitHub link. The datom store is the index; actual code lives wherever makes sense. Ongoing design debate as we learn and implement.

**Q6: Vivief's scalar trust model (0.0-1.0) subsumes TanStack's tiers.** Execution count and success rate are inputs to trust calculation, not sole determinants. `min(source_trusts)` propagation applies.

| TanStack tier | Vivief trust | Behavior |
|---|---|---|
| New (no executions) | 0.0-0.3 | Sandboxed only |
| Provisional (threshold met) | 0.3-0.6 | Gated, requires approval |
| Trusted (high success rate) | 0.6-0.85 | Autonomous, draft datoms |
| Verified (human-reviewed, Contract) | 0.85-1.0 | Like code-strategy effectHandlers |

**Q7: Start governed, relax to frictionless in next phase.** Phase 1: skill registration produces `:skill/creation-requested` intents entering the creation loop with human approval. Phase 2: relax to frictionless registration; governance applies at promotion, not creation.

**Q8: Two-stage routing now, merge into VivRouter later.** E4B classifies intent into five primitives, then separate skill selector picks from matching pool. Merge into single VivRouter call as experience accumulates.

**Q9: Both TypeScript and markdown, pushing TypeScript when possible.** Code Mode makes the markdown-to-TypeScript transition automatic: capture LLM execution as TypeScript, register as code-strategy skill. TypeScript skills are testable, type-checkable, reach trust 1.0. Markdown remains for judgment-heavy tasks.

### Branch C: effectHandler Strategy Evolution

**Q10: Code Mode is a generation mechanism, not a fifth effectHandler strategy.** It sits between the LLM and the Code strategy — produces TypeScript that becomes Code-strategy effectHandlers. Changes the Hybrid strategy: from "deterministic steps + LLM for edges" to "LLM generates TypeScript that deterministically orchestrates effectHandlers."

**Q11: Sandbox = constrained effectHandler environment.** Each `external_*` call dispatches an intent to an effectHandler. Sandbox must return `{ datoms: Datom[], intents: Intent[] }`. System prompt enforces return type. Contract validates output.

```typescript
// Inside sandbox:
const sessionData = await external_queryProjection({ spec: "client_progress", filters: {...} })
const analysis = await external_dispatchEffect({ handler: "pattern_analysis", payload: sessionData })
return {
  datoms: [{ e: "session:42", a: ":session/patterns", v: analysis.patterns, tx: "pending", op: "assert" }],
  intents: [{ type: ":surface/refresh-requested", target: "dashboard" }]
}
```

**Q12: External Contract enforcement at sandbox boundary. Always.** Preconditions before execution, postconditions after, each `external_*` call validated against target's Behavior Contract before dispatch. Sandbox cannot bypass enforcement.

**Q13: AG-UI for real-time display, datoms for persistence.** Two rendering paths: AG-UI streams `onCustomEvent` for interactive execution viewing (low latency). Events commit as datoms after execution for debugging, monitoring, and the self-improving loop.

### Branch D: N+1 and Composition

**Q14: Both layers — datom-native for data, Code Mode for orchestration.** Data layer N+1 solved by EAVT/AEVT/AVET/VAET indexes. Orchestration layer N+1 solved by Code Mode's `Promise.all` across effectHandler calls. Different problems at different layers.

**Q15: Code Mode implements multi-agent primitives, not replaces them.** Sequential/Parallel/Loop are the type system constraining compositions. Code Mode TypeScript is how the LLM authors compositions. Contracts govern ordering and error semantics.

**Q16: Narrow aperture default inside sandbox.** External calls default to narrow (explicit, single handler). LLM must explicitly request wide: `external_dispatchEffect({ ..., aperture: "wide" })`. Prevents accidental chorus cascades.

### Branch E: Model Routing and Provider Architecture

**Q17: Start with E4B, add fine-tuned VivRouter only if needed.** E4B's native function calling handles both intent classification and skill selection. No fine-tuning overhead initially. Let data drive the decision.

**Q18: Provider agnostic at Code Mode layer, flexible inference backend.** Code Mode doesn't care which model wrote the TypeScript. Five-tier mapping:
- Micro: E4B function calling (replaces fine-tuned VivRouter)
- Local: E4B simple Code Mode
- Local+: 26B MoE complex Code Mode offline
- Normal: Sonnet complex skill authoring
- Deep: Opus architectural skills

**Q19: Code Mode available to Local tier (E4B) and above.** E4B (4B active, 128K context) has sufficient capability for simple compositions. Same sandbox infrastructure across all tiers; trust model handles quality differences.

### Branch F: Self-Improving Loop Impact

**Q20: Frozen-model thesis validated for skills. Fine-tuning only for routing if data demands it.** Start without fine-tuning. Entire system can run on frozen models + Code Mode skills. Fine-tune VivRouter only if E4B classification proves inadequate.

**Q21: Autoresearch optimizes Code Mode system prompt templates.** The compounding flywheel:
1. Autoresearch improves Code Mode prompts
2. Better prompts -> higher-quality TypeScript
3. Higher-quality TypeScript -> more successful skill executions
4. More successful executions -> faster trust progression
5. Trusted skills -> new `external_*` functions
6. More functions -> expanded capability
7. Autoresearch evolves prompts for expanded capability set

**Q22: ATLAS as Code Mode meta-skill.** PlanSearch + best-of-3 + self-test repair implemented as TypeScript inside the sandbox. `Promise.all` for parallel candidates, `external_verify` for Contract checking. Future experiment: ATLAS as outer loop if meta-skill proves too rigid.

**Q23: Skill trust feeds aperture calculation.** As skills progress through trust tiers, aperture narrows. Future enhancement: user-controlled override per interaction if users report lacking control.

**Q24: Skills-first, fine-tuning only if truly needed.** Every fine-tuned model is maintenance. Skills are TypeScript — version-controlled, diffable, automatically benefit from model improvements.

**Q25: AG-UI for real-time, datoms for persistence (same as Q13).** Two rendering paths optimized for their respective use cases.

---

## Revised Architecture

```
TanStack Code Mode (adopted infrastructure)
├── Sandbox: QuickJS WASM primary, Node V8 dev fallback
├── AG-UI streaming: real-time execution display
├── Provider adapters: any model generates TypeScript
└── IsolateDriver interface: swappable runtimes

Vivief Primitives (adapted patterns)
├── Skills = datoms with flexible code refs (string/file/GitHub)
├── Trust = vivief scalar 0.0-1.0 (subsumes TanStack tiers)
├── Governance = creation loop wraps skill registration (Phase 1: governed, Phase 2: frictionless)
├── Contract enforcement = external, at sandbox boundary
└── Observability = AG-UI real-time + datom persistence
```

---

## Revised Spike Sequence

The existing three spikes gain a foundation spike (Spike 0) and evolve to use Code Mode:

```
Spike 0: Sandbox Integration (foundation)
│  - Install @tanstack/ai-code-mode + @tanstack/ai-isolate-quickjs
│  - Implement external_* function bridge to vivief effectHandlers
│  - Implement external_queryProjection for datom-native data access
│  - Contract enforcement at sandbox boundary (pre/post/during)
│  - AG-UI event streaming to Surface
│  - Test: LLM writes TypeScript that queries DatomStore via external_queryProjection
│
├── Spike 1: Contract Verifier (~2 days, depends on Spike 0)
│   - verify(artifact, contract) function (tsc + Contract.validate)
│   - Expose as external_verify inside sandbox
│   - Binary pass/fail, results as datoms
│   - Test: sandbox-generated TypeScript verified against Contract
│
├── Spike 2: Prompt Garden (~3 days, depends on Spike 1)
│   - Autoresearch loop per Code Mode prompt family
│   - Prompts target sandbox TypeScript generation
│   - Binary scoring via external_verify
│   - Skills accumulate from successful sandbox executions
│   - Test: overnight run improves prompt scores measurably
│
└── Spike 3: Template Forge (~1 week, depends on Spikes 0+1)
    - ATLAS pipeline as Code Mode meta-skill
    - PlanSearch: external_extractConstraints(contract)
    - Best-of-3: Promise.all at different temperatures
    - Self-test repair: external_prCotRepair
    - Test: forge pass rate 15pp+ higher than single-shot
```

---

## Revised Model Strategy

- **Start with E4B** for all local tasks (routing, generation, Code Mode). No fine-tuning initially.
- **Add VivRouter fine-tuning** only if E4B classification accuracy proves inadequate.
- **Skills-first**: lean toward Code Mode skill accumulation over fine-tuning for capability building.
- **Web progressive enhancement**: QuickJS WASM + LiteRT-LM WebGPU in browser alongside desktop.

---

## Key Principles Confirmed

1. **Deterministic-first thesis holds**: Code Mode is the mechanism — LLM generates TypeScript, system executes deterministically, skills accumulate.
2. **Everything is still a datom**: skills stored as datoms (with flexible code refs), execution events persist as datoms (after real-time AG-UI display).
3. **Contract enforcement is external at sandbox boundary**: the sandbox is untrusted by definition.
4. **Frozen model thesis validated**: Code Mode skills prove you can accumulate capabilities without retraining.
5. **The compounding flywheel is concrete**: autoresearch -> better prompts -> better TypeScript -> more skills -> wider capability -> autoresearch on expanded surface.

---

## What Changed from Prior Documents

### Changes to `vivief-local-llm-intent.md`
- **Five-tier Micro tier**: from "VivRouter (FunctionGemma fine-tune)" to "E4B function calling (fine-tune only if needed)"
- **Fine-tuning pipeline**: skills-first approach, fine-tuning contingent on data
- **LiteRT-LM**: Ollama also viable behind the typed bridge
- **Action items**: sandbox integration spike moves ahead of fine-tuning work

### Changes to `vivief-self-improving-creation-loop.md`
- **New Spike 0**: Sandbox Integration as foundation
- **Spike 1**: Contract verifier also exposed as `external_verify` in sandbox
- **Spike 2**: Autoresearch targets Code Mode system prompt templates; compounding flywheel added
- **Spike 3**: ATLAS as Code Mode meta-skill with `Promise.all`
- **Model strategy**: E4B-first, skills-first
- **New principle**: "Code Mode is the mechanism for deterministic-first"

### No changes to `vivief-concepts-v6.md`
Code Mode maps cleanly onto existing concepts. effectHandler strategies unchanged (Code Mode is generation, not strategy). Trust model, Contract enforcement, creation loop, aperture all absorb Code Mode without modification.
