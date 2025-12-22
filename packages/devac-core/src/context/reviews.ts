/**
 * PR Reviews Module
 *
 * Retrieves GitHub PR review comments for PRs in the current context
 * using the GitHub CLI (gh).
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { isGhCliAvailable } from "./ci-status.js";
import type { RepoContext, RepoInfo, WorktreeInfo } from "./types.js";

const execAsync = promisify(exec);

/**
 * A review comment on a PR
 */
export interface ReviewComment {
  /** Comment ID */
  id: number;
  /** File path the comment is on */
  path: string;
  /** Line number in the file */
  line: number | null;
  /** Original line (for multi-line comments) */
  originalLine: number | null;
  /** Side of the diff (LEFT or RIGHT) */
  side: "LEFT" | "RIGHT" | null;
  /** Comment body */
  body: string;
  /** Author login */
  author: string;
  /** Comment state */
  state: "PENDING" | "SUBMITTED" | "DISMISSED" | null;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
  /** URL to the comment */
  url: string;
}

/**
 * A review on a PR
 */
export interface Review {
  /** Review ID */
  id: number;
  /** Review author */
  author: string;
  /** Review state */
  state: "PENDING" | "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED";
  /** Review body */
  body: string;
  /** Submitted timestamp */
  submittedAt: string;
  /** URL to the review */
  url: string;
}

/**
 * Reviews for a single repository
 */
export interface RepoReviews {
  /** Repository name */
  repo: string;
  /** Repository path */
  path: string;
  /** PR number if one exists */
  prNumber?: number;
  /** PR URL if one exists */
  prUrl?: string;
  /** Reviews on the PR */
  reviews: Review[];
  /** Review comments on the PR */
  comments: ReviewComment[];
  /** Error message if fetching failed */
  error?: string;
}

/**
 * Result of getting reviews for a context
 */
export interface ReviewsResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Reviews grouped by repo */
  repoReviews: RepoReviews[];
  /** Total review count */
  totalReviews: number;
  /** Total comment count */
  totalComments: number;
  /** Error message if the operation failed */
  error?: string;
}

/**
 * Options for getting reviews
 */
export interface ReviewsOptions {
  /** Only include unresolved/pending reviews (default: true) */
  pendingOnly?: boolean;
  /** Include review comments with file locations (default: true) */
  includeComments?: boolean;
  /** Timeout in milliseconds (default: 15000) */
  timeout?: number;
}

/**
 * Raw review data from gh CLI
 */
interface GhReviewData {
  id: string;
  author: { login: string };
  state: string;
  body: string;
  submittedAt: string;
  url: string;
}

/**
 * Raw review comment data from gh API
 */
