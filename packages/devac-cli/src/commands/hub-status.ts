/**
 * Hub Status Command Implementation
 *
 * Shows the status of the central federation hub.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { type HubStatus, createHubClient } from "@pietgk/devac-core";

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

  // Check if hub is initialized
  const hubPath = path.join(hubDir, "central.duckdb");
  const hubExists = await fs
    .access(hubPath)
    .then(() => true)
    .catch(() => false);

  if (!hubExists) {
    return {
      success: false,
      message: "Hub not initialized",
      error: `Hub not initialized at ${hubDir}. Run 'devac hub init' first.`,
    };
  }

  // Use HubClient (delegates to MCP if running, otherwise direct access)
  const client = createHubClient({ hubDir });

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
