---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
"@pietgk/devac-mcp": minor
---

feat: add workspace analysis status and enhanced hub registration

- Add seed state detection per package (none/base/delta/both)
- Add comprehensive workspace status computation
- Enhance `devac status` with seed status section and `--seeds-only` flag
- Enhance `devac hub register` with `--analyze` and `--all` flags
- Add MCP `get_workspace_status` tool for AI assistant integration
- Fix entity ID generation to use relative file paths for deterministic results across git worktrees
