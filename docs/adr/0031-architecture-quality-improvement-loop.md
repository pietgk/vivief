# ADR-0031: Architecture Documentation Quality Improvement Loop

## Status

Accepted

## Context

DevAC generates C4 architecture diagrams from code effects (ADR-0027, ADR-0028). However, there's an inherent gap between:

1. **Generated output** (`architecture.c4`): Deterministic extraction from code structure
2. **Human expectations** (`architecture.md`): Semantic understanding of architectural intent

The generated diagrams often miss:
- Logical groupings (layers, domains)
- Significance filtering (showing every function vs key components)
- Semantic relationships (data flow vs structural containment)
- Appropriate abstraction levels (L4 code detail vs L2/L3 overview)

Simply improving the generator isn't enough because architecture is inherently interpretive. Different architects organize the same code differently based on mental models, team conventions, and documentation purposes.

## Decision

We implement an **Architecture Documentation Quality Improvement Loop** that:

1. **Measures gaps** between generated and validated architecture using defined metrics
2. **Iteratively improves rules** based on identified gaps
3. **Coordinates multi-level documentation** (package → repo → workspace)
4. **Preserves human oversight** while automating where possible

### Gap Metrics Framework

Five measurable dimensions compare generated vs validated architecture:

| Metric | Question | Current | Target |
|--------|----------|---------|--------|
| **Container F1** | Do containers match intended groupings? | ~0.3 | >0.7 |
| **Signal-to-Noise** | Are significant components surfaced? | ~0.2 | >0.5 |
| **Key Coverage** | Are named components from .md in .c4? | ~0.4 | >0.8 |
| **Relationship F1** | Are meaningful relationships captured? | ~0.2 | >0.6 |
| **External F1** | Are externals correctly categorized? | ~0.3 | >0.7 |

**Composite Score**: Weighted combination for tracking overall improvement.

### Rule Improvement Workflow

When gaps are identified:

```
1. Gap Identification
   - Run devac c4 --package <path>
   - Compare against architecture.md
   - Identify specific gaps using metrics

2. Rule Design
   - Determine rule category (grouping, significance, external, relationship)
   - Define match criteria and emit behavior
   - Consider rule precedence

3. Implementation
   - Add rule to appropriate file (builtin, repo, or package level)
   - Add test case with expected input/output
   - Verify metric improvement

4. Validation
   - Human review of generated output
   - Compare against validated .md
   - Update baseline scores
```

### Rule Categories

1. **Container Grouping Rules**: Group components into logical layers/domains
2. **Significance Rules**: Filter architecturally-important vs implementation detail
3. **External Categorization Rules**: Group dependencies by purpose
4. **Relationship Rules**: Infer semantic relationships from code patterns

### Multi-Level Coordination

Architecture exists at three levels with propagation rules:

```
Workspace Level (landscape)
    │ aggregates repos as "systems"
    ▼
Repo Level (overview)
    │ aggregates packages as "containers"
    ▼
Package Level (detailed)
    Components, modules, external deps
```

**Bottom-up**: Package changes trigger repo/workspace re-aggregation
**Top-down**: Higher levels can define constraints for lower levels

### LLM-Assisted Generation

For human-validated architecture:

1. **Generate**: LLM analyzes code graph and proposes architecture.md
2. **Review**: Human validates, corrects, and approves
3. **Measure**: Gap metrics computed against generated .c4
4. **Iterate**: Rules improved based on measured gaps

### Implementation Components

```
packages/devac-core/src/views/gap-metrics.ts       # Metric calculation
packages/devac-core/src/views/likec4-json-parser.ts # Parse LikeC4 for comparison
packages/devac-cli/src/commands/architecture.ts    # CLI commands

docs/plans/gap-metrics.md                          # Metric definitions
docs/plans/rule-improvement-workflow.md            # Rule development process
docs/plans/multi-level-coordination.md             # Level coordination

plugins/devac/skills/validate-architecture/        # Human validation skill
```

### CLI Commands

```bash
# Generate architecture documentation
devac c4 --package <path>

# Score architecture quality (future)
devac architecture score

# Check architecture staleness
devac architecture status

# Validate architecture constraints
devac validate --architecture
```

## Consequences

### Positive

- **Measurable Progress**: Gap metrics track improvement over time
- **Iterative Improvement**: Each rule change measurably closes gaps
- **Human Oversight**: Validated architecture remains human-approved
- **Multi-Level Consistency**: Package/repo/workspace stay synchronized
- **LLM Assistance**: AI helps but doesn't replace human judgment
- **Reusable Rules**: Patterns learned in one package apply to others

### Negative

- **Initial Investment**: Defining metrics and building scoring infrastructure
- **Ongoing Maintenance**: Rules need updating as codebases evolve
- **Subjectivity**: Some "gaps" are intentional architectural choices
- **Complexity**: Multiple levels and rule precedence add cognitive load

### Neutral

- **Not Fully Automated**: Human validation still required for architecture.md
- **Package-First**: Most value comes from package-level documentation
- **Rule Explosion**: May accumulate many rules over time (needs pruning)

## References

- [ADR-0027: LikeC4 as Primary C4 Documentation Format](./0027-likec4-primary-format.md)
- [ADR-0028: C4 Architecture Enrichment and Relationship Aggregation](./0028-c4-enrichment-and-aggregation.md)
- [ADR-0029: LikeC4 Directory Restructure](./0029-likec4-directory-restructure.md)
- [Gap Metrics Plan](../plans/gap-metrics.md)
- [Rule Improvement Workflow](../plans/rule-improvement-workflow.md)
- [Multi-Level Coordination](../plans/multi-level-coordination.md)
