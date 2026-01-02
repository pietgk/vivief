/**
 * Changeset Check
 *
 * Detect unreleased changesets that need `changeset version` to be run.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CheckContext, CheckResult, HealthCheck } from "../types.js";

const changesetCheck: HealthCheck = {
  id: "unreleased-changesets",
  name: "Unreleased changesets",
  category: "release-prep",
  requiresWorkspace: true,

  async run(context: CheckContext): Promise<CheckResult> {
    if (!context.isDevacWorkspace || !context.workspaceRoot) {
      return {
        id: "unreleased-changesets",
        name: "Unreleased changesets",
        status: "skip",
        message: "not in devac workspace",
        category: "release-prep",
      };
    }

    const changesetDir = path.join(context.workspaceRoot, ".changeset");

    try {
      const files = await fs.readdir(changesetDir);
      const changesets = files.filter((f) => f.endsWith(".md") && f !== "README.md");

      if (changesets.length === 0) {
        return {
          id: "unreleased-changesets",
          name: "Unreleased changesets",
          status: "pass",
          message: "all changes released",
          category: "release-prep",
        };
      }

      return {
        id: "unreleased-changesets",
        name: "Unreleased changesets",
        status: "warn",
        message: `${changesets.length} unreleased changeset(s)`,
        details: changesets.join(", "),
        fixable: true,
        fixCommand: "pnpm version-packages",
        category: "release-prep",
      };
    } catch {
      return {
        id: "unreleased-changesets",
        name: "Unreleased changesets",
        status: "skip",
        message: ".changeset not found",
        category: "release-prep",
      };
    }
  },
};

/**
 * All release preparation checks
 */
export const changesetChecks: HealthCheck[] = [changesetCheck];
