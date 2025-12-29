/**
 * Seed State Detection
 *
 * Detects the seed state for packages within a repository.
 * Seeds can be in three states:
 * - none: No seeds exist for the package
 * - base: Base seeds exist (analyzed on main/default branch)
 * - delta: Branch-specific delta seeds exist
 * - both: Both base and delta seeds exist
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getRepoId } from "./discover.js";
import { discoverAllPackages } from "./package-manager.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Seed state for a package
 * - none: No seeds exist
 * - base: Only base seeds exist
 * - delta: Only delta seeds exist
 * - both: Both base and delta seeds exist
 */
export type SeedState = "none" | "base" | "delta" | "both";

/**
 * Detailed seed state for a single package
 */
export interface PackageSeedState {
  /** Absolute path to the package */
  packagePath: string;

  /** Package name */
  packageName: string;

  /** Overall seed state */
  state: SeedState;

  /** Whether base seeds exist */
  hasBase: boolean;

  /** Whether delta seeds exist */
  hasDelta: boolean;

  /** Last modified time of base seeds (ISO string) */
  baseLastModified?: string;

  /** Last modified time of delta seeds (ISO string) */
  deltaLastModified?: string;
}

/**
 * Seed status summary for a repository
 */
export interface RepoSeedStatus {
  /** Absolute path to the repository */
  repoPath: string;

  /** Repository ID */
  repoId: string;

  /** Seed state for each package */
  packages: PackageSeedState[];

  /** Summary counts */
  summary: {
    /** Total number of packages */
    total: number;
    /** Packages with no seeds */
    none: number;
    /** Packages with only base seeds */
    base: number;
    /** Packages with only delta seeds */
    delta: number;
    /** Packages with both base and delta seeds */
    both: number;
  };
}

// ============================================================================
// Seed Detection Functions
// ============================================================================

/**
 * Check if base seeds exist for a package
 *
 * Base seeds are stored in `.devac/seed/base/`
 */
export async function hasBaseSeed(packagePath: string): Promise<boolean> {
  const basePath = path.join(packagePath, ".devac", "seed", "base");
  return await directoryExists(basePath);
}

/**
 * Check if delta seeds exist for a package
 *
 * Delta seeds are stored in `.devac/seed/branch/`
 */
export async function hasDeltaSeed(packagePath: string): Promise<boolean> {
  const branchPath = path.join(packagePath, ".devac", "seed", "branch");
  return await directoryExists(branchPath);
}

/**
 * Get the last modified time of a seed directory
 */
async function getSeedLastModified(seedPath: string): Promise<string | undefined> {
  try {
    const stats = await fs.stat(seedPath);
    return stats.mtime.toISOString();
  } catch {
    return undefined;
  }
}

/**
 * Compute the overall seed state from base/delta flags
 */
function computeSeedState(hasBase: boolean, hasDelta: boolean): SeedState {
  if (hasBase && hasDelta) {
    return "both";
  }
  if (hasBase) {
    return "base";
  }
  if (hasDelta) {
    return "delta";
  }
  return "none";
}

/**
 * Detect the seed state for a single package
 */
export async function detectPackageSeedState(
  packagePath: string,
  packageName?: string
): Promise<PackageSeedState> {
  const basePath = path.join(packagePath, ".devac", "seed", "base");
  const branchPath = path.join(packagePath, ".devac", "seed", "branch");

  const [hasBase, hasDelta] = await Promise.all([
    directoryExists(basePath),
    directoryExists(branchPath),
  ]);

  const [baseLastModified, deltaLastModified] = await Promise.all([
    hasBase ? getSeedLastModified(basePath) : Promise.resolve(undefined),
    hasDelta ? getSeedLastModified(branchPath) : Promise.resolve(undefined),
  ]);

  return {
    packagePath,
    packageName: packageName || path.basename(packagePath),
    state: computeSeedState(hasBase, hasDelta),
    hasBase,
    hasDelta,
    baseLastModified,
    deltaLastModified,
  };
}

/**
 * Detect seed status for all packages in a repository
 */
export async function detectRepoSeedStatus(repoPath: string): Promise<RepoSeedStatus> {
  const absoluteRepoPath = path.resolve(repoPath);

  // Get repo ID
  const repoId = await getRepoId(absoluteRepoPath);

  // Discover all packages in the repo
  const discovery = await discoverAllPackages(absoluteRepoPath);

  // Detect seed state for each package in parallel
  const packages = await Promise.all(
    discovery.packages.map((pkg) => detectPackageSeedState(pkg.path, pkg.name))
  );

  // Compute summary counts
  const summary = {
    total: packages.length,
    none: packages.filter((p) => p.state === "none").length,
    base: packages.filter((p) => p.state === "base").length,
    delta: packages.filter((p) => p.state === "delta").length,
    both: packages.filter((p) => p.state === "both").length,
  };

  return {
    repoPath: absoluteRepoPath,
    repoId,
    packages,
    summary,
  };
}

/**
 * Get packages that need base seed analysis
 *
 * Returns packages that have no base seeds (state is "none" or "delta")
 */
export function getPackagesNeedingAnalysis(seedStatus: RepoSeedStatus): PackageSeedState[] {
  return seedStatus.packages.filter((p) => !p.hasBase);
}

/**
 * Get packages that have been analyzed (have base seeds)
 */
export function getAnalyzedPackages(seedStatus: RepoSeedStatus): PackageSeedState[] {
  return seedStatus.packages.filter((p) => p.hasBase);
}

// ============================================================================
// Utility Functions
// ============================================================================

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
