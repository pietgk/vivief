/**
 * List command - Show all active worktrees
 */

import type { ListResult } from "../types.js";
import { loadState, syncState } from "../worktree.js";

export interface ListOptions {
  verbose?: boolean;
  json?: boolean;
}

export async function listCommand(_options: ListOptions): Promise<ListResult> {
  // Sync state with actual git worktrees first
  await syncState();

  const state = await loadState();

  return {
    success: true,
    worktrees: state.worktrees,
  };
}

/**
 * Format worktree list for display
 */
export function formatWorktreeList(
  worktrees: ListResult["worktrees"],
  options?: { verbose?: boolean }
): string {
  if (worktrees.length === 0) {
    return "No active worktrees";
  }

  const lines: string[] = [`Active worktrees (${worktrees.length}):\n`];

  for (const wt of worktrees) {
    lines.push(`  #${wt.issueNumber} ${wt.issueTitle}`);
    lines.push(`    Path: ${wt.path}`);
    lines.push(`    Branch: ${wt.branch}`);
    if (options?.verbose) {
      lines.push(`    Created: ${wt.createdAt}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
