# Strategic Plan: Automated A11y Detection & Fixing via Zag + DevAC

## Context

**Problem:** We need automated accessibility issue detection and fixing for React and React Native components. The current `scan-storybook` command (PR #254, merged) provides runtime axe-core scanning, but only catches static DOM issues. It misses behavioral accessibility: keyboard navigation, focus management, ARIA state transitions, and live region announcements.

**Opportunity:** Zag.js contains 47 component state machines where each `connect()` function is effectively a **machine-readable accessibility specification** - mapping component state to ARIA attributes, keyboard interactions, and focus behaviors. This is far richer than what axe-core alone can test.

**Goal:** Combine zag's behavioral a11y knowledge with devac's scanning infrastructure to detect ~90% of WCAG issues for web, and provide LLM-consumable fix suggestions.

---

## Current Infrastructure (What We Have)

| Component | Status | Location |
|-----------|--------|----------|
| `scan-storybook` CLI | Done | `browser-cli/src/commands/scan-storybook/` |
| `a11y-reference-storybook` (axe-core rules) | Done | `packages/a11y-reference-storybook/` |
| Story extractor with `a11yReference` | Done | `devac-core/src/parsers/story-extractor.ts` |
| AxeScanner (runtime) | Done | `browser-core/src/reader/accessibility/` |
| WCAG validator (static, 13 rules) | Done | `devac-core/src/rules/wcag-rules.ts` |
| Hub integration (unified_diagnostics) | Done | source: "axe" and "wcag" |
| Play function runner | Done | `scan-storybook/play-function-runner.ts` |

---

## Research Findings

### 1. AST Extraction Feasibility (Connect Functions)

Analyzed 8 representative connect files. Found 6 distinct ARIA extraction patterns:

| Pattern | % of ARIA attrs | Auto-extractable? |
|---------|-----------------|-------------------|
| Static string literal (`"aria-haspopup": "dialog"`) | 28% | Yes - trivial |
| Boolean from state var (`"aria-expanded": open`) | 32% | Partial - needs variable resolution |
| Conditional/ternary (`ariaLabel \|\| !rendered.title ? ...`) | 16% | No - requires flow analysis |
| From prop() call (`role: prop("role")`) | 12% | No - requires cross-file analysis |
| From context/computed | 8% | No - requires machine schema |
| ID references (`dom.getContentId(scope)`) | 4% | Partial - can identify pattern |

**Keyboard handlers are 90% extractable** - the `EventKeyMap` pattern is highly consistent across all machines (ArrowUp/Down, Home/End, Enter, Escape mapped to machine events).

**Normalize wrappers** (`normalize.button()`, `normalize.input()`) add 20-30% of implicit ARIA semantics that aren't visible in connect file AST.

**Verdict:** ~40-45% of contracts can be auto-extracted via AST. Keyboard handlers are the bright spot (90%). Recommend **semi-automated scaffolding** - extract what we can, then manually complete the remaining ~55%.

### 2. Zag E2E Test Model Reuse

**32 model files** exist in `e2e/models/`, covering ~70-80% of the 47 machines. Each model class extends a base `Model` with:
- **Actions:** `clickTrigger()`, `pressKey()`, `type()`, `hoverItem()`, etc.
- **Assertions:** `seeContent()`, `seeCloseIsFocused()`, `seeTriggerIsFocused()`, `seeItemIsHighlighted()`, etc.
- **A11y check:** `checkAccessibility()` runs axe-core (39/41 test files include this)

**Adaptation to Storybook: 70% compatible.** Key changes needed:
- Skip `page.goto()` navigation (story is already mounted)
- Map fixture controls to Storybook args
- Rest (click, type, keyboard, focus assertions, axe scanning) works directly

**80% of E2E test coverage is behavioral a11y** (keyboard nav, focus management, ARIA state). Only ~12% of tests are explicitly labeled "a11y" but most tests verify accessible interaction patterns.

**Key models for priority components:**
| Model | Lines | Behavioral A11y Coverage |
|-------|-------|--------------------------|
| dialog.model.ts | 57 | Focus return, modal, escape |
| menu.model.ts | 112 | Keyboard nav, typeahead, highlight |
| tabs.model.ts | 125 | Arrow nav, focus, indicator |
| combobox.model.ts | 131 | Input+list, filtering, keyboard |
| accordion.model.ts | 46 | Expand/collapse, focus |
| select.model.ts | 120 | Keyboard, pointer, highlight |
| radio-group.model.ts | 95 | Focus-visible, labelledby, arrows |
| switch.model.ts | 77 | Toggle, focus, disabled |

**Verdict:** Models are an excellent shortcut for Phase 3. Instead of writing behavioral assertions from scratch, adapt zag's proven models as Storybook play function templates. Estimated 200+ behavioral assertions extractable from existing test files.

### 3. React Native Mapping Feasibility

**Mappability of 10 priority components:**

| Component | Roles | State Props | Keyboard | Focus | Overall |
|-----------|-------|-------------|----------|-------|---------|
| Switch/Checkbox | Full | Full | Via action | Implicit | **Full** |
| RadioGroup | Full | Full | Custom | Partial | **Full** |
| Accordion | Full | Full | Custom | Implicit | **Full** |
| Tabs | Full | Full | Custom | Via refs | **Full** |
| Tooltip | Approx | Full | N/A | N/A | **Full** |
| Dialog | Approx | Full | iOS only | iOS only | **Partial** |
| Popover | Approx | Partial | No | Partial | **Partial** |
| Menu | Label only | Partial | No | No | **Minimal** |
| Combobox | Label only | Partial | No | No | **Minimal** |
| Select | Label only | Partial | No | No | **Minimal** |

**5 fundamental gaps** between web ARIA and RN:
1. **Keyboard interaction model** - Web has built-in semantics; RN requires 100% manual imperative code
2. **Focus management** - Web uses CSS queries + tabindex; RN uses refs + `AccessibilityInfo.setAccessibilityFocus()` (async, platform-specific)
3. **Grouping/relationships** - Web has `aria-controls`, `aria-owns`, `aria-labelledby`; RN has only `accessibilityLabelledBy` (0.72+)
4. **Live regions** - `aria-live` on web; `accessibilityLiveRegion` Android-only; iOS needs `AccessibilityInfo.announceForAccessibility()`
5. **Modal/hidden** - `aria-modal` on web; `accessibilityViewIsModal` iOS-only; Android partial via `importantForAccessibility`

**Coverage: ~25% full ARIA parity, ~15% approximate, ~20% platform-specific, ~40% manual implementation needed.**

**Verdict:** Direct zag-to-RN mapping is not viable as a primary strategy. The architectural mismatch is too deep (estimated 850-1000+ hours for full parity). However, **static prop validation for the 5 fully-mappable components is practical** and valuable. For complex components (menu, combobox, select), RN needs a separate approach.

---

## Revised Recommendation

### Approach: Hybrid with Web-First Focus

Based on the research, the original Approach D (Hybrid) is confirmed but with important refinements:

1. **Phase 1 contracts should be semi-automated, not purely manual** - AST extraction covers 40-45% and nearly all keyboard handlers, providing useful scaffolding
2. **Phase 3 should adapt zag's E2E models directly** rather than writing behavioral assertions from scratch - 32 proven models covering 200+ behavioral test cases
3. **React Native should be scoped to static prop validation only** for 5 fully-mappable components, not a full behavioral testing story

### Phase 1: A11y Contract Extraction (Semi-Automated)

**Goal:** Create structured a11y contracts for 10 priority component types

**Approach:**
1. Build a lightweight AST extractor targeting zag connect files (reusing story-extractor patterns from `devac-core/src/parsers/story-extractor.ts`)
2. Auto-extract: static ARIA attributes (28%), keyboard handler maps (90%), part structure
3. Manually complete: conditional ARIA logic, focus management specs, normalize wrapper roles
4. Output: JSON contracts per component in `packages/a11y-contracts/contracts/`

**Contract schema:**
```json
{
  "component": "dialog",
  "source": "zag",
  "parts": {
    "trigger": {
      "role": "button",
      "aria": {
        "aria-haspopup": { "value": "dialog", "type": "static" },
        "aria-expanded": { "value": "state:open", "type": "state-dependent" },
        "aria-controls": { "value": "ref:content", "type": "id-reference" }
      },
      "keyboard": {
        "Enter": { "action": "TOGGLE", "preventDefault": true },
        "Space": { "action": "TOGGLE", "preventDefault": true }
      }
    },
    "content": {
      "role": "dialog",
      "aria": {
        "aria-modal": { "value": true, "type": "static" },
        "aria-labelledby": { "value": "ref:title", "type": "id-reference", "conditional": "title-rendered" }
      },
      "focus": {
        "trap": true,
        "initialFocus": "first-focusable",
        "returnTo": "trigger"
      }
    }
  },
  "states": ["open", "closed"],
  "wcagCriteria": ["2.1.1", "2.1.2", "4.1.2"],
  "rnMapping": {
    "trigger": {
      "accessibilityRole": "button",
      "accessibilityState": { "expanded": "state:open" }
    },
    "content": {
      "accessibilityViewIsModal": true,
      "platform": "ios-only"
    }
  }
}
```

**Deliverables:**
- `packages/a11y-contracts/` - New package
- `packages/a11y-contracts/src/extractor.ts` - AST extractor for zag connect files
- `packages/a11y-contracts/contracts/*.json` - 10 component contracts
- `packages/a11y-contracts/src/schema.ts` - TypeScript types for contract format

### Phase 2: Behavioral Reference Storybook

**Goal:** Build a reference Storybook using actual zag React components with play functions derived from zag's E2E test models

**Approach:**
1. Create `packages/a11y-reference-storybook-zag/`
2. For each of 10 priority components, create a React component using zag's `useMachine` + `connect`
3. Adapt corresponding E2E model as play function template (70% direct adaptation)
4. Tag stories with `a11yReference` metadata from Phase 1 contracts
5. Scan with existing `browser scan-storybook`

**Key adaptation from zag E2E models:**
```typescript
// Zag E2E (Playwright standalone)
class DialogModel extends Model {
  async clickTrigger() { await this.page.click("[data-part=trigger]") }
  async seeCloseIsFocused() { await expect(this.page.locator("[data-part=close-trigger]")).toBeFocused() }
}

// Adapted Storybook play function
export const FocusReturnOnClose: Story = {
  parameters: { a11yReference: { ruleId: "focus-return", ... } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /open/i }));
    // Focus should be on close button
    expect(document.activeElement).toHaveAttribute("data-part", "close-trigger");
    await userEvent.keyboard("{Escape}");
    // Focus should return to trigger
    expect(document.activeElement).toHaveAttribute("data-part", "trigger");
  }
};
```

**Deliverables:**
- `packages/a11y-reference-storybook-zag/` - New package
- 10 components x 3-5 stories each = 30-50 behavioral reference stories
- Play functions covering: keyboard nav, focus trap, focus return, ARIA state transitions

### Phase 3: Behavioral Assertions in scan-storybook

**Goal:** Extend scan-storybook to validate behavioral a11y using contracts

**Approach:**
1. After axe scanning + play function execution, run contract-based assertions
2. Check ARIA attributes on component parts match contract for current state
3. Check focus location matches contract expectations
4. Report behavioral violations in same format as axe violations (push to hub)

**Key files to modify:**
- `browser-cli/src/commands/scan-storybook/behavioral-assertions.ts` - New: assertion engine
- `browser-cli/src/commands/scan-storybook/parallel-scanner.ts` - Extend: run assertions after axe
- Hub writer already handles the output format

### Phase 4: React Native Static Rules (Scoped)

**Goal:** Add static analysis rules for 5 fully-mappable RN components

**Scope (based on research):** Only Switch, Checkbox, RadioGroup, Accordion, Tabs - these have full RN accessibility prop equivalents.

**Skip for now:** Dialog (iOS-only focus), Menu/Combobox/Select (no behavioral mapping), Popover (partial).

**Approach:**
1. Define ARIA-to-RN mapping table in `devac-core/src/validation/rn-a11y-mapping.ts`
2. Generate ~15 new WCAG rules from contracts (extending current 13 rules)
3. Rules check: correct `accessibilityRole`, required `accessibilityState` props, `accessibilityLabel` presence

**Example rule:**
```typescript
{
  id: "rn-switch-checked-state",
  wcagCriterion: "4.1.2",
  description: "Switch must expose checked state",
  check: (node) => {
    if (hasAccessibilityRole(node, "switch")) {
      return hasAccessibilityState(node, "checked");
    }
    return true;
  }
}
```

### Phase 5: LLM Knowledge Export

**Goal:** Make contracts queryable via MCP for fix suggestions

**Approach:**
1. Load contracts into devac seed as a new node kind (`a11y_contract`)
2. MCP `query_symbol` can find contracts by component name
3. Fix suggestions include before/after code from reference storybook

---

## Fresh Opinion: Zag + State Machine Model-Based Testing

The connection between zag's state machines and model-based testing is genuinely compelling, but there is an important nuance:

**What zag gives us is not the state machine formalism itself, but the _mapping from states to accessibility requirements_.** No other library codifies "when dialog is in state `open`, the content element MUST have `aria-modal=true` and focus MUST be trapped" as executable code.

The model-based testing angle (generating tests from machine models) is intellectually elegant, but practically:

1. Most a11y bugs are about **wrong or missing attributes in a given state** and **missing keyboard handlers** - not wrong state transitions.
2. Contract-based validation catches the same class of bugs more simply.
3. Model-based test generation adds value primarily for **focus management sequences** (trap -> navigate -> return), which are harder to express as static contracts.
4. **Zag's existing E2E models already encode the behavioral test sequences** - we don't need to generate them from machine definitions, we can adapt the 32 proven models directly.

**Bottom line:** The E2E models are the real gold mine, not the machine definitions. They represent hundreds of hours of hand-tuned behavioral accessibility tests. Adapting them (Phase 2-3) gives us more value per effort than building a machine-to-test generator.

**On React Native:** The research conclusively shows that zag's patterns don't translate to RN for complex interactive components (menu, combobox, select). The fundamental gap is that web browsers provide built-in keyboard interaction semantics for ARIA roles, while RN requires 100% manual imperative code. For RN, the value is in **static prop validation** (ensure accessibilityRole/State are set correctly) rather than behavioral testing. This is still valuable - catching "this Switch doesn't expose its checked state" is a real and common bug.

---

## Verification Plan

**After Phase 1 (contracts):**
- Validate contracts against WAI-ARIA Authoring Practices for the 10 components
- Verify keyboard handler extraction accuracy against actual zag source

**After Phase 2 (reference storybook):**
- Run `browser scan-storybook` against the zag reference storybook
- Measure: what percentage of contract requirements does axe-core catch?
- This gap analysis drives Phase 3 priority

**After Phase 3 (behavioral assertions):**
- Target: detect 90% of WCAG 2.1 AA issues across the 10 priority components
- Measure false positive rate on correctly-implemented zag components
- Compare against zag's own E2E test results as baseline

**After Phase 4 (RN rules):**
- Run extended WCAG validator on mindler app codebase
- Compare detected issues against manual audit
- Measure precision and recall for the 5 targeted components

---

## Key Files to Modify/Create

| File | Action | Phase |
|------|--------|-------|
| `packages/a11y-contracts/` | New package | 1 |
| `packages/a11y-contracts/src/extractor.ts` | AST extractor for zag connect files | 1 |
| `packages/a11y-contracts/src/schema.ts` | Contract TypeScript types | 1 |
| `packages/a11y-contracts/contracts/*.json` | 10 component contracts | 1 |
| `packages/a11y-reference-storybook-zag/` | New package - behavioral stories | 2 |
| `browser-cli/src/commands/scan-storybook/behavioral-assertions.ts` | Contract-based assertions | 3 |
| `browser-cli/src/commands/scan-storybook/parallel-scanner.ts` | Extend with assertions | 3 |
| `devac-core/src/validation/rn-a11y-mapping.ts` | ARIA to RN prop mapping | 4 |
| `devac-core/src/rules/wcag-rules.ts` | Add ~15 RN rules | 4 |

---

## Component Priority (Research-Validated)

| # | Component | Web A11y Complexity | E2E Model? | RN Mappable? | Phase 1 Priority |
|---|-----------|--------------------:|:----------:|:------------:|:----------------:|
| 1 | Dialog | High (focus trap, modal, escape) | Yes (57 lines) | Partial | **Yes** |
| 2 | Menu | High (keyboard nav, typeahead, submenu) | Yes (112 lines) | Minimal | **Yes** |
| 3 | Tabs | Medium (roving tabindex, orientation) | Yes (125 lines) | Full | **Yes** |
| 4 | Combobox | Very High (input+list, filtering) | Yes (131 lines) | Minimal | **Yes** |
| 5 | Accordion | Medium (expand/collapse) | Yes (46 lines) | Full | **Yes** |
| 6 | Select | High (similar to combobox) | Yes (120 lines) | Minimal | Yes |
| 7 | Switch | Low (toggle) | Yes (77 lines) | Full | Yes |
| 8 | RadioGroup | Medium (group nav) | Yes (95 lines) | Full | Yes |
| 9 | Tooltip | Low (hover/focus) | Yes | Full | Stretch |
| 10 | Popover | Medium (non-modal dialog) | Yes | Partial | Stretch |

**Start with top 5** to validate the approach, then expand.
