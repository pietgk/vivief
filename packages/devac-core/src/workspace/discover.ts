/**
 * Workspace Discovery
 *
 * Discovers repositories in a workspace directory and groups worktrees by issueId.
 * Uses the updated issueId format: {source}{originRepo}-{number}
 *
 * Key patterns:
 * - issueId: "ghapi-123" -> source="gh", originRepo="api", number=123
 * - Worktree name: "api-ghapi-123-auth" -> worktreeRepo="api", issueId="ghapi-123", slug="auth"
 * - Parse by splitting on LAST "-" to extract issue number (handles "monorepo-3.0")
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  ParsedIssueId,
  ParsedWorktreeNameV2,
  RepoHubStatus,
  WorkspaceConfig,
  WorkspaceDiscoveryOptions,
  WorkspaceInfo,
  WorkspaceRepoInfo,
} from "./types.js";

// =============================================================================
// IssueId Parsing
// =============================================================================

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
  // The source is assumed to be 2 characters at the start
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
 * Extract just the issue number from an issueId
 *
 * @param issueId The issueId string (e.g., "ghapi-123")
 * @returns The issue number or null if invalid
 */
export function extractIssueNumberFromId(issueId: string): number | null {
  const parsed = parseIssueId(issueId);
  return parsed?.number ?? null;
}

// =============================================================================
// Worktree Name Parsing
// =============================================================================

/**
 * Parse a worktree directory name into its components
 *
 * Pattern: {worktreeRepo}-{issueId}-{slug}
 *
 * Strategy:
 * 1. Match pattern ending with -{issueId}-{slug}
 * 2. The issueId contains a source prefix, repo name, and number
 * 3. Parse from the end to handle repo names with dashes
 *
 * Examples:
 *   "api-ghapi-123-auth" -> { worktreeRepo: "api", issueId: "ghapi-123", slug: "auth" }
 *   "my-app-ghmy-app-45-fix-bug" -> { worktreeRepo: "my-app", issueId: "ghmy-app-45", slug: "fix-bug" }
 *
 * @param dirName The directory name to parse
 * @returns Parsed worktree name or null if not a valid worktree
 */
