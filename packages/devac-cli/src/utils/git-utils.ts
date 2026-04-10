/**
 * Git Utilities for Workflow Commands
 *
 * Shared git operations used by workflow commands.
 * All functions are synchronous for simplicity and use execSync.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GitStatus {
  /** Files staged for commit */
  staged: string[];
  /** Modified files not staged */
  unstaged: string[];
  /** Untracked files */
  untracked: string[];
  /** Current branch name */
  branch: string;
  /** Whether branch has remote tracking */
  hasRemote: boolean;
  /** Commits ahead of remote */
  ahead: number;
  /** Commits behind remote */
  behind: number;
}

export interface CommitInfo {
  /** Short SHA */
  sha: string;
  /** Commit message (first line) */
  message: string;
  /** Author name */
  author: string;
  /** Commit date (ISO format) */
  date: string;
}

export interface DiffStats {
  /** Number of files changed */
  filesChanged: number;
  /** Lines added */
  additions: number;
  /** Lines deleted */
  deletions: number;
}

export interface FileChange {
  /** File path */
  file: string;
  /** Lines added */
  additions: number;
  /** Lines deleted */
  deletions: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Git Commands
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a git command and return stdout
 */
function git(args: string, cwd: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (_error) {
    // Return empty string on error (command failed)
    return "";
  }
}

/**
 * Check if a path is inside a git repository
 */
export function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --git-dir", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root of the git repository
 */
export function getGitRoot(cwd: string): string | undefined {
  const result = git("rev-parse --show-toplevel", cwd);
  return result || undefined;
}

/**
 * Get current branch name
 */
export function getCurrentBranch(cwd: string): string {
  const branch = git("rev-parse --abbrev-ref HEAD", cwd);
  return branch || "HEAD";
}

/**
 * Get comprehensive git status
 */
export function getGitStatus(cwd: string): GitStatus {
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  // Parse porcelain status
  const status = git("status --porcelain", cwd);
  for (const line of status.split("\n")) {
    if (!line) continue;
    const indexStatus = line[0];
    const workStatus = line[1];
    const file = line.slice(3);

    if (indexStatus !== " " && indexStatus !== "?") {
      staged.push(file);
    }
    if (workStatus !== " " && workStatus !== "?") {
      unstaged.push(file);
    }
    if (indexStatus === "?" && workStatus === "?") {
      untracked.push(file);
    }
  }

  // Get branch info
  const branch = getCurrentBranch(cwd);

  // Check remote tracking
  const remote = git(`config --get branch.${branch}.remote`, cwd);
  const hasRemote = !!remote;

  // Get ahead/behind counts
  let ahead = 0;
  let behind = 0;
  if (hasRemote) {
    const trackingBranch = git(`config --get branch.${branch}.merge`, cwd);
    if (trackingBranch) {
      const remoteBranch = `${remote}/${trackingBranch.replace("refs/heads/", "")}`;
      const counts = git(`rev-list --left-right --count ${branch}...${remoteBranch}`, cwd);
      if (counts) {
        const [a, b] = counts.split("\t").map(Number);
        ahead = a || 0;
        behind = b || 0;
      }
    }
  }

  return { staged, unstaged, untracked, branch, hasRemote, ahead, behind };
}

/**
 * Get files changed since a base branch
 */
export function getChangedFilesSinceBranch(base: string, cwd: string): string[] {
  // Get merge-base to handle diverged branches
  const mergeBase = git(`merge-base ${base} HEAD`, cwd);
  if (!mergeBase) {
    // Fall back to direct diff if merge-base fails
    const result = git(`diff --name-only ${base}`, cwd);
    return result ? result.split("\n").filter(Boolean) : [];
  }

  const result = git(`diff --name-only ${mergeBase}`, cwd);
  return result ? result.split("\n").filter(Boolean) : [];
}

/**
 * Get commits since a base branch
 */
export function getCommitsSinceBranch(base: string, cwd: string): CommitInfo[] {
  const mergeBase = git(`merge-base ${base} HEAD`, cwd);
  const ref = mergeBase || base;

  // Format: sha|message|author|date
  const format = "%h|%s|%an|%aI";
  const result = git(`log --format="${format}" ${ref}..HEAD`, cwd);

  if (!result) return [];

  return result
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      return {
        sha: parts[0] ?? "",
        message: parts[1] ?? "",
        author: parts[2] ?? "",
        date: parts[3] ?? "",
      };
    });
}

/**
 * Get diff statistics since a base branch
 */
export function getDiffStatsSinceBranch(base: string, cwd: string): DiffStats {
  const mergeBase = git(`merge-base ${base} HEAD`, cwd);
  const ref = mergeBase || base;

  const result = git(`diff --stat --stat-width=1000 ${ref}`, cwd);
  if (!result) {
    return { filesChanged: 0, additions: 0, deletions: 0 };
  }

  // Last line has summary: "X files changed, Y insertions(+), Z deletions(-)"
  const lines = result.split("\n");
  const summaryLine = lines[lines.length - 1] ?? "";

  let filesChanged = 0;
  let additions = 0;
  let deletions = 0;

  const filesMatch = summaryLine.match(/(\d+) files? changed/);
  if (filesMatch?.[1]) filesChanged = Number.parseInt(filesMatch[1], 10);

  const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
  if (addMatch?.[1]) additions = Number.parseInt(addMatch[1], 10);

  const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/);
  if (delMatch?.[1]) deletions = Number.parseInt(delMatch[1], 10);

  return { filesChanged, additions, deletions };
}

