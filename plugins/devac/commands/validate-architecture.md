# /devac:validate-architecture - Validate Architecture Documentation

Create or update human-validated architecture documentation for a package.

## Usage

```bash
/validate-architecture <package-path>
```

## Examples

```bash
# Validate devac-core architecture
/validate-architecture packages/devac-core

# Validate current package
/validate-architecture .
```

## What It Does

1. **Analyzes package** using devac MCP tools:
   - `query_sql` for structural queries
   - `find_symbol` for key components
   - `get_call_graph` for relationships
   - `query_effects` for external integrations

2. **Generates documentation files**:
   - `docs/c4/architecture-validated.md` - Full docs with ASCII diagrams
   - `docs/c4/architecture-validated.c4` - LikeC4 DSL for comparison
   - `docs/c4/architecture.reasoning.md` - Audit trail

3. **Supports refinement** - request changes like:
   - "Move X to Y container"
   - "Add relationship between A and B"
   - "Group these as the Storage Layer"

4. **Marks as verified** when approved

## Output Files

### architecture-validated.md
Human-readable documentation with:
- Package overview
- C4 Context diagram (ASCII)
- C4 Container diagram (ASCII)
- Key components per layer
- Sequence diagrams for important flows
- External system integrations

### architecture-validated.c4
LikeC4 DSL format enabling:
- VS Code viewer preview
- Structural comparison with generated `.c4`
- Gap metric calculation

### architecture.reasoning.md
Documents the analysis process:
- Queries used
- Inferences made
- Gaps in extracted data
- Assumptions requiring validation

## Integration with Improvement Loop

After validation, run gap analysis:

```bash
# Check gap between validated and generated
devac architecture score -p packages/devac-core

# See structural differences
devac architecture diff -p packages/devac-core
```

## When to Use

- **New package**: Create initial architecture documentation
- **Significant refactoring**: Update after major code changes
- **CI drift warning**: When `devac validate --architecture` warns
- **Review preparation**: Before architecture discussions

## Related Commands

- `devac architecture status` - Check if docs need updating
- `devac architecture score` - Calculate gap metrics
- `devac architecture diff` - Show structural differences
- `devac c4` - Generate C4 diagrams from effects
