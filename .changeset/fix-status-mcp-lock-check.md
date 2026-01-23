---
"@pietgk/devac-core": patch
---

Fix MCP lock detection gap in status prerequisites

- Add `checkHubNotLocked()` to `checkStatusPrerequisites()` to match the behavior of `checkSyncPrerequisites()`
- MCP lock warning now appears in the Readiness section output rather than as a surprise logger warning from CentralHub fallback
- Add test coverage for prerequisites module (environment.test.ts, checker.test.ts)
