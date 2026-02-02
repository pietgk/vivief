# Documentation Review Issues Report

> **Review Date:** 2026-02-02
> **Branch:** 241-devac-status-and-sync
> **Reviewer:** Claude Opus 4.5

---

## Executive Summary

Reviewed ~180 markdown files. Found **11 issues** requiring fixes:
- **Critical:** 2 (AI agent behavior would break)
- **High:** 4 (Incorrect information)
- **Medium:** 4 (Parameter mismatches)
- **Low:** 1 (Minor incompleteness)

---

## Issues Table

| # | File | Issue | Severity | Status |
|---|------|-------|----------|--------|
| 1 | CLAUDE.md | MCP tools use old naming convention | Critical | **Fixed** |
| 2 | CLAUDE.md | Missing devac-eval package | Medium | **Fixed** |
| 3 | plugins/devac/README.md | Missing 3 skills | High | **Fixed** |
| 4 | plugins/devac/README.md | Incorrect commands list | High | **Fixed** |
| 5 | plugins/devac/README.md | MCP tools use old names | High | **Fixed** |
| 6 | docs/mcp-server.md | query_effects parameters wrong | Medium | **Fixed** |
| 7 | docs/mcp-server.md | query_rules parameters wrong | Medium | **Fixed** |
| 8 | docs/mcp-server.md | query_c4 level options wrong | Medium | **Fixed** |
| 9 | docs/mcp-server.md | status tool parameters incomplete | Low | **Fixed** |
| 10 | docs/cli-reference.md | Generally accurate | N/A | OK |
| 11 | docs/adr/README.md | All 44 ADRs indexed correctly | N/A | OK |

---

## Detailed Issues

### Issue #1: CLAUDE.md MCP Tools Use Old Naming Convention (CRITICAL)

**Location:** `/CLAUDE.md` lines 429-437

**Problem:** The MCP Tools section lists 8 tools with pre-ADR-0042 names that don't match the implementation:

| Documented (Wrong) | Actual (Correct) |
|--------------------|------------------|
| `find_symbol` | `query_symbol` |
| `get_dependencies` | `query_deps` |
| `get_dependents` | `query_dependents` |
| `get_file_symbols` | `query_file` |
| `get_affected` | `query_affected` |
| `get_call_graph` | `query_call_graph` |
| `list_repos` | `query_repos` |
| - | (13 tools missing) |

**Impact:** AI agents calling these tools would get "Unknown tool" errors.

**Fix:** Replace the MCP Tools section with the correct 21 tools:
- Query tools: `query_symbol`, `query_deps`, `query_dependents`, `query_file`, `query_affected`, `query_call_graph`, `query_sql`, `query_schema`, `query_repos`, `query_context`, `query_effects`, `query_rules`, `query_rules_list`, `query_c4`
- Status tools: `status`, `status_diagnostics`, `status_diagnostics_summary`, `status_diagnostics_counts`, `status_all_diagnostics`, `status_all_diagnostics_summary`, `status_all_diagnostics_counts`

---

### Issue #2: CLAUDE.md Missing devac-eval Package (MEDIUM)

**Location:** `/CLAUDE.md` lines 11-24

**Problem:** Package structure diagram omits `devac-eval` package.

**Actual packages in `/packages/`:**
- devac-core
- devac-cli
- devac-mcp
- devac-worktree
- **devac-eval** (missing from docs)
- browser-core
- browser-cli
- browser-mcp

**Fix:** Add to package structure:
```
│   ├── devac-eval/    # Evaluation framework for testing analysis quality
```

---

### Issue #3: Plugin README Missing 3 Skills (HIGH)

**Location:** `/plugins/devac/README.md` lines 121-127

**Problem:** Skills table lists 7 skills, but 10 exist.

**Missing skills:**
- `diagnostics-fix` - Fix diagnostics errors
- `effects-architecture` - Document effects architecture
- `validate-architecture` - Validate architecture constraints

**Fix:** Add missing skills to the table.

---

### Issue #4: Plugin README Incorrect Commands List (HIGH)

**Location:** `/plugins/devac/README.md` lines 131-143

**Problems:**
1. Lists `/start-issue-on-new-worktree` which doesn't exist as a command file
2. Missing commands: `/plans`, `/setup`, `/validate-architecture`

**Actual command files (13):**
- commit.md
- devac-status.md
- draft-adr.md
- draft-changeset.md
- draft-commit.md
- issue.md
- **plans.md** (missing from README)
- prepare-commit.md
- prepare-pr.md
- **setup.md** (missing from README)
- ship.md
- start-issue.md
- **validate-architecture.md** (missing from README)

**Fix:** Remove `/start-issue-on-new-worktree`, add `/plans`, `/setup`, `/validate-architecture`.

---

### Issue #5: Plugin README MCP Tools Use Old Names (HIGH)

**Location:** `/plugins/devac/README.md` lines 203-211

**Problem:** MCP tool names don't match ADR-0042 conventions.

