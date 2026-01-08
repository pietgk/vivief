# Architecture Document Reasoning

> **For:** `architecture.md` in @pietgk/devac-core
> **Generated:** 2026-01-07
> **Purpose:** Audit trail for architecture document generation

## Overview

This document explains how `architecture.md` was created, what information sources were used, what inferences were made, and what gaps or uncertainties exist. This transparency enables:

1. **Reproducibility** - Future regeneration can follow the same methodology
2. **Validation** - Developers can verify claims against source code
3. **Improvement** - Gaps inform future enhancements to devac tooling and effect-domain-rules

---

## Information Gathering Process

### 1. DevAC MCP Queries Attempted

The following MCP tool calls were attempted but **failed** due to hub location bug:

```
mcp__plugin_devac_devac__query_sql
  - Query: SELECT DISTINCT kind, COUNT(*) as count FROM nodes WHERE repo_id LIKE '%devac-core%' GROUP BY kind
  - Result: FAILED - IO Error: No files found for seed paths
  - Error path: /Users/grop/ws/living-architecture/.devac/seed/... (wrong directory!)

mcp__plugin_devac_devac__get_file_symbols
  - Query: /Users/grop/ws/vivief/packages/devac-core/src/index.ts
  - Result: FAILED - Same seed path issue
```

**Root Cause:** MCP tools are looking in `~/.devac` or incorrectly cached paths instead of the workspace-level hub at `/Users/grop/ws/.devac/central.duckdb`.

**Bug Identified:** Multiple files still reference `~/.devac`:
- `packages/devac-mcp/src/index.ts:57` - fallback to `~/.devac`
- `packages/devac-cli/src/commands/hub-init.ts:29` - default `~/.devac`
- `packages/devac-worktree/src/*.ts` - issue context paths

### 2. DevAC CLI Queries - SUCCESSFUL

After MCP failed, switched to direct CLI queries which worked correctly:

```bash
# Hub status - confirms workspace hub is active
devac hub status
# Result: Hub has 11 repository(ies) with 86 package(s)

# Node kinds distribution
devac query "SELECT kind, COUNT(*)::INT as count FROM nodes WHERE file_path LIKE '%devac-core%' GROUP BY kind ORDER BY count DESC"
# Result: 741 total nodes (276 methods, 174 functions, 115 interfaces, ...)

# Edge types distribution
devac query "SELECT edge_type, COUNT(*)::INT as count FROM edges WHERE source_file_path LIKE '%devac-core%' GROUP BY edge_type ORDER BY count DESC"
# Result: 672 edges (668 CONTAINS, 4 EXTENDS)

# External refs resolution
devac query "SELECT is_resolved, COUNT(*)::INT as count FROM external_refs WHERE source_file_path LIKE '%devac-core%' GROUP BY is_resolved"
# Result: 619 unresolved

# Effects query - FAILED at repo level
devac query "SELECT effect_type, COUNT(*)::INT as count FROM effects WHERE source_file_path LIKE '%devac-core%' GROUP BY effect_type"
# Result: ERROR - Table with name effects does not exist (when run from repo root)

# Effects query - SUCCEEDED at package level
cd packages/devac-core && devac query "SELECT effect_type, COUNT(*)::INT as count FROM effects GROUP BY effect_type ORDER BY count DESC"
# Result: 6,102 FunctionCall effects found
```

**Key Finding:** CLI uses workspace hub correctly at `/Users/grop/ws/.devac/central.duckdb`.

**Effects View Behavior:** The effects view is only created at **package level**, not repo level. This is an architectural limitation documented in GitHub issue #121. When running queries from a package directory, effects are available; from repo root, the effects view doesn't exist.

### 3. DevAC Context Discovery

Successfully retrieved workspace context:

```
mcp__plugin_devac_devac__get_context
  - Result: Found vivief repo with hasSeeds: true at /Users/grop/ws/vivief

mcp__plugin_devac_devac__get_workspace_status
  - Result: Confirmed devac-core has seeds in "both" state (base + delta)
  - Package: @pietgk/devac-core
  - Seed state: both (base + delta present)
```

### 3. File System Exploration

Primary information source - direct file reading:

| File | Information Extracted |
|------|----------------------|
| `src/index.ts` | All public exports, module organization, ~490 lines of exports |
| `src/` directory listing | 18 modules: analyzer, config, context, docs, effects, hub, parsers, rules, semantic, storage, types, utils, validation, version, views, watcher, workspace |

### 4. Agent-Based Exploration

Launched an Explore agent to comprehensively analyze the codebase structure:

**Agent Prompt:**
> Explore the devac-core package to understand its architecture. Focus on main modules, key exports, inter-module dependencies, and overall purpose.

