/**
 * Status command - Show worktrees with issue state and PR status
 */

import { fetchIssue, getPRForBranch } from "../github.js";
import type { StatusResult } from "../types.js";
import { loadState, syncState } from "../worktree.js";

export interface StatusOptions {
  verbose?: boolean;
  json?: boolean;
}

export async function statusCommand(_options: StatusOptions): Promise<StatusResult> {
  // Sync state with actual git worktrees first
  await syncState();

  const state = await loadState();

  const worktreesWithStatus: StatusResult["worktrees"] = [];

  for (const wt of state.worktrees) {
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

    worktreesWithStatus.push({
      ...wt,
      issueState,
      prUrl,
    });
  }

  return {
    success: true,
    worktrees: worktreesWithStatus,
  };
}

/**
 * Format status for display
 */
export function formatStatus(
  worktrees: StatusResult["worktrees"],
  options?: { verbose?: boolean }
): string {
  if (worktrees.length === 0) {
    return "No active worktrees";
  }

  const lines: string[] = [`Worktree Status (${worktrees.length}):\n`];

  for (const wt of worktrees) {
    const statusIcon = getStatusIcon(wt.issueState);
    lines.push(`  ${statusIcon} #${wt.issueNumber} ${wt.issueTitle}`);
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