| Documented (Wrong) | Actual (Correct) |
|--------------------|------------------|
| `find_symbol` | `query_symbol` |
| `get_file_symbols` | `query_file` |
| `get_affected` | `query_affected` |
| `get_dependencies` | `query_deps` |
| `get_call_graph` | `query_call_graph` |
| `get_diagnostics_summary` | `status_diagnostics_summary` |
| `get_all_diagnostics` | `status_all_diagnostics` |
| `list_repos` | `query_repos` |

**Fix:** Update all tool names to match ADR-0042 naming convention.

---

### Issue #6: docs/mcp-server.md query_effects Parameters Wrong (MEDIUM)

**Location:** `/docs/mcp-server.md` lines 213-225

**Documented:**
```json
{
  "entityId": "...",
  "kind": "..."
}
```

**Actual (from tools/index.ts):**
```json
{
  "type": "FunctionCall|Store|Retrieve|Send|Request|Response",
  "file": "src/auth.ts",
  "entity": "repo:pkg:function:hash",
  "externalOnly": true,
  "asyncOnly": true,
  "limit": 100
}
```

**Fix:** Update parameter documentation to match implementation.

---

### Issue #7: docs/mcp-server.md query_rules Parameters Wrong (MEDIUM)

**Location:** `/docs/mcp-server.md` lines 229-243

**Documented:**
```json
{
  "ruleId": "...",
  "file": "..."
}
```

**Actual:**
```json
{
  "domain": "Payment|Auth|Database",
  "limit": 1000,
  "includeStats": true
}
```

**Fix:** Update parameter documentation to match implementation.

---

### Issue #8: docs/mcp-server.md query_c4 Level Options Wrong (MEDIUM)

**Location:** `/docs/mcp-server.md` lines 267-280

**Documented levels:** `"context"`, `"container"`, `"component"`, `"code"`

**Actual levels:** `"context"`, `"containers"`, `"domains"`, `"externals"`

**Also missing parameters:** `systemName`, `systemDescription`, `outputFormat`, `limit`

**Fix:** Update level options and add missing parameters.

---

### Issue #9: docs/mcp-server.md status Tool Parameters Incomplete (LOW)

**Location:** `/docs/mcp-server.md` lines 327-343

**Documented:** No parameters

**Actual parameters:**
- `path` (string)
- `level` ("summary" | "brief" | "full")
- `json` (boolean)
- `groupBy` ("type" | "repo" | "status")

**Fix:** Add parameter documentation.

---

## Verification Results

### Items Confirmed Correct

| Item | Status |
|------|--------|
| ADR Index (44 ADRs, 0001-0044) | ✓ Complete |
| ADR-0043 indexed | ✓ Present |
| Skills count (10) | ✓ Matches filesystem |
| Commands count (13) | ✓ Matches filesystem |
| MCP tools count (21) | ✓ Matches implementation |
| hooks.json commands | ✓ Valid commands |
| CLI v4.0 structure | ✓ Matches `devac --help` |
| docs/cli-reference.md | ✓ Comprehensive |

### TODOs/FIXMEs Found in Docs

Low priority items in spec/ and reviews/ directories:
- `docs/spec/phase-0-plan.md` - TBD in comment
- `docs/spec/prompts.md` - TODO about issue-context.md
- `docs/spec/ramblings.md` - TODO about issue-context.md
- `docs/reviews/consolidated-improvements.md` - TODO stub reference
- `docs/reviews/quality-review-claude.md` - TODO comments reference

These are in draft/archive content and don't affect users.

---

## Recommended Fix Priority

1. **Immediate (Critical):** Fix CLAUDE.md MCP tools section - AI agents would fail
2. **High Priority:** Fix plugin README (skills, commands, MCP tools)
3. **Medium Priority:** Fix docs/mcp-server.md parameter documentation
4. **Low Priority:** Add devac-eval to CLAUDE.md package structure

---

## Fixes Applied (2026-02-02)

All 9 issues have been fixed:

1. **CLAUDE.md** - Updated MCP tools section with all 21 tools using correct names (ADR-0042 compliant)
2. **CLAUDE.md** - Added devac-eval to package structure
3. **plugins/devac/README.md** - Added 3 missing skills (diagnostics-fix, effects-architecture, validate-architecture)
4. **plugins/devac/README.md** - Fixed commands list (removed non-existent, added missing)
5. **plugins/devac/README.md** - Updated MCP tool names to match ADR-0042
6. **docs/mcp-server.md** - Fixed query_effects parameters
7. **docs/mcp-server.md** - Fixed query_rules parameters
8. **docs/mcp-server.md** - Fixed query_c4 level options and parameters
9. **docs/mcp-server.md** - Added status tool parameters

## Next Steps

1. Consider adding automated docs validation to prevent future drift
2. Run `pnpm typecheck && pnpm lint` to verify no issues introduced
3. Commit changes with message: "docs: fix documentation drift from implementation"
