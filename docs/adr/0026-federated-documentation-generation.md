# ADR-0026: Federated Documentation Generation

## Status

Accepted

## Context

DevAC generates documentation from code analysis seeds (effects patterns, C4 diagrams). As projects scale from single packages to multi-package repositories to multi-repo workspaces, there's a need for aggregated documentation that provides visibility at each level.

Challenges:
1. **Cross-cutting visibility**: Teams need to understand effects across packages/repos
2. **Documentation staleness**: Docs can drift from code without change detection
3. **Inconsistent structure**: Different projects structure documentation differently
4. **No aggregation**: Package-level docs don't roll up to repo/workspace views

## Decision

Implement **federated documentation generation** via the `devac doc-sync` command that generates documentation at three hierarchical levels:

### Hierarchy

```
Workspace Level (all repos)
    ↓ aggregates
Repo Level (all packages in repo)
    ↓ aggregates
Package Level (single package)
```

### Output Structure

```
package/docs/
├── package-effects.md        # Effects patterns for one package
└── c4/
    ├── context.puml          # External systems
    └── containers.puml       # Components

repo/docs/
├── repo-effects.md           # Aggregated across packages
└── c4/
    ├── context.puml          # All external systems
    └── containers.puml       # Packages as containers

workspace/docs/
├── workspace-effects.md      # Aggregated across repos
└── c4/
    ├── context.puml          # All repos as systems
    └── containers.puml       # Repos as system boundaries
```

### Seed Hash Change Detection

Each generated document embeds metadata to detect when regeneration is needed:

```markdown
<!--
  devac:seed-hash: sha256:abc123...
  devac:generated-at: 2025-01-15T10:30:00Z
  devac:generator: doc-sync@1.0.0
-->
```

- **Package level**: Hash of package's seed files
- **Repo level**: Combined hash of all package seeds
- **Workspace level**: Combined hash from hub registry

The `--check` flag enables CI mode to verify docs are in sync without regenerating.

### Integration with Effects Workflow

doc-sync builds on the existing effects workflow (ADR-0023):

```
Parser → seeds → effects init → package-effects.md
                                    ↓
                               Human review
                                    ↓
                               effects verify
                                    ↓
                              doc-sync (generates C4 + aggregations)
```

### CLI Interface

```bash
devac doc-sync [options]
  -p, --package <path>    Sync specific package
  -r, --repo <path>       Sync all packages in repo
  -w, --workspace         Sync entire workspace
  --effects               Effects documentation only
  --c4                    C4 diagrams only
  --all                   All documentation (default)
  --force                 Regenerate even if unchanged
  --check                 CI mode: verify docs in sync
  --json                  JSON output
  -v, --verbose           Detailed progress
```

## Consequences

### Positive

- **Hierarchical visibility**: Teams see effects at package, repo, and workspace levels
- **Change detection**: Seed hash prevents unnecessary regeneration
- **CI integration**: `--check` flag catches stale documentation
- **Consistent structure**: Same format across all levels
- **Cross-cutting patterns**: Identifies patterns appearing in multiple packages/repos
- **Federation**: Each level aggregates from the level below

### Negative

- **Storage overhead**: Generated docs stored in each repo
- **Build time**: Workspace-level requires hub queries
- **Complexity**: Three levels of documentation to maintain

### Mitigations

- Skip unchanged packages via seed hash comparison
- Hub queries are read-only and cached
- `--check` mode for fast CI validation without regeneration

## Implementation Notes

### Aggregation Functions

- **Package → Repo**: `aggregatePackageEffects()` combines patterns, identifies cross-package patterns
- **Repo → Workspace**: `queryWorkspaceEffects()` queries hub, identifies cross-repo patterns

### C4 Diagram Levels

| Level | Context Diagram | Container Diagram |
|-------|-----------------|-------------------|
| Package | External systems | Components |
| Repo | External systems | Packages as containers |
| Workspace | Repos as systems | Repos with packages |

### Related ADRs

- ADR-0007: Federation architecture
- ADR-0016: Workspace module
- ADR-0021: Pipeline docs
- ADR-0023: Developer-maintained effects
