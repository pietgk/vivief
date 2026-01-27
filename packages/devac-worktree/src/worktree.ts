/**
 * Git worktree operations
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execa } from "execa";
import type { WorktreeInfo, WorktreeState } from "./types.js";

/**
 * Get the git repository root
 */
export async function getRepoRoot(): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

/**
 * Detect the default branch for a repository
 * Tries symbolic-ref first, then falls back to checking common branch names
 */
export async function getDefaultBranch(repoPath?: string): Promise<string> {
  const cwd = repoPath ? { cwd: repoPath } : {};

  // Try to get from remote HEAD reference
  const result = await execa("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], {
    ...cwd,
    reject: false,
  });

  if (result.exitCode === 0) {
    // Output is "refs/remotes/origin/main" or similar
    return result.stdout.replace("refs/remotes/origin/", "").trim();
  }

  // Fallback: check which common branches exist on remote
  for (const branch of ["main", "master", "development", "develop"]) {
    const check = await execa("git", ["rev-parse", "--verify", `origin/${branch}`], {
      ...cwd,
      reject: false,
    });
    if (check.exitCode === 0) {
      return branch;
    }
  }

  throw new Error("Could not determine default branch");
}

/**
 * Check if a repository uses git-crypt
 */
export async function usesGitCrypt(repoPath: string): Promise<boolean> {
  const gitCryptDir = path.join(repoPath, ".git-crypt");
  try {
    await fs.stat(gitCryptDir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a worktree with git-crypt support
 * Uses --no-checkout + symlink + checkout to properly share git-crypt keys
 */
export async function createWorktreeWithGitCrypt(options: {
  branch: string;
  worktreePath: string;
  baseBranch: string;
  repoPath: string;
}): Promise<void> {
  const { branch, worktreePath, baseBranch, repoPath } = options;
  const worktreeName = path.basename(worktreePath);

  // Step 1: Create worktree with --no-checkout
  await execa("git", ["worktree", "add", "--no-checkout", "-b", branch, worktreePath, baseBranch], {
    cwd: repoPath,
  });

  // Step 2: Create symlink to share git-crypt state
  // The git-crypt keys are at .git/git-crypt in the main repo
  // Worktree config is at .git/worktrees/<name>/
  const mainGitDir = path.join(repoPath, ".git");
  const worktreeGitDir = path.join(mainGitDir, "worktrees", worktreeName);
  const sourceGitCrypt = path.join(mainGitDir, "git-crypt");
  const targetGitCrypt = path.join(worktreeGitDir, "git-crypt");

  // Use relative path for the symlink (more robust)
  const relativeSource = path.relative(worktreeGitDir, sourceGitCrypt);
  await fs.symlink(relativeSource, targetGitCrypt);

  // Step 3: Now checkout (smudge filter will work because symlink provides keys)
  await execa("git", ["checkout", "HEAD", "."], {
    cwd: worktreePath,
  });
}

/**
 * Get the repository name from the root path
 */
export async function getRepoName(): Promise<string> {
  const root = await getRepoRoot();
  return path.basename(root);
}

/**
 * List all git worktrees
 */
export async function listWorktrees(): Promise<
  Array<{ path: string; branch: string; head: string }>
> {
  const { stdout } = await execa("git", ["worktree", "list", "--porcelain"]);

  const worktrees: Array<{ path: string; branch: string; head: string }> = [];
  let current: { path?: string; branch?: string; head?: string } = {};

  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      current.path = line.substring(9);
    } else if (line.startsWith("HEAD ")) {
      current.head = line.substring(5);
    } else if (line.startsWith("branch ")) {
      current.branch = line.substring(7).replace("refs/heads/", "");
    } else if (line === "") {
      if (current.path && current.branch && current.head) {
        worktrees.push({
          path: current.path,
          branch: current.branch,
          head: current.head,
        });
      }
      current = {};
    }
  }

  return worktrees;
}

/**
 * Check if a worktree exists for a given issue number
 */
export async function findWorktreeForIssue(issueNumber: number): Promise<string | null> {
  const state = await loadState();
  const worktree = state.worktrees.find((w) => w.issueNumber === issueNumber);
  return worktree?.path ?? null;
}

/**
 * Create a new worktree
 * Auto-detects default branch if not specified and handles git-crypt repos
 */
export async function createWorktree(options: {
  branch: string;
  worktreePath: string;
  baseBranch?: string;
  repoPath?: string;
}): Promise<void> {
  const { branch, worktreePath, repoPath } = options;
  const cwd = repoPath ? { cwd: repoPath } : {};

  // Auto-detect default branch if not specified
  const baseBranch = options.baseBranch ?? (await getDefaultBranch(repoPath));

  // Fetch latest from remote (don't fail silently - warn if it fails)
  const fetchResult = await execa("git", ["fetch", "origin", `${baseBranch}:${baseBranch}`], {
    ...cwd,
    reject: false,
  });

  if (fetchResult.exitCode !== 0 && repoPath) {
    // Check if the branch exists locally at least
    const localCheck = await execa("git", ["rev-parse", "--verify", baseBranch], {
      ...cwd,
      reject: false,
    });
    if (localCheck.exitCode !== 0) {
      throw new Error(`Base branch '${baseBranch}' not found locally or on remote`);
    }
  }

  // Check if repo uses git-crypt
  if (repoPath && (await usesGitCrypt(repoPath))) {
    await createWorktreeWithGitCrypt({
      branch,
      worktreePath,
      baseBranch,
      repoPath,
    });
  } else {
    // Standard worktree creation
    await execa("git", ["worktree", "add", "-b", branch, worktreePath, baseBranch], cwd);
  }
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
  worktreePath: string,
  options?: { force?: boolean }
): Promise<void> {
  const args = ["worktree", "remove"];
  if (options?.force) {
    args.push("--force");
  }
  args.push(worktreePath);

  await execa("git", args);
}

/**
 * Delete a branch
 */
export async function deleteBranch(branch: string, options?: { force?: boolean }): Promise<void> {
  const flag = options?.force ? "-D" : "-d";
  await execa("git", ["branch", flag, branch]);
}

/**
 * Prune stale worktree references
 */
export async function pruneWorktrees(): Promise<void> {
  await execa("git", ["worktree", "prune"]);
}

/**
 * Check if a worktree has modified or untracked files
 * Returns a status object with details about the worktree state
 */
export async function checkWorktreeStatus(worktreePath: string): Promise<{
  isClean: boolean;
  modifiedFiles: string[];
  untrackedFiles: string[];
}> {
  try {
    // Check for modified files (staged and unstaged)
    const { stdout: modifiedOutput } = await execa("git", ["diff", "--name-only", "HEAD"], {
      cwd: worktreePath,
    });
    const modifiedFiles = modifiedOutput.trim().split("\n").filter(Boolean);

    // Check for untracked files
    const { stdout: untrackedOutput } = await execa(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { cwd: worktreePath }
    );
    const untrackedFiles = untrackedOutput.trim().split("\n").filter(Boolean);

    return {
      isClean: modifiedFiles.length === 0 && untrackedFiles.length === 0,
      modifiedFiles,
      untrackedFiles,
    };
  } catch {
    // If we can't check status (e.g., path doesn't exist), assume clean
    return { isClean: true, modifiedFiles: [], untrackedFiles: [] };
  }
}

/**
 * Calculate worktree path for an issue
 */
export async function calculateWorktreePath(
  issueNumber: number,
  shortDescription: string
): Promise<string> {
  const repoRoot = await getRepoRoot();
  const repoName = path.basename(repoRoot);
  const parentDir = path.dirname(repoRoot);

  return path.join(parentDir, `${repoName}-${issueNumber}-${shortDescription}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the state file path
 */
function getStateFilePath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(homeDir, ".devac", "worktrees.json");
}

/**
 * Load worktree state from disk
 */
export async function loadState(): Promise<WorktreeState> {
  const statePath = getStateFilePath();

  try {
    const content = await fs.readFile(statePath, "utf-8");
    return JSON.parse(content) as WorktreeState;
  } catch {
    return { worktrees: [] };
  }
}

/**
 * Save worktree state to disk
 */
export async function saveState(state: WorktreeState): Promise<void> {
  const statePath = getStateFilePath();
  const dir = path.dirname(statePath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

/**
 * Add a worktree to state
 */
export async function addWorktreeToState(info: WorktreeInfo): Promise<void> {
  const state = await loadState();

  // Remove any existing entry for this issue
  state.worktrees = state.worktrees.filter((w) => w.issueNumber !== info.issueNumber);

  // Add new entry
  state.worktrees.push(info);

  await saveState(state);
}

/**
 * Remove a worktree from state
 */
export async function removeWorktreeFromState(issueNumber: number): Promise<void> {
  const state = await loadState();
  state.worktrees = state.worktrees.filter((w) => w.issueNumber !== issueNumber);
  await saveState(state);
}

/**
 * Sync state with actual git worktrees
 * Removes entries for worktrees that no longer exist
 */
export async function syncState(): Promise<void> {
  const state = await loadState();
  const gitWorktrees = await listWorktrees();
  const gitPaths = new Set(gitWorktrees.map((w) => w.path));

  // Filter out worktrees that no longer exist
  state.worktrees = state.worktrees.filter((w) => gitPaths.has(w.path));

  await saveState(state);
}
