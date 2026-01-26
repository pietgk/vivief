/**
 * Start command - Create worktree and launch Claude for an issue
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isClaudeInstalled, launchClaude, writeIssueContext } from "../claude.js";
import { hasNodeModules, installDependencies } from "../deps.js";
import { createPR, fetchIssue, generateBranchName, generateShortDescription } from "../github.js";
import type { StartResult, WorktreeInfo } from "../types.js";
import {
  calculateWorktreePathFromWorkspace,
  findRepoInWorkspace,
  findWorkspace,
  getGitHubRepoFromRemote,
} from "../workspace.js";
import {
  addWorktreeToState,
  checkWorktreeStatus,
  createWorktree,
  findWorktreeForIssue,
} from "../worktree.js";

/**
 * Check if the repository has uncommitted changes that would cause worktree issues
 */
async function checkForUncommittedChanges(
  repoPath: string
): Promise<{ canProceed: boolean; message?: string }> {
  const status = await checkWorktreeStatus(repoPath);

  if (status.isClean) {
    return { canProceed: true };
  }

  // Build descriptive message
  const changeCount = status.modifiedFiles.length + status.untrackedFiles.length;
  let message = `Repository has ${changeCount} uncommitted change(s):\n`;
  if (status.modifiedFiles.length > 0) {
    const files = status.modifiedFiles.slice(0, 3).join(", ");
    message += `  Modified: ${files}${status.modifiedFiles.length > 3 ? "..." : ""}\n`;
  }
  if (status.untrackedFiles.length > 0) {
    const files = status.untrackedFiles.slice(0, 3).join(", ");
    message += `  Untracked: ${files}${status.untrackedFiles.length > 3 ? "..." : ""}\n`;
  }
  message += "\nPlease stash or commit your changes before creating a worktree:\n";
  message += "  git stash -u    # stash all changes including untracked\n";
  message += "  git stash pop   # apply stash to new worktree after creation";

  return { canProceed: false, message };
}

interface AlsoWorktreeResult {
  repo: string;
  success: boolean;
  worktreePath?: string;
  branch?: string;
  error?: string;
}

/**
 * Create a worktree in a sibling repository for the same issue
 */