export function parseWorktreeNameV2(dirName: string): ParsedWorktreeNameV2 | null {
  // Strategy: Work backwards to find the issueId pattern
  // The issueId ends with -{number}, so we look for that pattern

  // Pattern: Find segments that could be {issueId}-{slug}
  // Where issueId matches {source}{repo}-{number}

  const parts = dirName.split("-");
  if (parts.length < 4) {
    // Minimum: repo-issueprefix-number-slug (e.g., "api-ghapi-123-auth")
    return null;
  }

  // Try to find a valid issueId by scanning from position 1
  // (position 0 is always part of worktreeRepo)
  for (let i = 1; i < parts.length - 1; i++) {
    // Build potential issueId from position i to j
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
 * Check if a directory name is a worktree (quick check)
 */
export function isWorktreeName(dirName: string): boolean {
  return parseWorktreeNameV2(dirName) !== null;
}

// =============================================================================
// Git Utilities
// =============================================================================

/**
 * Find the git repository root from a starting path
 * Walks up the directory tree until it finds a .git directory
 *
 * @param startDir Directory to start from
 * @returns Path to git repo root, or null if not in a git repo
 */
export async function findGitRoot(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    if (await isGitRepo(dir)) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return null;
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

// =============================================================================
// Seed Detection
// =============================================================================

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
 * Get the last modified time of seeds
 */
export async function getSeedsLastModified(repoPath: string): Promise<string | null> {
  try {
    const seedDir = path.join(repoPath, ".devac", "seed");
    const stats = await fs.stat(seedDir);
    return stats.mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * Get repo ID from manifest or derive from name
 */
export async function getRepoId(repoPath: string): Promise<string> {
  try {
    const manifestPath = path.join(repoPath, ".devac", "manifest.json");
    const content = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as { repo_id?: string };
    if (manifest.repo_id) {
      return manifest.repo_id;
    }
  } catch {
    // No manifest, derive from name
  }

  return path.basename(repoPath);
}

// =============================================================================
// Workspace Discovery
// =============================================================================

/**
 * Default directories to exclude from workspace discovery
 */
const DEFAULT_EXCLUDE = [
  "node_modules",
  ".git",
  ".devac",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
];

/**
 * Check if a directory is a workspace (contains multiple git repos)
 */
export async function isWorkspaceDirectory(dirPath: string): Promise<boolean> {
  // A workspace is a directory that:
  // 1. Is NOT itself a git repo
  // 2. Contains at least one git repo

  if (await isGitRepo(dirPath)) {
    return false;
  }

  try {
    const entries = await fs.readdir(dirPath);
    for (const entry of entries) {
      if (DEFAULT_EXCLUDE.includes(entry)) continue;

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
 * Classify a directory as a WorkspaceRepoInfo
 */
async function classifyRepo(
  dirPath: string,
  options: WorkspaceDiscoveryOptions
): Promise<WorkspaceRepoInfo | null> {
  const name = path.basename(dirPath);

  // Check if it's a git repo
  if (!(await isGitRepo(dirPath))) {
    return null;
  }

  const isWorktree = await isGitWorktree(dirPath);
  const parsed = parseWorktreeNameV2(name);

  // Get seeds info
  const checkSeeds = options.checkSeeds !== false;
  const seeds = checkSeeds ? await hasDevacSeeds(dirPath) : false;
  const seedsLastModified = checkSeeds && seeds ? await getSeedsLastModified(dirPath) : undefined;

  // Get repo ID
  const repoId = await getRepoId(dirPath);

  // Get branch info
  const branch = options.readBranches !== false ? await getGitBranch(dirPath) : undefined;

  // Build base repo info
  const repoInfo: WorkspaceRepoInfo = {
    path: dirPath,
    repoId,
    name,
    hasSeeds: seeds,
    isWorktree,
    hubStatus: "unregistered" as RepoHubStatus, // Will be updated if checkHubStatus is true
    seedsLastModified: seedsLastModified ?? undefined,
    branch: branch ?? undefined,
  };

  // Add worktree-specific info
  if (parsed) {
    repoInfo.issueId = parsed.issueId;
    repoInfo.slug = parsed.slug;
    // mainRepoPath will be filled in by enrichWorktreeInfo
  }

  return repoInfo;
}

/**
 * Enrich worktree info with main repo reference
 */
function enrichWorktreeInfo(
  repo: WorkspaceRepoInfo,
  allRepos: WorkspaceRepoInfo[]
): WorkspaceRepoInfo {
  if (!repo.isWorktree || !repo.issueId) {
    return repo;
  }

  const parsed = parseWorktreeNameV2(repo.name);
  if (!parsed) {
    return repo;
  }

  // Find the main repo by matching worktreeRepo name
  const mainRepo = allRepos.find((r) => !r.isWorktree && r.name === parsed.worktreeRepo);

  return {
    ...repo,
    mainRepoPath: mainRepo?.path,
    mainRepoName: parsed.worktreeRepo,
  };
}

/**
 * Discover all repositories in a workspace
 */
export async function discoverWorkspaceRepos(
  workspacePath: string,
  options: WorkspaceDiscoveryOptions = {}
): Promise<WorkspaceRepoInfo[]> {
  const repos: WorkspaceRepoInfo[] = [];
  const exclude = new Set([...DEFAULT_EXCLUDE, ...(options.exclude ?? [])]);

  try {
    const entries = await fs.readdir(workspacePath);

    for (const entry of entries) {
      if (exclude.has(entry)) continue;

      const entryPath = path.join(workspacePath, entry);

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

  // Enrich worktrees with main repo info
  return repos.map((repo) => enrichWorktreeInfo(repo, repos));
}

/**
 * Load workspace configuration from .devac/workspace.json
 */
export async function loadWorkspaceConfig(workspacePath: string): Promise<WorkspaceConfig> {
  const defaultConfig: WorkspaceConfig = {
    version: "1.0",
    hub: {
      autoRefresh: true,
      refreshDebounceMs: 500,
    },
    watcher: {
      autoStart: false,
    },
  };

  try {
    const configPath = path.join(workspacePath, ".devac", "workspace.json");
    const content = await fs.readFile(configPath, "utf-8");
    const loaded = JSON.parse(content) as Partial<WorkspaceConfig>;

    return {
      ...defaultConfig,
      ...loaded,
      hub: {
        ...defaultConfig.hub,
        ...loaded.hub,
      },
      watcher: {
        ...defaultConfig.watcher,
        ...loaded.watcher,
      },
    };
  } catch {
    return defaultConfig;
  }
}

/**
 * Discover complete workspace information
 *
 * @param workspacePath Path to the workspace directory
 * @param options Discovery options
 * @returns Complete workspace information
 */
export async function discoverWorkspace(
  workspacePath: string,
  options: WorkspaceDiscoveryOptions = {}
): Promise<WorkspaceInfo> {
  const absolutePath = path.resolve(workspacePath);
  const isWorkspace = await isWorkspaceDirectory(absolutePath);

  if (!isWorkspace) {
    // Return minimal info for non-workspace directories
    return {
      workspacePath: absolutePath,
      isWorkspace: false,
      repos: [],
      mainRepos: [],
      worktreesByIssue: new Map(),
      hubPath: path.join(absolutePath, ".devac", "hub.duckdb"),
      config: await loadWorkspaceConfig(absolutePath),
    };
  }

  // Discover all repos
  const repos = await discoverWorkspaceRepos(absolutePath, options);

  // Separate main repos from worktrees
  const mainRepos = repos.filter((r) => !r.isWorktree);

  // Group worktrees by issueId
  const worktreesByIssue = new Map<string, WorkspaceRepoInfo[]>();
  for (const repo of repos) {
    if (repo.isWorktree && repo.issueId) {
      const existing = worktreesByIssue.get(repo.issueId) ?? [];
      existing.push(repo);
      worktreesByIssue.set(repo.issueId, existing);
    }
  }

  // Load config
  const config = await loadWorkspaceConfig(absolutePath);

  return {
    workspacePath: absolutePath,
    isWorkspace: true,
    repos,
    mainRepos,
    worktreesByIssue,
    hubPath: path.join(absolutePath, ".devac", "hub.duckdb"),
    config,
  };
}

/**
 * Format workspace info for display
 */
export function formatWorkspaceInfo(info: WorkspaceInfo): string {
  const lines: string[] = [];

  if (!info.isWorkspace) {
    lines.push("Not a workspace directory");
    lines.push(`Path: ${info.workspacePath}`);
    return lines.join("\n");
  }

  lines.push("Workspace");
  lines.push(`📁 ${info.workspacePath}`);
  lines.push("");

  // Main repos
  if (info.mainRepos.length > 0) {
    lines.push("Repositories:");
    for (const repo of info.mainRepos) {
      const seedIcon = repo.hasSeeds ? "📦" : "  ";
      const hubIcon = repo.hubStatus === "registered" ? "🔗" : "";
      lines.push(`  ${seedIcon} ${repo.name} ${hubIcon}`);
    }
    lines.push("");
  }

  // Worktrees by issue
  if (info.worktreesByIssue.size > 0) {
    lines.push("Issue Worktrees:");
    for (const [issueId, worktrees] of info.worktreesByIssue) {
      const parsed = parseIssueId(issueId);
      const issueLabel = parsed ? `#${parsed.number}` : issueId;
      lines.push(`  Issue ${issueLabel}:`);
      for (const wt of worktrees) {
        const seedIcon = wt.hasSeeds ? "📦" : "  ";
        lines.push(`    ${seedIcon} ${wt.name}`);
      }
    }
    lines.push("");
  }

  // Hub info
  lines.push(`Hub: ${info.hubPath}`);

  return lines.join("\n");
}

// =============================================================================
// Workspace Directory Discovery
// =============================================================================

/**
 * Find the workspace directory from a starting path
 *
 * Handles these cases:
 * - cwd is a workspace directory (contains git repos)
 * - cwd is a git repo root
 * - cwd is a subdirectory inside a git repo (e.g., ~/ws/vivief/packages/devac-core/src)
 *
 * @param startDir Directory to start from (default: process.cwd())
 * @returns Path to workspace directory, or null if not in a workspace
 */
export async function findWorkspaceDir(startDir?: string): Promise<string | null> {
  const dir = path.resolve(startDir || process.cwd());

  // Case 1: Current dir is a workspace → return it
  if (await isWorkspaceDirectory(dir)) {
    return dir;
  }

  // Case 2: Find git repo root (handles both repo root and subdirs inside repo)
  const gitRoot = await findGitRoot(dir);
  if (gitRoot) {
    const parent = path.dirname(gitRoot);
    if (await isWorkspaceDirectory(parent)) {
      return parent;
    }
  }

  return null;
}

/**
 * Find the hub directory for the workspace containing the given path
 *
 * @param startDir Directory to start from (default: process.cwd())
 * @returns Path to hub directory (workspace/.devac), or null if not in a workspace
 */
export async function findWorkspaceHubDir(startDir?: string): Promise<string | null> {
  const workspaceDir = await findWorkspaceDir(startDir);
  if (!workspaceDir) {
    return null;
  }
  return path.join(workspaceDir, ".devac");
}

// =============================================================================
// Hub Location Validation
// =============================================================================

/**
 * Result of hub location validation
 */
export interface HubValidationResult {
  valid: boolean;
  reason?: string;
  suggestedPath?: string;
}

/**
 * Validate that a hub directory is at the correct location
 *
 * Hubs should ONLY exist at workspace level (a directory that contains git repos
 * but is not itself a git repo). Hubs should NEVER be inside a git repository.
 *
 * @param hubDir Path to the hub directory (e.g., /ws/.devac)
 * @returns Validation result with reason and suggested path if invalid
 */
export async function validateHubLocation(hubDir: string): Promise<HubValidationResult> {
  const absoluteHubDir = path.resolve(hubDir);
  const parentDir = path.dirname(absoluteHubDir);

  // Check if hub is inside a git repo (this is invalid)
  if (await isGitRepo(parentDir)) {
    // Try to find the correct workspace location
    const workspaceDir = await findWorkspaceDir(parentDir);
    return {
      valid: false,
      reason: `Hub is inside git repo "${path.basename(parentDir)}". Hubs should only exist at workspace level.`,
      suggestedPath: workspaceDir ? path.join(workspaceDir, ".devac") : undefined,
    };
  }

  // Check if parent is a valid workspace (must contain at least one git repo)
  if (!(await isWorkspaceDirectory(parentDir))) {
    return {
      valid: false,
      reason: "Hub location is not a valid workspace (must contain at least one git repo).",
    };
  }

  return { valid: true };
}
