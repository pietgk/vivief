# Rules Engine

The Rules Engine transforms low-level code effects (FunctionCall, Store, etc.) into high-level domain effects (ChargePayment, AuthenticateUser, etc.) using pattern matching rules.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  RULES ENGINE PIPELINE                                                      │
│                                                                             │
│  effects.parquet                                                            │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐   │
│  │   Effect    │────►│   Rules     │────►│   Domain Effect             │   │
│  │FunctionCall │     │   Engine    │     │   domain: "Payment"         │   │
│  │stripe.create│     │             │     │   action: "Charge"          │   │
│  └─────────────┘     └─────────────┘     │   ruleId: "payment-stripe"  │   │
│                                          └─────────────────────────────┘   │
│                                                                             │
│  Low-level effect ──── Pattern Match ──── High-level domain effect         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Rule Structure

A rule defines:
- **Match criteria**: What effects to match (type, callee pattern, flags)
- **Emit**: What domain effect to produce (domain, action, metadata)
- **Priority**: Order of evaluation (higher = first)

```typescript
import { defineRule } from "@pietgk/devac-core";

const stripeChargeRule = defineRule({
  id: "payment-stripe-charge",
  name: "Stripe Charge",
  description: "Detects Stripe payment creation",
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

### Match Criteria

| Field | Type | Description |
|-------|------|-------------|
| `effectType` | `EffectType \| EffectType[]` | Effect type(s) to match |
| `callee` | `string \| RegExp` | Function/method name pattern |
| `target` | `string \| RegExp` | Target entity pattern |
| `source` | `string \| RegExp` | Source pattern (for Retrieve) |
| `isExternal` | `boolean` | Match external calls only |
| `isAsync` | `boolean` | Match async calls only |
| `predicate` | `(effect) => boolean` | Custom match function |

### Domain Effects

When a rule matches, it produces a DomainEffect:

```typescript
interface DomainEffect {
  sourceEffectId: string;    // Original effect ID
  domain: string;            // e.g., "Payment", "Auth", "Database"
  action: string;            // e.g., "Charge", "TokenVerify", "Write"
  ruleId: string;            // Rule that matched
  ruleName: string;          // Human-readable rule name
  originalEffectType: string; // FunctionCall, Store, etc.
  sourceEntityId: string;    // Entity that produced the effect
  filePath: string;          // Source file
  startLine: number;         // Line number
  metadata: Record<string, unknown>;
}
```

## Using the Rules Engine

### Basic Usage

```typescript
import { createRuleEngine, builtinRules } from "@pietgk/devac-core";

// Create engine with builtin rules
const engine = createRuleEngine({
  rules: builtinRules,
});

// Process effects
const result = engine.process(effects);

console.log(`Matched: ${result.matchedCount}`);
console.log(`Unmatched: ${result.unmatchedCount}`);
console.log(`Domain effects: ${result.domainEffects.length}`);
```

### Custom Rules

```typescript
import { defineRule, createRuleEngine, builtinRules } from "@pietgk/devac-core";

// Define custom rules
const customRules = [
  defineRule({
    id: "my-api-call",
    name: "My API Call",
    match: {
      effectType: "FunctionCall",
      callee: /myApi\.\w+/,
    },
    emit: {
      domain: "MyDomain",
      action: "ApiCall",
    },
  }),
];

// Combine with builtin rules
const engine = createRuleEngine({
  rules: [...builtinRules, ...customRules],
});
```

### Rule Priority

Rules are evaluated in priority order (highest first). First matching rule wins.

```typescript
defineRule({
  // Specific Stripe rule - evaluated first
  id: "payment-stripe",
  priority: 20,  // Higher = evaluated first
  match: { callee: /stripe\.charges/ },
  emit: { domain: "Payment", action: "Charge" },
});

