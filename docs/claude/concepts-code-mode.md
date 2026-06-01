---
topic: code-mode
status: canonical
depends-on: [concepts-effecthandler, concepts-contract, concepts-creation-loop]
human-version: ../intent/local-llm/vivief-code-mode-integration.md
last-verified: 2026-04-11
---

# Code Mode Integration

TanStack Code Mode adopted as sandbox infrastructure. Patterns (skills, trust) adapted to vivief primitives.

## What Code Mode Is

Single `execute_typescript` tool: LLM writes TypeScript that composes tools in a sandbox. One call in, structured result out. Eliminates N+1 round-trips. Math/computation in runtime, not LLM.

## How It Maps to Vivief

**Code Mode is a generation mechanism, not a fifth effectHandler strategy.** It sits between the LLM and the Code strategy — produces TypeScript that becomes Code-strategy effectHandlers.

The sandbox is a constrained effectHandler environment:
- `external_*` functions = effectHandler invocations through standard pipeline
- Return type = `{ datoms: Datom[], intents: Intent[] }` (enforced by system prompt)
- Each `external_*` call validated against target's Behavior Contract

## Sandbox Architecture

- **Primary**: QuickJS WASM (cross-platform: desktop, browser, mobile)
- **Dev fallback**: Node V8 (faster iteration via `isolated-vm`)
- **Clean separation**: LiteRT-LM/Ollama (inference) and sandbox (execution) are separate processes, bridged via `external_*` functions

## Contract Enforcement

External enforcement at sandbox boundary. Always. Sandbox is untrusted.
1. Before: precondition validation on intent and state
2. After: postcondition validation on returned datoms/intents
3. During: each `external_*` call validated before dispatch

## Observability

AG-UI streaming for real-time execution display (low latency). Events commit as datoms after execution for debugging, monitoring, and the self-improving loop.

## Skills

Skills stored as datoms with flexible code refs (string, file, GitHub). Trust model: vivief 0.0-1.0 scalar subsumes TanStack tiers. Both TypeScript and markdown skills; push TypeScript when possible.

| Trust range | Behavior |
|---|---|
| 0.0-0.3 | Sandboxed only |
| 0.3-0.6 | Gated, requires approval |
| 0.6-0.85 | Autonomous, draft datoms |
| 0.85-1.0 | Like code-strategy effectHandlers |

Phase 1: governed skill creation (creation loop). Phase 2: frictionless.

## Five-Tier Model Placement

Code Mode available to Local tier (E4B) and above. E4B handles simple compositions. 26B MoE for complex offline. Sonnet/Opus for quality/architectural skills. Same sandbox across all tiers; trust model handles quality.

## Compounding Flywheel

Autoresearch improves Code Mode prompts -> better TypeScript -> more successful skills -> faster trust progression -> trusted skills become new `external_*` functions -> expanded capability -> autoresearch evolves for expanded surface.

## Key Files

- `docs/intent/local-llm/vivief-code-mode-integration.md` — 25 resolved decisions
- `docs/intent/local-llm/vivief-self-improving-creation-loop.md` — revised spikes (0-3)
- `docs/intent/local-llm/vivief-local-llm-intent.md` — revised model strategy
