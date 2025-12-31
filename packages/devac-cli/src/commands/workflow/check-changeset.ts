/**
 * Workflow Check Changeset Command
 *
 * Deterministically checks if a changeset is needed based on:
 * - Which packages have source code changes
 * - Whether existing changesets cover those packages
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  getChangedFilesSinceBranch,
  getChangesetsOnBranch,
  getDefaultBranch,
  getGitRoot,
  isGitRepo,
  parseChangesetPackages,
} from "../../utils/git-utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckChangesetOptions {
  /** Path to repository root */
  path?: string;
  /** Base branch to compare against (default: auto-detect main/master) */
  base?: string;
  /** Output as JSON */
  json?: boolean;
}

export interface CheckChangesetResult {
  success: boolean;
  error?: string;

  /** Whether a changeset is needed */
  needsChangeset: boolean;
  /** Reason for the decision */
  reason: string;

  /** Packages with source code changes */
  packagesChanged: string[];
  /** All files changed since base */
  changedFiles: string[];
  /** Changesets added on this branch */
  existingChangesets: string[];
  /** Packages already covered by existing changesets */
  packagesCovered: string[];
  /** Packages needing changeset (changed but not covered) */
  packagesNeedingChangeset: string[];

  /** Whether existing changesets cover all changed packages */
  changesetsCoverAll: boolean;

  /** Suggested bump type based on commit messages */
  suggestedBumpType?: "patch" | "minor" | "major";

