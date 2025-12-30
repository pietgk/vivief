/**
 * Workspace detection and repo discovery
 *
 * Enables devac-worktree to work from any directory in a workspace
 * by finding the workspace root and resolving repos by name.
 *
 * Note: Uses devac-core's workspace discovery where possible to avoid duplication.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { findWorkspaceDir } from "@pietgk/devac-core";
import { execa } from "execa";

/**
 * Find the workspace root directory
 *
 * Re-exports devac-core's findWorkspaceDir for consistency.
 * Walks up from cwd looking for a workspace directory.
 *
 * @param startPath Starting path to search from (defaults to cwd)
 * @returns Workspace root path or null if not found
 */
export { findWorkspaceDir as findWorkspace };

/**
 * Check if a directory is a git repository
 */
async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const gitPath = path.join(dirPath, ".git");
    const stat = await fs.stat(gitPath);
    // .git can be a directory (regular repo) or a file (worktree)
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Find a repository by name in the workspace
 *
 * @param workspace Workspace root directory
 * @param repoName Name of the repository to find
 * @returns Full path to the repository or null if not found
 */
export async function findRepoInWorkspace(
  workspace: string,
  repoName: string
): Promise<string | null> {
  const repoPath = path.join(workspace, repoName);

  try {
    const stat = await fs.stat(repoPath);
    if (!stat.isDirectory()) {
      return null;
    }

    // Verify it's a git repository
    if (await isGitRepo(repoPath)) {
      return repoPath;
    }
  } catch {
    // Directory doesn't exist
  }

  return null;
}

/**
 * Get GitHub owner/repo from git remote URL
 *
 * Parses the origin remote URL to extract owner and repository name.
 * This is specifically for GitHub API calls (gh CLI) which need owner/repo format.
 *
 * Supported formats:
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo
 * - git@github.com:owner/repo.git
 * - git@github.com:owner/repo
 *
 * @param repoPath Path to the git repository
 * @returns { owner, repo } or null if not parseable
 */
export async function getGitHubRepoFromRemote(
  repoPath: string
): Promise<{ owner: string; repo: string } | null> {
  try {
    const { stdout } = await execa("git", ["remote", "get-url", "origin"], {
      cwd: repoPath,
    });

    const url = stdout.trim();
    return parseGitHubUrl(url);
  } catch {
    return null;
  }
}

/**
 * Parse a GitHub URL to extract owner and repo
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2].replace(/\.git$/, ""),
    };
  }

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch?.[1] && sshMatch[2]) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2].replace(/\.git$/, ""),
    };
  }

  return null;
}

/**
 * Calculate worktree path from workspace and issue info
 *
 * Creates path: {workspace}/{repoName}-{issueNumber}-{slug}
 */
export function calculateWorktreePathFromWorkspace(
  workspace: string,
  repoName: string,
  issueNumber: number,
  shortDescription: string
): string {
  return path.join(workspace, `${repoName}-${issueNumber}-${shortDescription}`);
}
