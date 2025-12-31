/**
 * Workflow Install Local Command
 *
 * Build and install CLI packages locally:
 * - Run pnpm build
 * - Link CLI packages globally
 * - Verify installation
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { getGitRoot, isGitRepo } from "../../utils/git-utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface InstallLocalOptions {
  /** Path to repository root */
  path?: string;
  /** Skip build step */
  skipBuild?: boolean;
  /** Output as JSON */
  json?: boolean;
}

export interface LinkedPackage {
  /** Package name */
  package: string;
  /** Binary command name */
  binary: string;
  /** Installed version */
  version: string;
  /** Whether link succeeded */
  linked: boolean;
  /** Whether verification succeeded */
  verified: boolean;
  /** Error message if failed */
  error?: string;
}

export interface InstallLocalResult {
  success: boolean;
  error?: string;

  /** Whether build succeeded */
  buildSuccess: boolean;
  /** Build output (if failed) */
  buildOutput?: string;

  /** Linked packages */
  packages: LinkedPackage[];

  /** Summary counts */
  linkedCount: number;
  verifiedCount: number;
  failedCount: number;

  /** Formatted output for CLI */
  formatted?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Package Detection
// ─────────────────────────────────────────────────────────────────────────────

interface CliPackageInfo {
  name: string;
  path: string;
  binary: string;
}

/**
 * Find CLI packages in the workspace that should be linked globally
 */
function findCliPackages(repoRoot: string): CliPackageInfo[] {
  const packages: CliPackageInfo[] = [];
  const packagesDir = path.join(repoRoot, "packages");

  if (!fs.existsSync(packagesDir)) {
    return packages;
  }

  try {
    const entries = fs.readdirSync(packagesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pkgPath = path.join(packagesDir, entry.name);
      const pkgJsonPath = path.join(pkgPath, "package.json");

      if (!fs.existsSync(pkgJsonPath)) continue;

      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

        // Check if package has a bin field (indicates CLI)
        if (pkgJson.bin) {
          const binaries =
            typeof pkgJson.bin === "string"
              ? { [pkgJson.name.split("/").pop()]: pkgJson.bin }
              : pkgJson.bin;

          for (const [binName] of Object.entries(binaries)) {
            packages.push({
              name: pkgJson.name,
              path: path.relative(repoRoot, pkgPath),
              binary: binName,
            });
          }
        }
      } catch {
        // Skip invalid package.json
      }
    }
  } catch {
    // Skip inaccessible directories
  }

  return packages;
}

/**
 * Get version from a CLI binary
 */
function getBinaryVersion(binary: string): string | undefined {
  try {
    const output = execSync(`${binary} --version`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    // Version might be on first line or after package name
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : output.split("\n")[0];
  } catch {
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build and install CLI packages locally
 */
export async function installLocalCommand(
  options: InstallLocalOptions
): Promise<InstallLocalResult> {
  const cwd = options.path ? path.resolve(options.path) : process.cwd();

  // Verify git repo (to find repo root)
  if (!isGitRepo(cwd)) {
    return {
      success: false,
      error: "Not a git repository",
      buildSuccess: false,
      packages: [],
      linkedCount: 0,
      verifiedCount: 0,
      failedCount: 0,
    };
  }

  const repoRoot = getGitRoot(cwd) || cwd;

  // Step 1: Build
  let buildSuccess = true;
  let buildOutput: string | undefined;

  if (!options.skipBuild) {
    try {
      execSync("pnpm build", {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error: unknown) {
      buildSuccess = false;
      const err = error as { stdout?: string; stderr?: string };
      buildOutput = (err.stdout || err.stderr || "").slice(0, 2000);
    }
  }

  if (!buildSuccess) {
    return {
      success: false,
      error: "Build failed",
      buildSuccess: false,
      buildOutput,
      packages: [],
      linkedCount: 0,
      verifiedCount: 0,
      failedCount: 0,
    };
  }

  // Step 2: Find CLI packages
  const cliPackages = findCliPackages(repoRoot);

  if (cliPackages.length === 0) {
    return {
      success: true,
      buildSuccess: true,
      packages: [],
      linkedCount: 0,
      verifiedCount: 0,
      failedCount: 0,
    };
  }

  // Step 3: Link packages globally
  const linkedPackages: LinkedPackage[] = [];

  for (const pkg of cliPackages) {
    const pkgPath = path.join(repoRoot, pkg.path);
    let linked = false;
    let verified = false;
    let version = "";
    let error: string | undefined;

    // Try to link
    try {
      execSync("pnpm link --global", {
        cwd: pkgPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      linked = true;
    } catch (e: unknown) {
      const err = e as { message?: string };
      error = err.message || "Link failed";
    }

    // Verify installation
    if (linked) {
      const installedVersion = getBinaryVersion(pkg.binary);
      if (installedVersion) {
        verified = true;
        version = installedVersion;
      } else {
        error = "Binary not found after linking";
      }
    }

    linkedPackages.push({
      package: pkg.name,
      binary: pkg.binary,
      version,
      linked,
      verified,
      error,
    });
  }

  const linkedCount = linkedPackages.filter((p) => p.linked).length;
  const verifiedCount = linkedPackages.filter((p) => p.verified).length;
  const failedCount = linkedPackages.filter((p) => !p.linked || !p.verified).length;

  const result: InstallLocalResult = {
    success: failedCount === 0,
    buildSuccess: true,
    packages: linkedPackages,
    linkedCount,
    verifiedCount,
    failedCount,
  };

  // Format output
  if (!options.json) {
    result.formatted = formatInstallLocalResult(result);
  }

  return result;
}

/**
 * Format result for CLI output
 */
function formatInstallLocalResult(result: InstallLocalResult): string {
  const lines: string[] = [];

  lines.push("Install Local");
  lines.push("─".repeat(40));

  // Build status
  lines.push(`  Build: ${result.buildSuccess ? "pass" : "FAILED"}`);
  if (result.buildOutput) {
    lines.push("");
    lines.push("  Build output:");
    lines.push(`    ${result.buildOutput.slice(0, 500).replace(/\n/g, "\n    ")}`);
  }

  // Packages
  if (result.packages.length > 0) {
    lines.push("");
    lines.push("  Packages:");
    for (const pkg of result.packages) {
      const status = pkg.verified ? "OK" : pkg.linked ? "linked (unverified)" : "FAILED";
      const version = pkg.version ? ` v${pkg.version}` : "";
      lines.push(`    ${pkg.binary}${version}: ${status}`);
      if (pkg.error) {
        lines.push(`      Error: ${pkg.error}`);
      }
    }
  } else {
    lines.push("");
    lines.push("  No CLI packages found");
  }

  // Summary
  lines.push("");
  lines.push(`  Summary: ${result.verifiedCount}/${result.packages.length} packages installed`);
  lines.push(`  Success: ${result.success ? "YES" : "NO"}`);

  return lines.join("\n");
}
