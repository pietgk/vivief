/**
 * Hub Prerequisites - Shared utility for hub command checks
 *
 * Consolidates the duplicated "hub not initialized" checks across
 * hub-list, hub-register, hub-unregister, hub-status, hub-refresh, etc.
 *
 * This provides a single source of truth for hub prerequisite messages.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { findWorkspaceDir } from "@pietgk/devac-core";

/**
 * Result of hub prerequisite check
 */
export interface HubPrerequisiteResult {
  /** Whether prerequisites are met */
  ready: boolean;
  /** Path to hub directory (.devac) */
  hubDir: string;
  /** Path to hub database file */
  hubPath: string;
  /** Whether hub database exists */
  hubExists: boolean;
  /** Error message if not ready */
  error?: string;
  /** Suggested fix command */
  fixCommand?: string;
}

/**
 * Options for hub prerequisite check
 */
export interface HubPrerequisiteOptions {
  /** Starting path to search from (defaults to cwd) */
  path?: string;
  /** Require hub to exist (default: true) */
  requireHub?: boolean;
  /**
   * If true, treat `path` as the hubDir directly instead of searching for workspace.
   * Use this when hubDir is explicitly provided (e.g., in hub-register, hub-unregister).
   */
  directHubDir?: boolean;
}

/**
 * Check hub prerequisites for commands that require an initialized hub.
 *
 * Provides consistent error messages:
 * - Not in a workspace → tells user to navigate to workspace
 * - Hub not initialized → tells user to run 'devac sync' first
 *
 * @example
 * ```typescript
 * const prereq = await checkHubPrerequisites({ path: cwd });
 * if (!prereq.ready) {
 *   return { success: false, error: prereq.error };
 * }
 * const client = createHubClient({ hubDir: prereq.hubDir });
 * ```
 */
export async function checkHubPrerequisites(
  options: HubPrerequisiteOptions = {}
): Promise<HubPrerequisiteResult> {
  const { path: startPath = process.cwd(), requireHub = true, directHubDir = false } = options;

  let hubDir: string;
  let hubPath: string;

  if (directHubDir) {
    // Use the provided path directly as the hub directory
    hubDir = startPath;
    hubPath = path.join(hubDir, "central.duckdb");
  } else {
    // Find workspace directory by searching up
    const workspaceDir = await findWorkspaceDir(startPath);
    if (!workspaceDir) {
      return {
        ready: false,
        hubDir: "",
        hubPath: "",
        hubExists: false,
        error: `Not in a workspace directory: ${startPath}\nNavigate to a workspace directory (a directory containing git repositories).`,
        fixCommand: "cd <your-workspace>",
      };
    }

    hubDir = path.join(workspaceDir, ".devac");
    hubPath = path.join(hubDir, "central.duckdb");
  }
  const hubExists = await fs
    .access(hubPath)
    .then(() => true)
    .catch(() => false);

  if (requireHub && !hubExists) {
    return {
      ready: false,
      hubDir,
      hubPath,
      hubExists: false,
      error: `Hub database not found at ${hubPath}\nThe hub is created automatically when you analyze code.\nRun 'devac sync' to analyze your codebase and initialize the hub.`,
      fixCommand: "devac sync",
    };
  }

  return {
    ready: true,
    hubDir,
    hubPath,
    hubExists,
  };
}

/**
 * Create an error result for hub commands.
 * Provides a consistent structure for command results.
 */
export function createHubNotReadyResult<T extends { success: boolean; error?: string }>(
  prereq: HubPrerequisiteResult,
  defaults: Partial<T> = {}
): T {
  return {
    success: false,
    error: prereq.error,
    ...defaults,
  } as T;
}
