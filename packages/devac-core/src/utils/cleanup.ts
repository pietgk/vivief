/**
 * Cleanup Utilities
 *
 * Handles cleanup of orphaned seeds, stale locks, and temp files.
 * Based on DevAC v2.0 spec Section 11.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { forceReleaseLock, isLockStale } from "../storage/file-lock.js";
import { cleanupTempFiles, fileExists } from "./atomic-write.js";

/**
 * Cleanup options
 */
export interface CleanupOptions {
  /** Remove orphaned seed files (default: true) */
  removeOrphans: boolean;
  /** Remove stale lock files (default: true) */
  removeStaleLocks: boolean;
  /** Remove temp files (default: true) */
  removeTempFiles: boolean;
  /** Max age for temp files in ms (default: 1 hour) */
  tempFileMaxAgeMs: number;
  /** Max age for stale locks in ms (default: 1 minute) */
  staleLockAgeMs: number;
  /** Dry run - don't actually delete (default: false) */
  dryRun: boolean;
}

const DEFAULT_OPTIONS: CleanupOptions = {
  removeOrphans: true,
  removeStaleLocks: true,
  removeTempFiles: true,
  tempFileMaxAgeMs: 60 * 60 * 1000, // 1 hour
  staleLockAgeMs: 60 * 1000, // 1 minute
  dryRun: false,
};

/**
 * Cleanup result
 */
export interface CleanupResult {
  orphansRemoved: string[];
  locksRemoved: string[];
  tempFilesRemoved: number;
  errors: string[];
}

/**
 * Clean up a package's seed directory
 *
 * @param packagePath - Path to the package
 * @param options - Cleanup options
 */
