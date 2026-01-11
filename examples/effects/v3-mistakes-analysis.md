# Documentation Quality Analysis: v3 Mistakes and Prevention Strategies

> Created: 2026-01-10
> Context: Analysis of systematic errors in how-are-effects-handled-v3.md

---

## Objective

Analyze systematic errors in v3 documentation and create prevention strategies for:
1. **Set Member Omissions**: Missing `edges.parquet` when listing parquet files
2. **Over-Specification**: Describing one implementation (pattern matching) as THE way effectHandlers work

---

## Error Analysis

### Error 1: Missing edges.parquet

**What happened:**
- In v3 Section 8.2 (Container Diagram), listed only `effects.pq` and `nodes.pq`
- The plan correctly listed all three: "nodes.parquet, edges.parquet, effects.parquet"
- But during document generation, `edges.parquet` was dropped

**Evidence from v3:**
```
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   │ effects.pq   │    │ nodes.pq     │    │ hub.duckdb   │
```
Missing: `edges.pq`

**Root cause**: When rendering a diagram with limited space, I selected 2 of 3 items without noting the omission. This is a **partial enumeration without acknowledgment**.

---

### Error 2: Over-Specification of EffectHandler

**What happened:**
- Described RuleEngine's pattern-matching as THE implementation of effectHandlers
- Failed to recognize that:
  - The **AST Parser** is also an effectHandler: `(AST, ∅) → (∅, CodeEffect[])`
  - The **AST itself** is a form of State
  - Pattern matching is just ONE dispatch strategy

**Evidence from v3:**
```
## 6. Effect Routing and Dispatch

Effects are routed to handlers through pattern matching. The Rules Engine demonstrates this clearly.
```

This implies pattern matching = effect routing, which is too narrow.

**Root cause**: Confused a **specific implementation** with the **generic concept**. The document explains what RuleEngine does, not what effectHandlers ARE in general.

---

## Prevention Strategies

### Strategy 1: Set Completeness Check

**Rule**: When listing members of a known set, ALWAYS:
1. State the complete set first
2. If showing partial list, explicitly say "e.g." or "including (not exhaustive)"
3. Verify count matches: "4 parquet files" then list 4

**Example application:**
```
# BAD (what I did)
│   │ effects.pq   │    │ nodes.pq     │    │ hub.duckdb   │

# GOOD (complete)
│   │ nodes.pq     │    │ edges.pq     │    │ effects.pq   │    │ external_refs.pq │    │ hub.duckdb   │

# ALSO GOOD (explicit partial)
│   │ seed files   │    │ hub.duckdb   │
│   │ (4 parquet)  │    │              │
```

**Checklist before finalizing any enumeration:**
- [ ] Is this a known finite set?
- [ ] Have I listed ALL members?
- [ ] If partial, is it marked as partial?
- [ ] Does the count match the source?

---

### Strategy 2: Generic-First Explanation Pattern

**Rule**: When explaining a concept, ALWAYS structure as:
1. **Generic definition** - What the concept IS (abstract)
2. **Implementation varieties** - How it CAN be implemented (multiple)
3. **Specific example** - One concrete implementation (detailed)

**Example application for EffectHandler:**

```markdown
## EffectHandler (Generic Definition)

An effectHandler is ANY function that:
- Takes (State, Effect) as input
- Returns (State', [Effects']) as output

The handler pattern is universal - it doesn't prescribe HOW the handler decides what to do.

## Implementation Varieties

EffectHandlers can be implemented via:
1. **Pattern matching** - Match effect fields against rules (RuleEngine)
2. **Type dispatch** - Switch on effect_type (traditional handler)
3. **AST traversal** - Walk syntax tree to extract effects (Parser)
4. **Direct transformation** - Transform input to output directly (Enricher)

## Specific Example: RuleEngine

The RuleEngine implements effectHandler via pattern matching:
- State: Rules[]
- Effect: CodeEffect
- Algorithm: First-match-wins
- Output: DomainEffect[]
```

**Checklist before explaining any concept:**
- [ ] Have I defined the concept generically first?
- [ ] Have I shown multiple valid implementations exist?
- [ ] Is my specific example clearly marked as ONE example?
- [ ] Could the concept be implemented differently? If yes, have I said so?

---

### Strategy 3: AST-as-State Recognition

