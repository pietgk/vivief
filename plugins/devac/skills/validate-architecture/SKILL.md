# Validate Architecture Skill

Help developers create and maintain `docs/c4/architecture-validated.md` and `docs/c4/validated/model.c4` - the human-validated goal for C4 generation improvement.

## Foundational Principle

From the Architecture Documentation Improvement Loop:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      IMPROVEMENT LOOP                                    │
│                                                                          │
│   validated/model.c4  ◄──── Human validates ◄──── Developer            │
│          (GOAL)                                                         │
│              │                                                          │
│              │ compare                                                  │
│              ▼                                                          │
│          GAP ────────────────────► effect-domain-rules                  │
│              ▲                            │                             │
│              │                            │ generate                    │
│   generated/model.c4  ◄──────────────────┘                             │
│         (GENERATED)                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

**DO:**
- Use devac MCP tools to analyze package structure
- Generate BOTH `.md` (comprehensive docs with diagrams) AND `.c4` (LikeC4 DSL for comparison)
- **Capture relationships explicitly** with tables AND LikeC4 code blocks in the markdown
- Mark uncertain sections with ⚠️ and verified sections with ✓
- Create reasoning file documenting queries and assumptions
- Keep files in sync when making refinements

**DON'T:**
- Skip the reasoning file (it's the audit trail for improvement)
- Generate only one format (both are needed for the loop)
- Ignore external systems (they're key architectural elements)
- **Encode relationships only in ASCII art** - always add explicit tables and code blocks

## Triggers

This skill activates when users ask about:
- "validate architecture"
- "create architecture documentation"
- "generate architecture-validated files"
- "update architecture"
- "check architecture drift"

## Capabilities

### Architecture Analysis
Analyze package to understand:
- **Container Groupings**: Logical layers (Analysis, Storage, Federation, etc.)
- **Key Components**: Architecturally-significant modules/classes
- **Relationships**: Data flow, dependencies, integration points
- **External Systems**: Databases, APIs, file systems, messaging

### Document Generation
Generate documents in a separate directory to avoid LikeC4 merge conflicts:
- `architecture-validated.md`: Full docs with ASCII C4 diagrams, sequence diagrams, explanations
- `validated/model.c4`: LikeC4 DSL for structural comparison with generated `.c4`
- `validated/spec.c4`: Shared specification (copy from generated/spec.c4)
- `validated/likec4.config.json`: LikeC4 project config

### Refinement Support
Accept refinement commands:
- "Move X to Y container"
- "Add relationship between A and B"
- "Mark external system Z as database type"
- "Group these components under Layer N"

## Workflow

### Step 1: Analyze Package
Use devac MCP tools to understand the package:

```bash
# Get high-level structure
devac query "SELECT DISTINCT kind, COUNT(*) as count FROM nodes WHERE package_id = 'devac-core' GROUP BY kind"

# Find key exported symbols
devac query "SELECT name, qualified_name, kind FROM nodes WHERE package_id = 'devac-core' AND is_exported = true ORDER BY name"

# Get effect patterns
devac effects list -p packages/devac-core --type Store
devac effects list -p packages/devac-core --type Send
```

### Step 2: Generate Initial Files
Create documentation files in a separate directory to avoid LikeC4 merge conflicts:

> **CRITICAL: Relationship Parity by Construction**
>
> As you reason about each relationship for the ASCII diagram, immediately add it to:
> 1. A **relationships table** (human-readable)
> 2. A **LikeC4 code block** (machine-usable)
>
> This ensures parity by construction rather than by validation.
> The `model.c4` file is derived from concatenating the LikeC4 code blocks in the markdown.

- **architecture-validated.md** (at `docs/c4/` root)
  - Overview section (✓ verified from package.json/README)
  - C4 Context diagram (ASCII art)
  - **Context Relationships section** (table + LikeC4 code block)
  - C4 Container diagram (ASCII art, grouped by layer)
  - **Container Relationships section** (table + LikeC4 code block per layer)
  - Key Components per container
  - Sequence diagrams for important flows
  - External System integrations

- **validated/model.c4** (LikeC4 model file)
  - NO specification block (use spec.c4 instead)
  - Model block with containers/components
  - Relationships **copied from markdown LikeC4 code blocks**
  - Views for different levels

- **validated/spec.c4** (copy from generated/spec.c4)
  - Shared element kind definitions
  - Relationship type definitions

- **validated/likec4.config.json**
  ```json
  {
    "$schema": "https://likec4.dev/schemas/config.json",
    "name": "{package}-validated",
    "title": "{Package} Architecture (Human-Validated)"
  }
  ```

### Step 3: Create Reasoning File
Document the analysis in `docs/c4/architecture.reasoning.md`:

```markdown
# Architecture Reasoning: @package/name

## Queries Used
- `SELECT ...` - Purpose: understand X
- `devac effects ...` - Purpose: find external integrations

## Inferences Made
- ⚠️ Grouped Parser modules into "Analysis Layer" based on naming pattern
- ✓ Identified DuckDB as storage from effect patterns

## Gaps in Data
- Could not determine relationship direction for X
- Missing metadata for internal module Y

## Assumptions
- Assumed "hub" module is part of Federation layer (needs validation)
```

### Step 4: Validate with Developer
Present documents for review:

1. Show ASCII diagrams in `.md` for quick review
2. Suggest opening LikeC4 VS Code extension for `.c4` visual review
3. Accept refinement requests
4. Update BOTH files in sync

### Step 5: Mark Verified
When developer approves:
- Add verification marker to metadata
- Commit both files

## CLI Commands

### `devac architecture status`
Check if architecture documentation needs updating.
```bash
devac architecture status -p packages/devac-core
# Output: STALE - seed hash changed since last validation
```

### `devac architecture score`
Calculate gap metrics between validated and generated.
```bash
devac architecture score -p packages/devac-core
# Output: Gap Score: 42% (Container F1: 35%, Relationship F1: 50%, ...)
```

### `devac architecture diff`
Show structural differences between validated and generated.
```bash
devac architecture diff -p packages/devac-core
# Output: Missing containers: Federation Layer, Extra: Utils, Types, ...
```

## MCP Tools (Used for Analysis)

### `query_sql`
Execute SQL queries against the code graph.
```
query_sql("SELECT name, kind FROM nodes WHERE package_id = 'devac-core' AND is_exported")
```

### `find_symbol`
Find a specific symbol by name.
```
find_symbol("analyzePackage")
```

### `get_call_graph`
Get function call relationships.
```
get_call_graph("analyzePackage", depth: 2)
```

### `get_dependencies`
Get package dependencies.
```
get_dependencies("packages/devac-core")
```

### `query_effects`
Query extracted effects.
```
query_effects(package: "devac-core", type: "Store")
```

## File Format: `docs/c4/architecture-validated.md`

The markdown serves as the **single source of truth**. After each ASCII diagram, include:
1. A **relationships table** for human readability
2. A **LikeC4 code block** for machine extraction

```markdown
# DevAC Core Architecture

> **Package:** @pietgk/devac-core
> **Validated:** 2026-01-07
> **Status:** Verified ✓

## Overview ✓

DevAC Core is a federated code analysis engine...

## C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                              CONTEXT                             │
│   ┌─────────────┐          ┌──────────────────┐                 │
│   │  Developer  │─────────►│   DevAC Core     │                 │
│   │   [Person]  │ queries  │    [System]      │                 │
│   └─────────────┘          └──────────────────┘                 │
│                                    │                             │
│                          ┌─────────┼─────────┐                   │
│                          ▼         ▼         ▼                   │
│                    ┌──────────┐ ┌──────┐ ┌────────┐              │
│                    │ Source   │ │ File │ │Central │              │
│                    │ Code     │ │System│ │Hub     │              │
│                    └──────────┘ └──────┘ └────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### Context Relationships

| From | To | Label |
|------|-----|-------|
| Developer | DevAC Core | Uses for analysis |
| DevAC Core | Source Code | Reads |
| DevAC Core | File System | Reads/Writes Parquet |
| DevAC Core | Central Hub | Reads/Writes |

```likec4
// Context relationships
developer -> devac_core "Uses"
devac_core -> source_code "Reads"
devac_core -> filesystem "Reads/Writes Parquet"
devac_core -> central_hub_db "Reads/Writes"
```

## C4 Container Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANALYSIS LAYER ✓                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │ Parsers  │◄─│ Analyzer │──►│ Semantic │                      │
│  └────┬─────┘  └──────────┘  └────┬─────┘                      │
│       │                           │                              │
│       ▼                           ▼                              │
│  Source Code                 Source Code                         │
├─────────────────────────────────────────────────────────────────┤
│                    STORAGE LAYER ✓                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │ DuckDB   │◄─│  Seeds   │  │ Effects  │                      │
│  └──────────┘  └────┬─────┘  └──────────┘                      │
│                     │                                            │
│                     ▼                                            │
│                File System                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Analysis Layer Relationships

| From | To | Label |
|------|-----|-------|
| Analyzer | Parsers | Calls for structural parsing |
| Analyzer | Semantic | Calls for resolution |
| Parsers | Source Code | Reads |
| Semantic | Source Code | Reads |

```likec4
// Analysis layer relationships
devac_core.analyzer -> devac_core.parsers "Calls for structural parsing"
devac_core.analyzer -> devac_core.semantic "Calls for resolution"
devac_core.parsers -> source_code "Reads"
devac_core.semantic -> source_code "Reads"
```

### Storage Layer Relationships

| From | To | Label |
|------|-----|-------|
| Analyzer | Storage | Writes results |
| Storage | File System | Reads/Writes Parquet |
| Seeds | DuckDB | Queries via |

```likec4
// Storage layer relationships
devac_core.analyzer -> devac_core.storage "Writes results"
devac_core.storage -> filesystem "Reads/Writes Parquet"
devac_core.storage.seeds -> devac_core.storage.duckdb_pool "Queries via"
```

## Key Components

### Analysis Layer ✓
- **Parsers**: TS/Py/C# AST extraction (<50ms/file)
- **Semantic**: Cross-file resolution (50-200ms/file)
- **Analyzer**: Orchestrates analysis flow

### Storage Layer ✓
- **DuckDBPool**: Connection pooling, error recovery
- **SeedWriter/Reader**: Parquet I/O to .devac/seed/
- **EffectWriter/Reader**: v3.0 foundation effect storage

### Federation Layer ⚠️
- **Central Hub**: Cross-repo queries, Single Writer
- **Workspace Manager**: Multi-repo operations
- **Context Discovery**: Sibling repos, issue worktrees

## External Systems ✓

| System | Type | Technology |
|--------|------|------------|
| Source Code | Input | TS/Py/C# files |
| File System | Storage | Parquet seeds |
| Central Hub | Federation | DuckDB |

## All Relationships Summary

This section consolidates all relationships for easy model.c4 generation:

```likec4
// =====================================================
// ALL RELATIONSHIPS (copy to model.c4)
// =====================================================

// Context level
developer -> devac_core "Uses"
devac_core -> source_code "Reads"
devac_core -> filesystem "Reads/Writes Parquet"
devac_core -> central_hub_db "Reads/Writes"

// Analysis layer
devac_core.analyzer -> devac_core.parsers "Calls for structural parsing"
devac_core.analyzer -> devac_core.semantic "Calls for resolution"
devac_core.parsers -> source_code "Reads"
devac_core.semantic -> source_code "Reads"

// Storage layer
devac_core.analyzer -> devac_core.storage "Writes results"
devac_core.storage -> filesystem "Reads/Writes Parquet"
```
```

## File Format: `docs/c4/validated/model.c4`

The `model.c4` file is **derived from the markdown** by:
1. Defining elements (containers, components, external systems)
2. **Copying relationships from the "All Relationships Summary" code block** in the markdown

```likec4
// validated/model.c4
// Human-validated architecture for gap comparison
// devac:validated: true
// devac:validated-at: 2026-01-07
// devac:package-path: packages/devac-core

model {
  devac_core = system 'DevAC Core' {
    description 'Federated code analysis engine'

    analyzer = container 'Analyzer' {
      description 'Orchestrates analysis flow'
    }

    parsers = container 'Parsers' {
      description 'TS/Py/C# AST extraction'
    }

    semantic = container 'Semantic' {
      description 'Cross-file resolution'
    }

    storage = container 'Storage Layer' {
      duckdb_pool = component 'DuckDBPool' {
        description 'Connection pooling'
      }
      seeds = component 'Seeds' {
        description 'Parquet I/O'
      }
    }
  }

  // External systems
  source_code = external_system 'Source Code' {
    description 'TS/Py/C# files'
  }
  filesystem = external_system 'File System' {
    description 'Parquet storage'
  }

  // =====================================================
  // RELATIONSHIPS (copied from architecture-validated.md)
  // =====================================================

  // Context level
  developer -> devac_core "Uses"
  devac_core -> source_code "Reads"
  devac_core -> filesystem "Reads/Writes Parquet"

  // Analysis layer
  devac_core.analyzer -> devac_core.parsers "Calls for structural parsing"
  devac_core.analyzer -> devac_core.semantic "Calls for resolution"
  devac_core.parsers -> source_code "Reads"
  devac_core.semantic -> source_code "Reads"

  // Storage layer
  devac_core.analyzer -> devac_core.storage "Writes results"
  devac_core.storage -> filesystem "Reads/Writes Parquet"
  devac_core.storage.seeds -> devac_core.storage.duckdb_pool "Queries via"
}

views {
  view containers of devac_core {
    title 'DevAC Core Containers'
    include *
    autoLayout TopBottom
  }
}
```

Note: The `spec.c4` file defines element kinds with **notations** (for the diagram legend) and **relationship types** (for visual distinction):
```likec4
specification {
  // Element kinds
  element person {
    notation "Person"
    style {
      shape person
      color blue
    }
  }

  element system {
    notation "Software System"
    style {
      shape rectangle
      color indigo
    }
  }

  element container {
    notation "Container"
    style {
      shape rectangle
      color sky
    }
  }

  element component {
    notation "Component"
    style {
      shape rectangle
      color slate
    }
  }

  element external_system {
    notation "External System"
    style {
      shape rectangle
      color gray
    }
  }

  // Relationship kinds (notations not yet supported)
  relationship reads {
    color green
    line solid
  }

  relationship writes {
    color amber
    line solid
  }

  relationship calls {
    color sky
    line dashed
  }

  relationship queries {
    color indigo
    line dashed
  }

  relationship uses {
    color slate
    line dashed
  }

  relationship ipc {
    color secondary
    line dotted
  }
}
```

Use typed relationships in model.c4: `source -[reads]-> target "label"`

## Example Interaction

**User:** "Validate the architecture for packages/devac-core"

**Response approach:**
1. Query code graph for package structure
2. Identify containers (logical layers)
3. Find key components per container
4. Map external system interactions from effects
5. Generate `architecture-validated.md` with ASCII diagrams
6. Create `validated/` directory with:
   - `model.c4` (LikeC4 DSL, no specification block)
   - `spec.c4` (copy from generated/)
   - `likec4.config.json`
7. Create `architecture.reasoning.md` documenting analysis
8. Present for developer review

**User:** "Move the Rules module into the Analysis Layer"

**Response approach:**
1. Update container assignment in `.c4` model block
2. Update ASCII diagram in `.md`
3. Note the change in reasoning file
4. Re-present for validation

**User:** "Looks good, mark as verified"

**Response approach:**
1. Update status to "Verified ✓" in both files
2. Record validation timestamp
3. Commit files

## Integration with Improvement Loop

After validation, the files enable:

```bash
# Calculate how close generated is to validated
devac architecture score -p packages/devac-core

# See what's missing/extra in generated
devac architecture diff -p packages/devac-core

# Regenerate .c4 and compare
devac c4 -p packages/devac-core
devac architecture score -p packages/devac-core
```

The gap score drives improvement of `effect-domain-rules` so that generated `.c4` gets closer to validated `.c4` over time.

## LikeC4 Syntax Validation

**CRITICAL: Always validate model.c4 before marking as complete.**

```bash
# Validate the generated files
cd docs/c4/validated && npx likec4 validate .
```

If validation fails, fix the errors before proceeding. Common issues:

### Reserved Keywords

These identifiers are **reserved in LikeC4** and cannot be used as element names:
- `views` - Use `diagram_views` or `view_layer` instead
- `model` - Use `data_model` or `model_layer` instead
- `specification` - Use `spec_layer` instead

### Syntax Errors

- Missing closing braces `}`
- Incorrect relationship syntax (must be `source -> target "label"`)
- Invalid characters in identifiers (use snake_case)

## Notes

- **Markdown is the single source of truth** - relationships in model.c4 are copied from markdown code blocks
- Always generate BOTH `.md` and `validated/model.c4` together (keep in sync)
- **Parity by construction**: As you draw ASCII diagrams, immediately add relationships to tables AND code blocks
- Use confidence markers (✓ verified, ⚠️ uncertain) liberally
- The reasoning file is essential for the improvement loop
- Don't skip external systems - they're key architectural elements
- Works well with `/define-effects` skill (effects inform architecture)
- Target gap score: >65% (from ~28% baseline)
- **Important**: The `validated/` directory must have its own `spec.c4` and `likec4.config.json` to avoid LikeC4 merge conflicts with `generated/`
- **Avoid reserved keywords**: Don't use `views`, `model`, `specification` as element identifiers

## Relationship Parity Checklist

Before marking as validated, verify:
- [ ] All ASCII arrows have corresponding rows in relationships tables
- [ ] All table rows have corresponding LikeC4 code in code blocks
- [ ] All code blocks are consolidated in "All Relationships Summary" section
- [ ] model.c4 relationships section matches the summary code block exactly
- [ ] Count of relationships in tables = count in code blocks = count in model.c4
- [ ] **LikeC4 validation passes**: `npx likec4 validate .` returns no errors
