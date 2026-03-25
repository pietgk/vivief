# ADR-0046: Runtime and Language

## Status

Superseded by [ADR-0050](0050-tech-stack.md). Browser-first architecture eliminates the runtime question; Node.js 24 LTS used for dev tooling only. TypeScript language choice carried forward.

## Context

The vivief platform (and its devac tooling) requires a runtime and primary language decision as specified in the implementation KB §2.1. The platform needs strict type safety for Contract enforcement at compile time, native async/streaming for Projection delivery modes, and a rich ecosystem for UI, state machines, and testing.

**Current state.** DevAC is built on TypeScript / Node.js with a traditional build step (TypeScript compiled to JavaScript via `tsc` or Turborepo). Every change to CLI commands, MCP tools, or skill files requires a rebuild before the change can be observed. This slows the development loop for the most actively iterated parts of the system.

**Why this decision is needed now.** The implementation KB frames three candidates (Node.js, Deno, Bun) without deciding. Bun can be eliminated based on compatibility testing with existing devac dependencies. The remaining choice — whether to migrate from Node.js to Deno — has concrete implications for how CLI, MCP, and skills are developed and run.

**Bun elimination.** Bun was evaluated and found incompatible with current devac dependencies. It cannot be adopted without resolving upstream compatibility issues that are outside the project's control.

## Decision

Adopt **TypeScript / Deno** as the runtime for vivief platform components, and plan a migration away from Node.js for existing devac packages.

**TypeScript** is retained as the primary language. It is already used throughout devac, and its structural type system provides compile-time Contract enforcement — a first-class requirement. Python with optional typing was not considered; bolted-on type systems lack the structural guarantees needed for the Contract model.

**Deno** is chosen over Node.js for the following reasons:

### 1. Security by default

Deno requires explicit permission grants (`--allow-net`, `--allow-read`, `--allow-write`, `--allow-env`, `--allow-run`). This maps directly to the vivief trust model: every actor declares what it can access. A rogue dependency cannot silently exfiltrate data or write to the filesystem. For a platform that handles counseling data and applies trust scores to all datoms, runtime permission enforcement is a meaningful defense layer — not just a developer convenience.

### 2. No build step — run TypeScript directly

Deno executes TypeScript natively without a `tsc` or bundler pass. For CLI commands, MCP tools, and skill files this removes the edit → build → run cycle entirely. The developer changes a file and runs it immediately. This is particularly valuable for:

- **CLI commands** — frequently changed, tested by running them
- **MCP tools** — iterated against live LLM sessions
- **Skills** — markdown + TypeScript orchestration files that evolve rapidly

The build step is not eliminated entirely — bundling for distribution and web UI still applies — but it is no longer on the critical path for the components most actively developed.

### 3. Modern runtime APIs

Deno's standard library and built-in APIs (`Deno.serve`, `ReadableStream`, `fetch`, `WebSocket`) are modern, spec-aligned, and do not require the Node.js polyfill layer. The concepts require native streaming for Projection delivery modes (in-flight tokens, live Projections). Deno's stream APIs align more directly with the platform's needs.

### 4. TypeScript is the right language for this platform

TypeScript's structural type system enables Contract enforcement at compile time — interfaces match the Contract model directly, generics enable typed effectHandler signatures, and strict mode catches constraint violations before runtime. Python's type system (`mypy`, `pyright`) is additive to an untyped language and does not provide the same structural guarantees. The devac PoC validates TypeScript at scale for this problem domain.

## Consequences

### Positive

- Explicit permission model aligns with the platform trust architecture
- No build step for CLI/MCP/skills reduces iteration time significantly
- Modern standard library reduces dependency surface
- TypeScript strict mode remains — compile-time Contract enforcement preserved
- Deno's native `deno fmt`, `deno lint`, `deno test` reduce toolchain complexity

### Negative

- Migration required from Node.js for existing devac packages — not a trivial effort
- Deno's ecosystem is smaller; some npm packages work via `npm:` specifiers but compatibility must be verified per dependency
- Team must learn Deno permission model and import conventions (URL imports, `deno.json`)
- Turborepo integration with Deno workspaces requires evaluation

### Neutral

- `npm:` specifier compatibility means most Node.js ecosystem packages are available, but native Deno packages are preferred where available
- Deno Deploy is an available hosting option but not required by this decision
- Bun remains eliminated; this decision does not reopen that option

## References

- [vivief-concepts-v6-implementation-kb.md §2.1](../vision/vivief-concepts-v6-implementation-kb.md) — Runtime & Language decision frame
- [vivief-concepts-v6.md §2.4](../vision/vivief-concepts-v6.md) — Contract enforcement requirements
- [ADR-0041](0041-cli-command-structure.md) — CLI command structure (affected by runtime choice)
- [ADR-0042](0042-mcp-tool-naming-conventions.md) — MCP tool conventions (affected by runtime choice)
- [Deno permissions model](https://docs.deno.com/runtime/fundamentals/security/)
