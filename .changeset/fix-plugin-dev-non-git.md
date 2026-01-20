---
"@pietgk/devac-cli": patch
---

fix(workflow): make plugin-dev robust for non-git directories

- Auto-discover vivief repo when run from workspace root (non-git dir)
- Prioritize main vivief repo over worktrees (vivief-*)
- Provide clear error messages for invalid --path arguments