export async function cleanupPackageSeeds(
  packagePath: string,
  options: Partial<CleanupOptions> = {}
): Promise<CleanupResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const seedPath = path.join(packagePath, ".devac", "seed");
  const result: CleanupResult = {
    orphansRemoved: [],
    locksRemoved: [],
    tempFilesRemoved: 0,
    errors: [],
  };

  // Check if seed directory exists
  if (!(await fileExists(seedPath))) {
    return result;
  }

  // Clean up stale locks
  if (opts.removeStaleLocks) {
    const lockPath = path.join(seedPath, ".devac.lock");
    try {
      if ((await fileExists(lockPath)) && (await isLockStale(lockPath, opts.staleLockAgeMs))) {
        if (!opts.dryRun) {
          await forceReleaseLock(lockPath);
        }
        result.locksRemoved.push(lockPath);
      }
    } catch (error) {
      result.errors.push(
        `Failed to check/remove lock: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Clean up temp files
  if (opts.removeTempFiles) {
    const tempDir = path.join(seedPath, ".tmp");
    try {
      if (await fileExists(tempDir)) {
        if (!opts.dryRun) {
          result.tempFilesRemoved = await cleanupTempFiles(tempDir, opts.tempFileMaxAgeMs);
        } else {
          // Count temp files for dry run
          const entries = await fs.readdir(tempDir);
          result.tempFilesRemoved = entries.length;
        }
      }
    } catch (error) {
      result.errors.push(
        `Failed to clean temp files: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

/**
 * Find orphaned seed files (seeds for deleted source files)
 *
 * @param packagePath - Path to the package
 * @param sourceFiles - Set of current source file paths (relative to package)
 */
export async function findOrphanedSeeds(
  packagePath: string,
  _sourceFiles: Set<string>
): Promise<string[]> {
  const _seedPath = path.join(packagePath, ".devac", "seed", "base");
  const orphans: string[] = [];

  // This would require reading the Parquet files to check file_path column
  // For now, return empty - actual implementation would use SeedReader
  // to query DISTINCT file_path and compare to sourceFiles

  return orphans;
}

/**
 * Remove all seeds for a package
 *
 * @param packagePath - Path to the package
 * @param dryRun - If true, don't actually delete
 */
export async function removeAllSeeds(
  packagePath: string,
  dryRun = false
): Promise<{ removed: string[]; errors: string[] }> {
  const devacPath = path.join(packagePath, ".devac");
  const removed: string[] = [];
  const errors: string[] = [];

  try {
    if (await fileExists(devacPath)) {
      if (!dryRun) {
        await fs.rm(devacPath, { recursive: true, force: true });
      }
      removed.push(devacPath);
    }
  } catch (error) {
    errors.push(
      `Failed to remove .devac: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return { removed, errors };
}

/**
 * Clean up orphaned files across all partitions
 *
 * @param seedPath - Path to the seed directory
 * @param validFiles - Set of valid source file paths
 * @param dryRun - If true, don't actually delete
 */
export async function cleanupOrphanedFiles(
  _seedPath: string,
  _validFiles: Set<string>,
  _dryRun = false
): Promise<{ removed: string[]; errors: string[] }> {
  // This would be implemented using SeedReader to:
  // 1. Query all DISTINCT file_path from nodes.parquet
  // 2. Compare to validFiles set
  // 3. Remove nodes/edges/refs for orphaned files

  // For per-package-per-branch model, this requires rewriting the Parquet files
  // which is handled by SeedWriter.deleteFile()

  return { removed: [], errors: [] };
}

/**
 * Get statistics about seed storage
 *
 * @param packagePath - Path to the package
 */
export async function getSeedStorageStats(packagePath: string): Promise<{
  totalSizeBytes: number;
  fileCount: number;
  basePartitionBytes: number;
  branchPartitionBytes: number;
}> {
  const seedPath = path.join(packagePath, ".devac", "seed");
  let totalSizeBytes = 0;
  let fileCount = 0;
  let basePartitionBytes = 0;
  let branchPartitionBytes = 0;

  async function walkDir(dirPath: string, isBase = false, isBranch = false): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const nextIsBase = isBase || entry.name === "base";
          const nextIsBranch = isBranch || entry.name === "branch";
          await walkDir(fullPath, nextIsBase, nextIsBranch);
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          totalSizeBytes += stat.size;
          fileCount++;

          if (isBase) {
            basePartitionBytes += stat.size;
          }
          if (isBranch) {
            branchPartitionBytes += stat.size;
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  await walkDir(seedPath);

  return {
    totalSizeBytes,
    fileCount,
    basePartitionBytes,
    branchPartitionBytes,
  };
}

/**
 * Verify seed directory structure is valid
 *
 * @param packagePath - Path to the package
 */
export async function verifySeedStructure(
  packagePath: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const devacPath = path.join(packagePath, ".devac");
  const seedPath = path.join(devacPath, "seed");
  const metaPath = path.join(seedPath, "meta.json");
  const basePath = path.join(seedPath, "base");

  // Check .devac directory
  if (!(await fileExists(devacPath))) {
    errors.push(".devac directory does not exist");
    return { valid: false, errors };
  }

  // Check seed directory
  if (!(await fileExists(seedPath))) {
    errors.push(".devac/seed directory does not exist");
    return { valid: false, errors };
  }

  // Check meta.json
  if (!(await fileExists(metaPath))) {
    errors.push("meta.json does not exist");
  } else {
    try {
      const content = await fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(content);
      if (!meta.schemaVersion) {
        errors.push("meta.json missing schemaVersion field");
      }
    } catch (error) {
      errors.push(`Invalid meta.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Check base partition
  if (!(await fileExists(basePath))) {
    errors.push("base partition directory does not exist");
  } else {
    const expectedFiles = ["nodes.parquet", "edges.parquet", "external_refs.parquet"];
    for (const file of expectedFiles) {
      const filePath = path.join(basePath, file);
      if (!(await fileExists(filePath))) {
        // Not all files are required (e.g., no edges if no relationships)
        // This is a warning, not an error
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
