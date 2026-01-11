/**
 * Reviews Hub Sync Module
 *
 * Syncs GitHub PR review comments to the Hub's unified_diagnostics table.
 * This allows LLMs to query PR reviews alongside validation errors, CI failures, and issues.
 */

import type { HubLike } from "../hub/hub-client.js";
import type { DiagnosticsSeverity, UnifiedDiagnostics } from "../hub/hub-storage.js";
import type { RepoReviews, Review, ReviewComment, ReviewsResult } from "./reviews.js";

/**
 * Options for syncing reviews to hub
 */
export interface ReviewSyncOptions {
  /** Clear existing review diagnostics before syncing (default: true) */
  clearExisting?: boolean;
  /** Only sync reviews with changes_requested state (default: false) */
  changesRequestedOnly?: boolean;
}

/**
 * Result of syncing reviews to hub
 */
export interface ReviewSyncResult {
  /** Number of diagnostics items pushed */
  pushed: number;
  /** Number of repos processed */
  reposProcessed: number;
  /** Errors encountered */
  errors: string[];
}

/**
 * Map review state to severity
 *
 * - CHANGES_REQUESTED → warning (requires action)
 * - PENDING → note (awaiting response)
 * - COMMENTED → suggestion (informational)
 * - APPROVED → note (no action needed, but tracked)
 * - DISMISSED → note
 */
function reviewStateToSeverity(state: Review["state"]): DiagnosticsSeverity {
  switch (state) {
    case "CHANGES_REQUESTED":
      return "warning";
    case "PENDING":
      return "note";
    case "COMMENTED":
      return "suggestion";
    case "APPROVED":
      return "note";
    case "DISMISSED":
      return "note";
    default:
      return "note";
  }
}

/**
 * Convert a PR review to UnifiedDiagnostics
 */
function reviewToDiagnostics(review: Review, repoId: string, prNumber: number): UnifiedDiagnostics {
  const now = new Date().toISOString();
  const severity = reviewStateToSeverity(review.state);

  // Reviews don't have file locations - they're PR-level
  return {
    diagnostic_id: `review-${repoId}-${prNumber}-${review.id}`,
    repo_id: repoId,
    source: "pr-review",
    file_path: null,
    line_number: null,
    column_number: null,
    severity,
    category: "code-review",
    title: `${review.author}: ${review.state}`,
    description: review.body || `${review.state} by ${review.author}`,
    code: null,
    suggestion: review.url ? `See review: ${review.url}` : null,
    resolved: review.state === "APPROVED" || review.state === "DISMISSED",
    actionable: review.state === "CHANGES_REQUESTED" || review.state === "PENDING",
    created_at: review.submittedAt || now,
    updated_at: review.submittedAt || now,
    github_issue_number: null,
    github_pr_number: prNumber,
    workflow_name: null,
    ci_url: review.url,
  };
}

/**
 * Convert a review comment to UnifiedDiagnostics
 */
function commentToDiagnostics(
  comment: ReviewComment,
  repoId: string,
  prNumber: number
): UnifiedDiagnostics {
  const now = new Date().toISOString();

  // Comments are suggestions by default
  const severity: DiagnosticsSeverity = "suggestion";

  return {
    diagnostic_id: `review-comment-${repoId}-${prNumber}-${comment.id}`,
    repo_id: repoId,
    source: "pr-review",
    file_path: comment.path,
    line_number: comment.line,
    column_number: null,
    severity,
    category: "code-review",
    title: `${comment.author} commented on ${comment.path}`,
    description: comment.body,
    code: null,
    suggestion: comment.url ? `See comment: ${comment.url}` : null,
    resolved: comment.state === "DISMISSED",
    actionable: true,
    created_at: comment.createdAt || now,
    updated_at: comment.updatedAt || now,
    github_issue_number: null,
    github_pr_number: prNumber,
    workflow_name: null,
    ci_url: comment.url,
  };
}

/**
 * Derive repo ID from RepoReviews
 */
function deriveRepoId(repoReviews: RepoReviews): string {
  return repoReviews.repo;
}

/**
 * Sync reviews to the Hub
 *
 * @param hub - The hub instance (CentralHub or HubClient)
 * @param reviewsResult - The reviews result from getReviewsForContext
 * @param options - Sync options
 */
export async function syncReviewsToHub(
  hub: HubLike,
  reviewsResult: ReviewsResult,
  options: ReviewSyncOptions = {}
): Promise<ReviewSyncResult> {
  const { clearExisting = true, changesRequestedOnly = false } = options;

  const result: ReviewSyncResult = {
    pushed: 0,
    reposProcessed: 0,
    errors: [],
  };

  if (!reviewsResult.success) {
    result.errors.push(reviewsResult.error ?? "Reviews retrieval failed");
    return result;
  }

  // Collect all diagnostics items
  const allDiagnostics: UnifiedDiagnostics[] = [];

  for (const repoReviews of reviewsResult.repoReviews) {
    result.reposProcessed++;

    if (repoReviews.error) {
      result.errors.push(`${repoReviews.repo}: ${repoReviews.error}`);
      continue;
    }

    // Skip if no PR
    if (!repoReviews.prNumber) {
      continue;
    }

    const repoId = deriveRepoId(repoReviews);
    const prNumber = repoReviews.prNumber;

    // Convert reviews
    for (const review of repoReviews.reviews) {
      // Filter to changes_requested only if specified
      if (changesRequestedOnly && review.state !== "CHANGES_REQUESTED") {
        continue;
      }

      allDiagnostics.push(reviewToDiagnostics(review, repoId, prNumber));
    }

    // Convert review comments (always include if available)
    for (const comment of repoReviews.comments) {
      allDiagnostics.push(commentToDiagnostics(comment, repoId, prNumber));
    }
  }

  // Clear existing review diagnostics if requested
  if (clearExisting) {
    try {
      await hub.clearDiagnostics(undefined, "pr-review");
    } catch (error) {
      result.errors.push(`Failed to clear existing review diagnostics: ${error}`);
    }
  }

  // Push all diagnostics
  if (allDiagnostics.length > 0) {
    try {
      await hub.pushDiagnostics(allDiagnostics);
      result.pushed = allDiagnostics.length;
    } catch (error) {
      result.errors.push(`Failed to push review diagnostics: ${error}`);
    }
  }

  return result;
}
