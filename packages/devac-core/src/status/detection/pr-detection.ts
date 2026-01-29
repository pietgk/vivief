/**
 * PR Detection Module
 *
 * PR merge readiness detection:
 * - CI status via gh pr view --json
 * - Review status analysis (approved/changes-requested)
 * - Merge conflict detection
 * - Actionable blockers list
 */

import { execSync } from "node:child_process";
import type { MergeBlocker, PRState } from "../types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw PR data from GitHub CLI.
 */
interface GhPrViewResponse {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  baseRefName: string;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  statusCheckRollup: Array<{
    context: string;
    state: string;
    conclusion: string | null;
  }> | null;
  reviews: Array<{
    state: string;
    author: {
      login: string;
    };
  }>;
  latestReviews: Array<{
    state: string;
    author: {
      login: string;
    };
  }>;
}

/**
 * Options for PR detection.
 */
export interface PRDetectionOptions {
  /** Whether to include check details (slower) */
  includeChecks?: boolean;
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub CLI Execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute gh CLI command and return parsed JSON.
 */
function ghJson<T>(args: string, cwd: string, timeout = 10000): T | null {
  try {
    const output = execSync(`gh ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
    });
    return JSON.parse(output) as T;
  } catch {
    return null;
  }
}

/**
 * Check if gh CLI is available and authenticated.
 */
export function isGhAvailable(cwd: string): boolean {
  try {
    execSync("gh auth status", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PR Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fields to request from gh pr view.
 */
const PR_FIELDS = [
  "number",
  "title",
  "url",
  "state",
  "isDraft",
  "baseRefName",
  "mergeable",
  "mergeStateStatus",
  "reviewDecision",
  "statusCheckRollup",
  "reviews",
  "latestReviews",
].join(",");

/**
 * Get PR state for the current branch.
 */
export async function getPRState(
  cwd: string,
  options: PRDetectionOptions = {}
): Promise<PRState | null> {
  const timeout = options.timeout ?? 10000;

  // Get PR data from GitHub
  const prData = ghJson<GhPrViewResponse>(`pr view --json ${PR_FIELDS}`, cwd, timeout);

  if (!prData) {
    return null;
  }

  // Parse PR state
  const state = parsePRState(prData);

  // Parse reviews
  const reviews = parseReviews(prData);

  // Parse checks
  const checks = parseChecks(prData);

  // Parse conflicts
  const conflicts = parseConflicts(prData);

  // Parse base info
  const base = parseBaseInfo(prData);

  // Generate merge blockers
  const blockers = generateMergeBlockers(state, reviews, checks, conflicts, base, prData.isDraft);

  return {
    number: prData.number,
    title: prData.title,
    url: prData.url,
    state,
    mergeReadiness: {
      ready: blockers.length === 0,
      blockers,
    },
    reviews,
    checks,
    conflicts,
    base,
  };
}

/**
 * Parse PR state from API response.
 */
function parsePRState(prData: GhPrViewResponse): PRState["state"] {
  if (prData.isDraft) {
    return "draft";
  }

  switch (prData.state.toUpperCase()) {
    case "OPEN":
      return "open";
    case "CLOSED":
      return "closed";
    case "MERGED":
      return "merged";
    default:
      return "open";
  }
}

/**
 * Parse review status from API response.
 */
function parseReviews(prData: GhPrViewResponse): PRState["reviews"] {
  const reviews: PRState["reviews"] = {
    approved: 0,
    changesRequested: 0,
    pending: 0,
  };

  // Use latestReviews to get the most recent review from each reviewer
  const latestReviews = prData.latestReviews || [];

  for (const review of latestReviews) {
    switch (review.state.toUpperCase()) {
      case "APPROVED":
        reviews.approved++;
        break;
      case "CHANGES_REQUESTED":
        reviews.changesRequested++;
        break;
      case "PENDING":
      case "COMMENTED":
        reviews.pending++;
        break;
    }
  }

  return reviews;
}

/**
 * Parse CI check status from API response.
 */
function parseChecks(prData: GhPrViewResponse): PRState["checks"] {
  const checks: PRState["checks"] = {
    status: "unknown",
    failedChecks: [],
    pendingChecks: [],
  };

  const statusChecks = prData.statusCheckRollup || [];

  if (statusChecks.length === 0) {
    return checks;
  }

  let hasFailure = false;
  let hasPending = false;

  for (const check of statusChecks) {
    const state = check.state.toUpperCase();
    const conclusion = check.conclusion?.toUpperCase();

    if (state === "FAILURE" || conclusion === "FAILURE") {
      hasFailure = true;
      checks.failedChecks.push(check.context);
    } else if (state === "PENDING" || state === "QUEUED" || state === "IN_PROGRESS") {
      hasPending = true;
      checks.pendingChecks.push(check.context);
    } else if (conclusion === "CANCELLED" || conclusion === "TIMED_OUT") {
      hasFailure = true;
      checks.failedChecks.push(check.context);
    }
  }

  if (hasFailure) {
    checks.status = "failing";
  } else if (hasPending) {
    checks.status = "pending";
  } else {
    checks.status = "passing";
  }

  return checks;
}

/**
 * Parse merge conflict status from API response.
 */
function parseConflicts(prData: GhPrViewResponse): PRState["conflicts"] {
  // mergeable can be: MERGEABLE, CONFLICTING, UNKNOWN
  const hasConflicts = prData.mergeable === "CONFLICTING";

  return {
    hasConflicts,
    conflictedFiles: [], // GitHub API doesn't provide conflicted files directly
  };
}

/**
 * Parse base branch info from API response.
 */
function parseBaseInfo(prData: GhPrViewResponse): PRState["base"] {
  // mergeStateStatus can indicate if base needs update
  const needsUpdate = prData.mergeStateStatus === "BEHIND" || prData.mergeStateStatus === "DIRTY";

  return {
    branch: prData.baseRefName,
    needsUpdate,
  };
}

/**
 * Generate list of merge blockers.
 */
function generateMergeBlockers(
  _state: PRState["state"],
  reviews: PRState["reviews"],
  checks: PRState["checks"],
  conflicts: PRState["conflicts"],
  base: PRState["base"],
  isDraft: boolean
): MergeBlocker[] {
  const blockers: MergeBlocker[] = [];

  // Draft PR
  if (isDraft) {
    blockers.push({
      type: "draft",
      message: "PR is marked as draft",
      suggestion: "Mark as ready for review when complete",
    });
  }

  // CI failures
  if (checks.status === "failing") {
    blockers.push({
      type: "ci-failing",
      message: `${checks.failedChecks.length} CI check(s) failing: ${checks.failedChecks.slice(0, 3).join(", ")}${checks.failedChecks.length > 3 ? "..." : ""}`,
      suggestion: "Fix failing checks before merging",
    });
  }

  // Changes requested
  if (reviews.changesRequested > 0) {
    blockers.push({
      type: "changes-requested",
      message: `${reviews.changesRequested} reviewer(s) requested changes`,
      suggestion: "Address review feedback and request re-review",
    });
  }

  // No approvals (if reviews have been requested)
  if (reviews.approved === 0 && (reviews.pending > 0 || reviews.changesRequested > 0)) {
    blockers.push({
      type: "review-required",
      message: "No approvals yet",
      suggestion: "Wait for or request code review",
    });
  }

  // Merge conflicts
  if (conflicts.hasConflicts) {
    blockers.push({
      type: "merge-conflicts",
      message: "PR has merge conflicts",
      suggestion: "Resolve conflicts by rebasing or merging base branch",
    });
  }

  // Base behind
  if (base.needsUpdate && !conflicts.hasConflicts) {
    blockers.push({
      type: "base-behind",
      message: "Base branch is behind",
      suggestion: "Update branch by merging or rebasing",
    });
  }

  return blockers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get PR state for a specific branch.
 */
export async function getPRStateForBranch(
  cwd: string,
  branch: string,
  options: PRDetectionOptions = {}
): Promise<PRState | null> {
  const timeout = options.timeout ?? 10000;

  const prData = ghJson<GhPrViewResponse>(`pr view ${branch} --json ${PR_FIELDS}`, cwd, timeout);

  if (!prData) {
    return null;
  }

  // Reuse the same parsing logic
  const state = parsePRState(prData);
  const reviews = parseReviews(prData);
  const checks = parseChecks(prData);
  const conflicts = parseConflicts(prData);
  const base = parseBaseInfo(prData);
  const blockers = generateMergeBlockers(state, reviews, checks, conflicts, base, prData.isDraft);

  return {
    number: prData.number,
    title: prData.title,
    url: prData.url,
    state,
    mergeReadiness: {
      ready: blockers.length === 0,
      blockers,
    },
    reviews,
    checks,
    conflicts,
    base,
  };
}
