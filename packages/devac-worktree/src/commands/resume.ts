/**
 * Resume command - Resume work on an existing worktree
 */

import { isClaudeInstalled, launchClaude, writeIssueContext } from "../claude.js";
import { fetchIssue } from "../github.js";
import type { StartResult } from "../types.js";
import { findWorktreeForIssue, loadState } from "../worktree.js";

export interface ResumeOptions {
  issueNumber: number;
  newSession?: boolean;
  verbose?: boolean;
}

export async function resumeCommand(options: ResumeOptions): Promise<StartResult> {
  const { issueNumber, newSession, verbose } = options;

  // Check if Claude is installed
  if (newSession) {
    const claudeInstalled = await isClaudeInstalled();
    if (!claudeInstalled) {
      return {
        success: false,
        error:
          "Claude CLI is not installed. Install it with: npm install -g @anthropic-ai/claude-code",
      };
    }
  }

  // Find existing worktree
  const worktreePath = await findWorktreeForIssue(issueNumber);
  if (!worktreePath) {
    return {
      success: false,
      error: `No worktree found for issue #${issueNumber}. Use 'devac-worktree start' to create one.`,
    };
  }

  // Get worktree info from state
  const state = await loadState();
  const worktreeInfo = state.worktrees.find((w) => w.issueNumber === issueNumber);

  if (!worktreeInfo) {
    return {
      success: false,
      error: `Worktree state not found for issue #${issueNumber}`,
    };
  }

  // Fetch fresh issue details
  if (verbose) {
    console.log(`Fetching issue #${issueNumber}...`);
  }

  let issue: Awaited<ReturnType<typeof fetchIssue>> | undefined;
  try {
    issue = await fetchIssue(issueNumber);
  } catch (err) {
    // Continue even if we can't fetch the issue
    if (verbose) {
      console.warn(
        `Warning: Could not fetch issue: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Update issue context if we have fresh data
  if (issue) {
    await writeIssueContext(issue, worktreePath);
  }

  // Launch Claude CLI
  if (newSession) {
    console.log(`\n✓ Resuming work on issue #${issueNumber}`);
    console.log(`✓ Worktree: ${worktreePath}`);
    console.log(`✓ Branch: ${worktreeInfo.branch}`);
    if (issue) {
      console.log("✓ Issue context updated at ~/.devac/issue-context.md");
    }
    console.log("\nLaunching Claude CLI in worktree...\n");

    try {
      await launchClaude(worktreePath);
    } catch {
      // Claude exited - this is normal
      if (verbose) {
        console.log("Claude CLI session ended");
      }
    }
  }

  return {
    success: true,
    worktreePath,
    branch: worktreeInfo.branch,
    issueNumber,
  };
}
