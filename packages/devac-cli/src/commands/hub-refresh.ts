/**
 * Hub Refresh Command Implementation
 *
 * Refreshes manifests for registered repositories.
 * Based on spec Phase 4: Federation.
 */

import { type RefreshResult, createHubClient } from "@pietgk/devac-core";
import { checkHubPrerequisites } from "./shared/hub-prerequisites.js";

/**
 * Hub refresh command options
 */
export interface HubRefreshOptions {
  /** Hub directory path */
  hubDir: string;
  /** Optional specific repository ID to refresh */
  repoId?: string;
  /** Force regenerate all manifests */
  force?: boolean;
  /** Skip hub location validation (for tests only) */
  skipValidation?: boolean;
}

/**
 * Hub refresh command result
 */
export interface HubRefreshResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Number of repos refreshed */
  reposRefreshed: number;
  /** Number of packages updated */
  packagesUpdated: number;
  /** Number of edges updated */
  edgesUpdated: number;
  /** Errors encountered */
  errors: string[];
  /** User-facing message */
  message: string;
  /** Error message if command failed entirely */
  error?: string;
}

/**
 * Refresh repository manifests
 */
export async function hubRefresh(options: HubRefreshOptions): Promise<HubRefreshResult> {
  const { hubDir, repoId } = options;

  // Check hub prerequisites using shared utility
  // Use directHubDir since hubDir is already known
  const prereq = await checkHubPrerequisites({ path: hubDir, directHubDir: true });
  if (!prereq.ready) {
    return {
      success: false,
      reposRefreshed: 0,
      packagesUpdated: 0,
      edgesUpdated: 0,
      errors: [],
      message: prereq.error?.split("\n")[0] || "Hub not ready",
      error: prereq.error,
    };
  }

  // Use HubClient (delegates to MCP if running, otherwise direct access)
  const client = createHubClient({ hubDir: prereq.hubDir, skipValidation: options.skipValidation });

  try {
    const result: RefreshResult = await client.refresh(repoId);

    return {
      success: true,
      reposRefreshed: result.reposRefreshed,
      packagesUpdated: result.packagesUpdated,
      edgesUpdated: result.edgesUpdated,
      errors: result.errors,
      message: `Refreshed ${result.reposRefreshed} repository(ies), ${result.packagesUpdated} package(s)`,
    };
  } catch (error) {
    return {
      success: false,
      reposRefreshed: 0,
      packagesUpdated: 0,
      edgesUpdated: 0,
      errors: [],
      message: "Failed to refresh repositories",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
