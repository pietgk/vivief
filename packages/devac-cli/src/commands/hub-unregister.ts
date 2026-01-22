/**
 * Hub Unregister Command Implementation
 *
 * Removes a repository from the central federation hub.
 * Based on spec Phase 4: Federation.
 */

import { createHubClient } from "@pietgk/devac-core";
import { checkHubPrerequisites } from "./shared/hub-prerequisites.js";

/**
 * Hub unregister command options
 */
export interface HubUnregisterOptions {
  /** Hub directory path */
  hubDir: string;
  /** Repository ID to unregister */
  repoId: string;
  /** Skip hub location validation (for tests only) */
  skipValidation?: boolean;
}

/**
 * Hub unregister command result
 */
export interface HubUnregisterResult {
  /** Whether the command succeeded */
  success: boolean;
  /** User-facing message */
  message: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Unregister a repository from the hub
 */
export async function hubUnregister(options: HubUnregisterOptions): Promise<HubUnregisterResult> {
  const { hubDir, repoId } = options;

  // Check hub prerequisites using shared utility
  // Use directHubDir since hubDir is already known
  const prereq = await checkHubPrerequisites({ path: hubDir, directHubDir: true });
  if (!prereq.ready) {
    return {
      success: false,
      message: prereq.error?.split("\n")[0] || "Hub not ready",
      error: prereq.error,
    };
  }

  // Use HubClient (delegates to MCP if running, otherwise direct access)
  const client = createHubClient({ hubDir: prereq.hubDir, skipValidation: options.skipValidation });

  try {
    await client.unregisterRepo(repoId);

    return {
      success: true,
      message: `Repository ${repoId} unregistered successfully`,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to unregister repository",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
