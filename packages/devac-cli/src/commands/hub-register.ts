/**
 * Hub Register Command Implementation
 *
 * Registers a repository with the central federation hub.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createCentralHub } from "@devac/core";

/**
 * Hub register command options
 */
export interface HubRegisterOptions {
  /** Hub directory path */
  hubDir: string;
  /** Path to the repository to register */
  repoPath: string;
}

/**
 * Hub register command result
 */
export interface HubRegisterResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Repository ID */
  repoId?: string;
  /** Number of packages registered */
  packages?: number;
  /** Number of cross-repo edges extracted */
  crossRepoEdges?: number;
  /** User-facing message */
  message: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Register a repository with the hub
 */
export async function hubRegister(options: HubRegisterOptions): Promise<HubRegisterResult> {
  const { hubDir, repoPath } = options;

  // Validate repo path exists
  const repoExists = await fs
    .access(repoPath)
    .then(() => true)
    .catch(() => false);

  if (!repoExists) {
    return {
      success: false,
      message: "Repository path does not exist",
      error: `Repository path does not exist: ${repoPath}`,
    };
  }

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
    const result = await hub.registerRepo(repoPath);

    return {
      success: true,
      repoId: result.repoId,
      packages: result.packages,
      crossRepoEdges: result.crossRepoEdges,
      message: `Registered ${result.repoId} with ${result.packages} package(s)`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      message: "Failed to register repository",
      error: errorMessage,
    };
  } finally {
    await hub.close();
  }
}
