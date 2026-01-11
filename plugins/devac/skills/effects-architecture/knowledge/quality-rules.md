# Documentation Quality Rules

Meta-rules for generating reliable, verified documentation. Apply these before finalizing any output.

## Rule M1: Complete Sets

> When listing items from a finite known set, list ALL items or explicitly mark as partial.

**Before any enumeration:**
1. Query the source to get the complete set
2. Count the members
3. Write the count FIRST in the document
4. List all members
5. Verify count matches

**Self-prompt:**
> "I'm about to list [items]. Let me check [source] for the complete set: [list] = [N] items. I will list all [N]."

**Bad (partial without marking):**
```
|   | effects.pq   |    | nodes.pq     |    | hub.duckdb   |
```

**Good (complete):**
```
|   | nodes.pq     |    | edges.pq     |    | effects.pq   |    | external_refs.pq |
```

**Also good (explicit partial):**
```
|   | seed files (4)|
```

---

## Rule M2: Generic Before Specific

> Define concepts abstractly before showing concrete implementations. Never present one implementation as THE definition.

**Template:**
```markdown
## [Concept Name]

### What It Is (Generic)
[Definition that doesn't mention any specific implementation]

### How It Can Be Implemented (Varieties)
1. [Implementation A] - [one-line description]
2. [Implementation B] - [one-line description]

### Example: [Specific Implementation]
[Detailed explanation of ONE implementation]
```

**Self-check:**
> "If I replaced my example with a different implementation, would my generic definition still be valid?"

---

## Rule M3: State Recognition

> Any data structure that handlers read/write is State, including intermediate representations like AST.

**Checklist for identifying State:**
- [ ] Is this data structure read by a handler?
- [ ] Is this data structure written by a handler?
- [ ] Does it persist between handler invocations?
- [ ] Is it an intermediate representation (AST, IR, intermediate file)?

If YES to any -> It's State.

---

## Rule M4: Handler Recognition

> Any function that transforms (State, Input) -> (State', Output) is an effectHandler, even if not labeled as such.

**Template for identifying handlers:**
```
Handler: [Name]
  Input State:  [what it reads]
  Input Effect: [what triggers it]
  Output State: [what it writes]
  Output Effects: [what it produces for other handlers]
```

Apply to any function/process to see if it's a handler.

---

## Applying Rules in Practice

Before finalizing documentation:

1. **Check M1**: For every list, did I query the source? Does count match?
2. **Check M2**: For every concept, did I define generically first? Show varieties?
3. **Check M3**: Did I identify all State (including AST, intermediate files)?
4. **Check M4**: Did I identify all handlers (even ones not labeled as such)?

---

## Common Mistakes to Avoid

| Mistake | Pattern | Rule Violated |
|---------|---------|---------------|
| Missing edges.parquet | Partial enumeration | M1 |
| "Pattern matching IS effect routing" | Specific as generic | M2 |
| Not recognizing AST as State | Missing intermediate state | M3 |
| Not recognizing Parser as handler | Unlabeled handler | M4 |

These are instances of:
1. **Lossy compression** - Reducing information without marking (M1)
2. **Over-generalization** - Treating one instance as universal (M2)
