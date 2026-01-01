# ADR-0023: Developer-Maintained Effects Documentation

## Status

Accepted

## Context

DevAC extracts "effects" from code - function calls, store operations, external service calls, etc. These effects are used to generate C4 architecture diagrams and understand system behavior.

The original approach used hardcoded pattern matching in the parser to classify effects (e.g., recognizing `stripe.charges.create` as a payment effect). This approach has limitations:

1. **Maintenance burden**: Core team must update patterns for every new library/pattern
2. **False positives**: Generic patterns match too broadly
3. **No project context**: Cannot understand project-specific conventions
4. **Documentation gap**: No connection between extracted effects and human understanding

## Decision

Shift from hardcoded pattern extraction to **developer-maintained effect documentation**.

### Core Principle

Developers have incentive to maintain effect documentation if it provides:
- Verifiable, correct architecture documentation
- Shared "effects language" across the team
- C4 diagrams that reflect reality

### File Structure

Each package maintains its own effect documentation:

```
package/
├── docs/
│   └── package-effects.md    ← Human + LLM readable mappings
├── .devac/
│   └── effect-mappings.ts    ← Generated extraction rules
└── src/
    └── *.ts
```

### Workflow

1. **Init**: `devac effects init` analyzes AST to discover patterns, generates draft `docs/package-effects.md`
2. **Review**: Developer refines the documented mappings
3. **Verify**: `devac effects verify` compares extracted effects vs documented patterns, reports gaps
4. **Sync**: `devac effects sync` generates `.devac/effect-mappings.ts` from the markdown

### package-effects.md Format

Human-readable markdown with tables:

```markdown
## Store Operations
| Pattern | Store Type | Operation | Provider | Target |
|---------|------------|-----------|----------|--------|
| `userRepo.create` | database | insert | mysql | users |

## External Calls
| Pattern | Send Type | Service | Third Party |
|---------|-----------|---------|-------------|
| `stripeClient.*` | external | stripe | true |
```

## Consequences

### Positive

- **Developer ownership**: Teams maintain their own effect mappings
- **Iterative refinement**: Start rough, improve over time
- **Verifiable documentation**: Effects always match code
- **Shared vocabulary**: Consistent effect naming across packages
- **LLM-friendly**: Markdown readable by AI assistants
- **Federated**: Each package independent, hub aggregates

### Negative

- **Initial effort**: Developers must review and refine generated mappings
- **Drift risk**: Documentation can become stale if verify isn't run regularly
- **Learning curve**: New concept for developers to understand

### Mitigations

- `devac effects verify` in CI catches drift
- Generated initial documentation reduces bootstrapping effort
- Clear error messages guide developers to fix gaps

## Implementation Notes

### Markdown Table Parsing

The `package-effects.md` file uses markdown tables with patterns in backticks:

```markdown
| `userRepo.create` | database | insert | mysql | users |
```

The parser extracts patterns using the regex `/\|\s*`([^`]+)`\s*\|/` to find the first backtick-wrapped text in each table row.

**Header Row Detection**: Header rows (e.g., `| Pattern | Count | Description |`) are skipped using `/^\|\s*Pattern\s*\|/`. This regex specifically matches rows where "Pattern" appears at the start of the first cell, avoiding false matches with patterns that contain "Pattern" in their name (e.g., `issuePattern.test`).

### Foundational Principle

From the conceptual foundation: **"Everything can be represented as effectHandlers"**

```
runCode() === handleEffects(extractEffects(code))
```

This means:
- ALL code patterns ARE effects - nothing should be excluded during documentation
- Use Group Types (io:*, compute:*, framework:*, logging:*, workflow:*) to classify patterns
- Filtering happens at consumption time (when generating docs/diagrams), not during documentation
- Goal: 0 unmapped patterns in verify output
