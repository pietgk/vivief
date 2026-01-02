/**
 * Doctor Command
 *
 * Diagnose and fix common issues with the DevAC CLI/MCP setup.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { findGitRoot, getDefaultHubDir } from "@pietgk/devac-core";
import type { Command } from "commander";
import { runChecks } from "./doctor/checks/index.js";
import { executeFixes, getFixableChecks } from "./doctor/fixes.js";
import { formatDoctorOutput } from "./doctor/formatters.js";
import type { CheckContext, DoctorOptions, DoctorResult, FixResult } from "./doctor/types.js";

// Re-export types for consumers
export type { DoctorOptions, DoctorResult } from "./doctor/types.js";

/**
 * Detect if we're inside the devac workspace
 */
async function detectDevacWorkspace(cwd: string): Promise<{
  isDevacWorkspace: boolean;
  workspaceRoot?: string;
}> {
  const gitRoot = await findGitRoot(cwd);

  if (!gitRoot) {
    return { isDevacWorkspace: false };
  }

  // Check for devac-specific markers
  const markers = [
    "packages/devac-core/package.json",
    "packages/devac-cli/package.json",
    "plugins/devac/.claude-plugin/plugin.json",
  ];

  for (const marker of markers) {
    try {
      await fs.access(path.join(gitRoot, marker));
      return { isDevacWorkspace: true, workspaceRoot: gitRoot };
    } catch {
      // Marker not found, continue to next
    }
  }

  return { isDevacWorkspace: false, workspaceRoot: gitRoot };
}

/**
 * Run the doctor command
 */
export async function doctorCommand(options: DoctorOptions): Promise<DoctorResult> {
  const hubDir = options.hubDir ?? getDefaultHubDir();
  const cwd = options.cwd ?? process.cwd();

  // Detect workspace context
  const { isDevacWorkspace, workspaceRoot } = await detectDevacWorkspace(cwd);

  // Build check context
  const context: CheckContext = {
    hubDir,
    cwd,
    workspaceRoot,
    isDevacWorkspace,
    verbose: options.verbose ?? false,
  };

  // Run all applicable checks
  const checks = await runChecks(context);

  // Calculate summary
  const summary = {
    total: checks.length,
    passed: checks.filter((c) => c.status === "pass").length,
    failed: checks.filter((c) => c.status === "fail").length,
    warnings: checks.filter((c) => c.status === "warn").length,
    skipped: checks.filter((c) => c.status === "skip").length,
    fixable: getFixableChecks(checks).length,
  };

  // Handle fix mode
  let fixesApplied: FixResult[] | undefined;

  if (options.fix) {
    const fixableChecks = getFixableChecks(checks);

    if (fixableChecks.length > 0) {
      const { results } = await executeFixes(fixableChecks, context, false);
      fixesApplied = results;
    }
  }

  const result: DoctorResult = {
    success: summary.failed === 0,
    checks,
    summary,
    context: {
      isWorkspace: isDevacWorkspace,
      workspaceRoot,
      hubDir,
    },
    fixesApplied,
  };

  // Format output unless JSON mode
  if (!options.json) {
    result.formatted = formatDoctorOutput(result, options);
  }

  return result;
}

/**
 * Register the doctor command with CLI program
 */
export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check DevAC system health and fix issues")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("--fix", "Execute fixes (default: dry-run only)")
    .option("--json", "Output as JSON")
    .option("--verbose", "Show additional details")
    .action(async (options) => {
      const result = await doctorCommand({
        hubDir: options.hubDir,
        fix: options.fix,
        json: options.json,
        verbose: options.verbose,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.formatted);
      }

      process.exit(result.success ? 0 : 1);
    });
}
