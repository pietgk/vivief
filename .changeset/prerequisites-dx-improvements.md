---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
"@pietgk/devac-mcp": minor
---

Add prerequisites module and improve DX when prerequisites aren't met

- Add prerequisites module with checkSyncPrerequisites, checkQueryPrerequisites, getReadinessForStatus
- Fix silent failures: track missing seeds, log hub lock fallback, validate MCP parameters
- Fix circular error in sync: no longer says "run devac sync" when sync itself failed
- Consolidate CLI hub checks into shared hub-prerequisites utility
- Add readiness section to status output showing sync/query readiness
- Include readiness metadata in MCP query responses when results are empty
