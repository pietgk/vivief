# Code Understanding Pipeline

How DevAC transforms source code into architectural understanding: from AST to C4 diagrams.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CODE UNDERSTANDING PIPELINE                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STAGE 1: SOURCE → AST                                                       │
│  ├── Input: .ts, .py, .cs files                                              │
│  ├── Tool: Babel (@babel/parser), Tree-sitter                                │
│  └── Output: Abstract Syntax Tree                                            │
│                                                                              │
│  STAGE 2: AST → STRUCTURAL DATA                                              │
│  ├── Nodes: Functions, Classes, Methods, Variables                          │
│  ├── Edges: CALLS, CONTAINS, EXTENDS, IMPORTS                                │
│  ├── External Refs: Unresolved imports                                       │
│  └── Effects: FunctionCall, Send, Request (extracted here)                   │
│                                                                              │
│  STAGE 3: STRUCTURAL → SEMANTIC (Optional Pass 2)                            │
│  ├── External refs resolved to target entities                               │
│  └── Cross-package relationships linked                                      │
│                                                                              │
│  STAGE 4: EFFECTS → DOMAIN EFFECTS (Rules Engine)                            │
│  ├── Pattern matching on low-level effects                                   │
│  ├── First matching rule wins (priority-based)                               │
│  └── Output: High-level domain effects (Payment.Charge, Auth.Login)          │
│                                                                              │
│  STAGE 5: DOMAIN EFFECTS → VIEWS (C4 Generator)                              │
│  ├── System boundaries                                                       │
│  ├── Container diagrams                                                      │
│  └── Component diagrams                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Why This Pipeline?

The pipeline addresses a fundamental challenge: **code is structured for execution, not understanding**.

```
effectHandler = (state, effect) => (state', [effect'])
```

If Effects capture complete semantics, understanding effects = understanding code.

| What We Have | What We Want |
|--------------|--------------|
| AST nodes (syntax) | Architectural understanding |
| Function calls | Service boundaries |
| Imports | Dependency relationships |
| HTTP calls | External system connections |

The pipeline bridges this gap through progressive transformation.

---

## Stage 1: Parsing (Source → AST)

**Purpose**: Convert source code text into a structured syntax tree.

### Language Router

```typescript
import { createLanguageRouter } from "@pietgk/devac-core";

const router = createLanguageRouter();
const parser = router.getParser("src/auth.ts");
// Returns TypeScriptParser
```

### Supported Languages

| Language | Parser | Extensions |
|----------|--------|------------|
| TypeScript/JavaScript | Babel | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` |
| Python | Native `ast` module | `.py` |
| C# | tree-sitter-c-sharp | `.cs` |

### Key Files

- `src/parsers/typescript-parser.ts` - Babel-based TypeScript/JavaScript parser
- `src/analyzer/language-router.ts` - Routes files to appropriate parsers
- `src/parsers/parser-interface.ts` - Common parser interface

---

## Stage 2: Extraction (AST → Structural Data)

**Purpose**: Extract queryable data structures from the AST.

### What Gets Extracted

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXTRACTION OUTPUT                                                           │
│                                                                              │
│  NODES (17 kinds)                                                            │
│  ├── function, class, method, property, variable, constant                  │
│  ├── interface, type, enum, enum_member                                      │
│  ├── namespace, module, parameter, decorator                                 │
│  └── jsx_component, hook, unknown                                            │
│                                                                              │
│  EDGES (19 types)                                                            │
│  ├── Structural: CONTAINS, PARAMETER_OF, DECORATES                          │
│  ├── Reference: CALLS, REFERENCES, ACCESSES, INSTANTIATES, OVERRIDES        │
│  ├── Type System: EXTENDS, IMPLEMENTS, RETURNS, TYPE_OF, USES_TYPE          │
│  ├── Module: IMPORTS, EXPORTS, RE_EXPORTS                                   │
│  └── Async: AWAITS, YIELDS, THROWS                                          │
│                                                                              │
│  EXTERNAL REFS                                                               │
│  └── Unresolved imports awaiting semantic resolution                        │
│                                                                              │
│  EFFECTS (9 Code Effects)                                                    │
│  ├── Data: FunctionCall, Store, Retrieve, Send, Request, Response           │
│  ├── Flow: Condition, Loop                                                  │
│  └── Group: System, Container, Component, File, Class                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Effect Extraction Examples

**FunctionCall Effects** - Every function/constructor call:

```typescript
// Source
await validateUser(userId, token);

// Extracted Effect
{
  effect_type: "FunctionCall",
  callee_name: "validateUser",
  is_async: true,
  argument_count: 2
}
```

**Send Effects** - HTTP/M2M calls:

```typescript
// Source (detected as M2M - internal service call)
await m2mClient.post("/:stage/auth-endpoints/verify", payload);

// Extracted Effect
{
  effect_type: "Send",
  send_type: "m2m",           // vs "http" for external
  method: "POST",
  target: "/:stage/auth-endpoints/verify",
  service_name: "auth"        // Extracted from URL pattern
}
```

**Request Effects** - API endpoint handlers:

```typescript
// Source (with decorators)
@Route("/users")
class UserController {
  @Get("/:id")
  async getUser() {}
}

