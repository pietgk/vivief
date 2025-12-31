---
"@pietgk/devac-cli": minor
---

Add live CI/workflow status to `devac status` command

- Add WORKFLOW section showing live CI status from GitHub for all repos
- Integrate getCIStatusForContext from devac-core for real-time CI data
- Add --cached flag to skip live CI fetch (faster, uses hub cache only)
- Add --sync flag to sync CI results to hub after gathering
- Include CI failures in next steps suggestions

This makes `devac status` the single deterministic command for all Four Pillars: Infrastructure, Validators, Extractors, and Workflow.
