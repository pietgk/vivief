/**
 * Status command - Show worktrees with issue state and PR status
 */

import * as path from "node:path";
import { discoverContext, extractIssueNumber } from "@pietgk/devac-core";
import { fetchIssue, getPRForBranch } from "../github.js";
import type { StatusResult, WorktreeInfo } from "../types.js";
import { loadState, syncState } from "../worktree.js";

export interface StatusOptions {
  verbose?: boolean;
  json?: boolean;
  /** Show status for all worktrees related to current issue (cross-repo) */
  issueWide?: boolean;
}

export async function statusCommand(options: StatusOptions): Promise<StatusResult> {
  // Sync state with actual git worktrees first
  await syncState();

  const state = await loadState();
  const cwd = process.cwd();
  const currentDirName = path.basename(cwd);
  const currentIssueNumber = extractIssueNumber(currentDirName);

  // If we're in an issue worktree, show issue-wide status
  if (currentIssueNumber || options.issueWide) {
    return statusCommandIssueWide(currentIssueNumber, options);
  }

  const worktreesWithStatus: StatusResult["worktrees"] = [];

  for (const wt of state.worktrees) {
    const status = await fetchWorktreeStatus(wt);
    worktreesWithStatus.push(status);
  }

  return {
    success: true,
    worktrees: worktreesWithStatus,
  };
}

/**
 * Fetch status for a single worktree
 */
async function fetchWorktreeStatus(wt: WorktreeInfo): Promise<StatusResult["worktrees"][0]> {
  let issueState = "unknown";
  let prUrl: string | undefined;

  // Fetch issue state
  try {
    const issue = await fetchIssue(wt.issueNumber);
    issueState = issue.state.toLowerCase();
  } catch {
    issueState = "not found";
  }

  // Check for PR
  try {
    const pr = await getPRForBranch(wt.branch);
    if (pr) {
      prUrl = pr.url;
      // Override issue state if PR is merged
      if (pr.state === "MERGED") {
        issueState = "merged";
      }
    }
  } catch {
    // No PR found
  }

  return {
    ...wt,
    issueState,
    prUrl,
  };
}

/**
 * Show status for all worktrees related to an issue across repos
 */
async function statusCommandIssueWide(
  issueNumber: number | null,
  _options: StatusOptions
): Promise<StatusResult> {
  const cwd = process.cwd();
  const context = await discoverContext(cwd);

  // If no issue number from current dir, try to find from context
  const targetIssue = issueNumber ?? context.issueNumber;

  if (!targetIssue) {
    // Fall back to regular status
    const state = await loadState();
    const worktreesWithStatus: StatusResult["worktrees"] = [];
    for (const wt of state.worktrees) {
      const status = await fetchWorktreeStatus(wt);
      worktreesWithStatus.push(status);
    }
    return { success: true, worktrees: worktreesWithStatus };
  }

  const worktreesWithStatus: StatusResult["worktrees"] = [];

  // Process worktrees from context discovery (cross-repo)
  if (context.worktrees && context.worktrees.length > 0) {
    for (const wt of context.worktrees) {
      if (wt.issueNumber === targetIssue) {
        // Create a WorktreeInfo-like object from context worktree
        const wtInfo: WorktreeInfo = {
          path: wt.path,
          branch: wt.branch,
          issueNumber: wt.issueNumber,
          issueTitle: "", // Will be filled by status fetch
          createdAt: "",
          repoRoot: wt.mainRepoPath,
        };
        const status = await fetchWorktreeStatus(wtInfo);
        // Add repo name for display
        worktreesWithStatus.push({
          ...status,
          issueTitle: status.issueTitle || `${wt.mainRepoName} worktree`,
        });
      }
    }
  }

  // Also include worktrees from local state for the same issue
  const state = await loadState();
  for (const wt of state.worktrees) {
    if (wt.issueNumber === targetIssue) {
      // Check if not already included from context
      const alreadyIncluded = worktreesWithStatus.some((w) => w.path === wt.path);
      if (!alreadyIncluded) {
        const status = await fetchWorktreeStatus(wt);
        worktreesWithStatus.push(status);
      }
    }
  }

  return {
    success: true,
    worktrees: worktreesWithStatus,
    issueNumber: targetIssue,
  };
}

/**
 * Format status for display
 */
export function formatStatus(
  worktrees: StatusResult["worktrees"],
  options?: { verbose?: boolean; issueNumber?: number }
): string {
  if (worktrees.length === 0) {
    return "No active worktrees";
  }

  const lines: string[] = [];

  // Show issue-wide header if tracking a specific issue
  if (options?.issueNumber) {
    lines.push(`Issue #${options.issueNumber} - Worktrees (${worktrees.length}):\n`);
  } else {
    lines.push(`Worktree Status (${worktrees.length}):\n`);
  }

  for (const wt of worktrees) {
    const statusIcon = getStatusIcon(wt.issueState);
    const repoName = path.basename(wt.repoRoot);

    // Show repo name for issue-wide view
    if (options?.issueNumber) {
      lines.push(`  ${statusIcon} [${repoName}] ${wt.issueTitle || wt.branch}`);
    } else {
      lines.push(`  ${statusIcon} #${wt.issueNumber} ${wt.issueTitle}`);
    }

    lines.push(`    Issue: ${wt.issueState}`);
    lines.push(`    Path: ${wt.path}`);
    lines.push(`    Branch: ${wt.branch}`);
    if (wt.prUrl) {
      lines.push(`    PR: ${wt.prUrl}`);
    }
    if (options?.verbose) {
      lines.push(`    Created: ${wt.createdAt}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function getStatusIcon(state: string): string {
  switch (state) {
    case "open":
      return "🔵";
    case "closed":
      return "🟢";
    case "merged":
      return "🟣";
    default:
      return "⚪";
  }
}
