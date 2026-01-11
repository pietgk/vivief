# DevAC Skills

This directory contains Claude Code skills for architecture documentation.

## Skills Overview

| Skill | Purpose | Key Rules |
|-------|---------|-----------|
| [effects-architecture](effects-architecture/SKILL.md) | Document how effects work | M1-M4 (meta-rules) |
| [validate-architecture](validate-architecture/SKILL.md) | Create/validate C4 architecture | G1-G4 (gap metrics) |

## Rule Systems

DevAC skills use two complementary rule systems:

### M1-M4: Documentation Quality Meta-Rules

**Owned by**: effects-architecture

These are **generic rules** that apply to ANY documentation generation:

| Rule | Name | Description |
|------|------|-------------|
| **M1** | Complete Sets | List ALL items or explicitly mark as partial |
| **M2** | Generic Before Specific | Define concepts abstractly before showing examples |
| **M3** | State Recognition | Identify all state including intermediate representations |
| **M4** | Handler Recognition | Identify all transformers even if not labeled as such |

**Location**: `effects-architecture/knowledge/quality-rules.md`

**Usage**: Apply these before finalizing any generated documentation.

### G1-G4: C4 Gap Metrics

**Owned by**: validate-architecture

These are **quantitative metrics** specific to C4 architecture quality:

| Metric | Name | Weight | Target |
|--------|------|--------|--------|
| **G1** | Container F1 | 25% | >70% |
| **G2** | Signal-to-Noise | 45% | >50% |
| **G3** | Relationship F1 | 15% | >60% |
| **G4** | External F1 | 15% | >70% |

**Location**: `validate-architecture/knowledge/c4-quality-rules.md`

**Usage**: Measure architecture documentation quality and guide improvement.

## Relationship Diagram

```
┌────────────────────────────────────────────────────────────────┐
│              FOUNDATIONAL META-RULES (M1-M4)                   │
│  Owned by: effects-architecture                                │
│  Applies to: ANY documentation generation                      │
└───────────────────────┬────────────────────────────────────────┘
                        │ referenced by
          ┌─────────────┴─────────────┐
          ▼                           ▼
┌─────────────────────┐     ┌─────────────────────────┐
│ effects-architecture│     │ validate-architecture   │
│                     │     │                         │
│ Purpose: Document   │     │ Purpose: Create/validate│
│ how effects work    │     │ C4 architecture docs    │
│                     │     │                         │
│ Owns: M1-M4 rules   │     │ Uses: M1-M4 rules +     │
│                     │     │ G1-G4 gap metrics (C4)  │
└─────────────────────┘     └─────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│              C4 GAP METRICS (G1-G4)                            │
│  Owned by: validate-architecture                               │
│  Applies to: C4 architecture quality measurement               │
└────────────────────────────────────────────────────────────────┘
```

## Examples

Each skill has associated examples at the repository root:

| Skill | Examples Location |
|-------|-------------------|
| effects-architecture | `examples/effects/` |
| validate-architecture | `examples/architecture/` |

## Workflow

### Generating Effects Documentation

1. Read `effects-architecture/knowledge/tacit-insights.md`
2. Query DevAC for effects data
3. Apply M1-M4 before finalizing
4. See `examples/effects/how-are-effects-handled-v4.md` as reference

### Generating Architecture Documentation

1. Read `effects-architecture/knowledge/quality-rules.md` (M1-M4)
2. Read `validate-architecture/knowledge/tacit-insights.md`
3. Query DevAC for package structure
4. Generate with grouping and significance rules
5. Apply relationship parity by construction
6. Measure with `devac architecture score`
7. Iterate until G1-G4 meet targets

## Adding New Skills

When creating a new skill:

1. Create `skills/<skill-name>/SKILL.md`
2. Add `knowledge/` folder for skill-specific rules
3. Reference M1-M4 if the skill generates documentation
4. Add examples to `examples/<skill-name>/`
5. Update this README

## See Also

- [ADR-0031: Architecture Quality Improvement Loop](../../../docs/adr/0031-architecture-quality-improvement-loop.md)
- [Grouping Rules](../../../packages/devac-core/src/rules/grouping-rules.ts)
- [Significance Rules](../../../packages/devac-core/src/rules/significance-rules.ts)