**Agent Findings (summarized):**
- 18 modules with clear separation of concerns
- Two-pass analysis architecture (structural → semantic)
- DuckDB + Parquet storage layer
- Federation via Central Hub
- Effects-based code behavior modeling
- Multi-language support (TS, Python, C#)

---

## Inferences Made

The following conclusions were **inferred** rather than directly extracted:

### 1. Performance Characteristics

**Inference:** "<50ms structural parsing, 50-200ms semantic resolution"

**Basis:** Comments in parser code and architectural documentation mention these targets, but actual measurements were not performed.

**Confidence:** ⚠️ Medium - Based on design intent, not runtime data

### 2. Two-Pass Architecture

**Inference:** Structural parsing is fully parallelizable; semantic resolution requires batching

**Basis:** Code comments mention parallelizability and the semantic resolvers use ts-morph which requires project context.

**Confidence:** ✓ High - Consistent with code structure

### 3. Hub Single Writer Pattern

**Inference:** MCP server owns hub exclusively when running

**Basis:** ADR-0024 reference in index.ts comments, HubClient and HubServer modules with IPC socket path.

**Confidence:** ✓ High - Documented in ADRs and visible in code

### 4. Compiler-Grade Semantic Resolution

**Inference:** Uses ts-morph for TypeScript, Pyright for Python, Roslyn for C#

**Basis:** Module names (typescript-semantic-resolver.ts, python-semantic-resolver.ts, csharp-semantic-resolver.ts) and import statements.

**Confidence:** ⚠️ Medium for Python/C# - TypeScript resolver is clearly ts-morph based, but Python and C# implementations may be less complete

---

## Gaps in Information

### Gap 1: Actual Code Graph Data ✓ PARTIALLY RESOLVED

**What's available:**
- 741 nodes (276 methods, 174 functions, 115 interfaces, etc.)
- 672 edges (668 CONTAINS, 4 EXTENDS)
- 619 unresolved external refs
- 6,102 FunctionCall effects (at package level)

**What worked:** CLI queries successfully retrieved code graph data. MCP queries failed due to stale `~/.devac` references.

**Remaining gap:** MCP tools still don't work - tracked in GitHub issue #121

**Impact:** Architecture diagrams now include actual code graph statistics, though MCP-based tooling needs fixes for full automation

### Gap 2: Effect Extraction Details ✓ RESOLVED

**What's available:** 6,102 FunctionCall effects extracted from devac-core

**Discovery:** Effects ARE available when querying from the package directory. The initial "table doesn't exist" error occurred because the effects view is only created at package level, not repo level.

**Remaining gap:** package-effects.md for devac-core shows mostly "external" patterns (zod, path, fs) rather than domain-specific effects. The raw effects exist but domain classification via effect-domain-rules could be improved.

**Status:** GitHub issue #121 tracks the effects view scope limitation

### Gap 3: Call Graph Information

**What's missing:** Actual call relationships between modules

**Why:** `get_call_graph` requires working hub

**Impact:** Module dependency diagram is inferred from imports rather than actual call patterns

**Mitigation:** Use `devac query` or MCP tools after hub registration

### Gap 4: Cross-Reference Resolution Status ✓ RESOLVED

**What's available:** 619 unresolved external refs in devac-core

**Discovery:** CLI query successfully retrieved external_refs data from the workspace hub.

**Analysis needed:** The high unresolved count (619) suggests room for improvement in semantic resolution or that many refs are to external packages (npm dependencies) which are expected to be unresolved.

**Status:** Data is available; interpretation requires deeper analysis of what refs are unresolved and why

---

## Assumptions Made

1. **Directory structure reflects module boundaries** - Each subdirectory in `src/` is treated as a distinct module/container

2. **index.ts exports represent public API** - Internal implementation details not exported are not documented

3. **Comments and docstrings are accurate** - Module-level documentation in index.ts was trusted

4. **ADR references are current** - Referenced ADRs (0023, 0024) are assumed to be implemented as documented

5. **Version numbers are current** - Package version 0.18.0 from exploration is used

---

## Verification Checklist

For developer validation of architecture.md:

- [ ] **Entity ID format** - Verify `{repo}:{packagePath}:{kind}:{scopeHash}` is accurate
- [x] **Node kinds count** - Queried: 741 nodes across multiple kinds (method, function, interface, etc.)
- [x] **Edge types count** - Queried: 672 edges (668 CONTAINS, 4 EXTENDS)
- [x] **Effect types** - Queried: 6,102 FunctionCall effects at package level
- [ ] **Two-pass timing** - Validate <50ms structural, 50-200ms semantic claims
- [ ] **Hub IPC** - Confirm Single Writer pattern works as described
- [ ] **Module dependencies** - Verify the dependency graph matches actual imports
- [ ] **Technology stack** - Confirm all technologies listed are actually used

**Note:** Several items verified via CLI queries. MCP verification pending fix for issue #121.

---

## Recommendations for Improvement

### Immediate Actions

1. **Fix MCP hub discovery (GitHub #121):**
   - Ensure devac-mcp uses devac-core's shared `getWorkspaceHubDir()` function
   - Remove stale `~/.devac` fallback references
   - Enable effects view at repo level, not just package level

2. ~~**Register vivief with hub**~~ ✓ DONE - Hub already registered with 11 repos, 86 packages

3. ~~**Query nodes/edges/effects counts**~~ ✓ DONE - CLI queries successful, data incorporated

### Future Enhancements

1. **Add automated metrics to architecture.md:**
   - Total nodes/edges/effects counts
   - Coverage of semantic resolution
   - Rules engine match statistics

2. **Include actual C4 diagram generation:**
   - Compare this architecture.md against `devac c4` output
   - Document gaps for effect-domain-rules improvement

3. **Add performance benchmarks:**
   - Actual timing data from analysis runs
   - Memory usage statistics

---

## Query Templates for Future Regeneration

When hub is properly configured, use these queries:

```sql
-- Node kinds distribution
SELECT kind, COUNT(*)::INT as count
FROM nodes
WHERE file_path LIKE '%devac-core%'
GROUP BY kind
ORDER BY count DESC;

-- Edge types distribution
SELECT edge_type, COUNT(*)::INT as count
FROM edges
WHERE source_file_path LIKE '%devac-core%'
GROUP BY edge_type
ORDER BY count DESC;

-- Effects by type
SELECT effect_type, COUNT(*)::INT as count
FROM effects
WHERE source_file_path LIKE '%devac-core%'
GROUP BY effect_type
ORDER BY count DESC;

-- External refs resolution status
SELECT is_resolved, COUNT(*)::INT as count
FROM external_refs
WHERE source_file_path LIKE '%devac-core%'
GROUP BY is_resolved;
```

---

*This reasoning document accompanies architecture.md and should be updated when the architecture document is regenerated.*
