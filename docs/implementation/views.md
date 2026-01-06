# Views (C4 Generator)

The Views layer generates C4 architecture diagrams from domain effects, implementing the Vision→View pipeline from DevAC v3.0 Foundation.

## Overview

DevAC supports two output formats for C4 diagrams:

- **LikeC4** (default): Interactive diagrams with source code links, dynamic views, and rich styling
- **PlantUML**: Static diagrams for legacy compatibility

See [ADR-0027](../adr/0027-likec4-primary-format.md) for the decision rationale.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  C4 DIAGRAM GENERATION PIPELINE                                             │
│                                                                             │
│  Domain Effects                                                              │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐   │
│  │  C4Context  │     │ C4Container │     │   Output Formats            │   │
│  │  Generator  │     │  Generator  │     │                             │   │
│  │             │     │             │     │   ┌───────────────────────┐ │   │
│  │ System-level│     │ App-level   │     │   │ LikeC4 (.c4) default  │ │   │
│  │ overview    │     │ containers  │     │   │ PlantUML (.puml)      │ │   │
│  └─────────────┘     └─────────────┘     │   │ Dynamic Views         │ │   │
│                                          │   └───────────────────────┘ │   │
│                                          └─────────────────────────────┘   │
│                                                                             │
│  effects → domain effects → C4 models → LikeC4/PlantUML diagrams           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## C4 Model Levels

The C4 model defines four levels of architectural abstraction:

| Level | Description | DevAC Support |
|-------|-------------|---------------|
| Context | System and external relationships | ✅ Generated |
| Container | Applications/services within system | ✅ Generated |
| Component | Components within a container | ✅ Generated |
| Code | Implementation details | ❌ Not generated |

## Core Types

### C4 Context

The highest level view showing the system and its external dependencies.

```typescript
interface C4Context {
  systemName: string;
  systemDescription?: string;
  externalSystems: C4ExternalSystem[];
  domains: DomainSummary[];
  effectCount: number;
}

interface C4ExternalSystem {
  id: string;              // "external:Payment:stripe"
  name: string;            // "Stripe (Payment)"
  type: string;            // "payment"
  provider?: string;       // "stripe"
  relationships: C4Relationship[];
}

interface DomainSummary {
  domain: string;          // "Payment"
  actions: string[];       // ["Charge", "Refund"]
  count: number;           // 15
}
```

### C4 Container

Shows applications and services within the system.

```typescript
interface C4ContainerDiagram {
  systemName: string;
  containers: C4Container[];
  externalSystems: C4ExternalSystem[];
}

interface C4Container {
  id: string;              // "api"
  name: string;            // "Api"
  technology?: string;     // "Node.js, Express"
  description?: string;
  effects: string[];       // ["Payment:Charge", "Database:Read"]
  components: C4Component[];
  relationships: C4Relationship[];
}
```

### C4 Component

Shows components within a container.

```typescript
interface C4Component {
  id: string;              // Entity ID
  name: string;            // "PaymentService"
  sourceEntityId: string;
  filePath: string;
  technology?: string;
  effects: string[];
  relationships: C4Relationship[];
}
```

### Relationships

```typescript
interface C4Relationship {
  from: string;            // Source element ID
  to: string;              // Target element ID
  label: string;           // "Payment:Charge"
  technology?: string;     // "HTTPS"
  direction: "outbound" | "inbound" | "bidirectional";
}
```

## Generating Diagrams

### C4 Context Diagram

```typescript
import {
  generateC4Context,
  exportContextToLikeC4,
  exportContextToPlantUML
} from "@pietgk/devac-core";

// Generate C4 context from domain effects
const context = generateC4Context(domainEffects, {
  systemName: "My Application",
  systemDescription: "Main backend service",
});

// Export to LikeC4 (recommended)
const likeC4 = exportContextToLikeC4(context);

// Or export to PlantUML (legacy)
const plantUML = exportContextToPlantUML(context);
```

**LikeC4 Output:**
```c4
specification {
  element system
  element external_system
}

model {
  system = system 'My Application' {
    description 'Main backend service'
  }
  external_Payment_stripe = external_system 'Stripe (Payment)' {
    description 'payment'
  }
  external_Database_dynamodb = external_system 'DynamoDB (Database)' {
    description 'database'
  }

  system -> external_Payment_stripe 'Charge, Refund...'
  system -> external_Database_dynamodb 'Read, Write...'
}

views {
  view context {
    title 'My Application - System Context'
    include *
    autoLayout TopBottom
  }
}
```

