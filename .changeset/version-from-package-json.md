---
"@pietgk/a11y-reference-storybook": patch
"@pietgk/devac-worktree": patch
"@pietgk/browser-core": patch
"@pietgk/browser-cli": patch
"@pietgk/browser-mcp": patch
"@pietgk/devac-core": patch
"@pietgk/devac-eval": patch
"@pietgk/devac-cli": patch
"@pietgk/devac-mcp": patch
---

Read package version from package.json at runtime instead of generating
`src/version.ts` on prebuild. Removes the generation script, the per-package
`prebuild` hook, and the CI generation step; makes version drift structurally
impossible. See ADR-0052 (supersedes ADR-0040).
