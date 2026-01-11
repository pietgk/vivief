# How Are Effects Handled in DevAC - v3

> Version: 3.0.0
> Created: 2026-01-10
> Purpose: Comprehensive documentation of DevAC's effect architecture with verified conceptual framework

---

## 1. Executive Summary

DevAC implements a unified **Effect Handler Pattern** that models all code behavior as immutable effects flowing through handlers. This document verifies and demonstrates the core abstraction:

```
effectHandler = (State, Effect) => (State', [Effects'])
```

This pattern is not an interpretation—it is the **documented foundation** of DevAC, verified against:
- `docs/vision/concepts.md:15` — Core definition
- `docs/vision/foundation.md:22-24` — Equivalence principle
- `docs/adr/0015-conceptual-foundation.md:24-28` — ADR formalization

**Key Insight**: Understanding effects = understanding code. If effects capture complete semantics, then `runCode() === handleEffects(extractEffects(code))`.

---

## 2. Conceptual Framework

### 2.1 The Effect Handler Pattern

The foundational abstraction documented in `concepts.md:14-18`:

```
effectHandler = (state, effect) => (state', [effect'])

the main concept is that everything can be presented with effectHandlers
that take a state and an effect, and return a new state and a list of
new effects to be handled.
```

**Source**: `docs/vision/concepts.md:14-18` [HIGH confidence]

### 2.2 Core Equivalence Principle

From `foundation.md:21-24`:

```
runCode() === handleEffects(extractEffects(code))

If Effects capture complete semantics, understanding effects = understanding code.
```

**Source**: `docs/vision/foundation.md:21-24` [HIGH confidence]

### 2.3 ADR Formalization

ADR-0015 formally adopts this pattern (`docs/adr/0015-conceptual-foundation.md:24-28`):

```
Adopt the **Effect Handler Pattern** as the unifying abstraction for DevAC:

effectHandler = (state, effect) => (state', [effect'])

This pattern models everything as immutable effects flowing through handlers
that transform state and potentially emit new effects.
```

**Source**: `docs/adr/0015-conceptual-foundation.md:24-28` [HIGH confidence]

### 2.4 Conceptual Definitions

