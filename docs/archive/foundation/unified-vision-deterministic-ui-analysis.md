# Unified Vision: Deterministic UI Analysis System

> **Purpose**: Working document that led to the creation of [actors.md](../vision/actors.md).
> **Status**: Superseded by `/docs/vision/actors.md` as the authoritative source.
> **Created**: 2026-01-16
> **Related Issues**: #189 (Static Analysis), #191 (Runtime Discovery), #192 (Effect Hierarchy)

---

## Document Status

This spec document was used to develop and refine the Actor Model vision. The concepts have been formalized and integrated into the DevAC vision documents:

| Concept | Now Lives In |
|---------|--------------|
| Actors as higher-level effects | [actors.md](../vision/actors.md) §2 |
| Effect hierarchy levels | [actors.md](../vision/actors.md) §2.2 |
| Three sources of Actor discovery | [actors.md](../vision/actors.md) §3 |
| Effect Telemetry MCPs | [actors.md](../vision/actors.md) §4 |
| Glossary terms | [concepts.md](../vision/concepts.md) §8 |
| Effect hierarchy reference | [foundation.md](../vision/foundation.md) §5.5 |

**For the authoritative vision, see: [docs/vision/actors.md](../vision/actors.md)**

---

## Original Vision Summary (Preserved for Context)

### The Core Thesis

**Make the entire system deterministically queryable for analysis, documentation, code quality verification, and understanding what the system actually does.**

This isn't about building three separate features—it's about creating a unified framework where:

1. **Static code analysis** extracts what the code *declares*
2. **Runtime discovery** captures what the code *does*
3. **Effect hierarchy** provides the *conceptual model* to bridge them

Together, they enable humans and LLMs to collaborate productively by making all relevant state queryable.

### The Key Innovation

**Actors as Higher-Level Effects**: State machines aren't just explicit XState code. They can be **inferred from effect sequences** using the same pattern recognition as domain effects.

```
Effect Path Analysis:
  [Condition + Store + FunctionCall] → StateTransition
  [Multiple StateTransitions sharing state] → Actor (State Machine)
  [Multiple Actors communicating] → ActorSystem
```

**Why this is powerful**:
1. **Actors ARE documentation** - they describe what the system does
2. **Hierarchical composition** - actors can contain actors
3. **Same pattern everywhere** - `effectHandler = (state, effect) => (state', [effect'])`
4. **Unifies code and runtime** - both produce the same Actor effect type

### Effect Telemetry (Generalized Runtime Discovery)

Runtime discovery isn't just browser—it's **any runtime environment** producing effect telemetry:

| Environment | MCP Server | What It Observes |
|-------------|------------|------------------|
| **Browser** | `browser-mcp` | A11y tree, DOM interactions, focus, network |
| **React Native** | `expo-mcp` (future) | Component tree, gestures, navigation |
| **Server** | `otel-mcp` | OpenTelemetry spans, traces, metrics |

**Why they exist**: Static analysis sees what code *declares*. Runtime telemetry sees what code *does*. Together they validate each other.

### Implementation Phases

1. **Phase 0**: JSX Component Extraction (prerequisite)
2. **Phase 1**: A11y Attribute Extraction
3. **Phase 2**: WCAG Validation via Rules Engine
4. **Phase 3**: State Machine Discovery (explicit + inferred + runtime)
5. **Phase 4**: Runtime Telemetry Integration
6. **Phase 5**: Full Effect Hierarchy

### Relationship to Existing Issues

| Issue | Role |
|-------|------|
| #189 (XState + A11y) | Implementation of actors.md Phases 1-3 |
| #191 (Browser-MCP) | Implementation of actors.md §4 (browser telemetry) |
| #192 (Effect Hierarchy) | Incorporated into actors.md §2 |

---

## Next Steps

This working document has served its purpose. Future work should:

1. Reference [actors.md](../vision/actors.md) as the source of truth
2. Update issues #189, #191, #192 to reference actors.md
3. Begin implementation based on the phased approach in actors.md §9

---

*This document is preserved for historical context. For current vision, see [actors.md](../vision/actors.md).*