async function createWorktreeInSiblingRepo(
  siblingRepoPath: string,
  issueNumber: number,
  issueTitle: string,
  options: { verbose?: boolean; skipInstall?: boolean; baseBranch?: string }
): Promise<AlsoWorktreeResult> {
  const repoName = path.basename(siblingRepoPath);

  try {
    // Verify it's a git repo
    const gitPath = path.join(siblingRepoPath, ".git");
    try {
      await fs.stat(gitPath);
    } catch {
      return { repo: repoName, success: false, error: `Not a git repository: ${siblingRepoPath}` };
    }

    // Generate branch and worktree path
    const branch = generateBranchName(issueNumber, issueTitle);
    const shortDesc = generateShortDescription(issueTitle);
    const parentDir = path.dirname(siblingRepoPath);
    const worktreePath = path.join(parentDir, `${repoName}-${issueNumber}-${shortDesc}`);

    if (options.verbose) {
      console.log(`Creating worktree for ${repoName} at ${worktreePath}`);
    }

    // Create worktree with auto-detected branch and git-crypt support
    await createWorktree({
      branch,
      worktreePath,
      baseBranch: options.baseBranch,
      repoPath: siblingRepoPath,
    });

    // Install dependencies if needed
    if (!options.skipInstall) {
      const packageJson = path.join(worktreePath, "package.json");
      try {
        await fs.stat(packageJson);
        const needsInstall = !(await hasNodeModules(worktreePath));
        if (needsInstall) {
          if (options.verbose) {
            console.log(`Installing dependencies in ${repoName}...`);
          }
          const installResult = await installDependencies(worktreePath, {
            verbose: options.verbose,
          });
          if (!installResult.success) {
            console.warn(`Warning: Failed to install deps in ${repoName}: ${installResult.error}`);
          }
        }
      } catch {
        // No package.json, skip install
      }
    }

    return { repo: repoName, success: true, worktreePath, branch };
  } catch (error) {
    return {
      repo: repoName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface StartOptions {
  issueNumber: number;
  /**
   * Full issue ID (e.g., "ghvivief-37")
   * Format: gh<repoDirectoryName>-<issueNumber>
   */
  issueId: string;
  /**
   * Repo directory name from issue ID (e.g., "vivief")
   * This is the folder name, not the full GitHub identifier (org/repo)
   */
  repoName: string;
  skipInstall?: boolean;
  newSession?: boolean;
  createPr?: boolean;
  verbose?: boolean;
  /** Create worktrees in these sibling repos as well (when in a repo) */
  also?: string[];
  /** Create worktrees in these repos (when in parent directory) */
  repos?: string[];
  /** Base branch to create worktree from (auto-detected if not specified) */
  baseBranch?: string;
}

/**
 * Start worktrees in multiple repos from a parent directory
 */
async function startFromParentDirectory(
  options: StartOptions,
  parentDir: string
): Promise<StartResult> {
  const { issueNumber, skipInstall, newSession, verbose, repos } = options;

  if (!repos || repos.length === 0) {
    return {
      success: false,
      error: "No repos specified. Use --repos to specify which repos to create worktrees in.",
    };
  }

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

  // Get GitHub info from the first repo to use for fetching issue
  const firstRepoPath = path.join(parentDir, repos[0]);
  const githubInfo = await getGitHubRepoFromRemote(firstRepoPath);
  if (!githubInfo) {
    return {
      success: false,
      error: `Could not determine GitHub repository from ${repos[0]}. Ensure it has a valid git remote.`,
    };
  }
  const githubRepo = `${githubInfo.owner}/${githubInfo.repo}`;

  // Fetch issue details
  if (verbose) {
    console.log(`Fetching issue #${issueNumber} from ${githubRepo}...`);
  }

  let issue: Awaited<ReturnType<typeof fetchIssue>>;
  try {
    issue = await fetchIssue(issueNumber, githubRepo);
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

  // Create worktrees in each specified repo
  const results: AlsoWorktreeResult[] = [];
  let firstWorktreePath: string | undefined;

  for (const repoName of repos) {
    const repoPath = path.join(parentDir, repoName);

    // Check for uncommitted changes before creating worktree
    const changeCheck = await checkForUncommittedChanges(repoPath);
    if (!changeCheck.canProceed) {
      console.warn(`✗ ${repoName}: has uncommitted changes, skipping`);
      results.push({ repo: repoName, success: false, error: "Uncommitted changes" });
      continue;
    }

    if (verbose) {
      console.log(`\nCreating worktree in repo: ${repoName}`);
    }

    const result = await createWorktreeInSiblingRepo(repoPath, issueNumber, issue.title, {
      verbose,
      skipInstall,
      baseBranch: options.baseBranch,
    });
    results.push(result);

    if (result.success) {
      console.log(`✓ ${repoName}: worktree created at ${result.worktreePath}`);
      if (!firstWorktreePath) {
        firstWorktreePath = result.worktreePath;
      }

      // Write issue context for Claude
      if (result.worktreePath) {
        await writeIssueContext(issue, result.worktreePath);
      }
    } else {
      console.warn(`✗ ${repoName}: ${result.error}`);
    }
  }

  const successCount = results.filter((r) => r.success).length;
  if (successCount === 0) {
    return {
      success: false,
      error: "Failed to create worktrees in any of the specified repos.",
    };
  }

  // Launch Claude in the parent directory (to work across all worktrees)
  if (newSession) {
    console.log("\n✓ Created worktrees in parent directory mode");
    console.log(`✓ ${successCount}/${repos.length} repos ready`);
    console.log("\nLaunching Claude CLI in parent directory...\n");

    try {
      await launchClaude(parentDir);
    } catch {
      // Claude exited - this is normal
      if (verbose) {
        console.log("Claude CLI session ended");
      }
    }
  }

  return {
    success: true,
    worktreePath: firstWorktreePath,
    issueNumber,
  };
}

/**
 * Check if current directory is a parent directory (not a git repo)
 */
async function isParentDirectory(dir: string): Promise<boolean> {
  try {
    const gitDir = path.join(dir, ".git");
    await fs.stat(gitDir);
    return false; // Has .git, so it's a repo
  } catch {
    return true; // No .git, so it's a parent directory
  }
}

/**
 * Start worktree using workspace mode (with full issue ID like ghvivief-37)
 *
 * This mode:
 * 1. Finds the workspace root from anywhere
 * 2. Resolves the repo by name from the issue ID
 * 3. Gets GitHub owner/repo from git remote
 * 4. Creates the worktree in the workspace
 */
async function startFromWorkspace(options: StartOptions): Promise<StartResult> {
  const { issueNumber, repoName, skipInstall, newSession, verbose, createPr } = options;

  if (!repoName) {
    return {
      success: false,
      error: "repoName is required for workspace mode",
    };
  }

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

  // Find the workspace root
  if (verbose) {
    console.log("Finding workspace...");
  }
  const workspace = await findWorkspace();
  if (!workspace) {
    return {
      success: false,
      error:
        "Could not find workspace. Make sure you're inside a workspace with .devac/ or multiple repos.",
    };
  }
  if (verbose) {
    console.log(`Found workspace at ${workspace}`);
  }

  // Find the repo in the workspace
  if (verbose) {
    console.log(`Looking for repo '${repoName}' in workspace...`);
  }
  const repoPath = await findRepoInWorkspace(workspace, repoName);
  if (!repoPath) {
    return {
      success: false,
      error: `Could not find repo '${repoName}' in workspace ${workspace}`,
    };
  }
  if (verbose) {
    console.log(`Found repo at ${repoPath}`);
  }

  // Get GitHub owner/repo from git remote
  if (verbose) {
    console.log("Getting GitHub info from git remote...");
  }
  const githubInfo = await getGitHubRepoFromRemote(repoPath);
  if (!githubInfo) {
    return {
      success: false,
      error: `Could not parse GitHub owner/repo from git remote in ${repoPath}`,
    };
  }
  const githubRepo = `${githubInfo.owner}/${githubInfo.repo}`;
  if (verbose) {
    console.log(`GitHub repo: ${githubRepo}`);
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

  // Fetch issue details from GitHub with explicit repo
  if (verbose) {
    console.log(`Fetching issue #${issueNumber} from ${githubRepo}...`);
  }

  let issue: Awaited<ReturnType<typeof fetchIssue>>;
  try {
    issue = await fetchIssue(issueNumber, githubRepo);
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch issue #${issueNumber} from ${githubRepo}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (issue.state !== "OPEN") {
    return {
      success: false,
      error: `Issue #${issueNumber} is ${issue.state.toLowerCase()}, not open`,
    };
  }

  // Check for uncommitted changes before creating worktree
  const changeCheck = await checkForUncommittedChanges(repoPath);
  if (!changeCheck.canProceed) {
    return {
      success: false,
      error: changeCheck.message,
    };
  }

  // Generate branch name and worktree path
  const branch = generateBranchName(issueNumber, issue.title);
  const shortDesc = generateShortDescription(issue.title);
  const worktreePath = calculateWorktreePathFromWorkspace(
    workspace,
    repoName,
    issueNumber,
    shortDesc
  );

  if (verbose) {
    console.log(`Creating worktree at ${worktreePath}`);
    console.log(`Branch: ${branch}`);
  }

  // Create the worktree (need to run git from the repo directory)
  try {
    await createWorktree({
      branch,
      worktreePath,
      baseBranch: options.baseBranch,
      repoPath,
    });
  } catch (error) {
    return {
      success: false,
      error: `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Save to state
  const worktreeInfo: WorktreeInfo = {
    path: worktreePath,
    branch,
    issueNumber,
    issueTitle: issue.title,
    createdAt: new Date().toISOString(),
    repoRoot: repoPath,
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
  if (newSession) {
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

export async function startCommand(options: StartOptions): Promise<StartResult> {
  const cwd = process.cwd();

  // Check if we're in a parent directory with --repos flag
  if (options.repos && options.repos.length > 0) {
    const isParent = await isParentDirectory(cwd);
    if (!isParent) {
      return {
        success: false,
        error:
          "The --repos flag can only be used from a parent directory (not inside a git repository). Use --also instead to create worktrees in sibling repos.",
      };
    }
    return startFromParentDirectory(options, cwd);
  }

  // Workspace mode: uses repoName from issue ID (e.g., "vivief" from "ghvivief-39")
  // This allows running from anywhere in the workspace
  return startFromWorkspace(options);
}