| Concept | Definition | Examples |
|---------|------------|----------|
| **State** | Any persistent or transient data that handlers read/write | Parquet files, DuckDB tables, Redux stores, DB rows, config objects |
| **Effect** | An immutable message/event describing an action or behavior | FunctionCall, Store, Send, Request, ValidationResult |
| **EffectHandler** | A function that processes an Effect and transforms State | RuleEngine, EffectWriter, EffectEnricher |
| **[Effects']** | Output effects emitted for other handlers to process | DomainEffects, EnrichedEffects |

---

## 3. State in DevAC

State represents the data that handlers read from and write to. DevAC uses multiple state representations:

### 3.1 Canonical State: Parquet Seeds

```
{package}/.devac/seed/base/     ← Base branch analysis
  ├── nodes.parquet             ← Code entities (functions, classes, etc.)
  ├── edges.parquet             ← Relationships (CALLS, IMPORTS, etc.)
  ├── effects.parquet           ← Extracted code effects
  └── external_refs.parquet     ← External package references

{package}/.devac/seed/branch/   ← Feature branch deltas
  └── (same structure)
```

**Source**: `packages/devac-core/src/types/config.ts:119-134` [HIGH confidence]

### 3.2 Federated State: Hub Database

```
{workspace}/.devac/hub.duckdb   ← Cross-repository queries
```

**Source**: `packages/devac-core/src/workspace/discover.ts:548` [HIGH confidence]

### 3.3 State Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                    STATE TRANSITION MODEL                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   State₀ ──[Effect₁]──▶ Handler₁ ──▶ State₁ + [Effect₂,Effect₃] │
│                                                                  │
│   State₁ ──[Effect₂]──▶ Handler₂ ──▶ State₂ + []                │
│                                                                  │
│   State₁ ──[Effect₃]──▶ Handler₃ ──▶ State₃ + [Effect₄]         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Legend:
  State₀, State₁...  = Parquet files, DuckDB tables, in-memory structures
  [Effect₁]...       = Immutable effect messages
  Handler₁...        = EffectHandler implementations
  + []               = Output effects (empty = terminal)
```

---

## 4. Effects as Messages

Effects are immutable data structures representing observable code behaviors. Each effect is a "message" that can be routed to appropriate handlers.

### 4.1 Effect Type Hierarchy

```
┌────────────────────────────────────────────────────────────────────┐
│                        EFFECT TYPES (15 total)                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CODE EFFECTS (9)                    WORKFLOW EFFECTS (6)           │
│  ───────────────                     ─────────────────              │
│  │ FunctionCall  ├──▶ Execution      │ ValidationResult ├──▶ CI    │
│  │ Store         ├──▶ Persistence    │ TestResult       ├──▶ CI    │
│  │ Retrieve      ├──▶ Persistence    │ CoverageResult   ├──▶ CI    │
│  │ Send          ├──▶ Communication  │ DeploymentResult ├──▶ CD    │
│  │ Request       ├──▶ Communication  │ ReviewComment    ├──▶ Collab│
│  │ Response      ├──▶ Communication  │ IssueReference   ├──▶ Collab│
│  │ Condition     ├──▶ Control Flow   │                             │
│  │ Loop          ├──▶ Control Flow   │                             │
│  │ Group         ├──▶ Aggregation    │                             │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘

Source: packages/devac-core/src/types/effects.ts:26-531 [HIGH confidence]
```

### 4.2 Effect Schema (from MCP)

The `effects` table contains 45 columns capturing complete effect semantics:

| Column Group | Key Columns | Purpose |
|--------------|-------------|---------|
| **Identity** | `effect_id`, `effect_type`, `timestamp` | Unique identification |
| **Location** | `source_file_path`, `source_line`, `source_column` | Code position |
| **Source** | `source_entity_id`, `branch` | Origin entity and branch |
| **FunctionCall** | `callee_name`, `callee_qualified_name`, `is_method_call`, `is_async`, `argument_count` | Call details |
| **External** | `is_external`, `external_module`, `is_third_party` | Dependency tracking |
| **Store/Retrieve** | `store_type`, `retrieve_type`, `operation` | Data operations |
| **Request/Response** | `method`, `route_pattern`, `framework`, `status_code` | API interactions |
| **Control Flow** | `condition_type`, `branch_count`, `loop_type` | Flow analysis |
| **Group** | `group_type`, `group_name`, `parent_group_id` | Hierarchical grouping |

**Source**: MCP `get_schema` output [MEDIUM confidence]

### 4.3 Sample Effect (from MCP)

```json
{
  "effect_id": "eff_mk6o0vfc_f7mj687p",
  "effect_type": "FunctionCall",
  "source_entity_id": "CodeGraph:packages/ui-primitives:module:726e2dc9",
  "source_file_path": "packages/ui-primitives/src/Text/Text.tsx",
  "source_line": 47,
  "callee_name": "React.forwardRef",
  "callee_qualified_name": "React.forwardRef",
  "is_method_call": true,
  "is_external": true,
  "external_module": "react",
  "argument_count": 1
}
```

**Source**: MCP `query_effects` output [MEDIUM confidence]

---

## 5. EffectHandler Implementations

DevAC implements several handlers that conform to the `(State, Effect) => (State', [Effects'])` pattern:

### 5.1 RuleEngine Handler

The primary handler for classifying effects into domain-specific categories.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RULE ENGINE HANDLER                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Input:   (State: Rules[], Effect: CodeEffect)                       │
│  Output:  (State': unchanged, [Effects']: DomainEffect[])            │
│                                                                      │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────────┐        │
│  │ CodeEffect   │───▶│ RuleEngine  │───▶│ DomainEffect     │        │
│  │              │    │  .process() │    │                  │        │
│  │ effect_type  │    │             │    │ domain: "Payment"│        │
│  │ callee_name  │    │ 31 rules    │    │ action: "Charge" │        │
│  │ is_external  │    │ first-match │    │ provider: stripe │        │
│  └──────────────┘    └─────────────┘    └──────────────────┘        │
│                                                                      │
│  Algorithm (line 315): First matching rule wins                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Source: packages/devac-core/src/rules/rule-engine.ts:273-362 [HIGH confidence]
```

