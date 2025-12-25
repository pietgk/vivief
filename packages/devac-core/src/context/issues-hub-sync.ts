/**
 * Issues Hub Sync Module
 *
 * Syncs GitHub issues to the Hub's unified_diagnostics table.
 * This allows LLMs to query issues alongside validation errors and CI failures.
 */

import type { CentralHub } from "../hub/central-hub.js";
import type {
  DiagnosticsCategory,
  DiagnosticsSeverity,
  UnifiedDiagnostics,
} from "../hub/hub-storage.js";
import type { GitHubIssue, IssuesResult, RepoIssues } from "./issues.js";

/**
 * Options for syncing issues to hub
 */
export interface IssueSyncOptions {
  /** Clear existing issue diagnostics before syncing (default: true) */
  clearExisting?: boolean;
  /** Only sync issues with specific labels */
  filterLabels?: string[];
}

/**
 * Result of syncing issues to hub
 */
export interface IssueSyncResult {
  /** Number of diagnostics items pushed */
  pushed: number;
  /** Number of repos processed */
  reposProcessed: number;
  /** Errors encountered */
  errors: string[];
}

/**
 * Map issue labels to severity
 *
 * Based on ADR-0018:
 * - `critical` → critical
 * - `error` or `bug` → error
 * - `warning` → warning
 * - `suggestion` or `enhancement` → suggestion
 * - Default → note
 */
function labelToSeverity(labels: Array<{ name: string }>): DiagnosticsSeverity {
  const labelNames = labels.map((l) => l.name.toLowerCase());

  if (labelNames.includes("critical")) {
    return "critical";
  }
  if (labelNames.includes("error") || labelNames.includes("bug")) {
    return "error";
  }
  if (labelNames.includes("warning")) {
    return "warning";
  }
  if (labelNames.includes("suggestion") || labelNames.includes("enhancement")) {
    return "suggestion";
  }
  return "note";
}

/**
 * Determine category from labels
 *
 * - `task` label → task category
 * - `feedback` label → feedback category
 * - Default → task
 */
function labelToCategory(labels: Array<{ name: string }>): DiagnosticsCategory {
  const labelNames = labels.map((l) => l.name.toLowerCase());

  if (labelNames.includes("feedback")) {
    return "feedback";
  }
  // Default to task for issues
  return "task";
}

/**
 * Convert a GitHub issue to UnifiedDiagnostics
 */
function issueToDiagnostics(issue: GitHubIssue, repoId: string): UnifiedDiagnostics {
  const now = new Date().toISOString();
  const severity = labelToSeverity(issue.labels);
  const category = labelToCategory(issue.labels);

  return {
    diagnostic_id: `issue-${repoId}-${issue.number}`,
    repo_id: repoId,
    source: "github-issue",
    file_path: null,
    line_number: null,
    column_number: null,
    severity,
    category,
    title: issue.title,
    description: issue.body || issue.title,
    code: null,
    suggestion: issue.url ? `See issue: ${issue.url}` : null,
    resolved: issue.state === "CLOSED",
    actionable: true,
    created_at: issue.createdAt || now,
    updated_at: issue.updatedAt || now,
    github_issue_number: issue.number,
    github_pr_number: null,
    workflow_name: null,
    ci_url: issue.url,
  };
}

/**
 * Derive repo ID from RepoIssues
 */
function deriveRepoId(repoIssues: RepoIssues): string {
  return repoIssues.repo;
}

/**
 * Sync issues to the Hub
 *
 * @param hub - The CentralHub instance
 * @param issuesResult - The issues result from getIssuesForContext
 * @param options - Sync options
 */
export async function syncIssuesToHub(
  hub: CentralHub,
  issuesResult: IssuesResult,
  options: IssueSyncOptions = {}
): Promise<IssueSyncResult> {
  const { clearExisting = true, filterLabels } = options;

  const result: IssueSyncResult = {
    pushed: 0,
    reposProcessed: 0,
    errors: [],
  };

  if (!issuesResult.success) {
    result.errors.push(issuesResult.error ?? "Issues retrieval failed");
    return result;
  }

  // Collect all diagnostics items
  const allDiagnostics: UnifiedDiagnostics[] = [];

  for (const repoIssues of issuesResult.repoIssues) {
    result.reposProcessed++;

    if (repoIssues.error) {
      result.errors.push(`${repoIssues.repo}: ${repoIssues.error}`);
      continue;
    }

    const repoId = deriveRepoId(repoIssues);

    for (const issue of repoIssues.issues) {
      // Filter by labels if specified
      if (filterLabels && filterLabels.length > 0) {
        const issueLabels = issue.labels.map((l) => l.name.toLowerCase());
        const hasMatchingLabel = filterLabels.some((fl) => issueLabels.includes(fl.toLowerCase()));
        if (!hasMatchingLabel) {
          continue;
        }
      }

      allDiagnostics.push(issueToDiagnostics(issue, repoId));
    }
  }

  // Clear existing issue diagnostics if requested
  if (clearExisting) {
    try {
      await hub.clearDiagnostics(undefined, "github-issue");
    } catch (error) {
      result.errors.push(`Failed to clear existing issue diagnostics: ${error}`);
    }
  }

  // Push all diagnostics
  if (allDiagnostics.length > 0) {
    try {
      await hub.pushDiagnostics(allDiagnostics);
      result.pushed = allDiagnostics.length;
    } catch (error) {
      result.errors.push(`Failed to push issue diagnostics: ${error}`);
    }
  }

  return result;
}
