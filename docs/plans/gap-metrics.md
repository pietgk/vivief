# Gap Metrics: architecture.md vs architecture.c4

> **Purpose:** Define measurable criteria for comparing human-validated architecture documentation against deterministic C4 generation.
> **Created:** 2026-01-07
> **Related:** docs/plans/improve-pipeline.md

## Overview

The improvement loop requires measurable metrics to track progress. This document defines how we measure the gap between:
- `architecture.md` - Human-validated goal (semantic, explanatory)
- `architecture.c4` - Deterministic output (structural, extracted)

## Metric Categories

### 1. Container Mapping Accuracy

**Question:** Do generated containers map to intended architectural groupings?

| Metric | Description | Measurement |
|--------|-------------|-------------|
| Container precision | Generated containers that match intended groupings | #matched / #generated |
| Container recall | Intended groupings covered by generated containers | #matched / #intended |
| Container F1 | Harmonic mean of precision and recall | 2 * (P * R) / (P + R) |

**Current State (devac-core):**
- Generated: Validation, Analyzer, Docs, Context, Storage, Parsers, Rules, Hub, Semantic, Views, Workspace, Types, Utils, Effects, Watcher, Config
- Intended: Analysis Layer, Storage Layer, Federation Layer (with sub-containers)
- **Gap:** Generated is too granular, doesn't capture layered architecture

**Improvement target:** Rules should recognize layer patterns and group accordingly.

### 2. Component Significance Filtering

**Question:** Does the generator surface architecturally-significant components vs noise?

| Metric | Description | Measurement |
|--------|-------------|-------------|
| Signal-to-noise ratio | Important components vs total generated | #significant / #total |
| Key component coverage | Core components mentioned in .md that appear in .c4 | #found / #expected |

**Current State:**
- Generated lists every function/method (~100s of components)
- Human doc mentions ~20 key components by name
- **Gap:** No filtering of internal/helper functions

**Improvement target:** Rules should identify "architecturally significant" vs "implementation detail".

### 3. Abstraction Level Appropriateness

**Question:** Is the generated diagram at the right level of abstraction?

| Level | C4 Term | What it shows | When appropriate |
|-------|---------|---------------|------------------|
| L1 | Context | System + external actors | Understanding scope |
| L2 | Container | Major deployable units | Technical overview |
| L3 | Component | Internal modules | Developer deep-dive |
| L4 | Code | Functions/classes | Implementation detail |

**Current State:**
- Generated is at L4 (individual functions)
- Human doc shows L2/L3 hybrid with logical groupings
- **Gap:** Generated is too low-level by default

**Improvement target:** Allow configurable abstraction level, default to L3.

### 4. Relationship Capture

**Question:** Are meaningful relationships between components captured?

| Metric | Description | Measurement |
|--------|-------------|-------------|
| Relationship completeness | Important relationships in .c4 | #captured / #intended |
| Relationship accuracy | Captured relationships that are correct | #correct / #captured |

**Current State:**
- Generated captures CONTAINS edges
- Missing: data flow, dependencies, layer boundaries
- **Gap:** Relationships are structural, not semantic

**Improvement target:** Effect-domain-rules should infer higher-level relationships.

### 5. External System Recognition

**Question:** Are external dependencies correctly identified and categorized?

| Metric | Description | Measurement |
|--------|-------------|-------------|
| External system detection | npm packages identified as external | #identified / #actual |
| External categorization | Externals grouped by purpose | #categorized / #identified |

**Current State:**
- External refs captured but not meaningfully categorized
- Human doc groups: Source Code, File System, Central Hub
- **Gap:** No semantic grouping of externals

**Improvement target:** Rules should categorize externals (storage, network, UI, etc.).

## Composite Score

Weighted combination of metrics for tracking overall improvement:

```
Gap Score = w1*ContainerF1 + w2*SignalNoise + w3*KeyCoverage + w4*RelationshipF1 + w5*ExternalF1

Where:
- w1 = 0.25 (Container mapping)
- w2 = 0.20 (Signal filtering)
- w3 = 0.25 (Key component coverage)
- w4 = 0.15 (Relationships)
- w5 = 0.15 (External systems)
```

## Measurement Process

### Automated Metrics

Can be computed programmatically:
1. Parse .c4 file to extract containers/components
2. Parse .md to extract expected structure (from headers, diagrams)
3. Compute precision/recall against expected mappings
4. Count components and apply significance heuristics

### Manual Review Metrics

Require human judgment:
1. "Does this diagram help understand the architecture?" (1-5 scale)
2. "Are the groupings intuitive?" (1-5 scale)
3. "Would you share this with a new team member?" (yes/no)

## Baseline Measurement (devac-core)

| Metric | Current Value | Target |
|--------|--------------|--------|
| Container F1 | ~0.3 (too granular) | >0.7 |
| Signal-to-noise | ~0.2 (all functions shown) | >0.5 |
| Key coverage | ~0.4 (missing layered view) | >0.8 |
| Relationship F1 | ~0.2 (only CONTAINS) | >0.6 |
| External F1 | ~0.3 (uncategorized) | >0.7 |
| **Composite** | **~0.28** | **>0.65** |

## Next Steps

1. **Implement automated scoring** - Add `devac score-architecture` command
2. **Create test cases** - Reference packages with known-good architecture.md
3. **Iterate on rules** - Improve effect-domain-rules to increase scores
4. **Track over time** - Record scores per commit/release

---

*This document defines the metrics. See `improve-pipeline.md` for the workflow to improve scores.*
