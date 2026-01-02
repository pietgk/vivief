/**
 * Version Update Check
 *
 * Check if a newer version of devac is available via GitHub Releases API.
 */

import { VERSION } from "../../../version.js";
import type { CheckContext, CheckResult, HealthCheck } from "../types.js";

/**
 * Compare two semver version strings
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }

  return 0;
}

/**
 * Find the latest version for devac-cli from GitHub releases
 * Releases are tagged per-package as @pietgk/devac-cli@x.y.z
 */
async function getLatestCliVersion(): Promise<string | null> {
  const response = await fetch("https://api.github.com/repos/pietgk/vivief/releases?per_page=50", {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "devac-cli",
    },
  });

  if (!response.ok) {
    return null;
  }

  const releases = (await response.json()) as { tag_name: string }[];

  // Find latest @pietgk/devac-cli release
  const cliReleases = releases
    .map((r) => r.tag_name)
    .filter((tag) => tag.startsWith("@pietgk/devac-cli@"))
    .map((tag) => tag.replace("@pietgk/devac-cli@", ""));

  if (cliReleases.length === 0) {
    return null;
  }

  // Sort by version (descending) and return the first
  return cliReleases.sort((a, b) => compareVersions(b, a))[0] ?? null;
}

const versionCheck: HealthCheck = {
  id: "version-update",
  name: "Version update",
  category: "version-updates",
  requiresWorkspace: false,

  async run(context: CheckContext): Promise<CheckResult> {
    try {
      const latestVersion = await getLatestCliVersion();

      if (!latestVersion) {
        return {
          id: "version-update",
          name: "Version update",
          status: "skip",
          message: "could not check (API unavailable or no releases)",
          category: "version-updates",
        };
      }

      if (latestVersion === VERSION) {
        return {
          id: "version-update",
          name: "Version update",
          status: "pass",
          message: `up to date (v${VERSION})`,
          category: "version-updates",
        };
      }

      // Compare versions
      const comparison = compareVersions(latestVersion, VERSION);

      if (comparison > 0) {
        // Newer version available
        const fixCommand = context.isDevacWorkspace
          ? "git pull && pnpm install && pnpm build && (cd packages/devac-cli && pnpm link --global)"
          : "npm update -g @pietgk/devac-cli @pietgk/devac-mcp @pietgk/devac-worktree";

        return {
          id: "version-update",
          name: "Version update",
          status: "warn",
          message: `v${latestVersion} available (current: v${VERSION})`,
          fixable: true,
          fixCommand,
          category: "version-updates",
        };
      }

      // Current version is newer than latest release (dev version)
      return {
        id: "version-update",
        name: "Version update",
        status: "pass",
        message: `up to date (v${VERSION}, ahead of v${latestVersion})`,
        category: "version-updates",
      };
    } catch {
      return {
        id: "version-update",
        name: "Version update",
        status: "skip",
        message: "could not check (network error)",
        category: "version-updates",
      };
    }
  },
};

/**
 * All version update checks
 */
export const versionChecks: HealthCheck[] = [versionCheck];
