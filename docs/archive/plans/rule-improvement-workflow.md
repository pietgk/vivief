# Rule Improvement Workflow

> **Purpose:** Define the process for iteratively improving effect-domain-rules based on architecture.md vs architecture.c4 gaps.
> **Created:** 2026-01-07
> **Related:** gap-metrics.md, improve-pipeline.md

## Overview

When a gap is identified between the human-validated `architecture.md` and the generated `architecture.c4`, this workflow guides how to improve the rules to close that gap.

## Rule Categories

Based on the gap metrics, we need rules in these categories:

### 1. Container Grouping Rules (NEW)

**Purpose:** Group related components into logical containers/layers.

```typescript
// Example: Recognize "Analysis Layer" pattern
defineContainerRule({
  id: "layer-analysis",
  name: "Analysis Layer",
  description: "Groups parsers, semantic resolvers, and analyzers",
  match: {
    // Match modules in these directories
    filePath: /\/(parsers|semantic|analyzer)\//,
    // OR match by module naming patterns
    moduleName: /(Parser|Resolver|Analyzer|Orchestrator)$/,
  },
  emit: {
    container: "Analysis Layer",
    layer: "core",
    description: "Structural parsing and semantic resolution",
  },
});
```

**Gaps this addresses:**
- Container F1 score (currently ~0.3)
- Abstraction level appropriateness

### 2. Significance Rules (NEW)

**Purpose:** Filter out implementation details, surface architecturally-significant components.

```typescript
// Example: Mark as architecturally significant
defineSignificanceRule({
  id: "sig-public-api",
  name: "Public API Functions",
  description: "Functions exported from index.ts are significant",
  match: {
    // Exported from package index
    exportedFrom: /\/index\.ts$/,
    // Or has many dependents
    dependentCount: { min: 5 },
  },
  emit: {
    significance: "high",
    showInC4: true,
  },
});

// Example: Mark as implementation detail
defineSignificanceRule({
  id: "sig-helper-functions",
  name: "Helper Functions",
  description: "Internal helper functions are less significant",
  match: {
    // Private/internal naming convention
    name: /^_|^internal|^helper/i,
    // Or few dependents
    dependentCount: { max: 1 },
  },
  emit: {
    significance: "low",
    showInC4: false,
  },
});
```

**Gaps this addresses:**
- Signal-to-noise ratio (currently ~0.2)
- Key component coverage

### 3. External Categorization Rules (ENHANCE)

**Purpose:** Group external dependencies by purpose.

```typescript
// Already have domain rules, but need categorization
defineExternalRule({
  id: "ext-storage",
  name: "Storage Systems",
  match: {
    module: /(duckdb|parquet|sqlite|postgres|mysql)/i,
  },
  emit: {
    category: "Storage",
    subcategory: "Database",
  },
});

defineExternalRule({
  id: "ext-filesystem",
  name: "File System",
  match: {
    module: /^(fs|path|glob)$/,
  },
  emit: {
    category: "Storage",
    subcategory: "FileSystem",
  },
});
```

**Gaps this addresses:**
- External F1 score (currently ~0.3)

### 4. Relationship Rules (ENHANCE)

**Purpose:** Infer higher-level relationships from code patterns.

```typescript
// Example: Data flow relationship
defineRelationshipRule({
  id: "rel-data-flow",
  name: "Data Flow",
  description: "Detect data flowing between containers",
  match: {
    // Container A calls function in Container B
    caller: { container: "Analysis Layer" },
    callee: { container: "Storage Layer" },
  },
  emit: {
    relationship: "writes to",
    style: "dashed",
  },
});
```

**Gaps this addresses:**
- Relationship F1 score (currently ~0.2)

## Improvement Workflow

### Phase 1: Gap Identification

```
1. Run `devac c4 --package <path>` to generate architecture.c4
2. Compare against architecture.md (manual or automated)
3. Identify specific gaps using gap-metrics.md criteria
4. Document gaps in an issue or tracking file
```