**Insight**: The AST produced by parsing IS a state representation, and the parser IS an effectHandler:

```
Parser as EffectHandler:
  Input:  (∅, SourceCode)
  Output: (AST, [])

Where AST is State that subsequent handlers can use.

Analyzer as EffectHandler:
  Input:  (AST, ∅)
  Output: (∅, CodeEffect[])
```

**Rule**: When identifying handlers in a pipeline, check if intermediate representations (AST, IR, etc.) are forms of State.

---

## Verification: Does v3 Section 3.1 Have All Parquet Files?

Looking at v3 lines 86-95:
```
{package}/.devac/seed/base/     ← Base branch analysis
  ├── nodes.parquet             ← Code entities (functions, classes, etc.)
  ├── edges.parquet             ← Relationships (CALLS, IMPORTS, etc.)
  ├── effects.parquet           ← Extracted code effects
  └── external_refs.parquet     ← External package references
```

✅ This section correctly lists all 4 parquet files.

The omission was in Section 8.2 (Container Diagram) where I dropped edges when showing stores.

---

## Action Items for v4 or Documentation Updates

1. **Fix v3 Container Diagram**: Add `edges.pq` to the stores section
2. **Add "Implementation Varieties" section**: Show multiple handler implementations
3. **Recognize Parser as EffectHandler**: Include it in the handler implementations section
4. **Add AST as State**: Mention AST as intermediate state in state transitions

---

## Meta-Rules for Future Documentation

### Rule M1: Complete Sets
> When listing items from a finite known set, list ALL items or explicitly mark as partial.

### Rule M2: Generic Before Specific
> Define concepts abstractly before showing concrete implementations. Never present one implementation as THE definition.

### Rule M3: State Recognition
> Any data structure that handlers read/write is State, including intermediate representations like AST.

### Rule M4: Handler Recognition
> Any function that transforms (State, Input) → (State', Output) is an effectHandler, even if not labeled as such.

---

## Confidence Assessment

| Insight | Source | Confidence |
|---------|--------|------------|
| edges.parquet exists | config.ts:119-134, MCP schema | HIGH |
| Parser produces AST (State) | Standard compilation theory | HIGH |
| Pattern matching is one dispatch method | User feedback, general knowledge | HIGH |
| v3 Section 3.1 is complete | Direct inspection | HIGH |
| v3 Section 8.2 is incomplete | Direct inspection | HIGH |

---

## Operationalizing the Meta-Rules

### For Set Completeness (M1)

**Before writing any enumeration:**
1. Query the source to get the complete set
2. Count the members
3. Write the count FIRST in the document
4. List all members
5. Verify count matches

**Example prompt to self:**
> "I'm about to list parquet files. Let me check config.ts for the complete set: nodes, edges, effects, external_refs = 4 files. I will list all 4."

### For Generic-First (M2)

**Template for concept explanation:**
```markdown
## [Concept Name]

### What It Is (Generic)
[Definition that doesn't mention any specific implementation]

### How It Can Be Implemented (Varieties)
1. [Implementation A] - [one-line description]
2. [Implementation B] - [one-line description]
3. [Implementation C] - [one-line description]

### Example: [Specific Implementation]
[Detailed explanation of ONE implementation]
```

**Self-check question:**
> "If I replaced my example with a different implementation, would my generic definition still be valid?"

### For State Recognition (M3)

**Checklist for identifying State:**
- [ ] Is this data structure read by a handler?
- [ ] Is this data structure written by a handler?
- [ ] Does it persist between handler invocations?
- [ ] Is it an intermediate representation (AST, IR, intermediate file)?

If YES to any → It's State.

### For Handler Recognition (M4)

**Template for identifying handlers:**
```
Handler: [Name]
  Input State:  [what it reads]
  Input Effect: [what triggers it]
  Output State: [what it writes]
  Output Effects: [what it produces for other handlers]
```

**Apply to any function/process to see if it's a handler.**

---

## Summary: Two Core Mistakes and Their Fixes

| Mistake | Pattern | Fix |
|---------|---------|-----|
| Missing edges.parquet | Partial enumeration | **M1**: Always verify set completeness against source |
| Pattern matching = effectHandler | Specific as generic | **M2**: Always define concept abstractly before examples |

These are instances of:
1. **Lossy compression** - Reducing information without marking the reduction
2. **Over-generalization** - Treating one instance as the universal case
