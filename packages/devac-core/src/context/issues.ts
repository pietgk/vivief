/**
 * GitHub Issues Module
 *
 * Retrieves GitHub issues for repositories in the current context
 * using the GitHub CLI (gh).
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { RepoContext, RepoInfo, WorktreeInfo } from "./types.js";

const execAsync = promisify(exec);

/**
 * Label on a GitHub issue
 */
export interface IssueLabel {
  /** Label name */
  name: string;
}

/**
 * A GitHub issue
 */
export interface GitHubIssue {
  /** Issue number */
  number: number;
  /** Issue title */
  title: string;
  /** Issue body/description */
  body: string;
  /** Issue state */
  state: "OPEN" | "CLOSED";
  /** Issue URL */
  url: string;
  /** Labels on the issue */
  labels: IssueLabel[];
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}

/**
 * Issues for a single repository
 */
export interface RepoIssues {
  /** Repository name */
  repo: string;
  /** Repository path */
  path: string;
  /** Issues for this repo */
  issues: GitHubIssue[];
  /** Error message if fetching failed */
  error?: string;
}

/**
 * Result of getting issues for a context
 */
export interface IssuesResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Issues grouped by repo */
  repoIssues: RepoIssues[];
  /** Total issue count */
  totalIssues: number;
  /** Error message if the operation failed */
  error?: string;
}

/**
 * Options for getting issues
 */
export interface IssuesOptions {
  /** Only fetch open issues (default: true) */
  openOnly?: boolean;
  /** Maximum issues per repo (default: 50) */
  limit?: number;
  /** Filter by labels */
  labels?: string[];
  /** Filter by assignee */
  assignee?: string;
  /** Timeout in milliseconds (default: 15000) */
  timeout?: number;
}

/**
 * Raw issue data from gh CLI
 */
interface GhIssueData {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  labels: Array<{ name: string }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Check if gh CLI is available (reuse from ci-status)
 */
async function isGhCliAvailable(): Promise<boolean> {
  try {
    await execAsync("gh --version", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get issues for a single repository
 */
async function getIssuesForRepo(
  repo: RepoInfo | WorktreeInfo,
  options: IssuesOptions = {}
): Promise<RepoIssues> {
  const { openOnly = true, limit = 50, labels, assignee, timeout = 15000 } = options;

  try {
    // Build the gh issue list command
    const args: string[] = [
      "gh",
      "issue",
      "list",
      "--json",
      "number,title,body,state,url,labels,createdAt,updatedAt",
      "--limit",
      String(limit),
    ];

    if (openOnly) {
      args.push("--state", "open");
    }

    if (labels && labels.length > 0) {
      args.push("--label", labels.join(","));
    }

    if (assignee) {
      args.push("--assignee", assignee);
    }

    const { stdout } = await execAsync(args.join(" "), { cwd: repo.path, timeout });

    const issuesData: GhIssueData[] = JSON.parse(stdout);

    const issues: GitHubIssue[] = issuesData.map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || "",
      state: issue.state.toUpperCase() as "OPEN" | "CLOSED",
      url: issue.url,
      labels: issue.labels.map((l) => ({ name: l.name })),
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }));

    return {
      repo: repo.name,
      path: repo.path,
      issues,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      repo: repo.name,
      path: repo.path,
      issues: [],
      error: errorMessage,
    };
  }
}

/**
 * Get issues for all repos/worktrees in the context
 */
export async function getIssuesForContext(
  context: RepoContext,
  options: IssuesOptions = {}
): Promise<IssuesResult> {
  // Check if gh CLI is available
  const ghAvailable = await isGhCliAvailable();
  if (!ghAvailable) {
    return {
      success: false,
      repoIssues: [],
      totalIssues: 0,
      error:
        "GitHub CLI (gh) is not installed or not authenticated. Install from https://cli.github.com/",
    };
  }

  // Determine which repos to check - prefer main repos over worktrees for issues
  const reposToCheck: Array<RepoInfo | WorktreeInfo> = context.repos;

  // Get issues for each repo in parallel
  const repoIssues = await Promise.all(reposToCheck.map((repo) => getIssuesForRepo(repo, options)));

  // Calculate total issues
  const totalIssues = repoIssues.reduce((sum, ri) => sum + ri.issues.length, 0);

  return {
    success: true,
    repoIssues,
    totalIssues,
  };
}

/**
 * Format issues for console output
 */
export function formatIssues(result: IssuesResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  const lines: string[] = [];

  lines.push("GitHub Issues:");
  lines.push("");

  for (const repoIssue of result.repoIssues) {
    lines.push(`  ${repoIssue.repo}: ${repoIssue.issues.length} issues`);

    if (repoIssue.error) {
      lines.push(`    Error: ${repoIssue.error}`);
      continue;
    }

    for (const issue of repoIssue.issues) {
      const labelsStr =
        issue.labels.length > 0 ? ` [${issue.labels.map((l) => l.name).join(", ")}]` : "";
      // Truncate long titles
      const maxTitleLength = 60;
      const title =
        issue.title.length > maxTitleLength
          ? `${issue.title.substring(0, maxTitleLength)}...`
          : issue.title;
      lines.push(`    #${issue.number}: ${title}${labelsStr}`);
    }
  }

  lines.push("");
  lines.push(`Total: ${result.totalIssues} issues`);

  return lines.join("\n");
}
