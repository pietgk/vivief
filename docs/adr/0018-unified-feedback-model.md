# ADR-0018: Unified Feedback Model

## Status

Accepted

## Context

With Phase 2 complete (validation errors in Hub), we identified an opportunity to unify all "feedback that needs attention" into a single queryable concept:

| Source | Example | Storage Before |
|--------|---------|----------------|
| **Local validation** | tsc errors, eslint warnings | Hub (`validation_errors` table) |
| **CI/CD pipeline** | GitHub Actions failures | On-demand polling |
| **GitHub issues** | Tasks, bugs to fix | On-demand API calls |
| **PR reviews** | Change requests, suggestions | Not stored |

The key insight: All of these represent "things that need to be fixed" and share common properties:
- Location (file:line for code-related, or issue-level)
- Severity (critical > error > warning > suggestion > note)
- Category (compilation, linting, testing, CI, task, review)
- Status (resolved/unresolved)

Currently, LLMs need to query multiple systems to answer: "What do I need to fix?"

## Decision

Create a **unified feedback model** that stores all feedback types in a single DuckDB table with a common schema.

### Unified Schema

```sql
CREATE TABLE unified_feedback (
  feedback_id VARCHAR PRIMARY KEY,
  repo_id VARCHAR NOT NULL,
  source VARCHAR NOT NULL,  -- tsc | eslint | test | ci-check | github-issue | pr-review

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

### Mapping Feedback Types

| Feedback Type | Source | Category | Severity |
|---------------|--------|----------|----------|
| TypeScript errors | `tsc` | `compilation` | `error` / `warning` |
| ESLint issues | `eslint` | `linting` | `error` / `warning` |
| Test failures | `test` | `testing` | `error` |
| CI failures | `ci-check` | `ci-check` | `error` |
| GitHub issues (task) | `github-issue` | `task` | By label |
| GitHub issues (feedback) | `github-issue` | `feedback` | By label |
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
   - ❌ Complex inserts, slower cross-table queries
   - ✅ Normalized storage per source

2. **Keep validation_errors + New Tables**
   - ❌ Multiple query targets for LLMs
   - ✅ No migration needed

3. **Unified Table (chosen)**
   - ✅ Single query answers "what needs fixing?"
   - ✅ Consistent severity ordering across sources
   - ✅ Cross-source file correlation
   - ⚠️ Wider schema with nullable fields

### Backward Compatibility

The existing `validation_errors` table and MCP tools continue to work unchanged. The new unified feedback is additive:

- `get_validation_errors` → queries `validation_errors` (unchanged)
- `get_all_feedback` → queries `unified_feedback` (new)

In a future phase, validation_errors could be deprecated in favor of unified_feedback.

## Consequences

### Positive

- Single query: "What do I need to fix?" returns ALL feedback
- Consistent severity ordering across all sources
- Cross-linking: validation error at line 42 can correlate with issue #123
- Enables future proactive notifications when new feedback appears
- Unified counts: "3 errors, 5 warnings, 2 suggestions" across all sources

### Negative

- Wider schema with nullable columns (e.g., `github_issue_number`)
- Need to sync external sources (GitHub API) to keep Hub updated
- Increased storage if many issues/reviews are synced

### Neutral

- Existing validation tools continue to work (no breaking changes)
- Sync can be triggered on-demand or via webhooks (future)
- Phase 2.5c (migration) is optional - new table coexists with old

## Implementation

**Phase 2.5: Unified Schema (Complete)**

| File | Changes |
|------|---------|
| `devac-core/src/hub/hub-storage.ts` | Added `unified_feedback` table, CRUD methods |
| `devac-core/src/hub/central-hub.ts` | Added `pushFeedback()`, `getFeedback()`, `getFeedbackSummary()`, `getFeedbackCounts()` |
| `devac-core/src/hub/index.ts` | Exported new types |
| `devac-mcp/src/tools/index.ts` | Added `get_all_feedback`, `get_feedback_summary`, `get_feedback_counts` tools |
| `devac-mcp/src/data-provider.ts` | Added `getAllFeedback()`, `getFeedbackSummary()`, `getFeedbackCounts()` methods |
| `devac-mcp/src/server.ts` | Added tool handlers |

**New MCP Tools:**

| Tool | Description |
|------|-------------|
| `get_all_feedback` | Query feedback with filters (repo, source, severity, category, file, resolved) |
| `get_feedback_summary` | Grouped counts by source, severity, category, or repo |
| `get_feedback_counts` | Total counts by severity (critical, error, warning, suggestion, note) |

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
| `devac-core/src/context/issues-hub-sync.ts` | Syncs issues to Hub `unified_feedback` table |
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
| `devac-core/src/context/reviews-hub-sync.ts` | Syncs reviews to Hub `unified_feedback` table |
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
-- "What do I need to fix?" (all unresolved feedback)
SELECT * FROM unified_feedback
WHERE repo_id = 'myorg/repo' AND resolved = FALSE
ORDER BY
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'error' THEN 2
    WHEN 'warning' THEN 3
    ELSE 4
  END,
  created_at DESC;

-- "What's blocking CI?"
SELECT * FROM unified_feedback
WHERE source = 'ci-check' AND severity IN ('critical', 'error');

-- "Show me everything related to src/auth.ts"
SELECT * FROM unified_feedback
WHERE file_path LIKE '%auth.ts%';
```

## References

- [ADR-0017: Validation Hub Cache](0017-validation-hub-cache.md) - Original validation storage design
- [ADR-0007: Federation Central Hub](0007-federation-central-hub.md) - Hub architecture
- [DevAC v3 Architecture](../architecture/devac-v3-architecture.md) - Overall system design
