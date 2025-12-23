# Vision Documentation

> **What we WANT to build** — Conceptual foundation and philosophy

This directory contains the conceptual architecture for DevAC — the aspirational design that guides implementation decisions.

## Documents

| Document | Purpose |
|----------|---------|
| [foundation.md](./foundation.md) | Core concepts: Effect Handler pattern, Seeds, Vision↔View loop, Human/LLM/System division |
| [foundation-visual.md](./foundation-visual.md) | Visual companion with Mermaid diagrams illustrating the concepts |
| [foundation-impl-guide.md](./foundation-impl-guide.md) | Guidance on how to implement the foundation concepts |
| [validation.md](./validation.md) | Unified feedback model: local validation, CI, issues, PR reviews all flow through Watch→Validate→Cache→Query |

## Reading Order

1. **Start with Foundation** — Understand the core concepts and philosophy
2. **Visual Guide** — See the concepts as diagrams
3. **Validation & Feedback** — The unified feedback model
4. **Implementation Guide** — Learn how to build toward the vision

## Key Concepts

The foundation defines several key concepts:

- **Effect Handler Pattern**: `(state, effect) => (state', [effect'])` — the universal abstraction
- **Seeds**: Queryable extractions of sources of truth (Parquet files)
- **Vision↔View Loop**: The cycle between intent and implementation
- **Three Pipelines**: Vision→View, Question→Answer, Query→Data
- **Human/LLM/System Division**: Who does what in the workflow

## Relationship to Implementation

These documents describe the **complete vision** — not all of it is implemented yet. See [Implementation Roadmap](../implementation/roadmap.md) for what's been built and what's planned.

---

*See [Implementation Documentation](../implementation/) for what's actually built.*
