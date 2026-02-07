# DevAC Reference Storybooks - Simplified Implementation Plan

## Goal

Create reference storybooks for DevAC that:
1. Detect close to 90% of all WCAG accessibility issues
2. Supply verified knowledge to LLMs on how to solve accessibility issues with examples

---

## Key Insight: Leverage Existing DevAC Infrastructure

DevAC already has substantial accessibility infrastructure that eliminates the need for parallel systems:

### What Already Exists

| Component | Location | What It Does |
|-----------|----------|--------------|
| **TypeScript Parser** | `devac-core/src/parsers/` | Extracts `potentialA11yIssue`, `ariaProps`, `isInteractive`, event handlers |
| **WcagValidator** | `devac-core/src/validation/` | 5 WCAG rules for keyboard access, ARIA, naming |
| **Story Extractor** | `devac-core/src/parsers/story-extractor.ts` | Parses CSF3, captures `a11yRulesDisabled`, `tags`, extensible properties |
| **Unified Diagnostics** | Hub table | Stores both `source: "wcag"` (static) and `source: "axe"` (runtime) |
| **scan-storybook** | `browser-cli/src/commands/` | Parallel scanning, axe-core integration, hub push |
| **AxeScanner** | `browser-core/src/reader/accessibility/` | Runtime scanning with WCAG mapping |

### Why This Simplifies Everything

1. **No new effect types** - ADR-0045 explicitly uses unified_diagnostics (not A11yViolationEffect)
2. **Story node properties are extensible** - Store `a11yReference` metadata in existing JSON field
3. **SQL queries validate coverage** - Cross-reference stories against detections via existing MCP
4. **Rules engine ready** - Can classify a11y patterns if needed

---

## Simplified Architecture

### Data Flow

```
Reference Storybook Stories
    ↓
Story Nodes with a11yReference in properties JSON
    ↓ (devac sync)
Seeds contain expected violation metadata
    ↓ (scan-storybook)
Unified Diagnostics with detected violations
    ↓ (SQL query)
Compare expected vs detected → coverage report
```

### Story Node Properties (Already Supported)

```typescript
// Extend existing story node properties
properties: {
  // Existing fields
  storyId: "a11y-rules-images-image-alt--violation",
  hasPlayFunction: false,
  a11yRulesDisabled: [],
  tags: ["a11y-reference"],

  // New reference metadata (just add to properties)
  a11yReference: {
    isReferenceStory: true,
    shouldViolate: true,
    expectedRules: ["image-alt"],
    wcagCriterion: "1.1.1",
    wcagLevel: "A",
    impact: "critical",
    fixExample: {
      before: "<img src=\"test.png\" />",
      after: "<img src=\"test.png\" alt=\"Description\" />"
    }
  }
}
```

---

## Phase 1: Extend Static Detection (2 weeks)

### 1.1 Add WCAG Rules to WcagValidator

Leverage existing parser output - no new extraction needed:

| New Rule | WCAG | Checks |
|----------|------|--------|
| wcag-form-label | 1.3.1 | `htmlFor`/`id` pairing on inputs |
| wcag-heading-order | 1.3.1 | h1 → h2 → h3 sequence |
| wcag-semantic-elements | 1.3.1 | div with role="button" vs semantic button |
| wcag-aria-hidden-focus | 4.1.2 | focusable elements inside aria-hidden |
| wcag-list-structure | 1.3.1 | ul/ol contains only li children |
| wcag-image-alt | 1.1.1 | img has alt (or role="presentation") |
| wcag-link-name | 2.4.4 | a has accessible name |
| wcag-table-headers | 1.3.1 | th has scope or headers |

**Files to modify:**
- `packages/devac-core/src/validation/wcag-rules.ts` - Add rule definitions
- `packages/devac-core/src/validation/wcag-analyzer.ts` - Integrate new checks

### 1.2 Enhanced Parser Output (Optional)

If more data needed, extend existing extraction:

```typescript
// In typescript-parser.ts handleJSXElement()
// Already extracts: potentialA11yIssue, ariaProps, eventHandlers
// Can add: formAssociation, headingLevel, listRole
```

