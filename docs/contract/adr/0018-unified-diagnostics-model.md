# ADR-0018: Unified Diagnostics Model

## Status

Accepted

> **Note:** CLI commands in this ADR have been reorganized in v4.0. See `docs/cli-reference.md` for current commands.

## Context

With Phase 2 complete (validation errors in Hub), we identified an opportunity to unify all "things that need attention" into a single queryable concept.

**Terminology note:** In DevAC's Four Pillars model (see [concepts.md](../vision/concepts.md)), **Validators** produce **Diagnostics**. The unified diagnostics model extends this concept to include workflow items (CI, issues, PR reviews). The `category` field provides granular classification: `compilation`, `linting`, `testing`, `ci-check`, `task`, `feedback`, `code-review`.

| Source | Example | Storage Before |
|--------|---------|----------------|
| **Local validation** | tsc errors, eslint warnings | Hub (`diagnostics` table) |
| **CI/CD pipeline** | GitHub Actions failures | On-demand polling |
| **GitHub issues** | Tasks, bugs to fix | On-demand API calls |
| **PR reviews** | Change requests, suggestions | Not stored |

The key insight: All of these represent "things that need attention" and share common properties:
- Location (file:line for code-related, or issue-level)
- Severity (critical > error > warning > suggestion > note > info)
- Category (validation vs workflow)
- Status (resolved/unresolved)

Currently, LLMs need to query multiple systems to answer: "What needs attention?"

## Decision

Create a **unified diagnostics model** that stores all diagnostic types in a single DuckDB table with a common schema.

### Unified Schema

```sql
CREATE TABLE unified_diagnostics (
  diagnostic_id VARCHAR PRIMARY KEY,
  repo_id VARCHAR NOT NULL,
  source VARCHAR NOT NULL,  -- tsc | eslint | biome | test | coverage | ci-check | github-issue | pr-review

  -- Location (nullable for issues)
  file_path VARCHAR,
  line_number INTEGER,
  column_number INTEGER,

  -- Severity & Category
  severity VARCHAR NOT NULL,  -- critical | error | warning | suggestion | note
  category VARCHAR NOT NULL,  -- compilation | linting | testing | ci-check | task | feedback | code-review

  -- Content
  title VARCHAR NOT NULL,
  description VARCHAR NOT NULL,
  code VARCHAR,
  suggestion VARCHAR,

  -- Status
  resolved BOOLEAN DEFAULT FALSE,
  actionable BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Source-specific
  github_issue_number INTEGER,
  github_pr_number INTEGER,
  workflow_name VARCHAR,
  ci_url VARCHAR
);
```

### Mapping Diagnostic Types

| Diagnostic Type | Source | Category | Severity |
|-----------------|--------|----------|----------|
| TypeScript errors | `tsc` | `compilation` | `error` / `warning` |
| ESLint issues | `eslint` | `linting` | `error` / `warning` |
| Biome issues | `biome` | `linting` | `error` / `warning` |
| Test failures | `test` | `testing` | `error` |
| Coverage below threshold | `coverage` | `testing` | `warning` |
| CI failures | `ci-check` | `ci-check` | `error` |
| GitHub issues | `github-issue` | `task` | By label |
| PR reviews | `pr-review` | `code-review` | `suggestion` / `warning` |

### Issue Label to Severity Mapping

GitHub issues can be labeled with severity:
- `critical` → `critical`
- `error` or `bug` → `error`
- `warning` → `warning`
- `suggestion` or `enhancement` → `suggestion`
- Default → `note`

### Alternatives Considered

1. **Separate Tables + Union View**
   - Did not choose: Complex inserts, slower cross-table queries
   - Advantage: Normalized storage per source

2. **Keep diagnostics + New Tables**
   - Did not choose: Multiple query targets for LLMs
   - Advantage: No migration needed

3. **Unified Table (chosen)**
   - Advantage: Single query answers "what needs attention?"
   - Advantage: Consistent severity ordering across sources
   - Advantage: Cross-source file correlation
   - Tradeoff: Wider schema with nullable fields

### Backward Compatibility

The existing validation errors table and MCP tools continue to work unchanged. The new unified diagnostics is additive:

- `get_validation_errors` → queries validation errors (unchanged)
- `get_all_diagnostics` → queries `unified_diagnostics` (new)

In a future phase, the simple validation table could be deprecated in favor of unified_diagnostics.

## Consequences

### Positive

- Single query: "What needs attention?" returns ALL diagnostics
- Consistent severity ordering across all sources
- Cross-linking: validation error at line 42 can correlate with issue #123
- Enables future proactive notifications when new diagnostics appear
- Unified counts: "3 errors, 5 warnings, 2 suggestions" across all sources

### Negative

- Wider schema with nullable columns (e.g., `github_issue_number`)
- Need to sync external sources (GitHub API) to keep Hub updated
- Increased storage if many issues/reviews are synced

### Neutral

- Existing validation tools continue to work (no breaking changes)
- Sync can be triggered on-demand or via webhooks (future)
- Migration is optional - new table coexists with old

## Implementation

**Phase 2.5: Unified Schema (Complete)**