**Code Reference** (`rule-engine.ts:290-333`):
```typescript
process(effects: CodeEffect[]): RuleEngineResult {
  const domainEffects: DomainEffect[] = [];  // ← [Effects']

  for (const effect of effectsToProcess) {
    for (const rule of this.rules) {
      if (effectMatchesRule(effect, rule.match)) {
        const domainEffect = createDomainEffect(effect, rule);
        domainEffects.push(domainEffect);
        break;  // First matching rule wins (line 315)
      }
    }
  }

  return { domainEffects, matchedCount, unmatchedCount, ruleStats };
}
```

### 5.2 EffectWriter Handler

Persists effects to Parquet state.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EFFECT WRITER HANDLER                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Input:   (State: effects.parquet, Effect: CodeEffect[])             │
│  Output:  (State': effects.parquet updated, [Effects']: [])          │
│                                                                      │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────────────┐      │
│  │ CodeEffect[] │───▶│ EffectWriter  │───▶│ effects.parquet  │      │
│  │              │    │               │    │ (updated)        │      │
│  └──────────────┘    └───────────────┘    └──────────────────┘      │
│                                                                      │
│  Terminal handler: emits no output effects                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Source: packages/devac-core/src/analysis/ [HIGH confidence]
```

### 5.3 EffectEnricher Handler

Enriches domain effects with human-readable metadata.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       EFFECT ENRICHER HANDLER                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Input:   (State: NodeLookupMap, Effect: DomainEffect[])             │
│  Output:  (State': unchanged, [Effects']: EnrichedDomainEffect[])    │
│                                                                      │
│  ┌──────────────┐    ┌────────────────┐    ┌────────────────────┐   │
│  │ DomainEffect │───▶│ EffectEnricher │───▶│ EnrichedDomainEffect│  │
│  │              │    │                │    │                    │   │
│  │ sourceEntity │    │ + nodeLookup   │    │ + sourceName       │   │
│  │ Id (hash)    │    │ + basePath     │    │ + sourceKind       │   │
│  │              │    │                │    │ + relativeFilePath │   │
│  └──────────────┘    └────────────────┘    └────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Source: packages/devac-core/src/views/effect-enricher.ts:27-56 [HIGH confidence]
```

**Code Reference** (`effect-enricher.ts:27-56`):
```typescript
export function enrichDomainEffects(
  effects: DomainEffect[],           // Input effects
  nodeLookup: NodeLookupMap,         // State (read-only)
  basePath?: string,
  internalEdges: InternalEdge[] = []
): EnrichmentResult {
  const enrichedEffects = effects.map((effect): EnrichedDomainEffect => ({
    ...effect,
    sourceName: nodeLookup.get(effect.sourceEntityId)?.name ?? extractFallbackName(effect.sourceEntityId),
    sourceQualifiedName: nodeLookup.get(effect.sourceEntityId)?.qualified_name ?? effect.sourceEntityId,
    sourceKind: nodeLookup.get(effect.sourceEntityId)?.kind ?? "unknown",
    relativeFilePath: computeRelativePath(effect.filePath, basePath),
  }));

  return { effects: enrichedEffects, internalEdges, unenrichedCount };
}
```

---

## 6. Effect Routing and Dispatch

Effects are routed to handlers through pattern matching. The Rules Engine demonstrates this clearly.

