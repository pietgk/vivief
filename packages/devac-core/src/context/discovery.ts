/**
 * Context Discovery
 *
 * Discovers sibling repositories and issue worktrees
 * in a parent directory workflow.
 *
 * Supports two worktree naming patterns:
 *
 * Legacy: {repo}-{issue#}-{slug}
 *   Example: vivief-123-auth
 *
 * New (v3): {worktreeRepo}-{issueId}-{slug}
 *   Where issueId = {source}{originRepo}-{number}
 *   Example: api-ghapi-123-auth (source=gh, originRepo=api, number=123)
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
 * Legacy worktree naming pattern: {repo}-{issue#}-{slug}
 * Examples:
 *   vivief-123-auth -> { repoName: "vivief", issueNumber: 123, slug: "auth" }
 *   my-app-45-fix-bug -> { repoName: "my-app", issueNumber: 45, slug: "fix-bug" }
 */
const WORKTREE_PATTERN = /^(.+)-(\d+)-(.+)$/;

/**
 * Parse a worktree directory name into its components (legacy format)
 *
 * @deprecated Use parseWorktreeNameV2 for new issueId format
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

// =============================================================================
// New IssueId Format Support (v3)
// =============================================================================

/**
 * Parsed issueId components
 *
 * Format: {source}{originRepo}-{number}
 * Example: ghapi-123 -> { source: "gh", originRepo: "api", number: 123 }
 */
export interface ParsedIssueId {
  /** Full issueId string */
  full: string;
  /** Source prefix (e.g., "gh" for GitHub) */
  source: string;
  /** Origin repo name */
  originRepo: string;
  /** Issue number */
  number: number;
}

/**
 * Parsed worktree name in v3 format
 *
 * Pattern: {worktreeRepo}-{issueId}-{slug}
 * Where issueId = {source}{originRepo}-{number}
 */
export interface ParsedWorktreeNameV2 {
  /** Repo name part (usually same as main repo) */
  worktreeRepo: string;
  /** Full issueId in {source}{originRepo}-{number} format */
  issueId: string;
  /** Issue number extracted from issueId */
  issueNumber: number;
  /** Slug/description part */
  slug: string;
}

/**
 * Parse an issueId string into its components
 *
 * Format: {source}{originRepo}-{number}
 * Parse strategy: Split on LAST "-" to get the number
 *
 * Examples:
 *   "ghapi-123" -> { source: "gh", originRepo: "api", number: 123 }
 *   "ghmonorepo-3.0-456" -> { source: "gh", originRepo: "monorepo-3.0", number: 456 }
 *
 * @param issueId The issueId string to parse
 * @returns Parsed issueId or null if invalid
 */
export function parseIssueId(issueId: string): ParsedIssueId | null {
  // Find the last dash to split number from the rest
  const lastDashIndex = issueId.lastIndexOf("-");
  if (lastDashIndex === -1) {
    return null;
  }

  const prefix = issueId.substring(0, lastDashIndex);
  const numberStr = issueId.substring(lastDashIndex + 1);

  // Validate number part
  const number = Number.parseInt(numberStr, 10);
  if (Number.isNaN(number) || number <= 0) {
    return null;
  }

  // Extract source prefix (typically 2 chars like "gh" for GitHub)
  if (prefix.length < 3) {
    return null;
  }

  const source = prefix.substring(0, 2);
  const originRepo = prefix.substring(2);

  if (!originRepo) {
    return null;
  }

  return {
    full: issueId,
    source,
    originRepo,
    number,
  };
}

/**
 * Parse a worktree directory name using the new v3 format
 *
 * Pattern: {worktreeRepo}-{issueId}-{slug}
 * Where issueId contains a dash: {source}{repo}-{number}
 *
 * This parser works backwards to find the issueId pattern.
 *
 * Examples:
 *   "api-ghapi-123-auth" -> { worktreeRepo: "api", issueId: "ghapi-123", slug: "auth" }
 *   "my-app-ghmy-app-45-fix" -> { worktreeRepo: "my-app", issueId: "ghmy-app-45", slug: "fix" }
 *
 * @param dirName Directory name to parse
 * @returns Parsed worktree name or null if not valid
 */
