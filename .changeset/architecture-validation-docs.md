---
"@pietgk/devac-core": patch
---

### LikeC4 Directory Restructure

Restructure `docs/c4/` directories to separate generated and validated architecture models:
- New `generated/` subdirectory for auto-generated C4 models
- New `validated/` subdirectory for human-validated C4 models
- Shared `spec.c4` file defines element kinds and relationships
- Each subdirectory is an isolated LikeC4 project (no more duplicate element errors)

This change addresses LikeC4 VSCode plugin conflicts caused by merging multiple `.c4` files
with overlapping specification blocks.

### Documentation Updates

- **ADR-0029**: LikeC4 Directory Restructure for Conflict Avoidance
- **ADR-0030**: Unified Query System Architecture
- **ADR-0031**: Architecture Documentation Quality Improvement Loop
- Updated ADR-0027 with new output file structure
- Fixed ADR README date inconsistencies (0011-0023)
- Updated docs/README.md version info

### Code Changes

- `c4-doc-generator.ts`: Output to `docs/c4/generated/model.c4` instead of `docs/c4/architecture.c4`
- `likec4-json-parser.ts`: Parse from `generated/` and `validated/` subdirectories
- Fixed LikeC4 syntax errors in spec.c4 (removed invalid `border dashed`)
- Renamed `views` container to `view_generators` to avoid reserved keyword conflict
