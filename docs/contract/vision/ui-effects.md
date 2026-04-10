# UI Effects: From Components to Documentation

> Making UI components, accessibility, and Storybook queryable through the effect model.

**Related Documents**:
- [foundation.md](./foundation.md) — Effect handler pattern, core concepts
- [actors.md](./actors.md) — State machines as higher-level effects
- [concepts.md](./concepts.md) — Glossary and Four Pillars

**Implementation**: See [jsx-extraction.md](../implementation/jsx-extraction.md) for how to build this.

---

## 1. The Vision

UI components contain rich semantic information that should be queryable:

```
┌─────────────────────────────────────────────────────────────┐
│              UI as Queryable Effects                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  JSX Components    →  Component hierarchy, props, state      │
│  A11y Attributes   →  Roles, labels, keyboard accessibility  │
│  Storybook Stories →  Documentation + test-driven effects    │
│                                                              │
│  Together: Complete, validated component documentation.      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**The thesis**: By extracting UI semantics as effects, we can:
1. Query component structure and relationships
2. Validate accessibility compliance via graph queries
3. Use Storybook as both documentation AND runtime validation
4. Connect UI behavior to underlying state machines (Actors)

---

## 2. The UI Effect Model

### 2.1 From Code to Effects

```
┌──────────────────────────────────────────────────────────────┐
│                    UI Effect Pipeline                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Component.tsx                                                │
│       │                                                       │
│       ▼                                                       │
│  ┌─────────────┐                                              │
│  │  AST Parse  │  Extract JSX elements and their props        │
│  └──────┬──────┘                                              │
│         │                                                     │
│         ▼                                                     │
│  ┌─────────────┐                                              │
│  │ JSX Nodes   │  kind: jsx_component, jsx_element            │
│  │ with Props  │  props: role, aria-*, onClick, etc.          │
│  └──────┬──────┘                                              │
│         │                                                     │
│         ▼                                                     │
│  ┌─────────────┐                                              │
│  │ A11y Props  │  Accessibility attributes as node properties │
│  │ Extracted   │  Relationships as edges (LABELS, CONTROLS)   │
│  └──────┬──────┘                                              │
│         │                                                     │
│         ▼                                                     │
│  ┌─────────────┐                                              │
│  │   Effects   │  Queryable in seeds                          │
│  │   in Seeds  │  Part of component's effect signature        │
│  └─────────────┘                                              │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 What Gets Extracted

| Source | Becomes | Queryable As |
|--------|---------|--------------|
| `<Button>` | `jsx_component` node | Component instances |
| `role="button"` | Node property | Interactive elements |
| `aria-label="Submit"` | Node property | Accessible names |
| `aria-controls="form-1"` | REFERENCES edge | Element relationships |
| `onClick={handler}` | Node property + edge | Event handlers |
| `tabIndex={0}` | Node property | Keyboard accessibility |

---

## 3. Storybook as Documentation

### 3.1 The Dual Role of Stories

Storybook stories serve two purposes that align perfectly with DevAC's model:

```
┌─────────────────────────────────────────────────────────────┐
│              Storybook = Documentation + Validation          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐         ┌─────────────────┐            │
│  │     Story       │         │   Play Test     │            │
│  │                 │         │                 │            │
│  │  Documents a    │    +    │  Validates the  │            │
│  │  component      │         │  behavior       │            │
│  │  state          │         │                 │            │
│  └────────┬────────┘         └────────┬────────┘            │
│           │                           │                      │
│           └───────────┬───────────────┘                      │
│                       ▼                                      │
│           ┌─────────────────────┐                           │
│           │  Complete Component │                           │
│           │  Documentation      │                           │
│           │  (Visual + Behavior)│                           │
│           └─────────────────────┘                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Stories document states**: Each story represents a valid component state.

**Play tests document behavior**: Interactions show how the component responds.

**Combined**: A complete specification that's also executable.

### 3.2 Stories as Effect Sources

When Storybook runs with OTel instrumentation, play tests produce runtime effects:

```typescript
// This story documents AND validates
export const DialogFlow: Story = {
  play: async ({ canvasElement }) => {
    // Each interaction produces OTel spans
    await userEvent.click(screen.getByText("Open"));
    // Span: StateTransition { from: "closed", to: "open" }
    
    await userEvent.type(screen.getByRole("textbox"), "Hello");
    // Span: Store { target: "inputValue", value: "Hello" }
    
    await userEvent.click(screen.getByText("Submit"));
    // Span: FunctionCall { name: "onSubmit" }
  }
};
```

These spans correlate with static effects via entity IDs.

### 3.3 The Effect-Storybook Mapping

```
┌──────────────────────────────────────────────────────────────┐
│          Static Effects → Story Coverage                      │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Component.tsx                    Component.stories.tsx       │
│       │                                   │                   │
│       │ Static extraction                 │ Runtime execution │
│       ▼                                   ▼                   │
│  ┌──────────┐                     ┌──────────────┐           │
│  │ Effects  │                     │  Play tests  │           │
│  │ (AST)    │                     │  (OTel)      │           │
│  └────┬─────┘                     └──────┬───────┘           │
│       │                                  │                    │
│       └──────────────┬───────────────────┘                    │
│                      ▼                                        │
│              ┌───────────────┐                                │
│              │  Correlation  │                                │
│              │    Index      │                                │
│              └───────┬───────┘                                │
│                      ▼                                        │
│  "Dialog: 3 states, 5 transitions, 100% story coverage"      │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Query**: "Which effects have no Storybook coverage?"
**Answer**: Effects that are static-only, never executed by any play test.

