/**
 * CI Hub Sync Module
 *
 * Syncs CI status from GitHub Actions to the Hub's unified_feedback table.
 * This allows LLMs to query CI failures alongside validation errors.
 */

import type { CentralHub } from "../hub/central-hub.js";
import type { FeedbackCategory, FeedbackSeverity, UnifiedFeedback } from "../hub/hub-storage.js";
import type { CIStatus, CIStatusResult, CheckStatus } from "./ci-status.js";

/**
 * Options for syncing CI status to hub
 */
export interface CISyncOptions {
  /** Only sync failing checks (default: true) */
  failingOnly?: boolean;
  /** Clear existing CI feedback before syncing (default: true) */
  clearExisting?: boolean;
}

/**
 * Result of syncing CI status to hub
 */
export interface CISyncResult {
  /** Number of feedback items pushed */
  pushed: number;
  /** Number of repos processed */
  reposProcessed: number;
  /** Errors encountered */
  errors: string[];
}

/**
 * Convert a CIStatus to UnifiedFeedback items
 */
function ciStatusToFeedback(ciStatus: CIStatus, repoId: string): UnifiedFeedback[] {
  const feedback: UnifiedFeedback[] = [];
  const now = new Date().toISOString();

  // If there's no PR or status is unknown, skip
  if (ciStatus.status === "no-pr" || ciStatus.status === "unknown") {
    return feedback;
  }

  // If we have individual checks, create feedback for each failing one
  if (ciStatus.checks && ciStatus.checks.length > 0) {
    for (const check of ciStatus.checks) {
      const severity = checkToSeverity(check);
      if (severity === null) continue; // Skip passing/neutral checks

      feedback.push({
        feedback_id: `ci-${repoId}-${ciStatus.prNumber}-${check.name}`,
        repo_id: repoId,
        source: "ci-check",
        file_path: null,
        line_number: null,
        column_number: null,
        severity,
        category: "ci-check" as FeedbackCategory,
        title: `CI: ${check.name} ${check.conclusion || check.status}`,
        description: buildCheckDescription(check, ciStatus),
        code: null,
        suggestion: check.detailsUrl ? `See details: ${check.detailsUrl}` : null,
        resolved: check.conclusion === "success",
        actionable: true,
        created_at: now,
        updated_at: now,
        github_issue_number: null,
        github_pr_number: ciStatus.prNumber ?? null,
        workflow_name: check.name,
        ci_url: check.detailsUrl ?? ciStatus.prUrl ?? null,
      });
    }
  } else if (ciStatus.status === "failing") {
    // No individual checks available, but overall status is failing
    feedback.push({
      feedback_id: `ci-${repoId}-${ciStatus.prNumber}-overall`,
      repo_id: repoId,
      source: "ci-check",
      file_path: null,
      line_number: null,
      column_number: null,
      severity: "error",
      category: "ci-check" as FeedbackCategory,
      title: `CI failing for PR #${ciStatus.prNumber}`,
      description: ciStatus.prTitle
        ? `CI checks are failing for "${ciStatus.prTitle}"`
        : "CI checks are failing",
      code: null,
      suggestion: ciStatus.prUrl ? `See PR: ${ciStatus.prUrl}` : null,
      resolved: false,
      actionable: true,
      created_at: now,
      updated_at: now,
      github_issue_number: null,
      github_pr_number: ciStatus.prNumber ?? null,
      workflow_name: null,
      ci_url: ciStatus.prUrl ?? null,
    });
  } else if (ciStatus.status === "pending") {
    // Pending checks - create a note-level feedback
    feedback.push({
      feedback_id: `ci-${repoId}-${ciStatus.prNumber}-pending`,
      repo_id: repoId,
      source: "ci-check",
      file_path: null,
      line_number: null,
      column_number: null,
      severity: "note",
      category: "ci-check" as FeedbackCategory,
      title: `CI pending for PR #${ciStatus.prNumber}`,
      description: ciStatus.prTitle
        ? `CI checks are running for "${ciStatus.prTitle}"`
        : "CI checks are running",
      code: null,
      suggestion: ciStatus.prUrl ? `See PR: ${ciStatus.prUrl}` : null,
      resolved: false,
      actionable: false, // Can't fix until CI completes
      created_at: now,
      updated_at: now,
      github_issue_number: null,
      github_pr_number: ciStatus.prNumber ?? null,
      workflow_name: null,
      ci_url: ciStatus.prUrl ?? null,
    });
  }

  return feedback;
}

/**
 * Convert check status to severity
 * Returns null if the check shouldn't be synced (passing/neutral)
 */
function checkToSeverity(check: CheckStatus): FeedbackSeverity | null {
  if (check.status === "in_progress" || check.status === "queued") {
    return "note"; // Pending
  }

  switch (check.conclusion) {
    case "failure":
      return "error";
    case "timed_out":
      return "error";
    case "cancelled":
      return "warning";
    case "success":
      return null; // Don't sync passing checks
    case "neutral":
      return null; // Don't sync neutral checks
    case "skipped":
      return null; // Don't sync skipped checks
    default:
      return "note";
  }
}

/**
 * Build a description for a check
 */
function buildCheckDescription(check: CheckStatus, ciStatus: CIStatus): string {
  const parts: string[] = [];

  if (ciStatus.prTitle) {
    parts.push(`PR: "${ciStatus.prTitle}"`);
  }

  parts.push(`Check: ${check.name}`);
  parts.push(`Status: ${check.status}`);

  if (check.conclusion) {
    parts.push(`Conclusion: ${check.conclusion}`);
  }

  return parts.join("\n");
}

/**
 * Derive repo ID from CIStatus path
 */
function deriveRepoId(ciStatus: CIStatus): string {
  // Use the repo name as the ID
  // In a more complete implementation, we'd parse the git remote URL
  return ciStatus.repo;
}

/**
 * Sync CI status results to the Hub
 *
 * @param hub - The CentralHub instance
 * @param ciResult - The CI status result from getCIStatusForContext
 * @param options - Sync options
 */
export async function syncCIStatusToHub(
  hub: CentralHub,
  ciResult: CIStatusResult,
  options: CISyncOptions = {}
): Promise<CISyncResult> {
  const { failingOnly = false, clearExisting = true } = options;

  const result: CISyncResult = {
    pushed: 0,
    reposProcessed: 0,
    errors: [],
  };

  if (!ciResult.success) {
    result.errors.push(ciResult.error ?? "CI status retrieval failed");
    return result;
  }

  // Collect all feedback items
  const allFeedback: UnifiedFeedback[] = [];

  for (const ciStatus of ciResult.statuses) {
    result.reposProcessed++;

    const repoId = deriveRepoId(ciStatus);
    const feedback = ciStatusToFeedback(ciStatus, repoId);

    // Filter to failing only if requested
    const filtered = failingOnly
      ? feedback.filter((f) => f.severity === "error" || f.severity === "critical")
      : feedback;

    allFeedback.push(...filtered);
  }

  // Clear existing CI feedback if requested
  if (clearExisting) {
    try {
      await hub.clearFeedback(undefined, "ci-check");
    } catch (error) {
      result.errors.push(`Failed to clear existing CI feedback: ${error}`);
    }
  }

  // Push all feedback
  if (allFeedback.length > 0) {
    try {
      await hub.pushFeedback(allFeedback);
      result.pushed = allFeedback.length;
    } catch (error) {
      result.errors.push(`Failed to push CI feedback: ${error}`);
    }
  }

  return result;
}
