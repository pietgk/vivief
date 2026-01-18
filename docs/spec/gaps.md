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

## Phase 3: Hook-Based Validation Triggering (NEW)

**Status**: ⬜ Not started

Hook-based automation to make validation proactive rather than manual. This phase makes DevAC a first-class Claude Code citizen with automatic context injection.

**Vision Document:** @docs/vision/combine-reliable-context-injection-with-intelligent-instruction-following.md
**ADR:** @docs/adr/0043-hook-based-validation-triggering.md

| Gap | Description | Priority | Notes |
|-----|-------------|----------|-------|
| ⬜ hooks.json creation | Create `plugins/devac/hooks/hooks.json` with UserPromptSubmit and Stop hooks | High | Core infrastructure |
| ⬜ `devac status --inject` | CLI command outputting hook-compatible JSON with diagnostic counts | High | UserPromptSubmit integration |
| ⬜ `devac validate --on-stop` | CLI command running validation and outputting resolution instructions | High | Stop hook integration |
| ⬜ Progressive disclosure | Add `level` parameter to `get_all_diagnostics` MCP tool | Medium | Reduce context noise |
| ⬜ Session context | Track edited files per session for targeted validation | Medium | Performance optimization |
| ⬜ diagnostics-triage skill update | Document auto-injection behavior | Low | User awareness |

**Files to create/modify:**
- `plugins/devac/hooks/hooks.json` - Hook definitions (CREATE)
- `packages/devac-cli/src/commands/status.ts` - Add `--inject` flag (MODIFY)
- `packages/devac-cli/src/commands/validate.ts` - Add `--on-stop` flag (MODIFY)
- `packages/devac-mcp/src/tools/diagnostics.ts` - Add `level` parameter (MODIFY)
- `plugins/devac/skills/diagnostics-triage/SKILL.md` - Document auto-injection (MODIFY)

**Validation:**
- UserPromptSubmit: Introduce error, start session, verify status reminder appears
- Stop: Edit file with error, complete response, verify resolution instructions
- Progressive: Test all three levels (counts, summary, details)

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

| Question | Status |
|----------|--------|
| How do other tools infer state machines? | ⬜ Not researched |
| What patterns reliably indicate state vs conditional? | ⬜ Not researched |
| Can Rules Engine handle sequence matching? | ⬜ Not evaluated |

**Validation**: Can query "what states does Dialog component have?"

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
| State machine inference | Academic papers, existing tools | ⬜ |
| Implicit state handling | useState without clear machine structure | ⬜ |
| Cross-component actors | Actors spanning multiple components | ⬜ |
| Sequence matching | Rules Engine capability for patterns | ⬜ |
| Scale benchmarking | Performance at 100k+ nodes vs competitors | ⬜ |
| Embeddings/RAG | Vector search vs SQL-only tradeoffs | ⬜ |
| Hook event patterns | Best practices for UserPromptSubmit/Stop hooks | ⬜ (NEW) |
| Session state management | How to track edited files across messages | ⬜ (NEW) |

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
| Hook automation active | Plugin has working hooks | ⬜ Phase 3 |
| Auto-injection working | Diagnostic status injected on issues | ⬜ Phase 3 |
| Effect-test correlation | 100% of tested effects matched | ⬜ Phase 4B |
| Actor discovery | Explicit + inferred machines queryable | ⬜ Phase 5 |

**Competitive Benchmarks** (NEW - from 2026-01-18 review):

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

---

*Last reviewed: 2026-01-18*
*Phase 0 completed: 2026-01-17*
*Phase 1 completed: 2026-01-17*
*Phase 2 completed: 2026-01-18*
*Phase 3 added: 2026-01-18* (Hook-based validation triggering from vision document)
*Phase 6 added: 2026-01-18* (Scalability gaps from competitive analysis)
