# Tacit Insights

Knowledge discovered through conversation that is NOT directly detectable from code, DevAC analytics, or LikeC4 tooling.

## How to Use This File

1. Before generating architecture documentation, read these insights
2. Apply them when they're relevant
3. When new insights are discovered, add them here

---

## Insight: ASCII Art is Documentation, Code Blocks are Data

**Insight**: ASCII diagrams serve human readability; LikeC4 code blocks serve machine validation. Both are needed but for different audiences.

**Why this matters**: Generating only ASCII or only `.c4` loses half the value. ASCII is quick to review in a terminal; `.c4` enables automated gap comparison.

**Not in code because**: This is a documentation philosophy, not a tool feature.

**Applies when**: Generating any architecture documentation - always produce both formats.

---

## Insight: Relationships are Often Implicit

**Insight**: Data flow relationships are rarely explicit in code. They must be inferred from effect patterns (Store → Retrieve chains).

**Why this matters**: Generated C4 will miss relationships without effect-based inference. A component that writes to Parquet and another that reads from it have an implicit relationship.

**Not in code because**: Relationships require semantic analysis, not just AST parsing.

**Applies when**: Building Container-level diagrams. Look for effect chains.

---

## Insight: Grouping Creates Containers

**Insight**: A "container" in C4 terms often maps to a conceptual layer (Analysis, Storage, Federation) not a directory.

**Why this matters**: Directory-based containers produce too granular diagrams (one container per folder). Layer-based containers show architectural intent.

**Not in code because**: Layer assignments require human judgment about architectural intent.

**Applies when**: Mapping files/modules to C4 containers. Use the 6 built-in layers as a starting point.

---

## Insight: External Systems Need Type Classification

**Insight**: External systems (databases, APIs, storage) need explicit type tags (database, api, storage, messaging) for proper C4 representation.

**Why this matters**: Without types, externals appear as generic gray boxes. With types, they show what kind of integration they represent.

**Not in code because**: Type classification requires understanding the external system's role, not just its name.

**Applies when**: Identifying external system nodes. Always add a type tag.

---

## Insight: Gap Score Interpretation

**Insight**: A gap score below 50% doesn't mean "bad generated docs" - it means the rules engine needs tuning for this codebase's patterns.

**Why this matters**: Users should iterate on rules, not abandon the tool. Low scores are a starting point for improvement.

**Not in code because**: This is guidance about the improvement loop, not a tool behavior.

**Applies when**: Interpreting `devac architecture score` output. Don't panic at low scores.

---

## Insight: Relationship Parity by Construction

**Insight**: The only reliable way to keep relationships in sync across ASCII, tables, and code blocks is to add them to all three simultaneously as you reason about them.

**Why this matters**: Trying to reconcile relationships after the fact leads to drift. ASCII shows 10 relationships, code block has 8 - which is correct?

**Not in code because**: This is a documentation workflow pattern, not enforceable by tools.

**Applies when**: Drawing diagrams. For each arrow you draw, immediately add a table row AND a code line.

---

## Insight: Reserved Keywords Break LikeC4

**Insight**: LikeC4 reserves `views`, `model`, and `specification` as keywords. Using them as element names causes cryptic parse errors.

**Why this matters**: Naming a container "Views" seems natural but breaks validation. Use "Views Layer" or "diagram_views" instead.

**Not in code because**: This is LikeC4 tooling behavior, not DevAC logic.

**Applies when**: Naming elements in model.c4. Always validate with `npx likec4 validate .` before committing.

---

## Insight: The Reasoning File is Your Memory

**Insight**: The `architecture.reasoning.md` file is not optional documentation - it's the audit trail that enables the improvement loop.

**Why this matters**: When you revisit architecture months later, you need to know WHY certain groupings were chosen, what assumptions were made, and what data was missing.

**Not in code because**: This is about documentation practice, not tool features.

**Applies when**: Every time you generate or update architecture docs. Always update the reasoning file.
