# Plan 1: Core Accessibility Intelligence Layer

> **Issue:** [#235](https://github.com/pietgk/vivief/issues/235)
> **Worktree:** `/Users/grop/ws/vivief-235-accessibility-retrieval-strategy`
> **Status:** Phase 1 ✅ | Phase 2 ✅ | Phase 3 READY
> **Type:** Core Implementation
> **Created:** 2026-01-31
> **Updated:** 2026-01-31 (Corrected: Violations as Diagnostics, not Effects)
> **Followed By:** Plan 2 (Advanced Features)

## Summary

This plan integrates accessibility into DevAC's existing validation pipeline. The key insight is that **accessibility violations are diagnostics** (like tsc/eslint errors), not effects (like FunctionCall/Store).

**Architectural Clarity:**
- **Nodes** → What code IS (structure) → accessibility properties in `node.properties`
- **Effects** → What code DOES (behavior) → NOT violations
- **Diagnostics** → What's WRONG (compliance) → accessibility violations here

**Current Gap:** WcagValidator exists but results aren't pushed to Hub. This plan closes that gap and extends it to runtime (Storybook/axe-core) detection.

---

## Conceptual Model

### Where Accessibility Data Lives

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ NODES (nodes.parquet) - What code IS                                       │
│                                                                             │
│ jsx_component: {                                                            │
│   entity_id: "repo:pkg:jsx_component:hash",                                │
│   name: "Button",                                                           │
│   properties: {                                                             │
│     aria_label: "Submit form",        ← Accessibility attributes           │
│     accessibility_role: "button",     ← React Native props                 │
│     tab_index: 0,                     ← Keyboard navigation                │
│     has_on_press: true,               ← Interactive element                │
│   }                                                                         │
│ }                                                                           │
│                                                                             │
│ story: {                              ← NEW node kind                       │
│   entity_id: "repo:pkg:story:hash",                                        │
│   name: "Default",                                                          │
│   properties: {                                                             │
│     feature: "messaging",             ← Hierarchy for organization         │
│     screen: "ChatView",                                                     │
│     tested_component_id: "repo:...",  ← Links to component being tested   │
│   }                                                                         │
│ }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ EFFECTS (effects.parquet) - What code DOES                                 │
│                                                                             │
│ FunctionCall, Store, Retrieve, Send, Request, Response, etc.               │
│                                                                             │
│ ❌ NO A11yViolationEffect - violations are compliance issues, not behavior │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ DIAGNOSTICS (unified_diagnostics in Hub) - What's WRONG                    │
│                                                                             │
│ source: "tsc"     → TypeScript compilation errors                          │
│ source: "eslint"  → Lint warnings and errors                               │
│ source: "test"    → Test failures                                          │
│ source: "wcag"    → Static accessibility analysis (WcagValidator)          │
│ source: "axe"     → Runtime accessibility (Storybook/axe-core) ← NEW       │
│                                                                             │
│ All have category: "accessibility" for a11y-related issues                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Is Cleaner

1. **Violations are diagnostics** - just like tsc and eslint errors, they represent compliance issues
2. **Accessibility properties are node data** - ARIA attributes, roles, etc. are structural
3. **Effects remain pure** - they describe code behavior, not compliance failures
4. **Existing infrastructure** - WcagValidator, unified_diagnostics, Hub queries all exist

---

## What Already Exists (Phase 1-2)

### Static Analysis ✅

| Component | Status | Location |
|-----------|--------|----------|
| WcagValidator | ✅ Complete | `validation/validators/wcag-validator.ts` |
| WcagAnalyzer | ✅ Complete | `validation/wcag-analyzer.ts` |
| WCAG Rules | ✅ Complete | `rules/wcag-rules.ts` |
| ValidationCoordinator | ✅ Integrated | `validation/validation-coordinator.ts` |
| unified_diagnostics schema | ✅ Ready | `hub/hub-storage.ts` |

### Runtime Detection ✅

| Component | Status | Location |
|-----------|--------|----------|
| AxeScanner | ✅ Complete | `browser-core/src/reader/accessibility/axe-scanner.ts` |
| Play function utils | ✅ Complete | `browser-core/src/reader/accessibility/play-function-utils.ts` |
| MCP query tools | ✅ Complete | `devac-mcp/src/tools/` |

### Gap: Hub Integration ❌

**Missing:** `pushValidationResultsToHub()` doesn't handle WCAG results:

```typescript
// In hub-integration.ts - CURRENT STATE
if (result.typecheck?.issues) { /* pushes to hub */ }
if (result.lint?.issues) { /* pushes to hub */ }
if (result.coverage?.issues) { /* pushes to hub */ }
// if (result.wcag?.issues) { /* MISSING! */ }
```

---

## Phase 3: Complete the Pipeline

### 3.1 Push WCAG Results to Hub

```typescript
// packages/devac-core/src/hub/hub-integration.ts

export async function pushValidationResultsToHub(
  result: ValidationCoordinatorResult,
  hub: CentralHub,
  repoId: string
): Promise<void> {
  const diagnostics: UnifiedDiagnostics[] = [];
  
  // Existing: tsc, eslint, coverage...
  
  // NEW: WCAG static analysis
  if (result.wcag?.issues) {
    for (const issue of result.wcag.issues) {
      diagnostics.push({
        diagnostic_id: generateDiagnosticId(),
        repo_id: repoId,
        source: "wcag",
        category: "accessibility",
        file_path: issue.file,
        line_number: issue.line,
        column_number: issue.column,
        severity: mapWcagSeverity(issue.severity),
        title: issue.code ?? issue.message.slice(0, 100),
        description: issue.message,
        code: issue.code ?? null,
        suggestion: issue.suggestion ?? null,
        resolved: false,
        actionable: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  
  await hub.pushDiagnostics(diagnostics);
}
```

### 3.2 Add Runtime (axe-core) Diagnostics Source

For Storybook/axe-core results, add a new source:

```typescript
// packages/devac-core/src/hub/push-axe-diagnostics.ts

export async function pushAxeResultsToDiagnostics(
  results: AxeScanResult[],
  hub: CentralHub,
  repoId: string
): Promise<void> {
  const diagnostics: UnifiedDiagnostics[] = [];
  
  for (const result of results) {
    for (const violation of result.violations) {
      diagnostics.push({
        diagnostic_id: generateDiagnosticId(),
        repo_id: repoId,
        source: "axe",  // Runtime detection
        category: "accessibility",
        file_path: extractFileFromStoryId(result.storyId),
        line_number: null,  // Runtime doesn't have line numbers
        column_number: null,
        severity: mapAxeImpactToSeverity(violation.impact),
        title: `${violation.ruleId}: ${violation.ruleName}`,
        description: violation.message,
        code: violation.wcagCriterion,
        suggestion: violation.suggestion,
        resolved: false,
        actionable: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Additional context in properties or description
      });
    }
  }
  
  // Clear existing axe diagnostics for this repo before pushing
  await hub.clearDiagnostics(repoId, "axe");
  await hub.pushDiagnostics(diagnostics);
}
```

### 3.3 Add "story" Node Kind

Stories should be extracted as nodes so we can link diagnostics:

```typescript
// packages/devac-core/src/storage/schemas/node.schema.ts

export const NodeKindSchema = z.enum([
  // ... existing kinds ...
  "story",  // NEW: Storybook story
]);
```

Story nodes have properties that capture the hierarchy:

```typescript
// Story node example
{
  entity_id: "github.com/mindlercare/app:src/features/messaging:story:abc123",
  name: "Default",
  kind: "story",
  file_path: "src/features/messaging/ChatView.stories.tsx",
  qualified_name: "ChatView.Default",
  properties: {
    feature: "messaging",
    screen: "ChatView",
    story_id: "features-messaging-chatview--default",
    tested_component_id: "github.com/mindlercare/app:...:jsx_component:xyz789"
  }
}
```

### 3.4 Extract Accessibility Properties into Nodes

When parsing JSX, extract accessibility-related props into `node.properties`:

```typescript
// In typescript-parser.ts, when creating jsx_component nodes

function extractA11yProperties(jsxElement: ts.JsxElement): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  
  // ARIA attributes
  if (hasAttribute(jsxElement, "aria-label")) {
    props.aria_label = getAttributeValue(jsxElement, "aria-label");
  }
  if (hasAttribute(jsxElement, "aria-describedby")) {
    props.aria_describedby = getAttributeValue(jsxElement, "aria-describedby");
  }
  
  // React Native accessibility
  if (hasAttribute(jsxElement, "accessibilityRole")) {
    props.accessibility_role = getAttributeValue(jsxElement, "accessibilityRole");
  }
  if (hasAttribute(jsxElement, "accessibilityLabel")) {
    props.accessibility_label = getAttributeValue(jsxElement, "accessibilityLabel");
  }
  if (hasAttribute(jsxElement, "accessibilityState")) {
    props.accessibility_state = true;  // Has dynamic state
  }
  
  // Interactive
  if (hasAttribute(jsxElement, "onPress") || hasAttribute(jsxElement, "onClick")) {
    props.is_interactive = true;
  }
  
  // Keyboard
  if (hasAttribute(jsxElement, "tabIndex")) {
    props.tab_index = getAttributeValue(jsxElement, "tabIndex");
  }
  
  return props;
}
```

---

## Phase 4: Hierarchy and Clustering

### 4.1 Hierarchy from File Paths (No New Tables)

The feature → screen → component hierarchy is derived from file paths:

```typescript
function extractHierarchy(filePath: string): { feature: string; screen: string | null; component: string | null } {
  // src/features/messaging/screens/ChatView/components/MessageBubble.tsx
  const match = filePath.match(/features\/(\w+)(?:\/screens\/(\w+))?(?:\/components\/(\w+))?/);
  
  return {
    feature: match?.[1] ?? "ungrouped",
    screen: match?.[2] ?? null,
    component: match?.[3] ?? extractComponentName(filePath)
  };
}
```

### 4.2 Clustering via SQL Views

Clustering is computed, not stored:

```sql
-- View: Diagnostics clustered by rule + component + feature
CREATE VIEW a11y_clusters AS
SELECT 
  -- Cluster identity
  MD5(
    COALESCE(code, title) || ':' || 
    COALESCE(REGEXP_EXTRACT(file_path, 'features/(\w+)', 1), 'ungrouped')
  ) as cluster_id,
  
  -- Attributes
  code as rule_id,
  REGEXP_EXTRACT(file_path, 'features/(\w+)', 1) as feature,
  REGEXP_EXTRACT(file_path, 'components/(\w+)', 1) as component,
  
  -- Aggregates
  COUNT(*) as violation_count,
  MAX(severity) as worst_severity,
  ARRAY_AGG(DISTINCT file_path) as affected_files,
  
  -- Priority
  CASE 
    WHEN MAX(severity) = 'critical' THEN 'P0'
    WHEN MAX(severity) = 'error' THEN 'P1'
    WHEN COUNT(*) > 5 THEN 'P1'
    WHEN MAX(severity) = 'warning' THEN 'P2'
    ELSE 'P3'
  END as priority

FROM unified_diagnostics
WHERE category = 'accessibility'
  AND resolved = false
GROUP BY code, feature, component;
```

### 4.3 Lightweight State Table (Muting/Resolution)

For mutable state beyond what diagnostics tracks:

```sql
CREATE TABLE a11y_cluster_state (
  repo_id VARCHAR NOT NULL,
  cluster_id VARCHAR NOT NULL,  -- Matches computed cluster_id
  
  status VARCHAR DEFAULT 'open',  -- open, muted, resolved
  muted_reason VARCHAR,
  root_cause VARCHAR,
  learnings TEXT,
  assigned_to VARCHAR,
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (repo_id, cluster_id)
);
```

---

## Phase 5: MCP Tools and CLI

### 5.1 Enhanced Query Tools

```typescript
// Query accessibility diagnostics with hierarchy
query_a11y_diagnostics({
  repoId?: string,
  feature?: string,
  screen?: string,
  source?: "wcag" | "axe",  // Static or runtime
  severity?: "critical" | "error" | "warning",
  resolved?: boolean
})

// Query clusters (computed view)
query_a11y_clusters({
  repoId?: string,
  feature?: string,
  priority?: "P0" | "P1" | "P2" | "P3"
})

// Get fix context (existing, works with diagnostics)
query_a11y_fix_context({
  filePath: string,
  ruleId: string
})
```

### 5.2 CLI Commands

```bash
# List features with diagnostic counts
devac a11y features
# → Messaging: 12 issues (P1), Appointments: 3 issues (P2)

# Drill into a feature
devac a11y diagnostics --feature messaging
# → ChatView.stories.tsx:42 - color-contrast (error)
# → MessageBubble.tsx:15 - button-name (warning)

# View clusters
devac a11y clusters --priority P0,P1
# → color-contrast in messaging: 5 violations
# → button-name in appointments: 3 violations

# Mark cluster handled
devac a11y mute <cluster-id> --reason "Known limitation in third-party component"

# Run validation and push results
devac validate --wcag
devac a11y push  # Push axe results from Storybook run
```

### 5.3 App Integration

```bash
# In app repo, after running Storybook tests:
yarn test-storybook:a11y

# Push results to DevAC (using tsx, not ts-node)
npx tsx scripts/push-a11y-to-devac.ts
```

```typescript
// ~/ws/app/scripts/push-a11y-to-devac.ts
import { pushAxeResultsToDiagnostics, createHub } from "@pietgk/devac-core";

async function main() {
  const results = await loadAggregatedResults("test-results/accessibility/");
  const hub = await createHub();
  
  await pushAxeResultsToDiagnostics(results, hub, "github.com/mindlercare/app");
  
  console.log(`Pushed ${results.length} accessibility results to DevAC`);
}

main();
```

---

## What We're Removing

### ❌ A11yViolationEffect

This was conceptually wrong. Violations are compliance issues (diagnostics), not code behavior (effects). Remove from:
- `types/effects.ts` - Remove A11yViolationEffectSchema
- `types/effects.ts` - Remove createA11yViolationEffect

### ❌ Separate Cluster Tables

Use SQL views over unified_diagnostics instead. The a11y_cluster_state table only stores mutable state (muted, learnings).

### ❌ JSON Migration

No need - diagnostics are re-detected from code each validation run.

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `hub/hub-integration.ts` | Modify | Add WCAG issues to pushValidationResultsToHub |
| `hub/push-axe-diagnostics.ts` | Create | Push Storybook/axe results as diagnostics |
| `storage/schemas/node.schema.ts` | Modify | Add "story" kind |
| `parsers/typescript-parser.ts` | Modify | Extract a11y properties to node.properties |
| `parsers/story-extractor.ts` | Create | Parse .stories.tsx files |
| `types/effects.ts` | Modify | Remove A11yViolationEffect |
| `hub/a11y-cluster-state.ts` | Create | Lightweight state for muting/learnings |

---

## Success Criteria

| Metric | Target |
|--------|--------|
| **WCAG diagnostics in Hub** | `devac status --diagnostics --source wcag` shows results |
| **Axe diagnostics in Hub** | `devac status --diagnostics --source axe` shows results |
| **Story extraction** | .stories.tsx files produce story nodes |
| **A11y properties on nodes** | jsx_component nodes have aria_*, accessibility_* in properties |
| **Cluster view works** | `query_a11y_clusters` returns grouped results |
| **CLI works** | `devac a11y features` lists features with counts |

---

## Relationship to Plan 2

Plan 1 establishes the correct foundation:
- Violations as diagnostics (source: wcag, axe)
- Stories as nodes
- A11y properties in node.properties
- Clustering via views

Plan 2 can then add:
- ESLint plugin that produces diagnostics (source: eslint, category: accessibility)
- Pattern extraction from resolved clusters
- Trend analysis from diagnostic timestamps
