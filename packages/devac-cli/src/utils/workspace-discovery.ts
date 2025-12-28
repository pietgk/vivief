/**
 * Workspace Discovery Utilities
 *
 * Re-exports workspace discovery functions from devac-core.
 * The shared implementation supports finding workspaces from:
 * - A workspace directory (contains git repos)
 * - A git repo root
 * - A subdirectory inside a git repo
 */

import { findWorkspaceHubDir as coreFindWorkspaceHubDir } from "@pietgk/devac-core";

// Re-export the shared implementations
export { findGitRoot, findWorkspaceDir, findWorkspaceHubDir } from "@pietgk/devac-core";

/**
 * Get the hub directory for the current workspace.
 * This is a convenience wrapper that throws an error if not in a workspace.
 *
 * @param startDir Directory to start from (default: process.cwd())
 * @returns Path to hub directory
 * @throws Error if not in a workspace
 */
export async function getWorkspaceHubDir(startDir?: string): Promise<string> {
  const hubDir = await coreFindWorkspaceHubDir(startDir);
  if (!hubDir) {
    throw new Error(
      "Not in a workspace. Run from a workspace directory or a repository within a workspace."
    );
  }
  return hubDir;
}
