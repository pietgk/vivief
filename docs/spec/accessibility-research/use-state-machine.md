# XState-Based Accessibility Testing Framework

## A Proposal for Comprehensive WCAG Coverage Through Model-Based Testing

**Document Version:** 1.0  
**Date:** January 2025  
**Author:** Piet & Opus  
**Status:** Proposal for Discussion

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Problem with Current Accessibility Testing](#the-problem-with-current-accessibility-testing)
3. [The Insight: Accessibility as State Machine Behavior](#the-insight-accessibility-as-state-machine-behavior)
4. [Proposed Architecture](#proposed-architecture)
5. [Analysis of Existing Solutions](#analysis-of-existing-solutions)
6. [Remaining Gaps](#remaining-gaps)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Resource Requirements](#resource-requirements)
9. [Decision Points for Discussion](#decision-points-for-discussion)

---

## Executive Summary

### The Core Problem

Current accessibility testing tools (axe-core, Storybook a11y addon) can only detect **20-57% of WCAG issues**. The remaining issues—keyboard navigation, focus management, screen reader behavior, interaction patterns—require manual testing that is expensive, inconsistent, and doesn't scale.

### The Proposed Solution

Enforce a component architecture where:

1. **All component logic lives in XState machines**
2. **Render functions are pure**: `(machineContext) => JSX`
3. **ARIA patterns are encoded as machine definitions**
4. **Model-based testing exhaustively verifies all states and transitions**

This approach transforms accessibility from "test after the fact" to "correct by construction."

### Why This Matters

| Metric | Current State | Proposed State |
|--------|---------------|----------------|
| Automated WCAG coverage | ~30-57% | ~80-90% |
| Keyboard testing | Manual only | Fully automated |
| Focus management testing | Manual only | Fully automated |
| ARIA pattern conformance | Manual review | Machine-verified |
| Regression detection | Partial (DOM only) | Complete (behavior) |

---

## The Problem with Current Accessibility Testing

### What axe-core (and similar tools) CAN Test

```
✅ Color contrast ratios
✅ Missing alt text on images
✅ Invalid ARIA attribute values
✅ Missing form labels
✅ Duplicate IDs
✅ Heading hierarchy
✅ Language attributes
✅ Link text quality
```

### What axe-core CANNOT Test

```
❌ Keyboard navigation completeness (can you reach all interactive elements?)
❌ Focus order logic (is the tab order sensible?)
❌ Focus trap behavior (does the modal trap focus correctly?)
❌ Focus return (does focus return to trigger when modal closes?)
❌ Keyboard shortcuts (does Escape close the dialog?)
❌ Arrow key navigation (do arrow keys work in menus/tabs?)
❌ Screen reader announcements (are live regions working?)
❌ Dynamic ARIA state changes (does aria-expanded toggle correctly?)
❌ Interaction pattern conformance (does this behave like a combobox should?)
```

### The Statistics

| Source | Claim |
|--------|-------|
| Deque (axe-core creators) | axe-core catches ~57% of WCAG issues it can detect |
| UsableNet | Over 70% of WCAG 2.1 success criteria require manual review |
| WebAIM | Only ~25-30% of WCAG is fully automatable |
| Adrian Roselli | Detailed comparison shows major gaps in all automated tools |

### The Real-World Impact

For a medical application (like Mindler), the untestable issues are critical:

- **Keyboard navigation**: Users with motor impairments rely 100% on keyboard
- **Focus management**: Screen reader users get lost without proper focus handling
- **ARIA patterns**: Assistive technology expects standard interaction patterns
- **Dynamic announcements**: Users need feedback on actions without visual cues

---

## The Insight: Accessibility as State Machine Behavior

### W3C ARIA Authoring Practices ARE State Machines

Every ARIA design pattern is defined in terms of:

1. **States**: What configurations can the component be in?
2. **Events**: What user actions cause transitions?
3. **Keyboard interactions**: What keys trigger what behavior?
4. **Focus management**: Where should focus be in each state?

**Example: Dialog Pattern (from W3C APG)**

```
States:
  - closed
  - open

Transitions:
  closed -> open: trigger activated (click, Enter, Space)
  open -> closed: Escape key, close button, outside click

Focus Requirements:
  - On open: Move focus to first focusable element (or dialog itself)
  - While open: Trap focus within dialog
  - On close: Return focus to trigger element

ARIA Requirements:
  - role="dialog" or role="alertdialog"
  - aria-modal="true" when open
  - aria-labelledby pointing to title
```

This IS a state machine specification. The insight is: **make this specification executable**.

### The Architecture Constraint

```typescript
// RULE 1: All logic in XState machine
const dialogMachine = createMachine({
  id: 'dialog',
  initial: 'closed',
  context: {
    triggerElement: null,
    title: '',
    content: null,
  },
  states: {
    closed: {
      on: {
        OPEN: { target: 'open', actions: 'storeTriggerElement' },
        'KEYDOWN.ENTER': { target: 'open', actions: 'storeTriggerElement' },
        'KEYDOWN.SPACE': { target: 'open', actions: 'storeTriggerElement' },
      },
    },
    open: {
      entry: ['trapFocus', 'focusFirstElement'],
      exit: ['releaseFocusTrap', 'returnFocusToTrigger'],
      on: {
        CLOSE: 'closed',
        'KEYDOWN.ESCAPE': 'closed',
      },
    },
  },
});

// RULE 2: Render is pure function of machine context/state
const Dialog = ({ state, send, context }) => {
  if (state.matches('closed')) return null;
  
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onKeyDown={(e) => send({ type: `KEYDOWN.${e.key.toUpperCase()}` })}
    >
      <h2 id="dialog-title">{context.title}</h2>
      {context.content}
      <button onClick={() => send('CLOSE')}>Close</button>
    </div>
  );
};
```

### Why This Enables Comprehensive Testing

```typescript
import { createModel } from '@xstate/test';

// The model generates ALL possible paths through the machine
const model = createModel(dialogMachine).withEvents({
  OPEN: async (page) => {
    await page.click('[data-testid="dialog-trigger"]');
  },
  CLOSE: async (page) => {
    await page.click('[data-testid="dialog-close"]');
  },
  'KEYDOWN.ESCAPE': async (page) => {
    await page.keyboard.press('Escape');
  },
  'KEYDOWN.ENTER': async (page) => {
    await page.keyboard.press('Enter');
  },
  'KEYDOWN.SPACE': async (page) => {
    await page.keyboard.press('Space');
  },
});

// This generates exhaustive test coverage
describe('Dialog accessibility', () => {
  const testPlans = model.getSimplePathPlans();
  
  testPlans.forEach((plan) => {
    describe(plan.description, () => {
      plan.paths.forEach((path) => {
        it(path.description, async ({ page }) => {
          // Setup
          await page.goto('/test-page');
          
          // Execute path through machine
          await path.test(page);
        });
      });
    });
  });
  
  // Verify all states were covered
  it('should cover all states', () => {
    model.testCoverage();
  });
});
```

---

## Proposed Architecture

### Component Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                        COMPONENT ACTOR                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    XState Machine                             │   │
│  │                                                               │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │   │
│  │  │   State A   │───▶│   State B   │───▶│   State C   │       │   │
│  │  │             │    │             │    │             │       │   │
│  │  │ meta: {     │    │ meta: {     │    │ meta: {     │       │   │
│  │  │   a11y: {}  │    │   a11y: {}  │    │   a11y: {}  │       │   │
│  │  │ }           │    │ }           │    │ }           │       │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘       │   │
│  │                                                               │   │
│  │  Events: CLICK, KEYDOWN.*, FOCUS, BLUR, etc.                 │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                            │                                         │
│                            │ context + state                         │
│                            ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Pure Render Function                             │   │
│  │                                                               │   │
│  │  ({ state, context, send }) => {                             │   │
│  │    return (                                                   │   │
│  │      <Component                                               │   │
│  │        aria-*={derivedFromState}                             │   │
│  │        onKeyDown={(e) => send(`KEYDOWN.${e.key}`)}           │   │
│  │        onClick={() => send('CLICK')}                          │   │
│  │      />                                                       │   │
│  │    );                                                         │   │
│  │  }                                                            │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### A11y Metadata Schema

Each state in the machine declares its accessibility requirements:

```typescript
interface A11yStateMeta {
  // Human-readable description of this state
  description: string;
  
  // Expected ARIA attributes in this state
  aria: {
    selector: string;
    attributes: Record<string, string | boolean>;
  }[];
  
  // Focus requirements
  focus: {
    // Where focus should be when entering this state
    target?: string;
    // Should focus be trapped in a container?
    trap?: string;
    // Element to return focus to when leaving (stored in context)
    returnTo?: string;
  };
  
  // Live region announcements expected
  announcements?: {
    politeness: 'polite' | 'assertive';
    message: string | ((context: any) => string);
  }[];
  
  // Elements that must be focusable in this state
  focusableElements?: string[];
  
  // Elements that must NOT be focusable in this state
  inertElements?: string[];
}
```

**Example with full metadata:**

```typescript
const accordionMachine = createMachine({
  id: 'accordion',
  initial: 'idle',
  context: {
    expandedPanels: [] as string[],
    focusedTrigger: null as string | null,
    panels: ['panel-1', 'panel-2', 'panel-3'],
  },
  states: {
    idle: {
      meta: {
        a11y: {
          description: 'Accordion with all panels collapsed',
          aria: [
            {
              selector: '[data-accordion-trigger]',
              attributes: { 'aria-expanded': 'false' },
            },
            {
              selector: '[data-accordion-panel]',
              attributes: { hidden: true },
            },
          ],
          focus: {
            // No specific focus requirements in idle
          },
          focusableElements: ['[data-accordion-trigger]'],
          inertElements: ['[data-accordion-panel]'],
        } satisfies A11yStateMeta,
      },
      on: {
        EXPAND_PANEL: {
          target: 'panelExpanded',
          actions: 'addToExpanded',
        },
        'KEYDOWN.ENTER': {
          target: 'panelExpanded',
          actions: 'expandFocusedPanel',
        },
        'KEYDOWN.SPACE': {
          target: 'panelExpanded',
          actions: 'expandFocusedPanel',
        },
        'KEYDOWN.ARROW_DOWN': {
          actions: 'focusNextTrigger',
        },
        'KEYDOWN.ARROW_UP': {
          actions: 'focusPreviousTrigger',
        },
        'KEYDOWN.HOME': {
          actions: 'focusFirstTrigger',
        },
        'KEYDOWN.END': {
          actions: 'focusLastTrigger',
        },
      },
    },
    panelExpanded: {
      meta: {
        a11y: {
          description: 'Accordion with one or more panels expanded',
          aria: (context) => [
            ...context.expandedPanels.map((id) => ({
              selector: `[data-accordion-trigger="${id}"]`,
              attributes: { 'aria-expanded': 'true' },
            })),
            ...context.expandedPanels.map((id) => ({
              selector: `[data-accordion-panel="${id}"]`,
              attributes: { hidden: false },
            })),
          ],
          announcements: (context) => [{
            politeness: 'polite',
            message: `Panel ${context.expandedPanels.at(-1)} expanded`,
          }],
        } satisfies A11yStateMeta,
      },
      on: {
        COLLAPSE_PANEL: [
          {
            target: 'idle',
            cond: 'isLastExpandedPanel',
            actions: 'removeFromExpanded',
          },
          {
            actions: 'removeFromExpanded',
          },
        ],
        // ... same keyboard events
      },
    },
  },
});
```

### Testing Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                      TESTING PIPELINE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. PATTERN CONFORMANCE LINT                                        │
│     ┌─────────────────────────────────────────────────────────┐     │
│     │ Verify machine against ARIA pattern specification       │     │
│     │ - Required keyboard events present?                     │     │
│     │ - Required states defined?                              │     │
│     │ - A11y meta complete?                                   │     │
│     └─────────────────────────────────────────────────────────┘     │
│                              │                                       │
│                              ▼                                       │
│  2. MODEL-BASED TEST GENERATION                                     │
│     ┌─────────────────────────────────────────────────────────┐     │
│     │ Generate exhaustive paths through machine               │     │
│     │ - All states visited                                    │     │
│     │ - All transitions exercised                             │     │
│     │ - All keyboard events tested                            │     │
│     └─────────────────────────────────────────────────────────┘     │
│                              │                                       │
│                              ▼                                       │
│  3. RUNTIME A11Y VERIFICATION (per state)                           │
│     ┌─────────────────────────────────────────────────────────┐     │
│     │ At each state in path:                                  │     │
│     │ - Verify ARIA attributes match meta                     │     │
│     │ - Verify focus is correct                               │     │
│     │ - Verify focus trap if required                         │     │
│     │ - Verify live region announcements                      │     │
│     │ - Run axe-core for static DOM issues                    │     │
│     └─────────────────────────────────────────────────────────┘     │
│                              │                                       │
│                              ▼                                       │
│  4. COVERAGE REPORT                                                 │
│     ┌─────────────────────────────────────────────────────────┐     │
│     │ - All machine states covered                            │     │
│     │ - All transitions exercised                             │     │
│     │ - All keyboard interactions tested                      │     │
│     │ - WCAG success criteria mapping                         │     │
│     └─────────────────────────────────────────────────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Storybook Integration

```typescript
// Auto-generate stories from machine states
// accordion.stories.tsx

import { generateStoriesFromMachine } from '@our-lib/storybook-xstate';
import { accordionMachine } from './accordion.machine';
import { Accordion } from './Accordion';

export default {
  title: 'Components/Accordion',
  component: Accordion,
};

// Automatically generates a story for each state
export const { AllCollapsed, OneExpanded, MultipleExpanded } = 
  generateStoriesFromMachine(accordionMachine, {
    // Map states to meaningful names
    stateNames: {
      idle: 'AllCollapsed',
      panelExpanded: 'OneExpanded',
    },
    // Provide context variations
    contextVariations: {
      panelExpanded: [
        { expandedPanels: ['panel-1'], label: 'OneExpanded' },
        { expandedPanels: ['panel-1', 'panel-2'], label: 'MultipleExpanded' },
      ],
    },
  });

// Each generated story includes:
// - The component in that state
// - A11y addon panel showing verification results
// - Interactive controls to send events to machine
// - Keyboard event handlers wired up
```

---

## Analysis of Existing Solutions

### Comparison Matrix

| Library | State Machine | Accessible | Testable | React Native | Customizable |
|---------|--------------|------------|----------|--------------|--------------|
| React Aria (Adobe) | Implicit | ✅ Excellent | Partial | ❌ Web only | ✅ Headless |
| Radix UI | Implicit | ✅ Very Good | Partial | ❌ Web only | ✅ Headless |
| Headless UI | Implicit | ✅ Very Good | Partial | ❌ Web only | ✅ Headless |
| Ark UI | Explicit (Zag.js) | ✅ Very Good | ✅ Better | ⚠️ Limited | ✅ Headless |
| Chakra UI | Implicit | ⚠️ Good | Partial | ❌ Web only | ⚠️ Styled |
| MUI | Implicit | ⚠️ Varies | Partial | ❌ Web only | ⚠️ Styled |
| Gestalt (Pinterest) | Implicit | ✅ Very Good | Partial | ❌ Web only | ❌ Opinionated |
| **Our Proposal** | **Explicit** | **✅ Verifiable** | **✅ Complete** | **✅ Possible** | **✅ Headless** |

### Deep Dive: React Aria (Adobe)

**What it does well:**
- Comprehensive ARIA pattern implementations
- Hooks-based architecture separates behavior from rendering
- Excellent documentation with accessibility notes
- Used in production at Adobe (Spectrum)

**The gap:**
```typescript
// React Aria provides behavior hooks
import { useDialog } from '@react-aria/dialog';

function Dialog(props) {
  let ref = useRef();
  let { dialogProps, titleProps } = useDialog(props, ref);
  
  return (
    <div {...dialogProps} ref={ref}>
      <h3 {...titleProps}>{props.title}</h3>
      {props.children}
    </div>
  );
}
```

The state machine is **implicit inside the hook**. You cannot:
- Inspect all possible states
- Generate exhaustive tests from the behavior definition
- Verify that your usage covers all keyboard interactions
- Lint your component against the pattern specification

**Testing is still manual or partial:**
```typescript
// React Aria's own tests are hand-written
it('should close on escape', async () => {
  render(<Dialog />);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
// But there's no guarantee all paths are tested
```

### Deep Dive: Ark UI / Zag.js

**This is the closest to our vision.**

Zag.js (used by Ark UI) explicitly uses state machines:

```typescript
// From Zag.js source
import { createMachine } from "@zag-js/core";

const machine = createMachine({
  id: "dialog",
  initial: "closed",
  context: {
    // ...
  },
  states: {
    closed: {
      on: {
        OPEN: "open",
      },
    },
    open: {
      entry: ["setInitialFocus"],
      on: {
        CLOSE: "closed",
        ESCAPE: "closed",
      },
    },
  },
});
```

**What Zag.js/Ark does well:**
- Explicit state machines ✅
- Framework-agnostic (React, Vue, Solid) ✅
- Focus management built-in ✅
- Good accessibility foundation ✅

**The gap:**
```typescript
// Zag.js machines do NOT have a11y metadata
const machine = createMachine({
  states: {
    open: {
      // No meta.a11y declaration
      // No way to verify ARIA states programmatically
      // No model-based test generation
    },
  },
});

// Tests are still hand-written
// No exhaustive path coverage
// No pattern conformance linting
```

**Why we can't just use Ark UI:**
1. No a11y metadata schema for verification
2. No model-based test generation
3. Limited React Native support
4. Can't lint machines against ARIA patterns
5. Tests don't cover all machine paths automatically

### Deep Dive: Radix UI

**What it does well:**
- Excellent accessibility out of the box
- Composable primitive approach
- Good defaults for keyboard interactions

**The architecture:**
```typescript
// Radix uses internal state management (not explicit machines)
import * as Dialog from '@radix-ui/react-dialog';

function MyDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger>Open</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>Title</Dialog.Title>
          <Dialog.Description>Description</Dialog.Description>
          <Dialog.Close>Close</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

**The gap:**
- State machine is hidden in implementation
- Cannot generate tests from behavior specification
- Cannot verify your usage is complete
- No React Native support
- Styled (though minimal), not purely headless

### Summary: Why We Need to Build This

| Requirement | Existing Solutions | Our Proposal |
|-------------|-------------------|--------------|
| Explicit state machines | Only Zag.js | ✅ Required |
| A11y metadata per state | ❌ None | ✅ Core feature |
| Model-based test generation | ❌ None | ✅ Core feature |
| Pattern conformance linting | ❌ None | ✅ Core feature |
| Exhaustive path coverage | ❌ None | ✅ Automatic |
| React Native support | ⚠️ Limited | ✅ Architecture supports |
| WCAG criterion mapping | ❌ None | ✅ Planned |

**The fundamental gap**: Existing libraries implement accessible patterns but don't make the specification verifiable. We're building the verification layer.

---

## Remaining Gaps

Even with this architecture, some accessibility concerns require additional solutions:

### Gap 1: Visual/Perceptual Testing

**What we still can't automatically test:**
- Color contrast (need axe-core)
- Text resizing behavior
- Visual focus indicators
- Animation/motion preferences
- High contrast mode

**Mitigation:**
- Continue using axe-core for DOM-level checks
- Add Chromatic visual regression for focus states
- Test `prefers-reduced-motion` media query handling in machines

### Gap 2: Screen Reader Announcements

**The challenge:**
Live regions and screen reader behavior cannot be fully verified programmatically. Different screen readers behave differently.

**Partial mitigation:**
```typescript
// We can verify ARIA live region attributes
meta: {
  a11y: {
    announcements: [{
      selector: '[aria-live="polite"]',
      expectedText: 'Panel expanded',
    }],
  },
}

// But actual screen reader behavior needs manual testing
```

**Recommended approach:**
- Automated: Verify live region attributes are correct
- Manual: Periodic testing with NVDA, VoiceOver, JAWS
- Document expected announcements in machine metadata

### Gap 3: Content Accessibility

**What machines don't address:**
- Alternative text quality (not just presence)
- Reading level of content
- Meaningful link text
- Error message clarity

**Mitigation:**
- Content guidelines as documentation
- axe-core for structural issues
- Consider AI-assisted content review

### Gap 4: Cognitive Accessibility

**Hard to test automatically:**
- Consistent navigation across pages
- Predictable behavior
- Clear error recovery paths
- Timeout handling

**Partial mitigation:**
- Machines enforce consistent behavior patterns
- Error states explicitly modeled
- Timeout events can be part of machine definition

### Gap 5: Touch Accessibility (React Native specific)

**Additional considerations:**
- Touch target sizes
- Gesture alternatives
- Platform-specific accessibility APIs

**Mitigation:**
- Define touch-specific events in machines
- Add React Native accessibility props to metadata
- Platform-specific test runners

### Coverage Matrix

| WCAG Category | Automated Coverage | Additional Testing Needed |
|---------------|-------------------|---------------------------|
| 1.1 Text Alternatives | Partial (axe) | Content review |
| 1.2 Time-based Media | ❌ | Manual |
| 1.3 Adaptable | Partial (axe) | Screen reader testing |
| 1.4 Distinguishable | Partial (axe) | Visual review |
| 2.1 Keyboard | ✅ **Full** | None |
| 2.2 Enough Time | ✅ Good | Edge cases |
| 2.3 Seizures | Partial | Animation review |
| 2.4 Navigable | ✅ Good | Manual verification |
| 2.5 Input Modalities | ✅ Good | Touch testing |
| 3.1 Readable | ❌ | Content review |
| 3.2 Predictable | ✅ **Full** | None |
| 3.3 Input Assistance | ✅ Good | Content review |
| 4.1 Compatible | ✅ **Full** | Screen reader testing |

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Deliverables:**
1. A11y metadata TypeScript schema
2. Core ARIA pattern machines (Dialog, Menu, Tabs, Accordion)
3. Basic test generator from machine definitions
4. Proof-of-concept Storybook integration

**Success criteria:**
- Dialog component fully implemented with machines
- Automated tests cover all keyboard interactions
- Storybook shows all states with a11y verification

### Phase 2: Pattern Library (Weeks 5-8)

**Deliverables:**
1. Complete set of ARIA pattern machines:
   - Alert/AlertDialog
   - Breadcrumb
   - Button (toggle, group)
   - Checkbox (single, group)
   - Combobox (autocomplete)
   - Disclosure
   - Feed
   - Grid
   - Listbox
   - Menu/Menubar
   - Radio Group
   - Slider
   - Spinbutton
   - Switch
   - Tabs
   - Tooltip
   - Tree/TreeGrid

2. Pattern conformance linter
3. WCAG criterion mapping documentation

**Success criteria:**
- All common patterns have machine implementations
- Linter catches missing keyboard events
- Documentation maps machines to WCAG criteria

### Phase 3: Integration & Tooling (Weeks 9-12)

**Deliverables:**
1. Full Storybook addon for XState a11y
2. CI integration (GitHub Actions)
3. Coverage reporting
4. React Native adaptations
5. Migration guide from existing components

**Success criteria:**
- One-command a11y verification in CI
- Coverage reports show WCAG compliance percentage
- React Native components share machines with web

### Phase 4: Refinement & Documentation (Weeks 13-16)

**Deliverables:**
1. Comprehensive documentation
2. Video tutorials
3. Example application
4. Performance optimization
5. Community feedback incorporation

**Success criteria:**
- New developers can onboard in < 1 day
- Performance overhead < 5% in development
- No runtime overhead in production

---

## Resource Requirements

### Team Composition

| Role | Allocation | Responsibilities |
|------|------------|------------------|
| Senior Frontend Engineer | 100% | Architecture, core implementation |
| Frontend Engineer | 100% | Pattern implementations, testing |
| Accessibility Specialist | 50% | Pattern review, WCAG mapping |
| QA Engineer | 25% | Test strategy, manual verification |

### Technology Stack

```
Core:
- XState v5
- @xstate/test
- TypeScript
- React 18+

Testing:
- Playwright
- Vitest
- axe-core

Documentation:
- Storybook 8+
- TypeDoc

CI/CD:
- GitHub Actions
- Chromatic (optional)
```

### Estimated Effort

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: Foundation | 4 weeks | 2 FTE |
| Phase 2: Pattern Library | 4 weeks | 2 FTE |
| Phase 3: Integration | 4 weeks | 1.5 FTE |
| Phase 4: Documentation | 4 weeks | 1 FTE |
| **Total** | **16 weeks** | **~26 person-weeks** |

---

## Decision Points for Discussion

### 1. Build vs. Contribute

**Option A: Build internal library**
- Pros: Full control, tailored to our needs, React Native support
- Cons: Maintenance burden, longer timeline

**Option B: Contribute to Zag.js/Ark**
- Pros: Community support, existing foundation
- Cons: May not accept our changes, slower iteration

**Option C: Hybrid approach**
- Build a11y verification layer that works WITH Zag.js machines
- Contribute improvements upstream over time

**Recommendation:** Option C - Start with verification layer, evaluate contribution later

### 2. Scope of Initial Implementation

**Question:** Should we implement all ARIA patterns or focus on what we use?

**Option A: All ARIA patterns (~20 patterns)**
- Pros: Complete solution, reusable across projects
- Cons: Significant upfront investment

**Option B: Mindler-specific patterns first (~8 patterns)**
- Pros: Faster time to value, validated approach
- Cons: May need refactoring as we add patterns

**Recommendation:** Option B - Start with our most complex components (Modals, Forms, Navigation)

### 3. React Native Strategy

**Question:** How do we handle platform differences?

**Option A: Shared machines, platform-specific renderers**
- Machine: `dialog.machine.ts`
- Web: `Dialog.web.tsx`
- Native: `Dialog.native.tsx`

**Option B: Platform-specific machines with shared base**
- Machine: `dialog.machine.base.ts` + `dialog.machine.native.ts`

**Recommendation:** Option A - Behavior should be consistent, only rendering differs

### 4. Tooling Investment

**Question:** How much tooling should we build?

| Tool | Priority | Effort |
|------|----------|--------|
| Test generator | Critical | Medium |
| Storybook integration | High | Medium |
| Pattern linter | High | High |
| Coverage reporter | Medium | Medium |
| VS Code extension | Low | High |

**Recommendation:** Focus on test generator and Storybook first, defer VS Code extension

### 5. Rollout Strategy

**Question:** How do we migrate existing components?

**Option A: Big bang migration**
- Rewrite all components at once
- Pros: Consistency
- Cons: High risk, long before value

**Option B: Incremental migration**
- New components use machines
- Migrate existing components priority-ordered
- Pros: Lower risk, early value
- Cons: Inconsistency during transition

**Recommendation:** Option B - Start with new features, migrate by priority

---

## Appendix A: Example Implementation

### Complete Dialog Implementation

```typescript
// dialog.machine.ts
import { createMachine, assign } from 'xstate';
import type { A11yStateMeta } from '@our-lib/a11y-types';

export interface DialogContext {
  triggerElement: HTMLElement | null;
  returnFocusTo: HTMLElement | null;
  title: string;
  description?: string;
  role: 'dialog' | 'alertdialog';
}

export type DialogEvent =
  | { type: 'OPEN'; triggerElement: HTMLElement }
  | { type: 'CLOSE' }
  | { type: 'KEYDOWN.ESCAPE' }
  | { type: 'KEYDOWN.TAB'; shiftKey: boolean };

export const dialogMachine = createMachine({
  id: 'dialog',
  initial: 'closed',
  context: {
    triggerElement: null,
    returnFocusTo: null,
    title: '',
    description: undefined,
    role: 'dialog',
  } as DialogContext,
  
  states: {
    closed: {
      meta: {
        a11y: {
          description: 'Dialog is closed and not rendered',
          aria: [],
          focus: {
            // No focus requirements when closed
          },
        } satisfies A11yStateMeta,
      },
      on: {
        OPEN: {
          target: 'open',
          actions: assign({
            triggerElement: (_, event) => event.triggerElement,
            returnFocusTo: (_, event) => event.triggerElement,
          }),
        },
      },
    },
    
    open: {
      meta: {
        a11y: {
          description: 'Dialog is open and visible',
          aria: [
            {
              selector: '[data-dialog-content]',
              attributes: {
                role: (ctx) => ctx.role,
                'aria-modal': 'true',
                'aria-labelledby': 'dialog-title',
                'aria-describedby': (ctx) => ctx.description ? 'dialog-description' : undefined,
              },
            },
          ],
          focus: {
            target: '[data-dialog-content] [data-autofocus], [data-dialog-content] button, [data-dialog-content] [href], [data-dialog-content] input',
            trap: '[data-dialog-content]',
            returnTo: 'returnFocusTo', // context key
          },
          focusableElements: [
            '[data-dialog-content] button',
            '[data-dialog-content] [href]',
            '[data-dialog-content] input',
            '[data-dialog-content] select',
            '[data-dialog-content] textarea',
            '[data-dialog-content] [tabindex]:not([tabindex="-1"])',
          ],
        } satisfies A11yStateMeta,
      },
      entry: ['trapFocus', 'focusFirstElement'],
      exit: ['releaseFocusTrap', 'returnFocus'],
      on: {
        CLOSE: {
          target: 'closed',
        },
        'KEYDOWN.ESCAPE': {
          target: 'closed',
        },
        'KEYDOWN.TAB': {
          // Tab handling for focus trap managed by actions
          actions: 'handleTabKey',
        },
      },
    },
  },
}, {
  actions: {
    trapFocus: () => {
      // Implementation: activate focus trap
    },
    releaseFocusTrap: () => {
      // Implementation: deactivate focus trap
    },
    focusFirstElement: (context) => {
      // Implementation: focus first focusable element
    },
    returnFocus: (context) => {
      context.returnFocusTo?.focus();
    },
    handleTabKey: (context, event) => {
      // Implementation: handle tab within trap
    },
  },
});
```

```typescript
// dialog.test.ts
import { createModel } from '@xstate/test';
import { test, expect } from '@playwright/test';
import { dialogMachine } from './dialog.machine';
import { verifyA11yState } from '@our-lib/a11y-testing';

const model = createModel(dialogMachine).withEvents({
  OPEN: {
    exec: async (page) => {
      await page.click('[data-testid="dialog-trigger"]');
    },
  },
  CLOSE: {
    exec: async (page) => {
      await page.click('[data-testid="dialog-close"]');
    },
  },
  'KEYDOWN.ESCAPE': {
    exec: async (page) => {
      await page.keyboard.press('Escape');
    },
  },
  'KEYDOWN.TAB': {
    cases: [
      { shiftKey: false },
      { shiftKey: true },
    ],
    exec: async (page, event) => {
      if (event.shiftKey) {
        await page.keyboard.press('Shift+Tab');
      } else {
        await page.keyboard.press('Tab');
      }
    },
  },
});

test.describe('Dialog accessibility', () => {
  const testPlans = model.getSimplePathPlans();
  
  testPlans.forEach((plan) => {
    test.describe(plan.description, () => {
      plan.paths.forEach((path) => {
        test(path.description, async ({ page }) => {
          // Setup
          await page.goto('/test/dialog');
          
          // Execute path and verify a11y at each step
          for (const segment of path.segments) {
            await segment.event.exec(page);
            
            // Verify a11y requirements for current state
            const state = segment.state;
            if (state.meta?.a11y) {
              await verifyA11yState(page, state.meta.a11y);
            }
          }
          
          // Final state verification
          await verifyA11yState(page, path.state.meta?.a11y);
        });
      });
    });
  });
  
  test('should have 100% state coverage', () => {
    model.testCoverage();
  });
});
```

```typescript
// Dialog.tsx
import { useMachine } from '@xstate/react';
import { dialogMachine } from './dialog.machine';
import { FocusTrap } from '@our-lib/focus-trap';

interface DialogProps {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  role?: 'dialog' | 'alertdialog';
}

export function Dialog({ trigger, title, description, children, role = 'dialog' }: DialogProps) {
  const [state, send] = useMachine(dialogMachine, {
    context: { title, description, role },
  });
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      send('KEYDOWN.ESCAPE');
    } else if (e.key === 'Tab') {
      send({ type: 'KEYDOWN.TAB', shiftKey: e.shiftKey });
    }
  };
  
  return (
    <>
      {/* Trigger */}
      <span
        onClick={(e) => send({ type: 'OPEN', triggerElement: e.currentTarget })}
        data-testid="dialog-trigger"
      >
        {trigger}
      </span>
      
      {/* Dialog (only rendered when open) */}
      {state.matches('open') && (
        <FocusTrap>
          <div
            role={role}
            aria-modal="true"
            aria-labelledby="dialog-title"
            aria-describedby={description ? 'dialog-description' : undefined}
            onKeyDown={handleKeyDown}
            data-dialog-content
          >
            <h2 id="dialog-title">{title}</h2>
            {description && <p id="dialog-description">{description}</p>}
            {children}
            <button
              onClick={() => send('CLOSE')}
              data-testid="dialog-close"
            >
              Close
            </button>
          </div>
        </FocusTrap>
      )}
    </>
  );
}
```

---

## Appendix B: ARIA Patterns Checklist

Patterns to implement, ordered by complexity and usage:

### Tier 1: Critical (Implement First)
- [ ] Dialog / AlertDialog
- [ ] Menu / MenuButton
- [ ] Tabs
- [ ] Accordion / Disclosure
- [ ] Modal overlay management

### Tier 2: Common Forms
- [ ] Button (toggle states)
- [ ] Checkbox / CheckboxGroup
- [ ] Radio Group
- [ ] Switch
- [ ] Combobox (autocomplete)
- [ ] Listbox (select)
- [ ] Slider

### Tier 3: Navigation
- [ ] Breadcrumb
- [ ] Link
- [ ] Navigation (landmark)
- [ ] Pagination

### Tier 4: Data Display
- [ ] Alert
- [ ] Table (sortable, selectable)
- [ ] Grid
- [ ] Tree / TreeGrid
- [ ] Feed

### Tier 5: Advanced
- [ ] Carousel
- [ ] Date Picker
- [ ] Color Picker
- [ ] Toolbar
- [ ] Menubar

---

## Appendix C: References

### Standards
- [W3C ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WCAG 2.1 Guidelines](https://www.w3.org/TR/WCAG21/)
- [ARIA 1.2 Specification](https://www.w3.org/TR/wai-aria-1.2/)

### Libraries Analyzed
- [React Aria](https://react-spectrum.adobe.com/react-aria/)
- [Radix UI](https://www.radix-ui.com/)
- [Headless UI](https://headlessui.com/)
- [Ark UI / Zag.js](https://ark-ui.com/)
- [Gestalt (Pinterest)](https://gestalt.pinterest.systems/)

### Tools
- [XState](https://xstate.js.org/)
- [@xstate/test](https://xstate.js.org/docs/packages/xstate-test/)
- [axe-core](https://github.com/dequelabs/axe-core)
- [Storybook](https://storybook.js.org/)

### Research
- [Deque: Automated Testing Study](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/)
- [VA.gov Design System Accessibility Testing](https://design.va.gov/accessibility/accessibility-testing-for-design-system-components)
- [Adrian Roselli: Comparing Manual and Automated Testing](https://adrianroselli.com/2023/01/comparing-manual-and-free-automated-wcag-reviews.html)

---

*Document prepared for team discussion. Comments and feedback welcome.*

## Gemini review

This is a **conceptually brilliant** and technically rigorous proposal. It addresses the "last mile" problem of accessibility testing (behavioral correctness) that static analysis tools like `axe-core` fundamentally cannot solve.

By treating accessibility as a **finite state problem** rather than a **DOM attribute problem**, you move the verification from "fragile E2E tests" to "mathematically provable behavior."

Here is my detailed review of the architecture, broken down by strengths, risks, and specific recommendations for the Mindler context.

### 1. The Strongest Points (The "Why This Works")

*   **The "Meta" Contract is the Killer Feature:**
    The innovation here isn't just using XState (Zag.js does that). The innovation is the `meta.a11y` schema. By embedding the *expected accessibility outcome* directly into the state node, you create a self-documenting contract.
    *   *Impact:* It allows the test runner to say "The machine is in state `open`, therefore the DOM *must* have `aria-modal="true"`. If not, fail."
*   **Solving the React Native A11y Gap:**
    React Native accessibility is notoriously harder to test than Web because you don't have a DOM.
    *   *Impact:* By defining behavior in a platform-agnostic machine, you verify the logic once. You only need to write a thin "adapter" test to ensure the Native implementation honors the machine's state (e.g., mapping `aria-disabled` to the native `accessibilityState={{ disabled: true }}`).
*   **Exhaustive Path Coverage:**
    Manual testers test the "Happy Path" and maybe one error state. `model.getSimplePathPlans()` tests *every* weird transition sequence (e.g., Open Dialog -> Tab -> Tab -> Escape -> Enter). This catches focus trapping bugs that humans frequently miss.

### 2. Critical Risks & Challenges

*   **The "Zag.js" Dilemma (Reinventing the Wheel):**
    *   *Critique:* Writing robust, accessible state machines for complex components (Combobox, DatePicker) is incredibly difficult and notoriously edge-case prone.
    *   *Risk:* If you build your own "Combobox machine," you will spend months fixing bugs that the Zag.js team has already solved.
    *   *Recommendation:* Strongly consider **wrapping** or **forking** Zag.js machines rather than writing from scratch. Zag machines are XState-compatible. You could potentially use their logic and inject your `meta.a11y` properties, or use their machines as "sub-machines."
*   **Developer Experience (DX) Friction:**
    *   *Critique:* Writing a JSON-heavy state machine for a simple "Toggle Button" feels like overkill to many developers. It creates a high barrier to entry for shipping simple UI.
    *   *Risk:* Team rejection due to boilerplate fatigue.
    *   *Recommendation:* Create "Recipe" wrappers. Most devs should consume `<Accordion />` (which uses the machine internally) rather than instantiating the machine themselves.
*   **Runtime Overhead:**
    *   *Critique:* XState v5 is lighter, but 50 interactive elements on a React Native list (e.g., a list of cards with favoriting toggles) each running an actor can cause performance cliffs on lower-end Android devices.

### 3. Suggestions for Refinement

#### A. Refine the A11y Schema for "Focus Management"
Your current schema has `returnTo: string`. In practice, "return focus" is complex. Sometimes the element triggers a change that means the original trigger **no longer exists** (e.g., deleting an item from a list).
*   **Suggestion:** Change `returnTo` to support a fallback strategy or a "Focus Recovery" actor.

#### B. The "Linter" is ambitious (Phase 2)
Writing a static linter that checks if an XState machine graph satisfies an ARIA requirement is extremely hard because the graph is often dynamic.
*   **Suggestion:** Downgrade this priority or switch to **Runtime Validation** in development mode. A `useEffect` hook that screams in the console if the machine state is `open` but the rendered component is missing `aria-modal` is easier to build and just as effective.

#### C. Testing Strategy for React Native
Since you are using Expo/React Native, you cannot use Playwright directly on the native app.
*   **Suggestion:** Explicitly mention **Maestro** or **Detox** in the roadmap. The XState model can generate the *plans*, and you will need an adapter to execute those plans against the simulator.

### 4. Verdict for Mindler Workspace

Given your workspace structure (AGENTS.md, React Native, Docs-heavy approach):

1.  **Alignment:** This fits perfectly with the AGENTS.md directive for "Components need Storybook stories + accessibility tests." The proposed auto-generation of Storybook stories from machine states is a huge productivity booster.
2.  **Architecture:** You are already using TypeScript. The strict typing of the `meta` schema will prevent regression.

### Modified Roadmap Recommendation

I would alter **Phase 1** slightly:

*   **Don't build machines from scratch yet.**
*   **Task:** Take an *existing* complex component in Mindler (e.g., a custom modal or specialized input).
*   **Action:** Retrofit it with this XState architecture as a POC.
*   **Verify:** Does it catch bugs? accurately? Does it slow down the app?

### Final Thought
This is a "Principal Engineer level" proposal. It solves a systemic quality issue by lifting it into the architecture. If you can solve the DX friction (boilerplate), this could become a cornerstone of the application's quality strategy.

**Would you like me to generate a Typescript interface for the `meta.a11y` schema that handles the "Focus Recovery" edge case I mentioned?**


## Updated version incorparation gemini review and me challenging zag.js options as its open-source 

# Follow-up: Zag.js Integration Strategy & Gemini Review Response

**Document Version:** 1.1  
**Date:** January 2025  
**Status:** Addendum to Main Proposal

---

## Executive Summary

After reviewing Gemini's feedback, we agree that **building machines from scratch is not the right approach**. Instead, we should leverage Zag.js as the behavioral foundation and focus our effort on the **a11y metadata layer** - which is the actual innovation.

This document outlines three concrete strategies for Zag.js integration and responds to other key concerns raised.

---

## Part 1: The Zag.js Integration Strategy

### Why Zag.js is the Right Foundation

Zag.js already provides:
- ✅ Battle-tested state machines for 30+ components
- ✅ Framework-agnostic (React, Vue, Solid, Svelte)
- ✅ MIT licensed (full source available)
- ✅ XState-compatible patterns (even though it's a custom implementation)
- ✅ Keyboard navigation built-in
- ✅ Focus management utilities
- ✅ Active maintenance by Chakra UI team

What Zag.js **doesn't** have (our value-add):
- ❌ Declarative a11y metadata per state
- ❌ Model-based test generation
- ❌ WCAG criterion mapping
- ❌ Automated verification at each state
- ❌ Pattern conformance linting

### Three Integration Options

#### Option A: Metadata Injection Layer (Recommended)

**Concept:** Create a wrapper that takes a Zag.js machine and enriches it with a11y metadata without modifying Zag.js source.

```typescript
// our-lib/zag-a11y-wrapper.ts
import * as dialog from '@zag-js/dialog';
import type { A11yStateMeta } from './a11y-types';

// Define a11y metadata separately
const dialogA11yMeta: Record<string, A11yStateMeta> = {
  open: {
    description: 'Dialog is open and visible',
    aria: [
      {
        selector: '[data-scope="dialog"][data-part="content"]',
        attributes: {
          'aria-modal': 'true',
          role: 'dialog',
        },
      },
    ],
    focus: {
      target: '[data-scope="dialog"][data-part="content"] [data-autofocus]',
      trap: '[data-scope="dialog"][data-part="content"]',
      returnTo: 'triggerElement', // context key
    },
  },
  closed: {
    description: 'Dialog is closed',
    aria: [],
    focus: {},
  },
};

// Wrapper function that enriches the machine
export function createAccessibleDialog(config: dialog.Context) {
  const machine = dialog.machine(config);
  
  return {
    machine,
    a11yMeta: dialogA11yMeta,
    
    // Helper to get current a11y requirements
    getA11yRequirements(state: string) {
      return dialogA11yMeta[state];
    },
    
    // Test generation helper
    generateTestPaths() {
      return generatePathsFromZagMachine(machine, dialogA11yMeta);
    },
  };
}

// Usage
const { machine, a11yMeta } = createAccessibleDialog({ id: 'my-dialog' });
```

**Pros:**
- No fork required
- Zag.js updates automatically available
- Clean separation of concerns
- Can be contributed back upstream easily

**Cons:**
- Need to maintain metadata separately (could drift)
- Limited access to internal state structure

---

#### Option B: Fork with AST Transformation

**Concept:** Fork Zag.js and use AST transformation to auto-inject a11y metadata based on patterns.

```typescript
// build-script/inject-a11y-meta.ts
import { parse, traverse, generate } from '@babel/core';
import { zagA11yPatterns } from './patterns';

// Pattern matching rules
const zagA11yPatterns = {
  // If machine has 'open' and 'closed' states with certain transitions,
  // it's likely a disclosure/dialog pattern
  patterns: [
    {
      match: {
        states: ['open', 'closed'],
        events: ['OPEN', 'CLOSE', 'TOGGLE'],
      },
      inject: {
        open: { /* a11y meta */ },
        closed: { /* a11y meta */ },
      },
    },
    {
      match: {
        states: ['idle', 'focused', 'open'],
        events: ['ARROW_DOWN', 'ARROW_UP', 'ENTER', 'ESCAPE'],
      },
      // Likely a combobox/select pattern
      inject: { /* combobox a11y meta */ },
    },
  ],
};

// Transform Zag.js source files
export function transformZagMachine(sourceCode: string): string {
  const ast = parse(sourceCode);
  
  traverse(ast, {
    ObjectExpression(path) {
      if (isStateMachineDefinition(path)) {
        const pattern = detectPattern(path);
        if (pattern) {
          injectA11yMeta(path, pattern.inject);
        }
      }
    },
  });
  
  return generate(ast);
}
```

**Pros:**
- Full control over machine structure
- Can add metadata directly to state nodes
- Automated transformation means less manual maintenance

**Cons:**
- Fork maintenance burden
- AST transformation is complex and fragile
- Harder to contribute back

---

#### Option C: Upstream PR to Zag.js

**Concept:** Propose adding an optional `meta` field to Zag.js state definitions, then contribute a11y metadata for all components.

```typescript
// Proposed Zag.js enhancement
// packages/machines/dialog/src/dialog.machine.ts

export function machine(ctx: Context) {
  return createMachine({
    id: 'dialog',
    initial: 'closed',
    
    context: { ... },
    
    states: {
      closed: {
        // NEW: Optional meta field
        meta: {
          a11y: {
            description: 'Dialog is closed and not rendered',
          },
        },
        on: {
          OPEN: { target: 'open', actions: ['setInitialFocus'] },
        },
      },
      open: {
        meta: {
          a11y: {
            description: 'Dialog is open',
            focus: { trap: true, returnOnClose: true },
            aria: { modal: true },
          },
        },
        on: {
          CLOSE: { target: 'closed', actions: ['restoreFocus'] },
          ESCAPE: { target: 'closed', actions: ['restoreFocus'] },
        },
      },
    },
  });
}
```

**PR Strategy:**
1. Open discussion issue first explaining the use case
2. Propose minimal `meta` schema that doesn't break existing API
3. Offer to contribute a11y metadata for all ~30 components
4. Position it as "enhanced accessibility documentation"

**Pros:**
- Benefits entire community
- No fork maintenance
- Aligned with Zag.js mission (accessibility-first)
- Segun Adebayo (maintainer) is accessibility-focused

**Cons:**
- May be rejected or heavily modified
- Timeline depends on maintainer availability
- May need to simplify our schema to fit their vision

---

### Recommended Approach: Hybrid Strategy

```
Phase 1 (Weeks 1-4): Option A - Metadata Injection
├── Build wrapper layer for 4-5 critical components
├── Validate the a11y schema works with real Zag.js machines
├── Create test generation proof-of-concept
└── Measure: Does this catch real bugs?

Phase 2 (Weeks 5-8): Option C - Upstream Proposal
├── Based on Phase 1 learnings, refine the schema
├── Open Zag.js discussion/RFC
├── Contribute PR with a11y meta for all components
└── Engage with community feedback

Phase 3 (Ongoing): Maintain & Extend
├── If PR accepted: contribute improvements upstream
├── If PR rejected: maintain Option A wrapper (low overhead)
└── Build test generation tooling regardless
```

---

## Part 2: Responding to Gemini's Concerns

### Concern 1: Developer Experience (DX) Friction

> "Writing a JSON-heavy state machine for a simple Toggle Button feels like overkill"

**Response: Totally agree.** Developers should consume components, not machines.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    CONSUMPTION LAYERS                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: "Just Works" Components (90% of devs)             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ import { Dialog } from '@mindler/ui';               │    │
│  │                                                     │    │
│  │ <Dialog trigger={<Button>Open</Button>}>            │    │
│  │   <Dialog.Title>Confirm</Dialog.Title>              │    │
│  │   <Dialog.Content>Are you sure?</Dialog.Content>    │    │
│  │ </Dialog>                                           │    │
│  │                                                     │    │
│  │ // Machine is internal implementation detail        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 2: Controlled Components (10% of devs)               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ import { useDialog } from '@mindler/ui';            │    │
│  │                                                     │    │
│  │ const dialog = useDialog({                          │    │
│  │   onOpenChange: (open) => analytics.track(open),    │    │
│  │ });                                                 │    │
│  │                                                     │    │
│  │ <button {...dialog.triggerProps}>Open</button>      │    │
│  │ <div {...dialog.contentProps}>...</div>             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 3: Machine Access (Library maintainers only)         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ import { dialogMachine } from '@mindler/ui/machines';│    │
│  │                                                     │    │
│  │ // Full machine access for testing, debugging,      │    │
│  │ // or building custom variants                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** The machines power the components, but devs don't write them. Our job is to make the **library** correct, not to make every dev a state machine expert.

---

### Concern 2: Runtime Overhead

> "50 interactive elements each running an actor can cause performance cliffs on lower-end Android devices"

**Response: Valid concern, but solvable.**

**Mitigation strategies:**

```typescript
// Strategy 1: Shared machines for repeated patterns
// Instead of 50 actors for 50 list items...

// DON'T
items.map(item => (
  <FavoriteButton key={item.id} /> // Each has own machine
));

// DO
const listMachine = createListFavoritesMachine(items);

items.map(item => (
  <FavoriteButton 
    key={item.id}
    isFavorited={state.context.favorites.has(item.id)}
    onToggle={() => send({ type: 'TOGGLE_FAVORITE', id: item.id })}
  />
));
```

```typescript
// Strategy 2: Lazy actor spawning
// Only spawn machine when interaction begins

function Dialog({ children }) {
  const [isActive, setIsActive] = useState(false);
  
  // Machine only created when dialog is first opened
  const machine = useMemo(
    () => isActive ? createDialogMachine() : null,
    [isActive]
  );
  
  return (
    <button onClick={() => setIsActive(true)}>
      Open
    </button>
    {machine && <DialogContent machine={machine}>{children}</DialogContent>}
  );
}
```

```typescript
// Strategy 3: Use Zag.js's connect pattern
// Zag.js is already optimized for this - it doesn't use XState's full actor model

import * as toggle from '@zag-js/toggle';
import { useMachine, normalizeProps } from '@zag-js/react';

function Toggle() {
  const [state, send] = useMachine(toggle.machine({ id: '1' }));
  const api = toggle.connect(state, send, normalizeProps);
  
  // api is a plain object, no actor overhead
  return <button {...api.buttonProps}>Toggle</button>;
}
```

**Benchmark requirement:** Add to Phase 1 POC:
- Test with 100+ interactive elements on low-end device (Android Go)
- Compare against current implementation
- If >10% slower, investigate optimization or architectural changes

---

### Concern 3: Focus Management Complexity

> "returnTo is complex. Sometimes the original trigger no longer exists"

**Response: Great catch.** Here's an enhanced schema:

```typescript
interface FocusRecoveryStrategy {
  // Primary target (element that triggered the modal)
  primary: string | null;
  
  // Fallback targets in priority order
  fallbacks: Array<{
    // CSS selector or context key
    target: string;
    // Condition for using this fallback
    condition?: 'primary-missing' | 'primary-disabled' | 'always-try';
  }>;
  
  // Ultimate fallback behavior
  ultimateFallback: 
    | 'document-body'
    | 'first-focusable'
    | 'skip-link'
    | { custom: (context: any) => HTMLElement | null };
}

// Example usage
const dialogA11yMeta = {
  closed: {
    focus: {
      recovery: {
        primary: 'triggerElement', // context key
        fallbacks: [
          { 
            target: '[data-focus-fallback]', 
            condition: 'primary-missing' 
          },
          { 
            target: 'main [href], main button', 
            condition: 'primary-missing' 
          },
        ],
        ultimateFallback: 'skip-link',
      },
    },
  },
};
```

**Real-world scenarios this handles:**

| Scenario | Primary | Fallback |
|----------|---------|----------|
| Normal close | Trigger button | - |
| Delete item (trigger gone) | ❌ | Next item in list |
| Delete last item | ❌ | "Add new" button |
| All items deleted | ❌ | Main content area |

---

### Concern 4: Linter is Ambitious

> "Static linter that checks XState graph is extremely hard"

**Response: Agree. Runtime validation is better.**

**Revised approach: Development-time Runtime Validator**

```typescript
// Instead of static analysis, use runtime checks in development

import { createAccessibilityValidator } from '@mindler/ui/dev-tools';

// In development, wrap components with validator
export function Dialog(props) {
  const [state, send] = useMachine(dialogMachine);
  
  // Only in development
  if (process.env.NODE_ENV === 'development') {
    useA11yValidator({
      machine: dialogMachine,
      currentState: state,
      domRoot: contentRef.current,
      meta: dialogA11yMeta,
    });
  }
  
  return <DialogImpl {...props} state={state} send={send} />;
}

// The validator hook
function useA11yValidator({ machine, currentState, domRoot, meta }) {
  useEffect(() => {
    if (!domRoot) return;
    
    const stateName = currentState.value;
    const requirements = meta[stateName];
    
    if (!requirements) {
      console.warn(`[A11y] No a11y metadata for state: ${stateName}`);
      return;
    }
    
    // Check ARIA attributes
    for (const { selector, attributes } of requirements.aria || []) {
      const element = domRoot.querySelector(selector);
      if (!element) {
        console.error(`[A11y] Missing element: ${selector} in state: ${stateName}`);
        continue;
      }
      
      for (const [attr, expected] of Object.entries(attributes)) {
        const actual = element.getAttribute(attr);
        if (actual !== String(expected)) {
          console.error(
            `[A11y] Attribute mismatch in state "${stateName}":\n` +
            `  Element: ${selector}\n` +
            `  Attribute: ${attr}\n` +
            `  Expected: ${expected}\n` +
            `  Actual: ${actual}`
          );
        }
      }
    }
    
    // Check focus
    if (requirements.focus?.target) {
      const expectedFocus = domRoot.querySelector(requirements.focus.target);
      if (document.activeElement !== expectedFocus) {
        console.warn(
          `[A11y] Focus should be on "${requirements.focus.target}" in state "${stateName}"`
        );
      }
    }
    
  }, [currentState, domRoot]);
}
```

**Benefits:**
- Immediate feedback during development
- No complex graph analysis
- Catches real mismatches, not theoretical ones
- Zero production overhead (tree-shaken out)

---

### Concern 5: React Native Testing (Maestro/Detox)

> "Playwright cannot test native apps"

**Response: Absolutely right.** Here's the testing strategy breakdown:

```
┌─────────────────────────────────────────────────────────────┐
│                 TESTING STRATEGY BY PLATFORM                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SHARED (Machine Logic)                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Tool: Vitest / Jest                                 │    │
│  │ What: Pure machine state transitions                │    │
│  │                                                     │    │
│  │ // Test that machine behaves correctly              │    │
│  │ test('escape closes dialog', () => {                │    │
│  │   const state = dialogMachine.transition(           │    │
│  │     'open',                                         │    │
│  │     { type: 'KEYDOWN.ESCAPE' }                      │    │
│  │   );                                                │    │
│  │   expect(state.value).toBe('closed');               │    │
│  │ });                                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  WEB (DOM Verification)                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Tool: Playwright + @axe-core/playwright             │    │
│  │ What: Full model-based testing with DOM assertions  │    │
│  │                                                     │    │
│  │ // Generated from machine + a11y meta               │    │
│  │ test('dialog a11y: open state', async ({ page }) => {│    │
│  │   await page.click('[data-testid="trigger"]');      │    │
│  │   await expect(page.locator('[role="dialog"]'))     │    │
│  │     .toHaveAttribute('aria-modal', 'true');         │    │
│  │   await checkA11y(page);                            │    │
│  │ });                                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  REACT NATIVE (Accessibility API Verification)               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Tool: Maestro / Detox                               │    │
│  │ What: Verify native accessibility props             │    │
│  │                                                     │    │
│  │ # Maestro flow (generated from machine paths)       │    │
│  │ - tapOn:                                            │    │
│  │     id: "dialog-trigger"                            │    │
│  │ - assertVisible:                                    │    │
│  │     id: "dialog-content"                            │    │
│  │ - assertTrue:                                       │    │
│  │     condition: ${element.accessibilityRole} == 'dialog' │  │
│  │ - pressKey: Escape                                  │    │
│  │ - assertNotVisible:                                 │    │
│  │     id: "dialog-content"                            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  STORYBOOK (Visual + Interactive)                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Tool: Storybook + Chromatic + addon-a11y            │    │
│  │ What: Visual regression + axe-core on all states    │    │
│  │                                                     │    │
│  │ // Auto-generated stories from machine states       │    │
│  │ export const DialogOpen = {                         │    │
│  │   play: async ({ canvasElement }) => {              │    │
│  │     // Interaction to reach 'open' state            │    │
│  │   },                                                │    │
│  │ };                                                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Maestro Test Generation:**

```typescript
// Generate Maestro flows from machine paths
function generateMaestroFlow(
  machinePath: Path,
  a11yMeta: Record<string, A11yStateMeta>
): string {
  const steps: string[] = ['appId: com.mindler.app'];
  
  for (const segment of machinePath.segments) {
    // Convert event to Maestro action
    const action = eventToMaestroAction(segment.event);
    steps.push(action);
    
    // Add a11y assertions for the resulting state
    const stateMeta = a11yMeta[segment.state.value];
    if (stateMeta) {
      steps.push(...generateA11yAssertions(stateMeta));
    }
  }
  
  return steps.join('\n');
}

function eventToMaestroAction(event: MachineEvent): string {
  switch (event.type) {
    case 'OPEN':
      return `- tapOn:\n    id: "${event.triggerId}"`;
    case 'KEYDOWN.ESCAPE':
      return '- pressKey: Escape';
    case 'KEYDOWN.TAB':
      return '- pressKey: Tab';
    default:
      return `# Unknown event: ${event.type}`;
  }
}

function generateA11yAssertions(meta: A11yStateMeta): string[] {
  const assertions: string[] = [];
  
  // Example: Check accessibility role
  if (meta.aria) {
    for (const { selector, attributes } of meta.aria) {
      if (attributes.role) {
        assertions.push(
          `- assertTrue:\n    condition: element("${selector}").accessibilityRole == "${attributes.role}"`
        );
      }
    }
  }
  
  return assertions;
}
```

---

## Part 3: Revised Roadmap (Incorporating Feedback)

### Phase 0: POC on Existing Component (Weeks 1-2) ⭐ NEW

**Gemini's suggestion: Retrofit an existing component first.**

```
Goal: Validate the approach catches real bugs without breaking performance

Target: Pick ONE complex existing component (e.g., appointment modal)

Tasks:
□ Extract implicit state machine from current implementation
□ Rewrite as Zag.js + a11y metadata wrapper
□ Run model-based tests - do they catch known bugs?
□ Benchmark performance on low-end Android
□ Developer feedback: Is this better or worse to work with?

Success Criteria:
□ Catches at least 1 real accessibility bug
□ No more than 10% performance regression
□ Dev team doesn't hate it
```

### Phase 1: Foundation (Weeks 3-6)

```
Goal: Production-ready a11y wrapper for Zag.js

Tasks:
□ Define TypeScript a11y metadata schema (refined from POC)
□ Build wrapper layer for 5 critical components:
  - Dialog/Modal
  - Menu
  - Tabs  
  - Accordion
  - Combobox (Select)
□ Runtime development validator (not static linter)
□ Basic test generation from paths
□ Storybook integration (auto-generate stories from states)

Deliverables:
□ @mindler/ui-machines package
□ @mindler/a11y-validator package (dev-only)
□ @mindler/storybook-machines addon
```

### Phase 2: Zag.js Collaboration (Weeks 7-10)

```
Goal: Contribute upstream, reduce maintenance burden

Tasks:
□ Open RFC on Zag.js repo for meta.a11y support
□ Prepare PR with a11y metadata for all 30+ components
□ Engage with maintainer feedback
□ Adjust schema based on community input

Fallback (if rejected):
□ Continue with wrapper approach
□ Publish @mindler/zag-a11y-metadata as community package
```

### Phase 3: React Native & Full Coverage (Weeks 11-14)

```
Goal: Complete testing pipeline for both platforms

Tasks:
□ Maestro test generation from machine paths
□ React Native accessibility prop mappings
□ Platform-specific a11y metadata (where needed)
□ CI integration (web: Playwright, native: Maestro)
□ Coverage reporting

Deliverables:
□ @mindler/maestro-machines test generator
□ CI pipeline running a11y tests on every PR
□ Dashboard showing WCAG coverage by component
```

### Phase 4: Documentation & Team Enablement (Weeks 15-16)

```
Goal: Team can use this confidently

Tasks:
□ Developer guide: "Using accessible components"
□ Maintainer guide: "Adding a11y metadata to machines"
□ Video walkthrough
□ Migration guide for remaining components
□ A11y testing playbook

Success Criteria:
□ Any dev can build accessible features without understanding machines
□ Adding a11y metadata to new component takes < 1 hour
□ 0 accessibility regressions in production
```

---

## Part 4: Decision Matrix Update

Given Gemini's feedback and the Zag.js integration options:

| Decision | Original Proposal | Revised Recommendation |
|----------|-------------------|----------------------|
| Build vs. Wrap | Build from scratch | **Wrap Zag.js** (Option A) |
| Static Linter | Phase 2 priority | **Deprioritize** (runtime validation instead) |
| First Step | Build Dialog machine | **Retrofit existing component** (POC) |
| DX Approach | Expose machines | **Hide machines behind components** |
| RN Testing | "Consider later" | **Maestro from Week 11** |
| Timeline | 16 weeks | **16 weeks** (shifted priorities) |

---

## Appendix: Quick Reference - Zag.js Integration Points

### Where to inject a11y metadata in Zag.js architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    ZAG.JS ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  @zag-js/dialog                                             │
│  ├── dialog.machine.ts    ← We can't modify (upstream)      │
│  ├── dialog.connect.ts    ← We can't modify (upstream)      │
│  └── dialog.types.ts      ← We can't modify (upstream)      │
│                                                              │
│  @mindler/ui-machines                                        │
│  ├── dialog.a11y.ts       ← OUR A11Y METADATA              │
│  ├── dialog.wrapper.ts    ← WRAPS ZAG MACHINE + META        │
│  ├── dialog.tests.ts      ← GENERATED FROM META             │
│  └── dialog.stories.ts    ← GENERATED FROM MACHINE STATES   │
│                                                              │
│  @mindler/ui                                                 │
│  └── Dialog.tsx           ← COMPONENT USING WRAPPER         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Mapping Zag.js states to our a11y metadata:

```typescript
// Zag.js dialog has these states (from source):
// - 'closed'
// - 'open'  
// - 'closing' (animation state)

// Our metadata maps to these:
const dialogA11yMeta: Record<ZagDialogState, A11yStateMeta> = {
  closed: {
    description: 'Dialog not rendered',
    aria: [],
    focus: { recovery: { ... } },
  },
  open: {
    description: 'Dialog visible and interactive', 
    aria: [{ selector: '[data-part="content"]', attributes: { 'aria-modal': 'true' } }],
    focus: { trap: '[data-part="content"]' },
  },
  closing: {
    description: 'Dialog animating closed',
    aria: [{ selector: '[data-part="content"]', attributes: { 'aria-hidden': 'true' } }],
    focus: { recovery: { ... } }, // Start returning focus during animation
  },
};
```

---

## Summary

The refined strategy is:

1. **Don't reinvent the wheel** - Use Zag.js as the behavioral foundation
2. **Focus on our unique value** - The a11y metadata layer and test generation
3. **Validate before committing** - POC on existing component first
4. **Hide complexity from devs** - They use components, not machines
5. **Contribute upstream** - Try to get a11y meta into Zag.js core
6. **Runtime over static** - Development-time validation beats linting

This approach gives us 80% of the benefits with 20% of the risk.

---

*Ready for team discussion. Key questions to answer:*

1. *Which existing component should we retrofit for the POC?*
2. *Who should own the Zag.js upstream conversation?*
3. *What's our fallback if Zag.js rejects the PR?*
4.
