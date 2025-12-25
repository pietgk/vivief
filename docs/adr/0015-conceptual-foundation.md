# ADR-0015: Conceptual Foundation - Effect Handler Pattern

## Status

Accepted

## Context

As DevAC evolved from a code analysis tool to a broader development workflow system, we accumulated multiple conceptual documents:
- Vision View Effect (VVE) system specs (v1.1, v2.0)
- Linters as executable specs
- OpenTelemetry overlap analysis
- Code intelligence platform brainstorms

These documents contained overlapping ideas but lacked a unifying abstraction. We needed a single conceptual foundation that:
- Defines core terminology consistently
- Provides a unifying pattern for all components
- Separates "why/what" from "how"
- Adapts to evolving LLM capabilities
- Guides future implementation decisions

## Decision

Adopt the **Effect Handler Pattern** as the unifying abstraction for DevAC:

```
effectHandler = (state, effect) => (state', [effect'])
```

This pattern models everything as immutable effects flowing through handlers:
- HTTP requests/responses
- State machine transitions
- Development events (file changes, issue claims, PR merges)
- Validation checks
- LLM reasoning steps

### Key Concepts Established

1. **Three Pillars**: Infra (DevAC Health), Validators (Diagnostics), Extractors (Seeds). See [concepts.md](../vision/concepts.md).

2. **Three Pipelines**: Vision→View (human), Question→Answer (collaborative), Query→Data (system)

3. **Effect Taxonomy**: Data Effects, Do Effects, Flow Effects, Group Effects

4. **Seeds**: Queryable extractions from sources of truth (DuckDB/Parquet)

5. **Hub**: Federation layer for cross-repo queries

6. **Two Worlds**: Deterministic (systems) vs Non-deterministic (humans/LLMs)

7. **Division of Labor**: Clear assignment of tasks to systems, LLMs, and humans

8. **Rules**: Pattern matchers that aggregate low-level effects into high-level effects

9. **Adaptability**: Design for LLM capabilities to improve over time

### Document Structure

The foundation document (`docs/foundation.md`) is structured as:
- **Sections 1-11**: Core concepts ("why/what")
- **Appendix**: Implementation details ("how")

This separation ensures the conceptual foundation remains stable while implementation details can evolve.

## Consequences

### Positive

- **Unified vocabulary**: All team members and LLMs use same terminology
- **Pattern consistency**: New features fit the effect handler pattern
- **Clear boundaries**: Know what systems vs LLMs vs humans should handle
- **Adaptability**: Foundation doesn't assume current LLM limitations are permanent
- **Implementation guidance**: Appendix provides current status and next steps

### Negative

- **Abstraction overhead**: Effect pattern requires learning curve
- **Future concepts**: Effect Store, Rules Engine not yet implemented
- **Document maintenance**: Foundation must stay in sync with implementation

### Neutral

- **Prior ADRs remain valid**: Foundation formalizes existing decisions
- **Future ADRs needed**: When implementing Effect Store, Rules Engine, etc.
- **VVE lineage**: Foundation synthesizes prior VVE spec work

## References

- [DevAC Concepts](../vision/concepts.md) - Quick reference for terminology and Three Pillars
- [Conceptual Foundation Document](../vision/foundation.md)
- [VVE System v2.0](../archive/foundation-v2.md) - Effect taxonomy source
- [Linters as Rules](mindler/packages/architecture/specs/335-linters-as-rules.md) - Executable specs concept
- [OTEL Overlap Analysis](mindler/packages/architecture/specs/335-otel-overlap-analysis.md) - Runtime extraction insights
- [ADR-0007: Federation Central Hub](0007-federation-central-hub.md) - Hub concept implementation
- [ADR-0014: Worktree Claude Workflow](0014-worktree-claude-workflow.md) - Context preservation implementation
