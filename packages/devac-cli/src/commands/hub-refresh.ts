/**
 * Hub Refresh Command Implementation
 *
 * Refreshes manifests for registered repositories.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { type RefreshResult, createCentralHub } from "@pietgk/devac-core";

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

  // Check if hub is initialized
  const hubPath = path.join(hubDir, "central.duckdb");
  const hubExists = await fs
    .access(hubPath)
    .then(() => true)
    .catch(() => false);

  if (!hubExists) {
    return {
      success: false,
      reposRefreshed: 0,
      packagesUpdated: 0,
      edgesUpdated: 0,
      errors: [],
      message: "Hub not initialized",
      error: `Hub not initialized at ${hubDir}. Run 'devac hub init' first.`,
    };
  }

  const hub = createCentralHub({ hubDir });

  try {
    await hub.init();

    let result: RefreshResult;
    if (repoId) {
      result = await hub.refreshRepo(repoId);
    } else {
      result = await hub.refreshAll();
    }

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
  } finally {
    await hub.close();
  }
}
