# A11y Detection & Fixing Vision

> Created: 2026-02-06
> Status: Research / Grounding Document
> Scope: Automated accessibility issue detection and fixing for React and React Native via DevAC

---

## 1. Glossary of Terms

| Term | Definition |
|------|-----------|
| **WCAG** | Web Content Accessibility Guidelines - W3C standard defining accessibility requirements. Levels: A (minimum), AA (standard target), AAA (enhanced). Current version: 2.1, with 2.2 released 2023. |
| **WAI-ARIA** | Web Accessibility Initiative - Accessible Rich Internet Applications. A W3C specification that defines HTML attributes (roles, states, properties) to make dynamic web content accessible to assistive technologies. |
| **APG** | ARIA Authoring Practices Guide - W3C guide describing how to build accessible web components using WAI-ARIA. Defines expected keyboard interactions, ARIA attributes, and focus management per component pattern (dialog, menu, tabs, etc.). |
| **ACT Rules** | Accessibility Conformance Testing Rules - W3C standard format for writing machine-readable accessibility test rules. Ensures consistent interpretation of WCAG across tools. |
| **axe-core** | Open-source accessibility testing engine by Deque Systems. Scans rendered DOM for WCAG violations with zero false positives policy. Powers Lighthouse, Storybook addon, and many other tools. |
| **Storybook** | UI component development environment. Renders components in isolation with "stories" (predefined states). Used for visual testing, documentation, and accessibility scanning. |
| **CSF3** | Component Story Format version 3 - Storybook's file format for defining stories. Supports metadata, play functions, and parameters including a11y configuration. |
| **Play functions** | Storybook feature allowing stories to simulate user interactions (clicks, typing, keyboard nav) after rendering. Enables behavioral testing within stories. |
| **DevAC** | Our code analysis tool using DuckDB + Parquet for code graph storage. Includes parsers, validators, and a hub for cross-repo diagnostics. |
| **Zag.js** | Component state machine library (zagjs.com). Provides 47 framework-agnostic state machines for UI components (dialog, menu, tabs, etc.) with built-in accessibility patterns. |
| **State machine** | A computational model where a system exists in one of a finite number of states, transitioning between states in response to events. In zag, each UI component is modeled as a state machine. |
| **Connect function** | In zag, the function that maps machine state to DOM/ARIA attributes. E.g., when dialog is "open", connect returns `aria-modal=true` on the content element. |
| **Assistive technology (AT)** | Software or hardware that helps people with disabilities use computers. Includes screen readers (VoiceOver, TalkBack, NVDA), switch devices, braille displays. |
| **VoiceOver** | Apple's built-in screen reader for iOS and macOS. Reads UI elements aloud and provides gesture-based navigation. |
| **TalkBack** | Google's built-in screen reader for Android. Reads UI elements and provides gesture/swipe navigation. |
| **NVDA** | NonVisual Desktop Access - free open-source screen reader for Windows. |
| **Playwright** | Browser automation framework by Microsoft. Supports accessibility tree snapshots via `toMatchAriaSnapshot()`. |
| **ARIA snapshot** | Playwright feature that captures the browser's accessibility tree as YAML for assertion. Tests what screen readers actually see, not just DOM structure. |
| **Guidepup** | Open-source tool that programmatically drives real screen readers (NVDA, VoiceOver) for automated testing. |
| **Maestro** | Cross-platform mobile testing framework that operates at the accessibility layer - the same infrastructure VoiceOver and TalkBack use. Uses YAML-based test flows. |
| **XCTest / XCUITest** | Apple's native testing framework for iOS. XCUITest is the UI testing variant. Includes `performAccessibilityAudit()` (Xcode 15+) for automated WCAG checks. |
| **Espresso** | Google's native UI testing framework for Android. Supports `AccessibilityChecks.enable()` to automatically validate accessibility on every interaction. |
| **ATF** | Google's Accessibility Test Framework for Android. Integrated with Espresso, checks touch target size, color contrast, content labels automatically. |
| **Detox** | React Native E2E testing framework by Wix. Gray-box testing that interacts with JS and native layers. |
| **Appium** | Cross-platform mobile automation framework. Supports accessibility ID-based element location for both iOS and Android. |
| **a11y** | Numeronym for "accessibility" (a + 11 letters + y). |
| **Unified diagnostics** | DevAC's central table storing all detected issues (TypeScript errors, lint violations, accessibility issues, CI failures) in a single queryable format. |
| **Hub** | DevAC's workspace-level DuckDB database that federates data from all analyzed repositories. |
| **MCP** | Model Context Protocol - Anthropic's protocol for AI assistants to use external tools. DevAC exposes its code graph via MCP for LLM consumption. |
| **Accessibility tree** | The semantic representation of UI elements that assistive technologies use. Browsers and mobile platforms maintain this tree separately from the visual DOM/view hierarchy. |
| **Focus trap** | A pattern where keyboard focus is constrained within a container (e.g., a modal dialog). Tab/Shift+Tab cycle within the trap, preventing focus from escaping to background content. |
| **Roving tabindex** | A keyboard navigation pattern where only one item in a group is tabbable (tabindex=0), and arrow keys move focus between items (other items have tabindex=-1). Used in tab lists, menus, radio groups. |
| **Live region** | An area of the page/screen that announces content changes to screen readers. Configured via `aria-live` (web) or `accessibilityLiveRegion` (Android). |
| **Apple HIG** | Human Interface Guidelines. Apple's design and accessibility standards for iOS, macOS, watchOS, tvOS. Covers platform-specific criteria beyond WCAG. |
| **Accessibility Nutrition Labels** | Apple's App Store feature (WWDC25) declaring which accessibility features an app supports. 9 categories with formal evaluation criteria. |
| **Dynamic Type** | Apple's system-wide text scaling feature. Supports standard sizes (xSmall-xxxLarge) and accessibility sizes (AX1-AX5, up to 300%+). |
| **performAccessibilityAudit()** | XCUITest API (Xcode 15+, iOS 17+) that runs automated accessibility audits with 7 audit types. Fails tests on violations. |
| **xcresult** | Xcode's test result bundle format. Contains test results, screenshots, and video recordings. |

---

## 2. The Goal & Why It Matters

**What we want:** Automated detection of WCAG 2.1 AA accessibility issues in React and React Native, with LLM-consumable fix suggestions delivered through DevAC's MCP server.

**Why it matters:**

- **Shift-left accessibility.** Move from "manual audit at the end of a sprint" to "continuous automated detection during development." Accessibility bugs caught at compile time cost a fraction of bugs found in production audits.
- **Reduce manual audit scope.** Expert auditor time is scarce and expensive. Traditional rule-based tools handle 55-65% of detectable issues. With LLM-augmented evaluation, coverage rises to 70-90%, reducing the genuinely human-required portion to 5-10% - user testing with people with disabilities, complex cognitive UX, and novel interaction patterns (see Section 13).
- **LLM-assisted fixing.** DevAC's MCP integration means AI coding agents can query diagnostics (`status_all_diagnostics`) and receive structured, actionable fix suggestions. This is a unique differentiator - no existing tool provides machine-readable a11y diagnostics optimized for LLM consumption.
- **CI enforcement.** Accessibility regressions are caught in pull requests, not after deployment. Violations appear alongside TypeScript errors and lint warnings in DevAC's unified diagnostics.

