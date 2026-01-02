/**
 * Hub Health Checks
 *
 * Verify that the DevAC central hub is initialized and queryable.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHubClient } from "@pietgk/devac-core";
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
 * All hub health checks
 */
export const hubHealthChecks: HealthCheck[] = [hubInitializedCheck, hubQueryableCheck];
