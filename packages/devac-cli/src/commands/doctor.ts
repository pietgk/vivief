/**
 * Doctor Command
 *
 * Diagnose and fix common issues with the DevAC CLI/MCP setup.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { findGitRoot } from "@pietgk/devac-core";
import type { Command } from "commander";
import { getWorkspaceHubDir } from "../utils/workspace-discovery.js";
import { runChecks } from "./doctor/checks/index.js";
import { executeFixes, getFixableChecks } from "./doctor/fixes.js";
import { formatDoctorOutput } from "./doctor/formatters.js";
import type {
  CheckContext,
  DoctorOptions,
  DoctorResult,
  FixResult,
  InstallMethod,
} from "./doctor/types.js";

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
 * Detect how devac CLI is installed
 *
 * Checks if devac is linked from a local workspace (via pnpm link or npm link)
 * vs installed globally from the npm registry.
 *
 * The detection works by resolving symlinks to find the real source path.
 * If the real path points to a devac workspace, we know it's linked.
 */
async function detectInstallMethod(): Promise<{
  installMethod: InstallMethod;
  linkedWorkspaceRoot?: string;
}> {
  try {
    // Get devac binary location
    const devacPath = execSync("which devac", { encoding: "utf-8" }).trim();

    if (!devacPath) {
      return { installMethod: "unknown" };
    }

    // Follow symlinks to find the real source location
    // This works for both pnpm link and npm link (including via Volta)
    const realPath = await fs.realpath(devacPath);

    // Check if the real path is inside a devac workspace
    // Pattern: .../vivief/packages/devac-cli/dist/index.js
    const cliDistIndex = realPath.indexOf("/packages/devac-cli/");

    if (cliDistIndex === -1) {
      // Not inside a workspace structure
      // Check if it looks like a global npm install
      if (realPath.includes("/node_modules/@pietgk/devac-cli/")) {
        return { installMethod: "npm-global" };
      }
      return { installMethod: "unknown" };
    }

    const potentialWorkspaceRoot = realPath.substring(0, cliDistIndex);

    // Verify it's a devac workspace by checking for markers
    const markers = [
      "packages/devac-core/package.json",
      "packages/devac-cli/package.json",
      "pnpm-workspace.yaml",
    ];

    for (const marker of markers) {
      try {
        await fs.access(path.join(potentialWorkspaceRoot, marker));
        // Found a valid devac workspace - it's linked (pnpm or npm)
        return {
          installMethod: "pnpm-link",
          linkedWorkspaceRoot: potentialWorkspaceRoot,
        };
      } catch {
        // Marker not found, continue
      }
    }

    // Real path has workspace structure but couldn't verify markers
    // Still treat as linked since it's not in node_modules/@pietgk
    return { installMethod: "pnpm-link" };
  } catch {
    // which command failed, symlink resolution failed, or other error
    return { installMethod: "unknown" };
  }
}

/**
 * Run the doctor command
 */
export async function doctorCommand(options: DoctorOptions): Promise<DoctorResult> {
  // Get hubDir from options or try to detect from workspace
  let hubDir: string;
  if (options.hubDir) {
    hubDir = options.hubDir;
  } else {
    try {
      hubDir = await getWorkspaceHubDir();
    } catch {
      // Not in a workspace - use a placeholder for doctor diagnostics
      hubDir = path.join(process.env.HOME || process.env.USERPROFILE || "", ".devac");
    }
  }
  const cwd = options.cwd ?? process.cwd();

  // Detect workspace context
  const { isDevacWorkspace, workspaceRoot } = await detectDevacWorkspace(cwd);

  // Detect installation method (pnpm-link vs npm-global)
  const { installMethod, linkedWorkspaceRoot } = await detectInstallMethod();

  // Build check context
  const context: CheckContext = {
    hubDir,
    cwd,
    workspaceRoot,
    isDevacWorkspace,
    installMethod,
    linkedWorkspaceRoot,
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
    .option("--fix", "Execute fixes (default: dry-run only)")
    .option("--json", "Output as JSON")
    .option("--verbose", "Show additional details")
    .action(async (options) => {
      const result = await doctorCommand({
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