---

## 3. The Components & Their Potential

### Web Testing Components

| Component | Min (Today) | Max (Fully Leveraged) | Key Contribution |
|-----------|-------------|----------------------|------------------|
| **axe-core** (runtime DOM scanning) | 8 criteria fully | 13 criteria (8 full + 5 partial) | Color contrast, missing attributes, ARIA validation. Zero false positives. Industry standard. |
| **DevAC WCAG validator** (static AST analysis) | 5 criteria (current 13 rules) | 10 criteria (5 full + 5 partial) | Compile-time detection. Catches issues before code runs. Works on JSX/TSX. |
| **Zag a11y contracts** (behavioral specs) | 0 (not built) | 10 criteria (keyboard, focus, ARIA state) | Unique: machine-readable specs for what ARIA + keyboard + focus each component type requires per state. |
| **Zag E2E models** (test templates) | 0 (not adapted) | 15-19 criteria (behavioral) | 32 proven models, 200+ assertions. Keyboard nav, focus management, state transitions. |
| **Storybook play functions** (interaction vehicle) | 0 (reference not built) | 19 criteria (all behavioral) | Exercises components through states, asserts a11y at each state. Runs in existing scan-storybook. |
| **Playwright ARIA snapshots** | 0 | 5-8 criteria | Tests the browser's accessibility tree directly. More authoritative than DOM inspection. |
| **Guidepup** (screen reader automation) | 0 | +15-20% coverage | Drives real NVDA/VoiceOver. Verifies announcements, reading order. Catches what DOM inspection misses. |
| **LLM analysis** (semantic understanding) | 0 | 12-15 criteria (Tier A: semantic + Tier B: runtime-assisted) | Alt text quality, heading relevance, link purpose, navigation consistency, error message quality, sensory characteristics, color-only information, focus order (with automation). Evidence: 87.18% detection on previously manual-only criteria (Lopez-Gil 2024). See Section 13. |

### React Native Testing Components

| Component | Min (Today) | Max (Fully Leveraged) | Key Contribution |
|-----------|-------------|----------------------|------------------|
| **DevAC WCAG validator** (static AST) | 5 rules (current) | 25+ rules | Static analysis of accessibilityRole, accessibilityState, accessibilityLabel in JSX. Works on RN components. |
| **eslint-plugin-react-native-a11y** | Varies by project | 15+ rules | Compile-time catching of missing labels, roles, hints. Zero cost to add. |
| **React Native Testing Library** | 0 | Component-level a11y | Accessibility queries: `getByA11yRole()`, `getByA11yLabelText()`, `getByA11yHintText()`. Verifies accessibility tree at component level. |
| **Maestro** (cross-platform E2E) | 0 | Cross-platform behavioral | Operates at the accessibility layer (same as VoiceOver/TalkBack). Single YAML test suite for iOS + Android. CI-ready via Maestro Cloud + GitHub Actions. |
| **XCTest + performAccessibilityAudit()** (iOS) | PoC exists | iOS WCAG audit | Xcode 15+ built-in audit: contrast, touch targets, Dynamic Type, element descriptions, traits. **PROVEN** - working PoC in ~/ws/app scanning RN Storybook stories. |
| **Apple HIG audit** (via performAccessibilityAudit) | PoC exists | iOS HIG + WCAG audit | 7 audit types covering Apple-specific criteria beyond WCAG: Dynamic Type (300%+), 44pt touch targets, system preference response. **PROVEN** - working PoC in ~/ws/app. |
| **Espresso + ATF** (Android) | 0 | Android WCAG audit | Google's ATF: touch target size (48dp), color contrast, content labels. Runs automatically on every Espresso interaction. Works with RN views. |
| **axe DevTools Mobile** (Deque) | 0 | Comprehensive mobile scanning | Full RN support (2025). WCAG 2.1/2.2 compliance, touch target spacing, contrast with ML enhancement. Available as Appium plugin. |
| **Simulator keyboard testing** | 0 | Keyboard nav verification | iOS: Full Keyboard Access in simulator. Android: D-pad + Tab navigation in emulator. Verifies focus order and keyboard accessibility. |

---

## 4. The Reality Check: Industry Data

### What the Data Says

**Deque 2022 study** (300,000 issues across 13,000 pages):
> "Automated tools identified 57% of accessibility issues by volume."
> — [Deque, Automated Testing Study](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/)

This is the most-cited number, but it requires nuance:

- **57% by volume** means automated tools catch 57% of individual issue instances. Many of these are repeated patterns (e.g., 100 images all missing alt text = 100 issues, one rule).
- **By WCAG criteria count:** ~13-15 of ~50 criteria are fully automatable (~30%). Another ~20 can be partially checked.
- **70% of criteria** require some human judgment - the tool can flag a potential issue but cannot confirm it.
- **The "last mile" (~20-35%):** Meaningful alt text, logical reading order, cognitive accessibility, and context-dependent decisions were beyond traditional rule-based automation entirely. However, LLM-augmented evaluation challenges this ceiling - see Section 13.