**PlantUML Output:**
```plantuml
@startuml C4_Context
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml

title My Application - System Context Diagram

System(system, "My Application", "Main backend service")

System_Ext(external_Payment_stripe, "Stripe (Payment)", "payment")
System_Ext(external_Database_dynamodb, "DynamoDB (Database)", "database")

Rel(system, external_Payment_stripe, "Charge, Refund...")
Rel(system, external_Database_dynamodb, "Read, Write...")

@enduml
```

### C4 Container Diagram

```typescript
import {
  generateC4Containers,
  exportContainersToLikeC4,
  exportContainersToPlantUML
} from "@pietgk/devac-core";

const diagram = generateC4Containers(domainEffects, {
  systemName: "My Application",
  containerGrouping: "directory",  // Group by directory
});

// Export to LikeC4 (recommended)
const likeC4 = exportContainersToLikeC4(diagram);

// Or export to PlantUML (legacy)
const plantUML = exportContainersToPlantUML(diagram);
```

**LikeC4 Output:**
```c4
specification {
  element system
  element container
  element component
  element external_system
}

model {
  system = system 'My Application' {
    api = container 'Api' {
      description 'Payment:Charge, Database:Read, Auth:TokenVerify'
    }
    worker = container 'Worker' {
      description 'Messaging:Receive, Database:Write'
    }
  }

  external_Payment_stripe = external_system 'Stripe (Payment)'
  external_Database_dynamodb = external_system 'DynamoDB (Database)'

  system.api -> external_Payment_stripe 'Payment:Charge'
  system.worker -> external_Database_dynamodb 'Database:Write'
}

views {
  view containers of system {
    title 'My Application - Containers'
    include *
    autoLayout TopBottom
  }
}
```

**PlantUML Output:**
```plantuml
@startuml C4_Container
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

title My Application - Container Diagram

System_Boundary(system, "My Application") {
  Container(api, "Api", "", "Payment:Charge, Database:Read, Auth:TokenVerify")
  Container(worker, "Worker", "", "Messaging:Receive, Database:Write")
}

System_Ext(external_Payment_stripe, "Stripe (Payment)", "payment")
System_Ext(external_Database_dynamodb, "DynamoDB (Database)", "database")

Rel(api, external_Payment_stripe, "Payment:Charge")
Rel(worker, external_Database_dynamodb, "Database:Write")

@enduml
```

## Container Grouping Strategies

The `containerGrouping` option controls how effects are grouped into containers:

| Strategy | Description | Example |
|----------|-------------|---------|
| `directory` | Group by top-level directory | `src/api/*` → "api" container |
| `package` | Group by package path | `packages/auth/*` → "auth" container |
| `flat` | Single "main" container | All in one container |

```typescript
// Directory grouping (default)
generateC4Containers(effects, {
  systemName: "App",
  containerGrouping: "directory",
});

// Package grouping (monorepo)
generateC4Containers(effects, {
  systemName: "App",
  containerGrouping: "package",
});
```

## Domain Boundary Discovery

Discover domain boundaries from effects for architectural analysis:

```typescript
import { discoverDomainBoundaries } from "@pietgk/devac-core";

const boundaries = discoverDomainBoundaries(domainEffects);

for (const boundary of boundaries) {
  console.log(`Domain: ${boundary.name}`);
  console.log(`  Files: ${boundary.files.length}`);
  console.log(`  Components: ${boundary.components.length}`);
  console.log(`  Actions: ${boundary.actions.join(", ")}`);
  console.log(`  External: ${boundary.externalDependencies.join(", ")}`);
  console.log(`  Cohesion: ${boundary.cohesionScore.toFixed(2)}`);
}
```

Output:
```
Domain: Payment
  Files: 5
  Components: 3
  Actions: Charge, Refund, Subscription
  External: stripe
  Cohesion: 0.60

Domain: Auth
  Files: 4
  Components: 4
  Actions: TokenCreate, TokenVerify, PasswordHash
  External: aws-cognito
  Cohesion: 1.00
```

### Domain Boundary Type

```typescript
interface DomainBoundary {
  name: string;                    // Domain name
  files: string[];                 // Files in this domain
  components: string[];            // Component entity IDs
  actions: string[];               // Actions performed
  externalDependencies: string[];  // External providers used
  cohesionScore: number;           // 0-1, higher = more cohesive
}
```

## External System Detection

External systems are automatically detected from domain effects that have:
- `isExternal: true` (for FunctionCall effects)
- `is_third_party: true` (for Send effects)
- A `provider` in the metadata

```typescript
// Effect with external flag
{
  effect_type: "FunctionCall",
  callee_name: "stripe.charges.create",
  is_external: true,
  external_module: "stripe"
}

// Produces C4ExternalSystem
{
  id: "external:Payment:stripe",
  name: "Stripe (Payment)",
  type: "payment",
  provider: "stripe"
}
```

## Integration with Rules Engine

The C4 Generator works with domain effects from the Rules Engine:

```typescript
import {
  createRuleEngine,
  builtinRules,
  generateC4Context,
  exportContextToPlantUML
} from "@pietgk/devac-core";

// 1. Run rules engine on raw effects
const engine = createRuleEngine({ rules: builtinRules });
const result = engine.process(effects);

// 2. Generate C4 context from domain effects
const context = generateC4Context(result.domainEffects, {
  systemName: "My Service",
});

// 3. Export to PlantUML
const plantUML = exportContextToPlantUML(context);
```

## Enhanced LikeC4 Export

For production use, the enhanced LikeC4 exports add source code links, domain tags, and custom element kinds:

```typescript
import {
  generateC4Context,
  generateC4Containers,
  exportContextToEnhancedLikeC4,
  exportContainersToEnhancedLikeC4
} from "@pietgk/devac-core";

const context = generateC4Context(domainEffects, { systemName: "My App" });
const containers = generateC4Containers(domainEffects, { systemName: "My App" });

// Enhanced exports with source links and tags
const enhancedContext = exportContextToEnhancedLikeC4(context, domainEffects, {
  includeSourceLinks: true,
  includeDomainTags: true,
});

const enhancedContainers = exportContainersToEnhancedLikeC4(containers, domainEffects, {
  includeSourceLinks: true,
  includeDomainTags: true,
});
```

**Enhanced Output:**
```c4
specification {
  element api_server {
    style { shape rectangle; color green }
  }
  element database {
    style { shape storage; color blue }
  }
  element external_system

  tag Payment
  tag Database
  tag Auth

  relationship calls
  relationship stores
}

model {
  myApp = api_server 'My App' {
    paymentService = component 'PaymentService' {
      link ./src/services/payment.ts#L45-L120 'Source'
      #Payment
    }
  }

  stripe = external_system 'Stripe'
  myApp.paymentService -> stripe 'charges.create()' #Payment
}
```

## LikeC4 Specification Generator

Generate custom specifications based on detected domains and providers:

```typescript
import {
  generateLikeC4Specification,
  exportSpecificationToLikeC4
} from "@pietgk/devac-core";

// Generate specification from effects
const spec = generateLikeC4Specification(domainEffects, externalSystems);

// Export to DSL
const specDSL = exportSpecificationToLikeC4(spec);
```

### Specification Types

```typescript
interface LikeC4Specification {
  elements: LikeC4ElementKind[];    // Custom element kinds
  tags: LikeC4Tag[];                // Domain tags
  relationships: LikeC4RelationshipKind[];
}

interface LikeC4ElementKind {
  name: string;     // "api_server", "database", "queue"
  shape: LikeC4Shape;
  color: LikeC4Color;
  icon?: string;
}

// Available shapes
type LikeC4Shape =
  | "rectangle" | "person" | "browser"
  | "mobile" | "cylinder" | "storage"
  | "queue" | "component";

// Available colors
type LikeC4Color =
  | "primary" | "secondary" | "muted" | "slate"
  | "blue" | "indigo" | "sky" | "red"
  | "gray" | "green" | "amber";
```

### Default Element Kinds

| Domain | Element Kind | Shape | Color |
|--------|--------------|-------|-------|
| Database | `database` | storage | blue |
| Payment | `payment_service` | rectangle | green |
| Auth | `auth_service` | rectangle | indigo |
| HTTP | `http_client` | rectangle | sky |
| API | `api_endpoint` | rectangle | primary |
| Messaging | `message_queue` | queue | amber |

### External Provider Kinds

| Provider | Element Kind | Shape | Color |
|----------|--------------|-------|-------|
| stripe | `stripe` | rectangle | indigo |
| dynamodb | `dynamodb` | storage | amber |
| s3 | `s3_bucket` | storage | green |
| sqs | `sqs_queue` | queue | amber |
| redis | `redis_cache` | storage | red |

## Dynamic View Generation

Generate sequence-like diagrams from effect chains:

```typescript
import {
  identifyEffectChains,
  generateDynamicViews,
  generateEffectsFlowLikeC4
} from "@pietgk/devac-core";

// Identify top effect chains
const chains = identifyEffectChains(domainEffects, {
  maxChains: 5,           // Top 5 chains
  maxStepsPerChain: 8,    // Max steps per chain
});

// Generate dynamic views
const dynamicViews = generateDynamicViews(chains, {
  titlePrefix: "My App",
});

// Or generate complete file with model + views
const completeFile = generateEffectsFlowLikeC4(domainEffects, "My App");
```

### Effect Chain Analysis

Effect chains are scored by:
- External system involvement (+10 per external effect)
- Domain importance (Payment: +5, Auth: +4, Database: +2)
- Chain length (bonus for 3+ steps)

