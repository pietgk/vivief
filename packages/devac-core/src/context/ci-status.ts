/**
 * CI Status Module
 *
 * Retrieves GitHub Actions CI status for PRs in the current context
 * using the GitHub CLI (gh).
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { RepoContext, RepoInfo, WorktreeInfo } from "./types.js";

const execAsync = promisify(exec);

/**
 * Status of a single CI check
 */
export interface CheckStatus {
  /** Name of the check */
  name: string;
  /** Check status */
  status: "queued" | "in_progress" | "completed";
  /** Check conclusion (only if completed) */
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out";
  /** URL to the check details */
  detailsUrl?: string;
}

/**
 * CI status for a repository/worktree
 */
export interface CIStatus {
  /** Repository name */
  repo: string;
  /** Repository path */
  path: string;
  /** PR number if one exists */
  prNumber?: number;
  /** PR URL if one exists */
  prUrl?: string;
  /** PR title */
  prTitle?: string;
  /** Overall CI status */
  status: "passing" | "failing" | "pending" | "no-pr" | "unknown";
  /** Individual check statuses */
  checks?: CheckStatus[];
  /** Error message if status couldn't be determined */
  error?: string;
}

/**
 * Result of getting CI status for a context
 */
export interface CIStatusResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** CI statuses for each repo */
  statuses: CIStatus[];
  /** Overall summary */
  summary: {
    total: number;
    passing: number;
    failing: number;
    pending: number;
    noPr: number;
    unknown: number;
  };
  /** Error message if the operation failed */
  error?: string;
}

/**
 * Options for getting CI status
 */
export interface CIStatusOptions {
  /** Include individual check details (default: false) */
  includeChecks?: boolean;
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Raw PR data from gh CLI
 */
interface GhPRData {
  number: number;
  url: string;
  title: string;
  state: string;
  statusCheckRollup?: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    detailsUrl?: string;
  }>;
}

/**
 * Check if gh CLI is available
 */