/**
 * Get per-file diff statistics since a base branch
 */
export function getFileChangesSinceBranch(base: string, cwd: string): FileChange[] {
  const mergeBase = git(`merge-base ${base} HEAD`, cwd);
  const ref = mergeBase || base;

  const result = git(`diff --numstat ${ref}`, cwd);
  if (!result) return [];

  return result
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const add = parts[0] ?? "0";
      const del = parts[1] ?? "0";
      const file = parts[2] ?? "";
      return {
        file,
        additions: add === "-" ? 0 : Number.parseInt(add, 10),
        deletions: del === "-" ? 0 : Number.parseInt(del, 10),
      };
    });
}

/**
 * Get changed files from git (staged + unstaged, deduplicated).
 * Returns file paths relative to the repo root.
 */
export function getGitChangedFiles(cwd: string): string[] {
  const staged = git("diff --cached --name-only", cwd);
  const unstaged = git("diff --name-only", cwd);

  const files = new Set<string>();
  if (staged) {
    for (const file of staged.split("\n")) {
      if (file) files.add(file);
    }
  }
  if (unstaged) {
    for (const file of unstaged.split("\n")) {
      if (file) files.add(file);
    }
  }

  return Array.from(files);
}

/**
 * Get staged files
 */
export function getStagedFiles(cwd: string): string[] {
  const result = git("diff --cached --name-only", cwd);
  return result ? result.split("\n").filter(Boolean) : [];
}

/**
 * Get staged diff content
 */
export function getStagedDiff(cwd: string): string {
  return git("diff --cached", cwd);
}

/**
 * Get diff content since base branch
 */
export function getDiffSinceBranch(base: string, cwd: string): string {
  const mergeBase = git(`merge-base ${base} HEAD`, cwd);
  const ref = mergeBase || base;
  return git(`diff ${ref}`, cwd);
}

/**
 * Check if there are uncommitted changes
 */
export function hasUncommittedChanges(cwd: string): boolean {
  const status = git("status --porcelain", cwd);
  return !!status;
}

/**
 * Get default branch name (main or master)
 */
export function getDefaultBranch(cwd: string): string {
  // Try to get from remote
  const remote = git("remote", cwd).split("\n")[0] ?? "origin";
  const head = git(`symbolic-ref refs/remotes/${remote}/HEAD`, cwd);

  if (head) {
    // Extract branch name from refs/remotes/origin/main
    const match = head.match(/refs\/remotes\/[^/]+\/(.+)/);
    if (match?.[1]) return match[1];
  }

  // Fall back to checking if main or master exists
  const branches = git("branch -a", cwd);
  if (branches.includes("main") || branches.includes("remotes/origin/main")) {
    return "main";
  }
  return "master";
}

// ─────────────────────────────────────────────────────────────────────────────
// Changeset Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get existing changeset files in the repository
 */
export function getExistingChangesets(cwd: string): string[] {
  const changesetDir = path.join(cwd, ".changeset");

  if (!fs.existsSync(changesetDir)) {
    return [];
  }

  try {
    const files = fs.readdirSync(changesetDir);
    return files.filter((f) => {
      // Exclude config and readme
      if (f === "config.json" || f === "README.md") return false;
      // Only include .md files
      return f.endsWith(".md");
    });
  } catch {
    return [];
  }
}

/**
 * Get changesets added on this branch (not on base)
 */
export function getChangesetsOnBranch(base: string, cwd: string): string[] {
  const changedFiles = getChangedFilesSinceBranch(base, cwd);
  return changedFiles
    .filter((f) => f.startsWith(".changeset/") && f.endsWith(".md"))
    .filter((f) => !f.includes("README.md") && !f.includes("config.json"))
    .map((f) => path.basename(f));
}

/**
 * Parse a changeset file to extract package names
 */
export function parseChangesetPackages(changesetPath: string): string[] {
  try {
    const content = fs.readFileSync(changesetPath, "utf-8");
    const packages: string[] = [];

    // Changesets format:
    // ---
    // "@scope/package": patch
    // "@scope/other": minor
    // ---
    // Description

    const lines = content.split("\n");
    let inFrontmatter = false;

    for (const line of lines) {
      if (line.trim() === "---") {
        if (inFrontmatter) break; // End of frontmatter
        inFrontmatter = true;
        continue;
      }

      if (inFrontmatter) {
        // Parse "package": bump
        const match = line.match(/^"([^"]+)":\s*(patch|minor|major)/);
        if (match?.[1]) {
          packages.push(match[1]);
        }
      }
    }

    return packages;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sensitive File Detection
// ─────────────────────────────────────────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  /\.env$/,
  /\.env\.\w+$/,
  /credentials\.json$/,
  /secrets\.json$/,
  /\.pem$/,
  /\.key$/,
  /id_rsa$/,
  /id_ed25519$/,
  /\.aws\/credentials$/,
  /\.ssh\//,
];

/**
 * Check if a file path matches sensitive patterns
 */
export function isSensitiveFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Filter sensitive files from a list
 */
export function filterSensitiveFiles(files: string[]): string[] {
  return files.filter(isSensitiveFile);
}