defineRule({
  // Generic SQL rule - fallback
  id: "db-sql",
  priority: 5,   // Lower = evaluated later
  match: { callee: /\.insert\(/ },
  emit: { domain: "Database", action: "Write" },
});
```

## Builtin Rules

DevAC includes 25+ builtin rules organized by domain:

### Database Rules

| Rule ID | Description | Pattern |
|---------|-------------|---------|
| `db-write-dynamodb` | DynamoDB put/update/delete | `dynamodb.put`, `dynamodb.update` |
| `db-read-dynamodb` | DynamoDB get/query/scan | `dynamodb.get`, `dynamodb.query` |
| `db-prisma-write` | Prisma create/update/delete | `prisma.user.create` |
| `db-prisma-read` | Prisma find/count | `prisma.user.findMany` |
| `db-write-sql` | Generic SQL writes | `.insert(`, `.update(` |
| `db-read-sql` | Generic SQL reads | `.select(`, `.query(` |

### Payment Rules

| Rule ID | Description | Pattern |
|---------|-------------|---------|
| `payment-stripe-charge` | Stripe charges | `stripe.charges.create` |
| `payment-stripe-refund` | Stripe refunds | `stripe.refunds.create` |
| `payment-stripe-subscription` | Stripe subscriptions | `stripe.subscriptions.create` |

### Auth Rules

| Rule ID | Description | Pattern |
|---------|-------------|---------|
| `auth-jwt-sign` | JWT token creation | `jwt.sign` |
| `auth-jwt-verify` | JWT verification | `jwt.verify` |
| `auth-bcrypt-hash` | Password hashing | `bcrypt.hash` |
| `auth-bcrypt-compare` | Password verification | `bcrypt.compare` |
| `auth-cognito` | AWS Cognito auth | `cognito.initiateAuth` |

### HTTP Rules

| Rule ID | Description | Pattern |
|---------|-------------|---------|
| `http-fetch` | Fetch API | `fetch(` |
| `http-axios` | Axios requests | `axios.get`, `axios.post` |

### Messaging Rules

| Rule ID | Description | Pattern |
|---------|-------------|---------|
| `messaging-sqs-send` | SQS message send | `sqs.sendMessage` |
| `messaging-sqs-receive` | SQS message receive | `sqs.receiveMessage` |
| `messaging-sns-publish` | SNS publish | `sns.publish` |
| `messaging-eventbridge` | EventBridge events | `eventbridge.putEvents` |

### Storage Rules

| Rule ID | Description | Pattern |
|---------|-------------|---------|
| `storage-s3-put` | S3 uploads | `s3.putObject` |
| `storage-s3-get` | S3 downloads | `s3.getObject` |
| `storage-fs-write` | File writes | `fs.writeFile` |
| `storage-fs-read` | File reads | `fs.readFile` |

### Observability Rules

| Rule ID | Description | Pattern |
|---------|-------------|---------|
| `logging-console` | Console logging | `console.log` |
| `logging-datadog` | Datadog metrics | `dd-trace`, `datadog` |

## Rule Engine Result

```typescript
interface RuleEngineResult {
  domainEffects: DomainEffect[];  // Produced domain effects
  matchedCount: number;           // Effects that matched rules
  unmatchedCount: number;         // Effects with no matching rule
  processTimeMs: number;          // Processing time
  ruleStats: Map<string, number>; // Match count per rule
}
```

### Analyzing Results

```typescript
const result = engine.process(effects);

// See which rules matched most
for (const [ruleId, count] of result.ruleStats) {
  console.log(`${ruleId}: ${count} matches`);
}

// Group domain effects by domain
const byDomain = new Map<string, DomainEffect[]>();
for (const effect of result.domainEffects) {
  const list = byDomain.get(effect.domain) ?? [];
  list.push(effect);
  byDomain.set(effect.domain, list);
}

// Show domain summary
for (const [domain, effects] of byDomain) {
  console.log(`${domain}: ${effects.length} effects`);
}
```

## Advanced Usage

### Custom Predicates

For complex matching logic, use the `predicate` function:

```typescript
defineRule({
  id: "async-db-write",
  name: "Async Database Write",
  match: {
    effectType: "FunctionCall",
    predicate: (effect) => {
      if (effect.effect_type !== "FunctionCall") return false;
      // Match async calls that look like database writes
      return effect.is_async &&
             /\.(insert|update|save)\(/i.test(effect.callee_name);
    },
  },
  emit: {
    domain: "Database",
    action: "AsyncWrite",
  },
});
```

### Dynamic Rule Management

```typescript
const engine = createRuleEngine({ rules: builtinRules });

// Add rule at runtime
engine.addRule(defineRule({
  id: "custom-rule",
  name: "Custom Rule",
  match: { callee: /myFunc/ },
  emit: { domain: "Custom", action: "Call" },
}));

// Remove rule
engine.removeRule("logging-console");

// Get all rules
const rules = engine.getRules();
```

### Filtering Rules by Domain/Provider

```typescript
import { getRulesByDomain, getRulesByProvider } from "@pietgk/devac-core";

// Get all payment rules
const paymentRules = getRulesByDomain("Payment");

// Get all AWS rules
const awsRules = getRulesByProvider("aws-sqs");
```

## Integration with C4 Generator

Domain effects flow into the C4 Generator to produce architecture diagrams:

```
effects.parquet
      │
      ▼
┌─────────────┐
│   Rules     │
│   Engine    │
└──────┬──────┘
       │
       ▼
 Domain Effects
       │
       ▼
┌─────────────┐
│     C4      │
│  Generator  │
└──────┬──────┘
       │
       ▼
  C4 Diagrams
```

See [Views](./views.md) for C4 diagram generation details.

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [pipeline.md](./pipeline.md) | Complete AST-to-Views transformation pipeline |
| [data-model.md](./data-model.md) | Node, Edge, and Effects schemas |
| [views.md](./views.md) | C4 diagram generation from domain effects |
| [../vision/foundation.md](../vision/foundation.md) | Conceptual foundation |

---

*Part of DevAC v3.0 Foundation*