  /** Formatted output for CLI */
  formatted?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Package Detection
// ─────────────────────────────────────────────────────────────────────────────

interface PackageInfo {
  name: string;
  path: string;
}

/**
 * Parse pnpm-workspace.yaml to get package patterns
 */
function getWorkspacePatterns(repoRoot: string): string[] {
  const workspacePath = path.join(repoRoot, "pnpm-workspace.yaml");

  if (!fs.existsSync(workspacePath)) {
    return ["packages/*"];
  }

  try {
    const content = fs.readFileSync(workspacePath, "utf-8");
    // Simple YAML parsing for packages array
    const patterns: string[] = [];
    const lines = content.split("\n");
    let inPackages = false;

    for (const line of lines) {
      if (line.trim() === "packages:") {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        if (line.startsWith("  - ")) {
          const pattern = line.replace("  - ", "").replace(/['"]/g, "").trim();
          patterns.push(pattern);
        } else if (!line.startsWith("  ") && line.trim()) {
          break;
        }
      }
    }

    return patterns.length > 0 ? patterns : ["packages/*"];
  } catch {
    return ["packages/*"];
  }
}

/**
 * Get all packages in the workspace
 */
function getWorkspacePackages(repoRoot: string): PackageInfo[] {
  const patterns = getWorkspacePatterns(repoRoot);
  const packages: PackageInfo[] = [];

  for (const pattern of patterns) {
    // Handle simple patterns like "packages/*"
    const basePath = pattern.replace("/*", "").replace("/**", "");
    const packagesDir = path.join(repoRoot, basePath);

    if (!fs.existsSync(packagesDir)) continue;

    try {
      const entries = fs.readdirSync(packagesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pkgPath = path.join(packagesDir, entry.name);
        const pkgJsonPath = path.join(pkgPath, "package.json");

        if (fs.existsSync(pkgJsonPath)) {
          try {
            const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
            packages.push({
              name: pkgJson.name || entry.name,
              path: path.relative(repoRoot, pkgPath),
            });
          } catch {
            // Skip invalid package.json
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  return packages;
}

/**
 * Map a changed file to its package (if any)
 */
function mapFileToPackage(file: string, packages: PackageInfo[]): PackageInfo | undefined {
  for (const pkg of packages) {
    if (file.startsWith(`${pkg.path}/`)) {
      return pkg;
    }
  }
  return undefined;
}

/**
 * Check if a file is a source file (in src/ directory)
 */
function isSourceFile(file: string, pkgPath: string): boolean {
  const relativePath = file.slice(pkgPath.length + 1);
  return relativePath.startsWith("src/");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if changeset is needed
 */
export async function checkChangesetCommand(
  options: CheckChangesetOptions
): Promise<CheckChangesetResult> {
  const cwd = options.path ? path.resolve(options.path) : process.cwd();

  // Verify git repo
  if (!isGitRepo(cwd)) {
    return {
      success: false,
      error: "Not a git repository",
      needsChangeset: false,
      reason: "Not a git repository",
      packagesChanged: [],
      changedFiles: [],
      existingChangesets: [],
      packagesCovered: [],
      packagesNeedingChangeset: [],
      changesetsCoverAll: false,
    };
  }

  const repoRoot = getGitRoot(cwd) || cwd;
  const base = options.base || getDefaultBranch(cwd);

  // Get changed files
  const changedFiles = getChangedFilesSinceBranch(base, cwd);

  // Get workspace packages
  const packages = getWorkspacePackages(repoRoot);

  // Find packages with source changes
  const packagesWithSourceChanges = new Set<string>();
  for (const file of changedFiles) {
    const pkg = mapFileToPackage(file, packages);
    if (pkg && isSourceFile(file, pkg.path)) {
      packagesWithSourceChanges.add(pkg.name);
    }
  }
  const packagesChanged = Array.from(packagesWithSourceChanges);

  // Get existing changesets on this branch
  const existingChangesets = getChangesetsOnBranch(base, cwd);

  // Parse changesets to find covered packages
  const packagesCovered = new Set<string>();
  for (const changesetFile of existingChangesets) {
    const changesetPath = path.join(repoRoot, ".changeset", changesetFile);
    const coveredPackages = parseChangesetPackages(changesetPath);
    for (const pkg of coveredPackages) {
      packagesCovered.add(pkg);
    }
  }

  // Find packages needing changeset
  const packagesNeedingChangeset = packagesChanged.filter((pkg) => !packagesCovered.has(pkg));

  // Determine if changeset is needed
  const needsChangeset = packagesNeedingChangeset.length > 0;
  const changesetsCoverAll = packagesNeedingChangeset.length === 0 && packagesChanged.length > 0;

  // Build reason
  let reason: string;
  if (packagesChanged.length === 0) {
    reason = "No package source files changed";
  } else if (needsChangeset) {
    reason = `${packagesNeedingChangeset.length} package(s) have src/ changes without changeset: ${packagesNeedingChangeset.join(", ")}`;
  } else if (existingChangesets.length > 0) {
    reason = `All ${packagesChanged.length} changed package(s) are covered by existing changesets`;
  } else {
    reason = "No changeset needed";
  }

  const result: CheckChangesetResult = {
    success: true,
    needsChangeset,
    reason,
    packagesChanged,
    changedFiles,
    existingChangesets,
    packagesCovered: Array.from(packagesCovered),
    packagesNeedingChangeset,
    changesetsCoverAll,
  };

  // Format output
  if (!options.json) {
    result.formatted = formatCheckChangesetResult(result);
  }

  return result;
}

/**
 * Format result for CLI output
 */
function formatCheckChangesetResult(result: CheckChangesetResult): string {
  const lines: string[] = [];

  lines.push("Changeset Check");
  lines.push("─".repeat(40));

  if (result.packagesChanged.length === 0) {
    lines.push("  No package source files changed");
    lines.push("  Changeset: Not needed");
    return lines.join("\n");
  }

  lines.push(`  Packages with src/ changes: ${result.packagesChanged.length}`);
  for (const pkg of result.packagesChanged) {
    const covered = result.packagesCovered.includes(pkg);
    const status = covered ? "[covered]" : "[needs changeset]";
    lines.push(`    - ${pkg} ${status}`);
  }

  if (result.existingChangesets.length > 0) {
    lines.push("");
    lines.push(`  Existing changesets: ${result.existingChangesets.length}`);
    for (const cs of result.existingChangesets) {
      lines.push(`    - ${cs}`);
    }
  }

  lines.push("");
  if (result.needsChangeset) {
    lines.push("  Changeset: NEEDED");
    lines.push(`  Packages needing changeset: ${result.packagesNeedingChangeset.join(", ")}`);
  } else {
    lines.push("  Changeset: Not needed (all covered)");
  }

  return lines.join("\n");
}
