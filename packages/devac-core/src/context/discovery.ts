/**
 * Context Discovery
 *
 * Discovers sibling repositories and issue worktrees
 * in a parent directory workflow.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  DiscoveryOptions,
  ParsedWorktreeName,
  RepoContext,
  RepoInfo,
  WorktreeInfo,
} from "./types.js";

/**
 * Worktree naming pattern: {repo}-{issue#}-{slug}
 * Examples:
 *   vivief-123-auth -> { repoName: "vivief", issueNumber: 123, slug: "auth" }
 *   my-app-45-fix-bug -> { repoName: "my-app", issueNumber: 45, slug: "fix-bug" }
 */
const WORKTREE_PATTERN = /^(.+)-(\d+)-(.+)$/;

/**
 * Parse a worktree directory name into its components
 */
export function parseWorktreeName(dirName: string): ParsedWorktreeName | null {
  const match = dirName.match(WORKTREE_PATTERN);
  if (!match) {
    return null;
  }

  // Match groups are guaranteed to exist after successful regex match
  const repoName = match[1];
  const issueStr = match[2];
  const slug = match[3];
  if (!repoName || !issueStr || !slug) {
    return null;
  }
  return {
    repoName,
    issueNumber: Number.parseInt(issueStr, 10),
    slug,
  };
}

/**
 * Extract issue number from a directory name if it's a worktree
 */
export function extractIssueNumber(dirName: string): number | null {
  const parsed = parseWorktreeName(dirName);
  return parsed?.issueNumber ?? null;
}

/**
 * Extract the original repo name from a worktree directory name
 */
export function extractRepoName(dirName: string): string {
  const parsed = parseWorktreeName(dirName);
  return parsed?.repoName ?? dirName;
}

/**
 * Check if a directory is a git repository
 */
export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const gitDir = path.join(dirPath, ".git");
    const stats = await fs.stat(gitDir);
    // .git can be a directory (regular repo) or file (worktree)
    return stats.isDirectory() || stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a directory is a git worktree (vs main repo)
 */
