# A11y Reference Storybook — Specification

## Context

This spec is for the `vivief` project, specifically the `scan-storybook` package.
`scan-storybook` scans all Storybook stories and determines axe-core accessibility issues (wraps Playwright + axe-core).

We need a **reference test ground**: a Storybook of React components that **intentionally contain every detectable accessibility violation**, documented per rule, so we can verify that `scan-storybook` detects them all correctly.

This document is intended to be used in a Claude CLI session for further planning and implementation within the vivief repo.

---

## Goal

Generate a React Storybook where:

1. Every axe-core rule that can fire in a component-level rendering context has at least one story that **triggers** the violation
2. Every such rule also has a **passing** reference story for comparison
3. Each story is documented with the rule ID, WCAG mapping, impact level, and a link to the Deque University reference
4. The generation is **automated** from axe-core's own rule metadata and integration test fixtures
5. The output serves as the canonical test suite for `scan-storybook` — if scan-storybook can detect all violations in this Storybook, we have confidence in its coverage

---

## Architecture

```
packages/a11y-reference-storybook/
├── package.json
├── .storybook/
│   ├── main.ts
│   └── preview.ts
├── scripts/
│   ├── generate-stories.ts          # Main generator script
│   ├── extract-fixtures.ts          # Pulls HTML from axe-core test fixtures
│   └── rule-metadata.ts             # Extracts rule metadata from axe-core
├── src/
│   └── stories/
│       ├── _generated/              # Auto-generated stories (gitignored or committed)
│       │   ├── image-alt.stories.tsx
│       │   ├── button-name.stories.tsx
│       │   ├── color-contrast.stories.tsx
│       │   ├── ...
│       │   └── index.ts
│       └── manual/                  # Hand-crafted stories for edge cases
│           └── ...
├── a11y-rule-manifest.json          # Generated manifest of all rules + expected results
└── README.md
```

---

## Story generation strategy

### Step 1: Extract rule metadata from axe-core

```ts
import axe from 'axe-core';

// Get all rules with full metadata
const rules = axe.getRules();
// Each rule has: ruleId, description, help, helpUrl, tags (wcag2a, wcag2aa, etc.)

// Also available:
// axe.getRules(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
// to filter by tag
```

axe-core API reference: https://github.com/dequelabs/axe-core/blob/develop/doc/API.md#api-name-axegetrules

### Step 2: Extract HTML fixtures from axe-core integration tests

axe-core's own test suite contains HTML fixtures for every rule at:

```
node_modules/axe-core/test/integration/rules/{rule-id}/
```

Each rule directory typically contains:
- `{rule-id}.html` — an HTML page with both passing and failing elements
- The HTML uses data attributes or structural patterns that axe-core's own tests assert against

Additionally, virtual rule tests exist at:
```
node_modules/axe-core/test/integration/virtual-rules/{rule-id}.js
```

**Important:** These fixtures are in the axe-core npm package's source but may not be shipped in the published package. We may need to:
- Clone/reference the axe-core GitHub repo as a devDependency or git submodule
- Or fetch the fixtures at generation time from GitHub raw content

axe-core repo: https://github.com/dequelabs/axe-core
Integration test fixtures: https://github.com/dequelabs/axe-core/tree/develop/test/integration/rules
Virtual rule tests: https://github.com/dequelabs/axe-core/tree/develop/test/integration/virtual-rules

There is also a dedicated fixtures repo for testing axe-core integrations:
https://github.com/dequelabs/axe-test-fixtures

### Step 3: Generate story files

For each rule, generate a `.stories.tsx` file:

```tsx
// Auto-generated — do not edit manually
// Source: axe-core rule "{ruleId}"
import type { Meta, StoryObj } from '@storybook/react';

/**
 * ## Rule: `{ruleId}`
 *
 * {description}
 *
 * - **WCAG:** {wcagCriteria}
 * - **Impact:** {impact}
 * - **Tags:** {tags}
 * - **Reference:** {helpUrl}
 */
const meta: Meta = {
  title: 'A11y Violations/{category}/{ruleId}',
  parameters: {
    // Store rule metadata for scan-storybook to consume
    a11yReference: {
      ruleId: '{ruleId}',
      expectedViolations: ['{ruleId}'],
      wcag: ['{wcagTags}'],
      impact: '{impact}',
      helpUrl: '{helpUrl}',
    },
  },
};
export default meta;

/** ❌ VIOLATION: {violationDescription} */
export const Violation1: StoryObj = {
  render: () => (
    {/* JSX converted from axe-core fixture, or hand-crafted */}
  ),
  parameters: {
    a11yReference: {
      shouldViolate: true,
      ruleId: '{ruleId}',
    },
  },
};

/** ✅ PASS: {passDescription} */
export const Pass: StoryObj = {
  render: () => (
    {/* Accessible version */}
  ),
  parameters: {
    a11yReference: {
      shouldViolate: false,
      ruleId: '{ruleId}',
    },
  },
};
```

