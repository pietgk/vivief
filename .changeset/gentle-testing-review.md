---
"@pietgk/devac-cli": minor
"@pietgk/devac-core": minor
"@pietgk/devac-mcp": patch
"@pietgk/devac-worktree": patch
---

Add cleanup diagnostics, interactive cleanup command, and comprehensive testing

### Features

- **Cleanup command**: New `devac cleanup` command with interactive menu for cleaning stale branches and worktrees
  - `--dry-run`: Preview what would be cleaned
  - `--branches`/`--worktrees`: Filter cleanup scope
  - `--json`: Structured output for scripting
  - `-y`/`--yes`: Skip interactive prompts
- **Status detection modules**: New detection capabilities in devac-core
  - Git detection: base branch, tracking, working dir, merge/rebase states
  - Seed detection: staleness detection with commit tracking
  - PR detection: PR merge readiness via GitHub CLI
  - Staleness detection: stale branch/worktree detection (30-day threshold)
- **Status cleanup flag**: Add `--cleanup` flag to `devac status` to show stale resources
- **Diagnostics-fix skill**: New plugin skill for automated error resolution workflow
- **Enhanced MCP tool descriptions**: Better LLM guidance for query_rules, query_c4 tools

### Bug Fixes

- Fix MCP tool name in diagnostic injection (`status_all_diagnostics` not `get_all_diagnostics`)
- Preserve schemaVersion when updating seed metadata (fixes verify command failures)
- Fix flaky verify test race condition with shared tempDir variable
- Add file sync before atomic rename to prevent flaky tests on macOS
- Consolidate duplicate git helpers into shared utils/git.ts
- Fix hub DB filename inconsistency (use `central.duckdb` consistently)
- Fix typo: `safeToDeletBranches` -> `safeToDeleteBranches`

### Documentation

- Add change-validate-fix loop documentation explaining automatic validation workflow
- Update ADR-0043 status from "Proposed" to "Accepted"
- Add validation pipeline section to CLAUDE.md
- Fix misleading hub location references (workspace-level, not user home)
- Fix documentation drift: update MCP tools section, plugin README, mcp-server.md
- Add effects coverage to change-validate-fix documentation

### Testing

- Add MCP tool tests for query_rules, query_rules_list, query_c4, query_effects, status_diagnostics_summary, status_diagnostics_counts (100% tool coverage)
- Add CLI command tests for effects, context, cleanup, doc-sync commands
- Add plugin validation tests for skills, commands, hooks, and manifests
- Add coverage thresholds to devac-cli, devac-mcp, devac-worktree packages
