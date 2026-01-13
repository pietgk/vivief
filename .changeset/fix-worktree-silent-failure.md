---
"@pietgk/devac-worktree": patch
---

Fix silent failure when running `devac-worktree start` with numeric-only issue IDs

- Remove legacy numeric-only issue ID format support
- Require full issue ID format: `gh<repoDirectoryName>-<issueNumber>`
- Detect non-`gh` inputs as Jira format with "coming soon" message
- Add clear error messages with format explanation
- Update all documentation to reflect new requirements
