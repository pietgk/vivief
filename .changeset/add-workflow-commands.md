---
"@pietgk/devac-cli": minor
---

Add `devac workflow` command group for deterministic development operations

New commands that handle mechanical, repeatable tasks while leaving reasoning to the LLM:

- `devac workflow check-changeset` - Check if changeset needed based on package changes
- `devac workflow pre-commit` - Validate commit readiness (staged files, lint, types)
- `devac workflow prepare-ship` - Full pre-ship validation (build, test, lint, changeset)
- `devac workflow diff-summary` - Structured diff info for LLM drafting
- `devac workflow install-local` - Build and link CLI packages globally

All commands support `--json` flag for structured output, making them ideal for use in scripts and Claude slash commands.