**WebAIM Million (2025):** 95.9% of home pages had detectable WCAG failures. The most common remain: missing alt text, low contrast, empty links, missing form labels, empty buttons, missing document language. These are all automatable. See [WebAIM Million Report](https://webaim.org/projects/million/).

### Our Honest Ceiling (Web)

| Layer | Coverage | Cumulative |
|-------|----------|------------|
| Static analysis (DevAC + ESLint) | 5-10% | 5-10% |
| Runtime scanning (axe-core) | 20-25% | 25-35% |
| Behavioral testing (zag + play functions) | 15-20% | 40-55% |
| ARIA tree + screen reader testing | 10-15% | 50-65% |
| LLM semantic analysis (Tier A) | 12-15% | 62-80% |
| LLM + browser automation (Tier B) | 8-12% | 70-90% |
| **Human review (genuinely needed, Tier C)** | 5-10% | **75-100%** |

### Our Honest Ceiling (React Native)

| Layer | Coverage | Cumulative |
|-------|----------|------------|
| Static analysis (DevAC + ESLint) | 5-10% | 5-10% |
| Component testing (RN Testing Library) | 10-15% | 15-25% |
| Apple HIG platform audits (performAccessibilityAudit) | 5-10% | 20-35% |
| WCAG platform audits (XCTest audit + Espresso ATF) | 10-15% | 30-45% |
| Cross-platform E2E (Maestro) | 10-15% | 40-55% |
| axe DevTools Mobile scanning | 5-10% | 45-60% |
| Simulator keyboard testing | 5% | 50-65% |
| LLM semantic analysis (Tier A) | 10-12% | 60-75% |
| LLM + platform automation (Tier B) | 5-10% | 65-85% |
| **Human review + real AT testing (genuinely needed, Tier C)** | 5-10% | **70-100%** |

### Bottom Line

**55-65% fully automated with traditional rule-based tools is realistic for both web AND React Native.** This is the number the industry quotes because it was measured with traditional tools. With LLM-augmented evaluation (Tier A semantic analysis + Tier B browser/platform automation), the ceiling rises to **70-90%**. The genuinely human-required portion - user testing with people with disabilities, complex cognitive UX, novel interaction patterns, legal compliance sign-off - is **5-10%**. The industry's "25-35% requires humans" figure is a 2022 answer to a 2026 question. See Section 13 for the full evidence and three-tier decomposition.

---

## 5. Challenge: Is Zag the Right Foundation?

### Arguments For

1. **47 machines with ARIA + keyboard + focus in executable code.** This is not documentation - it is running code that produces correct ARIA attributes for each component state.
2. **Only source providing machine-readable behavioral a11y specs.** WAI-ARIA APG describes what should happen in prose. Zag encodes it in TypeScript.
3. **32 E2E models with 200+ behavioral assertions.** These are proven test patterns covering keyboard navigation, focus management, and ARIA state transitions. 70% are compatible with Storybook adaptation.
4. **Connect function analysis:** 28% static string literals (trivial extraction), 32% boolean from state (partial extraction), 16% conditional logic, 12% prop() calls, 8% context/computed, 4% ID references.
5. **Overall extraction feasibility:** ~40-45% of contracts auto-extractable from connect files. 90% of keyboard handlers extractable. The rest requires manual specification.

### Arguments Against / Supplement With

1. **WAI-ARIA APG is more authoritative.** It is the W3C standard. Zag implements APG patterns but may diverge or simplify in places. Contracts should be validated against APG.
2. **ACT Rules is the standard format** for machine-readable test rules. Our contract schema should align with ACT format where possible for interoperability.
3. **Zag is web-only.** React Native has its own accessibility model (`accessibilityRole`, `accessibilityState`, `accessibilityLabel`) that does not map 1:1 to ARIA. RN testing requires platform-native tools (Maestro, XCTest, Espresso), not zag-derived contracts.
4. **Maintenance burden.** Zag is a third-party library. If they refactor connect functions, our extraction pipeline breaks. Contracts should be our own artifact, informed by zag but not dependent on it.

### Verdict

**Zag is the best available source of machine-readable behavioral a11y specs for web.** No other project encodes component accessibility patterns in executable, extractable code. WAI-ARIA APG validates correctness. ACT Rules format guides contract schema. React Native uses platform-native tools, not zag.

Use zag to bootstrap contracts, validate against APG, own the result independently.

---

## 6. The Layered Testing Strategy

### Web Layers

| Layer | Tools | What It Catches | When It Runs |
|-------|-------|-----------------|--------------|
| 1. Compile-time | ESLint (jsx-a11y), DevAC WCAG validator | Missing alt, labels, invalid ARIA | On save / CI |
| 2. Component scan | axe-core via scan-storybook | Contrast, ARIA errors, missing names | CI / on demand |
| 3. Behavioral test | Zag contracts + play functions + behavioral assertions | Keyboard nav, focus traps, state-dependent ARIA | CI via scan-storybook |
| 4. ARIA tree | Playwright `toMatchAriaSnapshot()` | What screen readers actually see | CI |
| 5. Screen reader | Guidepup (NVDA/VoiceOver automation) | Announcements, reading order | Nightly CI |
| 6. LLM review | Semantic analysis via MCP | Alt text quality, heading relevance, link purpose | On demand / PR review |
| 7. Human audit (Tier C) | Expert review + disability user testing | Complex cognitive a11y, novel interaction patterns, lived experience testing, legal sign-off | Periodic |

**Key insight:** Each layer catches things the previous layers miss. axe-core does not test keyboard navigation. Play functions do not verify what screen readers announce. LLMs cannot judge color contrast programmatically. The value is in the stack, not any single tool.

### React Native Layers

| Layer | Tools | What It Catches | When It Runs |
|-------|-------|-----------------|--------------|
| 1. Compile-time | ESLint (react-native-a11y), DevAC WCAG validator | Missing labels, roles, hints | On save / CI |
| 2. Component test | React Native Testing Library (a11y queries) | Component-level accessibility tree | CI |
| 2.5. Apple HIG audit | XCTest `performAccessibilityAudit()` via Storybook | Dynamic Type, 44pt touch targets, element descriptions, traits, contrast. **PROVEN** via PoC in ~/ws/app | CI (iOS) |
| 3. Platform audit iOS | XCTest + `performAccessibilityAudit()` | Contrast, touch targets, Dynamic Type, descriptions, traits | CI (iOS) |
| 4. Platform audit Android | Espresso + ATF (`AccessibilityChecks.enable()`) | Touch targets (48dp), contrast, content labels | CI (Android) |
| 5. Cross-platform E2E | Maestro (operates at accessibility layer) | Functional a11y, labels, interaction via same layer as VoiceOver/TalkBack | CI |
| 6. Automated scanning | axe DevTools Mobile | WCAG 2.1/2.2, touch spacing, contrast (ML) | CI / on demand |
| 7. Simulator keyboard | iOS Full Keyboard Access, Android D-pad | Focus order, keyboard navigation, traps | CI / manual |
| 8. Human + real AT (Tier C) | VoiceOver/TalkBack manual testing, disability user testing | Gesture nav, complex cognitive a11y, novel interactions, lived experience | Periodic |

---

## 7. What Each Phase Achieves

### Phase 0: Current State (~25-35% web coverage)

What exists today:
- **axe-core scanning** via `browser scan-storybook` (operational)
- **DevAC WCAG validator** with 13 static analysis rules
- **Hub integration** - violations flow into unified diagnostics
- **MCP exposure** - AI agents can query diagnostics

What is missing:
- No behavioral testing (keyboard, focus, state-dependent ARIA)
- No RN-specific tools integrated
- No play functions exercising component states
- This is where most teams stop. axe-core alone catches ~25-35% of criteria.

### Phase 1: A11y Contracts (Foundation, enables phases 2-3)

**Goal:** Structured a11y contracts for 10 priority component types.

**What gets built:**
- Contract schema defining expected ARIA attributes, keyboard handlers, and focus behavior per component state
- Semi-automated extraction from zag connect files (~40-45% auto, rest manual)
- Keyboard handler specs (90% extractable from zag)
- Validation against WAI-ARIA APG for correctness

**Coverage impact:** +~5% detection on its own. The real value is enabling phases 2 and 3.

**Priority components (from zag analysis):**

| Component | Complexity | E2E Model Lines | Key A11y Patterns |
|-----------|-----------|-----------------|-------------------|
| Dialog | High | 57 | Focus trap, aria-modal, return focus |
| Menu | High | 112 | Roving tabindex, aria-activedescendant |
| Tabs | Medium | 125 | Roving tabindex, aria-selected |
| Combobox | Very High | 131 | Listbox pattern, aria-expanded, aria-activedescendant |
| Accordion | Medium | 46 | aria-expanded, heading structure |
| Tooltip | Low | 28 | aria-describedby, hover/focus trigger |
| Switch | Low | 18 | aria-checked, keyboard toggle |
| Checkbox | Low | 22 | aria-checked, mixed state |
| Radio Group | Medium | 45 | Roving tabindex, aria-checked |
| Select | High | 95 | Listbox pattern, type-ahead |

### Phase 2: Behavioral Reference Storybook (+10% web -> ~40-50%)

**Goal:** Zag-based reference components exercised through all states via play functions adapted from E2E models.

**What gets built:**
- Reference implementations of the 10 priority components using zag
- Play functions adapted from zag's 32 E2E test models (70% compatible)
- Each story exercises: default state, hover, focus, keyboard interaction, all ARIA states
- axe-core scans post-interaction DOM (catches state-dependent violations)

**Coverage impact:** +10%. This is the first time we detect:
- Keyboard navigation failures
- Focus trap issues (focus escaping modal dialogs)
- Missing state-dependent ARIA (e.g., `aria-expanded` not toggling)
- Broken roving tabindex

**Why this matters:** axe-core scanning a static render catches missing alt text. Scanning AFTER a play function opens a dialog catches missing `aria-modal`, broken focus trap, and focus not returning on close. Same tool, much higher coverage.

### Phase 3: Behavioral Assertions in scan-storybook (+5-10% web -> ~45-55%)

**Goal:** Contract-based assertions run after axe scan, verifying behavioral a11y properties.

**What gets built:**
- scan-storybook extended to read a11y contracts for components
- Post-axe assertions check: focus location, ARIA state values, keyboard handler presence
- Focus location verification (is focus inside the trap? did it return on close?)
- Results flow into DevAC unified diagnostics with fix suggestions

**Coverage impact:** +5-10%. This is the zag-specific value add above axe-core alone.

### Phase 4: RN Testing Stack (+20-30% RN -> ~45-60% for RN)

**Goal:** Bring React Native to parity with web automated coverage using platform-native tools. Starting point: the **proven XCTest + Storybook pipeline** in ~/ws/app (see Section 12).

**What gets built:**

**4a. Extend proven XCTest PoC (starting point - already working):**
- Extend existing PoC to iterate ALL Storybook stories (currently hardcoded to single story)
- Parse xcresult bundles to extract structured violation data
- Push results to DevAC hub unified diagnostics (source: "xctest-a11y")
- Add Apple HIG-specific audit types beyond WCAG coverage

**4b. Platform tooling:**
- **eslint-plugin-react-native-a11y** integrated into CI
- **DevAC WCAG validator** extended with RN-specific rules (all 10 priority components, not just current 5)
- **Espresso + ATF** integration in Android CI pipeline (following same pattern as iOS XCTest PoC)
- **Maestro** cross-platform E2E flows covering a11y interactions
- **Simulator keyboard navigation** tests (iOS Full Keyboard Access, Android D-pad)

**Coverage impact:** +20-30% for RN. Platform-native audits (XCTest, ATF) are arguably MORE comprehensive than web-only axe-core for certain checks like touch targets and Dynamic Type. The proven PoC de-risks this phase significantly - the hardest part (XCTest + RN + Storybook integration) is already working.

### Phase 5+: Advanced (+15-25% web, +10-20% RN -> ~70-90%)

**What gets built:**
- **Playwright ARIA snapshots** for web component testing
- **Guidepup** screen reader automation (NVDA/VoiceOver) in CI
- **axe DevTools Mobile** for comprehensive RN scanning
- Contract schema aligned with ACT Rules format

**LLM semantic analysis (Tier A)** - the largest new coverage source:
- Alt text quality evaluation: screenshot + context → multimodal LLM judges whether alt text is meaningful, not just present (~85% accuracy for simple images, demonstrated by Lopez-Gil 2024)
- Heading structure assessment: evaluate hierarchy, relevance, descriptiveness via NLP (8/10 rating)
- Link purpose from context: 87.18% accuracy demonstrated (Lopez-Gil 2024) on WCAG 2.4.4
- Error message helpfulness: assess specificity, actionability, user-friendliness (7/10 rating)
- Sensory characteristics detection: text analysis + multimodal cross-reference (7/10 rating)
- Color as sole information carrier: multimodal screenshot analysis (7/10 rating)
- Navigation consistency: cross-page pattern matching given multi-page input (7/10 rating)
- Plain language / readability: text-level cognitive accessibility evaluation (6/10 rating)

**LLM + browser automation (Tier B)** - requires DevAC browser-core runtime data:
- Focus order evaluation: Playwright captures focus trace → LLM evaluates logical order (5/10 without automation, higher with it)
- Keyboard trap detection: automated Tab sequence → LLM identifies escape failures
- Dynamic ARIA state verification: before/after DOM snapshots → LLM verifies correct state transitions
- Live region announcement verification: accessibility tree diffs → LLM evaluates announcement completeness
- Cross-page consistency: multi-page crawl → LLM identifies navigation/labeling inconsistencies

**Coverage ceiling:** ~70-90% with LLM augmentation. The genuinely human-required portion (Tier C) is 5-10% - user testing with people with disabilities, complex cognitive UX evaluation, novel interaction patterns, and legal compliance sign-off. See Section 13 for the full evidence.

---

## 8. React Native: Revised Assessment

### Previous Assessment Was Too Pessimistic

Early analysis focused on the gap between ARIA and RN accessibility APIs, concluding RN was limited to static prop validation for ~5 components. This missed the rich ecosystem of platform-native testing tools that provide WCAG auditing without requiring ARIA mapping.

### What We Can Automate for RN

| Capability | Tool | Platform |
|-----------|------|----------|
| WCAG accessibility audit | XCTest `performAccessibilityAudit()` | iOS |
| Touch target size (48dp min) | Espresso + ATF | Android |
| Color contrast | XCTest audit, ATF, axe DevTools Mobile | Both |
| Content label completeness | ATF, XCTest audit, Maestro | Both |
| Dynamic Type / text scaling | XCTest audit | iOS |
| Keyboard focus order | Simulator Full Keyboard Access (iOS), D-pad (Android) | Both |
| Accessibility tree structure | React Native Testing Library | Both (unit level) |
| Cross-platform E2E via a11y layer | Maestro | Both (single test suite) |
| Comprehensive WCAG scanning | axe DevTools Mobile | Both |
| Accessibility labels/roles/hints | DevAC static analysis, ESLint | Both (compile time) |

### What Still Requires Manual Testing for RN

- VoiceOver gesture navigation (swipes, rotor)
- TalkBack gesture navigation
- Screen reader announcement quality and ordering
- Complex interaction patterns (drag-and-drop, custom gestures)
- Cognitive accessibility

### Apple HIG: A Distinct Testing Dimension

WCAG is necessary but not sufficient for iOS accessibility. Apple's Human Interface Guidelines define platform-specific criteria that WCAG does not cover:

- **Dynamic Type** scaling to 300%+ (WCAG 1.4.4 only covers 200%)
- **44x44pt touch targets** (WCAG 2.2 requires only 24x24 CSS pixels)
- **System preference response** - Reduce Motion, Increase Contrast, Bold Text, Reduce Transparency (no WCAG equivalents)
- **UIAccessibilityTraits** - 17 traits richer than ARIA roles for native context
- **Accessibility Nutrition Labels** (WWDC25) - 9 categories with formal App Store evaluation criteria

These HIG criteria are testable via `performAccessibilityAudit()` and are already proven in our PoC (see Section 12). This means RN testing has TWO complementary dimensions: WCAG compliance AND Apple HIG compliance.

### Key Insight

XCTest's `performAccessibilityAudit()` and Espresso's ATF together provide platform-native WCAG auditing that is arguably MORE comprehensive than web-only axe-core for certain checks (touch targets, Dynamic Type). These tools operate at the OS level and test what assistive technologies actually see. Apple HIG adds a layer of platform-specific criteria that fills the gap between "WCAG compliant" and "actually usable by iOS assistive technology users."

**Realistic RN automated coverage: 50-65%** - comparable to web, achieved through different tools. Apple HIG audits push the ceiling higher for iOS-specific checks.

---

## 9. Is This Worth the Effort?

### Value Proposition

Going from ~30% (axe-core alone) to ~70-90% (full layered approach with LLM augmentation) for both web and RN:

- **Catches the most impactful behavioral bugs** that axe-core completely misses: keyboard navigation failures, focus trap issues, state-dependent ARIA errors
- **Platform-native audits** (XCTest, ATF) catch mobile-specific issues no web tool can detect
- **LLM-consumable fix suggestions** via MCP - a unique differentiator that no existing accessibility tool provides
- **LLM-augmented evaluation** (Tier A + B) addresses 20-27% of criteria previously considered "human-only" - semantic quality, navigation consistency, focus order evaluation (see Section 13)
- **Runs in CI** - continuous detection, not periodic manual audits
- **Reduces manual audit scope by ~70-80%** - expert time focuses on the 5-10% that genuinely requires human judgment (user testing with disabilities, complex cognitive UX, legal sign-off)

### Effort Estimate

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1: A11y Contracts | 10 component contracts, extraction tooling | ~2-3 weeks |
| Phase 2: Behavioral Reference Storybook | Play functions from E2E models, reference components | ~2-3 weeks |
| Phase 3: Behavioral Assertions | scan-storybook contract integration | ~1-2 weeks |
| Phase 4: RN Testing Stack | ESLint, XCTest, Espresso, Maestro integration | ~3-4 weeks |
| Phase 5+: Advanced | Playwright ARIA, Guidepup, LLM analysis, axe Mobile | ~4-8 weeks |
| **Total to full vision** | | **~12-20 weeks** |

### The Comparison

**Without this effort:** axe-core (~30%) + periodic manual audits. Every audit starts from scratch. No behavioral coverage. No RN automation. AI agents cannot help fix issues.

**With this effort:** ~55-65% automated with traditional tools + ~70-90% with LLM-augmented evaluation + focused human audit for the 5-10% that genuinely requires it. Violations caught in PRs. AI agents query diagnostics and suggest fixes. Expert audit scope reduced by 70-80%.

**This is a 2-3x improvement** in automated coverage for both platforms.

---

## 10. Open Questions & Further Research

1. **Playwright ARIA snapshots** - Spike on component-level testing effectiveness. How well does `toMatchAriaSnapshot()` catch real-world issues vs. theoretical ones?
2. **Guidepup CI integration** - What is the setup cost and reliability in GitHub Actions? macOS runners needed for VoiceOver.
3. **XCTest + RN integration** - ~~Document the exact integration steps.~~ **ANSWERED:** Working PoC exists in ~/ws/app (see Section 12). Remaining work: scale to all stories, parse xcresult, integrate with hub.
4. **Maestro a11y assertions** - Can we extend Maestro flows with accessibility assertions beyond label checking? Custom Maestro commands?
5. **ACT Rules alignment** - Should our contract schema map to ACT format for interoperability with other tools?
6. **WAI-ARIA APG extraction** - Can we supplement zag contracts with behavioral specs extracted from APG documentation?
7. **LLM alt text evaluation** - What is current model accuracy for judging alt text quality? False positive rate?
8. **Apple HIG static analysis rules** - Which HIG criteria can DevAC check at compile time? Dynamic Type usage, touch target sizing constraints, accessibilityTraits completeness?
9. **XCTest pipeline scaling** - How to iterate all Storybook stories in the proven PoC, parse xcresult bundles for structured violation data, and integrate results with DevAC hub?
10. **Accessibility Nutrition Labels** - Can we automate the common-task matrix (primary functionality, first launch, login, purchase, settings) as a pre-submission validation check?
11. **Android equivalent** - Espresso ATF pipeline following same pattern as the iOS XCTest PoC? What is the equivalent of `performAccessibilityAudit()` on Android?

---

## 11. Apple HIG: Beyond WCAG for Native Mobile

### Apple HIG Accessibility Structure

Apple's Human Interface Guidelines define accessibility requirements that go beyond WCAG, covering platform-specific behaviors that matter for real iOS users. Two key frameworks:

**Accessibility Nutrition Labels (WWDC25):**
9 categories with formal App Store evaluation criteria:
1. VoiceOver
2. Voice Control
3. Larger Text
4. Dark Interface
5. Differentiate Without Color
6. Sufficient Contrast
7. Reduced Motion
8. Captions
9. Audio Descriptions

**Common Tasks Framework:** Primary functionality, first launch, login, purchase, and settings must all be completable with each accessibility feature enabled. This provides a structured pre-submission validation matrix.

### Testable Criteria Apple HIG Adds Beyond WCAG

| Apple HIG Criterion | WCAG Gap |
|---|---|
| Dynamic Type (system text scaling to 300%+) | WCAG 1.4.4 covers 200% but has no system-level text style concept |
| 44x44pt touch targets | WCAG 2.2 requires only 24x24 CSS pixels |
| Reduce Motion system setting | WCAG 2.3.3 covers animation but not system preference |
| Reduce Transparency | No WCAG equivalent |
| Increase Contrast mode | WCAG covers ratios but not responding to system preference |
| Button Shapes | No WCAG equivalent |
| Bold Text system setting | No WCAG equivalent |
| UIAccessibilityTraits (17 traits) | Richer than ARIA roles for native context |
| VoiceOver grouping/ordering | WCAG covers reading order but not native grouping patterns |
| Haptic feedback | Entirely outside WCAG scope |

### `performAccessibilityAudit()` API (Xcode 15+, iOS 17+)

7 audit types:
1. `contrast` - Color contrast ratio validation
2. `dynamicType` - Dynamic Type support and text clipping
3. `elementDetection` - Missing or orphaned accessibility elements
4. `hitRegion` - Touch target size (44x44pt minimum)
5. `sufficientElementDescription` - Accessibility label quality
6. `textClipped` - Text truncation at larger sizes
7. `trait` - Accessibility trait correctness

Runs in XCUITest, fails test on violation. CI-ready via `xcodebuild test`.

### Impact on Our Strategy

- Apple HIG fills the gap between "WCAG compliance" and "actually usable by iOS AT users"
- Static analysis rules can check for Dynamic Type usage, touch target sizes, accessibilityRole completeness
- Runtime audits via `performAccessibilityAudit()` catch rendering-level issues (proven in our PoC - see Section 12)
- Accessibility Nutrition Labels provide a structured pre-submission validation framework
- This gives React Native testing a dimension that web testing does not have: platform-native accessibility standards enforced at the OS level

---

## 12. Proven: XCTest + Storybook Pipeline (~/ws/app)

A working proof-of-concept exists in the app repo that runs Apple's `performAccessibilityAudit()` against Storybook stories rendered in React Native. This is not theoretical - it runs end-to-end.

### The Pipeline (4 layers, working end-to-end)

```
Layer 1: JS Orchestration
  package.json scripts chain: build → select story → wait → run XCTest
  select-storybook-story.js: WebSocket to Storybook on port 7007, sends setCurrentStory event

Layer 2: React Native App (Storybook Container)
  Deep link: mindlerapp://storybook → ComponentStorybook.tsx → loads .rnstorybook
  WebSocket enabled on port 7007 for remote story selection

Layer 3: Xcode Test Infrastructure
  setup-ios-tests.rb: Programmatically creates AccessibilityAudits UI test target
  Idempotent, runs after expo prebuild, uses xcodeproj gem

Layer 4: Apple Native APIs
  AccessibilityAuditTests.swift: XCUIApplication().performAccessibilityAudit()
  Fails test if ANY accessibility violations found
```

### Key Scripts Reference

- `app/package.json` lines 103-111: Full orchestration scripts
- `app/scripts/setup-ios-tests.rb`: Xcode project manipulation (creates test target programmatically)
- `app/scripts/select-storybook-story.js`: WebSocket story selector
- `app/native-tests/ios/AccessibilityAuditTests.swift`: XCTest class calling `performAccessibilityAudit()`

### What This Proves

1. **Apple's XCTest can be programmatically added to Expo/RN projects** - `setup-ios-tests.rb` creates test targets idempotently after `expo prebuild`
2. **Storybook stories can be remotely selected via WebSocket in RN** - the same remote control pattern used by Storybook web
3. **Native `performAccessibilityAudit()` successfully audits RN components** - the API sees the same accessibility tree that VoiceOver uses
4. **Full automation is achievable:** start server -> deep link -> select story -> audit -> report

### Current Limitations (Proof-of-Concept Status)

- Story selection is hardcoded (single story: `accessibilitynavigationview--default`)
- No iteration over all stories yet
- No result parsing/aggregation from xcresult bundles
- No hub integration (results don't flow to DevAC unified diagnostics)
- iOS only (no Android equivalent yet)

### Path from PoC to Production

The PoC validates the hardest integration challenges. Remaining work is engineering, not research:
1. **Story iteration** - query Storybook index for all story IDs, loop with WebSocket selection
2. **xcresult parsing** - extract structured violation data from Xcode result bundles
3. **Hub integration** - push violations to DevAC unified diagnostics (source: "xctest-a11y")
4. **Android equivalent** - Espresso ATF pipeline following same pattern

---

## 13. Challenging the Human-Only Assumption

### The Claim Under Scrutiny

The accessibility testing industry holds a consensus: **25-35% of WCAG criteria require human judgment and cannot be automated.** This figure comes from Deque (2022), W3C's analysis of what's automatable, and WebAIM's assessments of scanner capabilities. It is repeated in virtually every accessibility testing resource.

**This consensus is outdated.** It was established using pre-2023 studies that measured the capabilities of rule-based scanners (axe-core, Lighthouse, WAVE). It does not account for multimodal LLMs, which arrived in 2023-2024 and have been applied to accessibility evaluation since. The studies that formed this consensus were correct about traditional automation. They are wrong about AI-assisted evaluation. We present evidence that the genuinely human-required portion is **5-10%, not 25-35%**.

### The 23 "Human-Only" WCAG 2.2 AA Criteria

Per [Accessible.org's analysis](https://accessible.org/wcag-accessibility-testing-automated-manual/), of ~55 WCAG 2.2 AA success criteria: 13% (7 criteria) are fully automatable, 45% (25 criteria) are partially automatable, and **42% (23 criteria) require pure human judgment**. These 23 criteria are the core of the "25-35% requires humans" claim.

They cluster into seven skill domains:

| Domain | WCAG SC | What Auditors Judge |
|--------|---------|---------------------|
| **Media quality** | 1.2.1, 1.2.2, 1.2.3, 1.2.4, 1.2.5 | Caption accuracy, audio description adequacy |
| **Semantic quality** | Part of 1.1.1, 2.4.6, 2.4.4 | Alt text meaning, heading relevance, link purpose |
| **Sensory/color** | 1.3.3, 1.4.1 | Instructions not relying solely on sensory cues |
| **Interaction patterns** | 2.1.4, 2.5.1, 2.5.2, 2.5.4, 2.5.7 | Pointer/motion alternatives, keyboard shortcuts |
| **Cross-page consistency** | 3.2.3, 3.2.4, 3.2.6 | Navigation, identification, help consistency |
| **Cognitive/error** | 3.3.3, 3.3.4, 3.3.7, 3.3.8 | Error suggestion quality, authentication alternatives |
| **AT compatibility** | 4.1.2, 4.1.3 | Dynamic state changes, status message announcements |

### Evidence: LLMs Are Already Performing "Human-Only" A11y Tasks

Research from 2024-2025 demonstrates that LLMs can perform many of the tasks previously classified as requiring human expertise:

| Study | Finding | Year |
|-------|---------|------|
| **[Lopez-Gil & Pereira](https://doi.org/10.1007/s10209-024-01145-4)** | 87.18% detection on 3 WCAG criteria previously requiring manual checking (1.1.1, 2.4.4, 4.1.2) | 2024 |
| **[WebAccessVL](https://arxiv.org/abs/2501.06045)** | Reduced violations from 5.34 to 0.44 per website using vision-language models | 2025 |
| **[A11YN (RL-aligned LLM)](https://arxiv.org/abs/2502.00267)** | 60% reduction in inaccessibility rate via reinforcement learning | 2025 |
| **[Yu et al.](https://arxiv.org/abs/2502.09735)** | LLM-restructured HTML significantly improved screen reader navigation, confirmed by blind/low-vision users | 2025 |
| **[ChatGPT accessibility study](https://doi.org/10.3390/fi17010027)** | 100% detection on automated errors, 90.91% on manual errors, but 9.5x difficulty multiplier for complex issues | 2025 |
| **[Human or LLM? (GPT-4o)](https://doi.org/10.1145/3613905.3651095)** | Reduced contrast issues 49%, improved alt-text quality 70% over human baselines | 2025 |
| **[Be My Eyes + GPT-4](https://www.bemyeyes.com/blog/announcing-be-my-ai)** | 90% resolution rate for visual assistance, 4 min vs 12 min for humans | 2024 |

The Lopez-Gil study is particularly significant: criteria that scored **0% detection with traditional tools** scored **87.18% with LLMs**. This is not an incremental improvement - it is a categorical shift.

### Criterion-by-Criterion LLM Capability Assessment

We rate current LLM capability on a 1-10 scale for each "human-only" domain, based on the evidence above:

| Area | WCAG SC | LLM Rating | Evidence |
|------|---------|------------|----------|
| **Heading structure** | 2.4.6, 1.3.1 | **8/10** | NLP excels at evaluating hierarchy, relevance, descriptiveness |
| **Link purpose** | 2.4.4 | **8/10** | Lopez-Gil achieved 87.18%. Link purpose evaluation IS natural language understanding |
| **Alt text quality** | 1.1.1 | **7/10** | ~85% accuracy for simple images, drops for complex/contextual. Multimodal models can cross-reference screenshot with alt text |
| **Error message quality** | 3.3.1, 3.3.3 | **7/10** | Can assess helpfulness, specificity, actionability of error text |
| **Navigation consistency** | 3.2.3, 3.2.4 | **7/10** | Cross-page pattern matching is an LLM strength given multi-page input |
| **Sensory characteristics** | 1.3.3 | **7/10** | Text analysis + multimodal cross-reference with visual layout |
| **Color as sole means** | 1.4.1 | **7/10** | Multimodal LLMs can analyze screenshots for color-only information conveyance |
| **Cognitive accessibility** | 3.1.5+ | **6/10** | Strong at text-level (plain language, readability), weak at holistic UX assessment |
| **Reading order** | 1.3.2 | **6/10** | Can analyze DOM vs. visual layout, but complex CSS layouts are harder |
| **Meaningful sequence** | 1.3.2 | **6/10** | Same as reading order, plus responsive layout complexity |
| **Focus order logic** | 2.4.3 | **5/10** | Fundamentally runtime - needs browser automation bridge to capture actual focus trace |
| **Media quality** | 1.2.x | **5/10** | Can evaluate captions/transcripts for accuracy, but multimedia analysis is harder |
| **AT compatibility** | 4.1.2, 4.1.3 | **4/10** | Dynamic state changes need runtime verification via accessibility tree diffs |

**Average: 6.4/10 across all "human-only" criteria** - far from zero, which is what traditional automation scores.

### The Three-Tier Decomposition

The pre-LLM industry model treats "human review" as a monolithic 25-35% block. Research shows it should be decomposed into three tiers:

#### Tier A: LLM-Replaceable (~12-15%)

Tasks where LLMs match or approach human auditor performance TODAY:

- Alt text quality evaluation (given screenshot + context)
- Heading structure and relevance assessment
- Link purpose from context (87.18% - Lopez-Gil)
- Error message helpfulness
- Sensory characteristics detection
- Color as sole information carrier (multimodal analysis)
- Plain language / readability evaluation
- Navigation consistency (given multi-page input)

**What's needed:** Screenshot + DOM + accessibility tree + page context → LLM evaluation → structured pass/fail with confidence score.

#### Tier B: LLM-Assisted with Browser Automation (~8-12%)

Tasks where LLMs need runtime data from browser automation to make judgments:

- Focus order evaluation (need actual focus trace from Playwright)
- Keyboard trap detection (need interaction sequence results)
- Dynamic ARIA state verification (need before/after DOM snapshots)
- Live region announcement verification (need accessibility tree diffs)
- Cross-page consistency (need to crawl multiple pages)
- Pointer/motion alternative verification (need interaction simulation)

**What's needed:** Browser automation captures runtime state → feeds to LLM for judgment → structured results. DevAC's browser-core + Playwright integration provides the automation layer.

#### Tier C: Genuinely Human-Required (~5-10%)

Tasks where current LLMs cannot substitute for human judgment:

- **User testing with people with disabilities** - no substitute for lived experience with assistive technologies
- **Complex cognitive accessibility** - workflow-level UX evaluation, not just text readability. Requires understanding user mental models
- **Novel interaction patterns** - custom gestures, drag-and-drop, game-like interfaces with no established accessibility patterns
- **Cultural/contextual sensitivity** - content appropriateness for specific disability communities
- **Legal/compliance sign-off** - human accountability for conformance claims (VPAT, ACR)

### Addressing the Counterarguments

**"AI accessibility tools cause harm" - the accessiBe lesson:**
The [accessiBe FTC settlement](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-takes-action-against-accessibe) ($1M fine, January 2025) demonstrates what happens when AI systems claim to solve accessibility but fail. AccessiBe's overlay product made confident claims about automatic WCAG compliance while actively breaking screen reader navigation for users. This is a legitimate concern.

**However, DevAC is fundamentally different from an overlay.** Overlays inject runtime modifications and claim compliance. DevAC is a **diagnostic tool** that surfaces issues with confidence scores for developer review. False positives are annoying but harmless. False negatives are the real risk, which is why Tier C (human review) remains essential. We flag potential issues - we do not auto-fix or claim compliance.

**"LLMs make confident-sounding but wrong judgments" - the Baymard finding:**
The [Baymard Institute study](https://baymard.com/blog/gpt4-ux-audit) found GPT-4 had an **80% error rate** performing UX audits from screenshots alone. This is a valid finding, but it evaluated general UX assessment, not structured WCAG criteria evaluation. The Lopez-Gil study (87.18% accuracy) used structured WCAG evaluation prompts with specific criteria definitions - a fundamentally different methodology. The lesson is not "LLMs can't do accessibility" but "unstructured LLM prompts produce unreliable results." DevAC's approach uses structured evaluation against specific WCAG criteria with defined pass/fail conditions.

**"The 25-35% figure is industry consensus":**
It is consensus - from 2022. The studies that established this figure (Deque automated testing study, W3C WAI documentation on what's automatable, WebAIM scanner assessments) measured the capabilities of rule-based tools (axe-core, Lighthouse, WAVE). They did not test LLM-based evaluation because multimodal LLMs did not exist when these studies were conducted. The Lopez-Gil 2024 study explicitly demonstrates this gap: criteria that scored 0% with traditional tools scored 87.18% with LLMs.

### Revised Coverage Model

| Layer | Coverage | Cumulative |
|-------|----------|------------|
| Static analysis (DevAC + ESLint) | 5-10% | 5-10% |
| Runtime scanning (axe-core) | 20-25% | 25-35% |
| Behavioral testing (zag + play functions) | 15-20% | 40-55% |
| ARIA tree + screen reader testing | 10-15% | 50-65% |
| **LLM semantic analysis (Tier A)** | **12-15%** | **62-80%** |
| **LLM + browser automation (Tier B)** | **8-12%** | **70-90%** |
| **Human review (Tier C - genuinely needed)** | **5-10%** | **75-100%** |

**The genuinely human-required portion is 5-10%, not 25-35%.** The remaining 15-27% that was previously classified as "human-only" is LLM-addressable with current technology, given the right evaluation architecture (structured criteria, multimodal input, browser automation for runtime data).

### Why This Matters for DevAC

This is not an academic distinction. It directly impacts our product strategy:

1. **Tier A requires no new infrastructure** - DevAC already has MCP, accessibility tree access, and screenshot capability. Structured LLM evaluation prompts against WCAG criteria are an implementation task, not a research problem.
2. **Tier B leverages existing browser-core** - DevAC's Playwright integration can capture focus traces, DOM diffs, and interaction sequences. The LLM evaluation layer sits on top of data we can already collect.
3. **Tier C defines the boundary** - we do not claim to replace human testers. We claim to reduce their scope from 25-35% to 5-10%, which is a 3-5x reduction in expert audit time.

---

## 14. What Auditor Expertise Actually Consists Of

Understanding what makes a human accessibility auditor effective is essential for evaluating whether LLMs can perform the same tasks. If we can describe the knowledge and cognitive processes involved, we can assess LLM capability against each one.

### How Auditors Acquire Expertise

| Certification | Focus | Duration | What It Tests |
|---|---|---|---|
| **[IAAP CPACC](https://www.accessibilityassociation.org/s/certified-professional)** | Foundational conceptual knowledge | 30-80 hours study | Disability models, AT understanding, laws/standards, universal design principles |
| **[IAAP WAS](https://www.accessibilityassociation.org/s/wascertification)** | Technical hands-on testing | 3-6 months prep | WCAG 2.2 criteria, WAI-ARIA, AT testing procedures, remediation techniques |
| **[DHS Trusted Tester v5](https://www.dhs.gov/trusted-tester)** | Prescriptive step-by-step manual testing | 40-80 hours | 20 specific test areas against Section 508, 90% pass score required |
| **[Deque University](https://dequeuniversity.com/)** | 30+ self-paced courses | 30 min - 6 hours each | WCAG, WAI-ARIA, mobile, PDF, document accessibility |
| **Full proficiency** | Years of practice | 2-5 years | Cross-platform expertise, complex widget judgment, edge case recognition |

### The Six Skill Domains of Accessibility Auditors

Breaking down what auditors actually DO reveals which skills LLMs can match:

| Skill Domain | What It Involves | LLM Match? |
|---|---|---|
| **1. Pattern recognition** | Recognizing when something looks/behaves wrong. Developed from reviewing thousands of pages | **Strong.** LLMs trained on web content recognize accessibility anti-patterns. Multimodal models can spot visual issues |
| **2. WCAG criteria knowledge** | Knowing what each criterion requires, its intent, and sufficient/failure techniques | **Very strong.** LLMs have comprehensive WCAG knowledge. Can be enhanced with structured evaluation prompts |
| **3. Assistive technology behavior** | Understanding how screen readers interpret markup, announce content, handle dynamic updates | **Moderate.** LLMs understand ARIA semantics and screen reader behavior in theory. Cannot execute AT directly (Tier B addresses this via browser automation) |
| **4. Semantic quality judgment** | Evaluating whether alt text, labels, headings, and error messages are *meaningful* to users | **Strong.** This IS natural language understanding - an LLM core capability. Lopez-Gil 87.18% on criteria 1.1.1 and 2.4.4 |
| **5. Cross-page comparison** | Noticing navigation, labeling, and interaction inconsistencies across an application | **Strong** (given multi-page input). LLMs excel at cross-document comparison. Requires page crawling (Tier B) |
| **6. User empathy** | Understanding the real-world impact of barriers on people with specific disabilities | **Weak.** No substitute for lived experience. This is Tier C territory |

**4 of 6 domains are LLM-strong capabilities.** Domain 3 is partially addressable via browser automation (Tier B). Domain 6 is genuinely human-required (Tier C).

### The Audit Methodology and LLM Applicability

Professional accessibility audits follow a structured methodology. Here is a typical 7-phase process and whether each phase is LLM-addressable:

| Phase | What Happens | LLM Capability |
|---|---|---|
| **1. Scoping** | Define pages, user flows, and WCAG level to audit | Human decision (but LLM can suggest high-risk pages via code analysis) |
| **2. Automated scanning** | Run axe-core, WAVE, Lighthouse | Already automated. DevAC does this |
| **3. Manual code inspection** | Review HTML/ARIA structure for correctness | **LLM strong** - code analysis is a core capability |
| **4. Keyboard testing** | Tab through all interactions, verify focus management | **Tier B** - requires browser automation to capture focus trace, LLM evaluates result |
| **5. Screen reader testing** | Use NVDA/VoiceOver to verify announcements and navigation | **Tier B** - Guidepup captures output, LLM evaluates quality and correctness |
| **6. Semantic evaluation** | Judge quality of alt text, headings, link text, error messages | **Tier A** - this is NLU. 87.18% accuracy demonstrated (Lopez-Gil) |
| **7. Report writing** | Document issues, map to WCAG SC, provide remediation guidance | **LLM strong** - structured report generation from diagnostic data |

**5 of 7 phases are LLM-addressable** (phases 2, 3, 5, 6, 7). Phase 4 requires browser automation (Tier B). Phase 1 requires human judgment about business priorities. This aligns with the three-tier model.

### Why This Analysis Matters

If we accept that accessibility auditing is a definable skill set composed of specific knowledge domains and cognitive tasks, then we can evaluate LLM capability against each component rather than treating "human judgment" as an indivisible black box. The evidence shows that most of what makes an auditor effective - pattern recognition, criteria knowledge, semantic evaluation, cross-page comparison - are tasks where LLMs are competent or strong. The genuinely irreducible human element is user empathy based on lived experience with disabilities, and the legal accountability of signing off on conformance claims.

---

## Sources

- [Deque: Automated Testing Study (57% coverage)](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/)
- [Deque: Automated Accessibility Testing Coverage](https://www.deque.com/automated-accessibility-testing-coverage/)
- [WebAIM Million Report 2025](https://webaim.org/projects/million/)
- [W3C WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
- [W3C ACT Rules Format 1.1](https://www.w3.org/TR/act-rules-format/)
- [Apple performAccessibilityAudit (WWDC 2023)](https://developer.apple.com/videos/play/wwdc2023/10035/)
- [Google Accessibility Test Framework](https://github.com/google/Accessibility-Test-Framework-for-Android)
- [Maestro React Native Support](https://docs.maestro.dev/platform-support/react-native)
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
- [Guidepup](https://www.guidepup.dev/)
- [Deque axe DevTools Mobile - React Native](https://docs.deque.com/devtools-mobile/2025.7.2/en/react-native/)
- [React Native Accessibility Docs](https://reactnative.dev/docs/accessibility)
- [Apple Human Interface Guidelines - Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple WWDC25 - Accessibility Nutrition Labels](https://developer.apple.com/wwdc25/)
- [Apple performAccessibilityAudit API Reference](https://developer.apple.com/documentation/xctest/xcuiapplication/performaccessibilityaudit(for:_:))

### LLM Accessibility Research (Section 13 & 14 references)

- [Lopez-Gil & Pereira 2024 - "Turning manual web accessibility success criteria into automatic: an LLM-based approach"](https://doi.org/10.1007/s10209-024-01145-4) (87.18% detection on manual-only criteria)
- [WebAccessVL 2025 - "Making an Accessible Web via Violation-Conditioned VLM"](https://arxiv.org/abs/2501.06045) (5.34→0.44 violations per website)
- [Yu et al. 2025 - "LLM-Driven Optimization of HTML Structure for Screen Reader Navigation"](https://arxiv.org/abs/2502.09735) (confirmed by blind/low-vision users)
- [A11YN 2025 - "Aligning LLMs for Accessible Web UI Code Generation"](https://arxiv.org/abs/2502.00267) (60% reduction in inaccessibility rate)
- [From Code to Compliance: Assessing ChatGPT's Utility 2025](https://doi.org/10.3390/fi17010027) (90.91% on manual errors, 9.5x difficulty for complex)
- [Human or LLM? Comparative Study on Accessible Code Generation 2025](https://doi.org/10.1145/3613905.3651095) (70% alt-text improvement over human baselines)
- [Be My Eyes + GPT-4 - AI-powered visual assistance](https://www.bemyeyes.com/blog/announcing-be-my-ai) (90% resolution rate)
- [accessiBe FTC Settlement - January 2025](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-takes-action-against-accessibe) ($1M fine for misleading accessibility claims)
- [Baymard Institute - Testing ChatGPT-4 for UX Audits](https://baymard.com/blog/gpt4-ux-audit) (80% error rate on unstructured UX audits)
- [Accessible.org - WCAG Accessibility Testing: Automated vs Manual](https://accessible.org/wcag-accessibility-testing-automated-manual/) (23 criteria not detectable by automation)
- [IAAP CPACC Body of Knowledge](https://www.accessibilityassociation.org/s/certified-professional)
- [IAAP WAS Body of Knowledge](https://www.accessibilityassociation.org/s/wascertification)
- [DHS Trusted Tester Conformance Test Process v5](https://www.dhs.gov/trusted-tester)
- [Deque University Course Catalog](https://dequeuniversity.com/)
