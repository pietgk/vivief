/**
 * Clean command - Remove worktree and optionally delete branch
 */

import * as readline from "node:readline";
import { getPRForBranch } from "../github.js";
import type { CleanResult } from "../types.js";
import {
  checkWorktreeStatus,
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
  skipPrCheck?: boolean;
  keepBranch?: boolean;
  yes?: boolean;
  verbose?: boolean;
}

/**
 * Prompt user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

export async function cleanCommand(options: CleanOptions): Promise<CleanResult> {
  const { issueNumber, force, skipPrCheck, keepBranch, yes, verbose } = options;

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

  // Pre-check: Report potential blockers
  const blockers: string[] = [];

  // Check 1: Worktree cleanliness
  const wtStatus = await checkWorktreeStatus(worktreePath);
  if (!wtStatus.isClean) {
    const fileCount = wtStatus.modifiedFiles.length + wtStatus.untrackedFiles.length;
    blockers.push(`Worktree has ${fileCount} modified/untracked file(s)`);

    if (verbose) {
      if (wtStatus.modifiedFiles.length > 0) {
        console.log("\nModified files:");
        for (const file of wtStatus.modifiedFiles.slice(0, 10)) {
          console.log(`  - ${file}`);
        }
        if (wtStatus.modifiedFiles.length > 10) {
          console.log(`  ... and ${wtStatus.modifiedFiles.length - 10} more`);
        }
      }
      if (wtStatus.untrackedFiles.length > 0) {
        console.log("\nUntracked files:");
        for (const file of wtStatus.untrackedFiles.slice(0, 10)) {
          console.log(`  - ${file}`);
        }
        if (wtStatus.untrackedFiles.length > 10) {
          console.log(`  ... and ${wtStatus.untrackedFiles.length - 10} more`);
        }
      }
    }
  }

  // Check 2: PR status (unless skipping)
  let prState: string | null = null;
  if (!force && !skipPrCheck) {
    try {
      const pr = await getPRForBranch(worktreeInfo.branch);
      if (pr) {
        prState = pr.state;
        if (pr.state !== "MERGED") {
          blockers.push(`PR is not merged (state: ${pr.state})`);
        }
      } else {
        // No PR found - this might be okay (issue closed as "not planned")
        if (verbose) {
          console.log("\nNote: No PR found for this branch.");
        }
      }
    } catch {
      // Could not check PR - continue with warning
      if (verbose) {
        console.log("\nNote: Could not check PR status.");
      }
    }
  }

  // Report blockers and decide action
  if (blockers.length > 0 && !force) {
    console.log("\n\u26a0\ufe0f  Potential issues detected:\n");
    for (const blocker of blockers) {
      console.log(`  - ${blocker}`);
    }
    console.log("");

    // Suggest appropriate flags
    if (!wtStatus.isClean && prState !== "MERGED" && prState !== null) {
      console.log("To proceed:");
      console.log("  --force         Skip PR check AND remove dirty worktree");
      console.log("  --skip-pr-check Skip PR validation only");
    } else if (!wtStatus.isClean) {
      console.log("Use --force to remove worktree with modified/untracked files.");
    } else {
      console.log("Use --skip-pr-check to remove worktree without merged PR.");
    }

    return {
      success: false,
      error: "Clean blocked. See issues above.",
    };
  }

  // Confirmation for destructive operations
  if (!yes && !wtStatus.isClean) {
    console.log(`\n\u26a0\ufe0f  Worktree at ${worktreePath} has unsaved changes.`);
    const confirmed = await confirm("Are you sure you want to delete it?");
    if (!confirmed) {
      return {
        success: false,
        error: "Cancelled by user.",
      };
    }
  }

  // Remove worktree
  if (verbose) {
    console.log(`Removing worktree at ${worktreePath}...`);
  }

  try {
    // Use git force only if worktree is dirty or force was requested
    await removeWorktree(worktreePath, { force: force || !wtStatus.isClean });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Provide better error message
    if (errorMsg.includes("modified or untracked files")) {
      return {
        success: false,
        error:
          "Worktree has uncommitted changes. Use --force to delete anyway, or commit/stash your changes first.",
      };
    }

    return {
      success: false,
      error: `Failed to remove worktree: ${errorMsg}`,
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
export async function cleanMergedCommand(options: { verbose?: boolean; yes?: boolean }): Promise<{
  success: boolean;
  cleaned: number;
  errors: string[];
}> {
  const { verbose, yes } = options;
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
          skipPrCheck: true, // We already checked PR is merged
          yes, // Pass through the yes flag
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
