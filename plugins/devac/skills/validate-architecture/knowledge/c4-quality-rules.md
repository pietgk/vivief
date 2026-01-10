# C4 Quality Rules

Rules for evaluating and improving C4 architecture documentation quality.

## Gap Metrics (M1-M4)

The Architecture Documentation Improvement Loop uses these metrics to measure quality:

### M1: Container F1 Score (Weight: 25%)

**Target:** >70%

Measures how well generated containers match validated containers.

```
Container F1 = 2 * (Precision * Recall) / (Precision + Recall)

Where:
- Precision = Matched Containers / Generated Containers
- Recall = Matched Containers / Validated Containers
```

**Improvement strategies:**
- Add grouping rules to combine granular directories into logical layers
- Use naming patterns to identify architectural boundaries
- Map file path patterns to containers (e.g., `src/parsers/**` -> "Analysis Layer")

### M2: Signal-to-Noise Ratio (Weight: 45%)

**Target:** >50%

Measures how well the generator filters to architecturally-significant components vs implementation details.

```
Ideal: Generated Component Count ≈ Validated Component Count (within 50%)
Score decreases as ratio deviates from 1.0
```

**Improvement strategies:**
- Add significance rules to classify component importance
- Filter "hidden" level components from architecture views
- Mark exported public APIs as "critical"
- Mark internal helpers as "minor"
- Mark logging/debug as "hidden"

### M3: Relationship F1 Score (Weight: 15%)

**Target:** >60%

Measures how well generated relationships match validated relationships.

```
Relationship F1 = 2 * (Precision * Recall) / (Precision + Recall)

Normalized by source/target entity names (last segment)
```

**Improvement strategies:**
- Ensure data flow edges are generated from effect patterns
- Add relationship significance filtering
- Use typed relationships (reads, writes, calls, queries)

### M4: External F1 Score (Weight: 15%)

**Target:** >70%

Measures recognition of external systems (databases, APIs, file systems).

```
External F1 = 2 * (Precision * Recall) / (Precision + Recall)
```

**Improvement strategies:**
- Define domain rules for external system detection
- Categorize externals by type (database, api, storage, messaging)
- Use provider patterns (stripe, aws, postgres, etc.)

## Composite Score

```
Composite = 0.25 * M1 + 0.45 * M2 + 0.15 * M3 + 0.15 * M4
Target: >65%
```

## Grouping Rules

Grouping rules assign components to logical containers/layers:

| Layer | Match Patterns | Example Files |
|-------|---------------|---------------|
| Analysis | parser, analyzer, semantic, resolver | `src/parsers/*.ts`, `src/semantic/*.ts` |
| Storage | duckdb, parquet, seed, storage | `src/storage/*.ts` |
| Federation | hub, registry, federation, workspace | `src/hub/*.ts`, `src/workspace/*.ts` |
| API | mcp, cli, command, tool | `src/commands/*.ts` |
| Rules | rule, engine, builtin | `src/rules/*.ts` |
| Views | c4, diagram, plantuml, likec4 | `src/views/*.ts` |

### Built-in Grouping Rules

The following rules are available via `builtinGroupingRules`:

```typescript
// Analysis Layer
{ id: "analysis-parser", match: /parser/i, container: "Analysis Layer" }
{ id: "analysis-analyzer", match: /analyzer/i, container: "Analysis Layer" }
{ id: "analysis-semantic", match: /semantic/i, container: "Analysis Layer" }

// Storage Layer
{ id: "storage-duckdb", match: /duckdb/i, container: "Storage Layer" }
{ id: "storage-parquet", match: /parquet/i, container: "Storage Layer" }
{ id: "storage-seed", match: /seed/i, container: "Storage Layer" }

// Federation Layer
{ id: "federation-hub", match: /hub/i, container: "Federation Layer" }
{ id: "federation-registry", match: /registry/i, container: "Federation Layer" }

// API Layer
{ id: "api-mcp", match: /mcp/i, container: "API Layer" }
{ id: "api-cli", match: /cli|command/i, container: "API Layer" }

// Rules Layer
{ id: "rules-engine", match: /rule.*engine/i, container: "Rules Layer" }
{ id: "rules-builtin", match: /builtin.*rule/i, container: "Rules Layer" }

// Views Layer
{ id: "views-c4", match: /c4|diagram/i, container: "Views Layer" }
{ id: "views-likec4", match: /likec4/i, container: "Views Layer" }
```

