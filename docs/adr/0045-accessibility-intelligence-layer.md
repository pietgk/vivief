# ADR-0045: Accessibility Intelligence Layer

## Status

Accepted

## Context

DevAC had a validation pipeline with TypeScript, ESLint, test, and coverage validators. A WCAG validator existed for static AST analysis, but accessibility validation was incomplete:

1. **Static-only detection**: The `WcagValidator` checked for 5 WCAG rules via AST analysis, but lacked runtime/rendered DOM checks
2. **No Hub integration**: WCAG validation results weren't pushed to `unified_diagnostics`, so LLMs couldn't see/fix accessibility issues
3. **No runtime detection**: No integration with axe-core for browser-based accessibility scanning
4. **No Storybook integration**: No way to extract story metadata for component-level accessibility testing
5. **Missing RN support**: React Native accessibility props weren't extracted during parsing

Healthcare applications like Mindler require WCAG 2.1 AA compliance. The goal was to extend DevAC's existing validation pipeline with comprehensive accessibility detection rather than creating parallel structures.

## Decision

### 1. Integrate WCAG Validation into Unified Diagnostics

Push WCAG validation results to the Hub's `unified_diagnostics` table:

```typescript
// hub-integration.ts - Add WCAG source type
type ValidationSource = "tsc" | "eslint" | "biome" | "test" | "coverage" | "wcag";

// Convert WCAG issues to validation errors
if (result.wcag?.issues) {
  for (const issue of result.wcag.issues) {
    errors.push({
      file: issue.file,
      line: issue.line,
      column: issue.column,
      message: issue.message,
      severity: issue.severity,
      source: "wcag",
      code: issue.code ?? null,
    });
  }
}
```

Map "wcag" source to "accessibility" category in `central-hub.ts`:

```typescript
private sourceToCategory(source: ValidationSource): DiagnosticsCategory {
  switch (source) {
    case "wcag": return "accessibility";
    // ... other mappings
  }
}
```

### 2. Add Axe-Core Runtime Diagnostics Push

Create `push-axe-diagnostics.ts` to push AxeScanner results as unified diagnostics:

- Source: `"axe"` (runtime detection)
- Category: `"accessibility"`
- Map AxeScanner's impact levels (critical/serious/moderate/minor) to severity
- Extract file paths from story IDs (e.g., `mindlerui-atoms-button--primary` → `mindlerui/Atoms/Button/Button.stories.tsx`)
- Clear existing axe diagnostics before push to avoid duplicates

### 3. Add "story" Node Kind

Extend the DevAC schema to recognize Storybook stories as first-class entities:

```typescript
// node.schema.ts
export const NodeKindSchema = z.enum([
  // ... existing kinds
  "story",  // NEW - Storybook story
]);

// scoped-name-generator.ts
export type SymbolKind =
  | "function" | "class" | "interface"
  // ... existing kinds
  | "story";  // NEW
```

### 4. CSF3 Story Extractor

Create a dedicated parser for Component Story Format 3 (CSF3) files:

**Extracted from Meta (default export):**
- `title` → hierarchy (namespace/category/component)
- `component` → reference to tested component
- `args` → default props
- `parameters.a11y` → accessibility config/rule overrides
- `tags` → ["autodocs", "skip-a11y", etc.]

**Extracted from Stories (named exports):**
- Export name → story name and ID
- `args` → story-specific props
- `play` presence → has interaction tests
- `render` presence → custom render

**Story ID Convention:**
Format: `{kebab-title}--{kebab-export-name}`
Example: `mindlerui/Atoms/Button` + `Primary` → `mindlerui-atoms-button--primary`

**Story Node Properties:**
```typescript
{
  entity_id: "repo:pkg:story:hash",
  name: "Primary",
  kind: "story",
  qualified_name: "mindlerui-atoms-button--primary",
  properties: {
    namespace: "mindlerui",
    category: "Atoms",
    component_name: "Button",
    story_id: "mindlerui-atoms-button--primary",
    tested_component_id: "repo:pkg:jsx_component:xyz",
    has_play_function: true,
    has_custom_render: false,
    a11y_rules_disabled: ["color-contrast"],
    tags: ["autodocs"],
  }
}
```