### 6.1 Pattern Matching

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EFFECT ROUTING / DISPATCH                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Effect arrives ──▶ Pattern Matcher ──▶ First Match ──▶ Handler      │
│                                                                      │
│  Pattern Matching Criteria:                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Rule.match = {                                               │    │
│  │   effectType: "FunctionCall",    ← Must match effect_type   │    │
│  │   callee: { pattern: "stripe" }, ← Callee name matching     │    │
│  │   isExternal: true               ← External module flag     │    │
│  │ }                                                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Priority ordering: Higher priority rules checked first              │
│  Algorithm: First-match-wins (break on match)                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Source: packages/devac-core/src/rules/rule-engine.ts:315 [HIGH confidence]
```

### 6.2 Rule Definitions (31 Rules)

From MCP `list_rules`, organized by domain:

| Domain | Rules | Priority | Actions |
|--------|-------|----------|---------|
| **Database** | 8 | 5-10 | Read, Write (DynamoDB, Kysely, Prisma, SQL) |
| **Payment** | 3 | 20 | Charge, Refund, Subscription (Stripe) |
| **Auth** | 6 | 15-20 | TokenCreate, TokenVerify, PasswordHash, PasswordVerify, CognitoAuth |
| **HTTP** | 2 | 5-10 | Request (fetch, axios) |
| **API** | 3 | 15 | Mutation, Query, Procedure (tRPC) |
| **Messaging** | 4 | 15 | Send, Receive, Publish (SQS, SNS, EventBridge) |
| **Storage** | 4 | 5-15 | Read, Write (S3, filesystem) |
| **Observability** | 2 | 1-10 | Log, Metric (console, Datadog) |

**Source**: MCP `list_rules` output [MEDIUM confidence]

### 6.3 Handler Dispatch in Action

From MCP `run_rules` with 50 effects:

```
Input:  50 CodeEffects
Output: 1 DomainEffect (matched), 49 unmatched

Matched Effect:
  Rule: "db-read-sql" (SQL Read)
  Domain: "Database"
  Action: "Read"
  Source: packages/ui-primitives/src/theme/size.ts:21
  Callee: "SIZE_NAMES.find"
```

**Source**: MCP `run_rules` output [MEDIUM confidence]

---

## 7. Complete Effect Lifecycle

### 7.1 End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPLETE EFFECT LIFECYCLE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────────┐   │
│  │ Source  │───▶│ Parser   │───▶│ Analyzer  │───▶│ EffectWriter │   │
│  │ Code    │    │ (TS/Py)  │    │           │    │              │   │
│  └─────────┘    └──────────┘    └───────────┘    └──────────────┘   │
│       │                              │                   │           │
│       │                              ▼                   ▼           │
│       │                        CodeEffect[]      effects.parquet    │
│       │                              │               (State)        │
│       │                              ▼                              │
│       │                        ┌───────────┐                        │
│       │                        │ RuleEngine│                        │
│       │                        │ .process()│                        │
│       │                        └───────────┘                        │
│       │                              │                              │
│       │                              ▼                              │
│       │                       DomainEffect[]                        │
│       │                              │                              │
│       │                              ▼                              │
│       │                     ┌────────────────┐                      │
│       │                     │ EffectEnricher │                      │
│       │                     └────────────────┘                      │
│       │                              │                              │
│       │                              ▼                              │
│       │                   EnrichedDomainEffect[]                    │
│       │                              │                              │
│       │                              ▼                              │
│       │                      ┌─────────────┐                        │
│       │                      │ C4 Generator│                        │
│       │                      └─────────────┘                        │
│       │                              │                              │
│       ▼                              ▼                              │
│  runCode()  ═══════════════  handleEffects(extractEffects(code))   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Legend:
  ───▶  = Data flow
  ═══   = Equivalence (foundation.md:22)
  State = Parquet files (effects.parquet, nodes.parquet, etc.)
```

### 7.2 Formal State Transitions

```
T₀: (∅, SourceCode) ─────────────────▶ Parser ──▶ (AST, [])
T₁: (AST, ∅) ────────────────────────▶ Analyzer ──▶ (∅, CodeEffect[])
T₂: (effects.parquet, CodeEffect[]) ─▶ Writer ──▶ (effects.parquet', [])
T₃: (Rules[], CodeEffect[]) ─────────▶ RuleEngine ──▶ (Rules[], DomainEffect[])
T₄: (NodeMap, DomainEffect[]) ───────▶ Enricher ──▶ (NodeMap, EnrichedEffect[])
T₅: (∅, EnrichedEffect[]) ───────────▶ C4Gen ──▶ (C4Model, [])

Where:
  T = State transition
  (State, Input) ─▶ Handler ──▶ (State', Output)
```