```typescript
interface EffectChain {
  id: string;              // "payment_stripe_flow"
  name: string;            // "Payment Stripe Flow"
  primaryDomain: string;   // "Payment"
  effects: DomainEffect[]; // Ordered effects
  score: number;           // Importance score
}

interface DynamicViewStep {
  from: string;            // Source element ID
  to: string;              // Target element ID
  label: string;           // "charges.create()"
  relationKind: string;    // "calls", "stores"
  tag?: string;            // Domain tag
}
```

### Dynamic View Output

```c4
dynamic view payment_stripe_flow {
  title 'My App - Payment Stripe Flow'
  description 'Effect flow for Payment operations'

  paymentHandler -> stripe 'charges.create()' #Payment
  paymentHandler -> orderRepo 'saveOrder()' #Database
  orderRepo -> dynamodb 'PutItem' #Database
}
```

## Rendering Diagrams

### LikeC4 (Recommended)

**VSCode Extension:**
Install [LikeC4](https://marketplace.visualstudio.com/items?itemName=likec4.likec4-vscode) for live preview.

**CLI:**
```bash
npx likec4 serve    # Live preview server
npx likec4 export   # Export to PNG/SVG
```

**Web Embedding:**
LikeC4 provides React components for embedding diagrams in documentation.

### PlantUML (Legacy)

The generated PlantUML uses the [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) library. To render:

**Online:**
Use [PlantUML Server](https://www.plantuml.com/plantuml/uml/)

**Local (with PlantUML installed):**
```bash
plantuml diagram.puml
```

**VS Code:**
Install the "PlantUML" extension and preview `.puml` files.

## Full Pipeline Example

```typescript
import {
  createRuleEngine,
  builtinRules,
  generateC4Context,
  generateC4Containers,
  discoverDomainBoundaries,
  exportContainersToEnhancedLikeC4,
  exportContextToEnhancedLikeC4,
  identifyEffectChains,
  generateEffectsFlowLikeC4,
  // Legacy PlantUML exports
  exportContextToPlantUML,
  exportContainersToPlantUML
} from "@pietgk/devac-core";

// Step 1: Run rules on raw effects
const engine = createRuleEngine({ rules: builtinRules });
const { domainEffects, matchedCount, unmatchedCount } = engine.process(effects);

console.log(`Matched: ${matchedCount}, Unmatched: ${unmatchedCount}`);

// Step 2: Discover domain boundaries
const boundaries = discoverDomainBoundaries(domainEffects);
console.log(`Found ${boundaries.length} domains`);

// Step 3: Generate C4 Context
const context = generateC4Context(domainEffects, {
  systemName: "Payment Service",
  systemDescription: "Handles payment processing",
});

console.log(`External systems: ${context.externalSystems.length}`);
console.log(`Total effects: ${context.effectCount}`);

// Step 4: Generate C4 Containers
const containers = generateC4Containers(domainEffects, {
  systemName: "Payment Service",
  containerGrouping: "directory",
});

console.log(`Containers: ${containers.containers.length}`);

// Step 5: Export LikeC4 diagrams (recommended)
const contextLikeC4 = exportContextToEnhancedLikeC4(context, domainEffects, {
  includeSourceLinks: true,
  includeDomainTags: true,
});
const containerLikeC4 = exportContainersToEnhancedLikeC4(containers, domainEffects, {
  includeSourceLinks: true,
  includeDomainTags: true,
});

// Step 6: Generate dynamic effect flow views
const effectsFlow = generateEffectsFlowLikeC4(domainEffects, "Payment Service", {
  maxChains: 5,
});

// Write LikeC4 files
fs.writeFileSync("docs/c4/context.c4", contextLikeC4);
fs.writeFileSync("docs/c4/containers.c4", containerLikeC4);
fs.writeFileSync("docs/c4/effects-flow.c4", effectsFlow);

// Optional: Also export PlantUML for legacy systems
const contextPuml = exportContextToPlantUML(context);
const containerPuml = exportContainersToPlantUML(containers);
fs.writeFileSync("docs/c4/context.puml", contextPuml);
fs.writeFileSync("docs/c4/containers.puml", containerPuml);
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [ADR-0027](../adr/0027-likec4-primary-format.md) | LikeC4 as primary C4 format decision |
| [pipeline.md](./pipeline.md) | Complete AST-to-Views transformation pipeline |
| [rules-engine.md](./rules-engine.md) | Rules engine that produces domain effects |
| [data-model.md](./data-model.md) | Effects schema definitions |
| [../vision/foundation.md](../vision/foundation.md) | Conceptual foundation |
| [LikeC4 Official Site](https://likec4.dev/) | LikeC4 DSL documentation |

---

*Part of DevAC v3.0 Foundation*