### Step 4: Generate a rule manifest

Output `a11y-rule-manifest.json` that maps every rule to its stories and expected results:

```json
{
  "generatedAt": "2026-02-03T...",
  "axeCoreVersion": "4.10.x",
  "rules": [
    {
      "ruleId": "image-alt",
      "description": "Images must have alternate text",
      "wcag": ["wcag2a", "wcag111"],
      "impact": "critical",
      "helpUrl": "https://dequeuniversity.com/rules/axe/4.10/image-alt",
      "category": "component",
      "stories": {
        "violations": ["ImgNoAlt", "ImgEmptyAlt", "InputImageNoAlt"],
        "passes": ["ImgWithAlt", "ImgAriaLabel", "DecorativeImgRoleNone"]
      }
    }
  ],
  "summary": {
    "totalRules": 95,
    "componentLevel": 72,
    "pageLevel": 23,
    "storiesGenerated": 280
  }
}
```

---

## Rule categorization

Not all axe-core rules can fire inside a Storybook story (which renders inside an iframe with a single component). Rules need to be categorized:

### Component-level rules (can trigger in Storybook stories)

These check individual DOM elements and will fire when a story renders a violating component:

| Category | Example rules |
|----------|--------------|
| Images | `image-alt`, `image-redundant-alt`, `input-image-alt`, `svg-img-alt` |
| Buttons | `button-name` |
| Links | `link-name`, `link-in-text-block` |
| Forms | `label`, `select-name`, `autocomplete-valid`, `input-button-name` |
| Color | `color-contrast` |
| ARIA | `aria-allowed-attr`, `aria-valid-attr`, `aria-valid-attr-value`, `aria-required-attr`, `aria-required-children`, `aria-required-parent`, `aria-hidden-focus`, `aria-hidden-body`, `aria-input-field-name`, `aria-toggle-field-name`, `aria-command-name`, `aria-meter-name`, `aria-progressbar-name`, `aria-tooltip-name`, `aria-treeitem-name`, `aria-dialog-name`, `aria-text`, `aria-conditional-attr`, `aria-prohibited-attr`, `aria-braille-equivalent`, `aria-deprecated-role` |
| Tables | `td-headers-attr`, `th-has-data-cells`, `scope-attr-valid`, `table-duplicate-name`, `table-fake-caption` |
| Lists | `list`, `listitem`, `definition-list`, `dlitem` |
| Headings | `heading-order`, `empty-heading`, `p-as-heading` |
| Frames | `frame-title`, `frame-title-unique`, `frame-focusable-content`, `frame-tested` |
| Structure | `region`, `landmark-complementary-is-top-level`, `landmark-contentinfo-is-top-level`, `landmark-banner-is-top-level`, `landmark-main-is-top-level`, `landmark-no-duplicate-banner`, `landmark-no-duplicate-contentinfo`, `landmark-no-duplicate-main` |
| Misc | `tabindex`, `duplicate-id`, `duplicate-id-active`, `duplicate-id-aria`, `scrollable-region-focusable`, `nested-interactive`, `no-autoplay-audio`, `blink`, `marquee`, `object-alt`, `video-caption` |

### Page-level rules (need special handling)

These check document-level properties and may not trigger in a component story context:

| Rule | What it checks |
|------|---------------|
| `document-title` | Page has a `<title>` |
| `html-has-lang` | `<html>` has `lang` attribute |
| `html-lang-valid` | `lang` is a valid BCP 47 value |
| `html-xml-lang-mismatch` | `lang` and `xml:lang` match |
| `landmark-one-main` | Page has exactly one `<main>` |
| `bypass` | Page has skip navigation mechanism |
| `page-has-heading-one` | Page has `<h1>` |
| `meta-viewport` | Viewport is not restrictive |
| `meta-refresh` | No auto-refresh meta tag |
| `valid-lang` | `lang` on elements is valid |