---

## Phase 2: Reference Storybook Fixture (3 weeks)

### 2.1 Package Structure (Minimal)

```
packages/storybook-axe-core/
├── package.json
├── .storybook/
│   ├── main.ts
│   └── preview.ts                    # Add a11yReference parameter type
├── scripts/
│   └── generate-from-axe-fixtures.ts # Generate stories from axe-core
├── src/stories/
│   ├── images/
│   │   └── image-alt.stories.tsx     # Violation + Pass stories
│   ├── buttons/
│   │   └── button-name.stories.tsx
│   └── ... (organized by category)
└── README.md
```

### 2.2 Story Generation Script

Pull fixtures from `axe-core/test/integration/rules/{rule-id}/`:

```typescript
// scripts/generate-from-axe-fixtures.ts
async function generateStories() {
  const rules = await getAxeCoreRules();  // via axe.getRules()

  for (const rule of rules.filter(r => r.category === "component")) {
    const fixtures = await extractFixtures(rule.ruleId);
    const story = generateStoryFile(rule, fixtures);
    await writeStoryFile(rule.ruleId, story);
  }
}
```

### 2.3 Story Format with a11yReference

```typescript
// src/stories/images/image-alt.stories.tsx
const meta: Meta = {
  title: "A11y Reference/Images/image-alt",
  tags: ["a11y-reference"],
  parameters: {
    a11yReference: {
      ruleId: "image-alt",
      wcagCriterion: "1.1.1",
      wcagLevel: "A",
      impact: "critical",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
    },
  },
};

export const Violation: StoryObj = {
  parameters: {
    a11yReference: {
      shouldViolate: true,
      expectedRules: ["image-alt"],
      fixExample: {
        before: "<img src=\"chart.png\" />",
        after: "<img src=\"chart.png\" alt=\"Q4 sales chart\" />",
        explanation: "Add descriptive alt text for informative images"
      }
    }
  },
  render: () => <div dangerouslySetInnerHTML={{ __html: `<img src="test.png" />` }} />,
};

export const Pass: StoryObj = {
  parameters: {
    a11yReference: { shouldViolate: false, expectedRules: [] }
  },
  render: () => <div dangerouslySetInnerHTML={{ __html: `<img src="test.png" alt="Test" />` }} />,
};
```

### 2.4 Extend Story Extractor

Capture `a11yReference` from story parameters:

```typescript
// In story-extractor.ts extractStoryParameters()
if (parameters.a11yReference) {
  storyProperties.a11yReference = {
    isReferenceStory: true,
    shouldViolate: parameters.a11yReference.shouldViolate ?? false,
    expectedRules: parameters.a11yReference.expectedRules ?? [],
    fixExample: parameters.a11yReference.fixExample,
    wcagCriterion: meta.a11yReference?.wcagCriterion,
    wcagLevel: meta.a11yReference?.wcagLevel,
    impact: meta.a11yReference?.impact,
  };
}
```

---

## Phase 3: Validation via SQL Queries (1 week)

### 3.1 Coverage Validation Query

```sql
-- Compare expected violations to actual detections
WITH reference_stories AS (
  SELECT
    entity_id,
    name as story_name,
    qualified_name as story_id,
    JSON_EXTRACT(properties, '$.a11yReference.shouldViolate') as should_violate,
    JSON_EXTRACT(properties, '$.a11yReference.expectedRules') as expected_rules
  FROM nodes
  WHERE kind = 'story'
    AND JSON_EXTRACT(properties, '$.a11yReference.isReferenceStory') = true
),
detected_violations AS (
  SELECT
    file_path,
    code as rule_id,
    COUNT(*) as count
  FROM unified_diagnostics
  WHERE source = 'axe'
  GROUP BY file_path, code
)
SELECT
  r.story_name,
  r.should_violate,
  r.expected_rules,
  d.rule_id as detected_rule,
  CASE
    WHEN r.should_violate = true AND d.rule_id IS NOT NULL THEN 'PASS'
    WHEN r.should_violate = false AND d.rule_id IS NULL THEN 'PASS'
    ELSE 'FAIL'
  END as validation_result
FROM reference_stories r
LEFT JOIN detected_violations d ON d.file_path LIKE '%' || r.story_id || '%';
```