## Significance Rules

Significance rules classify component architectural importance:

| Level | Criteria | Examples |
|-------|----------|----------|
| Critical | Exported public API, >5 dependents | `createRuleEngine`, `analyzePackage` |
| Important | Domain entry points, significant effects | `parseTypeScript`, `writeParquet` |
| Minor | Internal helpers, utility functions | `normalizePathComponent`, `formatOutput` |
| Hidden | Logging, debug, test utilities | `console.log`, `logger.debug`, `testHelper` |

### Built-in Significance Rules

```typescript
// Critical
{ id: "critical-exported", match: { isExported: true }, level: "critical" }
{ id: "critical-high-usage", match: { dependentCount: { min: 5 } }, level: "critical" }
{ id: "critical-domain-entry", match: { domain: ["Database", "Auth", "Payment"] }, level: "critical" }

// Important
{ id: "important-effects", match: { hasEffects: true }, level: "important" }
{ id: "important-public", match: { isPublic: true }, level: "important" }

// Minor
{ id: "minor-helper", match: /helper|util/i, level: "minor" }
{ id: "minor-internal", match: { isInternal: true }, level: "minor" }

// Hidden
{ id: "hidden-logging", match: /log|debug|trace/i, level: "hidden" }
{ id: "hidden-test", match: /test|mock|stub|fixture/i, level: "hidden" }
{ id: "hidden-internal-detail", match: /_internal|_private/i, level: "hidden" }
```

## Using Rules in Gap Analysis

Run the architecture score command with rules:

```bash
# Standard score
devac architecture score -p packages/devac-core

# With rule analysis
devac architecture score -p packages/devac-core --with-rules

# Verbose output showing matched rules
devac architecture score -p packages/devac-core --with-rules -v
```

Output includes:
- Gap metrics with target comparisons
- Rule analysis showing container coverage
- Significance distribution (critical/important/minor/hidden)
- Improvement suggestions

## Improvement Workflow

1. **Baseline**: Run `devac architecture score -p <package>` to get current metrics
2. **Identify gaps**: Check which metrics are below target
3. **Add rules**: Create custom grouping/significance rules for your codebase
4. **Regenerate**: Run `devac c4 -p <package>` with new rules
5. **Measure**: Run score again to verify improvement
6. **Iterate**: Repeat until composite score >65%

## CLI Commands

```bash
# Check architecture status
devac architecture status -p packages/devac-core

# Calculate gap score with targets
devac architecture score -p packages/devac-core

# Calculate gap score with rule analysis
devac architecture score -p packages/devac-core --with-rules

# Show structural differences
devac architecture diff -p packages/devac-core

# Generate C4 with rule-based grouping
devac c4 -p packages/devac-core --grouping rules
```

## Example Improvement Session

```
# Initial state
$ devac architecture score -p packages/devac-core
COMPOSITE SCORE: [████████░░░░░░░░░░░░] 28%
  Container F1: 30% (target: 70%, gap: 40%)
  Signal/Noise: 20% (target: 50%, gap: 30%)
  Relationship F1: 25% (target: 60%, gap: 35%)
  External F1: 35% (target: 70%, gap: 35%)

# After adding grouping and significance rules
$ devac architecture score -p packages/devac-core --with-rules
COMPOSITE SCORE: [█████████████░░░░░░░] 68%
  Container F1: 75% (target: 70% ✓)
  Signal/Noise: 55% (target: 50% ✓)
  Relationship F1: 65% (target: 60% ✓)
  External F1: 72% (target: 70% ✓)
```

## References

- [Gap Metrics Plan](../../../../../docs/plans/gap-metrics.md)
- [Grouping Rules](../../../../../packages/devac-core/src/rules/grouping-rules.ts)
- [Significance Rules](../../../../../packages/devac-core/src/rules/significance-rules.ts)
- [C4 Generator](../../../../../packages/devac-core/src/views/c4-generator.ts)
