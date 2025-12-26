/**
 * Workspace Discovery Utilities
 *
 * Find the workspace directory from the current working directory.
 * Uses the git-based convention from devac-core.
 */

import * as path from "node:path";
import { isGitRepo, isWorkspaceDirectory } from "@pietgk/devac-core";

/**
 * Find the workspace directory containing the current directory.
 *
 * Convention:
 * - If cwd is a git repo → parent is the workspace
 * - If cwd contains git repos → cwd is the workspace
 *
 * @param startDir Directory to start from (default: process.cwd())
 * @returns Path to workspace directory, or null if not in a workspace
 */
export async function findWorkspaceDir(startDir?: string): Promise<string | null> {
  const dir = path.resolve(startDir || process.cwd());

  // Case 1: Current dir is a git repo → parent is workspace
  if (await isGitRepo(dir)) {
    const parent = path.dirname(dir);
    if (await isWorkspaceDirectory(parent)) {
      return parent;
    }
    // Parent isn't a workspace, this is a standalone repo
    return null;
  }

  // Case 2: Current dir might be a workspace
  if (await isWorkspaceDirectory(dir)) {
    return dir;
  }

  return null;
}

/**
 * Get the hub directory for the current workspace.
 *
 * @param startDir Directory to start from (default: process.cwd())
 * @returns Path to hub directory
 * @throws Error if not in a workspace
 */
export async function getWorkspaceHubDir(startDir?: string): Promise<string> {
  const workspaceDir = await findWorkspaceDir(startDir);
  if (!workspaceDir) {
    throw new Error(
      "Not in a workspace. Run from a workspace directory or a repository within a workspace."
    );
  }
  return path.join(workspaceDir, ".devac");
}