| File | Changes |
|------|---------|
| `devac-core/src/hub/hub-storage.ts` | Added `unified_diagnostics` table, CRUD methods |
| `devac-core/src/hub/central-hub.ts` | Added `pushDiagnostics()`, `getDiagnostics()`, `getDiagnosticsSummary()`, `getDiagnosticsCounts()` |
| `devac-core/src/hub/index.ts` | Exported new types |
| `devac-mcp/src/tools/index.ts` | Added `get_all_diagnostics`, `get_diagnostics_summary`, `get_diagnostics_counts` tools |
| `devac-mcp/src/data-provider.ts` | Added `getAllDiagnostics()`, `getDiagnosticsSummary()`, `getDiagnosticsCounts()` methods |
| `devac-mcp/src/server.ts` | Added tool handlers |

**New MCP Tools:**

| Tool | Description |
|------|-------------|
| `get_all_diagnostics` | Query diagnostics with filters (repo, source, severity, category, file, resolved) |
| `get_diagnostics_summary` | Grouped counts by source, severity, category, or repo |
| `get_diagnostics_counts` | Total counts by severity (critical, error, warning, suggestion, note) |

**Phase 3: CI/CD Integration (Complete)**

| File | Changes |
|------|---------|
| `devac-core/src/context/ci-hub-sync.ts` | New module for syncing CI status to Hub |
| `devac-core/src/context/index.ts` | Exported `syncCIStatusToHub`, `CISyncOptions`, `CISyncResult` |
| `devac-cli/src/commands/context.ts` | Added `--sync-to-hub` and `--failing-only` flags to `devac context ci` |
| `devac-cli/src/commands/hub-sync.ts` | New `devac hub sync --ci` command |
| `devac-cli/src/index.ts` | Added hub sync command |

**New CLI Commands:**

| Command | Description |
|---------|-------------|
| `devac context ci --sync-to-hub` | Check CI status and sync to Hub |
| `devac hub sync --ci` | Sync CI status from current context to Hub |

**Phase 4: GitHub Issues Integration (Complete)**

| File | Changes |
|------|---------|
| `devac-core/src/context/issues.ts` | Fetches GitHub issues via `gh` CLI |
| `devac-core/src/context/issues-hub-sync.ts` | Syncs issues to Hub `unified_diagnostics` table |
| `devac-core/src/context/index.ts` | Exported `syncIssuesToHub`, `IssueSyncOptions`, `IssueSyncResult` |
| `devac-cli/src/commands/context.ts` | Added `devac context issues` with `--sync-to-hub` flag |
| `devac-cli/src/commands/hub-sync.ts` | Added `--issues` flag to `devac hub sync` |

**New CLI Commands:**

| Command | Description |
|---------|-------------|
| `devac context issues` | List GitHub issues for repos in context |
| `devac context issues --sync-to-hub` | List issues and sync to Hub |
| `devac hub sync --issues` | Sync GitHub issues to Hub |

**Phase 5: PR Reviews Integration (Complete)**

| File | Changes |
|------|---------|
| `devac-core/src/context/reviews.ts` | Fetches PR reviews and comments via `gh` CLI |
| `devac-core/src/context/reviews-hub-sync.ts` | Syncs reviews to Hub `unified_diagnostics` table |
| `devac-core/src/context/index.ts` | Exported `syncReviewsToHub`, `ReviewSyncOptions`, `ReviewSyncResult` |
| `devac-cli/src/commands/context.ts` | Added `devac context reviews` with `--sync-to-hub` flag |
| `devac-cli/src/commands/hub-sync.ts` | Added `--reviews` flag to `devac hub sync` |

**New CLI Commands:**

| Command | Description |
|---------|-------------|
| `devac context reviews` | List PR reviews for repos in context |
| `devac context reviews --sync-to-hub` | List reviews and sync to Hub |
| `devac hub sync --reviews` | Sync PR reviews to Hub |

**Review State to Severity Mapping:**

| Review State | Severity |
|--------------|----------|
| `CHANGES_REQUESTED` | `warning` |
| `PENDING` | `note` |
| `COMMENTED` | `suggestion` |
| `APPROVED` | `note` |
| `DISMISSED` | `note` |

## Query Examples

```sql
-- "What needs attention?" (all unresolved diagnostics)
SELECT * FROM unified_diagnostics
WHERE repo_id = 'myorg/repo' AND resolved = FALSE
ORDER BY
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'error' THEN 2
    WHEN 'warning' THEN 3
    ELSE 4
  END,
  created_at DESC;

-- "What compilation/linting/testing issues need fixing?"
SELECT * FROM unified_diagnostics
WHERE category IN ('compilation', 'linting', 'testing') 
  AND severity IN ('critical', 'error');

-- "What tasks and code reviews are pending?"
SELECT * FROM unified_diagnostics
WHERE category IN ('task', 'code-review') AND resolved = FALSE;

-- "Show me everything related to src/auth.ts"
SELECT * FROM unified_diagnostics
WHERE file_path LIKE '%auth.ts%';
```

## References

- [DevAC Concepts](../vision/concepts.md) - Four Pillars, Diagnostics terminology
- [Validation & Diagnostics](../vision/validation.md) - Unified diagnostics vision
- [ADR-0017: Validation Hub Cache](0017-validation-hub-cache.md) - Original validation storage design
- [ADR-0007: Federation Central Hub](0007-federation-central-hub.md) - Hub architecture
- [ADR-0019: Coverage Validator](0019-coverage-validator.md) - Coverage as diagnostic source
- [DevAC v3 Architecture](../architecture/devac-v3-architecture.md) - Overall system design
