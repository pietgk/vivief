# Implementation Gaps

> Consolidated tracking of what's not yet implemented in the Actor + UI Effects vision.

**Related Documents**:
- [actors.md](../vision/actors.md) — Actor Model vision
- [ui-effects.md](../vision/ui-effects.md) — UI Effects vision
- [test-strategy.md](./test-strategy.md) — Test approach

**Last Updated**: 2026-01-18

---

## Overview

This document tracks implementation gaps against the vision. Items are organized by phase and marked with status:

- ⬜ Not started
- 🔄 In progress
- ✅ Complete

---

## Phase 0: JSX Component Extraction (Prerequisite)

**Status**: ✅ Complete

JSX extraction has been implemented, enabling A11y and Actor discovery phases.

| Gap | Description | Priority |
|-----|-------------|----------|
| ✅ JSX element handlers | Added `handleJSXElement()`, `handleJSXFragment()` to TypeScript parser | High |
| ✅ Component hierarchy edges | Created RENDERS, INSTANTIATES, and PASSES_PROPS edges for component hierarchy | High |
| ✅ Props extraction | Extract props as node properties including regular, ARIA, and event handlers | High |
| ✅ PASSES_PROPS edges | Track props passed from parent to child components | High |
| ✅ Dynamic prop handling | Handle `prop={variable}` expressions with `[expression]` placeholders | Medium |
| ✅ ARIA attribute extraction | Extract `role`, `aria-*` attributes as separate properties | High |
| ✅ Event handler detection | Track `onClick`, `onKeyDown`, etc. with keyboard a11y warnings | High |
| ✅ Auto Hub Sync | Added `--sync` flag to validate command for auto-detected repo sync | Medium |
| ⬜ Component composition | Track HOCs, render props, hooks patterns | Medium |

**Files modified**:
- `packages/devac-core/src/parsers/typescript-parser.ts` - Added JSX handlers, props extraction, PASSES_PROPS edges
- `packages/devac-core/src/parsers/scoped-name-generator.ts` - Added `jsx_component` and `html_element` kinds
- `packages/devac-core/src/types/edges.ts` - Added `RENDERS` and `PASSES_PROPS` edge types
- `packages/devac-core/src/types/nodes.ts` - Added `html_element` to NodeKind
- `packages/devac-cli/src/commands/validate.ts` - Added `--sync` flag with auto repo ID detection
- `packages/devac-core/src/index.ts` - Exported `detectRepoId` utilities

**Tests added**:
- `packages/devac-core/__tests__/jsx-extraction.test.ts` - 40 comprehensive tests (basic extraction, props, ARIA, PASSES_PROPS, html_element)
- `packages/devac-cli/__tests__/validate-command.test.ts` - 5 new tests for --sync flag

**Validation**: ✅ Can query JSX components, props, ARIA attributes, and component hierarchy

---

## Phase 0 Known Limitations

**Status**: 📋 Documented (Low Priority)

Minor issues identified during quality review that can be addressed when needed:

| Gap | Description | Priority | Notes |
|-----|-------------|----------|-------|
| ⬜ Parent JSX boundary handling | JSX in callbacks may link to outer parent incorrectly | Low | Defer until real problem occurs |
| ⬜ Method refactoring | `handleJSXElement` is ~120 lines, could be split | Low | Code style, not a bug |
| ⬜ Node position deduplication | Two JSX at same line:column could collide | Low | Unlikely in real code |

---

## Test Coverage Gaps (Deferred)

**Status**: 📋 Documented (Complex Mocking Required)

These gaps require complex mocking that conflicts with Vitest's module hoisting:

| Gap | Description | Priority | Notes |
|-----|-------------|----------|-------|
| ⬜ getIssuesForContext() tests | Requires child_process mocking with callback pattern | Medium | Needs research on spawn mocking |
| ⬜ getReviewsForContext() tests | Same as above | Medium | Same solution needed |
| ⬜ Performance/scale tests | Tests with 1000+ items | Low | Add when performance issues arise |
| ⬜ Concurrent operation tests | Race condition testing | Low | Add when bugs reported |