**Example gap identification:**
```markdown
## Gap: Missing "Storage Layer" container

**In architecture.md:** Storage Layer contains DuckDBPool, SeedWriter, SeedReader
**In architecture.c4:** These are in separate "Storage", "Seed" containers
**Metric affected:** Container F1 (precision)
**Root cause:** No rule to recognize layered architecture
```

### Phase 2: Rule Design

```
1. Determine rule category (grouping, significance, external, relationship)
2. Identify match criteria (file paths, naming patterns, effect types)
3. Define emit behavior (container, significance, category)
4. Consider priority vs existing rules
```

**Rule design template:**
```markdown
## Proposed Rule: [NAME]

**Category:** Container Grouping
**Gap addressed:** Missing "Storage Layer" grouping
**Match criteria:**
- filePath: /\/(storage|duckdb|seed)\//
- OR moduleExports: /(Pool|Writer|Reader)$/

**Emit:**
- container: "Storage Layer"
- layer: "infrastructure"

**Priority:** 10 (default)
**Tests needed:** storage-layer-grouping.test.ts
```

### Phase 3: Implementation

```
1. Add rule to appropriate file:
   - packages/devac-core/src/rules/builtin-rules.ts (core rules)
   - packages/devac-core/src/rules/grouping-rules.ts (NEW - container rules)
   - .devac/rules/local-rules.ts (repo-specific)
   - <package>/.devac/rules.ts (package-specific)

2. Add test case:
   - Create fixture with expected input/output
   - Test that rule matches correctly
   - Test that gap metric improves

3. Regenerate and measure:
   - Run `devac c4 --package <path>`
   - Run `devac score-architecture` (when implemented)
   - Verify gap metric improved
```

### Phase 4: Validation

```
1. Human review of generated architecture.c4
2. Compare against architecture.md
3. Verify no regressions in other metrics
4. Update baseline scores
```

## Rule Precedence

Rules are applied in this order:

1. **Package-specific rules** (`<package>/.devac/rules.ts`)
   - Highest priority, most specific
   - Override repo and builtin rules

2. **Repo-specific rules** (`.devac/rules/local-rules.ts`)
   - Apply to all packages in repo
   - Override builtin rules

3. **Builtin rules** (`devac-core/src/rules/builtin-rules.ts`)
   - Default patterns
   - Lowest priority

## LLM-Assisted Rule Generation

When gaps are identified, an LLM can propose rules:

**Prompt template:**
```markdown
Given this gap between architecture.md and architecture.c4:

**Gap:** [DESCRIPTION]
**Current output:** [SNIPPET FROM .c4]
**Expected output:** [SNIPPET FROM .md]

Propose a rule that would close this gap. Use the defineRule format:

\`\`\`typescript
defineRule({
  id: "...",
  name: "...",
  match: { ... },
  emit: { ... },
});
\`\`\`

Explain why this rule would work and any edge cases to consider.
```

**Human review required:** All LLM-proposed rules must be reviewed before merging.

## Tracking Progress

### Per-Rule Tracking

Each rule should track:
- Which gap it addresses
- Which metric it improves
- Test coverage

### Overall Progress

Track composite score over time:
```
Date       | Container | Signal | Coverage | Rel | Ext | Composite
-----------|-----------|--------|----------|-----|-----|----------
2026-01-07 | 0.30      | 0.20   | 0.40     | 0.2 | 0.3 | 0.28
2026-01-14 | 0.45      | 0.35   | 0.55     | 0.3 | 0.4 | 0.41
...
Target     | 0.70      | 0.50   | 0.80     | 0.6 | 0.7 | 0.65
```

## Next Steps

1. **Create grouping-rules.ts** - New file for container/layer grouping rules
2. **Implement first container rule** - "Analysis Layer" grouping
3. **Add score-architecture command** - Automated metric calculation
4. **Create reference test package** - Known-good architecture for validation

---

*This workflow is iterative. Each rule improvement should measurably close the gap.*
