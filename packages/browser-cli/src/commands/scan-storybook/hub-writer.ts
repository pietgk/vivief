/**
 * Hub Writer
 *
 * Batch push accessibility scan results to DevAC hub.
 */

import type { AxeImpact } from "@pietgk/browser-core";
import {
  type DiagnosticsSeverity,
  type HubClient,
  type UnifiedDiagnostics,
  createHubClient,
  findWorkspaceHubDir,
} from "@pietgk/devac-core";
import type { StoryScanResult } from "./types.js";

/**
 * Options for pushing results to hub
 */
export interface HubWriterOptions {
  /** Repository ID */
  repoId: string;
  /** Clear existing axe diagnostics before push */
  clearExisting?: boolean;
}

/**
 * Map AxeImpact to DiagnosticsSeverity
 */
function impactToSeverity(impact: AxeImpact): DiagnosticsSeverity {
  switch (impact) {
    case "critical":
      return "critical";
    case "serious":
      return "error";
    case "moderate":
      return "warning";
    case "minor":
      return "suggestion";
  }
}

/**
 * Extract file path from story ID
 *
 * Story ID format: "mindlerui-atoms-button--primary"
 * This can be mapped back to a potential file path.
 */
function extractFilePath(storyId: string): string {
  // Story ID format: namespace-category-component--story
  // Convert to potential file path
  const parts = storyId.split("--")[0];
  if (parts) {
    // Convert kebab-case segments back to path
    return `${parts.replace(/-/g, "/")}.stories.tsx`;
  }
  return `storybook://${storyId}`;
}

/**
 * Convert StoryScanResult to UnifiedDiagnostics
 */
function convertToUnifiedDiagnostics(
  result: StoryScanResult,
  repoId: string
): UnifiedDiagnostics[] {
  const now = new Date().toISOString();
  const basePath = extractFilePath(result.storyId);

  return result.violations.map((violation, index) => {
    const filePath = violation.filePath || basePath;

    return {
      diagnostic_id: `axe-${repoId}-${violation.ruleId}-${index}:${result.storyId}`,
      repo_id: repoId,
      source: "axe" as const,
      file_path: filePath,
      line_number: violation.line || null,
      column_number: violation.column || null,
      severity: impactToSeverity(violation.impact),
      category: "accessibility" as const,
      title: violation.ruleName,
      description: `${violation.message}\n\nElement: ${violation.htmlSnippet}\nSelector: ${violation.cssSelector}`,
      code: violation.ruleId,
      suggestion: violation.suggestion || null,
      resolved: false,
      actionable: true,
      created_at: now,
      updated_at: now,
      github_issue_number: null,
      github_pr_number: null,
      workflow_name: null,
      ci_url: violation.helpUrl || null,
    };
  });
}

/**
 * Push scan results to DevAC hub
 *
 * @param results - Array of story scan results
 * @param options - Hub writer options
 * @returns Number of diagnostics pushed
 */
export async function pushResultsToHub(
  results: StoryScanResult[],
  options: HubWriterOptions
): Promise<{ pushed: number }> {
  const { repoId, clearExisting = true } = options;

  // Find workspace hub directory
  const hubDir = await findWorkspaceHubDir();
  if (!hubDir) {
    throw new Error("Could not find DevAC workspace hub. Run 'devac sync' first.");
  }

  // Create hub client
  const client: HubClient = createHubClient({ hubDir });

  // Clear existing axe diagnostics if requested
  if (clearExisting) {
    await client.clearDiagnostics(repoId, "axe");
  }

  // Filter to only results with violations
  const resultsWithViolations = results.filter((r) => r.violations.length > 0);

  if (resultsWithViolations.length === 0) {
    return { pushed: 0 };
  }

  // Convert all results to diagnostics
  const allDiagnostics: UnifiedDiagnostics[] = [];
  for (const result of resultsWithViolations) {
    const diagnostics = convertToUnifiedDiagnostics(result, repoId);
    allDiagnostics.push(...diagnostics);
  }

  // Push to hub
  await client.pushDiagnostics(allDiagnostics);

  return { pushed: allDiagnostics.length };
}

/**
 * Auto-detect repository ID from git remote
 *
 * @returns Repository ID in format "github.com/org/repo" or null if not detected
 */
export async function detectRepoId(): Promise<string | null> {
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    const { stdout } = await execAsync("git remote get-url origin", {
      timeout: 5000,
    });

    const remoteUrl = stdout.trim();

    // Parse git remote URL to extract repo ID
    // Supports:
    // - https://github.com/org/repo.git
    // - git@github.com:org/repo.git
    // - https://github.com/org/repo

    let match = remoteUrl.match(/github\.com[/:]([^/]+\/[^/]+?)(\.git)?$/);
    if (match) {
      return `github.com/${match[1]}`;
    }

    // Generic git URL parsing
    match = remoteUrl.match(/([^/:]+)\/([^/]+?)(\.git)?$/);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }

    return null;
  } catch {
    return null;
  }
}
