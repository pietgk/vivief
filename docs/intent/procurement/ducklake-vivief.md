# DuckLake × Vivief: Where Two Versioning Worlds Collide

*A brainstorm on conflicts, overlaps, and elegantly crazy combinations*

---

## The Current Architecture (What We Have)

```
GitHub Repo (e.g., mindler-mobile)
├── src/                           ← source code (git versioned)
├── .devac/
│   └── packages/
│       └── auth-module/
│           ├── nodes.parquet      ← AST nodes (regenerated from source)
│           ├── edges.parquet      ← relationships (regenerated)
│           ├── external_refs.parquet  ← cross-package refs (regenerated)
│           └── effects.parquet    ← Vision-View-Effects (regenerated)

Hub (local DuckDB)
├── repo_registry                  ← which repos are registered
├── cross_repo_edges               ← computed from external_refs across repos
└── federated queries via read_parquet() glob patterns
```

Key properties:
- **Seeds are deterministic** — regenerated from source, not incrementally updated
- **Git is the version system** — branches, commits, PRs version both code AND seeds
- **Hub is read-mostly** — only cross_repo_edges are computed/stored centrally
- **Per-package partitioning** — max 6 Parquet files per package (ADR-0002)
- **Atomic writes** — temp file + rename + fsync (ADR-0004)
- **Single writer** — DuckDB constraint managed via IPC (ADR-0024)

---

## The Tension Map

### Where Git and DuckLake Overlap

| Capability | Git Provides | DuckLake Provides |
|-----------|-------------|-------------------|
| **Version history** | Full commit history of seed files | Snapshot history with IDs and timestamps |
| **Branching** | Feature branches, PR branches | N/A (but Nessie adds this to Iceberg) |
| **Diff/compare** | `git diff` on binary Parquet (useless) vs commit-level "these files changed" | `VERSION AS OF` queries — actual data-level time travel |
| **Rollback** | `git checkout <commit>` restores old seeds | `VERSION AS OF <snapshot>` queries old data without restoring |
| **Schema tracking** | Implicit — schema lives in the Parquet file, changes visible only if you read both versions | Explicit — `ducklake_column` tracks schema changes with begin/end snapshots |
| **Atomic multi-file updates** | Git commit is atomic across all files | DuckLake snapshot is atomic across all tables |
| **Provenance** | Commit message, author, timestamp | Snapshot metadata: author, commit_message, changes_made |

### Where They Conflict

**1. Storage location**: Git wants seeds in the repo. DuckLake wants Parquet on blob storage with metadata in a SQL DB. You can't serve both masters — the seed files are either git-tracked files or DuckLake-managed files.

**2. Regeneration vs. mutation**: Seeds are regenerated from source. DuckLake's strengths (incremental updates, data inlining, compaction) are designed for data that's mutated, not regenerated. If you always rewrite the entire file, DuckLake's snapshot mechanism is overhead compared to a git commit.

**3. Per-package vs. per-table**: Seeds are per-package Parquet files (auth-module/nodes.parquet). DuckLake thinks in tables (one `nodes` table containing all packages). These are fundamentally different data models.

**4. Decentralized vs. centralized**: Seeds live distributed across repos. DuckLake centralizes metadata in a catalog DB. The hub's current design is deliberately lightweight — it reads from repos, it doesn't own the data.

### Where They're Complementary

**1. Git versions FILES, DuckLake versions DATA**: Git can tell you "nodes.parquet changed in commit abc123." DuckLake can tell you "these specific rows were added/removed/modified between snapshot 5 and snapshot 6." One is file-level, the other is row-level.

**2. Git branches are code contexts, DuckLake snapshots are data contexts**: A feature branch represents "what if we refactored auth?" — the seeds in that branch reflect that hypothetical. A DuckLake snapshot represents "what did the data look like at this point in time?" These are different questions.

**3. Seeds are source-of-truth for per-package data, DuckLake is natural for derived/computed data**: The hub's cross_repo_edges, aggregated metrics, embeddings, search indexes — these aren't deterministic from any single source file. They're computed, evolving, and benefit from versioning independently of git.

---

## The Brainstorm: Elegantly Crazy Ideas