**Strategy for page-level rules:** Either skip these (document in manifest as `"category": "page"`) or create a special wrapper decorator that injects a full HTML document context. For `scan-storybook`, these may need to be tested differently (e.g., testing the Storybook shell itself, or wrapping stories in a custom HTML template).

---

## Integration with scan-storybook

### Expected workflow

```
1. Generate reference storybook (npm run generate)
2. Build reference storybook (npm run build-storybook)
3. Run scan-storybook against it (npx scan-storybook --storybook-url ...)
4. Compare scan results against a11y-rule-manifest.json
5. Report coverage: which rules were detected, which were missed
```

### scan-storybook validation test

```ts
// packages/scan-storybook/test/reference-validation.test.ts
import manifest from '@vivief/a11y-reference-storybook/a11y-rule-manifest.json';
import { scanStorybook } from '../src';

describe('scan-storybook coverage validation', () => {
  const results = await scanStorybook({
    storybookUrl: 'http://localhost:6006',
  });

  for (const rule of manifest.rules.filter(r => r.category === 'component')) {
    describe(`Rule: ${rule.ruleId}`, () => {
      it('should detect violations in violation stories', () => {
        for (const storyName of rule.stories.violations) {
          const storyResult = results.find(r =>
            r.storyId.includes(rule.ruleId) && r.storyId.includes(storyName)
          );
          expect(storyResult?.violations).toContainEqual(
            expect.objectContaining({ id: rule.ruleId })
          );
        }
      });

      it('should NOT detect violations in pass stories', () => {
        for (const storyName of rule.stories.passes) {
          const storyResult = results.find(r =>
            r.storyId.includes(rule.ruleId) && r.storyId.includes(storyName)
          );
          expect(storyResult?.violations ?? []).not.toContainEqual(
            expect.objectContaining({ id: rule.ruleId })
          );
        }
      });
    });
  }
});
```

---

## HTML fixture to React JSX conversion

axe-core fixtures are raw HTML. We need to convert them to React-renderable stories.

### Option A: `dangerouslySetInnerHTML` wrapper

Simplest approach — wrap the raw HTML in a div:

```tsx
export const Violation: StoryObj = {
  render: () => (
    <div dangerouslySetInnerHTML={{ __html: `
      <img src="test.png">
      <button></button>
    ` }} />
  ),
};
```

**Pros:** Direct 1:1 with axe-core fixtures, no translation errors
**Cons:** Bypasses React's DOM, some ARIA behaviors might differ from real React components

### Option B: JSX translation

Convert HTML fixtures to JSX:

```tsx
export const Violation: StoryObj = {
  render: () => (
    <>
      <img src="test.png" />
      <button></button>
    </>
  ),
};
```

**Pros:** More realistic — matches how actual React apps produce DOM
**Cons:** Translation can introduce subtle differences; needs automated HTML→JSX tooling

### Option C: Hybrid

Use `dangerouslySetInnerHTML` for generated stories (guaranteed match with axe-core fixtures) and hand-crafted JSX for a curated set of "realistic React component" stories.

**Recommendation:** Option C — gives us both coverage confidence and realistic React testing.

---

## Storybook configuration

```ts
// .storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    // NOTE: Do NOT add @storybook/addon-a11y here —
    // we want scan-storybook to be the a11y runner, not the built-in addon
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};
export default config;
```

```ts
// .storybook/preview.ts
import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    // Disable built-in a11y checks — we test with scan-storybook
    a11y: { disable: true },
  },
};
export default preview;
```

---

## Primary sources and references

### axe-core