export async function isGhCliAvailable(): Promise<boolean> {
  try {
    await execAsync("gh --version", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get CI status for a single repository
 */
async function getCIStatusForRepo(
  repo: RepoInfo | WorktreeInfo,
  options: CIStatusOptions = {}
): Promise<CIStatus> {
  const { includeChecks = false, timeout = 10000 } = options;

  try {
    // Get current branch PR status using gh CLI
    const { stdout } = await execAsync(
      "gh pr view --json number,url,title,state,statusCheckRollup",
      { cwd: repo.path, timeout }
    );

    const prData: GhPRData = JSON.parse(stdout);

    // Parse the status check rollup
    const checks: CheckStatus[] = [];
    let overallStatus: CIStatus["status"] = "passing";

    if (prData.statusCheckRollup && prData.statusCheckRollup.length > 0) {
      for (const check of prData.statusCheckRollup) {
        const checkStatus: CheckStatus = {
          name: check.name,
          status: check.status.toLowerCase() as CheckStatus["status"],
          conclusion: check.conclusion?.toLowerCase() as CheckStatus["conclusion"],
          detailsUrl: check.detailsUrl,
        };

        if (includeChecks) {
          checks.push(checkStatus);
        }

        // Determine overall status based on checks
        if (check.status === "IN_PROGRESS" || check.status === "QUEUED") {
          if (overallStatus === "passing") {
            overallStatus = "pending";
          }
        } else if (check.conclusion === "FAILURE" || check.conclusion === "TIMED_OUT") {
          overallStatus = "failing";
        } else if (check.conclusion === "CANCELLED") {
          if (overallStatus !== "failing") {
            overallStatus = "pending";
          }
        }
      }
    } else {
      // No checks configured or completed yet
      overallStatus = "pending";
    }

    return {
      repo: repo.name,
      path: repo.path,
      prNumber: prData.number,
      prUrl: prData.url,
      prTitle: prData.title,
      status: overallStatus,
      checks: includeChecks ? checks : undefined,
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
        status: "no-pr",
      };
    }

    return {
      repo: repo.name,
      path: repo.path,
      status: "unknown",
      error: errorMessage,
    };
  }
}

/**
 * Get CI status for all repos/worktrees in the context
 */
export async function getCIStatusForContext(
  context: RepoContext,
  options: CIStatusOptions = {}
): Promise<CIStatusResult> {
  // Check if gh CLI is available
  const ghAvailable = await isGhCliAvailable();
  if (!ghAvailable) {
    return {
      success: false,
      statuses: [],
      summary: { total: 0, passing: 0, failing: 0, pending: 0, noPr: 0, unknown: 0 },
      error:
        "GitHub CLI (gh) is not installed or not authenticated. Install from https://cli.github.com/",
    };
  }

  // Determine which repos to check
  // If we're in an issue worktree context, check all worktrees for that issue
  // Otherwise, check all repos
  const reposToCheck: Array<RepoInfo | WorktreeInfo> = context.worktrees ?? context.repos;

  // Get CI status for each repo in parallel
  const statuses = await Promise.all(reposToCheck.map((repo) => getCIStatusForRepo(repo, options)));

  // Calculate summary
  const summary = {
    total: statuses.length,
    passing: statuses.filter((s) => s.status === "passing").length,
    failing: statuses.filter((s) => s.status === "failing").length,
    pending: statuses.filter((s) => s.status === "pending").length,
    noPr: statuses.filter((s) => s.status === "no-pr").length,
    unknown: statuses.filter((s) => s.status === "unknown").length,
  };

  return {
    success: true,
    statuses,
    summary,
  };
}

/**
 * Format CI status for console output
 */
export function formatCIStatus(result: CIStatusResult): string {
  if (!result.success) {
    return `❌ ${result.error}`;
  }

  const lines: string[] = [];

  // Header
  lines.push("CI Status:");
  lines.push("");

  // Status for each repo
  for (const status of result.statuses) {
    const icon = getStatusIcon(status.status);
    const prInfo = status.prNumber ? `PR #${status.prNumber}` : "no PR";

    let line = `  ${icon} ${status.repo}: ${prInfo}`;

    if (status.prTitle) {
      // Truncate long titles
      const maxTitleLength = 50;
      const title =
        status.prTitle.length > maxTitleLength
          ? `${status.prTitle.substring(0, maxTitleLength)}...`
          : status.prTitle;
      line += ` - ${title}`;
    }

    lines.push(line);

    // Show individual checks if available
    if (status.checks && status.checks.length > 0) {
      for (const check of status.checks) {
        const checkIcon = getCheckIcon(check);
        lines.push(`      ${checkIcon} ${check.name}`);
      }
    }

    // Show error if any
    if (status.error) {
      lines.push(`      ⚠️  ${status.error}`);
    }
  }

  // Summary
  lines.push("");
  lines.push(
    `Summary: ${result.summary.passing} passing, ${result.summary.failing} failing, ` +
      `${result.summary.pending} pending, ${result.summary.noPr} no PR`
  );

  return lines.join("\n");
}

/**
 * Get status icon for a CI status
 */
function getStatusIcon(status: CIStatus["status"]): string {
  switch (status) {
    case "passing":
      return "✓";
    case "failing":
      return "✗";
    case "pending":
      return "⏳";
    case "no-pr":
      return "○";
    case "unknown":
      return "?";
  }
}

/**
 * Get icon for a check status
 */
function getCheckIcon(check: CheckStatus): string {
  if (check.status === "in_progress" || check.status === "queued") {
    return "⏳";
  }
  if (check.conclusion === "success") {
    return "✓";
  }
  if (check.conclusion === "failure" || check.conclusion === "timed_out") {
    return "✗";
  }
  if (check.conclusion === "skipped" || check.conclusion === "neutral") {
    return "○";
  }
  return "?";
}