### Idea 1: "Git Seeds, DuckLake Hub"

**Keep seeds in git. Move the hub to DuckLake.**

The seeds remain per-package Parquet files in GitHub repos — regenerated, git-versioned, simple. But the **hub** — which currently is a bare DuckDB with cross_repo_edges — becomes a DuckLake instance.

```
GitHub Repos (unchanged)
├── .devac/packages/*/nodes.parquet     ← git-versioned seeds
├── .devac/packages/*/edges.parquet
├── .devac/packages/*/external_refs.parquet
└── .devac/packages/*/effects.parquet

DuckLake Hub (new)
├── Catalog DB: PostgreSQL (or local DuckDB for dev)
├── Data: Parquet on local disk or S3
│
├── Tables (materialized from seeds):
│   ├── all_nodes          ← UNION of all nodes.parquet across repos
│   ├── all_edges          ← UNION of all edges.parquet across repos
│   ├── all_external_refs  ← UNION of all external_refs
│   ├── all_effects        ← UNION of all effects
│   ├── cross_repo_edges   ← computed from refs (already exists)
│   ├── node_embeddings    ← FLOAT[384] per node (NEW)
│   ├── effect_embeddings  ← FLOAT[384] per effect (NEW)
│   └── search_metadata    ← FTS-ready text from nodes (NEW)
```

**Why this is elegant:**
- Seeds stay simple — regenerated, git-tracked, per-package, no new dependencies
- Hub gains DuckLake superpowers: time travel, schema evolution, multi-table transactions
- Embeddings and search indexes live in the hub (computed, not from source)
- The "materialize seeds into hub" step is a periodic sync — like `devac hub rebuild` but into DuckLake
- Each rebuild creates a new DuckLake snapshot → you get time travel over your entire code intelligence state
- Multiple DuckDB instances can query the hub concurrently (multiplayer DuckDB via DuckLake)

**What you lose:** Simplicity. The hub goes from "a DuckDB file" to "a DuckLake instance with a catalog DB."

---

### Idea 2: "Snapshot-per-Commit"

**Map git commits to DuckLake snapshots.**

When `devac analyze` regenerates seeds from source (triggered by a git commit), it doesn't just write Parquet files to the repo — it also pushes the data into a DuckLake instance, creating a snapshot tagged with the git commit SHA.

```sql
-- After extraction from commit abc123
INSERT INTO ducklake.all_nodes SELECT * FROM read_parquet('.devac/packages/*/nodes.parquet');
-- This creates DuckLake snapshot N

-- Tag it with the git commit
CALL ducklake.create_tag('all_nodes', 'commit:abc123');

-- Later: "What did the code graph look like at commit abc123?"
SELECT * FROM ducklake.all_nodes VERSION AS OF 'commit:abc123';

-- Even crazier: diff two commits at the DATA level
SELECT 'added' as change, n.* FROM ducklake.all_nodes VERSION AS OF 'commit:def456' n
WHERE n.id NOT IN (SELECT id FROM ducklake.all_nodes VERSION AS OF 'commit:abc123')
UNION ALL
SELECT 'removed', n.* FROM ducklake.all_nodes VERSION AS OF 'commit:abc123' n
WHERE n.id NOT IN (SELECT id FROM ducklake.all_nodes VERSION AS OF 'commit:def456');
```

**Why this is elegant:**
- Git tells you "files changed." DuckLake tells you "these 47 functions were added, 12 were removed, 3 changed signatures."
- PR review becomes data-aware: "This PR adds 3 new external dependencies and removes 2 effects."
- Architectural drift detection: compare snapshots across weeks/months to find creeping complexity.
- You could build `devac diff commit1..commit2` that shows structural changes, not file changes.

**The conflict:** Do you keep seeds in git AND in DuckLake? That's dual-write. Or do you drop seeds from git and go DuckLake-only? That breaks the "seeds live with the code" principle.

