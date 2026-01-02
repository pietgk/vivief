/**
 * Start command - Create worktree and launch Claude for an issue
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execa } from "execa";
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
  calculateWorktreePath,
  createWorktree,
  findWorktreeForIssue,
  getRepoRoot,
} from "../worktree.js";

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
  options: { verbose?: boolean; skipInstall?: boolean }
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

    // Fetch latest and create worktree (run git from within the sibling repo)
    await execa("git", ["fetch", "origin", "main:main"], {
      cwd: siblingRepoPath,
      reject: false,
    });

    await execa("git", ["worktree", "add", "-b", branch, worktreePath, "main"], {
      cwd: siblingRepoPath,
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
  /** Full issue ID (e.g., "ghvivief-37") - enables workspace mode */
  issueId?: string;
  /** Repo name from issue ID (e.g., "vivief") - enables workspace mode */
  repoName?: string;
  skipInstall?: boolean;
  newSession?: boolean;
  createPr?: boolean;
  verbose?: boolean;
  /** Create worktrees in these sibling repos as well (when in a repo) */
  also?: string[];
  /** Create worktrees in these repos (when in parent directory) */
  repos?: string[];
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

  // Create worktrees in each specified repo
  const results: AlsoWorktreeResult[] = [];
  let firstWorktreePath: string | undefined;

  for (const repoName of repos) {
    const repoPath = path.join(parentDir, repoName);
    if (verbose) {
      console.log(`\nCreating worktree in repo: ${repoName}`);
    }

    const result = await createWorktreeInSiblingRepo(repoPath, issueNumber, issue.title, {
      verbose,
      skipInstall,
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
    // Fetch latest from remote
    await execa("git", ["fetch", "origin", "main:main"], {
      cwd: repoPath,
      reject: false,
    });

    // Create worktree with new branch
    await execa("git", ["worktree", "add", "-b", branch, worktreePath, "main"], {
      cwd: repoPath,
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
  const { issueNumber, skipInstall, newSession, createPr, verbose } = options;
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

  // Workspace mode: when repoName is provided (from full issue ID like ghvivief-39)
  // This allows running from anywhere in the workspace
  if (options.repoName) {
    return startFromWorkspace(options);
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

  // Handle --also flag: create worktrees in sibling repos
  const alsoResults: AlsoWorktreeResult[] = [];
  if (options.also && options.also.length > 0) {
    const repoRoot = await getRepoRoot();
    const parentDir = path.dirname(repoRoot);

    for (const repoName of options.also) {
      const siblingPath = path.join(parentDir, repoName);
      if (verbose) {
        console.log(`\nCreating worktree in sibling repo: ${repoName}`);
      }
      const result = await createWorktreeInSiblingRepo(siblingPath, issueNumber, issue.title, {
        verbose,
        skipInstall,
      });
      alsoResults.push(result);

      if (result.success) {
        console.log(`✓ ${repoName}: worktree created at ${result.worktreePath}`);
      } else {
        console.warn(`✗ ${repoName}: ${result.error}`);
      }
    }
  }

  // Launch Claude CLI
  if (newSession) {
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