---

## 4. Accessibility as Queryable State

### 4.1 WCAG via Graph Queries

Accessibility validation becomes SQL queries over the extracted graph:

```sql
-- Find buttons without accessible names
SELECT * FROM nodes 
WHERE kind = 'jsx_component' 
  AND properties->>'role' = 'button'
  AND properties->>'ariaLabel' IS NULL
  AND properties->>'ariaLabelledBy' IS NULL;

-- Find broken aria-controls references
SELECT e.*, n.name as target_missing
FROM edges e
LEFT JOIN nodes n ON e.target_entity_id = n.entity_id
WHERE e.properties->>'reference_type' = 'aria-controls'
  AND n.entity_id IS NULL;

-- Find non-keyboard-accessible interactive elements
SELECT * FROM nodes
WHERE kind = 'jsx_component'
  AND properties->>'hasOnClick' = 'true'
  AND (properties->>'tabIndex' IS NULL OR properties->>'tabIndex' = '-1')
  AND properties->>'hasOnKeyDown' IS NULL;
```

### 4.2 A11y Relationships as Edges

ARIA relationships become queryable edges:

| ARIA Attribute | Edge Type | Meaning |
|----------------|-----------|---------|
| `aria-controls` | REFERENCES (controls) | This element controls another |
| `aria-labelledby` | REFERENCES (labels) | Another element labels this |
| `aria-describedby` | REFERENCES (describes) | Another element describes this |
| `aria-owns` | CONTAINS | Virtual containment |

### 4.3 A11y in the Validation Pipeline

Accessibility issues appear alongside type errors and lint violations:

```
devac status

Diagnostics:
  TypeScript: 0 errors
  ESLint: 2 warnings
  A11y: 3 issues
    - Button "Submit" has no accessible name (WCAG 4.1.2)
    - aria-controls="modal-1" points to non-existent element
    - Interactive element not keyboard accessible
```

---

## 5. Connecting UI to Actors

### 5.1 The Bridge

UI components often implement state machines. The effect hierarchy connects them:

```
┌─────────────────────────────────────────────────────────────┐
│              UI Components → Actors                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Dialog.tsx                                                  │
│       │                                                      │
│       ├── JSX elements (buttons, form fields)               │
│       │      └── A11y attributes                            │
│       │                                                      │
│       └── State management                                   │
│              ├── useState("isOpen")                         │
│              ├── Event handlers (onClick, onSubmit)         │
│              └── Conditional rendering                      │
│                                                              │
│  Extracted as:                                               │
│       │                                                      │
│       ├── jsx_component nodes (UI structure)                │
│       ├── A11y property + edges (accessibility)             │
│       └── Actor effect (behavioral state machine)           │
│                                                              │
│  Query: "Show Dialog's states, transitions, and A11y"       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Complete Component Documentation

When UI effects and Actors combine:

```
Dialog Component
├── Visual: [Storybook stories]
├── States: idle → open → submitting → success/error
├── A11y: role=dialog, aria-modal, focus trap
├── Transitions: OPEN, CLOSE, SUBMIT, RETRY
└── Test Coverage: 100% (all transitions exercised)
```

This IS the documentation—queryable, validated, always up-to-date.

---

## 6. The Vision Realized

When complete, you can answer:

- "List all interactive components in this app"
- "Which components have A11y issues?"
- "What state machines do UI components implement?"
- "Which component states have no Storybook stories?"
- "Show the complete behavior specification for Dialog"

**The unifying insight**: UI components, accessibility, Storybook, and state machines are all aspects of the same thing—**what the system does**. The effect model makes them all queryable in one language.

---

## 7. Note on Implementation Documentation

> Implementation details (how to extract JSX, how to integrate with Storybook) are generated from the code by DevAC. This vision document describes the conceptual model.

See:
- [jsx-extraction.md](../implementation/jsx-extraction.md) — JSX parsing implementation
- [gaps.md](../spec/gaps.md) — What's not yet implemented

---

*Version: 1.0 — Vision for UI effects extraction*
*Connects to [actors.md](./actors.md) for state machine representation.*
