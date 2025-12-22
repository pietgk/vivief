/**
 * Clean Command Implementation
 *
 * Removes seed files and temporary files.
 * Based on spec Section 11.1: Package Commands - Maintenance
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Command } from "commander";
import type { CleanOptions, CleanResult } from "./types.js";

/**
 * Clean seed files for a package
 *
 * Clean removes:
 * - All .devac/seed/ directories
 * - Lock files and temp files
 * - Does NOT remove source code
 */
export async function cleanCommand(options: CleanOptions): Promise<CleanResult> {
  const devacPath = path.join(options.packagePath, ".devac");

  try {
    // Check if .devac exists
    const exists = await fs
      .access(devacPath)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      return {
        success: true,
        filesRemoved: 0,
        bytesFreed: 0,
      };
    }

    // Count files and calculate size before deletion
    const stats = await countFilesAndSize(devacPath);

    // Remove .devac/seed directory
    const seedPath = path.join(devacPath, "seed");
    const seedExists = await fs
      .access(seedPath)
      .then(() => true)
      .catch(() => false);

    if (seedExists) {
      await fs.rm(seedPath, { recursive: true, force: true });
    }

    // Also clean any orphaned .tmp and .lock files in .devac
    await cleanTempFiles(devacPath);

    // If cleanConfig is true, also remove the entire .devac directory
    if (options.cleanConfig) {
      await fs.rm(devacPath, { recursive: true, force: true });
    }

    return {
      success: true,
      filesRemoved: stats.fileCount,
      bytesFreed: stats.totalSize,
    };
  } catch (error) {
    return {
      success: false,
      filesRemoved: 0,
      bytesFreed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Count files and total size in a directory
 */
async function countFilesAndSize(
  dirPath: string
): Promise<{ fileCount: number; totalSize: number }> {
  let fileCount = 0;
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subStats = await countFilesAndSize(fullPath);
        fileCount += subStats.fileCount;
        totalSize += subStats.totalSize;
      } else if (entry.isFile()) {
        fileCount++;
        try {
          const stat = await fs.stat(fullPath);
          totalSize += stat.size;
        } catch {
          // Ignore stat errors
        }
      }
    }
  } catch {
    // Directory might not exist
  }

  return { fileCount, totalSize };
}

/**
 * Clean temporary files (.tmp, .lock) in a directory
 */
async function cleanTempFiles(dirPath: string): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await cleanTempFiles(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".tmp") || entry.name.endsWith(".lock")) {
          await fs.unlink(fullPath);
        }
      }
    }
  } catch {
    // Directory might not exist
  }
}

/**
 * Format bytes for human-readable display
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

/**
 * Register the clean command with the CLI program
 */
export function registerCleanCommand(program: Command): void {
  program
    .command("clean")
    .description("Remove seed files")
    .option("-p, --package <path>", "Package path to clean", process.cwd())
    .option("--config", "Also remove .devac configuration directory")
    .action(async (options) => {
      const result = await cleanCommand({
        packagePath: path.resolve(options.package),
        cleanConfig: options.config,
      });

      if (result.success) {
        console.log(
          `✓ Cleaned ${result.filesRemoved} files (${formatBytes(result.bytesFreed)} freed)`
        );
      } else {
        console.error(`✗ Clean failed: ${result.error}`);
        process.exit(1);
      }
    });
}
