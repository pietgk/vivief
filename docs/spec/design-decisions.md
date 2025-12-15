# Design Decisions

This document captures the key architectural decisions made during DevAC v2 development and their rationale.

## Decision Log

### D1: Replace Neo4j with DuckDB + Parquet

**Date:** December 2024  
**Status:** Accepted

**Context:**
The v1.x architecture used Neo4j as the central database. During v1.11 development, a `NodeIndexCache` was introduced - an in-memory cache duplicating all nodes from Neo4j. This highlighted a fundamental issue: Neo4j optimizes for graph traversal but has poor point-lookup performance.

**Options Considered:**
1. Keep Neo4j + add PostgreSQL for point lookups
2. Replace Neo4j with DuckDB + Parquet (file-based)
3. Replace Neo4j with SQLite

**Decision:** Option 2 - DuckDB + Parquet

**Rationale:**
- Source code is truth - everything else is derived and regenerable
- No data duplication - query Parquet files directly
- Single technology stack - DuckDB everywhere
- Enables federation - each package owns its seeds

**Consequences:**
- Major architectural change from v1.x
- Graph queries use recursive CTEs instead of Cypher
- No real-time cross-repo sync (acceptable trade-off)

---

### D2: Per-Package-Per-Branch Partitioning

**Date:** December 2024  
**Status:** Accepted

**Context:**
The original v2.0 proposal used per-source-file partitioning (one Parquet file per source file). Review flagged this as HIGH RISK due to file count explosion.

**Options Considered:**
1. Per-file partitioning (3 files × N source files)
2. Single package file (monolithic)
3. Per-package with base/branch delta storage

**Decision:** Option 3 - Per-package with delta storage

**Rationale:**
- File count: 6 files max vs potentially 15,000+
- Query performance: DuckDB handles single files better than 10K+ file globs
- Incremental: Content-hash based change detection still achieves <500ms updates
- Branch support: Delta storage enables efficient feature branch handling

**Consequences:**
- Single file change rewrites entire package Parquet
- Acceptable: ~150-300ms for typical packages
- Base branch edits slower than feature branch (300-500ms vs 150-300ms)

---

### D3: Entity IDs Use Scoped Names (Not Line Numbers)

**Date:** December 2024  
**Status:** Accepted

**Context:**
Entity IDs need to be stable across code changes. Line-number-based IDs would change whenever code is added above a function.

**Options Considered:**
1. Line-number based: `repo:pkg:function:file:line`
2. Scoped-name based: `repo:pkg:function:hash(file+scopedName+kind)`
3. UUID per symbol

**Decision:** Option 2 - Scoped names with hash

**Rationale:**
- Code above function changes → entity_id STABLE
- Merge/rebase shifts lines → entity_id STABLE
- Same code on different branches → SAME entity_id
- Deterministic: same input always produces same ID

**Scoped Name Examples:**
- Top-level function: `handleLogin`
- Class method: `AuthService.login`
- Nested function: `processUser.validate`
- Callback: `users.map.$arg0`

**Consequences:**
- Branch is NOT part of entity_id
- Storage uses composite key: `(entity_id, branch)`

---

### D4: Atomic Write Pattern

**Date:** December 2024  
**Status:** Accepted

**Context:**
Parquet files cannot be incrementally updated (metadata is at end of file). Interrupted writes can leave corrupt files.

**Decision:** Temp file + atomic rename + fsync

**Implementation:**
1. Write to `.parquet.tmp`
2. `fs.rename()` (POSIX atomic)
3. `fsync()` directory for durability

**Rationale:**
- Either old or new file exists, never corrupt
- Industry standard pattern (npm write-file-atomic)
- Works on macOS/Linux

**Consequences:**
- Windows may need retry logic (EBUSY errors)
- Windows support deferred to Phase 4+

---

### D5: Two-Pass Parsing Architecture

**Date:** December 2024  
**Status:** Accepted (preserved from v1.x)

**Context:**
Code analysis requires two types of information:
1. Structural: What symbols exist in each file
2. Semantic: How symbols relate across files

**Decision:** Keep two-pass architecture from v1.x

**Pass 1 (Structural):**
- Per-file, parallelizable
- Fast: <50ms per TypeScript file
- Extracts: nodes, edges, external_refs (unresolved)

