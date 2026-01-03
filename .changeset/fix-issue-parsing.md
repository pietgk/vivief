---
"@pietgk/devac-worktree": patch
---

Fix issue ID parsing in clean and resume commands

- Both `clean` and `resume` commands now accept full issue ID format (e.g., `ghvivief-62`) in addition to numeric format (`62`)
- Added pre-checks for worktree cleanliness before clean operation
- Added `--skip-pr-check` flag to skip only PR merged validation
- Added `--yes` / `-y` flag to skip confirmation prompts
- Added `checkWorktreeStatus()` function to detect modified/untracked files
- Improved error messages with actionable suggestions
