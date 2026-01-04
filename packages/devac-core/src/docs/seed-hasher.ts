/**
 * Seed Hasher - Compute seed hash for change detection
 *
 * Computes a combined hash of all seed files in a package's .devac/seed/ directory.
 * Used by doc-sync to determine if documentation needs regeneration.
 *
 * Based on DevAC v2.0 spec Phase 3 requirements.
 */

import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";

import { combineHashes, computeFileHash } from "../utils/hash.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Information about a single seed file
 */
export interface SeedFileInfo {
  /** File name (e.g., "nodes.parquet") */
  name: string;
  /** SHA-256 hash of the file */
  hash: string;
  /** File size in bytes */
  size: number;
}

/**
 * Result of computing the seed hash for a package
 */
export interface SeedHashResult {
  /** Combined hash of all seed files, or null if no seeds exist */
  hash: string | null;
  /** Information about each seed file */
  files: SeedFileInfo[];
  /** Whether effects.parquet exists */
  hasEffects: boolean;
  /** Timestamp when hash was computed (ISO 8601) */
  timestamp: string;
  /** Path to the seed directory */
  seedPath: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Seed files that are hashed (order matters for consistent combined hash) */
const SEED_FILES = [
  "nodes.parquet",
  "edges.parquet",
  "external_refs.parquet",
  "effects.parquet",
] as const;

/** Default seed directory name */
const SEED_DIR = ".devac/seed";

/** Base seed subdirectory */
const BASE_SEED_DIR = "base";

// ============================================================================
// Implementation
// ============================================================================

/**
 * Compute the combined hash of all seed files in a package
 *
 * @param packagePath - Path to the package root
 * @returns SeedHashResult with hash information
 */
export async function computeSeedHash(packagePath: string): Promise<SeedHashResult> {
  const seedPath = path.join(packagePath, SEED_DIR, BASE_SEED_DIR);
  const timestamp = new Date().toISOString();

  const result: SeedHashResult = {
    hash: null,
    files: [],
    hasEffects: false,
    timestamp,
    seedPath,
  };

  // Check if seed directory exists
  try {
    const seedStat = await stat(seedPath);
    if (!seedStat.isDirectory()) {
      return result;
    }
  } catch {
    // Seed directory doesn't exist
    return result;
  }

  // Hash each seed file
  const fileHashes: string[] = [];

  for (const fileName of SEED_FILES) {
    const filePath = path.join(seedPath, fileName);

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        continue;
      }

      const hash = await computeFileHash(filePath);
      const fileInfo: SeedFileInfo = {
        name: fileName,
        hash,
        size: fileStat.size,
      };

      result.files.push(fileInfo);
      fileHashes.push(hash);

      if (fileName === "effects.parquet") {
        result.hasEffects = true;
      }
    } catch {
      // File doesn't exist, skip it
    }
  }

  // Compute combined hash if we have any files
  if (fileHashes.length > 0) {
    result.hash = combineHashes(fileHashes);
  }

  return result;
}

/**
 * Check if seeds exist for a package
 *
 * @param packagePath - Path to the package root
 * @returns true if base seeds exist
 */
export async function hasSeed(packagePath: string): Promise<boolean> {
  const seedPath = path.join(packagePath, SEED_DIR, BASE_SEED_DIR);

  try {
    const seedStat = await stat(seedPath);
    if (!seedStat.isDirectory()) {
      return false;
    }

    // Check for at least nodes.parquet
    const nodesPath = path.join(seedPath, "nodes.parquet");
    const nodesStat = await stat(nodesPath);
    return nodesStat.isFile();
  } catch {
    return false;
  }
}

/**
 * Get the seed directory path for a package
 *
 * @param packagePath - Path to the package root
 * @returns Path to the base seed directory
 */
export function getSeedPath(packagePath: string): string {
  return path.join(packagePath, SEED_DIR, BASE_SEED_DIR);
}

/**
 * List all seed files in a package
 *
 * @param packagePath - Path to the package root
 * @returns Array of file paths, or empty array if no seeds
 */
export async function listSeedFiles(packagePath: string): Promise<string[]> {
  const seedPath = getSeedPath(packagePath);

  try {
    const files = await readdir(seedPath);
    return files
      .filter((f) => f.endsWith(".parquet"))
      .sort()
      .map((f) => path.join(seedPath, f));
  } catch {
    return [];
  }
}
