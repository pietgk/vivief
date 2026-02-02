# Plan 2: Advanced Accessibility Features

> **Issue:** [#235](https://github.com/pietgk/vivief/issues/235)
> **Worktree:** `/Users/grop/ws/vivief-235-accessibility-retrieval-strategy`
> **Status:** DEFERRED (Requires Plan 1 completion)
> **Type:** Advanced / Higher Risk
> **Created:** 2026-01-31
> **Updated:** 2026-01-31 (Aligned: ESLint → Diagnostics, Patterns in node.properties)
> **Prerequisite:** Plan 1 (Core Accessibility Intelligence) must be complete

## Summary

This plan contains **advanced features** that build on Plan 1's foundation. All features maintain consistency with DevAC's architecture:

- **Diagnostics** for violations (ESLint a11y rules → diagnostics with source: "eslint", category: "accessibility")
- **Node properties** for patterns (learned patterns stored as metadata, not effects)
- **Computed views** for trends (from diagnostic timestamps)

---

## Architecture Alignment (Corrected)

### What Goes Where

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ NODES (what code IS)                                                        │
│                                                                             │
│ jsx_component.properties: {                                                 │
│   aria_label, accessibility_role, tab_index, ...  ← Accessibility attrs   │
│   a11y_patterns_applied: ["heading-role", ...]    ← Learned patterns      │
│ }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ DIAGNOSTICS (what's WRONG)                                                  │
│                                                                             │
│ source: "wcag"   + category: "accessibility" → Static analysis             │
│ source: "axe"    + category: "accessibility" → Runtime (Storybook)         │
│ source: "eslint" + category: "accessibility" → ESLint a11y rules ← NEW     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ METADATA (supporting data)                                                  │
│                                                                             │
│ a11y_patterns table → Learned patterns with frequency, examples            │
│ a11y_cluster_state → Muting, resolution status, learnings                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase A: ESLint Plugin for React Native Web

### Why Deferred

- Complex AST traversal
- Need Plan 1 data to identify highest-value rules
- Runtime detection (axe-core) already catches these

### ESLint → Diagnostics (Not Effects)

ESLint violations are diagnostics with:
- `source: "eslint"` (standard ESLint source)
- `category: "accessibility"` (distinguishes from other lint rules)
- `code: "rn-web-a11y/heading-props-role"` (rule name)

```typescript
// ESLint output naturally flows through existing lint validation
// No special handling needed - just add the rules

// In packages/eslint-plugin-rn-web-a11y/src/rules/heading-props-role.ts
export const headingPropsRole: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require accessibilityRole on Text with heading props",
      category: "Accessibility",  // ← Maps to diagnostics category
      recommended: true,
    },
    fixable: "code",
    messages: {
      missingRole: 'Text with {{ prop }}={true} should have accessibilityRole="header"'
    }
  },
  create(context) {
    // ... rule implementation
  }
};
```

### Integration: Zero Special Code

Because ESLint violations already flow through LintValidator → Hub:

```typescript
// In hub-integration.ts (existing code handles this!)
if (result.lint?.issues) {
  for (const issue of result.lint.issues) {
    diagnostics.push({
      source: "eslint",
      // category is derived from rule metadata or set to "linting"
      // For a11y rules, we can detect from rule prefix: "rn-web-a11y/*"
      category: issue.code?.startsWith("rn-web-a11y/") ? "accessibility" : "linting",
      ...
    });
  }
}
```

### Rules to Implement (Start with 2-3)

Based on Plan 1 cluster data:

```typescript
// packages/eslint-plugin-rn-web-a11y/

// Rule 1: heading-props-role
// <Text h1={true}> → must have accessibilityRole="header"

// Rule 2: interactive-needs-role  
// <Pressable onPress={...}> → must have accessibilityRole

// Rule 3: (TBD based on Plan 1 data)
```

---

## Phase B: Pattern Learning

### Patterns as Metadata (Not Effects)

Patterns represent learned knowledge, not code behavior. Store in a simple table:

```sql
CREATE TABLE a11y_patterns (
  pattern_id VARCHAR PRIMARY KEY,
  repo_id VARCHAR NOT NULL,
  
  -- Classification
  pattern_type VARCHAR NOT NULL,  -- heading, label, state, interaction, focus
  component_type VARCHAR,         -- Text, Button, Card, etc.
  
  -- Description
  description TEXT NOT NULL,
  before_example TEXT,
  after_example TEXT,
  
  -- WCAG reference
  wcag_criterion VARCHAR,
  
  -- Statistics
  frequency INTEGER DEFAULT 1,
  
  -- Rule connection
  suggested_rule VARCHAR,         -- ESLint rule name
  codified_as_rule BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Pattern Capture from Learnings

When developers complete a screen (Plan 1 workflow):

```typescript
// devac a11y complete messaging/ChatView --learnings "..."

async function capturePatterns(
  learnings: string,
  resolvedDiagnostics: UnifiedDiagnostics[]
): Promise<void> {
  // Simple heuristic: extract patterns from learnings text
  const patterns = extractPatternsFromLearnings(learnings, resolvedDiagnostics);
  
  for (const pattern of patterns) {
    await db.insert("a11y_patterns", pattern);
  }
}
```

### Pattern → Node Property

When a pattern is commonly applied, it can be tracked in node properties:

```typescript
// jsx_component node
{
  entity_id: "...",
  name: "MessageBubble",
  properties: {
    // Accessibility attributes
    accessibility_role: "text",
    
    // Patterns that have been applied to this component
    a11y_patterns_applied: [
      "heading-role",      // Applied heading-props-role pattern
      "dynamic-announce"   // Applied live region pattern
    ]
  }
}
```

This allows queries like:
```sql
-- Find components that haven't had common patterns applied
SELECT n.name, n.file_path
FROM nodes n
WHERE n.kind = 'jsx_component'
  AND n.properties->>'is_interactive' = 'true'
  AND NOT (n.properties->'a11y_patterns_applied' ? 'interactive-role')
```

---

## Phase C: Cross-Source Deduplication

### Problem

Same issue detected by multiple sources:
- `source: "wcag"` - static analysis
- `source: "axe"` - runtime detection  
- `source: "eslint"` - lint rule

### Solution: Computed Deduplication

```sql
-- View: Deduplicated diagnostics
CREATE VIEW a11y_diagnostics_deduped AS
WITH ranked AS (
  SELECT 
    *,
    -- Create deduplication key
    MD5(
      COALESCE(code, '') || ':' || 
      file_path || ':' ||
      COALESCE(CAST(line_number AS VARCHAR), '')
    ) as dedup_key,
    -- Prefer runtime over static (more accurate)
    CASE source 
      WHEN 'axe' THEN 1
      WHEN 'wcag' THEN 2
      WHEN 'eslint' THEN 3
    END as source_priority,
    ROW_NUMBER() OVER (
      PARTITION BY dedup_key 
      ORDER BY source_priority
    ) as rn
  FROM unified_diagnostics
  WHERE category = 'accessibility'
)
SELECT * FROM ranked WHERE rn = 1;
```

### Query Tool Uses Deduplicated View

```typescript
// query_a11y_diagnostics uses the deduped view by default
query_a11y_diagnostics({
  deduplicate: true  // Default: true
})
```

---

## Phase D: Trend Analysis

### Trends from Diagnostic Timestamps

No new data structures - just queries over existing diagnostics:

```sql
-- Violations over time
SELECT 
  DATE_TRUNC('week', created_at) as week,
  source,
  COUNT(*) as count
FROM unified_diagnostics
WHERE category = 'accessibility'
  AND created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY week, source
ORDER BY week;

-- Resolution velocity
SELECT 
  DATE_TRUNC('week', updated_at) as week,
  COUNT(*) as resolved_count
FROM unified_diagnostics
WHERE category = 'accessibility'
  AND resolved = true
  AND updated_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY week
ORDER BY week;
```

### MCP Tool

```typescript
query_a11y_trends({
  repoId?: string,
  feature?: string,
  periodDays?: number,  // Default: 90
  granularity?: "day" | "week" | "month"
}): {
  periods: Array<{
    start: string,
    end: string,
    newCount: number,
    resolvedCount: number,
    bySource: Record<string, number>,
    bySeverity: Record<string, number>
  }>,
  trend: "improving" | "stable" | "declining"
}
```

---

## Phase E: Performance Optimization

### Incremental Testing

Use DevAC's affected analysis to only test changed stories:

```typescript
// In CI, only run accessibility tests for affected stories
async function getAffectedStories(changedFiles: string[]): Promise<string[]> {
  // Use DevAC's query_affected to find impacted components
  const affected = await queryAffected(changedFiles, { maxDepth: 3 });
  
  // Find stories that test these components via TESTS edges
  const componentIds = affected
    .filter(e => e.kind === "jsx_component")
    .map(e => e.entity_id);
  
  const stories = await db.query(`
    SELECT n.file_path, n.properties->>'story_id' as story_id
    FROM nodes n
    JOIN edges e ON n.entity_id = e.source_entity_id
    WHERE n.kind = 'story'
      AND e.edge_type = 'TESTS'
      AND e.target_entity_id IN (${componentIds.map(id => `'${id}'`).join(",")})
  `);
  
  return stories.map(s => s.story_id);
}
```

### Sharding

For large story counts, shard by feature:

```bash
# CI matrix strategy
CI_SHARD=messaging yarn test-storybook:a11y --grep "features-messaging"
CI_SHARD=appointments yarn test-storybook:a11y --grep "features-appointments"
```

---

## Decision Points

### Start Phase A (ESLint) When:
- Plan 1 shows clear pattern frequency from clusters
- >50 diagnostics have been resolved
- Team wants earlier detection in IDE

### Start Phase B (Patterns) When:
- Learnings are being captured via `devac a11y complete`
- Same fixes appear across multiple features
- Want to systematize tribal knowledge

### Start Phase C (Dedup) When:
- ESLint plugin is active
- Seeing duplicate diagnostics from multiple sources

### Start Phase D (Trends) When:
- >30 days of diagnostic data
- Leadership wants compliance dashboards

### Start Phase E (Performance) When:
- Test run time exceeds acceptable threshold
- Story count exceeds 500

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `packages/eslint-plugin-rn-web-a11y/` | Create | New ESLint plugin package |
| `hub/hub-integration.ts` | Modify | Detect a11y rules by prefix for category |
| `hub/a11y-patterns.ts` | Create | Pattern storage and queries |
| `devac-mcp/src/tools/a11y-trends.ts` | Create | Trend query tool |

---

## Success Criteria

| Phase | Metric | Target |
|-------|--------|--------|
| **A: ESLint** | Rules producing diagnostics | 2-3 rules |
| **A: ESLint** | Diagnostics have category: "accessibility" | 100% |
| **B: Patterns** | Patterns captured per feature | >3 |
| **C: Dedup** | Duplicate reduction | >30% |
| **D: Trends** | Query performance | <500ms |
| **E: Perf** | Affected-only test time | <30s |

---

## What's NOT in This Plan

- ❌ **A11yViolationEffect** - Removed, violations are diagnostics
- ❌ **A11yPatternEffect** - Removed, patterns are metadata not effects
- ❌ **Complex effect types** - Keeping effects pure for code behavior

---

## Relationship to Plan 1

All Plan 2 features build on Plan 1's foundation:

1. **Diagnostics pipeline** → ESLint violations flow through same path
2. **Story nodes** → Patterns can reference stories
3. **Cluster state** → Patterns link to resolved clusters
4. **unified_diagnostics** → Trends computed from timestamps

**Do not start Plan 2 until Plan 1 is stable and providing value.**
