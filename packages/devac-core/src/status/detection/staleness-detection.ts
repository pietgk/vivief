/**
 * Staleness Detection Module
 *
 * Detect stale resources for cleanup:
 * - Branches with merged PRs
 * - Worktrees for closed issues
 * - Branches deleted on remote
 * - Check for uncommitted changes before cleanup
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CleanupAction,
  CleanupDiagnostics,
  StaleBranch,
  StaleBranchReason,
  StaleRemoteBranch,
  StaleWorktree,
} from "../types.js";
import { detectBaseBranch, hasUncommittedChanges } from "./git-detection.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Branches that should never be considered stale.
 */
const PROTECTED_BRANCHES = ["main", "master", "develop", "dev", "staging", "production"];

/**
 * Stale threshold in days.
 */
const STALE_DAYS = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Git Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a git command and return stdout.
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
 * Execute gh CLI command and return parsed JSON.
 */
function ghJson<T>(args: string, cwd: string, timeout = 10000): T | null {
  try {
    const output = execSync(`gh ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
    });
    return JSON.parse(output) as T;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all local branches.
 */
function getLocalBranches(cwd: string): string[] {
  const output = git("branch --format='%(refname:short)'", cwd);
  return output
    .split("\n")
    .map((b) => b.replace(/^'|'$/g, ""))
    .filter(Boolean);
}

/**
 * Get all remote branches.
 */
function getRemoteBranches(cwd: string): string[] {
  const output = git("branch -r --format='%(refname:short)'", cwd);
  return output
    .split("\n")
    .map((b) => b.replace(/^'|'$/g, ""))
    .filter(Boolean)
    .filter((b) => !b.endsWith("/HEAD")); // Exclude symbolic refs
}

/**
 * Get the last commit date for a branch.
 */
function getLastCommitDate(cwd: string, branch: string): Date | null {
  const dateStr = git(`log -1 --format=%ci ${branch}`, cwd);
  if (!dateStr) return null;
  return new Date(dateStr);
}

/**
 * Check if a branch is merged into another branch.
 */
function isBranchMerged(cwd: string, branch: string, target: string): boolean {
  const mergedBranches = git(`branch --merged ${target}`, cwd);
  return mergedBranches
    .split("\n")
    .map((b) => b.replace(/^\*?\s+/, ""))
    .includes(branch);
}

/**
 * Check if a local branch has a remote tracking branch.
 */
function hasRemoteTracking(cwd: string, branch: string): boolean {
  const remote = git(`config --get branch.${branch}.remote`, cwd);
  return !!remote;
}

/**
 * Get PR state for a branch (merged, closed, open, or null).
 */
interface PrInfo {
  number: number;
  state: "MERGED" | "CLOSED" | "OPEN";
}

function getPRForBranch(cwd: string, branch: string): PrInfo | null {
  const result = ghJson<{ number: number; state: string }>(
    `pr list --head ${branch} --state all --json number,state --limit 1`,
    cwd
  );

  if (result && Array.isArray(result) && result.length > 0) {
    const pr = result[0] as { number: number; state: string };
    return {
      number: pr.number,
      state: pr.state.toUpperCase() as "MERGED" | "CLOSED" | "OPEN",
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale Branch Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect stale local branches.
 */
export function detectStaleBranches(cwd: string): StaleBranch[] {
  const staleBranches: StaleBranch[] = [];
  const baseBranch = detectBaseBranch(cwd);
  const localBranches = getLocalBranches(cwd);
  const currentBranch = git("rev-parse --abbrev-ref HEAD", cwd);

  for (const branch of localBranches) {
    // Skip protected branches
    if (PROTECTED_BRANCHES.includes(branch)) continue;

    // Skip current branch
    if (branch === currentBranch) continue;

    let reason: StaleBranchReason | undefined;
    let prNumber: number | undefined;
    let safeToDelete = false;

    // Check if merged into base
    if (isBranchMerged(cwd, branch, baseBranch)) {
      reason = "pr-merged";
      safeToDelete = true;
    }

    // Check PR state if available
    if (!reason) {
      const pr = getPRForBranch(cwd, branch);
      if (pr) {
        prNumber = pr.number;
        if (pr.state === "MERGED") {
          reason = "pr-merged";
          safeToDelete = true;
        } else if (pr.state === "CLOSED") {
          reason = "pr-closed";
          safeToDelete = true;
        }
      }
    }

    // Check for remote deletion
    if (!reason && hasRemoteTracking(cwd, branch)) {
      const remote = git(`config --get branch.${branch}.remote`, cwd);
      const remoteBranch = git(`config --get branch.${branch}.merge`, cwd).replace(
        "refs/heads/",
        ""
      );
      if (remote && remoteBranch) {
        const remoteRef = `${remote}/${remoteBranch}`;
        const remoteBranches = getRemoteBranches(cwd);
        if (!remoteBranches.includes(remoteRef)) {
          reason = "deleted-remote";
          safeToDelete = true;
        }
      }
    }

    // Check for inactivity
    if (!reason) {
      const lastCommit = getLastCommitDate(cwd, branch);
      if (lastCommit) {
        const daysSinceCommit = Math.floor(
          (Date.now() - lastCommit.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceCommit > STALE_DAYS) {
          reason = "no-activity";
          // Not safe to auto-delete inactive branches
        }
      }
    }

    // If we found a reason, add to stale list
    if (reason) {
      const hasChanges = hasUncommittedChanges(cwd);
      const lastCommit = getLastCommitDate(cwd, branch);

      staleBranches.push({
        name: branch,
        reason,
        prNumber,
        lastCommitDate: lastCommit?.toISOString(),
        hasUncommittedChanges: hasChanges,
        safeToDelete: safeToDelete && !hasChanges,
      });
    }
  }

  return staleBranches;
}

/**
 * Detect stale remote branches.
 */
export function detectStaleRemoteBranches(cwd: string): StaleRemoteBranch[] {
  const staleRemote: StaleRemoteBranch[] = [];
  const baseBranch = detectBaseBranch(cwd);
  const remoteBranches = getRemoteBranches(cwd);

  for (const ref of remoteBranches) {
    // Parse remote/branch from ref
    const parts = ref.split("/");
    const remote = parts[0] ?? "origin";
    const branch = parts.slice(1).join("/");

    // Skip protected branches
    if (PROTECTED_BRANCHES.includes(branch)) continue;

    // Check if merged into base
    const localBase = baseBranch;
    const remoteBase = `${remote}/${baseBranch}`;

    if (isBranchMerged(cwd, ref, remoteBase) || isBranchMerged(cwd, ref, localBase)) {
      // Get PR info for this branch
      const pr = getPRForBranch(cwd, branch);

      staleRemote.push({
        ref,
        remote,
        branch,
        reason: pr?.state === "MERGED" ? "pr-merged" : "pr-closed",
        prNumber: pr?.number,
      });
    }
  }

  return staleRemote;
}

// ─────────────────────────────────────────────────────────────────────────────
// Worktree Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsed worktree info.
 */
interface WorktreeInfo {
  path: string;
  name: string;
  branch: string | null;
  issueId: string | null;
  issueNumber: number | null;
}

/**
 * Parse worktree name to extract issue ID.
 * Pattern: {repo}-{issueNumber}-{slug} or {repo}-gh{number}-{slug}
 */
function parseWorktreeName(name: string): { issueId: string | null; issueNumber: number | null } {
  // Try pattern: repo-123-slug (simple number)
  const simpleMatch = name.match(/-(\d+)-[^-]+$/);
  if (simpleMatch?.[1]) {
    return {
      issueId: simpleMatch[1],
      issueNumber: Number.parseInt(simpleMatch[1], 10),
    };
  }

  // Try pattern: repo-gh123-slug
  const ghMatch = name.match(/-(gh\d+)-[^-]+$/);
  if (ghMatch?.[1]) {
    const num = ghMatch[1].replace("gh", "");
    return {
      issueId: ghMatch[1],
      issueNumber: Number.parseInt(num, 10),
    };
  }

  return { issueId: null, issueNumber: null };
}

/**
 * Get all worktrees in a directory.
 */
export function getWorktrees(cwd: string): WorktreeInfo[] {
  const output = git("worktree list --porcelain", cwd);
  if (!output) return [];

  const worktrees: WorktreeInfo[] = [];
  let currentWorktree: Partial<WorktreeInfo> = {};

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (currentWorktree.path) {
        const name = path.basename(currentWorktree.path);
        const { issueId, issueNumber } = parseWorktreeName(name);
        worktrees.push({
          path: currentWorktree.path,
          name,
          branch: currentWorktree.branch ?? null,
          issueId,
          issueNumber,
        });
      }
      currentWorktree = { path: line.replace("worktree ", "") };
    } else if (line.startsWith("branch ")) {
      currentWorktree.branch = line.replace("branch refs/heads/", "");
    }
  }

  // Don't forget the last one
  if (currentWorktree.path) {
    const name = path.basename(currentWorktree.path);
    const { issueId, issueNumber } = parseWorktreeName(name);
    worktrees.push({
      path: currentWorktree.path,
      name,
      branch: currentWorktree.branch ?? null,
      issueId,
      issueNumber,
    });
  }

  return worktrees;
}

/**
 * Get issue state from GitHub.
 */
function getIssueState(cwd: string, issueNumber: number): "open" | "closed" | null {
  const result = ghJson<{ state: string }>(`issue view ${issueNumber} --json state`, cwd);
  if (!result) return null;
  return result.state.toLowerCase() === "open" ? "open" : "closed";
}

/**
 * Detect stale worktrees.
 */
export function detectStaleWorktrees(cwd: string): StaleWorktree[] {
  const staleWorktrees: StaleWorktree[] = [];
  const worktrees = getWorktrees(cwd);

  // Skip the main worktree (first one is usually the main repo)
  for (const wt of worktrees.slice(1)) {
    if (!wt.issueNumber) continue;

    let reason: StaleWorktree["reason"] | undefined;
    let issueState: "open" | "closed" | undefined;
    let prState: "open" | "merged" | "closed" | undefined;

    // Check issue state
    const ghIssueState = getIssueState(cwd, wt.issueNumber);
    if (ghIssueState === "closed") {
      issueState = "closed";
      reason = "issue-closed";
    }

    // Check PR state if branch exists
    if (wt.branch) {
      const pr = getPRForBranch(cwd, wt.branch);
      if (pr) {
        prState = pr.state.toLowerCase() as "open" | "merged" | "closed";
        if (pr.state === "MERGED") {
          reason = "pr-merged";
        } else if (pr.state === "CLOSED") {
          reason = "pr-closed";
        }
      }
    }

    // Check for inactivity if no other reason
    if (!reason) {
      const lastCommit = wt.branch ? getLastCommitDate(cwd, wt.branch) : null;
      if (lastCommit) {
        const daysSinceCommit = Math.floor(
          (Date.now() - lastCommit.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceCommit > STALE_DAYS) {
          reason = "no-activity";
        }
      }
    }

    if (reason) {
      // Check for uncommitted changes in worktree
      const hasChanges = fs.existsSync(wt.path) && hasUncommittedChanges(wt.path);

      staleWorktrees.push({
        path: wt.path,
        name: wt.name,
        issueId: wt.issueId ?? undefined,
        issueNumber: wt.issueNumber ?? undefined,
        issueState,
        prState,
        reason,
        hasUncommittedChanges: hasChanges,
        safeToDelete: !hasChanges && (reason === "pr-merged" || reason === "issue-closed"),
      });
    }
  }

  return staleWorktrees;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate cleanup actions from diagnostics.
 */
function generateCleanupActions(
  staleBranches: StaleBranch[],
  staleRemoteBranches: StaleRemoteBranch[],
  staleWorktrees: StaleWorktree[]
): CleanupAction[] {
  const actions: CleanupAction[] = [];

  // Branch deletions
  for (const branch of staleBranches) {
    if (branch.safeToDelete) {
      actions.push({
        type: "delete-branch",
        description: `Delete local branch '${branch.name}' (${branch.reason})`,
        command: `git branch -d ${branch.name}`,
        safe: true,
        target: branch.name,
      });
    } else if (!branch.hasUncommittedChanges) {
      actions.push({
        type: "delete-branch",
        description: `Force delete local branch '${branch.name}' (${branch.reason})`,
        command: `git branch -D ${branch.name}`,
        safe: false,
        target: branch.name,
      });
    }
  }

  // Remote branch pruning
  const remotes = Array.from(new Set(staleRemoteBranches.map((b) => b.remote)));
  for (const remote of remotes) {
    actions.push({
      type: "prune-remote",
      description: `Prune stale remote tracking branches for '${remote}'`,
      command: `git remote prune ${remote}`,
      safe: true,
      target: remote,
    });
  }

  // Worktree removals
  for (const wt of staleWorktrees) {
    if (wt.safeToDelete) {
      actions.push({
        type: "delete-worktree",
        description: `Remove worktree '${wt.name}' (${wt.reason})`,
        command: `git worktree remove ${wt.path}`,
        safe: true,
        target: wt.name,
      });
    } else if (!wt.hasUncommittedChanges) {
      actions.push({
        type: "delete-worktree",
        description: `Force remove worktree '${wt.name}' (${wt.reason})`,
        command: `git worktree remove --force ${wt.path}`,
        safe: false,
        target: wt.name,
      });
    }
  }

  return actions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Detection Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get comprehensive cleanup diagnostics.
 */
export function getCleanupDiagnostics(cwd: string): CleanupDiagnostics {
  const staleBranches = detectStaleBranches(cwd);
  const staleRemoteBranches = detectStaleRemoteBranches(cwd);
  const staleWorktrees = detectStaleWorktrees(cwd);
  const actions = generateCleanupActions(staleBranches, staleRemoteBranches, staleWorktrees);

  return {
    path: cwd,
    staleBranches,
    staleRemoteBranches,
    staleWorktrees,
    actions,
    summary: {
      totalStaleBranches: staleBranches.length + staleRemoteBranches.length,
      safeToDeletBranches: staleBranches.filter((b) => b.safeToDelete).length,
      totalStaleWorktrees: staleWorktrees.length,
      safeToDeleteWorktrees: staleWorktrees.filter((w) => w.safeToDelete).length,
    },
  };
}
