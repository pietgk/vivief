# Session Harness

> Intent: context management via progressive disclosure within a creation session.

**Status**: Open — extracted from [archived high-level-concepts](../../archive/brainstorms/high-level-concepts.md) for focused exploration.

---

## Core Idea

A **SessionHarness** manages the context available to effectHandlers during an interaction session. It maintains layers of context-fragments that expand through progressive disclosure — starting with frontmatter-level summaries and deepening into full content only when needed.

Context-fragments are Projections from datoms, organized as:
- **Frontmatter** — metadata for quick relevance analysis
- **Markdown text** — standard hierarchy for progressive detail
- **References** — named links to related documents/datoms

The harness controls what context is active, what's available on demand, and what's excluded — managing the token budget across human, AI, and system participants.

## Overlapping Concepts

This idea connects to several existing designs:

- **Context-as-Fractal** ([creation-loop-extensions.md](../../contract/vision/creation-loop-extensions.md)) — resolves context layering: Projection at base, Surface as rendering. The SessionHarness would be the runtime implementation of this model.
- **Projection** ([concepts-projection Claude window](../../claude/concepts-projection.md)) — progressive disclosure maps directly to Projection's query + access scope + delivery modes. A SessionHarness may be a specialized Projection with session-scoped lifecycle.
- **Knowledge acquisition** ([knowledge-acquisition.md](knowledge-acquisition.md)) — the "context composition" concern (Section 3) describes how research results become session context. SessionHarness is the container for that composition.
- **Aperture** ([creation-loop-extensions.md](../../contract/vision/creation-loop-extensions.md)) — aperture controls how much possibility flows in; the SessionHarness manages what's visible at the current aperture setting.

## Open Questions

1. Is SessionHarness a new concept or just a Projection with session scope?
2. How does progressive disclosure interact with aperture? Does widening aperture also deepen disclosure?
3. What manages the harness — is it an effectHandler itself, or infrastructure below the handler level?
4. How do partitioners (context-fragment organizers) relate to D2TS operators?
