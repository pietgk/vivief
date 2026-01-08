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
- Mark uncertain sections with ⚠️ and verified sections with ✓
- Create reasoning file documenting queries and assumptions
- Keep files in sync when making refinements

**DON'T:**
- Skip the reasoning file (it's the audit trail for improvement)
- Generate only one format (both are needed for the loop)
- Ignore external systems (they're key architectural elements)

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

- **architecture-validated.md** (at `docs/c4/` root)
  - Overview section (✓ verified from package.json/README)
  - C4 Context diagram (ASCII art)
  - C4 Container diagram (ASCII art, grouped by layer)
  - Key Components per container
  - Sequence diagrams for important flows
  - External System integrations

- **validated/model.c4** (LikeC4 model file)
  - NO specification block (use spec.c4 instead)
  - Model block with containers/components
  - Relationships between elements
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
└─────────────────────────────────────────────────────────────────┘
```

## C4 Container Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANALYSIS LAYER ✓                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │ Parsers  │──│ Semantic │──│ Analyzer │                      │
│  └──────────┘  └──────────┘  └──────────┘                      │
├─────────────────────────────────────────────────────────────────┤
│                    STORAGE LAYER ✓                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │ DuckDB   │──│  Seeds   │──│ Effects  │                      │
│  └──────────┘  └──────────┘  └──────────┘                      │
├─────────────────────────────────────────────────────────────────┤
│                    FEDERATION LAYER ⚠️                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │   Hub    │──│Workspace │──│ Context  │                      │
│  └──────────┘  └──────────┘  └──────────┘                      │
└─────────────────────────────────────────────────────────────────┘
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

## Sequence: Analysis Flow

```
Developer ──► Analyzer ──► Parsers ──► Source Code
                │              │
                ▼              │
            Semantic ◄─────────┘
                │
                ▼
            Storage ──► File System
```
```

## File Format: `docs/c4/validated/model.c4`

```likec4
// validated/model.c4
// Human-validated architecture for gap comparison
// devac:validated: true
// devac:validated-at: 2026-01-07
// devac:package-path: packages/devac-core

model {
  devac_core = system 'DevAC Core' {
    description 'Federated code analysis engine'

    analysis = container 'Analysis Layer' {
      parsers = component 'Parsers' {
        description 'TS/Py/C# AST extraction'
      }
      semantic = component 'Semantic' {
        description 'Cross-file resolution'
      }
      analyzer = component 'Analyzer' {
        description 'Orchestrates analysis flow'
      }
    }

    storage = container 'Storage Layer' {
      duckdb = component 'DuckDBPool' {
        description 'Connection pooling'
      }
      seeds = component 'Seeds' {
        description 'Parquet I/O'
      }
      effects = component 'Effects' {
        description 'Effect storage'
      }
    }

    federation = container 'Federation Layer' {
      hub = component 'Central Hub' {
        description 'Cross-repo queries'
      }
      workspace = component 'Workspace Manager'
      context = component 'Context Discovery'
    }
  }

  // External systems
  source_code = external_system 'Source Code' {
    description 'TS/Py/C# files'
  }
  file_system = external_system 'File System' {
    description 'Parquet storage'
  }

  // Relationships
  devac_core.analysis.parsers -> source_code 'reads'
  devac_core.storage.seeds -> file_system 'writes'
  devac_core.federation.hub -> devac_core.storage.duckdb 'queries'
}

views {
  view containers of devac_core {
    title 'DevAC Core Containers'
    include *
    autoLayout TopBottom
  }
}
```

Note: The `spec.c4` file should be copied from `generated/spec.c4` and defines element kinds:
```likec4
specification {
  element person
  element system
  element container
  element component
  element external_system

  relationship uses
  relationship writes
  relationship reads
  relationship contains
  relationship queries
  relationship calls
  relationship imports
  relationship extends
}
```

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

## Notes

- Always generate BOTH `.md` and `validated/model.c4` together (keep in sync)
- Use confidence markers (✓ verified, ⚠️ uncertain) liberally
- The reasoning file is essential for the improvement loop
- Don't skip external systems - they're key architectural elements
- Works well with `/define-effects` skill (effects inform architecture)
- Target gap score: >65% (from ~28% baseline)
- **Important**: The `validated/` directory must have its own `spec.c4` and `likec4.config.json` to avoid LikeC4 merge conflicts with `generated/`
