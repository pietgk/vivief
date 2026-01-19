---
"@pietgk/devac-cli": minor
"@pietgk/devac-core": minor
---

feat(workspace): auto-discovery and setup plugin

- Replace `workspace.json` with filesystem-based auto-discovery for repos
- Repos are now discovered by scanning for `.git` directories with `AGENTS.md` or `CLAUDE.md`
- Add `/devac:setup` command for guided first-time setup in Claude Code
- Simpler setup - no configuration file needed
