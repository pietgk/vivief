/**
 * Hub Status Command Implementation
 *
 * Shows the status of the central federation hub.
 * Based on spec Phase 4: Federation.
 */

import { type HubStatus, createHubClient } from "@pietgk/devac-core";
import { checkHubPrerequisites } from "./shared/hub-prerequisites.js";

/**
 * Hub status command options
 */
export interface HubStatusOptions {
  /** Hub directory path */
  hubDir: string;
}

/**
 * Hub status command result
 */
export interface HubStatusResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Hub status information */
  status?: HubStatus;
  /** User-facing message */
  message: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Get the status of the hub
 */
export async function hubStatus(options: HubStatusOptions): Promise<HubStatusResult> {
  const { hubDir } = options;

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
  const client = createHubClient({ hubDir: prereq.hubDir });

  try {
    const status = await client.getStatus();

    return {
      success: true,
      status,
      message: `Hub has ${status.repoCount} repository(ies) with ${status.totalPackages} package(s)`,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to get hub status",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
