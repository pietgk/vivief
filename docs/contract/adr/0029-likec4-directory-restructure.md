# ADR-0029: LikeC4 Directory Restructure for Conflict Avoidance

## Status

Accepted

## Context

DevAC generates C4 architecture diagrams in LikeC4 format (ADR-0027) and supports human-validated architecture documentation through the `/validate-architecture` skill. This creates two types of C4 files:

1. **Generated models** (`architecture.c4`): Auto-generated from code effects
2. **Validated models** (`architecture-validated.c4`): Human-reviewed and curated

Having both files in the same `docs/c4/` directory causes **LikeC4 VSCode plugin errors**:

- "Duplicate element kind 'system'"
- "Duplicate element kind 'container'"
- Conflicting specification blocks

This happens because LikeC4 **automatically merges all `.c4` files** in a directory into a single model. When both generated and validated files contain `specification {}` blocks and define the same elements (systems, containers, components), they conflict.

Additionally, the gap analysis feature (comparing generated vs validated architectures) requires running `likec4 export json` on both models separately, which is impossible when they're merged.

## Decision

We restructure `docs/c4/` directories to use **separate subdirectories** for generated and validated models, with a **shared specification file**.

### New Directory Structure

```
package/docs/c4/
├── spec.c4                    # Shared specification (element kinds, relationships)
├── generated/
│   ├── likec4.config.json     # Points to ../spec.c4
│   ├── spec.c4                # Copy of shared spec
│   └── model.c4               # Auto-generated model + views
└── validated/                 # Optional - only when human validation exists
    ├── likec4.config.json
    ├── spec.c4                # Copy of shared spec
    └── model.c4               # Human-validated model + views
```

### Key Changes

1. **Separate LikeC4 Projects**: Each subdirectory is an isolated LikeC4 project
2. **No Specification Conflicts**: Each model.c4 excludes `specification {}` block
3. **Shared Specification**: Common `spec.c4` defines element kinds and relationship types
4. **Clear Separation**: Generated vs validated architectures are distinct
5. **Gap Analysis Support**: Can run `likec4 export json` on each directory separately

### Shared Specification File

```c4
// spec.c4 - DevAC LikeC4 Specification
specification {
  element person {
    style { shape person }
  }
  element system {
    style { shape rectangle }
  }
  element container {
    style { shape rectangle }
  }
  element component {
    style { shape rectangle }
  }
  element external_system {
    style { shape storage }
  }

  relationship uses
  relationship writes
  relationship reads
  relationship contains
  relationship queries
  relationship calls
  relationship imports
}
```

### Implementation Files Modified

```
packages/devac-core/src/docs/c4-doc-generator.ts
  - Output path: docs/c4/architecture.c4 → docs/c4/generated/model.c4
  - Creates spec.c4 and likec4.config.json in generated/

packages/devac-core/src/views/likec4-json-parser.ts
  - parsePackageC4Files() looks in generated/ and validated/ subdirectories
  - Runs likec4 export json on each subdirectory separately

plugins/devac/skills/validate-architecture/SKILL.md
  - Output path: docs/c4/architecture-validated.c4 → docs/c4/validated/model.c4
  - Creates validated/ directory structure
```

### Reserved Keyword Handling

LikeC4 reserves certain identifiers. Container names must avoid:
- `views` (use `view_generators` instead)
- `specification`
- `model`

## Consequences

### Positive

- **No LikeC4 Plugin Errors**: Each directory is an isolated project
- **Gap Analysis Works**: Can compare generated vs validated models
- **Clear Ownership**: Generated files auto-update, validated files are human-owned
- **Consistent Structure**: Same pattern across all packages
- **VSCode Support**: Both models viewable side-by-side in separate tabs

### Negative

- **File Duplication**: spec.c4 copied to each subdirectory
- **Migration Required**: Existing projects need directory restructure
- **Additional Directories**: More complex file structure

### Neutral

- **Backward Compatible**: Old single-file structure continues to work (just with LikeC4 warnings)
- **Optional Validation**: validated/ directory only created when human validation exists

## Affected Packages

| Package | Has Generated | Has Validated |
|---------|---------------|---------------|
| devac-core | Yes | Yes |
| devac-cli | Yes | No |
| devac-mcp | Yes | No |
| devac-worktree | Yes | No |
| devac-eval | Yes | No |
| fixtures-typescript | Yes | No |
| fixtures-csharp | Yes | No |
| docs/c4 (root) | Yes | No |

## References

- [ADR-0027: LikeC4 as Primary C4 Documentation Format](./0027-likec4-primary-format.md)
- [ADR-0028: C4 Architecture Enrichment and Relationship Aggregation](./0028-c4-enrichment-and-aggregation.md)
- [LikeC4 Documentation](https://likec4.dev/)
