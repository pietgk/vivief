/**
 * Hub Init Command Implementation
 *
 * Initializes the central federation hub for DevAC v2.0.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createCentralHub } from "@devac/core";

/**
 * Hub init command options
 */
export interface HubInitOptions {
  /** Directory to create hub in (default: ~/.devac) */
  hubDir: string;
  /** Force reinitialization if hub exists */
  force?: boolean;
}

/**
 * Hub init command result
 */
export interface HubInitResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Path to the hub database */
  hubPath: string;
  /** Whether a new hub was created */
  created: boolean;
  /** User-facing message */
  message: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Initialize the central federation hub
 */
export async function hubInit(options: HubInitOptions): Promise<HubInitResult> {
  const { hubDir, force = false } = options;
  const hubPath = path.join(hubDir, "central.duckdb");

  try {
    // Check if hub already exists
    const hubExists = await fs
      .access(hubPath)
      .then(() => true)
      .catch(() => false);

    if (hubExists && !force) {
      return {
        success: true,
        hubPath,
        created: false,
        message: `Hub already exists at ${hubPath}. Use --force to reinitialize.`,
      };
    }

    // Create the hub
    const hub = createCentralHub({ hubDir });

    try {
      await hub.init({ force });

      const message =
        force && hubExists ? `Hub reinitialized at ${hubPath}` : `Hub initialized at ${hubPath}`;

      return {
        success: true,
        hubPath,
        created: true,
        message,
      };
    } finally {
      await hub.close();
    }
  } catch (error) {
    return {
      success: false,
      hubPath,
      created: false,
      message: "Failed to initialize hub",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get the default hub directory path
 */
export function getDefaultHubDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(home, ".devac");
}
