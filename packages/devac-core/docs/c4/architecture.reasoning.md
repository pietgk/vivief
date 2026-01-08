# Architecture Documentation Reasoning

> **Package:** @pietgk/devac-core
> **Date:** 2026-01-08
> **Purpose:** Audit trail for architecture documentation decisions

## Analysis Process

### 1. Source Code Analysis

**Files Analyzed:**
- `src/index.ts` - Main exports (521 lines)
- `src/*/index.ts` - Module barrel files
- Module structure across 15 top-level directories

**Queries Executed:**
```sql
-- Node distribution
SELECT kind, COUNT(*) as count FROM nodes GROUP BY kind ORDER BY count DESC

-- Edge distribution
SELECT edge_type, COUNT(*) as count FROM edges GROUP BY edge_type ORDER BY count DESC

-- External dependencies
SELECT module_specifier, COUNT(*) as count FROM external_refs GROUP BY module_specifier ORDER BY count DESC LIMIT 15
```

### 2. Module Discovery

**Identified Modules (15 containers):**

| Module | Directory | Purpose | Export Count |
|--------|-----------|---------|--------------|
| Types | `src/types/` | Core data types | 47 types |
| Storage | `src/storage/` | DuckDB/Parquet I/O | 57 exports |
| Analyzer | `src/analyzer/` | Analysis orchestration | 21 exports |
| Parsers | `src/parsers/` | Language parsers | 17 exports |
| Semantic | `src/semantic/` | Cross-file resolution | Full re-export |
| Config | `src/config/` | Configuration schemas | Full re-export |
| Watcher | `src/watcher/` | File watching | 12 exports |
| Hub | `src/hub/` | Federation | 21 exports |
| Context | `src/context/` | Repo discovery | 42 exports |
| Workspace | `src/workspace/` | Multi-repo mgmt | 96 exports |
| Validation | `src/validation/` | Code validation | 24 exports |
| Utils | `src/utils/` | Shared utilities | 29 exports |
| Rules | `src/rules/` | Effect classification | 12 exports |
| Views | `src/views/` | Visualization | 36 exports |
| Docs | `src/docs/` | Doc generation | 59 exports |
| Effects | `src/effects/` | Mapping loader | 4 exports |

### 3. Architecture Decisions

#### Layer Organization

**Decision:** Organize containers into 4 layers + cross-cutting concerns

**Rationale:**
1. **Analysis Layer** - Clear input processing pipeline (parse → resolve → orchestrate)
2. **Storage Layer** - Single responsibility for data persistence
3. **Federation Layer** - Multi-repo coordination is distinct concern
4. **Output Layer** - Transforms data into user-facing artifacts

**Evidence:**
- Import graph shows clear dependencies: Analyzer imports Parsers, Semantic
- Storage is used by most other modules
- Hub/Workspace/Context all deal with multi-repo concerns
- Rules/Views/Docs form output pipeline

#### Component Identification

**Decision:** Include major classes/functions as components, not all exports

**Rationale:**
- 521+ exports is too granular for C4 component level
- Focus on architecturally significant elements
- Generated `.c4` file can include all components for detailed views

**Criteria for inclusion:**
1. Named in module index exports
2. Has significant public API surface
3. Represents distinct responsibility
4. Referenced in documentation/ADRs

### 4. Relationship Identification

**Method:** Analyzed import statements in module indexes

**Key relationships identified:**

| From | To | Relationship | Evidence |
|------|----|--------------|----------|
| Analyzer | Parsers | CALLS | `import { TypeScriptParser } from "./parsers"` |
| Analyzer | Semantic | CALLS | `import { SemanticResolverFactory } from "./semantic"` |
| Analyzer | Storage | WRITES | `import { SeedWriter } from "./storage"` |
| Hub | Storage | QUERIES | `import { SeedReader } from "./storage"` |
| Workspace | Hub | USES | `import { CentralHub } from "./hub"` |
| Views | Rules | USES | Domain effects as input |
| Docs | Views | USES | C4 diagrams as input |

### 5. Data Gathering

**Code Graph Statistics (2026-01-08):**

```
Nodes: 3,359 total
  - function: 1,038
  - method: 757
  - interface: 625
  - type: 274
  - module: 263
  - property: 241
  - class: 139
  - other: 2

Edges: 15,273 total
  - CALLS: 12,167
  - CONTAINS: 3,072
  - EXTENDS: 30
  - PARAMETER_OF: 3
  - IMPLEMENTS: 1

External Refs: 2,898 total
```

### 6. Gaps and Uncertainties

#### Confirmed Gaps

1. **Effects table not in base seeds** - v3.0 feature still in development
2. **Python/C# resolvers** - Less mature than TypeScript resolver
3. **MCP hub location** - Known bug where MCP looks in `~/.devac` instead of workspace

#### Assumptions Made

1. **Two-pass timing** - Documented as <50ms structural, 50-200ms semantic; not verified
2. **Single Writer correctness** - Assumed IPC protocol is race-condition free
3. **Pyright/Roslyn availability** - Assumed optional dependencies may not be installed

#### Requires Verification

1. Cross-repo query performance at scale
2. Incremental update correctness for renames
3. Gap metric thresholds for acceptable drift

### 7. Documentation Sources

**Primary Sources:**
- Source code analysis (this session)
- Existing `architecture.md.backup`
- Existing `architecture.c4` (generated)
- `CLAUDE.md` project instructions

**Referenced ADRs:**
- ADR-0024: Hub Single Writer IPC Architecture

**Not Referenced (may exist):**
- ADR-0023: Developer-Maintained Effects Documentation
- Issue #115: Strategic C4 Architecture
- Issue #120: Improve C4 Pipeline via AI-Verified Rules

---

## Validation Checklist

- [x] Module structure matches source code
- [x] Container boundaries align with directory structure
- [x] Relationships verified against imports
- [x] Statistics queried from actual seeds
- [x] External systems identified
- [ ] Performance characteristics verified (assumed from docs)
- [ ] All ADRs cross-referenced
- [ ] Gap metrics calculated against generated C4

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2026-01-08 | Initial validated architecture | Claude |

---

*This reasoning document supports the architecture improvement loop. It should be updated when architectural changes are made or new evidence is gathered.*
