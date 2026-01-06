---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
---

feat(likec4): add LikeC4 as primary C4 documentation format

- Add LikeC4 as the default output format for C4 diagrams (replacing PlantUML as default)
- Add `--format` flag to `doc-sync` command with options: `likec4` (default), `plantuml`, `both`
- Add `exportContextToEnhancedLikeC4` and `exportContainersToEnhancedLikeC4` with source links and tags
- Add `generateLikeC4Specification` for custom element kinds based on detected domains
- Add `identifyEffectChains`, `generateDynamicViews`, `generateEffectsFlowLikeC4` for effect flow visualization
- Add `generateUnifiedWorkspaceLikeC4` for cross-repo architecture diagrams
- PlantUML remains available via `--format plantuml` for backward compatibility

See ADR-0027 for the decision rationale.
