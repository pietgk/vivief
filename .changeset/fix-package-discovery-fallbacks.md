---
"@pietgk/devac-core": patch
---

Add fallback discovery for repos without workspace config

- JS packages: Try common patterns (packages/*, apps/*, libs/*, services/*) when no pnpm-workspace.yaml or workspaces field exists
- Python packages: Discover projects with requirements.txt + .py files (in addition to pyproject.toml)

Fixes #69