### 5. Extract React Native Accessibility Props

Extend the TypeScript parser's `handleJSXElement()` to extract RN accessibility props:

```typescript
properties: {
  // Existing web accessibility
  ariaProps: props.aria,
  eventHandlers: props.handlers,
  tabIndex: props.tabIndex,
  elementId: props.elementId,
  // NEW - React Native accessibility
  rnAccessibility: {
    role: props.accessibilityRole,
    label: props.accessibilityLabel,
    hint: props.accessibilityHint,
    state: props.accessibilityState,
    accessible: props.accessible,
  }
}
```

### 6. Remove A11yViolationEffect

The original plan proposed adding an `A11yViolationEffect` type. After implementation review, this was **removed** in favor of the unified diagnostics approach:

- **Reason**: Accessibility issues are validation results, not runtime effects
- **Better fit**: The `unified_diagnostics` table already handles severity, source, category
- **Simpler architecture**: No parallel storage for the same data
- **LLM integration**: Existing MCP tools (`status_diagnostics`, `status_all_diagnostics`) already expose diagnostics

## Consequences

### Positive

- **Unified pipeline**: Accessibility issues flow through the same validation → diagnostics → LLM pattern as other validators
- **LLM visibility**: Claude can see accessibility issues via existing MCP tools and propose fixes
- **Story awareness**: DevAC understands Storybook component hierarchy and can link stories to components
- **Cross-platform support**: Both web (ARIA) and React Native accessibility props are extracted
- **No new tables**: Reuses `unified_diagnostics` schema with new source/category values
- **Incremental adoption**: Works with existing WCAG validator, just adds Hub push

### Negative

- **Runtime dependency**: Axe-core scanning requires a running browser (Playwright)
- **Story file parsing**: Additional file type to parse during analysis
- **CSF3 assumption**: Story extractor assumes Component Story Format 3 (Storybook 7+)

### Neutral

- **Two sources for a11y**: "wcag" (static) and "axe" (runtime) stored separately
- **Story-component linking**: Requires matching component references, may have unresolved links

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `packages/devac-core/src/hub/push-axe-diagnostics.ts` | Push AxeScanner results as diagnostics |
| `packages/devac-core/src/parsers/story-extractor.ts` | CSF3 Storybook story parser |
| `packages/browser-core/src/reader/accessibility/axe-scanner.ts` | Axe-core wrapper |
| `packages/browser-core/src/reader/accessibility/play-function-utils.ts` | Storybook Play Function utilities |
| `docs/spec/accessibility-research/*.md` | Research documents |

### Modified Files

| File | Change |
|------|--------|
| `packages/devac-core/src/hub/hub-client.ts` | Add "wcag" to HubLike source type |
| `packages/devac-core/src/hub/central-hub.ts` | Add wcag clearing and sourceToCategory mapping |
| `packages/devac-core/src/validation/hub-integration.ts` | Convert WCAG issues to validation errors |
| `packages/devac-core/src/storage/schemas/node.schema.ts` | Add "story" to NodeKindSchema |
| `packages/devac-core/src/parsers/scoped-name-generator.ts` | Add "story" to SymbolKind |
| `packages/devac-core/src/parsers/typescript-parser.ts` | Extract RN accessibility props |
| `packages/devac-core/src/parsers/index.ts` | Export story extractor |

## References

- [Issue #235](https://github.com/pietgk/vivief/issues/235) - Accessibility Retrieval Strategy
- [ADR-0044](0044-unified-addressing-scheme.md) - Unified Addressing Scheme (entity IDs)
- [Plan: Accessibility Intelligence Layer](.claude/plans/235-accessibility-retrieval-strategy.md)
- [WCAG 2.1 Guidelines](https://www.w3.org/TR/WCAG21/)
- [Storybook CSF3](https://storybook.js.org/docs/react/api/csf)
- [axe-core](https://github.com/dequelabs/axe-core)
