/**
 * Git Detection Module
 *
 * Enhanced git state detection including:
 * - Base branch detection (config -> remote HEAD -> common names)
 * - Pushed vs unpushed commit tracking
 * - Merge/rebase state detection
 * - Remote tracking info
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { GitRepoState } from "../types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Git Command Execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a git command and return stdout.
 * Returns empty string on error.
 */
function git(args: string, cwd: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Execute a git command and return success/failure.
 */
function gitSuccess(args: string, cwd: string): boolean {
  try {
    execSync(`git ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Base Branch Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Common base branch names to check in order of preference.
 */
const COMMON_BASE_BRANCHES = ["main", "master", "develop", "dev", "trunk"];

/**
 * Detect the base branch for a repository.
 *
 * Detection order:
 * 1. Check git config for devac.baseBranch
 * 2. Check remote HEAD (origin/HEAD)
 * 3. Check for common branch names
 * 4. Fall back to "main"
 */
export function detectBaseBranch(cwd: string): string {
  // 1. Check git config
  const configBranch = git("config --get devac.baseBranch", cwd);
  if (configBranch) {
    return configBranch;
  }

  // 2. Check remote HEAD
  const remoteHead = git("symbolic-ref refs/remotes/origin/HEAD", cwd);
  if (remoteHead) {
    const match = remoteHead.match(/refs\/remotes\/origin\/(.+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  // 3. Check for common branch names
  const branches = git("branch -a", cwd);
  for (const baseName of COMMON_BASE_BRANCHES) {
    // Check local branch
    if (branches.includes(`  ${baseName}\n`) || branches.includes(`* ${baseName}\n`)) {
      return baseName;
    }
    // Check remote branch
    if (branches.includes(`remotes/origin/${baseName}`)) {
      return baseName;
    }
  }

  // 4. Fall back to "main"
  return "main";
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch Tracking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get remote tracking information for a branch.
 */
export function getTrackingInfo(cwd: string, branch: string): GitRepoState["tracking"] {
  // Get remote name
  const remoteName = git(`config --get branch.${branch}.remote`, cwd);
  if (!remoteName) {
    return {
      hasRemote: false,
      ahead: 0,
      behind: 0,
      inSync: true,
    };
  }

  // Get remote branch ref
  const remoteBranchRef = git(`config --get branch.${branch}.merge`, cwd);
  const remoteBranch = remoteBranchRef ? remoteBranchRef.replace("refs/heads/", "") : branch;

  // Get ahead/behind counts
  const upstream = `${remoteName}/${remoteBranch}`;
  const counts = git(`rev-list --left-right --count ${branch}...${upstream}`, cwd);

  let ahead = 0;
  let behind = 0;

  if (counts) {
    const parts = counts.split("\t");
    ahead = Number.parseInt(parts[0] ?? "0", 10) || 0;
    behind = Number.parseInt(parts[1] ?? "0", 10) || 0;
  }

  return {
    hasRemote: true,
    ahead,
    behind,
    inSync: ahead === 0 && behind === 0,
    remoteName,
    remoteBranch,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Working Directory State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get working directory state (staged, unstaged, untracked).
 */
export function getWorkingDirState(cwd: string): GitRepoState["workingDir"] {
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  const status = git("status --porcelain", cwd);

  for (const line of status.split("\n")) {
    if (!line) continue;

    const indexStatus = line[0];
    const workStatus = line[1];
    const file = line.slice(3);

    // Staged changes (index has changes)
    if (indexStatus !== " " && indexStatus !== "?") {
      staged.push(file);
    }

    // Unstaged changes (working tree has changes)
    if (workStatus !== " " && workStatus !== "?") {
      unstaged.push(file);
    }

    // Untracked files
    if (indexStatus === "?" && workStatus === "?") {
      untracked.push(file);
    }
  }

  return {
    staged,
    unstaged,
    untracked,
    isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch Commits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get information about commits on the current branch.
 */
export function getBranchCommits(
  cwd: string,
  branch: string,
  baseBranch: string
): GitRepoState["branchCommits"] {
  // Get merge base
  const mergeBase = git(`merge-base ${baseBranch} ${branch}`, cwd);
  if (!mergeBase) {
    return {
      count: 0,
      allPushed: true,
      unpushedCount: 0,
    };
  }

  // Count commits since base
  const countStr = git(`rev-list --count ${mergeBase}..${branch}`, cwd);
  const count = Number.parseInt(countStr, 10) || 0;

  // Check tracking info for unpushed
  const tracking = getTrackingInfo(cwd, branch);
  const unpushedCount = tracking.ahead;
  const allPushed = tracking.hasRemote ? unpushedCount === 0 : false;

  return {
    count,
    allPushed,
    unpushedCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Special Git States
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect special git states (merge, rebase, cherry-pick, conflicts).
 */
export function getSpecialState(cwd: string): GitRepoState["specialState"] {
  const gitDir = git("rev-parse --git-dir", cwd);
  if (!gitDir) {
    return undefined;
  }

  const gitDirPath = path.isAbsolute(gitDir) ? gitDir : path.join(cwd, gitDir);

  // Check for merge state
  const isMerging = fs.existsSync(path.join(gitDirPath, "MERGE_HEAD"));

  // Check for rebase state
  const isRebasing =
    fs.existsSync(path.join(gitDirPath, "rebase-merge")) ||
    fs.existsSync(path.join(gitDirPath, "rebase-apply"));

  // Check for cherry-pick state
  const isCherryPicking = fs.existsSync(path.join(gitDirPath, "CHERRY_PICK_HEAD"));

  // Get conflicted files
  const conflictedFiles: string[] = [];
  const status = git("status --porcelain", cwd);
  for (const line of status.split("\n")) {
    if (!line) continue;
    // UU = both modified (conflict)
    // AA = both added (conflict)
    // DD = both deleted (conflict)
    const statusCode = line.slice(0, 2);
    if (
      statusCode === "UU" ||
      statusCode === "AA" ||
      statusCode === "DD" ||
      statusCode === "AU" ||
      statusCode === "UA" ||
      statusCode === "DU" ||
      statusCode === "UD"
    ) {
      conflictedFiles.push(line.slice(3));
    }
  }

  const hasConflicts = conflictedFiles.length > 0;

  // Only return if in special state
  if (!isMerging && !isRebasing && !isCherryPicking && !hasConflicts) {
    return undefined;
  }

  return {
    isMerging,
    isRebasing,
    isCherryPicking,
    hasConflicts,
    conflictedFiles,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Detection Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get comprehensive git repository state.
 */
export function getGitRepoState(cwd: string): GitRepoState | null {
  // Verify we're in a git repo
  const gitDir = git("rev-parse --git-dir", cwd);
  if (!gitDir) {
    return null;
  }

  // Get current branch
  const branch = git("rev-parse --abbrev-ref HEAD", cwd) || "HEAD";

  // Detect base branch
  const baseBranch = detectBaseBranch(cwd);

  // Get tracking info
  const tracking = getTrackingInfo(cwd, branch);

  // Get working directory state
  const workingDir = getWorkingDirState(cwd);

  // Get branch commits info
  const branchCommits = getBranchCommits(cwd, branch, baseBranch);

  // Get special state
  const specialState = getSpecialState(cwd);

  return {
    branch,
    baseBranch,
    tracking,
    workingDir,
    branchCommits,
    specialState,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if there are uncommitted changes (staged or unstaged).
 */
export function hasUncommittedChanges(cwd: string): boolean {
  const workingDir = getWorkingDirState(cwd);
  return workingDir.staged.length > 0 || workingDir.unstaged.length > 0;
}

/**
 * Check if there are unpushed commits.
 */
export function hasUnpushedCommits(cwd: string): boolean {
  const branch = git("rev-parse --abbrev-ref HEAD", cwd);
  if (!branch) return false;

  const tracking = getTrackingInfo(cwd, branch);
  return tracking.hasRemote && tracking.ahead > 0;
}

/**
 * Get the current commit hash.
 */
export function getCurrentCommit(cwd: string): string | null {
  const commit = git("rev-parse HEAD", cwd);
  return commit || null;
}

/**
 * Check if a commit exists in the repository history.
 */
export function commitExists(cwd: string, commit: string): boolean {
  return gitSuccess(`cat-file -t ${commit}`, cwd);
}