**Research needed:**
- How to mock `child_process.exec` with Vitest's hoisting
- Consider using `spawn` instead of `exec` for better testability
- Explore `vitest-mock-process` or similar libraries

---

## Phase 1: A11y Attribute Extraction

**Status**: ✅ Complete

All A11y attribute extraction has been implemented, enabling WCAG validation and ARIA relationship tracking.

| Gap | Description | Priority |
|-----|-------------|----------|
| ✅ ARIA attribute extraction | Extract `role`, `aria-*` as node properties | High |
| ✅ Interactive element detection | HTML elements identified as `html_element` kind | High |
| ✅ ARIA relationship edges | Create REFERENCES edges for `aria-controls`, `aria-labelledby`, `aria-describedby`, `aria-owns`, etc. | High |
| ✅ Event handler detection | Track `onClick`, `onKeyDown`, etc. with a11y warnings | Medium |
| ✅ tabIndex handling | Extract tabIndex value; tabIndex >= 0 suppresses a11y warnings | Medium |
| ✅ Element ID tracking | Extract `id` attribute to enable ARIA reference resolution | Medium |

**Files modified**:
- `packages/devac-core/src/parsers/typescript-parser.ts` - Added ARIA ID reference edges, element ID extraction, tabIndex handling, improved a11y logic

**Implementation details**:
- Added `ARIA_ID_REFERENCE_ATTRS` constant for 8 ARIA ID-referencing attributes
- Extended `JSXPropsResult` with `elementId`, `tabIndex`, and `ariaIdRefs` fields
- REFERENCES edges created with `ariaRelationType`, `ariaAttribute`, and `referencedId` properties
- Target entity IDs use `unresolved:aria:{id}` format for future resolution
- `tabIndex >= 0` makes element keyboard focusable (suppresses a11y warning)
- `tabIndex={-1}` still flags potential a11y issue (element not in tab order)

**Tests added**:
- 14 new tests in `packages/devac-core/__tests__/jsx-extraction.test.ts`:
  - ARIA relationship edges (7 tests): aria-labelledby, space-separated IDs, aria-controls, aria-owns, aria-activedescendant, components, dynamic IDs
  - Element ID extraction (3 tests): HTML elements, components, dynamic IDs
  - tabIndex handling (4 tests): tabIndex >= 0, tabIndex -1, components, lowercase tabindex

**Validation**: ✅ Can query ARIA relationships via REFERENCES edges with `ariaRelationType` property

---

## Phase 2: WCAG Validation

**Status**: ✅ Complete

All WCAG validation has been implemented, enabling accessibility issue detection alongside TypeScript and lint errors.

| Gap | Description | Priority |
|-----|-------------|----------|
| ✅ WCAG rule definitions | Define rules in Rules Engine format | High |
| ✅ Missing accessible name detection | WCAG 4.1.2 validation | High |
| ✅ Keyboard accessibility check | Validate interactive elements are keyboard accessible | High |
| ✅ Broken ARIA reference detection | Find `aria-controls` pointing to non-existent IDs | Medium |
| ✅ Diagnostics output | Output as diagnostics alongside type/lint errors | Medium |

**Files created**:
- `packages/devac-core/src/rules/wcag-rules.ts` - 5 WCAG rules with query functions
- `packages/devac-core/src/validation/wcag-analyzer.ts` - Analyzer with utility functions
- `packages/devac-core/src/validation/validators/wcag-validator.ts` - Validator following existing pattern

**Files modified**:
- `packages/devac-core/src/validation/validation-coordinator.ts` - Added WCAG validation to orchestration
- `packages/devac-core/src/validation/issue-enricher.ts` - Added "wcag" to ValidationIssue source type
- `packages/devac-core/src/validation/validators/index.ts` - Exported WcagValidator
- `packages/devac-core/src/validation/index.ts` - Exported WCAG analyzer and validator
- `packages/devac-core/src/rules/index.ts` - Exported WCAG rules

**Implementation details**:
- 5 WCAG rules implemented:
  - `wcag-keyboard-accessible` (2.1.1, Level A) - Interactive elements must be keyboard accessible
  - `wcag-accessible-name` (4.1.2, Level A) - Interactive elements must have accessible name
  - `wcag-valid-aria-reference` (1.3.1, Level A) - ARIA ID references must point to existing elements
  - `wcag-no-positive-tabindex` (2.4.3, Level A) - Avoid tabIndex > 0
  - `wcag-button-has-text` (4.1.2, Level A) - Buttons must have text content or aria-label