export function parseWorktreeNameV2(dirName: string): ParsedWorktreeNameV2 | null {
  const parts = dirName.split("-");
  if (parts.length < 4) {
    // Minimum: repo-issueprefix-number-slug
    return null;
  }

  // Try to find a valid issueId by scanning from position 1
  for (let i = 1; i < parts.length - 1; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const potentialIssueIdParts = parts.slice(i, j + 1);
      const potentialIssueId = potentialIssueIdParts.join("-");

      const parsed = parseIssueId(potentialIssueId);
      if (parsed) {
        // Check if there's at least one part after for slug
        if (j < parts.length - 1) {
          const worktreeRepo = parts.slice(0, i).join("-");
          const slug = parts.slice(j + 1).join("-");

          if (worktreeRepo && slug) {
            return {
              worktreeRepo,
              issueId: parsed.full,
              issueNumber: parsed.number,
              slug,
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract issue number from a directory name using any supported format
 *
 * Tries v3 format first, falls back to legacy format.
 *
 * @param dirName Directory name
 * @returns Issue number or null
 */
export function extractIssueNumberAny(dirName: string): number | null {
  // Try v3 format first
  const v2Parsed = parseWorktreeNameV2(dirName);
  if (v2Parsed) {
    return v2Parsed.issueNumber;
  }

  // Fall back to legacy format
  return extractIssueNumber(dirName);
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
 * Check if a directory is a parent directory containing git repos
 * (but is not itself a git repo)
 */
async function isParentDirectoryWithRepos(dirPath: string): Promise<boolean> {
  // First, check if this directory is NOT a git repo
  if (await isGitRepo(dirPath)) {
    return false;
  }

  // Then check if it contains at least one git repo
  try {
    const entries = await fs.readdir(dirPath);
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry);
      try {
        const stats = await fs.stat(entryPath);
        if (stats.isDirectory() && (await isGitRepo(entryPath))) {
          return true;
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Discover child repos in a parent directory
 */
async function discoverChildRepos(
  parentDir: string,
  options: DiscoveryOptions
): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];

  try {
    const entries = await fs.readdir(parentDir);
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
  } catch {
    // Can't read directory
  }

  return repos;
}

/**
 * Discover the context from a directory
 *
 * This scans the parent directory for sibling repos and
 * identifies issue worktrees. Also handles the case where
 * cwd is a parent directory containing multiple repos.
 */
export async function discoverContext(
  cwd: string,
  options: DiscoveryOptions = {}
): Promise<RepoContext> {
  // Check if we're in a parent directory (not a repo, but contains repos)
  const isParentDir = await isParentDirectoryWithRepos(cwd);

  if (isParentDir) {
    // Parent directory mode: scan children
    const childRepos = await discoverChildRepos(cwd, options);
    const mainRepos = childRepos.filter((r) => !r.isWorktree);

    return {
      currentDir: cwd,
      parentDir: cwd, // In parent mode, parentDir === currentDir
      repos: childRepos,
      isParentDirectory: true,
      childRepos,
      mainRepos,
    };
  }

  // Standard mode: we're in a repo, scan siblings
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

  // Parent directory mode
  if (context.isParentDirectory) {
    lines.push("Parent Directory Context");
    lines.push(`📁 ${context.currentDir}`);
    lines.push("");

    const mainRepos = context.childRepos?.filter((r) => !r.isWorktree) ?? [];
    const worktrees = context.childRepos?.filter((r) => r.isWorktree) ?? [];

    if (mainRepos.length > 0) {
      lines.push("Repositories:");
      for (const repo of mainRepos) {
        const seedIcon = repo.hasSeeds ? "📦" : "  ";
        lines.push(`  ${seedIcon} ${repo.name}`);
      }
      lines.push("");
    }

    if (worktrees.length > 0) {
      lines.push("Worktrees:");
      for (const wt of worktrees) {
        const seedIcon = wt.hasSeeds ? "📦" : "  ";
        const issue = wt.issueNumber ? ` (#${wt.issueNumber})` : "";
        lines.push(`  ${seedIcon} ${wt.name}${issue}`);
      }
      lines.push("");
    }

    lines.push(
      `Use: devac worktree start <issue> --repos ${mainRepos.map((r) => r.name).join(",")}`
    );
    return lines.join("\n");
  }

  // Issue worktree mode
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
