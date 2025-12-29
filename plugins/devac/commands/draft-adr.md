# /devac:draft-adr - Create an Architecture Decision Record

You are helping the user create an ADR (Architecture Decision Record) to document an important technical decision.

## What is an ADR?

ADRs document significant architectural decisions with their context and consequences. They serve as:
- Historical record of why decisions were made
- Onboarding material for new team members
- Reference when revisiting decisions later

## When to Create an ADR

Create an ADR when:
- Choosing between different technical approaches
- Adding significant new dependencies
- Changing data models or APIs
- Modifying system architecture
- Making decisions that are hard to reverse
- The decision affects multiple components

## Steps

### 1. Understand the decision

Ask the user:
- What decision needs to be documented?
- What problem are you solving?
- What alternatives were considered?

### 2. Determine the next ADR number

```bash
ls docs/adr/*.md | grep -E "^docs/adr/[0-9]+" | sort -V | tail -1
```

Increment the number for the new ADR.

### 3. Draft the ADR

Use the template from `docs/adr/template.md`:

```markdown
# ADR-NNNN: Title

## Status

Proposed | Accepted | Deprecated | Superseded by ADR-XXXX

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

### Positive
- Benefit 1
- Benefit 2

### Negative
- Tradeoff 1
- Tradeoff 2

### Neutral
- Side effect 1
```

### 4. Create the file

```bash
cat > docs/adr/NNNN-title-in-kebab-case.md << 'EOF'
[ADR content]
EOF
```

### 5. Update the ADR index

Add the new ADR to `docs/adr/README.md`:

```markdown
| NNNN | Title | Accepted | 2025-MM-DD |
```

### 6. Stage the files

```bash
git add docs/adr/
```

## Example Output

```
## ADR Created

**File:** docs/adr/0012-use-chokidar-for-file-watching.md

**Status:** Proposed

**Summary:**
Decided to use chokidar for file watching instead of native fs.watch because:
- Cross-platform consistency
- Better handling of editor save patterns
- Proven reliability in production (used by webpack, vite, etc.)

---

The ADR has been created. Review it and change status to "Accepted" when ready.
```

## ADR Best Practices

1. **Be specific** - Include concrete details, not vague statements
2. **Document alternatives** - Show what else was considered and why it was rejected
3. **Think about consequences** - Both positive and negative
4. **Keep it concise** - ADRs should be readable in a few minutes
5. **Link related ADRs** - Reference superseded or related decisions