- WcagAnalyzer with utility functions for grouping and filtering issues
- WcagValidator integrates with SeedReader and ValidationCoordinator
- ValidationCoordinator runs WCAG validation in full mode (disabled in quick mode)
- Issues appear in unified_diagnostics alongside tsc/eslint errors

**Tests added**:
- `packages/devac-core/__tests__/wcag-rules.test.ts` - 37 tests for rule definitions and query functions
- `packages/devac-core/__tests__/wcag-analyzer.test.ts` - 26 tests for analyzer and utility functions
- `packages/devac-core/__tests__/validation/validators/wcag-validator.test.ts` - 10 tests for validator integration

**Validation**: ✅ WCAG violations appear as diagnostics with proper source, severity, and WCAG criterion metadata

---

## Phase 3: Hook-Based Validation Triggering

**Status**: ✅ Complete

Hook-based automation to make validation proactive rather than manual. This phase makes DevAC a first-class Claude Code citizen with automatic context injection.

**Vision Document:** @docs/vision/combine-reliable-context-injection-with-intelligent-instruction-following.md
**ADR:** @docs/adr/0043-hook-based-validation-triggering.md

| Gap | Description | Priority | Status |
|-----|-------------|----------|--------|
| ✅ hooks.json creation | Create `plugins/devac/hooks/hooks.json` with UserPromptSubmit and Stop hooks | High | Complete |
| ✅ `devac status --inject` | CLI command outputting hook-compatible JSON with diagnostic counts | High | Complete |
| ✅ `devac validate --on-stop` | CLI command running validation and outputting resolution instructions | High | Complete |
| ⬜ Progressive disclosure | Add `level` parameter to `get_all_diagnostics` MCP tool | Medium | Future enhancement |
| ⬜ Session context | Track edited files per session for targeted validation | Medium | Future enhancement |
| ⬜ diagnostics-triage skill update | Document auto-injection behavior | Low | Documentation |

**Files created/modified:**
- `plugins/devac/hooks/hooks.json` - Hook definitions with UserPromptSubmit and Stop events ✅
- `packages/devac-cli/src/commands/status.ts` - Added `--inject` flag for hook-compatible output ✅
- `packages/devac-cli/src/commands/validate.ts` - Added `--on-stop` and `--mode quick` flags ✅

**Tests added:**
- `packages/devac-cli/__tests__/hook-output.integration.test.ts` - Integration tests for hook output format
- `packages/devac-cli/__tests__/cli-hooks.e2e.test.ts` - E2E tests for hook workflow

**Documentation added:**
- `docs/testing/diagrams/hook-output-flow.md` - Hook output flow documentation

**Validation:** ✅ Hooks work with Claude Code:
- UserPromptSubmit: `devac status --inject` outputs diagnostic counts on session start
- Stop: `devac validate --on-stop --mode quick` runs validation on session end

---

## Phase 4A: OTel Integration

**Status**: ⬜ Not started

| Gap | Description | Priority |
|-----|-------------|----------|
| ⬜ OTel SDK setup | Add `@opentelemetry/api`, configure SDK | High |
| ⬜ Effect-aware span wrapper | Create `withEffectSpan()` function | High |
| ⬜ EventEnvelope trace context | Extend with traceId, spanId, entityId | High |
| ⬜ Span exporter | Export spans to hub database | High |
| ⬜ Vitest setup integration | Initialize OTel in test setup | Medium |

**Files to create**:
- `packages/devac-core/src/telemetry/otel-setup.ts`
- `packages/devac-core/src/telemetry/effect-tracer.ts`
- `packages/devac-core/src/telemetry/span-exporter.ts`

**Dependencies**:
- `@opentelemetry/api` ^1.7.0
- `@opentelemetry/sdk-trace-base` ^1.18.0

**Validation**: `npm test` produces spans with entity IDs

---

## Phase 4B: Effect Correlation

