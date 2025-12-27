# Views (C4 Generator)

The Views layer generates C4 architecture diagrams from domain effects, implementing the Vision→View pipeline from DevAC v3.0 Foundation.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  C4 DIAGRAM GENERATION PIPELINE                                             │
│                                                                             │
│  Domain Effects                                                              │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐   │
│  │  C4Context  │     │ C4Container │     │   PlantUML Export           │   │
│  │  Generator  │     │  Generator  │     │                             │   │
│  │             │     │             │     │   @startuml C4_Context      │   │
│  │ System-level│     │ App-level   │     │   !include C4-PlantUML...   │   │
│  │ overview    │     │ containers  │     │   System(...)               │   │
│  └─────────────┘     └─────────────┘     └─────────────────────────────┘   │
│                                                                             │
│  effects → domain effects → C4 models → PlantUML diagrams                  │
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
  exportContextToPlantUML
} from "@pietgk/devac-core";

// Generate C4 context from domain effects
const context = generateC4Context(domainEffects, {
  systemName: "My Application",
  systemDescription: "Main backend service",
});

// Export to PlantUML
const plantUML = exportContextToPlantUML(context);
console.log(plantUML);
```

Output:
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
  exportContainersToPlantUML
} from "@pietgk/devac-core";

const diagram = generateC4Containers(domainEffects, {
  systemName: "My Application",
  containerGrouping: "directory",  // Group by directory
});

const plantUML = exportContainersToPlantUML(diagram);
console.log(plantUML);
```

Output:
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

## PlantUML Rendering

The generated PlantUML uses the [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) library. To render:

### Online
Use [PlantUML Server](https://www.plantuml.com/plantuml/uml/)

### Local (with PlantUML installed)
```bash
plantuml diagram.puml
```

### VS Code
Install the "PlantUML" extension and preview `.puml` files.

## Full Pipeline Example

```typescript
import {
  createRuleEngine,
  builtinRules,
  generateC4Context,
  generateC4Containers,
  discoverDomainBoundaries,
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

// Step 5: Export PlantUML diagrams
const contextDiagram = exportContextToPlantUML(context);
const containerDiagram = exportContainersToPlantUML(containers);

// Write to files
fs.writeFileSync("c4-context.puml", contextDiagram);
fs.writeFileSync("c4-container.puml", containerDiagram);
```

---

*Part of DevAC v3.0 Foundation*