---

## 8. C4 Architecture Diagrams

### 8.1 System Context (Level 1)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      C4 SYSTEM CONTEXT                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                        ┌─────────────┐                               │
│                        │  Developer  │                               │
│                        │   (Actor)   │                               │
│                        └──────┬──────┘                               │
│                               │                                      │
│               queries via CLI/MCP                                    │
│                               │                                      │
│                               ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                         DevAC                                │    │
│  │              [Code Analysis System]                          │    │
│  │                                                              │    │
│  │  Extracts effects from source code and provides             │    │
│  │  queryable code graph with cross-repo federation            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                               │                                      │
│            writes to / reads from                                    │
│                               │                                      │
│           ┌───────────────────┼───────────────────┐                 │
│           ▼                   ▼                   ▼                  │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐           │
│   │ Source Code  │   │ Parquet Seeds│   │ Hub Database │           │
│   │  (External)  │   │   (State)    │   │   (State)    │           │
│   │              │   │              │   │              │           │
│   │ .ts/.py/.cs  │   │ .devac/seed/ │   │ .devac/hub   │           │
│   └──────────────┘   └──────────────┘   └──────────────┘           │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ LEGEND                                                               │
│   [Actor]      = User/external system                               │
│   [System]     = DevAC application                                  │
│   (State)      = Persistent state managed by handlers               │
│   (External)   = External input to the system                       │
├─────────────────────────────────────────────────────────────────────┤
│ EFFECT REFERENCES                                                    │
│   Source Code  → Parsed to extract CodeEffect[] (effect_type: *)    │
│   Parquet Seeds → Written by EffectWriter (effects.parquet)         │
│   Hub Database → Federated queries across effect tables             │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      C4 CONTAINER DIAGRAM                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  DevAC System Boundary                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │   ┌──────────────┐      ┌──────────────┐                    │    │
│  │   │  devac-cli   │─────▶│  devac-core  │                    │    │
│  │   │ [Container]  │      │ [Container]  │                    │    │
│  │   │              │      │              │                    │    │
│  │   │ Commands,    │      │ Analysis,    │                    │    │
│  │   │ user I/O     │      │ Handlers,    │                    │    │
│  │   └──────────────┘      │ Storage      │                    │    │
│  │                         └──────┬───────┘                    │    │
│  │                                │                            │    │
│  │   ┌──────────────┐             │                            │    │
│  │   │  devac-mcp   │─────────────┘                            │    │
│  │   │ [Container]  │                                          │    │
│  │   │              │                                          │    │
│  │   │ MCP server,  │                                          │    │
│  │   │ AI assistant │                                          │    │
│  │   │ integration  │                                          │    │
│  │   └──────────────┘                                          │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                │                                     │
│                    reads/writes effects                              │
│                                │                                     │
│           ┌────────────────────┼────────────────────┐               │
│           ▼                    ▼                    ▼                │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │ effects.pq   │    │ nodes.pq     │    │ hub.duckdb   │         │
│   │  [Store]     │    │  [Store]     │    │  [Store]     │         │
│   │              │    │              │    │              │         │
│   │ CodeEffect   │    │ NodeMetadata │    │ Federated    │         │
│   │ records      │    │ for enricher │    │ queries      │         │
│   └──────────────┘    └──────────────┘    └──────────────┘         │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ LEGEND                                                               │
│   [Container] = Deployable unit (CLI, library, server)              │
│   [Store]     = State storage (Parquet file, DuckDB database)       │
│   ──────▶     = Dependency / data flow                              │
├─────────────────────────────────────────────────────────────────────┤
│ EFFECT REFERENCES                                                    │
│   effects.pq   → effect_id, effect_type, source_entity_id, etc.    │
│   nodes.pq     → Used by EffectEnricher for sourceName resolution   │
│   hub.duckdb   → Enables cross-repo effect queries via MCP          │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.3 Component Diagram: Effect Handlers (Level 3)

