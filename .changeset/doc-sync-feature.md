---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
---

feat: Add doc-sync command for federated documentation generation

- Generate effects documentation at package, repo, and workspace levels
- Generate C4 PlantUML diagrams (context and containers) at all levels
- Seed hash metadata for change detection (skip unchanged packages)
- `--check` flag for CI mode to verify docs are in sync
- Aggregation functions to identify cross-package and cross-repo patterns
- Integration with existing effects workflow (effects init → verify → doc-sync)

New files:
- `devac-core/src/docs/`: seed-hasher, doc-metadata, effects-generator, c4-doc-generator
- `devac-core/src/docs/repo-*`: Repo-level aggregation generators
- `devac-core/src/docs/workspace-*`: Workspace-level aggregation generators
- `devac-cli/src/commands/doc-sync.ts`: CLI command implementation

Resolves #83
