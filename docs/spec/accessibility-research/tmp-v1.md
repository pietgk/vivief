# DevAC Reference Storybooks Implementation Plan

## Goal

Create reference storybooks for DevAC that:
1. Detect close to 90% of all WCAG accessibility issues
2. Supply verified knowledge to LLMs on how to solve accessibility issues with examples

## Overview

Three reference storybooks, implemented in phases:

| Storybook | Purpose | Phase |
|-----------|---------|-------|
| `storybook-axe-core` | Auto-generated from axe-core rules (72 component-level) | Phase 1 |
| `storybook-zag` | Behavioral a11y testing with zag.js state machines (47 components) | Phase 2 |
| `storybook-universal` | React Native accessibility testing | Deferred |

## Existing Infrastructure (Already Implemented)

- **scan-storybook**: Parallel scanning with Playwright, axe-core integration, hub push
- **AxeScanner**: Runtime scanning in browser-core with WCAG mapping
- **WcagValidator**: Static AST analysis during seed generation
- **UnifiedDiagnostics**: Hub storage for both "wcag" and "axe" sources

---

## Phase 1: storybook-axe-core (4 weeks)

### Package Structure

```
packages/storybook-axe-core/
├── scripts/
│   ├── generate-stories.ts       # Main generator
│   ├── extract-fixtures.ts       # Pull HTML from axe-core
│   ├── rule-metadata.ts          # Extract rule metadata via axe.getRules()
│   └── generate-manifest.ts      # Build a11y-rule-manifest.json
├── src/stories/
│   └── _generated/               # Auto-generated per rule
│       ├── image-alt/
│       │   ├── image-alt.stories.tsx
│       │   └── image-alt.mdx
│       └── ...
├── a11y-rule-manifest.json       # Generated manifest
└── package.json
```

### Implementation Steps

1. **Extract rule metadata** from axe-core via `axe.getRules()` API
   - 72 component-level rules (testable in Storybook context)
   - 23 page-level rules (skip or handle specially)

2. **Extract HTML fixtures** from `axe-core/test/integration/rules/{rule-id}/`
   - Violation examples (shouldViolate: true)
   - Pass examples (shouldViolate: false)

3. **Generate stories** using `dangerouslySetInnerHTML` for exact DOM parity
   - One `.stories.tsx` per rule with Violation + Pass stories
   - MDX documentation with WCAG references and fix examples

4. **Generate rule manifest** (JSON) with:
   - Rule metadata (ruleId, wcag, impact, helpUrl)
   - Story mappings (violations, passes)
   - Fix examples (before/after code)

### Story Template

```typescript
const meta: Meta = {
  title: "A11y Rules/Images/image-alt",
  parameters: {
    a11yReference: {
      ruleId: "image-alt",
      wcag: ["wcag111"],
      impact: "critical",
    },
  },
};

export const Violation: StoryObj = {
  render: () => <div dangerouslySetInnerHTML={{ __html: `<img src="test.png" />` }} />,
  parameters: { a11yReference: { shouldViolate: true } },
};

export const Pass: StoryObj = {
  render: () => <div dangerouslySetInnerHTML={{ __html: `<img src="test.png" alt="Description" />` }} />,
  parameters: { a11yReference: { shouldViolate: false } },
};
```

### Key Rules to Cover (72 total)

| Category | Rules |
|----------|-------|
| Images | image-alt, image-redundant-alt, input-image-alt, svg-img-alt |
| Buttons/Links | button-name, link-name, link-in-text-block |
| Forms | label, select-name, autocomplete-valid, input-button-name |
| Color | color-contrast |
| ARIA | ~20 rules (allowed-attr, valid-attr, required-attr, hidden-focus, etc.) |
| Tables | td-headers-attr, th-has-data-cells, scope-attr-valid |
| Lists | list, listitem, definition-list, dlitem |
| Headings | heading-order, empty-heading, p-as-heading |
| Structure | region, tabindex, duplicate-id, nested-interactive |

---

## Phase 2: storybook-zag (6 weeks)

### Purpose

Test behavioral accessibility that axe-core cannot detect:
- Keyboard navigation completeness
- Focus trap behavior
- Focus return after modal close
- Arrow key navigation in menus/tabs
- Escape key dismissal
- Live region announcements

### A11y State Metadata Schema

```typescript
interface A11yStateMeta {
  description: string;
  aria: Array<{
    selector: string;
    attributes: Record<string, string | boolean>;
  }>;
  focus: {
    target?: string;      // Element to focus on state entry
    trap?: string;        // Container for focus trap
    returnTo?: string;    // Element to return focus to
  };
  announcements?: Array<{
    politeness: "polite" | "assertive";
    message: string;
  }>;
}
```

