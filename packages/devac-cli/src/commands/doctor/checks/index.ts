/**
 * Health Check Registry
 *
 * Central registry for all doctor health checks.
 */

import type { CheckCategory, CheckContext, CheckResult, HealthCheck } from "../types.js";
import { changesetChecks } from "./changeset-check.js";
import { cliInstallationChecks } from "./cli-installation.js";
import { hubHealthChecks } from "./hub-health.js";
import { mcpStatusChecks } from "./mcp-status.js";
import { pluginConfigChecks } from "./plugin-config.js";
import { versionChecks } from "./version-check.js";
import { workspaceBuildChecks } from "./workspace-builds.js";

/**
 * All registered health checks
 */
export function getAllChecks(): HealthCheck[] {
  return [
    ...cliInstallationChecks,
    ...hubHealthChecks,
    ...mcpStatusChecks,
    ...workspaceBuildChecks,
    ...pluginConfigChecks,
    ...versionChecks,
    ...changesetChecks,
  ];
}

/**
 * Run all applicable checks
 */
export async function runChecks(context: CheckContext): Promise<CheckResult[]> {
  const checks = getAllChecks();
  const results: CheckResult[] = [];

  for (const check of checks) {
    // Skip workspace-only checks if not in workspace
    if (check.requiresWorkspace && !context.isDevacWorkspace) {
      continue;
    }

    try {
      const result = await check.run(context);
      results.push(result);
    } catch (error) {
      // Check threw an exception - record as failure
      results.push({
        id: check.id,
        name: check.name,
        status: "fail",
        message: "check threw exception",
        details: error instanceof Error ? error.message : String(error),
        category: check.category,
      });
    }
  }

  return results;
}

/**
 * Group results by category for display
 */
export function groupResultsByCategory(results: CheckResult[]): Map<CheckCategory, CheckResult[]> {
  const grouped = new Map<CheckCategory, CheckResult[]>();

  for (const result of results) {
    const existing = grouped.get(result.category) || [];
    existing.push(result);
    grouped.set(result.category, existing);
  }

  return grouped;
}

// Re-export check arrays for direct access if needed
export { changesetChecks } from "./changeset-check.js";
export { cliInstallationChecks } from "./cli-installation.js";
export { hubHealthChecks } from "./hub-health.js";
export { mcpStatusChecks } from "./mcp-status.js";
export { pluginConfigChecks } from "./plugin-config.js";
export { versionChecks } from "./version-check.js";
export { workspaceBuildChecks } from "./workspace-builds.js";
