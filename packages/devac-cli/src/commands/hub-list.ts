/**
 * Hub List Command Implementation
 *
 * Lists all repositories registered with the hub.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createCentralHub } from "@pietgk/devac-core";
import type { CentralHub } from "@pietgk/devac-core";

// RepoInfo type from the hub
type RepoInfo = Awaited<ReturnType<CentralHub["listRepos"]>>[number];

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

  // Check if hub is initialized
  const hubPath = path.join(hubDir, "central.duckdb");
  const hubExists = await fs
    .access(hubPath)
    .then(() => true)
    .catch(() => false);

  if (!hubExists) {
    return {
      success: false,
      repos: [],
      message: "Hub not initialized",
      error: `Hub not initialized at ${hubDir}. Run 'devac hub init' first.`,
    };
  }

  const hub = createCentralHub({ hubDir });

  try {
    await hub.init();
    const repos = await hub.listRepos();

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
  } finally {
    await hub.close();
  }
}
