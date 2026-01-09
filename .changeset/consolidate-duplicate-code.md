---
"@pietgk/devac-core": patch
---

Consolidate duplicate code in context and validation modules

- Remove duplicate `parseIssueId` and `parseWorktreeNameV2` from context/discovery.ts (re-exported from workspace for backwards compatibility)
- Create shared `ValidatorError` base class with `TscError`, `TestError`, `LinterError`, `CoverageError` subclasses
