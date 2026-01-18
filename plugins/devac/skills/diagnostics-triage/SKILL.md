# Diagnostics Triage Skill

Triage and prioritize diagnostics, errors, and issues using DevAC's Validators Pillar outputs.

## Automatic Context Injection (Hooks)

DevAC automatically injects diagnostic status into Claude Code conversations via hooks:

### UserPromptSubmit Hook
When you start a conversation, if there are unresolved errors or warnings, DevAC automatically injects a status reminder:
```
DevAC Status: 3 errors, 2 warnings
Run get_all_diagnostics to see details.
```

### Stop Hook
After code changes are made, the Stop hook runs quick validation and reminds you of any new issues introduced:
```
Validation found issues:
- 2 TypeScript errors in src/foo.ts
- 1 ESLint warning in src/bar.ts

Consider fixing these before continuing.
```

### "Solve Until None" Workflow
The hooks enable an iterative workflow:
1. See diagnostic status when starting work
2. Make code changes
3. Get reminded of any issues introduced
4. Fix issues
5. Repeat until no issues remain

This creates a natural loop that keeps the codebase healthy.

### Disabling Hooks
To disable automatic injection, remove or comment out entries in `plugins/devac/hooks/hooks.json`.

## Triggers

This skill activates when users ask about:
- "what needs fixing"
- "show errors"
- "diagnostics"
- "triage issues"
- "what's broken"
- "lint errors"
- "type errors"
- "prioritize fixes"

## Capabilities

### Diagnostics Overview
Get a high-level summary of all issues across the workspace.

### Error Prioritization
Intelligently prioritize which issues to fix first based on severity and impact.

### Category Breakdown
Understand the distribution of issues by type (TypeScript, ESLint, test failures).

### Cross-Repository Triage
See diagnostics across all connected repositories in hub mode.

## CLI Commands (Primary)

Use DevAC CLI commands for diagnostics. CLI is preferred for lower context overhead.

### `devac diagnostics`
Get diagnostics overview across the workspace.
```bash
devac diagnostics
devac diagnostics --severity error
devac diagnostics --file src/services/
```

### `devac validate`
Run validators and refresh diagnostics.
```bash
devac validate
devac validate --type typescript
devac validate --type eslint
```

### `devac query`
Advanced diagnostic queries.
```bash
devac query "SELECT file_path, COUNT(*) as error_count FROM diagnostics WHERE severity = 'error' GROUP BY file_path ORDER BY error_count DESC LIMIT 10"
```

## Example Interactions

**User:** "What needs fixing in the codebase?"

**Response approach:**
1. Use `devac diagnostics` for overview
2. Highlight critical errors vs warnings
3. Suggest priority order for fixes

**User:** "Show me all TypeScript errors"

**Response approach:**
1. Use `devac diagnostics --severity error` filtered by type
2. Group by file for easier navigation
3. Show error messages with locations

**User:** "Which files have the most issues?"

**Response approach:**
1. Use `devac query` to aggregate diagnostics by file
2. Rank by issue count and severity
3. Recommend starting with highest-impact files

## Triage Strategy

### Priority Order
1. **Build-blocking errors** - Fix first (TypeScript errors preventing compilation)
2. **Test failures** - Fix second (broken tests block CI/CD)
3. **Security warnings** - Fix third (potential vulnerabilities)
4. **Type errors** - Fix fourth (type safety issues)
5. **Lint warnings** - Fix last (code style and best practices)

### Batch Fixes
When many similar issues exist:
- Group by error code/rule
- Fix systematically with search-and-replace patterns
- Consider ESLint auto-fix for applicable rules

## MCP Tools (Alternative)

If MCP server is configured, these tools provide equivalent functionality:

### `get_all_diagnostics`
Supports progressive disclosure via the `level` parameter:
```
# Fast: just get counts
get_all_diagnostics(level: "counts")
# Returns: { critical: 0, error: 3, warning: 2, suggestion: 0, note: 0, total: 5 }

# Medium: get summary grouped by source
get_all_diagnostics(level: "summary")
# Returns: [{ source: "tsc", count: 2 }, { source: "eslint", count: 3 }]

# Full: get all diagnostic records (default)
get_all_diagnostics(level: "details", severity: ["error"])
# Returns: full diagnostic records with file paths, messages, etc.
```

### `get_diagnostics_summary`
```
get_diagnostics_summary(groupBy: "source")
```

### `get_diagnostics_counts`
```
get_diagnostics_counts()
```

### `query_sql`
```sql
SELECT file_path, COUNT(*) as error_count
FROM diagnostics
WHERE severity = 'error'
GROUP BY file_path
ORDER BY error_count DESC
LIMIT 10
```

## Notes

- Diagnostics are refreshed when validators run
- Run `devac validate` to update diagnostics
- Some issues may be auto-fixable - look for --fix options
- Consider adding suppression comments for intentional violations
- CLI and MCP share the same devac-core implementation and return identical results