// Extracted Effect
{
  effect_type: "Request",
  route_pattern: "/users/:id",
  method: "GET",
  framework: "tsoa"
}
```

### Key Files

- `src/parsers/typescript-parser.ts` - Full extraction implementation
- `src/types/nodes.ts` - Node schema (17 kinds)
- `src/types/edges.ts` - Edge schema (19 types)
- `src/types/effects.ts` - Effects schema

---

## Stage 3: Semantic Resolution (Optional Pass 2)

**Purpose**: Resolve external references to actual target entities.

### Resolution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SEMANTIC RESOLUTION                                                         │
│                                                                              │
│  Unresolved:                                                                 │
│    import { User } from "@shared/types"                                      │
│    source_entity_id: "repo:pkg:function:abc123"                              │
│    module_specifier: "@shared/types"                                         │
│    imported_symbol: "User"                                                   │
│    is_resolved: false                                                        │
│                                                                              │
│  Resolution Steps:                                                           │
│  1. Check local package exports                                              │
│  2. Check sibling packages (monorepo)                                        │
│  3. Check central hub (cross-repo)                                           │
│                                                                              │
│  Resolved:                                                                   │
│    target_entity_id: "shared:types:interface:xyz789"                         │
│    is_resolved: true                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### When to Run

- **CLI mode**: After full package analysis
- **Watch mode**: Background task after 5 second settle period
- **Hub mode**: Enables cross-repo resolution

### Key Files

- `src/semantic/typescript-resolver.ts` - TypeScript import resolution
- `src/semantic/python-resolver.ts` - Python import resolution
- `src/semantic/csharp-resolver.ts` - C# using resolution

---

## Stage 4: Rules Engine (Effects → Domain Effects)

**Purpose**: Transform low-level effects into high-level domain concepts.

### The Key Insight

```
Effects = WHAT the code does (extracted, deterministic)
Rules   = WHAT the code MEANS (interpreted, configurable)
```

Effects are observations. Rules assign meaning.

### Rule Structure

```typescript
const stripeChargeRule = defineRule({
  id: "payment-stripe-charge",
  name: "Stripe Charge",

  match: {
    effectType: "FunctionCall",
    callee: /stripe\.(charges|paymentIntents)\.(create|confirm)/i,
    isExternal: true,
  },

  emit: {
    domain: "Payment",
    action: "Charge",
    metadata: { provider: "stripe" },
  },

  priority: 20,
});
```

### Match → Emit Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  RULE MATCHING                                                               │
│                                                                              │
│  Input Effect:                                                               │
│    effect_type: "FunctionCall"                                               │
│    callee_name: "stripe.charges.create"                                      │
│    is_external: true                                                         │
│                                                                              │
│  Rule "payment-stripe-charge":                                               │
│    match.effectType: "FunctionCall"        ✓ matches                         │
│    match.callee: /stripe\.charges\.create/ ✓ matches                         │
│    match.isExternal: true                  ✓ matches                         │
│                                                                              │
│  Output Domain Effect:                                                       │
│    domain: "Payment"                                                         │
│    action: "Charge"                                                          │
│    ruleId: "payment-stripe-charge"                                           │
│    metadata: { provider: "stripe" }                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Built-in Rules (~25)

| Category | Examples |
|----------|----------|
| **Payment** | Stripe charge, refund, subscription |
| **Auth** | JWT verify, OAuth token, login/logout |
| **Database** | SQL operations, ORM queries |
| **Cache** | Redis get/set, memory cache |
| **Queue** | SQS send, SNS publish, EventBridge |
| **Email** | SES send, SendGrid, nodemailer |

### Why Rules Are Separate from Effects

1. **Separation of concerns**: Extraction is distinct from interpretation
2. **Extensibility**: Rules can be added without code changes
3. **Customizability**: Different teams can have different rules for same effects
4. **Testing**: Effects can be tested independently of rules
5. **Layering**: Clean abstraction layers (AST → Effects → Domain)

### Key Files

- `src/rules/rule-engine.ts` - Rule matching logic
- `src/rules/builtin-rules.ts` - Built-in rule definitions
- `src/rules/rule-types.ts` - Rule schema and types

---

## Stage 5: Views (Domain Effects → Diagrams)

**Purpose**: Generate C4 architecture diagrams from domain effects.

### C4 Model Levels

| Level | Description | Input |
|-------|-------------|-------|
| **Context** | System and external dependencies | All domain effects |
| **Container** | Applications/services | Effects grouped by package |
| **Component** | Components within container | Effects grouped by entity |

### Generation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  C4 DIAGRAM GENERATION                                                       │
│                                                                              │
│  Domain Effects                                                              │
│  ├── Payment:Charge (stripe)                                                 │
│  ├── Auth:TokenVerify (internal)                                             │
│  └── Database:Write (mysql)                                                  │
│                                                                              │
│            ▼                                                                 │
│                                                                              │
│  C4Context Generator                                                         │
│  ├── System: "API Service"                                                   │
│  ├── External: "Stripe (Payment)"                                            │
│  └── External: "MySQL (Database)"                                            │
│                                                                              │
│            ▼                                                                 │
│                                                                              │
│  PlantUML Export                                                             │
│  @startuml C4_Context                                                        │
│  !include C4-PlantUML/C4_Context.puml                                        │
│  System(api, "API Service", "Node.js")                                       │
│  System_Ext(stripe, "Stripe", "Payment Processing")                          │
│  Rel(api, stripe, "Uses", "HTTPS")                                           │
│  @enduml                                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Files

- `src/views/c4-generator.ts` - C4 model generation
- `src/views/plantuml-exporter.ts` - PlantUML output
- `src/views/mermaid-exporter.ts` - Mermaid output

---

## Complete Example: Tracing a Payment Flow

Let's trace how a Stripe payment call flows through the entire pipeline:

### Input Code

```typescript
// src/payments/charge.ts
import Stripe from "stripe";
import { m2mClient } from "@shared/m2m";

