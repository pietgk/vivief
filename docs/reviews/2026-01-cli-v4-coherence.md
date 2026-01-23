# DevAC CLI v4.0 Coherence Assessment

> Date: 2026-01-21
> Status: Complete
> Branch: cli-three-command-reorganization

## Summary

This document captures the coherence assessment of the DevAC system after the CLI v4.0 reorganization into three core commands.

## CLI v4.0 Command Structure

The CLI has been reorganized into three primary commands:

| Command | Purpose | Subcommands/Options |
|---------|---------|---------------------|
| `devac sync` | Analyze packages, register repos, validate | `--validate`, `--watch`, `--force`, `--ci`, `--issues` |
| `devac status` | Unified view of context, health, diagnostics | `--diagnostics`, `--doctor`, `--seeds`, `--hub`, `--changeset` |
| `devac query` | Query the code graph | `sql`, `symbol`, `deps`, `dependents`, `affected`, `repos`, etc. |

### Command Implementation Locations

- `devac sync` - `packages/devac-cli/src/commands/sync.ts`
- `devac status` - `packages/devac-cli/src/commands/status.ts`
- `devac query` - `packages/devac-cli/src/commands/query/*.ts`

## Component Alignment Assessment

| Component | Status | Notes |
|-----------|--------|-------|
| CLI v4.0 Commands | ✅ Complete | sync, status, query properly implemented |
| Effects System | ✅ Working | MCP tools available, CLI effects commands exist |
| C4 Generation | ✅ Working | Via MCP `query_c4` and CLI `doc-sync` |
| Diagnostics | ✅ Working | Unified model across validators/CI/issues |
| MCP Tools | ✅ Aligned | 25 tools matching CLI functionality |
| Four Pillars | ✅ Fixed | Updated from "Three Pillars" terminology |

## MCP-CLI Alignment

| MCP Tool | CLI Command | Status |
|----------|-------------|--------|
| `query_symbol` | `devac query symbol` | ✅ Aligned |
| `query_deps` | `devac query deps` | ✅ Aligned |
| `query_affected` | `devac query affected` | ✅ Aligned |
| `query_sql` | `devac query sql` | ✅ Aligned |
| `query_c4` | `devac c4` / `devac doc-sync` | ✅ Aligned |
| `status` | `devac status` | ✅ Aligned |
| `status_diagnostics` | `devac diagnostics` | ✅ Aligned |
| `find_symbol` | `devac query symbol` | ✅ Aligned |
| `get_dependencies` | `devac query deps` | ✅ Aligned |
| `get_dependents` | `devac query dependents` | ✅ Aligned |
| `get_file_symbols` | `devac file-symbols` | ✅ Aligned |
| `get_call_graph` | `devac call-graph` | ✅ Aligned |
| `list_repos` | `devac query repos` | ✅ Aligned |
| `get_all_diagnostics` | `devac diagnostics` | ✅ Aligned |
| `get_diagnostics_summary` | `devac diagnostics --format summary` | ✅ Aligned |
| `get_diagnostics_counts` | `devac status` (embedded) | ✅ Aligned |

## Terminology Updates Applied

Updated 14 references in 8 files from "Three Pillars" to "Four Pillars":

| File | Lines Updated |
|------|---------------|
| `packages/devac-cli/src/commands/diagnostics.ts` | Line 6 |
| `packages/devac-cli/src/commands/status.ts` | Line 11 |
| `docs/cli-reference.md` | Line 169 |
| `docs/adr/0015-conceptual-foundation.md` | Lines 39, 89 |
| `docs/adr/0016-workspace-module.md` | Lines 49, 151 |
| `docs/adr/0017-validation-hub-cache.md` | Lines 14, 135 |
| `docs/adr/0018-unified-diagnostics-model.md` | Lines 11, 255 |
| `docs/adr/0019-coverage-validator.md` | Lines 11, 236 |

## Four Pillars Model

The DevAC conceptual model is now based on Four Pillars:

1. **Infra** - DevAC Health (hub, watch, mcp)
2. **Extractors** - Seeds (code graph data in Parquet)
3. **Validators** - Diagnostics (tsc, eslint, test, coverage)
4. **Effects** - Code effects and domain mappings

## Verification

All changes verified with:
- `pnpm typecheck` - No type errors
- `pnpm lint` - No lint issues

## Related Documentation

- [CLI Reference](../cli-reference.md) - Complete command reference
- [ADR-0015: Conceptual Foundation](../adr/0015-conceptual-foundation.md) - Effect Handler Pattern
- [vivief Workflow Guide](../vivief-workflow.md) - Development workflow
