/**
 * Doctor Output Formatting
 *
 * Format doctor check results for terminal display.
 */

import { groupResultsByCategory } from "./checks/index.js";
import type { CheckCategory, DoctorOptions, DoctorResult, FixResult } from "./types.js";

const CATEGORY_TITLES: Record<CheckCategory, string> = {
  "cli-installation": "CLI Installation",
  "hub-health": "Hub Health",
  "mcp-status": "MCP Status",
  "workspace-builds": "Workspace Builds",
  "plugin-config": "Plugin Configuration",
  "version-updates": "Version Updates",
  "release-prep": "Release Preparation",
};

const STATUS_ICONS: Record<string, string> = {
  pass: "\u2713", // checkmark
  fail: "\u2717", // X
  warn: "!",
  skip: "\u25CB", // circle
};

/**
 * Format doctor output for terminal display
 */
export function formatDoctorOutput(result: DoctorResult, options: DoctorOptions): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("DevAC Doctor - Checking system health...");
  lines.push("");

  // Group checks by category
  const grouped = groupResultsByCategory(result.checks);

  // Display checks by category (in specific order)
  const categoryOrder: CheckCategory[] = [
    "cli-installation",
    "hub-health",
    "mcp-status",
    "workspace-builds",
    "plugin-config",
    "version-updates",
    "release-prep",
  ];

  for (const category of categoryOrder) {
    const categoryChecks = grouped.get(category);
    if (!categoryChecks || categoryChecks.length === 0) continue;

    lines.push(CATEGORY_TITLES[category]);

    for (const check of categoryChecks) {
      const icon = STATUS_ICONS[check.status];
      lines.push(`  ${icon} ${check.name}: ${check.message}`);

      if (
        (check.status === "fail" || check.status === "warn") &&
        check.fixCommand &&
        !options.fix
      ) {
        lines.push(`    Fix: ${check.fixCommand}`);
      }

      if (options.verbose && check.details) {
        lines.push(`    ${check.details}`);
      }
    }

    lines.push("");
  }

  // Workspace detection notice
  if (result.context.isWorkspace && result.context.workspaceRoot) {
    const shortPath = result.context.workspaceRoot.replace(process.env.HOME ?? "", "~");
    lines.push(`Workspace: ${shortPath} (detected)`);
    lines.push("");
  }

  // Summary
  const { summary } = result;
  const issues = summary.failed + summary.warnings;

  if (issues === 0) {
    lines.push("Summary: All checks passed");
  } else {
    lines.push(`Summary: ${issues} issue${issues === 1 ? "" : "s"}, ${summary.fixable} fixable`);

    if (summary.fixable > 0 && !options.fix) {
      lines.push("Run with --fix to apply fixes");
    }
  }

  // Show fix results if fixes were applied
  if (result.fixesApplied && result.fixesApplied.length > 0) {
    lines.push("");
    lines.push("Fixes Applied:");
    for (const fix of result.fixesApplied) {
      const icon = fix.success ? STATUS_ICONS.pass : STATUS_ICONS.fail;
      lines.push(`  ${icon} ${fix.message}`);
      if (!fix.success && fix.error) {
        lines.push(`    Error: ${fix.error}`);
      }
    }
  }

  // Show dry-run commands if in fix mode but dry-run
  if (options.fix && result.fixesApplied === undefined) {
    const fixableChecks = result.checks.filter(
      (c) => (c.status === "fail" || c.status === "warn") && c.fixable && c.fixCommand
    );

    if (fixableChecks.length > 0) {
      lines.push("");
      lines.push("Commands that would be executed:");
      for (const check of fixableChecks) {
        lines.push(`  ${check.fixCommand}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Format fix results summary
 */
export function formatFixResults(results: FixResult[]): string {
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  if (failed === 0) {
    return `All ${succeeded} fix${succeeded === 1 ? "" : "es"} applied successfully`;
  }

  return `${succeeded} fix${succeeded === 1 ? "" : "es"} succeeded, ${failed} failed`;
}
