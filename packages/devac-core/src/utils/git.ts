/**
 * Git Utilities
 *
 * Utilities for detecting git repository information and executing git commands.
 * Handles both regular repositories and worktrees.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createLogger } from "./logger.js";

const logger = createLogger({ prefix: "[Git]" });

// ─────────────────────────────────────────────────────────────────────────────
// Git Command Execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a git command and return stdout.
 * Returns empty string on failure (logged at debug level).
 */
export function execGit(args: string, cwd: string, options?: { timeout?: number }): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: options?.timeout ?? 30000,
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(`git ${args} failed: ${message}`);
    return "";
  }
}

/**
 * Execute a git command and return success/failure.
 */
export function execGitSuccess(args: string, cwd: string): boolean {
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

/**
 * Execute a gh CLI command and return parsed JSON.
 * Returns null on failure (logged at debug level).
 */
export function execGhJson<T>(args: string, cwd: string, timeout = 10000): T | null {
  try {
    const output = execSync(`gh ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
    });
    return JSON.parse(output) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(`gh ${args} failed: ${message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Git State Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of repo ID detection
 */
export interface RepoIdResult {
  /** The detected repo ID */
  repoId: string;
  /** Source of the repo ID (git, package.json, directory) */
  source: "git" | "package" | "directory";
}

/**
 * Detect the repository ID from a given path.
 *
 * Priority:
 * 1. Git remote origin URL (handles worktrees)
 * 2. package.json name field
 * 3. Directory name (fallback, but prefixed with "local/")
 *
 * @param repoPath - Path to the repository root
 * @returns Repository ID and its source
 */
export async function detectRepoId(repoPath: string): Promise<RepoIdResult> {
  // Try git-based detection first (handles worktrees)
  const gitRepoId = await detectRepoIdFromGit(repoPath);
  if (gitRepoId) {
    return { repoId: gitRepoId, source: "git" };
  }

  // Try package.json name
  const packageRepoId = await detectRepoIdFromPackageJson(repoPath);
  if (packageRepoId) {
    return { repoId: packageRepoId, source: "package" };
  }

  // Fall back to directory name
  const basename = path.basename(path.resolve(repoPath));
  return { repoId: `local/${basename}`, source: "directory" };
}

/**
 * Detect repo ID from git configuration.
 * Handles both regular repos and worktrees.
 *
 * @param repoPath - Path to the repository
 * @returns Repo ID or null if not detectable
 */
export async function detectRepoIdFromGit(repoPath: string): Promise<string | null> {
  try {
    const gitPath = path.join(repoPath, ".git");
    const gitStat = await fs.stat(gitPath);

    let configPath: string;

    if (gitStat.isFile()) {
      // This is a worktree - .git is a file pointing to the real git dir
      const gitFileContent = await fs.readFile(gitPath, "utf-8");
      const gitdirMatch = gitFileContent.match(/^gitdir:\s*(.+)$/m);
      if (!gitdirMatch?.[1]) {
        return null;
      }

      // The gitdir points to .git/worktrees/<name>, we need the parent .git/config
      let gitDir = gitdirMatch[1].trim();

      // Handle relative paths
      if (!path.isAbsolute(gitDir)) {
        gitDir = path.resolve(repoPath, gitDir);
      }

      // Navigate up from worktrees/<name> to get to the main .git directory
      // Structure: .git/worktrees/<worktree-name>/
      const worktreesDir = path.dirname(gitDir);
      if (path.basename(worktreesDir) === "worktrees") {
        const mainGitDir = path.dirname(worktreesDir);
        configPath = path.join(mainGitDir, "config");
      } else {
        // Might be a different structure, try the gitdir directly
        configPath = path.join(gitDir, "config");
      }
    } else {
      // Regular repository
      configPath = path.join(gitPath, "config");
    }

    const gitConfig = await fs.readFile(configPath, "utf-8");
    return parseGitConfigForOrigin(gitConfig);
  } catch {
    return null;
  }
}

/**
 * Detect repo ID from package.json name field.
 *
 * @param repoPath - Path to the repository
 * @returns Repo ID or null if not detectable
 */
export async function detectRepoIdFromPackageJson(repoPath: string): Promise<string | null> {
  try {
    const packageJsonPath = path.join(repoPath, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);

    if (packageJson.name && typeof packageJson.name === "string") {
      // Remove scope if present (e.g., @org/name -> name)
      const name = packageJson.name.replace(/^@[^/]+\//, "");
      return `package/${name}`;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse git config file content to extract origin URL and convert to repo ID.
 *
 * @param gitConfig - Content of .git/config file
 * @returns Repo ID or null if origin not found
 */
export function parseGitConfigForOrigin(gitConfig: string): string | null {
  // Parse remote origin URL
  const remoteMatch = gitConfig.match(/\[remote "origin"\][^[]*url\s*=\s*(.+)/);
  if (!remoteMatch?.[1]) {
    return null;
  }

  const url = remoteMatch[1].trim();
  return parseGitUrl(url);
}

/**
 * Parse a git URL into a repo ID.
 *
 * @param url - Git URL (SSH or HTTPS)
 * @returns Normalized repo ID
 */
export function parseGitUrl(url: string): string {
  // Handle SSH URLs: git@github.com:org/repo.git
  const sshMatch = url.match(/@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // Handle HTTPS URLs: https://github.com/org/repo.git
  const httpsMatch = url.match(/https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  // Return as-is if can't parse
  return url;
}

/**
 * Get the repo ID synchronously from an already-detected value or use a default.
 * This is useful for cases where async detection has already been done.
 *
 * @param detectedRepoId - Previously detected repo ID (or undefined)
 * @param fallbackPath - Path to use for fallback
 * @returns Repo ID
 */
export function getRepoIdSync(detectedRepoId: string | undefined, fallbackPath: string): string {
  if (detectedRepoId) {
    return detectedRepoId;
  }
  return `local/${path.basename(path.resolve(fallbackPath))}`;
}
