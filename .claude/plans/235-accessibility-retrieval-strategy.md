# Global Plan: Accessibility Intelligence Layer for DevAC

> **Issue:** [#235](https://github.com/pietgk/vivief/issues/235)
> **Status:** PLANNING
> **Created:** 2026-01-27
> **Type:** Strategic / Multi-Phase
> **Related Spec:** Accessibility Intelligence Layer (Opus 4.5 Desktop Session)

---

## Executive Summary

This plan enhances DevAC's **existing validation pipeline** with comprehensive accessibility detection. The key insight: DevAC already has WCAG validation integrated as the 5th validator in `ValidationCoordinator`. We extend this foundation rather than creating parallel structures.

**Core Pattern:** `file change → affected analysis → validators → diagnostics → LLM fixes`

---

## Existing Foundation

### Current Validation Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXISTING DEVAC VALIDATION PIPELINE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  File Changes (Git)                                                          │
│       │                                                                      │
│       ▼                                                                      │
│  SymbolAffectedAnalyzer (code graph traversal)                               │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              ValidationCoordinator.validate()                        │    │
│  │                                                                      │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │Typecheck │ │ Lint     │ │ Test     │ │ Coverage │ │ WCAG     │  │    │
│  │  │Validator │ │Validator │ │Validator │ │Validator │ │Validator │  │    │
│  │  │(tsc)     │ │(eslint)  │ │(jest)    │ │          │ │ ← EXISTS │  │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │    │
│  │       │            │            │            │            │         │    │
│  │       └────────────┴────────────┴────────────┴────────────┘         │    │
│  │                                   │                                  │    │
│  └───────────────────────────────────┼──────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│                         EnrichedIssue[] (with code graph context)            │
│                                      │                                       │
│                                      ▼                                       │
│                    ┌─────────────────────────────────────┐                   │
│                    │         HubStorage                  │                   │
│                    │  ┌─────────────────────────────┐   │                   │
│                    │  │ unified_diagnostics table   │   │                   │
│                    │  │ • source: tsc|eslint|test   │   │                   │
│                    │  │ • category: compilation|... │   │                   │
│                    │  │ • severity, file, line      │   │                   │
│                    │  └─────────────────────────────┘   │                   │
│                    └─────────────────┬───────────────────┘                   │
│                                      │                                       │
│                                      ▼                                       │
│                    ┌─────────────────────────────────────┐                   │
│                    │           MCP Tools                 │                   │
│                    │  • status_diagnostics               │                   │
│                    │  • status_all_diagnostics           │                   │
│                    └─────────────────┬───────────────────┘                   │
│                                      │                                       │
│                                      ▼                                       │
│                              LLM sees issues                                 │
│                              LLM proposes fixes                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Current WCAG Validator (Already Exists)

**Location:** `packages/devac-core/src/validation/validators/wcag-validator.ts`

**Current Rules (5 implemented):**
1. `wcag-keyboard-accessible` (2.1.1) - Click handlers need keyboard support
2. `wcag-accessible-name` (4.1.2) - Interactive elements need accessible names
3. `wcag-valid-aria-reference` (1.3.1) - ARIA IDs must reference existing elements
4. `wcag-no-positive-tabindex` (2.4.3) - Avoid tabIndex > 0
5. `wcag-button-has-text` (4.1.2) - Buttons need text/accessible name

**Limitation:** Static AST analysis only - no runtime/rendered DOM checks.

---

## Vision

Extend the existing validation pipeline with:
1. **Runtime detection** - axe-core/Storybook for rendered DOM issues
2. **Enhanced static detection** - More WCAG rules, React Native support
3. **LLM-powered semantic analysis** - Tier 2 issues (quality, not just presence)
4. **Formal verification** - SAT/SMT for constraint satisfaction (research)

**Target Coverage:**
- Current (static): ~30% of WCAG criteria
- With runtime: ~57% of issues
- With LLM: ~85% of issues

---

## Key Architecture Decisions

### Decision 1: Storage Architecture

**Decision: Option A - Unified `effects.parquet`**

| Aspect | Analysis |
|--------|----------|
| **Parquet handling** | Columnar storage handles NULL columns efficiently |
| **Query performance** | No JOINs needed for cross-effect queries |
| **Consistency** | Follows established DevAC effects pattern |
| **Schema evolution** | Add new columns without migration |

**Schema Addition:**
```typescript
// Add to effects.ts - A11yViolationEffect
{
  effect_type: "A11yViolation",
  rule_id: string,              // e.g., "color-contrast"
  impact: "critical" | "serious" | "moderate" | "minor",
  wcag_criterion: string,       // e.g., "1.4.3"
  wcag_level: "A" | "AA" | "AAA",
  detection_source: "static" | "runtime" | "semantic",
  platform: "web" | "react-native",
  message: string,
  html_snippet: string | null,   // For runtime violations
  css_selector: string | null,   // For runtime violations
  confidence: number | null,     // For LLM evaluations (configurable threshold)
}
```

---

### Decision 2: Runtime Detection Approach

**Question:** axe-core via Playwright (standalone) vs Storybook Play Functions?

#### Comparison

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RUNTIME DETECTION OPTIONS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OPTION A: axe-core via Playwright (Direct)                                  │
│  ──────────────────────────────────────────                                  │
│                                                                              │
│  URL/Component ──▶ Playwright loads ──▶ axe.run() ──▶ A11yViolation         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Pros                              │ Cons                            │    │
│  │ • Works on any URL                │ • Snapshot only (one state)     │    │
│  │ • No Storybook dependency         │ • No interaction testing        │    │
│  │ • Simpler setup                   │ • Manual state setup needed     │    │
│  │ • Good for production audits      │ • Can't test focus management   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  OPTION B: Storybook Play Functions (Integrated)                             │
│  ───────────────────────────────────────────────                             │
│                                                                              │
│  Story ──▶ Playwright (under hood) ──▶ Play Function ──▶ axe.run()          │
│                                         │                                    │
│                                         ├─▶ Tab navigation test              │
│                                         ├─▶ Focus trap test                  │
│                                         ├─▶ Keyboard shortcuts test          │
│                                         └─▶ State transitions test           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Pros                              │ Cons                            │    │
│  │ • Tests user interactions         │ • Requires Storybook setup      │    │
│  │ • Focus management testing        │ • More complex to maintain      │    │
│  │ • Multiple states per story       │ • Slower (more interactions)    │    │
│  │ • Keyboard navigation testing     │ • Need to write play functions  │    │
│  │ • Tab order verification          │                                 │    │
│  │ • Already uses Playwright         │                                 │    │
│  │ • Component isolation             │                                 │    │
│  │ • Existing story coverage         │                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  OPTION C: Hybrid (Recommended)                                              │
│  ─────────────────────────────────                                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  Storybook Play Functions (Primary - Component Testing)             │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │ • Run axe-core after story renders                          │   │    │
│  │  │ • Run axe-core after each play function step                │   │    │
│  │  │ • Test keyboard navigation (Tab, Enter, Escape, Arrow)      │   │    │
│  │  │ • Test focus traps (modals, dialogs)                        │   │    │
│  │  │ • Test state transitions (expanded, selected, etc.)         │   │    │
│  │  │ • Leverage existing story coverage                          │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  │  + Direct Playwright (Secondary - Full Page/E2E)                   │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │ • Audit production URLs                                     │   │    │
│  │  │ • Check page-level structure (headings, landmarks)          │   │    │
│  │  │ • Test cross-component interactions                         │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Decision: Option C (Hybrid) - Storybook Play Functions as primary, direct Playwright as secondary**

**Rationale:**
- Play Functions test what static analysis can't: keyboard nav, focus management, state transitions
- Storybook already uses Playwright under the hood - no new dependency
- Stories already exist for components - leverage existing coverage
- Direct Playwright fills gaps for full-page audits

---

### Decision 3: LLM Integration via Existing Pipeline

**Decision: Use existing validation → diagnostics → LLM pattern**

The existing flow is elegant: validators produce `EnrichedIssue[]` → stored in `unified_diagnostics` → exposed via MCP tools → LLM sees and fixes.

**Required Wiring (Gap Analysis):**

| Gap | Fix |
|-----|-----|
| MCP tool source enum missing "wcag" | Add to `status_diagnostics` tool definition |
| Category enum missing "accessibility" | Add to `status_all_diagnostics` tool definition |
| WCAG results not pushed to hub | Add `pushWcagResultsToHub()` in hub-storage |

**No new CLI command needed** - `devac validate --full` already runs WCAG validator.

---

### Decision 4: Platform Support Strategy

**Web:** Fully supported via existing pipeline + runtime enhancements

**React Native:** Phased approach:
1. **Phase 1:** Static analysis (eslint-plugin-react-native-a11y, AST rules)
2. **Phase 2:** Jest matchers (react-native-accessibility-engine)
3. **Research Phase:** iOS/Android native accessibility testing
   - iOS: XCTest accessibility APIs, Accessibility Inspector
   - Android: Espresso AccessibilityChecks, TalkBack testing
   - Tools: Maestro for cross-platform

---

## Integrated Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ACCESSIBILITY INTELLIGENCE LAYER                          │
│                    (Integrated with Existing Pipeline)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      DETECTION SOURCES                                 │  │
│  │                                                                        │  │
│  │  Layer 0: BUILD-TIME (SAT/SMT - Research)                              │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ • Color contrast constraint solving (Z3)                        │  │  │
│  │  │ • ARIA state machine verification                               │  │  │
│  │  │ • Touch target constraint satisfaction                          │  │  │
│  │  │ → Proves correctness, suggests valid alternatives               │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                              │                                         │  │
│  │  Layer 1: STATIC ANALYSIS (Existing + Enhanced)                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ • WCAG Validator (existing 5 rules + new rules)                 │  │  │
│  │  │ • ESLint jsx-a11y (web)                                         │  │  │
│  │  │ • ESLint react-native-a11y (RN)                                 │  │  │
│  │  │ → Fast, runs in CI/pre-commit                                   │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                              │                                         │  │
│  │  Layer 2: RUNTIME ANALYSIS (New)                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Primary: Storybook Play Functions                               │  │  │
│  │  │ • axe-core after render + after each interaction                │  │  │
│  │  │ • Keyboard navigation testing (Tab, Enter, Escape)              │  │  │
│  │  │ • Focus trap validation (modals)                                │  │  │
│  │  │ • State transition verification                                 │  │  │
│  │  │                                                                 │  │  │
│  │  │ Secondary: Direct Playwright                                    │  │  │
│  │  │ • Full page audits                                              │  │  │
│  │  │ • Production URL checks                                         │  │  │
│  │  │                                                                 │  │  │
│  │  │ Optional: OTEL Tracing                                          │  │  │
│  │  │ • Capture DOM mutations, focus changes, ARIA updates            │  │  │
│  │  │ • Temporal pattern analysis for LLM                             │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                              │                                         │  │
│  │  Layer 3: SEMANTIC ANALYSIS (LLM-Powered)                              │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ • Alt text quality evaluation (with Vision)                     │  │  │
│  │  │ • Heading hierarchy appropriateness                             │  │  │
│  │  │ • Error message helpfulness                                     │  │  │
│  │  │ • OTEL trace analysis for temporal issues                       │  │  │
│  │  │ → Configurable confidence threshold                             │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                          │
│                                   ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                   EXISTING VALIDATION PIPELINE                         │  │
│  │                                                                        │  │
│  │  ValidationCoordinator.validate()                                      │  │
│  │       │                                                                │  │
│  │       ├── TypecheckValidator                                           │  │
│  │       ├── LintValidator                                                │  │
│  │       ├── TestValidator                                                │  │
│  │       ├── CoverageValidator                                            │  │
│  │       └── WcagValidator ← Extended with runtime + semantic results     │  │
│  │                │                                                       │  │
│  │                ▼                                                       │  │
│  │       EnrichedIssue[] (A11yViolation effects)                          │  │
│  │                                                                        │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                          │
│                                   ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         STORAGE                                        │  │
│  │                                                                        │  │
│  │  effects.parquet                unified_diagnostics (Hub)              │  │
│  │  ┌─────────────────────┐       ┌─────────────────────────────┐        │  │
│  │  │ A11yViolation       │       │ source: "wcag"              │        │  │
│  │  │ • rule_id           │──────▶│ category: "accessibility"   │        │  │
│  │  │ • wcag_criterion    │       │ severity, file, line        │        │  │
│  │  │ • detection_source  │       │ message, code_context       │        │  │
│  │  │ • confidence        │       └─────────────────────────────┘        │  │
│  │  └─────────────────────┘                                               │  │
│  │                                                                        │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                          │
│                                   ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    MCP TOOLS (Existing + Extended)                     │  │
│  │                                                                        │  │
│  │  status_diagnostics         status_all_diagnostics                     │  │
│  │  • source: [..., "wcag"]    • category: [..., "accessibility"]         │  │
│  │                                                                        │  │
│  │  get_a11y_fix_context (New - Adaptive Retrieval)                       │  │
│  │  • Selects retrieval strategy based on violation type                  │  │
│  │  • Returns component code + strategy-specific context                  │  │
│  │                                                                        │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                          │
│                                   ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      LLM CONSUMPTION                                   │  │
│  │                                                                        │  │
│  │  diagnostic detected ──▶ LLM queries context ──▶ LLM proposes fix      │  │
│  │                                                                        │  │
│  │  Adaptive Retrieval Strategy:                                          │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Violation Type        │ Context Retrieved                       │  │  │
│  │  │───────────────────────┼─────────────────────────────────────────│  │  │
│  │  │ color-contrast        │ Theme tokens, design system colors      │  │  │
│  │  │ button-name           │ Component source, props, usage          │  │  │
│  │  │ label                 │ Form fields, validation logic           │  │  │
│  │  │ heading-order         │ Page structure, parent components       │  │  │
│  │  │ focus-trap            │ OTEL trace (if available)               │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Additional Concepts (Integrated)

### Storybook Play Functions

**Role:** Primary runtime detection method

**Integration:**
- Runs axe-core after story renders
- Runs axe-core after each play function step (captures state changes)
- Tests keyboard navigation that axe-core can't detect
- Results flow through same validation pipeline

**Example Test Pattern:**
```typescript
export const LoginForm: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    // Run axe after initial render
    await runAxeCheck(canvasElement, "initial-render");

    await step("Tab through form fields", async () => {
      await userEvent.tab();
      expect(canvas.getByLabelText("Email")).toHaveFocus();
      await userEvent.tab();
      expect(canvas.getByLabelText("Password")).toHaveFocus();
    });

    await step("Submit with Enter key", async () => {
      await userEvent.keyboard("{Enter}");
      // Run axe after error state
      await runAxeCheck(canvasElement, "error-state");
    });
  },
};
```

---

### OTEL Tracing Effects

**Role:** Optional enhancement for temporal analysis

**Integration:**
- Instrument tests to capture DOM mutations, focus changes, ARIA updates
- Store traces alongside effects in Parquet
- LLM analyzes traces for patterns:
  - "Focus moved but no announcement"
  - "Long delay between validation and error display"
  - "State changed but ARIA not updated"

**When Useful:**
- Complex interactions with timing requirements
- Focus management debugging
- Debugging why screen reader announcements fail

---

### SAT/SMT Solvers

**Role:** Build-time constraint verification (Research Phase)

**Use Cases:**
| Use Case | Value |
|----------|-------|
| Color contrast | Prove ALL theme combinations valid |
| Touch targets | Verify layout constraints |
| ARIA state machines | Prove no invalid state transitions |

**Integration Point:** Before static analysis (Layer 0)

**Research Questions:**
- How to encode WCAG rules as SMT constraints?
- Performance impact on build times?
- Which rules benefit most from formal verification?

---

## Revised Phase Plan

### Phase 1: Pipeline Integration & Static Enhancement

**Goal:** Wire accessibility into existing validation pipeline, enhance static detection

**Deliverables:**
1. **MCP Tool Updates:**
   - Add `"wcag"` to `status_diagnostics` source enum
   - Add `"accessibility"` to `status_all_diagnostics` category enum

2. **Hub Storage Wiring:**
   - `pushWcagResultsToHub()` function
   - Map WCAG results to `unified_diagnostics`

3. **Enhanced Static Rules:**
   - Add more WCAG rules to existing WcagValidator
   - Integrate eslint-plugin-jsx-a11y results
   - Add platform field (web | react-native)

4. **A11yViolation Effect Schema:**
   - Add to effects.ts
   - Extend Parquet schema

**Key Files:**
- `packages/devac-mcp/src/tools/index.ts` - Add enums
- `packages/devac-core/src/hub/hub-storage.ts` - Add push function
- `packages/devac-core/src/types/effects.ts` - A11yViolation schema
- `packages/devac-core/src/rules/wcag-rules.ts` - Add rules

---

### Phase 2: Runtime Detection (Storybook + Playwright)

**Goal:** Add rendered DOM analysis via Storybook Play Functions

**Deliverables:**
1. **Storybook Integration:**
   - axe-core addon configuration for WCAG 2.1 AA
   - Play function patterns for a11y testing
   - Integration with DevAC validation pipeline

2. **AxeScanner in browser-core:**
   - `AxeScanner` class wrapping axe-core
   - Violation → A11yViolation effect mapper

3. **Keyboard Navigation Testing:**
   - Tab order verification
   - Focus trap testing utilities
   - State transition testing

4. **OTEL Tracing (Optional):**
   - Instrumentation for focus/DOM changes
   - Trace storage in effects.parquet
   - Basic trace analysis

**Key Files:**
- `packages/browser-core/src/reader/accessibility/axe-scanner.ts`
- `packages/browser-core/src/reader/accessibility/play-function-utils.ts`
- Storybook configuration files

---

### Phase 3: LLM Semantic Layer

**Goal:** Address Tier 2 issues with LLM analysis

**Deliverables:**
1. **Adaptive Retrieval MCP Tool:**
   - `get_a11y_fix_context` with strategy selection
   - Strategy registry (violation type → context)

2. **Vision Integration:**
   - Screenshot capture for components with images
   - Claude Vision for alt text quality evaluation

3. **Confidence Scoring:**
   - Configurable threshold system
   - Store confidence in A11yViolation effects

4. **Skills Reference Docs:**
   - WCAG 2.1 AA quick reference
   - ARIA patterns guide
   - React Native accessibility props

5. **OTEL Trace Analysis:**
   - LLM prompts for temporal pattern detection
   - "Focus moved but no announcement" detection

---

### Phase 4: React Native Deep Dive

**Goal:** Full React Native accessibility support

**Deliverables:**
1. **Static Analysis:**
   - eslint-plugin-react-native-a11y integration
   - RN-specific WCAG rules

2. **Jest Matchers:**
   - react-native-accessibility-engine integration
   - Component-level a11y testing

3. **Research: Native Platform Testing**
   - iOS: XCTest accessibility APIs, Accessibility Inspector integration
   - Android: Espresso AccessibilityChecks
   - Cross-platform: Maestro exploration

---

### Phase 5: Optimization & Research

**Goal:** Track effectiveness, explore formal verification

**Deliverables:**
1. **Metrics & Dashboards:**
   - Fix success rate tracking
   - Strategy effectiveness analysis
   - WCAG coverage reporting

2. **SAT/SMT Research:**
   - Z3 integration spike
   - Color contrast constraint encoding
   - ARIA state machine verification
   - Evaluate build-time performance impact

3. **Feedback Loop:**
   - Learn from successful fixes
   - Optimize strategy selection

---

## WCAG Coverage Matrix

| WCAG Criterion | Static | Runtime | LLM | SAT | Combined |
|----------------|--------|---------|-----|-----|----------|
| 1.1.1 Non-text (presence) | ✅ | ✅ axe | | | ✅ |
| 1.1.1 Non-text (quality) | | | ✅ Vision | | ✅ |
| 1.3.1 Info/Relationships | ✅ | ✅ axe | ✅ | | ✅ |
| 1.4.3 Contrast | | ✅ axe | | ✅ Z3 | ✅ |
| 2.1.1 Keyboard | ✅ | ✅ Play | | | ✅ |
| 2.4.3 Focus Order | | ✅ Play | | ✅ | ✅ |
| 2.4.6 Headings/Labels | ✅ | ✅ axe | ✅ | | ✅ |
| 3.3.1 Error Identification | ✅ | ✅ Play | ✅ | | ✅ |
| 4.1.2 Name, Role, Value | ✅ | ✅ axe | | ✅ | ✅ |

**Coverage Estimates:**
- Static only: ~35%
- + Runtime (Storybook + axe): ~60%
- + LLM Semantic: ~85%
- + SAT/SMT: Additional formal guarantees

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Detection coverage | >80% automatable WCAG | Coverage matrix |
| False positive rate | <5% deterministic | Manual review |
| Fix success rate | >60% LLM proposals | PR merge tracking |
| Time to detection | <5min static | CI timing |
| Pipeline integration | 100% via existing validators | No parallel systems |

---

## Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Storage** | Unified effects.parquet | Parquet handles NULLs well, no JOINs |
| **Runtime Detection** | Hybrid: Play Functions + Playwright | Play Functions test interactions |
| **LLM Integration** | Existing validation pipeline | Use elegant watch → diagnostic → fix pattern |
| **Platform** | Web Phase 1, RN Phase 4 + research | Healthcare needs RN native testing |
| **Vision** | Include for alt text | Image analysis improves quality eval |
| **Confidence** | Configurable threshold | Teams set based on risk |
| **SAT/SMT** | Research in Phase 5 | High potential, needs spike |
| **OTEL Tracing** | Optional in Phase 2-3 | Valuable for complex interactions |

---

## Next Steps

1. ✅ Review and approve global plan
2. Create Phase 1 implementation plan with detailed file changes
3. Begin with MCP tool enum updates (smallest change, immediate value)
