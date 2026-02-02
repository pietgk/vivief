/**
 * Push Axe Diagnostics to Hub
 *
 * Utilities to push AxeScanner results to the central Hub as unified diagnostics.
 */

import type { CentralHub } from "./central-hub.js";
import type { DiagnosticsSeverity, UnifiedDiagnostics } from "./hub-storage.js";

/**
 * Axe impact levels (from axe-core)
 */
export type AxeImpact = "critical" | "serious" | "moderate" | "minor";

/**
 * A11y violation from AxeScanner
 */
export interface AxeViolation {
  /** Rule identifier (e.g., "color-contrast", "button-name") */
  ruleId: string;
  /** Human-readable rule description */
  ruleName: string;
  /** Impact severity level */
  impact: AxeImpact;
  /** WCAG success criterion (e.g., "1.4.3", "4.1.2") */
  wcagCriterion: string;
  /** WCAG conformance level */
  wcagLevel: "A" | "AA" | "AAA";
  /** Human-readable description of the violation */
  message: string;
  /** HTML snippet of the element */
  htmlSnippet: string;
  /** CSS selector for the element */
  cssSelector: string;
  /** Suggested fix */
  suggestion?: string;
  /** Help URL */
  helpUrl?: string;
  /** File path (if determinable) */
  filePath?: string;
  /** Line number (if determinable) */
  line?: number;
  /** Column number (if determinable) */
  column?: number;
}

/**
 * Axe scan result (subset of AxeScanResult from browser-core)
 */
export interface AxeScanResultForHub {
  violations: AxeViolation[];
  url: string;
  timestamp: string;
  contextLabel?: string;
}

/**
 * Options for pushing axe diagnostics
 */
export interface PushAxeDiagnosticsOptions {
  /** Repository ID */
  repoId: string;
  /** Story ID or page identifier */
  storyId?: string;
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
 * Extract file path from story ID or URL
 *
 * Story ID format: "mindlerui-atoms-button--primary"
 * This can be mapped back to a file path if we have component metadata.
 */
function extractFilePath(storyId?: string, url?: string): string | null {
  if (storyId) {
    // Story ID format: namespace-category-component--story
    // Convert to potential file path
    const parts = storyId.split("--")[0];
    if (parts) {
      // Convert kebab-case segments back to path
      return `${parts.replace(/-/g, "/")}.stories.tsx`;
    }
  }
  return url || null;
}

/**
 * Push AxeScanner results to the Hub as unified diagnostics
 *
 * @example
 * ```typescript
 * import { pushAxeDiagnosticsToHub } from "@pietgk/devac-core";
 *
 * const result = await axeScanner.scan();
 * await pushAxeDiagnosticsToHub(hub, result, {
 *   repoId: "github.com/org/repo",
 *   storyId: "mindlerui-atoms-button--primary",
 *   clearExisting: true,
 * });
 * ```
 */
export async function pushAxeDiagnosticsToHub(
  hub: CentralHub,
  scanResult: AxeScanResultForHub,
  options: PushAxeDiagnosticsOptions
): Promise<{ pushed: number }> {
  const { repoId, storyId, clearExisting = true } = options;

  // Clear existing axe diagnostics for this repo if requested
  if (clearExisting) {
    await hub.clearDiagnostics(repoId, "axe");
  }

  if (scanResult.violations.length === 0) {
    return { pushed: 0 };
  }

  const now = new Date().toISOString();
  const basePath = extractFilePath(storyId, scanResult.url);

  // Convert violations to UnifiedDiagnostics
  const diagnostics: UnifiedDiagnostics[] = scanResult.violations.map((violation, index) => {
    const filePath = violation.filePath || basePath;
    const contextSuffix = storyId ? `:${storyId}` : "";

    return {
      diagnostic_id: `axe-${repoId}-${violation.ruleId}-${index}${contextSuffix}`,
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

  await hub.pushDiagnostics(diagnostics);

  return { pushed: diagnostics.length };
}

/**
 * Push multiple scan results to the Hub
 *
 * Useful when scanning multiple stories or pages in a batch.
 */
export async function pushBatchAxeDiagnosticsToHub(
  hub: CentralHub,
  scanResults: Array<{ result: AxeScanResultForHub; storyId?: string }>,
  options: Omit<PushAxeDiagnosticsOptions, "storyId">
): Promise<{ pushed: number }> {
  const { repoId, clearExisting = true } = options;

  // Clear all existing axe diagnostics once at the start
  if (clearExisting) {
    await hub.clearDiagnostics(repoId, "axe");
  }

  let totalPushed = 0;

  for (const { result, storyId } of scanResults) {
    const { pushed } = await pushAxeDiagnosticsToHub(hub, result, {
      repoId,
      storyId,
      clearExisting: false, // Already cleared above
    });
    totalPushed += pushed;
  }

  return { pushed: totalPushed };
}
