---
"@pietgk/devac-core": minor
"@pietgk/devac-mcp": patch
---

feat(core): Add unified query system with packages array abstraction

- Implements unified `query()` function that takes a packages array as the key abstraction
- Query level is implicit from array contents: 1 package = package-level, multiple = repo/workspace
- Adds root-seed validation: warns and skips seeds found at repo root with .git (prevents stale seed issues)
- Rewrites `setupQueryContext()` and `queryMultiplePackages()` as backwards-compatible wrappers
- All existing tests pass (1367 tests across devac-core and devac-cli)

fix(mcp): Update to use shared devac-core hub implementation

This addresses issue #121 where devac-mcp was not fully using the shared devac-core implementation.
