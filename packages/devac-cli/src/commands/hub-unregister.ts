/**
 * Hub Unregister Command Implementation
 *
 * Removes a repository from the central federation hub.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createCentralHub } from "@pietgk/devac-core";

/**
 * Hub unregister command options
 */
export interface HubUnregisterOptions {
  /** Hub directory path */
  hubDir: string;
  /** Repository ID to unregister */
  repoId: string;
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

  const hub = createCentralHub({ hubDir });

  try {
    await hub.init();
    await hub.unregisterRepo(repoId);

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
  } finally {
    await hub.close();
  }
}
