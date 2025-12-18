/**
 * Start command - Create worktree and launch Claude for an issue
 */

import { isClaudeInstalled, launchClaude, writeIssueContext } from "../claude.js";
import { hasNodeModules, installDependencies } from "../deps.js";
import { createPR, fetchIssue, generateBranchName, generateShortDescription } from "../github.js";
import type { StartResult, WorktreeInfo } from "../types.js";
import {
  addWorktreeToState,
  calculateWorktreePath,
  createWorktree,
  findWorktreeForIssue,
  getRepoRoot,
} from "../worktree.js";

export interface StartOptions {
  issueNumber: number;
  skipInstall?: boolean;
  skipClaude?: boolean;
  createPr?: boolean;
  verbose?: boolean;
}

export async function startCommand(options: StartOptions): Promise<StartResult> {
  const { issueNumber, skipInstall, skipClaude, createPr, verbose } = options;

  // Check if Claude is installed
  if (!skipClaude) {
    const claudeInstalled = await isClaudeInstalled();
    if (!claudeInstalled) {
      return {
        success: false,
        error:
          "Claude CLI is not installed. Install it with: npm install -g @anthropic-ai/claude-code",
      };
    }
  }

  // Check if worktree already exists for this issue
  const existingPath = await findWorktreeForIssue(issueNumber);
  if (existingPath) {
    if (verbose) {
      console.log(`Worktree already exists at ${existingPath}`);
      console.log("Use 'devac-worktree resume' to continue working on it");
    }
    return {
      success: true,
      worktreePath: existingPath,
      issueNumber,
      error: "Worktree already exists. Use 'devac-worktree resume' to continue.",
    };
  }

  // Fetch issue details
  if (verbose) {
    console.log(`Fetching issue #${issueNumber}...`);
  }

  let issue: Awaited<ReturnType<typeof fetchIssue>>;
  try {
    issue = await fetchIssue(issueNumber);
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch issue #${issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (issue.state !== "OPEN") {
    return {
      success: false,
      error: `Issue #${issueNumber} is ${issue.state.toLowerCase()}, not open`,
    };
  }

  // Generate branch name and worktree path
  const branch = generateBranchName(issueNumber, issue.title);
  const shortDesc = generateShortDescription(issue.title);
  const worktreePath = await calculateWorktreePath(issueNumber, shortDesc);

  if (verbose) {
    console.log(`Creating worktree at ${worktreePath}`);
    console.log(`Branch: ${branch}`);
  }

  // Create the worktree
  try {
    await createWorktree({ branch, worktreePath });
  } catch (error) {
    return {
      success: false,
      error: `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Save to state
  const repoRoot = await getRepoRoot();
  const worktreeInfo: WorktreeInfo = {
    path: worktreePath,
    branch,
    issueNumber,
    issueTitle: issue.title,
    createdAt: new Date().toISOString(),
    repoRoot,
  };
  await addWorktreeToState(worktreeInfo);

  // Install dependencies if needed
  if (!skipInstall) {
    const needsInstall = !(await hasNodeModules(worktreePath));
    if (needsInstall) {
      if (verbose) {
        console.log("Installing dependencies...");
      }
      const installResult = await installDependencies(worktreePath, { verbose });
      if (!installResult.success) {
        console.warn(`Warning: Failed to install dependencies: ${installResult.error}`);
      } else if (verbose) {
        console.log(`Dependencies installed using ${installResult.manager}`);
      }
    }
  }

  // Create draft PR if requested
  if (createPr) {
    if (verbose) {
      console.log("Creating draft PR...");
    }
    try {
      const prUrl = await createPR({
        branch,
        title: `WIP: ${issue.title}`,
        body: `## Summary\n\nWork in progress for issue #${issueNumber}.\n\n## Status\n\n- [ ] Implementation in progress`,
        issueNumber,
      });
      if (verbose) {
        console.log(`PR created: ${prUrl}`);
      }
    } catch (error) {
      console.warn(
        `Warning: Failed to create PR: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Write issue context for Claude
  await writeIssueContext(issue, worktreePath);

  // Launch Claude CLI
  if (!skipClaude) {
    if (verbose) {
      console.log("Launching Claude CLI...");
    }

    console.log(`\n✓ Worktree created at ${worktreePath}`);
    console.log(`✓ Branch: ${branch}`);
    console.log("✓ Issue context written to ~/.devac/issue-context.md");
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
    branch,
    issueNumber,
  };
}
