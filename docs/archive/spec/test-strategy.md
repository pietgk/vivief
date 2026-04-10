# Test Strategy for Effect Validation

> How different test types contribute to validating static effect analysis.

**Related Documents**:
- [actors.md](../vision/actors.md) — State machines as effects
- [ui-effects.md](../vision/ui-effects.md) — UI components and Storybook integration
- [otel-integration.md](../implementation/otel-integration.md) — OpenTelemetry implementation

---

## 1. The Core Concept

Tests are the primary source of **runtime effects** that validate static analysis:

```
┌──────────────────────────────────────────────────────────────┐
│                Test-Driven Effect Validation                  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐   │
│  │   Static    │      │    Tests    │      │ Correlation │   │
│  │  Analysis   │      │  (Runtime)  │      │    Index    │   │
│  ├─────────────┤      ├─────────────┤      ├─────────────┤   │
│  │             │      │             │      │             │   │
│  │ Code → AST  │      │ Unit tests  │      │ Static ID   │   │
│  │      ↓      │      │ Integration │ ──▶  │ matches     │   │
│  │ Effects     │      │ Storybook   │      │ Runtime ID  │   │
│  │ with IDs    │ ──▶  │ E2E tests   │      │             │   │
│  │             │      │      ↓      │      │ = Validated │   │
│  │             │      │ OTel spans  │ ──▶  │             │   │
│  └─────────────┘      └─────────────┘      └─────────────┘   │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Why tests, not live observation?**
- Tests are deterministic and repeatable
- No custom browser instrumentation needed
- CI/CD naturally produces runtime data
- OTel is a mature standard

---

## 2. Test Types and Their Contributions

Each test type produces different kinds of runtime effects:

| Test Type | Scope | Effect Types Validated | Actor Coverage |
|-----------|-------|----------------------|----------------|
| **Unit tests** | Function-level | FunctionCall, Store, Retrieve | Individual transitions |
| **Integration tests** | Cross-component | Effect sequences, Send | Transition flows |
| **Storybook play tests** | UI interaction | UI effects, StateTransition | Component state machines |
| **E2E tests (Playwright)** | Full journeys | Complete flows, ActorSystem | System-level actors |

### 2.1 Unit Tests

**What they validate**: Individual functions work correctly.

**Effects produced**: `FunctionCall`, `Store`, `Retrieve` at function level.

```typescript
// unit test
describe("calculateTotal", () => {
  it("sums items correctly", () => {
    // Produces: FunctionCall { name: "calculateTotal" }
    const result = calculateTotal([{ price: 10 }, { price: 20 }]);
    expect(result).toBe(30);
  });
});
```

**Coverage type**: Effect reachability (this effect was executed).

### 2.2 Integration Tests

**What they validate**: Components work together.

**Effects produced**: Effect sequences across function boundaries.

```typescript
// integration test
describe("PaymentFlow", () => {
  it("processes payment end-to-end", async () => {
    // Produces: FunctionCall sequence with trace context
    const result = await processPayment({ amount: 100 });
    // Trace shows: validateCard → chargeCard → sendReceipt
    expect(result.status).toBe("success");
  });
});
```

**Coverage type**: Transition sequences (this path was taken).

### 2.3 Storybook Play Tests

**What they validate**: UI interactions trigger correct behaviors.

**Effects produced**: `StateTransition`, UI effects, component events.

```typescript
// Component.stories.tsx
export const DialogFlow: Story = {
  play: async ({ canvasElement }) => {
    // Each interaction produces OTel spans
    
    await userEvent.click(screen.getByText("Open"));
    // Span: StateTransition { from: "closed", to: "open", event: "OPEN" }
    
    await userEvent.type(screen.getByRole("textbox"), "Hello");
    // Span: Store { target: "inputValue" }
    
    await userEvent.click(screen.getByText("Submit"));
    // Span: FunctionCall { name: "handleSubmit" }
    // Span: StateTransition { from: "open", to: "submitting" }
  }
};
```

**Coverage type**: Actor state coverage (which states/transitions exercised).

### 2.4 E2E Tests (Playwright)

**What they validate**: Complete user journeys across the system.

**Effects produced**: Full ActorSystem behavior.

```typescript
// e2e/booking.spec.ts
test("complete booking journey", async ({ page }) => {
  // Trace captures full user journey
  await page.goto("/booking");
  await page.click('text="Select Time"');
  await page.click('text="10:00 AM"');
  await page.click('text="Confirm"');
  
  // Produces: ActorSystem trace showing:
  // BookingActor: idle → selecting → confirming → complete
  // PaymentActor: idle → processing → success
  // Communication: BookingActor → PaymentActor (PROCESS_PAYMENT)
});
```

**Coverage type**: System behavior validation.

---

## 3. Storybook as Documentation

### 3.1 The Dual Purpose

Storybook stories are both documentation AND validation:

```
┌─────────────────────────────────────────────────────────────┐
│              Storybook = Docs + Tests                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Story (visual state)     +     Play test (behavior)         │
│         ↓                              ↓                     │
│  "What it looks like"          "How it responds"             │
│         ↓                              ↓                     │
│         └──────────────┬───────────────┘                     │
│                        ▼                                     │
│           Complete Component Spec                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Stories Document States

