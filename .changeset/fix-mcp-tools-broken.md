---
"@pietgk/devac-core": patch
"@pietgk/devac-mcp": patch
---

fix(mcp): Fix broken MCP tools - query_sql and get_workspace_status

**Root causes and fixes:**

1. **Workspace status silent failures**: Hub connection errors were silently swallowed by an empty catch block. Now surfaces errors via new `hubError` field in `WorkspaceStatus`.

2. **Package path resolution**: `getPackagePaths()` was returning repository paths instead of actual package paths. Now reads `.devac/manifest.json` to extract real package paths.

3. **Overly-restrictive path validation**: `checkForRootSeeds()` filtered out any path containing `.git`, breaking single-package repos where seeds live at repo root. Removed this validation - the unified query system now trusts all provided paths (caller is responsible for valid paths from manifest).

4. **Misleading schema documentation**: `get_schema` incorrectly implied hub tables (repo_registry, validation_errors, unified_diagnostics) were SQL-queryable. Updated descriptions to clarify these require dedicated MCP tools.

**Impact:**
- `query_sql` now works correctly for single-package repos
- `get_workspace_status` now reports hub errors instead of showing "unregistered"
- `get_schema` output is now accurate about what's SQL-queryable

Closes #148