export async function chargeUser(userId: string, amount: number) {
  // Verify user first (internal M2M call)
  const user = await m2mClient.get("/:stage/user-endpoints/verify", { userId });

  // Create Stripe charge
  const stripe = new Stripe(process.env.STRIPE_KEY);
  const charge = await stripe.charges.create({
    amount,
    currency: "usd",
    customer: user.stripeId,
  });

  return charge;
}
```

### Stage 1: AST

Babel parses into AST nodes: FunctionDeclaration, AwaitExpression, CallExpression...

### Stage 2: Extraction

```
Nodes:
  - function:chargeUser (exported, async)
  - parameter:userId
  - parameter:amount

Edges:
  - chargeUser CALLS unresolved:m2mClient.get
  - chargeUser CALLS unresolved:stripe.charges.create

Effects:
  - FunctionCall: m2mClient.get(...) → is_method_call: true
  - Send: m2mClient.get("/:stage/user-endpoints/verify")
    → send_type: "m2m", service_name: "user"
  - FunctionCall: new Stripe(...) → is_constructor: true
  - FunctionCall: stripe.charges.create(...) → is_external: true
  - Send: stripe.charges.create(...)
    → send_type: "http", is_third_party: true, service_name: "stripe"
```

### Stage 3: Semantic Resolution

```
External Refs:
  - import Stripe → resolved to node_modules (external)
  - import m2mClient from "@shared/m2m" → resolved to shared:m2m:variable:xyz
```

### Stage 4: Rules Engine

```
Effect: FunctionCall { callee: "stripe.charges.create", is_external: true }
Rule Match: payment-stripe-charge (priority 20)
Domain Effect:
  - domain: "Payment"
  - action: "Charge"
  - metadata: { provider: "stripe" }

Effect: Send { send_type: "m2m", service_name: "user" }
Rule Match: internal-service-call (priority 15)
Domain Effect:
  - domain: "Internal"
  - action: "ServiceCall"
  - metadata: { targetService: "user" }
```

### Stage 5: C4 Diagram

```
C4 Context:
  - System: "Payment Service"
  - External System: "Stripe (Payment)"
  - Internal: "User Service" (M2M dependency)

PlantUML:
  System(payments, "Payment Service", "Handles payment processing")
  System_Ext(stripe, "Stripe", "Payment gateway")
  System(users, "User Service", "User management")

  Rel(payments, users, "Verifies user", "M2M/HTTPS")
  Rel(payments, stripe, "Creates charges", "HTTPS")
```

---

## Effect Type Reference

### Code Effects (What Code Does)

| Effect Type | Description | Key Fields |
|-------------|-------------|------------|
| `FunctionCall` | Function/method invocation | `callee_name`, `is_async`, `argument_count` |
| `Store` | Data persistence | `store_type`, `operation`, `provider` |
| `Retrieve` | Data fetching | `retrieve_type`, `operation`, `provider` |
| `Send` | Outgoing communication | `send_type`, `method`, `target`, `service_name` |
| `Request` | Incoming request handler | `route_pattern`, `method`, `framework` |
| `Response` | Outgoing response | `status_code`, `content_type` |
| `Condition` | Branching logic | `condition_type`, `branch_count` |
| `Loop` | Iteration | `loop_type` |
| `Group` | Organizational boundary | `group_type`, `group_name` |

### Send Types (v0.5.0)

| send_type | Description |
|-----------|-------------|
| `http` | External HTTP call |
| `m2m` | Machine-to-machine internal call |
| `email` | Email sending |
| `sms` | SMS sending |
| `push` | Push notification |
| `webhook` | Webhook dispatch |
| `event` | Event publishing |

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [data-model.md](./data-model.md) | Complete schema for nodes, edges, effects |
| [parsing.md](./parsing.md) | Parser implementations and orchestration |
| [rules-engine.md](./rules-engine.md) | Rule definitions and matching |
| [views.md](./views.md) | C4 diagram generation |
| [../vision/foundation.md](../vision/foundation.md) | Conceptual foundation |

---

*This document provides the complete AST-to-Views transformation. For the conceptual "why", see [foundation.md](../vision/foundation.md).*
