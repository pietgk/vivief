---
"@pietgk/devac-cli": major
"@pietgk/devac-mcp": major
---

BREAKING: Reorganize CLI into three core commands (v4.0)

This is a breaking change that consolidates 50+ CLI commands into three core commands:

**New Command Structure:**
- `devac sync` - Analyze packages, register repos, sync CI/issues/docs
- `devac status` - Show health, diagnostics, doctor, seeds
- `devac query <subcommand>` - All code graph queries

Plus utility commands:
- `devac mcp` - Start MCP server
- `devac workflow` - CI/git integration

**Command Mapping (old → new):**
- `devac analyze` → `devac sync`
- `devac hub init/register/refresh` → `devac sync` (automatic)
- `devac validate` → `devac sync --validate`
- `devac watch` → `devac sync --watch`
- `devac find-symbol` → `devac query symbol`
- `devac deps` → `devac query deps`
- `devac diagnostics` → `devac status --diagnostics`
- `devac doctor` → `devac status --doctor`

**MCP Tool Renaming:**
Tools renamed to match CLI pattern with `query_*` and `status_*` prefixes:
- `find_symbol` → `query_symbol`
- `get_dependencies` → `query_deps`
- `get_validation_errors` → `status_diagnostics`
- etc.

**Migration:** No backwards compatibility - update scripts to use new commands.

See ADR-0041 (CLI Command Structure) and ADR-0042 (MCP Tool Naming) for details.
