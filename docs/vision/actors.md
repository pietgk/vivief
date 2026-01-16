# Actor Model: From Effects to State Machines

> Extending DevAC's effect model to discover, represent, and validate stateful behavior as first-class Actors.

**Related Documents**:
- [concepts.md](./concepts.md) — Core thesis, Four Pillars, glossary
- [foundation.md](./foundation.md) — Effect handler pattern, effect types, rules
- [validation.md](./validation.md) — Watch → Validate → Cache → Query

---

## 1. The Problem We're Solving

Code contains implicit state machines that aren't queryable:

| Pattern | Example | What's Hidden |
|---------|---------|---------------|
| `useState` / `useReducer` | `const [isOpen, setIsOpen] = useState(false)` | States: closed, open. Events: open, close |
| Event handler sequences | `onClick → validate → submit → redirect` | Flow: idle → validating → submitting → done |
| Conditional logic | `if (user.isAuthenticated) { ... }` | States: anonymous, authenticated |
| UI flows | Dialog open/close, form steps | Complete state machine buried in handlers |

**The gap**: DevAC extracts effects (FunctionCall, Store, Condition) but doesn't compose them into the **state machines they represent**. These state machines ARE the documentation—they describe what the system does.

**Our thesis**: By treating state machines as **higher-level effects** (Actors), we can:
1. Discover them from effect sequences (static analysis)
2. Validate them against runtime behavior (effect telemetry)
3. Query them like any other effect
4. Generate documentation automatically

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
dialogHandler = (DialogState, UserEvent) => (DialogState', [FocusMove, APICall, Announce])
```

**Actors enable composition**. Actors can contain other actors:
```
CheckoutFlow (Actor)
  ├── CartActor
  ├── PaymentActor
  └── ConfirmationActor
```

**Actors unify static and runtime**. Both produce the same Actor effect type:
- Static: Inferred from code patterns
- Runtime: Discovered from actual interactions

### 2.2 The Effect Hierarchy (Extended)

Building on [foundation.md Section 5.5](./foundation.md#55-effect-hierarchies), we extend the hierarchy:

```
Level 0: Raw Effects (from AST)
  │  Condition, Store, Retrieve, FunctionCall, Send
  │  (Already in foundation.md)
  │
  ▼
Level 1: Transition Effects (pattern-matched)
  │  StateTransition { from, to, event, guard, actions }
  │  (Inferred from effect sequences)
  │
  ▼
Level 2: Actor Effects (grouped transitions)
  │  Actor { id, states, transitions, context }
  │  (State machine as queryable effect)
  │
  ▼
Level 3: Domain Actors (business meaning)
  │  PaymentFlow, AuthenticationFlow, BookingFlow
  │  (Named, documented, validated)
  │
  ▼
Level 4: ActorSystem (actors communicating)
     ActorSystem { actors, communications }
     (Full system behavior model)
```

**This mirrors domain effect composition**:
- Low-level: `FunctionCall("stripe.charges.create")`
- Domain: `DomainEffect("Payment:Charge")`
- Actor: `Actor("PaymentFlow")` with states: idle → processing → success/failed

---

## 3. Three Sources of Actor Discovery

Actors can be discovered from three complementary sources:

### 3.1 Explicit Extraction (XState, etc.)

**What**: Direct AST parsing of state machine definitions.

**Patterns**:
```typescript
// XState v5
const machine = setup({...}).createMachine({...})

// XState v4
const machine = createMachine({...})

// useReducer with explicit states
const reducer = (state, action) => {
  switch (action.type) {
    case 'OPEN': return { ...state, status: 'open' }
    // ...
  }
}
```

**Output**: Machine definition directly in seeds.

**Why it exists**: Some codebases explicitly define state machines. Extract them directly rather than inferring.

### 3.2 Effect Path Analysis (Inference)

**What**: Pattern recognition on effect sequences to infer implicit state machines.

**The insight**: A state machine is a **higher-level effect** composed from lower-level effects:
```
[Condition + Store + FunctionCall sequence] → StateTransition effect
[Multiple StateTransition effects sharing state] → Actor effect
```

**Patterns to recognize**:

| Effect Pattern | Indicates |
|----------------|-----------|
| `Condition` effects | Guards/branches → possible states |
| `Store` effects | State assignments → state variables |
| `FunctionCall` after conditions | Transition actions |
| Event handlers (`onClick`, `onSubmit`) | Events that trigger transitions |

**Implementation approach**:
1. Extend Rules Engine with `TransitionPattern` rule type
2. Define patterns in `state-machine-patterns.md` (like `package-effects.md`)
3. Rules match effect sequences → produce `StateTransition` effects
4. Group related transitions → produce `Actor` effect

**Why it exists**: Most code contains implicit state machines that aren't explicitly defined. Effect path analysis discovers them.

### 3.3 Runtime Effect Telemetry

**What**: Runtime observation from any environment, converted to effects.

**The generalization**: All runtime environments can produce **Effect Telemetry**:

| Environment | MCP Server | What It Observes |
|-------------|------------|------------------|
| **Browser** | `browser-mcp` | A11y tree, DOM interactions, focus movement, network |
| **React Native** | `expo-mcp` (future) | Component tree, gestures, navigation |
| **Server** | `otel-mcp` | OpenTelemetry spans, traces, metrics |

**Why they exist**: Static analysis sees what code *declares*. Runtime telemetry sees what code *does*. Together they validate each other.

**The pattern**: All Effect Telemetry MCPs:
1. Observe runtime behavior in their environment
2. Convert observations to the same effect format
3. Feed into the same seed database
4. Enable comparison: static-inferred vs runtime-observed

---

## 4. Effect Telemetry MCPs

### 4.1 The Unified Pattern

Every Effect Telemetry MCP follows the same flow:

```
Runtime Environment → Observation → Effect Conversion → Seed Database
       │                  │                │                │
       │                  │                │                ▼
       │                  │                │         Query alongside
       │                  │                │         static effects
       │                  │                ▼
       │                  │         Same effect types:
       │                  │         FunctionCall, Store, Send, etc.
       │                  ▼
       │           Environment-specific:
       │           - Browser: DOM events, focus, network
       │           - Mobile: gestures, navigation
       │           - Server: spans, traces
       ▼
  Where code actually runs
```

### 4.2 Browser Effect Telemetry (`browser-mcp`)

**Observes**:
- Accessibility tree (interactive elements, roles, states)
- DOM interactions (clicks, focus, keyboard)
- Network activity (requests triggered by interactions)
- Console messages (errors, warnings)

**Converts to**:
- `FunctionCall` effects for handler invocations
- `Send` effects for network requests
- `Store` effects for state changes (via DOM observation)
- `StateTransition` effects for observed state changes

### 4.3 Mobile Effect Telemetry (`expo-mcp` - Future)

**Observes**:
- Component tree structure
- Gesture events (tap, swipe, long press)
- Navigation transitions
- Native module calls

### 4.4 Server Effect Telemetry (`otel-mcp`)

**Observes**:
- OpenTelemetry spans and traces
- Database queries
- External API calls
- Message queue interactions

### 4.5 Validation Loop

The power comes from comparing static and runtime:

```
Static analysis says:    "Button click triggers submitForm()"
Runtime telemetry says:  "Button click triggered submitForm() + analytics.track()"
                                                                    │
                                                                    ▼
Gap detected: "analytics.track() not in static extraction"
              → Missing rule OR dynamic behavior to document
```

This feeds into the quality loop from [ADR-0031](../adr/0031-architecture-quality-improvement-loop.md).

---

## 5. Integration Points

### 5.1 With Rules Engine

The existing Rules Engine (see [foundation.md Section 5.6](./foundation.md#56-rules-effect-aggregation)) is extended with new rule types:

| Rule Type | Input | Output |
|-----------|-------|--------|
| `DomainEffectRule` (existing) | FunctionCall patterns | Domain effects (Payment:Charge) |
| `TransitionPatternRule` (new) | Effect sequences | StateTransition effects |
| `ActorPatternRule` (new) | Grouped transitions | Actor effects |

**Example TransitionPattern rule**:
```typescript
{
  name: "useState-toggle",
  pattern: {
    sequence: [
      { type: "Store", target: /^set[A-Z]/ },
      { type: "Condition", references: "$target" }
    ]
  },
  output: {
    type: "StateTransition",
    infer: {
      stateVariable: "$target",
      states: ["from condition branches"]
    }
  }
}
```

### 5.2 With Seeds

Actors are stored as effects in `effects.parquet`:

```sql
-- Find all Actors in the codebase
SELECT * FROM effects 
WHERE effect_type = 'Actor';

-- Find transitions for a specific Actor
SELECT * FROM effects
WHERE effect_type = 'StateTransition'
  AND properties->>'actorId' = 'DialogMachine';

-- Find actors with specific states
SELECT * FROM effects
WHERE effect_type = 'Actor'
  AND properties->>'states' LIKE '%submitting%';
```

### 5.3 With C4 Diagrams

Actors become first-class citizens in architecture diagrams:

```
C4 Container Diagram
├── WebApp (Container)
│   ├── AuthenticationActor (state machine)
│   ├── BookingFlowActor (state machine)
│   └── PaymentActor (state machine)
└── API (Container)
    └── OrderProcessingActor (state machine)
```

The C4 generator (see [ADR-0031](../adr/0031-architecture-quality-improvement-loop.md)) is extended to include Actors.

### 5.4 With Validation

Actors participate in the validation quality loop:

| Check | What It Validates |
|-------|------------------|
| Static completeness | All useState/useReducer patterns have inferred Actors |
| Runtime alignment | Static-inferred Actors match runtime-discovered behavior |
| Documentation coverage | All Actors have human-validated descriptions |
| Transition coverage | All transitions are exercised in tests |

---

## 6. Effect Types (New)

### 6.1 StateTransition Effect

Represents a single state change:

```typescript
type StateTransitionEffect = {
  effect_type: "StateTransition"
  from: string              // Source state (or "*" for any)
  to: string                // Target state
  event: string             // Event name that triggers transition
  guard?: string            // Condition that must be true
  actions: Effect[]         // Effects executed during transition
  actorId: string           // Parent Actor this belongs to
  source: "static" | "runtime"  // How it was discovered
}
```

### 6.2 Actor Effect

Represents a complete state machine:

```typescript
type ActorEffect = {
  effect_type: "Actor"
  id: string                // Unique identifier
  name: string              // Human-readable name
  states: string[]          // All possible states
  initialState: string      // Starting state
  context?: Record<string, unknown>  // Extended state (data)
  transitions: string[]     // IDs of StateTransition effects
  source: "explicit" | "inferred" | "runtime"
  confidence?: number       // For inferred actors (0-1)
}
```

### 6.3 ActorSystem Effect

Represents actors communicating:

```typescript
type ActorSystemEffect = {
  effect_type: "ActorSystem"
  actors: string[]          // IDs of Actor effects
  communications: {
    from: string            // Source Actor ID
    to: string              // Target Actor ID
    event: string           // Event sent between actors
  }[]
}
```

---

## 7. Glossary

For Actor-related terminology, see the **Actor Terms** section in [concepts.md](./concepts.md#actor-terms).

Key terms defined there:
- **Actor**, **StateTransition**, **ActorSystem** — effect types
- **TransitionPattern**, **ActorPattern** — rule types
- **Effect Telemetry**, **Effect Telemetry MCP** — runtime observation concepts

---

## 8. Research Questions

Before full implementation, these questions need investigation:

1. **Pattern reliability**: What effect patterns reliably indicate state machines vs. conditional logic?
2. **Implicit state handling**: How to handle `useState` without clear machine structure?
3. **Rules Engine capability**: Can the current Rules Engine handle sequence matching, or need new infrastructure?
4. **Cross-component actors**: How to model actors that span multiple components?
5. **Existing tools**: How do other tools (Stately, XState visualizer) approach state machine inference?

---

## 9. Implementation Phases

### Phase 1: Explicit Extraction
- Parse XState `createMachine()` and `setup().createMachine()` patterns
- Store as Actor effects in seeds
- Enable basic queries

### Phase 2: Effect Path Analysis (MVP)
- Define initial TransitionPattern rules
- Start with simple patterns (useState toggle, reducer switch)
- Validate with known state machines

### Phase 3: Runtime Telemetry Integration
- Implement browser-mcp effect conversion
- Compare static vs runtime Actors
- Feed gaps into quality loop

### Phase 4: Full Actor System
- Detect actor communication patterns
- Generate ActorSystem effects
- Enhance C4 diagrams with actors

---

## 10. What This Document Is

This document extends the DevAC conceptual foundation with the **Actor model**:

**This document defines**:
- Actors as higher-level effects (state machines)
- Three sources of Actor discovery (explicit, inferred, runtime)
- Effect Telemetry as generalized runtime observation
- Integration with existing Rules Engine, Seeds, C4, and Validation
- New effect types (StateTransition, Actor, ActorSystem)

**This document does NOT define**:
- Implementation details (those belong in implementation docs)
- Specific rule definitions (those belong in `state-machine-patterns.md`)
- API specifications (those belong in package docs)

---

*Version: 1.0 — Initial Actor Model specification*
*This extends [foundation.md](./foundation.md) with Actor-level effects.*
