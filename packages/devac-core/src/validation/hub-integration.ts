/**
 * Hub Integration for Validation
 *
 * Utilities to push validation results to the central Hub cache.
 */

import type { CentralHub } from "../hub/central-hub.js";
import type { ValidationCoordinatorResult } from "./validation-coordinator.js";

/**
 * Push validation results to the Hub cache
 *
 * Converts EnrichedIssue[] from ValidationCoordinator to the Hub's ValidationError format
 * and pushes them to the central hub.
 */
export async function pushValidationResultsToHub(
  hub: CentralHub,
  repoId: string,
  packagePath: string,
  result: ValidationCoordinatorResult
): Promise<{ pushed: number }> {
  const errors: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
    severity: "error" | "warning";
    source: "tsc" | "eslint" | "test";
    code: string | null;
  }> = [];

  // Convert typecheck issues
  if (result.typecheck?.issues) {
    for (const issue of result.typecheck.issues) {
      errors.push({
        file: issue.file,
        line: issue.line,
        column: issue.column,
        message: issue.message,
        severity: issue.severity,
        source: "tsc",
        code: issue.code ?? null,
      });
    }
  }

  // Convert lint issues
  if (result.lint?.issues) {
    for (const issue of result.lint.issues) {
      errors.push({
        file: issue.file,
        line: issue.line,
        column: issue.column,
        message: issue.message,
        severity: issue.severity,
        source: "eslint",
        code: issue.code ?? null,
      });
    }
  }

  // Note: Test failures are not individual file errors, they're aggregate stats
  // We could add test failure details if the TestValidator returns them

  // Push to hub (this clears existing errors for this repo/package first)
  await hub.pushValidationErrors(repoId, packagePath, errors);

  return { pushed: errors.length };
}

/**
 * Clear validation errors for a repository from the Hub
 */
export async function clearValidationErrorsFromHub(hub: CentralHub, repoId: string): Promise<void> {
  await hub.clearValidationErrors(repoId);
}
