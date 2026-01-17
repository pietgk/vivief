# Implementation Gaps

> Consolidated tracking of what's not yet implemented in the Actor + UI Effects vision.

**Related Documents**:
- [actors.md](../vision/actors.md) — Actor Model vision
- [ui-effects.md](../vision/ui-effects.md) — UI Effects vision
- [test-strategy.md](./test-strategy.md) — Test approach

**Last Updated**: 2026-01-17

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

## Phase 1: A11y Attribute Extraction

**Status**: 🔄 Partially complete (merged with Phase 0)

Most A11y attribute extraction was implemented as part of Phase 0.

| Gap | Description | Priority |
|-----|-------------|----------|
| ✅ ARIA attribute extraction | Extract `role`, `aria-*` as node properties | High |
| ✅ Interactive element detection | HTML elements identified as `html_element` kind | High |
| ⬜ ARIA relationship edges | Create REFERENCES edges for `aria-controls`, `aria-labelledby` | High |
| ✅ Event handler detection | Track `onClick`, `onKeyDown`, etc. with a11y warnings | Medium |
| ⬜ tabIndex handling | Extract and validate keyboard accessibility | Medium |

**Files modified** (in Phase 0):
- `packages/devac-core/src/parsers/typescript-parser.ts` - ARIA attributes stored in node properties

**Validation**: ✅ Can query "find elements with aria-controls" via node properties

---

## Phase 2: WCAG Validation

**Status**: ⬜ Not started

| Gap | Description | Priority |
|-----|-------------|----------|
| ⬜ WCAG rule definitions | Define rules in Rules Engine format | High |
| ⬜ Missing accessible name detection | WCAG 4.1.2 validation | High |
| ⬜ Keyboard accessibility check | Validate interactive elements are keyboard accessible | High |
| ⬜ Broken ARIA reference detection | Find `aria-controls` pointing to non-existent IDs | Medium |
| ⬜ Diagnostics output | Output as diagnostics alongside type/lint errors | Medium |

**Files to create**:
- `packages/devac-core/src/rules/wcag-rules.ts`
- `packages/devac-core/src/analysis/wcag-analyzer.ts`

**Validation**: `devac status` shows a11y violations

---

## Phase 3A: OTel Integration

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

## Phase 3B: Effect Correlation

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

## Phase 4: Actor Discovery

**Status**: ⬜ Not started

### 4A: Explicit XState Extraction

| Gap | Description | Priority |
|-----|-------------|----------|
| ⬜ XState v5 pattern detection | Recognize `setup().createMachine()` | High |
| ⬜ XState v4 pattern detection | Recognize `createMachine()` | High |
| ⬜ Machine state extraction | Extract states, events, transitions | High |
| ⬜ Actor effect creation | Create Actor effects from parsed machines | High |

### 4B: Effect Path Analysis (Inference)

| Gap | Description | Priority |
|-----|-------------|----------|
| ⬜ TransitionPattern rules | Rules matching effect sequences | High |
| ⬜ State variable detection | Identify `useState`, `useReducer` patterns | High |
| ⬜ Event handler → event mapping | Map `onClick` to triggering events | Medium |
| ⬜ Condition → guard mapping | Map conditionals to transition guards | Medium |
| ⬜ ActorPattern rules | Group transitions into Actors | Medium |

### 4C: Research Needed

| Question | Status |
|----------|--------|
| How do other tools infer state machines? | ⬜ Not researched |
| What patterns reliably indicate state vs conditional? | ⬜ Not researched |
| Can Rules Engine handle sequence matching? | ⬜ Not evaluated |

**Validation**: Can query "what states does Dialog component have?"

---

## Research Gaps

Items requiring investigation before implementation:

| Topic | Questions | Status |
|-------|-----------|--------|
| State machine inference | Academic papers, existing tools | ⬜ |
| Implicit state handling | useState without clear machine structure | ⬜ |
| Cross-component actors | Actors spanning multiple components | ⬜ |
| Sequence matching | Rules Engine capability for patterns | ⬜ |

---

## Documentation Gaps

| Gap | Description | Status |
|-----|-------------|--------|
| ✅ jsx-extraction.test.ts | Comprehensive tests demonstrating JSX parsing | Created |
| ✅ phase-0-plan.md | Phase 0 implementation plan | Created |
| ⬜ actor-discovery.md | Implementation guide for Actor discovery | Not created |
| ⬜ Storybook integration guide | How to set up OTel with Storybook | Not created |

---

## Success Metrics

When all gaps are closed:

| Metric | Target |
|--------|--------|
| JSX components queryable | 100% extracted |
| A11y attributes queryable | All ARIA + interactive elements |
| WCAG violations in diagnostics | Alongside type/lint errors |
| Effect-test correlation | 100% of tested effects matched |
| Actor discovery | Explicit + inferred machines queryable |

---

## Notes

- This document should be updated as implementation progresses
- New gaps discovered during implementation should be added here
- Consider splitting into separate tracking issues as phases begin

---

*Last reviewed: 2026-01-17*
*Phase 0 completed: 2026-01-17*
