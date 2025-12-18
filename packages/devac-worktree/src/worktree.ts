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
 */
export async function createWorktree(options: {
  branch: string;
  worktreePath: string;
  baseBranch?: string;
}): Promise<void> {
  const { branch, worktreePath, baseBranch = "main" } = options;

  // Fetch latest from remote
  await execa("git", ["fetch", "origin", `${baseBranch}:${baseBranch}`], {
    reject: false, // Don't fail if branch doesn't exist remotely
  });

  // Create worktree with new branch
  await execa("git", ["worktree", "add", "-b", branch, worktreePath, baseBranch]);
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
