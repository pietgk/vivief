/**
 * Hub List Command Implementation
 *
 * Lists all repositories registered with the hub.
 * Based on spec Phase 4: Federation.
 */

import { createHubClient } from "@pietgk/devac-core";
import type { HubClient } from "@pietgk/devac-core";
import { checkHubPrerequisites } from "./shared/hub-prerequisites.js";

// RepoInfo type from the hub client
type RepoInfo = Awaited<ReturnType<HubClient["listRepos"]>>[number];

/**
 * Hub list command options
 */
export interface HubListOptions {
  /** Hub directory path */
  hubDir: string;
  /** Output as JSON */
  json?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Skip hub location validation (for tests only) */
  skipValidation?: boolean;
}

/**
 * Hub list command result
 */
export interface HubListResult {
  /** Whether the command succeeded */
  success: boolean;
  /** List of registered repositories */
  repos: RepoInfo[];
  /** User-facing message */
  message: string;
  /** Error message if failed */
  error?: string;
}

/**
 * List all registered repositories
 */
export async function hubList(options: HubListOptions): Promise<HubListResult> {
  const { hubDir } = options;

  // Check hub prerequisites using shared utility
  // Use directHubDir since hubDir is already known
  const prereq = await checkHubPrerequisites({ path: hubDir, directHubDir: true });
  if (!prereq.ready) {
    return {
      success: false,
      repos: [],
      message: prereq.error?.split("\n")[0] || "Hub not ready",
      error: prereq.error,
    };
  }

  // Use HubClient (delegates to MCP if running, otherwise direct access)
  const client = createHubClient({ hubDir: prereq.hubDir, skipValidation: options.skipValidation });

  try {
    const repos = await client.listRepos();

    return {
      success: true,
      repos,
      message: `Found ${repos.length} registered repository(ies)`,
    };
  } catch (error) {
    return {
      success: false,
      repos: [],
      message: "Failed to list repositories",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