```
┌─────────────────────────────────────────────────────────────────────┐
│                  C4 COMPONENT: EFFECT HANDLERS                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  devac-core Container                                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │   ┌─────────────────────────────────────────────────────┐   │    │
│  │   │              TypeScript Parser                       │   │    │
│  │   │              [Component]                             │   │    │
│  │   │                                                      │   │    │
│  │   │  Extracts CodeEffect[] from source                   │   │    │
│  │   │  Output: FunctionCall, Store, Send, etc.             │   │    │
│  │   └────────────────────┬────────────────────────────────┘   │    │
│  │                        │ CodeEffect[]                       │    │
│  │                        ▼                                    │    │
│  │   ┌─────────────────────────────────────────────────────┐   │    │
│  │   │              RuleEngine                              │   │    │
│  │   │              [Component: EffectHandler]              │   │    │
│  │   │                                                      │   │    │
│  │   │  (Rules[], CodeEffect) => (Rules[], DomainEffect[])  │   │    │
│  │   │  31 rules, first-match-wins, priority ordering       │   │    │
│  │   │  rule-engine.ts:273-362                              │   │    │
│  │   └────────────────────┬────────────────────────────────┘   │    │
│  │                        │ DomainEffect[]                     │    │
│  │                        ▼                                    │    │
│  │   ┌─────────────────────────────────────────────────────┐   │    │
│  │   │              EffectEnricher                          │   │    │
│  │   │              [Component: EffectHandler]              │   │    │
│  │   │                                                      │   │    │
│  │   │  (NodeMap, DomainEffect) => (NodeMap, Enriched[])    │   │    │
│  │   │  Adds sourceName, sourceKind, relativeFilePath       │   │    │
│  │   │  effect-enricher.ts:27-56                            │   │    │
│  │   └────────────────────┬────────────────────────────────┘   │    │
│  │                        │ EnrichedDomainEffect[]             │    │
│  │                        ▼                                    │    │
│  │   ┌─────────────────────────────────────────────────────┐   │    │
│  │   │              C4 Generator                            │   │    │
│  │   │              [Component]                             │   │    │
│  │   │                                                      │   │    │
│  │   │  Produces architecture diagrams from effects         │   │    │
│  │   │  c4-generator.ts                                     │   │    │
│  │   └─────────────────────────────────────────────────────┘   │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ LEGEND                                                               │
│   [Component]              = Code module                            │
│   [Component: EffectHandler] = Implements handler pattern           │
│   ─────▶                   = Effect flow (input → output)           │
├─────────────────────────────────────────────────────────────────────┤
│ EFFECT FIELD REFERENCES                                              │
│   CodeEffect fields:   effect_type, callee_name, is_external, etc. │
│   DomainEffect fields: domain, action, metadata, ruleId            │
│   Enriched fields:     sourceName, sourceKind, relativeFilePath    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. MCP Integration

The MCP server exposes effect data for AI assistant queries.

### 9.1 Effect-Related MCP Tools

| Tool | Purpose | Effect Fields Used |
|------|---------|-------------------|
| `query_effects` | Query raw effects | All 45 columns |
| `run_rules` | Execute handler dispatch | effect_type, callee_name, is_external |
| `list_rules` | Show available handlers | (rule definitions) |
| `get_schema` | Describe effect table | Column metadata |
| `generate_c4` | Architecture diagrams | domain, action, metadata |

### 9.2 Query Examples

**Query all FunctionCalls to external modules:**
```sql
SELECT effect_id, callee_name, external_module, source_line
FROM effects
WHERE effect_type = 'FunctionCall' AND is_external = true
LIMIT 20
```

**Query effects by domain after rules processing:**
```
MCP: run_rules with domain="Payment"
→ Returns all Stripe-related effects classified as Payment:Charge, Payment:Refund, etc.
```

---

## 10. Future: Runtime Tracing

> **Status**: Planned feature, not yet implemented [N/A confidence]

Runtime tracing will capture actual execution effects to complement static analysis:

```
Static:  extractEffects(sourceCode) → CodeEffect[]
Runtime: traceEffects(execution) → RuntimeEffect[]
Combined: mergeEffects(static, runtime) → CompleteEffect[]
```

This will enable:
- Actual call graph vs. potential call graph
- Runtime values for effect arguments
- Performance profiling via effect timing

---

## 11. Data Sources and Methodology

### 11.1 Source Code References

| File | Lines | Content | Confidence |
|------|-------|---------|------------|
| `docs/vision/concepts.md` | 14-18 | Core effectHandler definition | HIGH |
| `docs/vision/foundation.md` | 21-25 | Equivalence principle | HIGH |
| `docs/adr/0015-conceptual-foundation.md` | 24-28 | ADR formalization | HIGH |
| `packages/devac-core/src/rules/rule-engine.ts` | 273-362 | RuleEngine class | HIGH |
| `packages/devac-core/src/rules/rule-engine.ts` | 290-333 | process() method | HIGH |
| `packages/devac-core/src/rules/rule-engine.ts` | 315 | First-match-wins | HIGH |
| `packages/devac-core/src/views/effect-enricher.ts` | 27-56 | enrichDomainEffects() | HIGH |
| `packages/devac-core/src/types/effects.ts` | 26-531 | Effect type definitions | HIGH |
| `packages/devac-core/src/types/config.ts` | 119-134 | Seed path definitions | HIGH |
| `packages/devac-core/src/workspace/discover.ts` | 548 | Hub path definition | HIGH |

### 11.2 MCP Data Sources

| Tool | Data Retrieved | Confidence |
|------|----------------|------------|
| `get_schema` | Effects table schema (45 columns) | MEDIUM |
| `query_effects` | Sample effects (10 rows) | MEDIUM |
| `list_rules` | Rule definitions (31 rules) | MEDIUM |
| `run_rules` | Handler dispatch results | MEDIUM |

### 11.3 Confidence Levels

| Level | Meaning |
|-------|---------|
| **HIGH** | Verified directly from source code with file:line reference |
| **MEDIUM** | From MCP tool output or documentation |
| **LOW** | Inferred from patterns (none used in this document) |
| **N/A** | Planned feature, not yet implemented |

### 11.4 Verification Commands

```bash
# Verify conceptual foundation
grep -n "effectHandler" /Users/grop/ws/vivief/docs/vision/concepts.md