### Component Priority (47 zag.js machines)

| Priority | Components | WCAG Focus |
|----------|------------|------------|
| High | Dialog, Menu, Tabs, Accordion, Combobox | 2.1.1, 2.1.2, 4.1.2 |
| Medium | Checkbox, Radio, Select, Popover, Toast | 4.1.2, 4.1.3 |
| Lower | Remaining 35+ components | Various |

### Story Structure per Component

1. **Correct Story** - Component with all a11y features working
2. **Violation Stories** - One per detectable issue type:
   - Missing aria-modal
   - Focus not trapped
   - Focus not returned
   - Missing accessible name
   - Keyboard nav broken

---

## Verification Strategy (90% Detection Goal)

### Coverage Calculation

```
Coverage = (Detected Rules + Detected Behaviors) / (Total Rules + Total Behaviors)

Target breakdown:
- axe-core rules: 72/72 = 100% detection
- Behavioral issues: ~80% via zag state machine testing
- Combined: ~90% WCAG coverage
```

### Validation Test Suite

```typescript
// Run scan-storybook against reference storybooks
// Compare results to manifest expectations

for (const rule of manifest.rules) {
  it(`detects ${rule.ruleId} violations`, () => {
    const result = findStoryResult(rule.stories.violations[0]);
    expect(result.violations).toContainRule(rule.ruleId);
  });

  it(`passes ${rule.ruleId} when correct`, () => {
    const result = findStoryResult(rule.stories.passes[0]);
    expect(result.violations).not.toContainRule(rule.ruleId);
  });
}
```

---

## LLM Knowledge Export

### Fix Examples Database

```json
{
  "image-alt": {
    "violations": [{
      "pattern": "<img src=\"...\" />",
      "fixes": [{
        "before": "<img src=\"chart.png\" />",
        "after": "<img src=\"chart.png\" alt=\"Q4 sales growth chart\" />",
        "explanation": "Add descriptive alt text for informative images"
      }]
    }]
  }
}
```

### Structured Knowledge for RAG

- Rule ID, WCAG criterion, level
- What it tests, why it matters, affected users
- Common violation patterns with fixes
- Testable conditions and automation limitations

---

## Critical Files to Modify/Create

### New Packages

| Package | Location | Purpose |
|---------|----------|---------|
| storybook-axe-core | `packages/storybook-axe-core/` | axe-core reference stories |
| storybook-zag | `packages/storybook-zag/` | zag.js behavioral stories |
| a11y-testing-shared | `packages/a11y-testing-shared/` | Shared types and utilities |

### Key Files to Create

1. `packages/storybook-axe-core/scripts/generate-stories.ts` - Main story generator
2. `packages/storybook-axe-core/scripts/extract-fixtures.ts` - Fixture extraction
3. `packages/storybook-axe-core/a11y-rule-manifest.json` - Generated manifest
4. `packages/a11y-testing-shared/src/types/a11y-state-meta.ts` - State metadata types
5. `packages/storybook-zag/src/a11y-meta/*.a11y.ts` - Per-component a11y metadata

### Existing Files to Reference

1. `packages/browser-cli/src/commands/scan-storybook/parallel-scanner.ts` - Scanning integration
2. `packages/browser-core/src/reader/accessibility/axe-scanner.ts` - AxeScanner API
3. `packages/devac-core/src/hub/hub-storage.ts` - UnifiedDiagnostics types

---

## Testing Plan

1. **Unit Tests**: Story generation scripts, fixture extraction
2. **Integration Tests**: Run scan-storybook against generated stories
3. **Coverage Validation**: Compare detected vs expected violations
4. **Manual Testing**: Verify MDX documentation accuracy

### CI Workflow

```yaml
# Validate a11y coverage on each PR
- Build storybooks
- Run scan-storybook
- Calculate coverage percentage
- Fail if < 90%
```

---

## Timeline Summary

| Phase | Weeks | Deliverable |
|-------|-------|-------------|
| 1 | 1-4 | storybook-axe-core (72 rules, manifest, MDX docs) |
| 2 | 5-10 | storybook-zag (47 components, a11y metadata, violation stories) |
| 3 | 11-12 | Documentation, LLM knowledge export, coverage validation |
| Deferred | - | storybook-universal (React Native) |

## Success Criteria

- [ ] 72 axe-core rules with violation + pass stories
- [ ] Rule manifest with fix examples
- [ ] 47 zag components with a11y state metadata
- [ ] scan-storybook detects 100% of generated violations
- [ ] Combined WCAG coverage >= 90%
- [ ] LLM-ready fix examples database
