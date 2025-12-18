/**
 * Clean command - Remove worktree and optionally delete branch
 */

import { getPRForBranch } from "../github.js";
import type { CleanResult } from "../types.js";
import {
  deleteBranch,
  findWorktreeForIssue,
  loadState,
  pruneWorktrees,
  removeWorktree,
  removeWorktreeFromState,
} from "../worktree.js";

export interface CleanOptions {
  issueNumber: number;
  force?: boolean;
  keepBranch?: boolean;
  verbose?: boolean;
}

export async function cleanCommand(options: CleanOptions): Promise<CleanResult> {
  const { issueNumber, force, keepBranch, verbose } = options;

  // Find worktree
  const worktreePath = await findWorktreeForIssue(issueNumber);
  if (!worktreePath) {
    return {
      success: false,
      error: `No worktree found for issue #${issueNumber}`,
    };
  }

  // Get worktree info for branch name
  const state = await loadState();
  const worktreeInfo = state.worktrees.find((w) => w.issueNumber === issueNumber);

  if (!worktreeInfo) {
    return {
      success: false,
      error: `Worktree state not found for issue #${issueNumber}`,
    };
  }

  // Check if PR is merged (if not forcing)
  if (!force) {
    try {
      const pr = await getPRForBranch(worktreeInfo.branch);
      if (pr && pr.state !== "MERGED") {
        return {
          success: false,
          error: `PR for branch ${worktreeInfo.branch} is not merged (state: ${pr.state}). Use --force to remove anyway.`,
        };
      }
    } catch {
      // No PR found - that's okay
    }
  }

  // Remove worktree
  if (verbose) {
    console.log(`Removing worktree at ${worktreePath}...`);
  }

  try {
    await removeWorktree(worktreePath, { force });
  } catch (error) {
    return {
      success: false,
      error: `Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Remove from state
  await removeWorktreeFromState(issueNumber);

  // Delete branch if requested
  if (!keepBranch) {
    if (verbose) {
      console.log(`Deleting branch ${worktreeInfo.branch}...`);
    }
    try {
      await deleteBranch(worktreeInfo.branch, { force });
    } catch (error) {
      if (verbose) {
        console.warn(
          `Warning: Could not delete branch: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      // Don't fail the command if branch deletion fails
    }
  }

  // Prune stale worktree references
  await pruneWorktrees();

  return {
    success: true,
    removed: worktreePath,
  };
}

/**
 * Clean all worktrees for merged PRs
 */
export async function cleanMergedCommand(options: { verbose?: boolean }): Promise<{
  success: boolean;
  cleaned: number;
  errors: string[];
}> {
  const { verbose } = options;
  const state = await loadState();
  let cleaned = 0;
  const errors: string[] = [];

  for (const wt of state.worktrees) {
    try {
      const pr = await getPRForBranch(wt.branch);
      if (pr && pr.state === "MERGED") {
        if (verbose) {
          console.log(`Cleaning merged worktree for issue #${wt.issueNumber}...`);
        }

        const result = await cleanCommand({
          issueNumber: wt.issueNumber,
          verbose,
        });

        if (result.success) {
          cleaned++;
        } else {
          errors.push(`Issue #${wt.issueNumber}: ${result.error}`);
        }
      }
    } catch {
      // No PR found or error checking - skip
      if (verbose) {
        console.log(`Skipping issue #${wt.issueNumber} - no PR found`);
      }
    }
  }

  return {
    success: errors.length === 0,
    cleaned,
    errors,
  };
}