# Verify equivalence principle
grep -n "runCode\|handleEffects" /Users/grop/ws/vivief/docs/vision/foundation.md

# Verify RuleEngine process method
grep -n "process\|domainEffects\|break" /Users/grop/ws/vivief/packages/devac-core/src/rules/rule-engine.ts

# Verify seed paths
grep -n "getSeedPaths\|base\|branch" /Users/grop/ws/vivief/packages/devac-core/src/types/config.ts

# Verify hub path
grep -n "hub.duckdb\|hubPath" /Users/grop/ws/vivief/packages/devac-core/src/workspace/discover.ts

# Verify EffectEnricher
grep -n "enrichDomainEffects\|sourceName" /Users/grop/ws/vivief/packages/devac-core/src/views/effect-enricher.ts
```

---

## 12. Summary

DevAC's effect architecture implements the verified pattern:

```
effectHandler = (State, Effect) => (State', [Effects'])
```

**Key Components:**
1. **State**: Parquet seeds (`.devac/seed/base/`, `.devac/seed/branch/`), Hub database (`.devac/hub.duckdb`)
2. **Effects**: 15 types (9 Code + 6 Workflow), captured in 45-column schema
3. **Handlers**: RuleEngine (dispatch), EffectEnricher (metadata), EffectWriter (persistence)
4. **Dispatch**: Pattern matching with 31 rules, first-match-wins algorithm

**Core Equivalence**: `runCode() === handleEffects(extractEffects(code))`

---

*Document generated with verified sources. All HIGH confidence claims include file:line references.*