Each story represents a valid component state:

```typescript
// Button.stories.tsx
export const Default: Story = { args: { children: "Click me" } };
export const Loading: Story = { args: { loading: true } };
export const Disabled: Story = { args: { disabled: true } };
export const WithIcon: Story = { args: { icon: <ArrowIcon /> } };
```

These stories document: "Button has 4 documented states."

### 3.3 Play Tests Document Behavior

Play functions document interactions:

```typescript
export const FormSubmission: Story = {
  play: async ({ canvasElement }) => {
    // This documents: "User can type and submit"
    await userEvent.type(input, "test@example.com");
    await userEvent.click(submitButton);
    await expect(successMessage).toBeVisible();
  }
};
```

This documents: "Form responds to input and submission."

### 3.4 Coverage Queries

With effect correlation, you can query:

```sql
-- Components without Storybook coverage
SELECT DISTINCT n.name, n.file_path
FROM nodes n
LEFT JOIN effect_validation ev ON n.entity_id = ev.entity_id
WHERE n.kind = 'jsx_component'
  AND ev.story_coverage IS NULL;

-- Transitions never exercised by play tests
SELECT t.* 
FROM effects t
WHERE t.effect_type = 'StateTransition'
  AND t.entity_id NOT IN (
    SELECT entity_id FROM effect_validation 
    WHERE source = 'storybook'
  );
```

---

## 4. The Correlation Mechanism

### 4.1 How It Works

Tests produce OTel spans with entity IDs matching static effects:

```
Static Effect (from AST):
{
  entity_id: "repo:app/Dialog.tsx:function:abc123",
  effect_type: "FunctionCall",
  name: "handleSubmit"
}

Runtime Span (from test):
{
  name: "FunctionCall:handleSubmit",
  attributes: {
    "devac.entity_id": "repo:app/Dialog.tsx:function:abc123",
    "devac.effect_type": "FunctionCall"
  }
}

Match: entity_id === attributes["devac.entity_id"]
Result: Effect is "validated" (not just "static")
```

### 4.2 Correlation Queries

```sql
-- Effect validation status
SELECT 
  e.entity_id,
  e.effect_type,
  e.name,
  CASE 
    WHEN v.runtime_count > 0 THEN 'validated'
    ELSE 'static_only'
  END as status,
  v.runtime_count,
  v.test_sources -- ['unit', 'storybook', 'e2e']
FROM effects e
LEFT JOIN effect_validation v ON e.entity_id = v.entity_id;

-- Coverage by test type
SELECT 
  effect_type,
  COUNT(*) as total,
  SUM(CASE WHEN 'unit' = ANY(test_sources) THEN 1 ELSE 0 END) as unit_covered,
  SUM(CASE WHEN 'storybook' = ANY(test_sources) THEN 1 ELSE 0 END) as story_covered,
  SUM(CASE WHEN 'e2e' = ANY(test_sources) THEN 1 ELSE 0 END) as e2e_covered
FROM effect_validation
GROUP BY effect_type;
```

---

## 5. Best Practices

### 5.1 Test Type Selection

| Goal | Recommended Test Type |
|------|----------------------|
| Validate a function works | Unit test |
| Validate component interaction | Storybook play test |
| Validate multi-component flow | Integration test |
| Validate user journey | E2E test |
| Document component states | Storybook stories |
| Document component behavior | Storybook play tests |

### 5.2 Coverage Goals

| Level | Target | Rationale |
|-------|--------|-----------|
| Effects | 80%+ validated | Core functionality exercised |
| StateTransitions | 100% | All state changes tested |
| Actors | 100% states visited | Complete state coverage |
| A11y interactions | 100% | All interactive elements reachable |

### 5.3 Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Alternative |
|--------------|--------------|-------------|
| Testing implementation details | Brittle tests | Test behavior via effects |
| Skipping play tests | Missing UI validation | Add play test for each story |
| Only E2E tests | Slow feedback | Use unit + integration base |
| No OTel in tests | No correlation | Enable OTel in test setup |

---

## 6. Implementation Notes

> This document describes the test strategy. For implementation:

- **OTel setup**: See [otel-integration.md](../implementation/otel-integration.md)
- **Current gaps**: See [gaps.md](./gaps.md)
- **Test infrastructure**: Generated from code by DevAC

---

*Version: 1.0 — Test strategy for effect validation*