**Status**: ⬜ Not started

| Gap | Description | Priority |
|-----|-------------|----------|
| ⬜ OTel spans table | Create `otel_spans` in hub schema | High |
| ⬜ Correlation view | Join `effects` and `otel_spans` on entity_id | High |
| ⬜ Coverage queries | "Which effects validated by tests?" | High |
| ⬜ MCP endpoint | Add `get_effect_coverage` to diagnostics | Medium |
| ⬜ Dead effect detection | Identify static-only effects | Medium |

**Files to create**:
- `packages/devac-hub/src/schema/otel-spans.sql`
- `packages/devac-hub/src/queries/effect-coverage.ts`

**Validation**: SQL query matches static effects to runtime spans

---

## Phase 4C: Effect Probing (Novel Concept)

**Status**: ⬜ Not started (Research complete)

**Origin**: This concept emerged from research into combining black-box testing with OTel tracing (2026-01-18).

### Concept: Effect Probing

**Effect Probing** = Black-box testing with internal effect observation

Unlike pure black-box (no visibility) or pure white-box (requires code understanding), Effect Probing gives:
- Input/output correctness (black-box)
- Internal effect sequence (tracing)
- Correlation to static analysis (DevAC)
- Without modifying test assertions (just instrument and observe)

```
┌─────────────────────────────────────────────────────────────────┐
│                     EFFECT PROBING ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐     ┌───────────────────────────┐     ┌────────┐ │
│   │  Known  │────▶│   System Under Test       │────▶│ Output │ │
│   │  Input  │     │   (OTel instrumented)     │     │        │ │
│   └─────────┘     └───────────┬───────────────┘     └────────┘ │
│                               │                                  │
│                               ▼ (side channel)                   │
│                   ┌───────────────────────────┐                  │
│                   │      OTel Collector       │                  │
│                   │  - Spans with entity IDs  │                  │
│                   │  - Effect types           │                  │
│                   │  - State snapshots        │                  │
│                   └───────────┬───────────────┘                  │
│                               │                                  │
│                               ▼                                  │
│                   ┌───────────────────────────┐                  │
│                   │   DevAC Correlation       │                  │
│                   │  - Match to static effects│                  │
│                   │  - Verify sequences       │                  │
│                   │  - Find untested paths    │                  │
│                   └───────────────────────────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### OTel Entity ID Injection Pattern

Standard OTel attributes for code correlation:
- `code.file.path` → Source file
- `code.function.name` → Fully-qualified function name
- `code.column.number` → Column in source
- `code.namespace` → Namespace/module

**Proposed DevAC custom attributes:**
```typescript
span.setAttribute("code.entity.id", "github.com/org/repo:pkg:function:hash123");
span.setAttribute("code.entity.type", "function");  // function | method | class
span.setAttribute("devac.effect.type", "FunctionCall");  // | Store | Retrieve | Send
```

### Implementation Pattern

```typescript
// Test harness with black-box + tracing
async function blackBoxEffectTest(input: TestInput, expectedEffects: Effect[]) {
  // 1. Set up OTel collector
  const collector = new TestSpanCollector();
  
  // 2. Execute with known input
  const output = await systemUnderTest(input);
  
  // 3. Collect observed effects from spans
  const observedEffects = collector.spans
    .filter(s => s.attributes["devac.effect.type"])
    .map(s => ({
      entityId: s.attributes["code.entity.id"],
      effectType: s.attributes["devac.effect.type"],
      sequence: s.startTime,
    }));
  
  // 4. Compare against static analysis expectations
  validateEffectSequence(expectedEffects, observedEffects);
}
```

### Correlation Queries

```sql
-- Find effects that are statically present but never exercised at runtime
SELECT e.entity_id, e.effect_type, e.domain
FROM static_effects e
LEFT JOIN otel_spans s ON e.entity_id = s.code_entity_id
WHERE s.code_entity_id IS NULL;

-- Find runtime effects not predicted by static analysis (unexpected!)
SELECT s.code_entity_id, s.effect_type
FROM otel_spans s
LEFT JOIN static_effects e ON s.code_entity_id = e.entity_id
WHERE e.entity_id IS NULL;

