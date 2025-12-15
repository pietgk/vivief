/**
 * Atomic Write Utilities
 *
 * Provides atomic file operations using temp + rename + fsync pattern.
 * Based on DevAC v2.0 spec Section 6.4.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Options for atomic write operations
 */
export interface AtomicWriteOptions {
  /** Directory for temp files (default: same as target) */
  tempDir?: string;
  /** Mode for the created file (default: 0o644) */
  mode?: number;
  /** Whether to fsync the directory after rename (default: true) */
  fsyncDir?: boolean;
}

const DEFAULT_OPTIONS: AtomicWriteOptions = {
  mode: 0o644,
  fsyncDir: true,
};

/**
 * Write data to a file atomically
 *
 * Uses the pattern:
 * 1. Write to temp file
 * 2. fsync temp file
 * 3. Rename temp to final (atomic on POSIX)
 * 4. fsync directory
 *
 * @param filePath - Final destination path
 * @param data - Data to write (string or Buffer)
 * @param options - Write options
 */
export async function writeFileAtomic(
  filePath: string,
  data: string | Buffer,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const dir = path.dirname(filePath);
  const tempDir = opts.tempDir ?? dir;

  // Ensure directories exist
  await fs.mkdir(dir, { recursive: true });
  if (tempDir !== dir) {
    await fs.mkdir(tempDir, { recursive: true });
  }

  // Generate unique temp file name
  const tempSuffix = crypto.randomBytes(8).toString("hex");
  const tempPath = path.join(tempDir, `.tmp_${path.basename(filePath)}_${tempSuffix}`);

  try {
    // Write to temp file
    await fs.writeFile(tempPath, data, { mode: opts.mode });

    // fsync the temp file
    const fd = await fs.open(tempPath, "r");
    try {
      await fd.sync();
    } finally {
      await fd.close();
    }

    // Atomic rename
    await fs.rename(tempPath, filePath);

    // fsync the directory to persist the rename
    if (opts.fsyncDir) {
      await fsyncDirectory(dir);
    }
  } catch (error) {
    // Clean up temp file on failure
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

/**
 * Write JSON data to a file atomically
 *
 * @param filePath - Final destination path
 * @param data - Data to serialize as JSON
 * @param options - Write options
 * @param pretty - Whether to pretty-print the JSON (default: true)
 */
export async function writeJsonAtomic(
  filePath: string,
  data: unknown,
  options: AtomicWriteOptions = {},
  pretty = true
): Promise<void> {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeFileAtomic(filePath, json, options);
}

/**
 * Copy a file atomically
 *
 * @param srcPath - Source file path
 * @param destPath - Destination file path
 * @param options - Write options
 */
export async function copyFileAtomic(
  srcPath: string,
  destPath: string,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const data = await fs.readFile(srcPath);
  await writeFileAtomic(destPath, data, options);
}

/**
 * Move a file atomically (within same filesystem)
 *
 * @param srcPath - Source file path
 * @param destPath - Destination file path
 * @param options - Options (only fsyncDir is used)
 */
export async function moveFileAtomic(
  srcPath: string,
  destPath: string,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const destDir = path.dirname(destPath);

  // Ensure destination directory exists
  await fs.mkdir(destDir, { recursive: true });

  // Rename (atomic on same filesystem)
  await fs.rename(srcPath, destPath);

  // fsync the directory
  if (opts.fsyncDir) {
    await fsyncDirectory(destDir);
  }
}

/**
 * fsync a directory to ensure metadata changes are persisted
 *
 * @param dirPath - Directory path to sync
 */
export async function fsyncDirectory(dirPath: string): Promise<void> {
  const fd = await fs.open(dirPath, "r");
  try {
    await fd.sync();
  } finally {
    await fd.close();
  }
}

/**
 * Create a temp file with a unique name
 *
 * @param dir - Directory for temp file
 * @param prefix - Prefix for temp file name
 * @returns Path to created temp file
 */
export async function createTempFile(dir: string, prefix = "tmp"): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const suffix = crypto.randomBytes(8).toString("hex");
  const tempPath = path.join(dir, `${prefix}_${suffix}`);
  await fs.writeFile(tempPath, "");
  return tempPath;
}

/**
 * Clean up old temp files in a directory
 *
 * @param dir - Directory to clean
 * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 * @param pattern - Pattern to match temp files (default: starts with .tmp_ or tmp_)
 */
export async function cleanupTempFiles(
  dir: string,
  maxAgeMs: number = 60 * 60 * 1000,
  pattern: RegExp = /^\.?tmp_/
): Promise<number> {
  let cleaned = 0;
  const now = Date.now();

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !pattern.test(entry.name)) {
        continue;
      }

      const filePath = path.join(dir, entry.name);
      try {
        const stat = await fs.stat(filePath);
        const age = now - stat.mtimeMs;

        if (age > maxAgeMs) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch {
    // Directory may not exist
  }

  return cleaned;
}

/**
 * Ensure a directory exists, creating it atomically if needed
 *
 * @param dirPath - Directory path to ensure
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Remove a file if it exists (no error if missing)
 *
 * @param filePath - File path to remove
 * @returns true if file was removed, false if it didn't exist
 */
export async function removeIfExists(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/**
 * Check if a file exists
 *
 * @param filePath - File path to check
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file modification time
 *
 * @param filePath - File path
 * @returns Modification time in ms since epoch, or null if file doesn't exist
 */
export async function getFileMtime(filePath: string): Promise<number | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}
