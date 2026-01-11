# C4 Architecture Generation Prompts

This document captures the evolution of prompts used for generating C4 architecture documentation with the validate-architecture skill.

## Purpose

Track prompt improvements over time to:
1. Understand what works well
2. Avoid repeating mistakes
3. Provide templates for future generation

---

## Prompt v1: Basic Generation

**Context**: Initial attempt at generating architecture docs.

```
Create C4 architecture documentation for packages/devac-core.
Include context and container diagrams.
```

**Issues**:
- Too vague, no structure guidance
- Didn't specify dual format (.md + .c4)
- Relationships were only in ASCII art
- No quality checks applied

**G1-G4 Impact**:
- G1 Container F1: ~25% (too granular, one per directory)
- G2 Signal/Noise: ~15% (all functions shown)
- G3 Relationship F1: ~20% (relationships lost in ASCII)
- G4 External F1: ~30% (externals not categorized)

---

## Prompt v2: Structured Output

**Context**: Added explicit structure requirements.

```
Generate architecture documentation for packages/devac-core.

Output files:
1. docs/c4/architecture-validated.md - ASCII diagrams with explanations
2. docs/c4/validated/model.c4 - LikeC4 DSL

Include:
- C4 Context diagram
- C4 Container diagram grouped by layers
- Key components per container
- External system integrations
```

**Issues**:
- Still missing relationship parity requirement
- No confidence markers
- No reasoning file

**G1-G4 Impact**:
- G1 Container F1: ~40% (layers mentioned but not enforced)
- G2 Signal/Noise: ~30% (some filtering)
- G3 Relationship F1: ~25% (still ASCII-only)
- G4 External F1: ~45% (types mentioned but not required)

---

## Prompt v3: Relationship Parity

**Context**: Explicitly required relationship tracking.

```
Generate architecture documentation for packages/devac-core.

CRITICAL: For each relationship in diagrams:
1. Add to a relationships table (| From | To | Label |)
2. Add to a LikeC4 code block (source -> target "label")
3. Consolidate in "All Relationships Summary" section

Output files:
- docs/c4/architecture-validated.md
- docs/c4/validated/model.c4 (relationships copied from markdown)
- docs/c4/architecture.reasoning.md (queries used, assumptions made)

Group containers by layer:
- Analysis Layer: parsers, analyzers, semantic
- Storage Layer: duckdb, parquet, seeds
- Federation Layer: hub, registry
- API Layer: mcp, cli
- Rules Layer: rule engine
- Views Layer: c4, diagrams
```

**Issues**:
- Missing M1-M4 quality rule application
- No validation step (LikeC4 syntax)
- Reserved keywords not warned

**G1-G4 Impact**:
- G1 Container F1: ~60% (layers enforced)
- G2 Signal/Noise: ~45% (implicit filtering by layer)
- G3 Relationship F1: ~55% (parity improved)
- G4 External F1: ~55% (types mentioned)

---

## Prompt v4: Full Quality Rules (Current)

**Context**: Added M1-M4 and G1-G4 awareness.

```
Generate architecture documentation for packages/devac-core.

BEFORE STARTING:
1. Read @plugins/devac/skills/effects-architecture/knowledge/quality-rules.md
2. Apply M1-M4 to all documentation generation

RELATIONSHIP PARITY (CRITICAL):
For each relationship:
1. Add to relationships table
2. Add to LikeC4 code block
3. Consolidate in "All Relationships Summary"

CONTAINER GROUPING (G1):
Use the 6 built-in layers from grouping-rules.ts

SIGNIFICANCE FILTERING (G2):
Show only critical/important components. Mark minor with "detailed view only".

OUTPUT FILES:
- docs/c4/architecture-validated.md (with confidence markers)
- docs/c4/validated/model.c4
- docs/c4/validated/spec.c4 (copy from generated/)
- docs/c4/validated/likec4.config.json
- docs/c4/architecture.reasoning.md

VALIDATION:
Run `npx likec4 validate .` before marking complete.
Avoid reserved keywords: views, model, specification
```

**Results**:
- G1 Container F1: ~75% (layers match rules)
- G2 Signal/Noise: ~55% (significance filtering)
- G3 Relationship F1: ~65% (parity by construction)
- G4 External F1: ~70% (typed externals)
- **Composite: ~68%** (target: >65%)

---

## Lessons Learned

1. **Explicit is better than implicit**: Each requirement needs explicit instruction
2. **Parity by construction**: Track relationships simultaneously in all formats
3. **Quality rules matter**: M1-M4 prevent common documentation mistakes
4. **Validation is essential**: LikeC4 syntax errors break the improvement loop
5. **Layers beat directories**: Conceptual grouping produces better architecture

## Template for Future Prompts

```markdown
Generate architecture documentation for [PACKAGE].

## Pre-requisites
- [ ] Read M1-M4 from effects-architecture/knowledge/quality-rules.md
- [ ] Query package structure with DevAC MCP tools

## Requirements
1. Apply M1: List ALL containers, relationships, externals (or mark partial)
2. Apply M2: Define concepts before showing examples
3. Relationship parity: table + code block for each relationship
4. Container grouping: Use 6 built-in layers
5. Significance filtering: critical/important only in main diagrams

## Output
- architecture-validated.md (with confidence markers)
- validated/model.c4 (relationships from markdown)
- validated/spec.c4 (copy from generated/)
- architecture.reasoning.md (audit trail)

## Validation
- [ ] Run `npx likec4 validate .`
- [ ] Verify relationship counts match across formats
- [ ] Check no reserved keywords used as element names
```
