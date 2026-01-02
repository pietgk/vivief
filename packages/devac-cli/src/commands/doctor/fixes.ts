/**
 * Fix Execution
 *
 * Execute fixes for failed health checks.
 */

import { execSync } from "node:child_process";
import type { CheckContext, CheckResult, FixResult } from "./types.js";

/**
 * Execute fixes for failed checks
 */
export async function executeFixes(
  failedChecks: CheckResult[],
  context: CheckContext,
  dryRun: boolean
): Promise<{ dryRunCommands: string[]; results: FixResult[] }> {
  const fixableChecks = failedChecks.filter((c) => c.fixable && c.fixCommand);
  const dryRunCommands: string[] = [];
  const results: FixResult[] = [];

  for (const check of fixableChecks) {
    const fixCommand = check.fixCommand;
    if (!fixCommand) {
      continue;
    }

    if (dryRun) {
      dryRunCommands.push(fixCommand);
      continue;
    }

    // Actually execute the fix
    try {
      execSync(fixCommand, {
        cwd: context.workspaceRoot || context.cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 300000, // 5 min timeout for builds
      });

      results.push({
        success: true,
        message: `Fixed: ${check.name}`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Try to extract meaningful error from stderr
      let details = errorMsg;
      if (error && typeof error === "object" && "stderr" in error) {
        const stderr = (error as { stderr?: string }).stderr;
        if (stderr) {
          details = stderr.trim().split("\n").slice(-3).join("\n");
        }
      }

      results.push({
        success: false,
        message: `Failed to fix: ${check.name}`,
        error: details,
      });
    }
  }

  return { dryRunCommands, results };
}

/**
 * Get fixable checks from results
 */
export function getFixableChecks(checks: CheckResult[]): CheckResult[] {
  return checks.filter(
    (c) => (c.status === "fail" || c.status === "warn") && c.fixable && c.fixCommand
  );
}
