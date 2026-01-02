---
"@pietgk/devac-worktree": patch
---

Rename `--skip-claude` flag to `--new-session` with inverted semantics

**Breaking change in flag behavior:**
- Old: `--skip-claude` meant "don't launch Claude" (opt-out)
- New: `--new-session` means "launch Claude in the worktree" (opt-in)

Default behavior is now to NOT launch Claude automatically, giving users control over their session.

Also exports `parseIssueArg` and `parseRepos` functions for testing.
