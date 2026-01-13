---
"@pietgk/devac-worktree": patch
---

fix(worktree): make start command more robust

- Fix `gh issue view` failing in parent directory mode by passing explicit repo context
- Add uncommitted changes detection before creating worktrees to prevent broken/empty worktrees
- Provide helpful error messages with stash instructions when uncommitted changes are detected
