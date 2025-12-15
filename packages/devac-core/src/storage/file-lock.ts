/**
 * File Locking Implementation
 *
 * Prevents concurrent writes to seed files using file-based locks.
 * Based on DevAC v2.0 spec Section 8.6.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Lock file content structure
 */
export interface LockInfo {
  pid: number;
  timestamp: string;
  hostname: string;
}

/**
 * Lock acquisition options
 */
export interface LockOptions {
  /** Maximum wait time in ms (default: 30000) */
  timeout: number;
  /** Initial retry delay in ms (default: 50) */
  retryDelay: number;
  /** Maximum retry delay in ms (default: 1000) */
  maxRetryDelay: number;
  /** Stale lock threshold in ms (default: 60000) */
  staleThresholdMs: number;
}

const DEFAULT_LOCK_OPTIONS: LockOptions = {
  timeout: 30000,
  retryDelay: 50,
  maxRetryDelay: 1000,
  staleThresholdMs: 60000,
};

/**
 * Acquire a file lock with exponential backoff
 *
 * @param lockFile - Path to the lock file
 * @param options - Lock options
 * @throws Error if lock cannot be acquired within timeout
 */
export async function acquireLock(
  lockFile: string,
  options: Partial<LockOptions> = {}
): Promise<void> {
  const opts = { ...DEFAULT_LOCK_OPTIONS, ...options };
  const startTime = Date.now();
  let currentDelay = opts.retryDelay;

  // Ensure lock directory exists
  const lockDir = path.dirname(lockFile);
  await fs.mkdir(lockDir, { recursive: true });

  while (Date.now() - startTime < opts.timeout) {
    try {
      // Atomic create-exclusive: fails if file exists
      const fd = await fs.open(lockFile, "wx");

      // Write lock metadata
      const lockData: LockInfo = {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        hostname: os.hostname(),
      };
      await fd.write(JSON.stringify(lockData, null, 2));
      await fd.close();

      return; // Lock acquired successfully
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        // Lock file exists - check if stale
        if (await isLockStale(lockFile, opts.staleThresholdMs)) {
          // Stale lock - remove and retry immediately
          try {
            await fs.unlink(lockFile);
            continue; // Retry without delay
          } catch {
            // Another process may have removed it - continue
          }
        }

        // Fresh lock held by another process - wait with backoff
        await sleep(currentDelay);
        currentDelay = Math.min(currentDelay * 2, opts.maxRetryDelay);
      } else {
        throw error; // Unexpected error
      }
    }
  }

  throw new Error(`Lock acquisition timeout after ${opts.timeout}ms: ${lockFile}`);
}

/**
 * Release a file lock
 *
 * @param lockFile - Path to the lock file
 */
export async function releaseLock(lockFile: string): Promise<void> {
  try {
    await fs.unlink(lockFile);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
      // Log but don't throw - lock may have been force-released
      console.warn(`Failed to release lock ${lockFile}:`, error);
    }
  }
}

/**
 * Check if a lock file is stale (holder process no longer running)
 *
 * @param lockFile - Path to the lock file
 * @param staleThresholdMs - Age threshold for considering lock stale
 */
export async function isLockStale(
  lockFile: string,
  staleThresholdMs: number = DEFAULT_LOCK_OPTIONS.staleThresholdMs
): Promise<boolean> {
  try {
    const content = await fs.readFile(lockFile, "utf-8");
    const lockInfo: LockInfo = JSON.parse(content);

    // Check if lock is too old
    const lockAge = Date.now() - new Date(lockInfo.timestamp).getTime();
    if (lockAge > staleThresholdMs) {
      return true;
    }

    // Check if the process that holds the lock is still running
    // This only works reliably for same-host locks
    if (lockInfo.hostname === os.hostname()) {
      return !isProcessRunning(lockInfo.pid);
    }

    // Cross-host locks: rely on age only
    return false;
  } catch {
    // Can't read lock file - consider it stale
    return true;
  }
}

/**
 * Check if a process is running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute an operation while holding a lock
 *
 * @param lockFile - Path to the lock file
 * @param operation - Async operation to execute
 * @param options - Lock options
 */
export async function withLock<T>(
  lockFile: string,
  operation: () => Promise<T>,
  options: Partial<LockOptions> = {}
): Promise<T> {
  await acquireLock(lockFile, options);
  try {
    return await operation();
  } finally {
    await releaseLock(lockFile);
  }
}

/**
 * Execute an operation while holding a seed lock
 *
 * Convenience wrapper that uses the standard seed lock location
 *
 * @param seedPath - Path to the seed directory
 * @param operation - Async operation to execute
 * @param options - Lock options
 */
export async function withSeedLock<T>(
  seedPath: string,
  operation: () => Promise<T>,
  options: Partial<LockOptions> = {}
): Promise<T> {
  const lockFile = path.join(seedPath, ".devac.lock");
  return withLock(lockFile, operation, options);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get lock file info (for debugging/monitoring)
 */
export async function getLockInfo(lockFile: string): Promise<LockInfo | null> {
  try {
    const content = await fs.readFile(lockFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Force release a lock (use with caution)
 *
 * This should only be used for recovery from stuck locks
 */
export async function forceReleaseLock(lockFile: string): Promise<boolean> {
  try {
    await fs.unlink(lockFile);
    return true;
  } catch {
    return false;
  }
}