export async function isGitWorktree(dirPath: string): Promise<boolean> {
  try {
    const gitPath = path.join(dirPath, ".git");
    const stats = await fs.stat(gitPath);
    // Worktrees have a .git file, not a .git directory
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a repository has DevAC seeds
 */
export async function hasDevacSeeds(repoPath: string): Promise<boolean> {
  try {
    const seedDir = path.join(repoPath, ".devac", "seed");
    const stats = await fs.stat(seedDir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get the git branch name for a repository
 */
export async function getGitBranch(repoPath: string): Promise<string | null> {
  try {
    const headPath = path.join(repoPath, ".git");
    const headStats = await fs.stat(headPath);

    let headContent: string;

    if (headStats.isFile()) {
      // Worktree - .git is a file pointing to the actual git dir
      const gitFileContent = await fs.readFile(headPath, "utf-8");
      const gitDirMatch = gitFileContent.match(/gitdir:\s*(.+)/);
      if (!gitDirMatch || !gitDirMatch[1]) return null;

      const gitDir = path.resolve(repoPath, gitDirMatch[1].trim());
      headContent = await fs.readFile(path.join(gitDir, "HEAD"), "utf-8");
    } else {
      // Regular repo
      headContent = await fs.readFile(path.join(headPath, "HEAD"), "utf-8");
    }

    const branchMatch = headContent.match(/ref:\s*refs\/heads\/(.+)/);
    return branchMatch?.[1] ? branchMatch[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Classify a directory as a RepoInfo
 */
async function classifyRepo(dirPath: string, options: DiscoveryOptions): Promise<RepoInfo | null> {
  const name = path.basename(dirPath);

  // Check if it's a git repo
  if (!(await isGitRepo(dirPath))) {
    return null;
  }

  const isWorktree = await isGitWorktree(dirPath);
  const parsed = parseWorktreeName(name);

  const repoInfo: RepoInfo = {
    path: dirPath,
    name,
    hasSeeds: options.checkSeeds !== false ? await hasDevacSeeds(dirPath) : false,
    isWorktree,
    issueNumber: parsed?.issueNumber,
    slug: parsed?.slug,
  };

  return repoInfo;
}

/**
 * Enrich a RepoInfo into a WorktreeInfo
 */
async function enrichWorktreeInfo(
  repo: RepoInfo,
  allRepos: RepoInfo[]
): Promise<WorktreeInfo | null> {
  if (!repo.isWorktree || repo.issueNumber === undefined || !repo.slug) {
    return null;
  }

  const parsed = parseWorktreeName(repo.name);
  if (!parsed) return null;

  // Find the main repo
  const mainRepo = allRepos.find((r) => !r.isWorktree && r.name === parsed.repoName);

  const branch = await getGitBranch(repo.path);

  return {
    ...repo,
    issueNumber: parsed.issueNumber,
    slug: parsed.slug,
    mainRepoPath: mainRepo?.path ?? "",
    mainRepoName: parsed.repoName,
    branch: branch ?? repo.name,
  };
}

/**
 * Discover the context from a directory
 *
 * This scans the parent directory for sibling repos and
 * identifies issue worktrees.
 */
export async function discoverContext(
  cwd: string,
  options: DiscoveryOptions = {}
): Promise<RepoContext> {
  const parentDir = path.dirname(cwd);
  const currentDirName = path.basename(cwd);

  // List all entries in parent directory
  let entries: string[];
  try {
    entries = await fs.readdir(parentDir);
  } catch {
    // Can't read parent, return minimal context
    return {
      currentDir: cwd,
      parentDir,
      repos: [],
    };
  }

  // Classify each sibling directory
  const repos: RepoInfo[] = [];
  for (const entry of entries) {
    const entryPath = path.join(parentDir, entry);

    try {
      const stats = await fs.stat(entryPath);
      if (!stats.isDirectory()) continue;

      const repoInfo = await classifyRepo(entryPath, options);
      if (repoInfo) {
        repos.push(repoInfo);
      }
    } catch {
      // Skip entries we can't stat
    }
  }

  // Check if we're in an issue worktree
  const issueNumber = extractIssueNumber(currentDirName);

  if (issueNumber) {
    // Group all worktrees for this issue
    const worktreeRepos = repos.filter((r) => r.isWorktree && r.issueNumber === issueNumber);

    const worktrees: WorktreeInfo[] = [];
    for (const wt of worktreeRepos) {
      const enriched = await enrichWorktreeInfo(wt, repos);
      if (enriched) {
        worktrees.push(enriched);
      }
    }

    // Find main repos that have worktrees for this issue
    const mainRepoNames = new Set(worktrees.map((wt) => wt.mainRepoName));
    const mainRepos = repos.filter((r) => !r.isWorktree && mainRepoNames.has(r.name));

    return {
      currentDir: cwd,
      parentDir,
      repos,
      issueNumber,
      worktrees,
      mainRepos,
    };
  }

  return {
    currentDir: cwd,
    parentDir,
    repos,
  };
}

/**
 * Format a RepoContext for display
 */
export function formatContext(context: RepoContext): string {
  const lines: string[] = [];

  if (context.issueNumber) {
    lines.push(`Issue #${context.issueNumber} Context`);
    lines.push("");

    if (context.worktrees && context.worktrees.length > 0) {
      lines.push("Worktrees:");
      for (const wt of context.worktrees) {
        const seedIcon = wt.hasSeeds ? "📦" : "  ";
        lines.push(`  ${seedIcon} ${wt.name} (${wt.branch})`);
      }
      lines.push("");
    }

    if (context.mainRepos && context.mainRepos.length > 0) {
      lines.push("Main Repos:");
      for (const repo of context.mainRepos) {
        const seedIcon = repo.hasSeeds ? "📦" : "  ";
        lines.push(`  ${seedIcon} ${repo.name}`);
      }
      lines.push("");
    }
  } else {
    lines.push("Context");
    lines.push("");
  }

  // List all sibling repos
  const siblings = context.repos.filter((r) => !r.isWorktree);
  if (siblings.length > 0) {
    lines.push("Sibling Repos:");
    for (const repo of siblings) {
      const seedIcon = repo.hasSeeds ? "📦" : "  ";
      lines.push(`  ${seedIcon} ${repo.name}`);
    }
  }

  return lines.join("\n");
}
