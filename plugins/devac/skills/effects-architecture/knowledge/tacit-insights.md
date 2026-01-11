# Tacit Insights

Knowledge discovered through conversation that is NOT directly detectable from code, DevAC analytics, or documentation.

## How to Use This File

1. Before answering effect questions, read these insights
2. Apply them when they're relevant to the question
3. When new insights are discovered, add them here
4. Each insight should note why it's not in code/docs

---

## Insight: AST is State

**Insight**: The AST produced by parsing IS a form of State.

**Why this matters**: When identifying effectHandlers in a pipeline, intermediate representations like AST should be recognized as State that handlers read/write.

**Not in code because**: The AST is not labeled as "State" in the codebase - it's just a data structure. But conceptually it fits the State definition.

**Applies when**: Identifying handlers in parsing/analysis pipelines.

**Example**:
```
Parser as EffectHandler:
  Input:  (empty, SourceCode)
  Output: (AST, [])

Where AST is State that subsequent handlers can use.
```

---

## Insight: Parser is EffectHandler

**Insight**: The TypeScript/Python parser that extracts effects IS itself an effectHandler.

**Why this matters**: The extraction code fits the pattern `(State, Effect) => (State', [Effects'])` but isn't labeled as such.

**Not in code because**: The parser code doesn't call itself an "effectHandler" - that's a conceptual label.

**Applies when**: Explaining what effectHandlers are, showing implementation varieties.

**Example**:
```
Analyzer as EffectHandler:
  Input State:  AST
  Input Effect: (trigger to analyze)
  Output State: (unchanged)
  Output Effects: CodeEffect[]
```

---

## Insight: Multiple Handler Implementations

**Insight**: Pattern matching (RuleEngine) is only ONE way to implement an effectHandler.

**Why this matters**: Documentation should show multiple implementation strategies, not just one.

**Not in code because**: Each implementation just does its job - there's no meta-commentary saying "this is one of many ways."

**Applies when**: Explaining effectHandler concept (apply M2: generic -> varieties -> example).

**Varieties**:
1. Pattern matching - Match effect fields against rules (RuleEngine)
2. Type dispatch - Switch on effect_type
3. AST traversal - Walk syntax tree to extract effects (Parser)
4. Direct transformation - Transform input to output (Enricher)

---

## Insight: Prompt Evolution Matters

**Insight**: The progression from v1 -> v2 -> v3 prompts captures learning about what works.

**Why this matters**: Future documentation generation should use the refined prompts.

**Source**: @examples/effects/prompts.md

**Key learnings**:
- v1: Basic prompt, resulted in errors
- v2: Added "use relative filepath from effects", state transitions
- v3: Added "verify against documentation", explicit effectHandler definition

---

## Adding New Insights

When you discover a new insight through conversation, add it here with:

1. **Insight**: One-sentence description
2. **Why this matters**: When/how to apply it
3. **Not in code because**: Why DevAC/code doesn't surface this
4. **Applies when**: Specific situations
5. **Example**: Concrete illustration
