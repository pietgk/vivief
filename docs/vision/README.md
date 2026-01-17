# Vision Documentation

> **What we WANT to build** — Conceptual foundation and philosophy

This directory contains the conceptual architecture for DevAC — the aspirational design that guides implementation decisions.

## Documents

| Document | Purpose |
|----------|---------|
| [concepts.md](./concepts.md) | **Quick reference**: Four Pillars, terminology, status command, glossary |
| [foundation.md](./foundation.md) | Core concepts: Effect Handler pattern, Seeds, Vision↔View loop, Human/LLM/System division |
| [foundation-visual.md](./foundation-visual.md) | Visual companion with Mermaid diagrams illustrating the concepts |
| [foundation-impl-guide.md](./foundation-impl-guide.md) | Guidance on how to implement the foundation concepts |
| [validation.md](./validation.md) | Unified feedback model: local validation, CI, issues, PR reviews all flow through Watch→Validate→Cache→Query |
| [actors.md](./actors.md) | **Actor Model**: State machines as higher-level effects, three discovery sources, effect hierarchy |
| [ui-effects.md](./ui-effects.md) | **UI Effects**: JSX components, accessibility, Storybook as documentation and validation |

## Reading Order

1. **Start with Concepts** — Quick reference for terminology and structure
2. **Foundation** — Deep dive into core concepts and philosophy
3. **Visual Guide** — See the concepts as diagrams
4. **Validation & Feedback** — The unified feedback model
5. **Actors** — State machines as higher-level effects
6. **UI Effects** — JSX, accessibility, Storybook integration
7. **Implementation Guide** — Learn how to build toward the vision

## Key Concepts

### Four Pillars of DevAC

| Pillar | What It Does | Produces |
|--------|--------------|----------|
| **Infra** | Runs DevAC itself | DevAC Health |
| **Validators** | Check code health | Diagnostics |
| **Extractors** | Extract queryable data | Seeds |
| **Workflow** | Orchestrates development flow | Issue→PR→Merge automation |

Plus **Analytics** which uses Seeds + Diagnostics to answer questions.

### Core Abstractions

- **Effect Handler Pattern**: `(state, effect) => (state', [effect'])` — the universal abstraction
- **Seeds**: Queryable extractions of sources of truth (Parquet files)
- **Diagnostics**: Validation results (errors, warnings, or "all clear")
- **Human/LLM/System Division**: Who does what in the workflow

See [concepts.md](./concepts.md) for complete terminology and glossary.

## Relationship to Implementation

These documents describe the **complete vision** — not all of it is implemented yet. See [Implementation Roadmap](../implementation/roadmap.md) for what's been built and what's planned.

---

*See [Implementation Documentation](../implementation/) for what's actually built.*