**Resolution:** Seeds in git remain the source of truth. DuckLake is a materialized, queryable projection. If DuckLake is lost, re-extract from git. Seeds in git are recovery insurance — exactly the DuckLake weakness we identified (can't reconstruct metadata from Parquet alone).

---

### Idea 3: "Branch-Aware Code Intelligence"

**Use DuckLake snapshots to represent git branches simultaneously.**

Currently, if you want to query the code graph of a feature branch, you'd need to check out that branch, run `devac analyze`, and query locally. With DuckLake, you could maintain snapshots for multiple branches simultaneously:

```sql
-- Main branch seeds extracted at 10:00
-- Creates snapshot 42, tagged 'branch:main'

-- Feature branch 'refactor-auth' extracted at 10:05
-- Creates snapshot 43, tagged 'branch:refactor-auth'

-- Query: "What effects exist in refactor-auth that don't exist in main?"
SELECT e.* 
FROM all_effects VERSION AS OF 'branch:refactor-auth' e
WHERE e.effect_type NOT IN (
    SELECT effect_type FROM all_effects VERSION AS OF 'branch:main'
);

-- Query: "Show me all nodes that changed between branches"
-- This is a CODE REVIEW tool — structural diff, not textual diff
```

**Why this is elegant:**
- CI could extract seeds for every PR branch and push to DuckLake
- PR reviews get structural analysis: "This PR introduces 5 new Vision states and 3 new Effects"
- Branch comparison becomes a SQL query, not a file diff
- Multiple developers can query different branches simultaneously without checking them out

**The crazy extension:** Combine this with embeddings. When a PR creates new nodes, auto-embed them and find semantically similar existing code: "This new function is 94% similar to `existing_auth_handler` in package X — is this duplication?"

---

### Idea 4: "DuckLake for the Derived Layer Only"

**The minimal, most pragmatic option.**

Seeds stay exactly as they are — git, Parquet, per-package, regenerated. But everything DERIVED goes into DuckLake:

```
Seeds (git, unchanged):
  nodes, edges, external_refs, effects → per-package Parquet in repos

Derived Layer (DuckLake, new):
  ┌─────────────────────────────────────────────────────────────────┐
  │  cross_repo_edges      ← computed from external_refs            │
  │  node_embeddings       ← FLOAT[384] from code2vec/codebert     │
  │  effect_embeddings     ← FLOAT[384] from effect descriptions    │
  │  architectural_metrics ← computed aggregations per package      │
  │  dependency_graph      ← resolved cross-package dependencies    │
  │  change_frequency      ← how often each node changes (git log)  │
  │  complexity_trends     ← complexity metrics over time           │
  │  otel_traces           ← runtime spans (future)                 │
  │  security_findings     ← CPG analysis results (future)         │
  │  documentation_links   ← effect → doc mappings                 │
  └─────────────────────────────────────────────────────────────────┘
```

**Why this is elegant:**
- Zero disruption to existing architecture
- Derived data naturally benefits from DuckLake: it's not regenerated from one source, it evolves, it needs versioning independent of git, multiple processes may write to it
- The hub's single-writer constraint (ADR-0024) is solved by DuckLake's multiplayer support
- OTel traces (future) are a natural DuckLake use case — append-only, needs compaction, needs expiration
- Embeddings are expensive to compute — DuckLake versioning means you don't recompute when unchanged

**This also naturally solves the hub's IPC problem**: ADR-0024 exists because DuckDB is single-writer. If the hub becomes DuckLake-backed with PostgreSQL catalog, multiple DuckDB instances (MCP server, CLI, CI pipeline) can all read and write concurrently. No more Unix socket IPC.

---

### Idea 5: "Semantic Code Search over DuckLake"

**Build a code search engine using FTS + VSS on the DuckLake hub.**

With node embeddings and effect descriptions in DuckLake, you can build hybrid search:

```sql
-- FTS: keyword search over function names and effect descriptions
PRAGMA create_fts_index('all_nodes', 'id', 'name', 'file_path', stemmer := 'english');
PRAGMA create_fts_index('all_effects', 'id', 'description', 'effect_type');

-- "Find all authentication-related code"
-- Hybrid: BM25 keyword match + semantic embedding similarity
WITH
  keyword_hits AS (
      SELECT id, fts_main_all_nodes.match_bm25(id, 'authentication login session') AS bm25
      FROM all_nodes WHERE bm25 IS NOT NULL
  ),
  semantic_hits AS (
      SELECT id, array_cosine_similarity(embedding, ?::FLOAT[384]) AS cosine
      FROM node_embeddings
      ORDER BY cosine DESC LIMIT 100
  )
SELECT n.id, n.name, n.file_path, n.package,
       0.3 * COALESCE(k.bm25, 0) + 0.7 * COALESCE(s.cosine, 0) AS relevance
FROM all_nodes n
LEFT JOIN keyword_hits k USING (id)
LEFT JOIN semantic_hits s USING (id)
WHERE k.id IS NOT NULL OR s.id IS NOT NULL
ORDER BY relevance DESC LIMIT 20;

-- "Find effects similar to this one I'm implementing"
SELECT e.effect_type, e.description, e.package,
       array_cosine_similarity(emb.embedding, ?::FLOAT[384]) AS similarity
FROM all_effects e
JOIN effect_embeddings emb USING (id)
ORDER BY similarity DESC LIMIT 10;
```

**Why this is elegant:**
- Natural language code search across your entire codebase
- "Find me all code that does something like X" — semantic, not grep
- Effect discovery: "What existing effects are similar to what I need?"
- Duplication detection: find semantically similar nodes across packages
- Onboarding tool: new developer searches "how does payment work?" and gets ranked nodes + effects

**MCP integration:** Your MCP server could expose this as a tool. An LLM asks "find authentication-related effects" and gets a ranked, semantically-aware result set from the DuckLake hub.

---

### Idea 6: "Architectural Drift Detection with Time Travel"

**Use DuckLake snapshots to detect architectural erosion over time.**

If you snapshot the hub periodically (daily/weekly), you build a time series of your architecture:

```sql
-- How has cross-package coupling evolved?
SELECT snapshot_time, COUNT(*) as cross_package_edges
FROM cross_repo_edges VERSION AS OF generate_series(1, current_snapshot)
GROUP BY snapshot_time
ORDER BY snapshot_time;

-- Which packages are growing the fastest in complexity?
SELECT package, 
       v1.node_count AS nodes_3_months_ago,
       v2.node_count AS nodes_now,
       v2.node_count - v1.node_count AS growth
FROM architectural_metrics VERSION AS OF 'tag:2025-11-01' v1
JOIN architectural_metrics VERSION AS OF 'tag:2026-02-01' v2 USING (package)
ORDER BY growth DESC;

-- Effect proliferation: are we creating too many effect types?
SELECT effect_type,
       MIN(snapshot_id) AS first_appeared,
       COUNT(DISTINCT package) AS packages_using
FROM all_effects
GROUP BY effect_type
ORDER BY first_appeared DESC;

-- Embedding drift: which parts of the codebase changed semantically?
-- (even if the function names didn't change)
SELECT n.name, n.package,
       array_cosine_similarity(e_old.embedding, e_new.embedding) AS semantic_stability
FROM all_nodes n
JOIN node_embeddings VERSION AS OF 'tag:v1.0' e_old USING (id)
JOIN node_embeddings VERSION AS OF 'tag:v2.0' e_new USING (id)
WHERE semantic_stability < 0.9  -- semantically drifted
ORDER BY semantic_stability ASC;
```

**Why this is elegant:**
- Architecture decisions are validated by data, not gut feeling
- "We said we'd reduce coupling between auth and payments" → query proves/disproves it
- Effect model health: "Are we following the Vision-View-Effects pattern consistently?"
- Catches the slow creep that no single PR makes visible

---

### Idea 7: "The GitHub Action DuckLake Pipeline"

**CI/CD that maintains the DuckLake hub automatically.**

```yaml
# .github/workflows/devac-ducklake.yml
on:
  push:
    branches: [main]
  pull_request:

jobs:
  analyze:
    steps:
      - uses: actions/checkout@v4
      
      - name: Extract seeds
        run: devac analyze --all
      
      - name: Push to DuckLake hub
        run: |
          devac hub push \
            --ducklake "postgres://catalog.example.com/devac" \
            --storage "s3://devac-hub/seeds/" \
            --tag "commit:${{ github.sha }}" \
            --tag "branch:${{ github.ref_name }}"
      
      - name: Compute embeddings (only for changed packages)
        run: devac hub embed --changed-only
      
      - name: Rebuild cross-repo edges
        run: devac hub rebuild-edges
      
      - name: Architectural checks
        run: |
          devac hub check \
            --max-cross-package-deps 50 \
            --max-effect-types-per-package 20 \
            --no-new-circular-deps
      
      - name: PR Comment (on PRs only)
        if: github.event_name == 'pull_request'
        run: |
          devac hub diff \
            --from "branch:main" \
            --to "branch:${{ github.head_ref }}" \
            --format github-comment \
            > pr-comment.md
          # Post as PR comment showing structural changes
```

**The PR comment might look like:**

```markdown
## 🏗️ Architectural Impact

**Nodes:** +47 added, -12 removed, 3 signatures changed
**Effects:** +2 new effect types (`Effect.Auth.MFA`, `Effect.Auth.Biometric`)
**Cross-package deps:** +1 new dependency (auth → biometrics)
**Semantic similarity:** New `BiometricVerifier` is 91% similar to existing `MFAVerifier` — possible duplication?

<details>
<summary>Full structural diff</summary>
...
</details>
```

---

## The Decision Matrix: What to Build When

| Idea | Complexity | Value | When to Build |
|------|-----------|-------|---------------|
| **4. Derived Layer Only** | Low | High | **Now** — minimal disruption, solves hub's single-writer problem, natural home for embeddings and traces |
| **1. Git Seeds, DuckLake Hub** | Medium | High | **Soon after** — extends Idea 4 by materializing seeds into the hub for unified querying |
| **5. Semantic Code Search** | Medium | High | **Once embeddings exist** — FTS + VSS on the hub is a killer feature for developer experience |
| **2. Snapshot-per-Commit** | Medium | Medium | **When you have CI pipeline** — requires automation but gives you structural diffs |
| **6. Drift Detection** | Low (once hub exists) | High | **Comes free with snapshots** — just write the queries |
| **7. GitHub Action Pipeline** | Medium | Very High | **When the team adopts** — makes everything automatic and visible in PRs |
| **3. Branch-Aware Intelligence** | High | Medium | **Later** — powerful but needs multi-branch extraction infrastructure |

---

## The Elegant Synthesis: A Phased Approach

### Phase 1: DuckLake Derived Layer (Now)

Keep everything as-is. Add a DuckLake instance for derived data only.

```
Seeds: git repos (unchanged)
Hub: DuckLake (PostgreSQL catalog + S3/local Parquet)
     ├── cross_repo_edges (already computed)
     ├── node_embeddings (new)
     └── architectural_metrics (new)
```

This immediately solves:
- Hub single-writer constraint (ADR-0024 becomes unnecessary)
- Natural home for embeddings
- Time travel over computed data
- Foundation for everything else

### Phase 2: Materialize Seeds into Hub (Next)

Add a `devac hub sync` that reads seed Parquet from repos and writes them into DuckLake tables. Seeds in git remain source of truth. DuckLake is the queryable materialization.

This enables:
- Cross-repo SQL queries without glob patterns
- FTS over all code nodes
- VSS over all embeddings
- Snapshot tags per sync (building toward time travel)

### Phase 3: CI-Driven Snapshots (When Ready)

GitHub Actions maintain the hub. Each merge to main creates a tagged snapshot. PR analysis becomes automatic.

This enables:
- Structural PR comments
- Architectural drift detection
- Branch comparison
- The full "Idea 7" pipeline

### Phase 4: Semantic Code Intelligence (Vision)

Full hybrid search, embedding-based duplicate detection, effect similarity, natural language code exploration through MCP.

This is where DuckLake + FTS + VSS + vivief Effects converge into something no existing tool provides: **a versioned, searchable, semantically-aware architectural intelligence platform that speaks SQL**.

---

## The One-Liner for an Interview

"We use git for versioning source-deterministic code intelligence seeds, and DuckLake for versioning the derived analytical layer — embeddings, cross-repo relationships, architectural metrics. Git owns what's regeneratable. DuckLake owns what's computed. Both version their respective domains, and DuckDB with FTS and VSS at the compute layer lets us do hybrid code search across the entire codebase from a single SQL query."