interface GhReviewCommentData {
  id: number;
  path: string;
  line: number | null;
  original_line: number | null;
  side: string | null;
  body: string;
  user: { login: string };
  state?: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

/**
 * Raw PR data from gh CLI
 */
interface GhPRReviewData {
  number: number;
  url: string;
  reviews: GhReviewData[];
}

/**
 * Get reviews for a single repository
 */
async function getReviewsForRepo(
  repo: RepoInfo | WorktreeInfo,
  options: ReviewsOptions = {}
): Promise<RepoReviews> {
  const { pendingOnly = true, includeComments = true, timeout = 15000 } = options;

  try {
    // Get PR reviews using gh CLI
    const { stdout: prStdout } = await execAsync("gh pr view --json number,url,reviews", {
      cwd: repo.path,
      timeout,
    });

    const prData: GhPRReviewData = JSON.parse(prStdout);

    // Parse reviews
    let reviews: Review[] = prData.reviews.map((r) => ({
      id: Number.parseInt(r.id, 10),
      author: r.author.login,
      state: r.state.toUpperCase() as Review["state"],
      body: r.body || "",
      submittedAt: r.submittedAt,
      url: r.url,
    }));

    // Filter to pending/changes_requested if requested
    if (pendingOnly) {
      reviews = reviews.filter(
        (r) => r.state === "CHANGES_REQUESTED" || r.state === "PENDING" || r.state === "COMMENTED"
      );
    }

    // Get review comments with file locations using gh api
    let comments: ReviewComment[] = [];
    if (includeComments) {
      try {
        const { stdout: commentsStdout } = await execAsync(
          `gh api repos/{owner}/{repo}/pulls/${prData.number}/comments`,
          { cwd: repo.path, timeout }
        );

        const commentsData: GhReviewCommentData[] = JSON.parse(commentsStdout);

        comments = commentsData.map((c) => ({
          id: c.id,
          path: c.path,
          line: c.line,
          originalLine: c.original_line,
          side: c.side?.toUpperCase() as ReviewComment["side"],
          body: c.body,
          author: c.user.login,
          state: c.state?.toUpperCase() as ReviewComment["state"],
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          url: c.html_url,
        }));
      } catch {
        // Review comments API failed, but we still have reviews
        // This can happen if there are no comments
      }
    }

    return {
      repo: repo.name,
      path: repo.path,
      prNumber: prData.number,
      prUrl: prData.url,
      reviews,
      comments,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it's a "no PR" error
    if (
      errorMessage.includes("no pull requests found") ||
      errorMessage.includes("no open pull requests")
    ) {
      return {
        repo: repo.name,
        path: repo.path,
        reviews: [],
        comments: [],
      };
    }

    return {
      repo: repo.name,
      path: repo.path,
      reviews: [],
      comments: [],
      error: errorMessage,
    };
  }
}

/**
 * Get reviews for all repos/worktrees in the context
 */
export async function getReviewsForContext(
  context: RepoContext,
  options: ReviewsOptions = {}
): Promise<ReviewsResult> {
  // Check if gh CLI is available
  const ghAvailable = await isGhCliAvailable();
  if (!ghAvailable) {
    return {
      success: false,
      repoReviews: [],
      totalReviews: 0,
      totalComments: 0,
      error:
        "GitHub CLI (gh) is not installed or not authenticated. Install from https://cli.github.com/",
    };
  }

  // Determine which repos to check - prefer worktrees for PR reviews
  const reposToCheck: Array<RepoInfo | WorktreeInfo> = context.worktrees ?? context.repos;

  // Get reviews for each repo in parallel
  const repoReviews = await Promise.all(
    reposToCheck.map((repo) => getReviewsForRepo(repo, options))
  );

  // Calculate totals
  const totalReviews = repoReviews.reduce((sum, rr) => sum + rr.reviews.length, 0);
  const totalComments = repoReviews.reduce((sum, rr) => sum + rr.comments.length, 0);

  return {
    success: true,
    repoReviews,
    totalReviews,
    totalComments,
  };
}

/**
 * Format reviews for console output
 */
export function formatReviews(result: ReviewsResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  const lines: string[] = [];

  lines.push("PR Reviews:");
  lines.push("");

  for (const repoReview of result.repoReviews) {
    const prInfo = repoReview.prNumber ? `PR #${repoReview.prNumber}` : "no PR";
    lines.push(
      `  ${repoReview.repo}: ${prInfo} - ${repoReview.reviews.length} reviews, ${repoReview.comments.length} comments`
    );

    if (repoReview.error) {
      lines.push(`    Error: ${repoReview.error}`);
      continue;
    }

    // Show reviews
    for (const review of repoReview.reviews) {
      const stateIcon = getReviewStateIcon(review.state);
      const bodyPreview = review.body
        ? ` - ${review.body.substring(0, 50)}${review.body.length > 50 ? "..." : ""}`
        : "";
      lines.push(`    ${stateIcon} ${review.author}: ${review.state}${bodyPreview}`);
    }

    // Show comments with file locations
    for (const comment of repoReview.comments) {
      const location = comment.line ? `${comment.path}:${comment.line}` : comment.path;
      const bodyPreview = comment.body.substring(0, 40);
      lines.push(`      📝 ${comment.author} at ${location}: ${bodyPreview}...`);
    }
  }

  lines.push("");
  lines.push(`Total: ${result.totalReviews} reviews, ${result.totalComments} comments`);

  return lines.join("\n");
}

/**
 * Get icon for review state
 */
function getReviewStateIcon(state: Review["state"]): string {
  switch (state) {
    case "APPROVED":
      return "✓";
    case "CHANGES_REQUESTED":
      return "✗";
    case "COMMENTED":
      return "💬";
    case "PENDING":
      return "⏳";
    case "DISMISSED":
      return "○";
    default:
      return "?";
  }
}
