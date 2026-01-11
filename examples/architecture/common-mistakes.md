# Common Mistakes in C4 Architecture Documentation

This document captures common mistakes made during C4 architecture generation and how to avoid them.

## Purpose

Learn from mistakes to:
1. Avoid repeating errors
2. Understand which gap metric each mistake affects
3. Apply the right fix

---

## Mistake: Directory-Based Containers

**What happened**: Created one container per directory (src/parsers, src/storage, src/hub...).

**Why it's wrong**: Produces 15+ containers instead of 6 logical layers. Diagrams become unreadable.

**Gap metric affected**: **G1 (Container F1)** - too granular, no layer recognition.

**Fix**: Use the 6 built-in layers from grouping-rules.ts:
- Analysis Layer (parsers, analyzers, semantic)
- Storage Layer (duckdb, parquet, seeds)
- Federation Layer (hub, registry, workspace)
- API Layer (mcp, cli, commands)
- Rules Layer (rule engine, builtin rules)
- Views Layer (c4, diagrams, plantuml)

**Rule applied**: Use grouping rules to combine granular directories.

---

## Mistake: Showing All Functions

**What happened**: Listed every exported function as a component.

**Why it's wrong**: 200+ components in a diagram is noise, not signal. Key architectural elements are buried.

**Gap metric affected**: **G2 (Signal-to-Noise)** - no filtering of implementation details.

**Fix**: Apply significance rules:
- **Critical**: Show always (exported API, payment, auth, >5 dependents)
- **Important**: Show in container diagrams (database, messaging, storage)
- **Minor**: Detail views only (utilities, helpers)
- **Hidden**: Never show (logging, test, debug)

**Rule applied**: Filter components by significance level.

---

## Mistake: Relationships Only in ASCII

**What happened**: Drew arrows in ASCII diagrams but didn't add them to tables or code blocks.

**Why it's wrong**:
1. model.c4 has no relationships (breaks gap comparison)
2. Relationships lost when ASCII changes
3. No machine-readable representation

**Gap metric affected**: **G3 (Relationship F1)** - relationships not captured in structured format.

**Fix**: Relationship parity by construction:
```markdown
## Container Diagram

```
┌─────────┐     ┌─────────┐
│ Analyzer│────►│ Parsers │
└─────────┘     └─────────┘
```

### Container Relationships

| From | To | Label |
|------|-----|-------|
| Analyzer | Parsers | Calls for parsing |

```likec4
devac_core.analyzer -> devac_core.parsers "Calls for parsing"
```
```

**Rule applied**: Add relationships to THREE places simultaneously.

---

## Mistake: Untyped External Systems

**What happened**: Listed external systems without type classification.

```likec4
// Wrong
ext_stripe = external_system 'Stripe'
ext_aws = external_system 'AWS'
```

**Why it's wrong**: Generic gray boxes in diagrams. Can't differentiate database from API from storage.

**Gap metric affected**: **G4 (External F1)** - externals not categorized.

**Fix**: Add type tags to all external systems:

```likec4
// Right
ext_stripe = external_system 'Stripe' {
  description 'Payment processing'
  #api #payment
}

ext_s3 = external_system 'AWS S3' {
  description 'Object storage'
  #storage
}

ext_rds = external_system 'AWS RDS' {
  description 'MySQL database'
  #database
}
```

**Rule applied**: Categorize externals by type (database, api, storage, messaging).

---

## Mistake: Reserved Keywords as Element Names

**What happened**: Named a container "views" or "model".

```likec4
// Wrong - breaks LikeC4 parser
views = container 'Views Layer' { ... }
model = container 'Data Model' { ... }
```

**Why it's wrong**: LikeC4 reserves these keywords. Parser fails with cryptic errors.

**Gap metric affected**: None directly, but blocks entire workflow.

**Fix**: Use alternative names:
- `views` → `view_layer` or `diagram_views`
- `model` → `data_model` or `model_layer`
- `specification` → `spec_layer`

Always run `npx likec4 validate .` before committing.

---

## Mistake: Missing Reasoning File

**What happened**: Generated architecture docs without documenting queries and assumptions.

**Why it's wrong**:
1. Can't reproduce the analysis
2. Can't understand why certain groupings were made
3. Breaks the improvement loop

**Gap metric affected**: All metrics (can't improve what you can't understand).

**Fix**: Always create `architecture.reasoning.md`:

```markdown
# Architecture Reasoning: @package/name

## Queries Used
- `SELECT kind, COUNT(*) FROM nodes GROUP BY kind` - Understand entity distribution
- `devac effects list -p pkg --type Store` - Find storage patterns

## Inferences Made
- ⚠️ Grouped parser modules into "Analysis Layer" based on naming
- ✓ Identified DuckDB as storage from effect patterns

## Gaps in Data
- Could not determine relationship direction for Hub -> Registry

## Assumptions
- Assumed "hub" module is Federation layer (needs validation)
```

---

## Mistake: Incomplete Enumerations

**What happened**: Listed "key containers" without listing all of them or marking as partial.

```markdown
Key containers include:
- Analysis Layer
- Storage Layer
- API Layer
```

**Why it's wrong**: Reader assumes this is complete. Missing Federation, Rules, Views.

**Gap metric affected**: **G1 (Container F1)** via M1 violation.

**Fix**: Apply M1 (Complete Sets):

```markdown
The package has 6 containers (layers):
1. Analysis Layer - parsers, analyzers, semantic
2. Storage Layer - duckdb, parquet, seeds
3. Federation Layer - hub, registry, workspace
4. API Layer - mcp, cli, commands
5. Rules Layer - rule engine, builtin rules
6. Views Layer - c4, diagrams, plantuml
```

**Rule applied**: M1 - count first, then list all.

---

## Mistake: Specific Before Generic

**What happened**: Jumped straight into "The Analysis Layer contains..." without defining what a layer is.

**Why it's wrong**: Reader doesn't understand the conceptual framework. Why 6 layers? What makes something a layer?

**Gap metric affected**: All (via M2 violation - documentation quality).

**Fix**: Apply M2 (Generic Before Specific):

```markdown
## Container Architecture

### What is a Container (Generic)
In C4 terms, a container is a deployable/runnable unit that executes code.
For DevAC Core, containers represent logical layers of functionality.

### How Containers are Organized (Varieties)
1. By layer - functional grouping (used here)
2. By package - npm package boundaries
3. By directory - file system structure

### DevAC Core Containers (Specific)
This package uses layer-based organization with 6 layers:
...
```

---

## Summary Table

| Mistake | Gap Metric | Fix |
|---------|------------|-----|
| Directory-based containers | G1 | Use 6 built-in layers |
| Showing all functions | G2 | Apply significance filtering |
| ASCII-only relationships | G3 | Parity by construction |
| Untyped externals | G4 | Add type tags |
| Reserved keywords | (blocks workflow) | Use alternative names |
| Missing reasoning | All | Create reasoning.md |
| Incomplete lists | G1 via M1 | Count first, list all |
| Specific before generic | All via M2 | Define concepts first |
