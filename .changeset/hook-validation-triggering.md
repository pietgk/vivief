---
"@pietgk/devac-cli": minor
"@pietgk/devac-mcp": minor
---

Add hook-based validation triggering for Claude Code integration

- Add `--inject` flag to `devac status` command for UserPromptSubmit hook integration
- Add `--on-stop` flag to `devac validate` command for Stop hook integration with auto git diff detection
- Add `level` parameter to `get_all_diagnostics` MCP tool supporting progressive disclosure (counts/summary/details)
- Create `plugins/devac/hooks/hooks.json` with hook definitions
- Update diagnostics-triage skill documentation with hook workflow
