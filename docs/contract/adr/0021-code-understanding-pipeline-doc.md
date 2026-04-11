# ADR-0021: Code Understanding Pipeline Documentation

## Status

Accepted

## Context

DevAC's transformation from source code to architectural understanding spans multiple stages and was previously documented across 5+ separate files:

- `parsing.md` - AST extraction
- `data-model.md` - Node, Edge, Effects schemas
- `rules-engine.md` - Pattern matching
- `views.md` - C4 diagram generation
- `foundation.md` - Conceptual overview

Readers had to piece together the complete flow by jumping between documents. This made it difficult to:
1. Understand the end-to-end pipeline
2. Review the transformation logic
3. Onboard new contributors
4. Validate that documentation matched implementation

Additionally, there was a question about whether Effects and Rules should be unified (single transformation step) or kept separate (distinct concerns).

## Decision

### 1. Create Unified Pipeline Documentation

We created `docs/implementation/pipeline.md` as the authoritative source for understanding the complete AST-to-Views transformation:

```
STAGE 1: SOURCE → AST
STAGE 2: AST → STRUCTURAL DATA (Nodes, Edges, Effects)
STAGE 3: STRUCTURAL → SEMANTIC (Optional resolution)
STAGE 4: EFFECTS → DOMAIN EFFECTS (Rules Engine)
STAGE 5: DOMAIN EFFECTS → VIEWS (C4 Generator)
```

The document:
- Provides a high-level visual overview first
- Breaks down each stage with key files and examples
- Includes a complete traced example (payment flow)
- References detailed documents for each stage

### 2. Keep Effects and Rules Separate

We decided to maintain the separation between Effects (extracted data) and Rules (interpretation logic):

| Aspect | Effects | Rules |
|--------|---------|-------|
| **Nature** | Data (observations) | Logic (interpretation) |
| **When Created** | During AST parsing | After parsing, on-demand |
| **Source** | Code structure | Pattern matching config |
| **Extensibility** | Add new effect types (code change) | Add new rules (config change) |

**Key insight:**
```
Effects = WHAT the code does (extracted, deterministic)
Rules   = WHAT the code MEANS (interpreted, configurable)
```

## Consequences

### Positive

- **Reviewable pipeline**: Users can now understand the complete flow from one document
- **Clear abstraction layers**: AST → Effects → Domain → Views is well-defined
- **Extensibility preserved**: Rules can be customized per team without code changes
- **Testing isolation**: Effects can be tested independently of rule interpretation
- **Onboarding efficiency**: New contributors have a single starting point

### Negative

- **Document maintenance**: Pipeline.md must be kept in sync with stage-specific docs
- **Potential duplication**: Some content exists in both pipeline.md and detailed docs

### Neutral

- Cross-references added to all related documents pointing to pipeline.md
- Existing detailed documents remain the authoritative source for their specific stage

## References

- [pipeline.md](../implementation/pipeline.md) - The new unified pipeline documentation
- [data-model.md](../implementation/data-model.md) - Effects schema details
- [rules-engine.md](../implementation/rules-engine.md) - Rule pattern matching
- [views.md](../implementation/views.md) - C4 diagram generation
- [foundation.md](../vision/foundation.md) - Conceptual foundation