-- Effect sequence validation
SELECT 
  s1.code_entity_id as first_effect,
  s2.code_entity_id as second_effect,
  s2.start_time - s1.start_time as time_between
FROM otel_spans s1
JOIN otel_spans s2 ON s1.trace_id = s2.trace_id 
  AND s2.start_time > s1.start_time
WHERE s1.effect_domain = 'Auth' AND s2.effect_domain = 'Database';
```

### Use Cases

| Use Case | Query | Value |
|----------|-------|-------|
| **Effect Coverage** | Which domain effects are exercised by this test suite? | Identify untested business logic |
| **Regression Detection** | Did this change add unexpected effects? | Catch unintended side effects |
| **Security Audit** | Does this endpoint actually call auth before DB access? | Verify security invariants |
| **Performance Analysis** | What's the effect execution sequence and timing? | Identify bottlenecks |

| Gap | Description | Priority |
|-----|-------------|----------|
| ⬜ Entity ID injection in OTel spans | Add `code.entity.id` to spans | High |
| ⬜ Test span collector | Capture spans in test environment | High |
| ⬜ Static/runtime correlation queries | SQL joins between effects and spans | High |
| ⬜ Effect sequence validation | Compare observed vs expected order | Medium |
| ⬜ Untested effect detection | Report static effects never seen at runtime | Medium |

**Validation**: Can answer "which static effects actually fire at runtime?"

---

## Phase 5: Actor Discovery

**Status**: ⬜ Not started

### 5A: Explicit XState Extraction

| Gap | Description | Priority |
|-----|-------------|----------|
| ⬜ XState v5 pattern detection | Recognize `setup().createMachine()` | High |
| ⬜ XState v4 pattern detection | Recognize `createMachine()` | High |
| ⬜ Machine state extraction | Extract states, events, transitions | High |
| ⬜ Actor effect creation | Create Actor effects from parsed machines | High |

### 5B: Effect Path Analysis (Inference)

| Gap | Description | Priority |
|-----|-------------|----------|
| ⬜ TransitionPattern rules | Rules matching effect sequences | High |
| ⬜ State variable detection | Identify `useState`, `useReducer` patterns | High |
| ⬜ Event handler → event mapping | Map `onClick` to triggering events | Medium |
| ⬜ Condition → guard mapping | Map conditionals to transition guards | Medium |
| ⬜ ActorPattern rules | Group transitions into Actors | Medium |

### 5C: Research Needed

**Status**: ✅ Research Complete (2026-01-18)

| Question | Status | Key Findings |
|----------|--------|--------------|
| How do other tools infer state machines? | ✅ Researched | Three approaches: Static (AST/CFG), Dynamic (Trace Mining), Hybrid |
| What patterns reliably indicate state vs conditional? | ✅ Researched | 5 heuristics identified (see below) |
| Can Rules Engine handle sequence matching? | ✅ Evaluated | Yes, with CEP-style extension (see below) |

#### State Machine Inference Approaches

| Approach | Pros | Cons | DevAC Fit |
|----------|------|------|-----------|
| **Static (AST/CFG)** | Complete path coverage, deterministic | Path explosion, hard with loops | ✅ Aligns with current extraction |
| **Dynamic (Trace Mining)** | Concrete observations, practical | Incomplete coverage, needs tests | ✅ Fits OTel integration vision |
| **Hybrid (Static + Dynamic)** | Best of both worlds | More complex to implement | ✅ Ideal target architecture |

**Key Insight**: [ProtocolGPT (2025)](https://arxiv.org/abs/2405.00393) shows LLMs + RAG can achieve >90% precision on state machine inference. DevAC could use Claude to assist Actor discovery rather than pure algorithmic approaches.

#### State Variable Detection Heuristics

1. Variable has enum/union type → High likelihood
2. Variable used in multiple guards → High likelihood  
3. Variable has < 10 possible values → High likelihood
4. Variable is mutated in few places → Medium likelihood
5. Switch/if-else patterns on the variable → High likelihood

**Research Insight**: Interactive refinement beats full automation. Academic research shows fully-automatic mining produces overly complex models. DevAC should present candidates for user validation.

#### Sequence Pattern Matching (Rules Engine Extension)

**Current**: Single-effect rules
```typescript
{ pattern: { callee: "stripe.charges.create" }, domain: "Payment", action: "Charge" }
```

**Proposed Extension**: CEP-style sequence rules
```typescript
{
  sequence: [
    { pattern: { callee: "auth.verify" }, as: "auth" },
    { pattern: { callee: "db.query" }, as: "fetch" },
    { pattern: { callee: "email.send" }, as: "notify" }
  ],
  constraints: [
    { "auth.success": true },  // Must succeed before fetch
    { order: ["auth", "fetch", "notify"] }  // Temporal ordering
  ],
  domain: "SecureWorkflow",
  action: "AuthenticatedDataAccess"
}
```

**Pattern to Adopt**: Semgrep's ellipsis operator for "A then B" patterns:
```yaml
# "free() called twice without reassignment between"
pattern: |
  free($PTR);
  ...
  free($PTR);
