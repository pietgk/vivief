/**
 * Workspace Build Checks
 *
 * Verify that devac packages are built when inside the workspace.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CheckContext, CheckResult, HealthCheck } from "../types.js";

const DEVAC_PACKAGES = [
  { name: "devac-core", dir: "packages/devac-core", pkg: "@pietgk/devac-core" },
  { name: "devac-cli", dir: "packages/devac-cli", pkg: "@pietgk/devac-cli" },
  { name: "devac-mcp", dir: "packages/devac-mcp", pkg: "@pietgk/devac-mcp" },
  { name: "devac-worktree", dir: "packages/devac-worktree", pkg: "@pietgk/devac-worktree" },
] as const;

/**
 * Create build checks for each devac package
 */
export function createWorkspaceBuildChecks(): HealthCheck[] {
  return DEVAC_PACKAGES.map(({ name, dir, pkg }) => ({
    id: `build-${name}`,
    name: `${name} built`,
    category: "workspace-builds" as const,
    requiresWorkspace: true,
    async run(context: CheckContext): Promise<CheckResult> {
      if (!context.isDevacWorkspace || !context.workspaceRoot) {
        return {
          id: `build-${name}`,
          name: `${name} built`,
          status: "skip",
          message: "not in devac workspace",
          category: "workspace-builds",
        };
      }

      const distPath = path.join(context.workspaceRoot, dir, "dist");
      const indexPath = path.join(distPath, "index.js");

      try {
        await fs.access(indexPath);
        return {
          id: `build-${name}`,
          name: `${name} built`,
          status: "pass",
          message: "dist/index.js exists",
          category: "workspace-builds",
        };
      } catch {
        return {
          id: `build-${name}`,
          name: `${name} built`,
          status: "fail",
          message: "not built",
          fixable: true,
          fixCommand: `pnpm --filter ${pkg} build`,
          category: "workspace-builds",
        };
      }
    },
  }));
}

/**
 * All workspace build checks
 */
export const workspaceBuildChecks: HealthCheck[] = createWorkspaceBuildChecks();
