/**
 * Hub Health Checks
 *
 * Verify that the DevAC central hub is initialized and queryable.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHubClient, discoverWorkspaceRepos, validateHubLocation } from "@pietgk/devac-core";
import type { CheckContext, CheckResult, HealthCheck } from "../types.js";

/**
 * Check if hub database exists
 */
const hubInitializedCheck: HealthCheck = {
  id: "hub-initialized",
  name: "Hub initialized",
  category: "hub-health",
  requiresWorkspace: false,
  async run(context: CheckContext): Promise<CheckResult> {
    const hubPath = path.join(context.hubDir, "central.duckdb");

    try {
      await fs.access(hubPath);
      return {
        id: "hub-initialized",
        name: "Hub initialized",
        status: "pass",
        message: hubPath.replace(process.env.HOME ?? "", "~"),
        category: "hub-health",
      };
    } catch {
      return {
        id: "hub-initialized",
        name: "Hub initialized",
        status: "fail",
        message: "hub not initialized",
        details: "Run 'devac hub init' to initialize the central hub",
        fixable: true,
        fixCommand: "devac hub init",
        category: "hub-health",
      };
    }
  },
};

/**
 * Check if hub is queryable and count repos
 */
const hubQueryableCheck: HealthCheck = {
  id: "hub-queryable",
  name: "Hub queryable",
  category: "hub-health",
  requiresWorkspace: false,
  async run(context: CheckContext): Promise<CheckResult> {
    // First check if hub exists
    const hubPath = path.join(context.hubDir, "central.duckdb");

    try {
      await fs.access(hubPath);
    } catch {
      return {
        id: "hub-queryable",
        name: "Hub queryable",
        status: "skip",
        message: "hub not initialized",
        category: "hub-health",
      };
    }

    try {
      const client = createHubClient({ hubDir: context.hubDir });
      const repos = await client.listRepos();

      return {
        id: "hub-queryable",
        name: "Hub queryable",
        status: "pass",
        message: `${repos.length} repo${repos.length === 1 ? "" : "s"} registered`,
        category: "hub-health",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if it's a lock error (MCP might be running)
      if (errorMsg.includes("lock") || errorMsg.includes("conflicting")) {
        return {
          id: "hub-queryable",
          name: "Hub queryable",
          status: "warn",
          message: "hub is locked",
          details: "Another process (likely MCP server) has exclusive access",
          category: "hub-health",
        };
      }

      return {
        id: "hub-queryable",
        name: "Hub queryable",
        status: "fail",
        message: "query failed",
        details: errorMsg,
        category: "hub-health",
      };
    }
  },
};

/**
 * Check if hub is at the correct location (workspace level, not inside a git repo)
 */
const hubLocationCheck: HealthCheck = {
  id: "hub-location",
  name: "Hub location",
  category: "hub-health",
  requiresWorkspace: false,
  async run(context: CheckContext): Promise<CheckResult> {
    const validation = await validateHubLocation(context.hubDir);

    if (!validation.valid) {
      return {
        id: "hub-location",
        name: "Hub location",
        status: "fail",
        message: "hub is in wrong location",
        details:
          validation.reason +
          (validation.suggestedPath
            ? `\n\nCorrect location: ${validation.suggestedPath.replace(process.env.HOME ?? "", "~")}`
            : ""),
        fixable: true,
        fixCommand: validation.suggestedPath
          ? `rm -rf "${context.hubDir}" && devac hub init`
          : undefined,
        category: "hub-health",
      };
    }

    return {
      id: "hub-location",
      name: "Hub location",
      status: "pass",
      message: "at workspace level",
      category: "hub-health",
    };
  },
};

/**
 * Check for duplicate hub databases inside git repos
 */
const duplicateHubCheck: HealthCheck = {
  id: "duplicate-hubs",
  name: "Duplicate hubs",
  category: "hub-health",
  requiresWorkspace: true,
  async run(context: CheckContext): Promise<CheckResult> {
    const workspaceDir = path.dirname(context.hubDir);
    const duplicates: string[] = [];

    try {
      // Discover all repos in workspace
      const repos = await discoverWorkspaceRepos(workspaceDir, { checkSeeds: false });

      // Check each repo for a hub database
      for (const repo of repos) {
        const repoHubPath = path.join(repo.path, ".devac", "central.duckdb");
        try {
          await fs.access(repoHubPath);
          duplicates.push(repoHubPath);
        } catch {
          // No hub in this repo - this is expected
        }
      }
    } catch {
      // Can't read workspace - skip this check
      return {
        id: "duplicate-hubs",
        name: "Duplicate hubs",
        status: "skip",
        message: "could not scan workspace",
        category: "hub-health",
      };
    }

    if (duplicates.length > 0) {
      const displayPaths = duplicates.map((p) => p.replace(process.env.HOME ?? "", "~"));
      return {
        id: "duplicate-hubs",
        name: "Duplicate hubs",
        status: "warn",
        message: `found ${duplicates.length} hub(s) inside git repos`,
        details: `These hubs should be removed:\n${displayPaths.map((p) => `  - ${p}`).join("\n")}\n\nRun the fix command to remove them.`,
        fixable: true,
        fixCommand: duplicates.map((p) => `rm -f "${p}"`).join(" && "),
        category: "hub-health",
      };
    }

    return {
      id: "duplicate-hubs",
      name: "Duplicate hubs",
      status: "pass",
      message: "no duplicates found",
      category: "hub-health",
    };
  },
};

/**
 * All hub health checks
 */
export const hubHealthChecks: HealthCheck[] = [
  hubInitializedCheck,
  hubQueryableCheck,
  hubLocationCheck,
  duplicateHubCheck,
];
