/**
 * Hub Sync Command Implementation
 *
 * Syncs external feedback (CI status, issues) to the Hub's unified_feedback table.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
  CentralHub,
  discoverContext,
  getCIStatusForContext,
  getIssuesForContext,
  syncCIStatusToHub,
  syncIssuesToHub,
} from "@pietgk/devac-core";
import type { CISyncResult, IssueSyncResult } from "@pietgk/devac-core";

/**
 * Get default hub directory
 */
function getDefaultHubDir(): string {
  return path.join(os.homedir(), ".devac");
}

/**
 * Options for hub sync command
 */
export interface HubSyncOptions {
  /** Current working directory */
  cwd: string;
  /** Sync CI status to Hub */
  ci?: boolean;
  /** Sync GitHub issues to Hub */
  issues?: boolean;
  /** Only sync failing CI checks */
  failingOnly?: boolean;
  /** Only sync open issues (default: true) */
  openOnly?: boolean;
  /** Maximum issues per repo */
  issueLimit?: number;
  /** Filter issues by labels */
  issueLabels?: string[];
  /** Clear existing feedback before syncing */
  clearExisting?: boolean;
  /** Include individual check details */
  includeChecks?: boolean;
}

/**
 * Result of hub sync command
 */
export interface HubSyncResult {
  success: boolean;
  ciSync?: CISyncResult;
  issuesSync?: IssueSyncResult;
  error?: string;
}

/**
 * Sync feedback to the Hub
 */
export async function hubSyncCommand(options: HubSyncOptions): Promise<HubSyncResult> {
  const hubDir = getDefaultHubDir();
  const hub = new CentralHub({ hubDir });

  try {
    await hub.init();

    const result: HubSyncResult = { success: true };
    const errors: string[] = [];

    // Discover context (needed for both CI and issues)
    const context = options.ci || options.issues ? await discoverContext(options.cwd) : null;

    // Sync CI if requested
    if (options.ci && context) {
      // Get CI status
      const ciResult = await getCIStatusForContext(context, {
        includeChecks: options.includeChecks ?? true,
      });

      if (!ciResult.success) {
        errors.push(ciResult.error ?? "Failed to get CI status");
      } else {
        // Sync to Hub
        const syncResult = await syncCIStatusToHub(hub, ciResult, {
          failingOnly: options.failingOnly ?? false,
          clearExisting: options.clearExisting ?? true,
        });

        result.ciSync = syncResult;
        if (syncResult.errors.length > 0) {
          errors.push(...syncResult.errors);
        }
      }
    }

    // Sync issues if requested
    if (options.issues && context) {
      // Get issues
      const issuesResult = await getIssuesForContext(context, {
        openOnly: options.openOnly ?? true,
        limit: options.issueLimit ?? 50,
        labels: options.issueLabels,
      });

      if (!issuesResult.success) {
        errors.push(issuesResult.error ?? "Failed to get issues");
      } else {
        // Sync to Hub
        const syncResult = await syncIssuesToHub(hub, issuesResult, {
          clearExisting: options.clearExisting ?? true,
        });

        result.issuesSync = syncResult;
        if (syncResult.errors.length > 0) {
          errors.push(...syncResult.errors);
        }
      }
    }

    // No sync option specified
    if (!options.ci && !options.issues) {
      return {
        success: false,
        error: "No sync option specified. Use --ci or --issues to sync feedback.",
      };
    }

    result.success = errors.length === 0;
    if (errors.length > 0) {
      result.error = errors.join(", ");
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await hub.close();
  }
}