### 3.2 Add MCP Tool (Optional)

```typescript
// query_a11y_coverage tool
async function queryA11yCoverage(): Promise<CoverageReport> {
  const sql = `...coverage query...`;
  const results = await hub.query(sql);
  return calculateCoverage(results);
}
```

### 3.3 CLI Command for Validation

```bash
# Validate reference storybook coverage
devac a11y validate --storybook http://localhost:6006

# Output:
# A11y Reference Validation
# Rules: 72 component-level
# Stories scanned: 144 (violation + pass pairs)
# Detection accuracy: 71/72 (98.6%)
# False positives: 0
# False negatives: 1 (rule: landmark-no-duplicate-main - page-level)
```

---

## Phase 4: LLM Knowledge Export (1 week)

### 4.1 Extract Fix Examples from Seeds

```sql
-- Generate fix examples for LLM consumption
SELECT
  JSON_EXTRACT(properties, '$.a11yReference.expectedRules[0]') as rule_id,
  JSON_EXTRACT(properties, '$.a11yReference.wcagCriterion') as wcag,
  JSON_EXTRACT(properties, '$.a11yReference.impact') as impact,
  JSON_EXTRACT(properties, '$.a11yReference.fixExample') as fix_example
FROM nodes
WHERE kind = 'story'
  AND JSON_EXTRACT(properties, '$.a11yReference.isReferenceStory') = true
  AND JSON_EXTRACT(properties, '$.a11yReference.shouldViolate') = true
ORDER BY JSON_EXTRACT(properties, '$.a11yReference.impact') DESC;
```

### 4.2 Queryable via MCP

Existing MCP tools already work:
- `query_sql` - Run custom queries
- `status_all_diagnostics` - Filter by category: "accessibility"
- `query_symbol` - Find stories by name

---

## Phase 5: Behavioral Testing (Future - 4 weeks)

### When to Add zag.js Stories

After Phase 1-4 validate axe-core detection works, extend with behavioral:
- Focus trap testing
- Keyboard navigation
- Focus return patterns
- Live region announcements

Uses same infrastructure - just add more stories with different `expectedRules`.

---

## Files to Modify/Create

### Modify Existing

| File | Change |
|------|--------|
| `devac-core/src/validation/wcag-rules.ts` | Add 8+ new WCAG rules |
| `devac-core/src/parsers/story-extractor.ts` | Extract a11yReference from parameters |
| `browser-cli/src/commands/scan-storybook/hub-writer.ts` | Include story metadata in diagnostics |

### Create New

| File | Purpose |
|------|---------|
| `packages/storybook-axe-core/` | Reference storybook package |
| `packages/storybook-axe-core/scripts/generate-from-axe-fixtures.ts` | Story generator |
| `devac-cli/src/commands/a11y-validate.ts` | CLI validation command (optional) |

---

## Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 1 | 2 weeks | 8+ new WCAG rules in WcagValidator |
| 2 | 3 weeks | storybook-axe-core with 72 rules × 2 stories |
| 3 | 1 week | SQL validation queries, coverage report |
| 4 | 1 week | LLM knowledge export via MCP |
| 5 | 4 weeks | (Future) storybook-zag behavioral tests |

**Total: 7 weeks** (vs 12 weeks in original plan)

---

## Success Criteria

- [ ] 8+ new WCAG rules detecting static issues
- [ ] 72 axe-core rules with violation + pass stories
- [ ] a11yReference metadata captured in story node properties
- [ ] SQL query validates detection accuracy
- [ ] scan-storybook detects 100% of generated violations
- [ ] Fix examples queryable via MCP for LLM consumption

---

## Why This Approach is Better

1. **No new tables or effects** - Uses existing unified_diagnostics
2. **No parallel infrastructure** - Extends WcagValidator and story extractor
3. **Queryable via existing MCP** - No new tools needed
4. **5 weeks shorter** - Leverages what's already built
5. **Consistent with ADR-0045** - Follows established patterns
