---
"@pietgk/devac-cli": minor
---

Add `devac doctor` command for diagnosing and fixing CLI/MCP issues

New diagnostic command that checks system health and can automatically fix common issues:

**Global checks (always run):**
- CLI installation: devac, devac-mcp, devac-worktree availability and version consistency
- Hub health: database initialization and queryability
- MCP status: socket file presence and responsiveness

**Workspace checks (when inside devac workspace):**
- Package builds: dist/index.js existence for all packages
- Plugin configuration: plugin.json and .mcp.json validity

**Usage:**
- `devac doctor` - Check health (dry-run, shows what would be fixed)
- `devac doctor --fix` - Execute fixes automatically
- `devac doctor --json` - Output as JSON for programmatic use
- `devac doctor --verbose` - Show additional details
