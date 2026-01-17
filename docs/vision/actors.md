# Actor Model: State Machines as Effects

> Extending DevAC's effect model to discover, represent, and validate stateful behavior as first-class Actors.

**Related Documents**:
- [concepts.md](./concepts.md) — Core thesis, Four Pillars, glossary
- [foundation.md](./foundation.md) — Effect handler pattern, effect types, rules
- [validation.md](./validation.md) — Watch → Validate → Cache → Query
- [ui-effects.md](./ui-effects.md) — JSX components, A11y, Storybook integration

**Implementation**: See [actor-discovery.md](../implementation/actor-discovery.md) for how to build this.

---

## 1. The Problem We're Solving

Code contains implicit state machines that aren't queryable:

```
┌─────────────────────────────────────────────────────────────┐
│                 Hidden State Machines                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  useState/useReducer     →  States: closed, open            │
│  Event handlers          →  Flow: idle → validating → done  │
│  Conditional logic       →  States: anonymous, authenticated│
│  UI flows (dialogs)      →  Complete machine in handlers    │
│                                                              │
│  These ARE the documentation but they're not queryable.     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**The gap**: DevAC extracts effects (FunctionCall, Store, Condition) but doesn't compose them into the **state machines they represent**.

**Our thesis**: State machines ARE documentation—they describe what the system does. By treating them as **higher-level effects** (Actors), we can query, validate, and document them automatically.

---

## 2. Core Concept: Actors as Higher-Level Effects

### 2.1 Why Actors?

**Actors ARE documentation**. A state machine describing a dialog's behavior IS the specification:
- States it can be in (idle, open, submitting, error)
- Events that cause transitions (OPEN, CLOSE, SUBMIT)
- Actions performed on transitions (focus trap, API call)

**Actors follow the same pattern**. The effect handler formula from [foundation.md](./foundation.md):

```
effectHandler = (state, effect) => (state', [effect'])
```

Applies directly to actors:

```
dialogHandler = (DialogState, UserEvent) => (DialogState', [FocusMove, APICall])
```

**Actors enable composition**. Actors can contain other actors, creating a hierarchy that maps naturally to system architecture.

### 2.2 The Effect Hierarchy

Building on [foundation.md Section 5.5](./foundation.md#55-effect-hierarchies):

```
┌─────────────────────────────────────────────────────────────┐
│                    Effect Hierarchy                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Level 4: ActorSystem                                        │
│     ↑     [Actors communicating with each other]             │
│     │                                                        │
│  Level 3: Domain Actors                                      │
│     ↑     [PaymentFlow, AuthFlow, BookingFlow]              │
│     │                                                        │
│  Level 2: Actor Effects                                      │
│     ↑     [State machine with states + transitions]          │
│     │                                                        │
│  Level 1: StateTransition                                    │
│     ↑     [from → to, event, guard, actions]                │
│     │                                                        │
│  Level 0.5: Validated Effects (from tests)                   │
│     ↑     [Runtime-confirmed, with execution context]        │
│     │                                                        │
│  Level 0: Raw Effects (from AST)                             │
│           [Condition, Store, FunctionCall, Send]             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

This mirrors domain effect composition:
- Low-level: `FunctionCall("stripe.charges.create")`
- Domain: `DomainEffect("Payment:Charge")`
- Actor: `Actor("PaymentFlow")` with states: idle → processing → success/failed

---

## 3. Three Sources of Actor Discovery

Actors can be discovered from three complementary sources:

### 3.1 Explicit Extraction

**What**: Direct parsing of state machine definitions in code.

**Examples**:
- XState `createMachine()` and `setup().createMachine()`
- `useReducer` with explicit state patterns
- Any library that defines state machines declaratively

**Output**: Machine definition directly in seeds, queryable as Actor effects.

### 3.2 Effect Path Analysis (Inference)

**What**: Pattern recognition on effect sequences to infer implicit state machines.

**The insight**: A state machine is a **higher-level effect** composed from lower-level effects:

```
[Condition + Store + FunctionCall] → StateTransition
[Multiple StateTransitions sharing state] → Actor
```

**Patterns that indicate state machines**:
- `Condition` effects → guards/branches → possible states
- `Store` effects → state assignments → state variables
- `FunctionCall` after conditions → transition actions
- Event handlers (`onClick`, `onSubmit`) → triggering events

### 3.3 Runtime Validation (Test-Driven)

**What**: Tests execute code paths, producing telemetry that validates static analysis.

**The approach**:
1. Tests run with OpenTelemetry instrumentation
2. Spans capture effect execution with entity IDs
3. Correlation matches runtime spans to static effects
4. Result: "This effect was actually reached" vs "static only"

**Why tests, not live observation**:
- Tests are deterministic and repeatable
- No custom browser instrumentation needed
- CI/CD naturally produces runtime data
- Same entity IDs enable correlation

See [test-strategy.md](../spec/test-strategy.md) for how different test types contribute.

---

## 4. Effect Types

### 4.1 StateTransition

Represents a single state change:

| Property | Description |
|----------|-------------|
| `from` | Source state (or "*" for any) |
| `to` | Target state |
| `event` | Event name that triggers transition |
| `guard` | Condition that must be true (optional) |
| `actions` | Effects executed during transition |
| `source` | How discovered: "static" or "runtime" |

### 4.2 Actor

Represents a complete state machine:

| Property | Description |
|----------|-------------|
| `id` | Unique identifier |
| `name` | Human-readable name |
| `states` | All possible states |
| `initialState` | Starting state |
| `transitions` | StateTransition effect IDs |
| `source` | "explicit", "inferred", or "validated" |

### 4.3 ActorSystem

Represents actors communicating:

| Property | Description |
|----------|-------------|
| `actors` | Actor effect IDs |
| `communications` | Events sent between actors |

---

## 5. Integration Points

### 5.1 With Rules Engine

The existing Rules Engine is extended with new rule types:

| Rule Type | Input | Output |
|-----------|-------|--------|
| `DomainEffectRule` | FunctionCall patterns | Domain effects |
| `TransitionPatternRule` | Effect sequences | StateTransition effects |
| `ActorPatternRule` | Grouped transitions | Actor effects |

### 5.2 With Seeds

Actors are stored as effects in `effects.parquet`, queryable via SQL:

```sql
-- Find all Actors
SELECT * FROM effects WHERE effect_type = 'Actor';

-- Find actors with specific states  
SELECT * FROM effects 
WHERE effect_type = 'Actor' 
  AND properties->>'states' LIKE '%submitting%';
```

### 5.3 With C4 Diagrams

Actors become first-class citizens in architecture diagrams:

```
C4 Container: WebApp
  ├── AuthenticationActor (state machine)
  ├── BookingFlowActor (state machine)
  └── PaymentActor (state machine)
```

### 5.4 With Validation

Actors participate in the quality loop (ADR-0031):

| Check | What It Validates |
|-------|------------------|
| Static completeness | All useState/useReducer have inferred Actors |
| Runtime alignment | Static-inferred matches runtime-observed |
| Documentation | All Actors have descriptions |
| Test coverage | All transitions exercised |

---

## 6. The Vision Realized

When complete, you can answer with deterministic queries:

- "What implicit state machines exist in this component?"
- "What states can the BookingDialog be in?"
- "Which transitions are never exercised by tests?"
- "Show all actors in the PaymentFlow and how they communicate"

**This is the same thesis as DevAC's core**: Make the system deterministically queryable for analysis, documentation, and verification.

---

## 7. Glossary

See [concepts.md](./concepts.md#actor-terms) for full definitions:

| Term | Definition |
|------|------------|
| **Actor** | Higher-level effect representing a state machine |
| **StateTransition** | Effect representing a state change |
| **ActorSystem** | Multiple actors communicating |
| **Effect Telemetry** | Runtime observation as effects |
| **TransitionPattern** | Rule matching effects → transitions |

---

## 8. Note on Implementation Documentation

> The documentation of what is currently implemented is generated from the code by DevAC itself. This vision document describes the conceptual model; the implementation docs are the source of truth for current capabilities.

See:
- [actor-discovery.md](../implementation/actor-discovery.md) — How to implement actor discovery
- [otel-integration.md](../implementation/otel-integration.md) — OTel + test-driven approach
- [gaps.md](../spec/gaps.md) — What's not yet implemented

---

*Version: 2.0 — Clean vision without implementation details*
*Extends [foundation.md](./foundation.md) with Actor-level effects.*