**Pass 2 (Semantic):**
- Cross-file, batched
- Resolves imports to target entity_ids
- Updates external_refs with resolution info

**Rationale:**
- Proven pattern from v1.x
- Enables parallel parsing
- Separates fast path from expensive resolution

---

### D6: Python Parser via Subprocess

**Date:** December 2024  
**Status:** Accepted with known trade-offs

**Context:**
Need to parse Python files. Options include tree-sitter, WASM, or native Python.

**Options Considered:**
1. tree-sitter-python (fast, no semantic info)
2. Python subprocess with `ast` module (accurate, slow)
3. WASM Python interpreter (moderate)
4. Long-running Python worker pool (fast after warmup)

**Decision:** Option 2 for now, Option 4 as future optimization

**Rationale:**
- Native `ast` module is most accurate
- 200-500ms latency is acceptable for Phase 3
- Optimize later if profiling shows need

**Consequences:**
- Python parsing slower than TypeScript
- Warm worker pool can be added in future

---

### D7: Federation via Central Hub

**Date:** December 2024  
**Status:** Accepted

**Context:**
Need to query across multiple repositories without copying data.

**Decision:** Three-layer federation model

**Layers:**
1. **Package Seeds** - Ground truth, per-package Parquet files
2. **Repository Manifest** - Index of packages in repo
3. **Central Hub** - Registry + computed cross-repo edges

**Key Insight:** Hub stores only computed data, NOT raw nodes/edges. Queries go directly to Parquet files.

**Rationale:**
- No data duplication
- Each repo is self-contained
- Cross-repo queries use DuckDB glob patterns

**Consequences:**
- No real-time cross-repo sync
- Manual `devac hub refresh` needed after changes

---

### D8: Content-Hash Based Incremental Updates

**Date:** December 2024  
**Status:** Accepted

**Context:**
Need fast incremental updates when files change. File watcher may miss events.

**Decision:** SHA-256 content hashing with stored hashes

**Flow:**
1. Compute current file hashes (~20ms)
2. Compare with stored hashes (in nodes.parquet)
3. Parse only changed files
4. Merge into package Parquet

**Rationale:**
- Hash check catches ALL changes, even if watcher missed
- ~20-50ms when nothing changed
- ~150-300ms for single file change

**Consequences:**
- Hash comparison is reliable backup for watcher
- Works after IDE restart, git checkout, etc.

---

### D9: Windows Support Deferred

**Date:** December 2024  
**Status:** Accepted

**Context:**
Windows file locking prevents atomic rename when files are open.

**Decision:** Defer Windows support to Phase 4+

**Rationale:**
- macOS/Linux work reliably
- WSL works on Windows
- Windows retry logic can be added later

**Workaround for Windows users:**
- Use WSL (Windows Subsystem for Linux)
- Wait for Phase 4+ implementation

---

### D10: Recursive CTE Depth Limit

**Date:** December 2024  
**Status:** Accepted

**Context:**
Recursive CTEs for call graph traversal degrade exponentially at depth >6.

**Decision:** Cap depth at 6 for interactive queries

**Performance:**
- Depth 1-2: ~50ms
- Depth 3-4: ~200-500ms
- Depth 5-6: ~1-5s (acceptable)
- Depth 7+: May timeout

**Rationale:**
- 6 hops covers most practical use cases
- Deeper queries can use batch mode
- Future: Pre-compute transitive closure

---

## Research Documents

The following documents contain detailed analysis supporting these decisions:

| Document | Topic |
|----------|-------|
| `devac-spec-v2.0-branch-partitioning-research.md` | Per-package vs per-file partitioning |
| `devac-spec-v2.0-entity-id-lifecycle-analysis.md` | Entity ID stability across scenarios |
| `devac-spec-v2.0-storage-design-decisions.md` | DuckDB/Parquet configuration |
| `devac-spec-v2.0-review-recap.md` | Consolidated review feedback |

---

## Future Considerations

### Potential Optimizations
- Python warm worker pool for faster parsing
- Pre-computed transitive closure for deep call graphs
- Chunked Parquet for large packages
- Background async base branch updates

### Deferred Features
- Windows native support (using retry logic)
- Real-time cross-repo sync
- External dependency resolution (npm/pypi)
- Distributed hub (shared across team)
