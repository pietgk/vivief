/**
 * GitHub integration via gh CLI
 */

import { execa } from "execa";
import type { GitHubIssue } from "./types.js";

/**
 * Fetch issue details from GitHub
 *
 * @param issueNumber Issue number to fetch
 * @param repo Optional owner/repo (e.g., "pietgk/vivief"). If not provided, uses current repo.
 */
export async function fetchIssue(issueNumber: number, repo?: string): Promise<GitHubIssue> {
  const args = ["issue", "view", String(issueNumber), "--json", "number,title,body,state,labels"];

  if (repo) {
    args.push("-R", repo);
  }

  const { stdout } = await execa("gh", args);
  return JSON.parse(stdout) as GitHubIssue;
}

/**
 * Check if an issue exists and is open
 */
export async function isIssueOpen(issueNumber: number): Promise<boolean> {
  try {
    const issue = await fetchIssue(issueNumber);
    return issue.state === "OPEN";
  } catch {
    return false;
  }
}

/**
 * Get the current repository's GitHub remote info
 */
export async function getRepoInfo(): Promise<{ owner: string; repo: string } | null> {
  try {
    const { stdout } = await execa("gh", ["repo", "view", "--json", "owner,name"]);
    const data = JSON.parse(stdout);
    return { owner: data.owner.login, repo: data.name };
  } catch {
    return null;
  }
}

/**
 * Create a PR for a branch
 */
export async function createPR(options: {
  branch: string;
  title: string;
  body: string;
  issueNumber: number;
}): Promise<string> {
  const { stdout } = await execa("gh", [
    "pr",
    "create",
    "--head",
    options.branch,
    "--title",
    options.title,
    "--body",
    `${options.body}\n\nCloses #${options.issueNumber}`,
  ]);

  // Extract PR URL from output
  const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+/);
  return urlMatch ? urlMatch[0] : stdout;
}

/**
 * Check if a PR exists for a branch
 */
export async function getPRForBranch(
  branch: string
): Promise<{ url: string; state: string } | null> {
  try {
    const { stdout } = await execa("gh", ["pr", "view", branch, "--json", "url,state"]);
    const data = JSON.parse(stdout);
    return { url: data.url, state: data.state };
  } catch {
    return null;
  }
}

/**
 * Generate a kebab-case branch name from issue title
 */
export function generateBranchName(issueNumber: number, title: string): string {
  // Remove common prefixes like [Task]:, [Bug]:, etc.
  const cleanTitle = title.replace(/^\[[\w-]+\]:\s*/i, "");

  // Convert to kebab-case, max 4 words
  const kebab = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join("-");

  return `${issueNumber}-${kebab}`;
}

/**
 * Generate a short description from issue title
 */
export function generateShortDescription(title: string): string {
  // Remove common prefixes
  const cleanTitle = title.replace(/^\[[\w-]+\]:\s*/i, "");

  // Take first few words
  return cleanTitle
    .split(/\s+/)
    .slice(0, 3)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}