pattern-not: |
  free($PTR);
  ...
  $PTR = ...;
  ...
  free($PTR);
```

#### Tools to Learn From

- **AALpy** (Python): Active automata learning with L* algorithm
- **LearnLib** (Java): Industrial-strength, used for protocol/smart card analysis
- **Joern CPG**: Control-flow sensitive queries (`controls`, `controlledBy`, `dominatedBy`)

**Validation**: Can query "what states does Dialog component have?"

---

## Browser Automation Integration

**Status**: ✅ Released (v0.2.0)

Browser automation suite released for E2E validation capabilities.

| Package | Status | Description |
|---------|--------|-------------|
| browser-cli | ✅ v0.2.0 | Browser automation CLI commands |
| browser-core | ✅ v0.2.0 | Playwright wrapper with element refs |
| browser-mcp | ✅ v0.2.0 | MCP server for browser control |

**Integration Gaps** (Future Work):

| Gap | Description | Priority |
|-----|-------------|----------|
| ⬜ Validation integration | Connect browser tests to validation pipeline | Medium |
| ⬜ A11y browser testing | Use browser for runtime WCAG validation | Medium |
| ⬜ Visual regression | Screenshot comparison in validation | Low |
| ⬜ Effect tracing in browser | Capture OTel spans from browser tests | Low |

**Validation**: Browser automation commands available via CLI and MCP

---

## Phase 6: Scalability & Competitive Parity

**Status**: ⬜ Not started

Gaps identified from expanded competitive analysis (2026-01-18):

| Gap | Description | Priority | Competitive Context |
|-----|-------------|----------|---------------------|
| ⬜ Scale benchmarking | Test with 100k+ nodes, measure memory/latency | High | Augment handles 400k+ files |
| ⬜ Memory profiling | Profile DuckDB/Parquet memory under load | Medium | Constrained environments |
| ⬜ Language coverage research | Roadmap for Go, Rust, Java, etc. | Medium | Aider supports 40+ languages |
| ⬜ Embeddings exploration | Research vector search for semantic queries | Low | Cursor/Augment use RAG |
| ⬜ IDE extension exploration | VSCode/Cursor extension feasibility | Low | Cursor/Windsurf have native IDE |

**Research needed:**
- How does DuckDB perform with 1M+ rows in nodes table?
- What's the memory footprint for 100k file analysis?
- Should DevAC use embeddings alongside SQL, or stay SQL-pure?
- Could MCP serve as indirect IDE integration?

**Validation**: Benchmark data vs Augment, Stack Graphs claims

---

## Research Gaps

Items requiring investigation before implementation:

| Topic | Questions | Status |
|-------|-----------|--------|
| State machine inference | Academic papers, existing tools | ✅ Researched (5C) |
| Implicit state handling | useState without clear machine structure | ✅ Heuristics identified |
| Cross-component actors | Actors spanning multiple components | ⬜ |
| Sequence matching | Rules Engine capability for patterns | ✅ CEP extension proposed |
| Scale benchmarking | Performance at 100k+ nodes vs competitors | ⬜ |
| Embeddings/RAG | Vector search vs SQL-only tradeoffs | ⬜ |
| Hook event patterns | Best practices for UserPromptSubmit/Stop hooks | ✅ Implemented (Phase 3) |
| Session state management | How to track edited files across messages | ⬜ Future enhancement |
| OTel effect correlation | Span attributes for code correlation | ✅ Researched (4C) |
| Black-box + tracing | Effect validation without code changes | ✅ "Effect Probing" concept

---

## Documentation Gaps

| Gap | Description | Status |
|-----|-------------|--------|
| ✅ jsx-extraction.test.ts | Comprehensive tests demonstrating JSX parsing | Created |
| ✅ phase-0-plan.md | Phase 0 implementation plan | Created |
| ⬜ handleJSXElement refactoring | Split into smaller helper methods | Low priority |
| ⬜ actor-discovery.md | Implementation guide for Actor discovery | Not created |
| ⬜ Storybook integration guide | How to set up OTel with Storybook | Not created |

---

## Success Metrics

When all gaps are closed:

| Metric | Target | Status |
|--------|--------|--------|
| JSX components queryable | 100% extracted | ✅ Complete |
| A11y attributes queryable | All ARIA + interactive elements | ✅ Complete |
| WCAG violations in diagnostics | Alongside type/lint errors | ✅ Complete |
| Hook automation active | Plugin has working hooks | ✅ Complete (Phase 3) |
| Auto-injection working | Diagnostic status injected on issues | ✅ Complete (Phase 3) |
| Browser automation | E2E validation capability | ✅ Complete (v0.2.0) |
| Effect Probing concept | Research and design | ✅ Research complete (Phase 4C) |
| Effect-test correlation | 100% of tested effects matched | ⬜ Phase 4B |
| Actor discovery | Explicit + inferred machines queryable | ⬜ Phase 5 |

**Implementation Metrics** (Updated 2026-01-18):

| Metric | Previous | Current | Target |
|--------|----------|---------|--------|
| Test files | - | **74** | Maintain |
| Test lines | - | **18,842** | Maintain |
| CLI commands | 40+ | **47** | 50 |
| MCP tools | 21 | **22** | 25 |
| ADRs | 34 | **43** | As needed |
| Phases complete | 2 | **4** (0-3 + browser) | 6 |

**Competitive Benchmarks** (Updated 2026-01-18):

| Metric | DevAC Current | Competitor Reference | Target |
|--------|---------------|---------------------|--------|
| File scale | Untested | Augment: 400k+ files | Test at 100k files |
| Node scale | Untested | Stack Graphs: petabyte | Test at 1M nodes |
| Language count | 3 (TS, Python, C#) | Aider: 40+ | 5 (add Go, Rust) |
| Query latency p95 | ~200ms | Unknown | <100ms |
| Memory per 10k nodes | Unknown | Unknown | <100MB |

---

## Notes

- This document should be updated as implementation progresses
- New gaps discovered during implementation should be added here
- Consider splitting into separate tracking issues as phases begin
- **2026-01-18**: Added Phase 3 (Hook-Based Validation Triggering) from vision document analysis
- **2026-01-18**: Added Phase 6 (Scalability & Competitive Parity) based on expanded competitive analysis
- **2026-01-18**: Added competitive benchmarks to Success Metrics
- **2026-01-18**: Phase 3 marked COMPLETE (hooks.json, `--inject`, `--on-stop` implemented)
- **2026-01-18**: Added Phase 4C (Effect Probing) — novel concept from black-box + OTel research
- **2026-01-18**: Added Phase 5C research findings (state machine inference, sequence matching, OTel correlation)
- **2026-01-18**: Added Browser Automation Integration section (v0.2.0 released)
- **2026-01-18**: Updated Research Gaps with completed research topics

---

*Last reviewed: 2026-01-18*
*Phase 0 completed: 2026-01-17*
*Phase 1 completed: 2026-01-17*
*Phase 2 completed: 2026-01-18*
*Phase 3 completed: 2026-01-18* (Hook-based validation triggering — hooks.json, --inject, --on-stop)
*Phase 4C added: 2026-01-18* (Effect Probing concept from research)
*Phase 6 added: 2026-01-18* (Scalability gaps from competitive analysis)
*Browser automation: 2026-01-18* (v0.2.0 released)
