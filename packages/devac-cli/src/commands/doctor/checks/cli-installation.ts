/**
 * CLI Installation Checks
 *
 * Verify that devac CLI binaries are installed and working.
 */

import { execSync } from "node:child_process";
import type { CheckContext, CheckResult, HealthCheck } from "../types.js";

const CLI_COMMANDS = [
  { cmd: "devac", pkg: "devac-cli" },
  { cmd: "devac-mcp", pkg: "devac-mcp" },
  { cmd: "devac-worktree", pkg: "devac-worktree" },
] as const;

/**
 * Check if a CLI command is available and get its version
 */
function checkCliVersion(cmd: string): { available: boolean; version?: string; error?: string } {
  try {
    const output = execSync(`${cmd} --version`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    }).trim();

    // Extract version number (e.g., "0.11.0" from output)
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return {
      available: true,
      version: match ? match[1] : output,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if it's a "module not found" error (broken global link)
    if (errorMsg.includes("Cannot find module") && errorMsg.includes("dist/index.js")) {
      return {
        available: false,
        error: "dist/index.js missing (package not built)",
      };
    }

    return {
      available: false,
      error: "not found in PATH",
    };
  }
}

/**
 * Create CLI installation checks for each devac CLI
 */
function createCliChecks(): HealthCheck[] {
  return CLI_COMMANDS.map(({ cmd, pkg }) => ({
    id: `cli-${cmd}`,
    name: cmd,
    category: "cli-installation" as const,
    requiresWorkspace: false,
    async run(context: CheckContext): Promise<CheckResult> {
      const result = checkCliVersion(cmd);

      if (result.available) {
        return {
          id: `cli-${cmd}`,
          name: cmd,
          status: "pass",
          message: result.version ?? "installed",
          category: "cli-installation",
        };
      }

      // Determine if fixable (only if in workspace)
      const fixable = context.isDevacWorkspace;
      const fixCommand = fixable ? `pnpm --filter @pietgk/${pkg} build` : undefined;

      return {
        id: `cli-${cmd}`,
        name: cmd,
        status: "fail",
        message: result.error ?? "not available",
        fixable,
        fixCommand,
        category: "cli-installation",
      };
    },
  }));
}

/**
 * Version consistency check across all CLIs
 */
const versionConsistencyCheck: HealthCheck = {
  id: "cli-version-consistency",
  name: "Version consistency",
  category: "cli-installation",
  requiresWorkspace: false,
  async run(context: CheckContext): Promise<CheckResult> {
    const versions: Record<string, string | null> = {};

    for (const { cmd } of CLI_COMMANDS) {
      const result = checkCliVersion(cmd);
      versions[cmd] = result.available ? (result.version ?? null) : null;
    }

    const validVersions = Object.values(versions).filter((v): v is string => v !== null);
    const uniqueVersions = [...new Set(validVersions)];

    // No CLIs available - skip this check
    if (validVersions.length === 0) {
      return {
        id: "cli-version-consistency",
        name: "Version consistency",
        status: "skip",
        message: "No CLIs available to compare",
        category: "cli-installation",
      };
    }

    // All versions match
    if (uniqueVersions.length === 1) {
      return {
        id: "cli-version-consistency",
        name: "Version consistency",
        status: "pass",
        message: `all at v${uniqueVersions[0]}`,
        category: "cli-installation",
      };
    }

    // Version mismatch
    const versionList = Object.entries(versions)
      .filter(([, v]) => v !== null)
      .map(([cmd, v]) => `${cmd}=${v}`)
      .join(", ");

    return {
      id: "cli-version-consistency",
      name: "Version consistency",
      status: "warn",
      message: `mismatch: ${versionList}`,
      details: "Run 'pnpm build' in workspace to rebuild all packages",
      fixable: context.isDevacWorkspace,
      fixCommand: context.isDevacWorkspace ? "pnpm build" : undefined,
      category: "cli-installation",
    };
  },
};

/**
 * All CLI installation checks
 */
export const cliInstallationChecks: HealthCheck[] = [...createCliChecks(), versionConsistencyCheck];