| Resource | URL |
|----------|-----|
| GitHub repo | https://github.com/dequelabs/axe-core |
| Rule descriptions (full list) | https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md |
| Integration test fixtures | https://github.com/dequelabs/axe-core/tree/develop/test/integration/rules |
| Virtual rule tests | https://github.com/dequelabs/axe-core/tree/develop/test/integration/virtual-rules |
| Developer guide | https://github.com/dequelabs/axe-core/blob/develop/doc/developer-guide.md |
| Rule development guide | https://github.com/dequelabs/axe-core/blob/develop/doc/rule-development.md |
| API documentation | https://github.com/dequelabs/axe-core/blob/develop/doc/API.md |
| ARIA support reference | https://github.com/dequelabs/axe-core/blob/develop/doc/aria-supported.md |
| npm package | https://www.npmjs.com/package/axe-core |
| Test fixtures repo (for integrations) | https://github.com/dequelabs/axe-test-fixtures |

### Deque University (per-rule documentation)

Each rule has a dedicated page at:
```
https://dequeuniversity.com/rules/axe/{version}/{rule-id}
```
Example: https://dequeuniversity.com/rules/axe/4.10/image-alt

The `helpUrl` field from `axe.getRules()` provides the exact URL per rule.

### WCAG references

| Resource | URL |
|----------|-----|
| WCAG 2.2 (W3C) | https://www.w3.org/TR/WCAG22/ |
| Understanding WCAG 2.2 | https://www.w3.org/WAI/WCAG22/Understanding/ |
| WCAG Techniques | https://www.w3.org/WAI/WCAG22/Techniques/ |

### Storybook a11y testing

| Resource | URL |
|----------|-----|
| Storybook accessibility testing docs | https://storybook.js.org/docs/writing-tests/accessibility-testing |
| @storybook/addon-a11y | https://storybook.js.org/addons/@storybook/addon-a11y |
| Storybook a11y tutorial | https://storybook.js.org/tutorials/ui-testing-handbook/react/en/accessibility-testing/ |
| axe-playwright (used by scan-storybook) | https://www.npmjs.com/package/axe-playwright |
| @axe-core/playwright | https://www.npmjs.com/package/@axe-core/playwright |
| Playwright accessibility testing docs | https://playwright.dev/docs/accessibility-testing |

### Related tools

| Resource | URL |
|----------|-----|
| @chanzuckerberg/axe-storybook-testing | https://github.com/chanzuckerberg/axe-storybook-testing |
| jest-axe | https://www.npmjs.com/package/jest-axe |
| eslint-plugin-jsx-a11y | https://www.npmjs.com/package/eslint-plugin-jsx-a11y |

---

## Implementation plan (for Claude CLI session)

When picking this up in a Claude CLI session in the vivief repo, the steps are:

### Phase 1: Scaffold

1. Create the package at `packages/a11y-reference-storybook/`
2. Set up Storybook with React + Vite (no a11y addon)
3. Add axe-core as a dependency
4. Create the generator script scaffold

### Phase 2: Generate

1. Write `scripts/rule-metadata.ts` — extracts all rules from axe-core using `axe.getRules()`
2. Write `scripts/extract-fixtures.ts` — reads HTML fixtures from axe-core's test directory (clone repo or use as git dependency)
3. Write `scripts/generate-stories.ts` — produces `.stories.tsx` files and `a11y-rule-manifest.json`
4. Run generator and verify Storybook builds

### Phase 3: Validate

1. Start the reference Storybook
2. Run `scan-storybook` against it
3. Compare results against the manifest
4. Document coverage gaps (rules that scan-storybook cannot detect or that don't fire in Storybook context)
5. Categorize: detected / missed / page-level-only / needs-interaction

### Phase 4: CI integration

1. Add the reference Storybook build + scan as a CI job
2. If coverage drops (e.g., axe-core adds new rules), the CI fails
3. Regenerate stories when axe-core is updated

---

## Open questions

- **axe-core fixture access:** Are the integration test fixtures included in the npm package, or do we need to reference the GitHub repo? Need to check `node_modules/axe-core/` contents.
- **Story isolation:** Storybook renders each story in an iframe with `#storybook-root`. Some axe-core rules may behave differently in this context (e.g., `region` rule expects landmarks). How does scan-storybook handle this?
- **Interactive violations:** Some violations only manifest after interaction (e.g., focus management, keyboard traps). Do we need Storybook play functions to trigger these?
- **color-contrast specifics:** axe-core's color contrast check requires computed styles from a real browser render. Verify this works correctly in scan-storybook's Playwright context.
- **Rule versioning:** When axe-core updates with new rules, the generator should re-run. Should we pin axe-core version or track latest?
