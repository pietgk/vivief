/**
 * Tests for file-lock.ts
 *
 * Tests the file locking mechanism for preventing concurrent writes.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  acquireLock,
  forceReleaseLock,
  getLockInfo,
  isLockStale,
  releaseLock,
  withLock,
  withSeedLock,
} from "../../src/storage/file-lock.js";

// =============================================================================
// Test Helpers
// =============================================================================

let testDir: string;

async function createTestDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "file-lock-test-"));
}

async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// acquireLock Tests
// =============================================================================

describe("acquireLock", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("acquires lock successfully when no lock exists", async () => {
    const lockFile = path.join(testDir, "test.lock");

    await acquireLock(lockFile);

    // Lock file should exist
    const exists = await fs
      .access(lockFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    await releaseLock(lockFile);
  });

  test("writes lock info to file", async () => {
    const lockFile = path.join(testDir, "test.lock");

    await acquireLock(lockFile);

    const content = await fs.readFile(lockFile, "utf-8");
    const lockInfo = JSON.parse(content);

    expect(lockInfo.pid).toBe(process.pid);
    expect(lockInfo.hostname).toBe(os.hostname());
    expect(lockInfo.timestamp).toBeDefined();

    await releaseLock(lockFile);
  });

  test("creates lock directory if it does not exist", async () => {
    const lockFile = path.join(testDir, "nested", "dir", "test.lock");

    await acquireLock(lockFile);

    const exists = await fs
      .access(lockFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    await releaseLock(lockFile);
  });

  test("times out when lock is held by another process", async () => {
    const lockFile = path.join(testDir, "test.lock");

    // Create a lock file that appears to be from a different host
    // This prevents the stale check from using process.kill
    const fakeLockInfo = {
      pid: 12345,
      timestamp: new Date().toISOString(),
      hostname: "other-host.example.com", // Different hostname
    };
    await fs.writeFile(lockFile, JSON.stringify(fakeLockInfo));

    // Try to acquire with short timeout
    await expect(
      acquireLock(lockFile, {
        timeout: 100,
        retryDelay: 10,
        staleThresholdMs: 60000, // High threshold so lock isn't considered stale
      })
    ).rejects.toThrow("Lock acquisition timeout");
  });

  test("acquires stale lock from non-running process", async () => {
    const lockFile = path.join(testDir, "test.lock");

    // Create a lock with old timestamp from non-existent process
    const staleLockInfo = {
      pid: 999999, // Non-existent PID
      timestamp: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
      hostname: os.hostname(),
    };
    await fs.writeFile(lockFile, JSON.stringify(staleLockInfo));

    // Should acquire since lock is stale
    await acquireLock(lockFile, { staleThresholdMs: 60000 });

    // Verify we got the lock
    const content = await fs.readFile(lockFile, "utf-8");
    const lockInfo = JSON.parse(content);
    expect(lockInfo.pid).toBe(process.pid);

    await releaseLock(lockFile);
  });

  test("respects custom options", async () => {
    const lockFile = path.join(testDir, "test.lock");

    // Create a lock that appears to be from a different host
    // This prevents the stale check from using process.kill
    const freshLockInfo = {
      pid: 12345,
      timestamp: new Date().toISOString(),
      hostname: "other-host.example.com", // Different hostname
    };
    await fs.writeFile(lockFile, JSON.stringify(freshLockInfo));

    const startTime = Date.now();

    await expect(
      acquireLock(lockFile, {
        timeout: 200,
        retryDelay: 50,
        maxRetryDelay: 100,
        staleThresholdMs: 300000, // 5 minutes - lock won't be stale
      })
    ).rejects.toThrow("Lock acquisition timeout");

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(180); // Should wait close to timeout
    expect(elapsed).toBeLessThan(500); // But not too long
  });
});

// =============================================================================
// releaseLock Tests
// =============================================================================

describe("releaseLock", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("removes lock file", async () => {
    const lockFile = path.join(testDir, "test.lock");

    await acquireLock(lockFile);
    await releaseLock(lockFile);

    const exists = await fs
      .access(lockFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  test("does not throw if lock file does not exist", async () => {
    const lockFile = path.join(testDir, "nonexistent.lock");

    // Should not throw
    await expect(releaseLock(lockFile)).resolves.toBeUndefined();
  });

  test("handles unexpected errors gracefully", async () => {
    // This test verifies that releaseLock handles errors gracefully
    // We can only test the ENOENT case directly since we can't mock ESM modules
    const lockFile = path.join(testDir, "test.lock");

    // Create and immediately delete to simulate race condition
    await fs.writeFile(lockFile, "{}");
    await fs.unlink(lockFile);

    // Should not throw even if lock was already removed
    await expect(releaseLock(lockFile)).resolves.toBeUndefined();
  });
});

// =============================================================================
// isLockStale Tests
// =============================================================================

describe("isLockStale", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("returns true for lock older than threshold", async () => {
    const lockFile = path.join(testDir, "stale.lock");

    const oldLockInfo = {
      pid: process.pid,
      timestamp: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
      hostname: os.hostname(),
    };
    await fs.writeFile(lockFile, JSON.stringify(oldLockInfo));

    const isStale = await isLockStale(lockFile, 60000); // 1 minute threshold

    expect(isStale).toBe(true);
  });

  test("returns false for fresh lock from running process", async () => {
    const lockFile = path.join(testDir, "fresh.lock");

    const freshLockInfo = {
      pid: process.pid, // Current process is running
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
    };
    await fs.writeFile(lockFile, JSON.stringify(freshLockInfo));

    const isStale = await isLockStale(lockFile, 60000);

    expect(isStale).toBe(false);
  });

  test("returns true for lock from non-running process", async () => {
    const lockFile = path.join(testDir, "dead.lock");

    const deadLockInfo = {
      pid: 999999, // Non-existent PID
      timestamp: new Date().toISOString(), // Fresh timestamp
      hostname: os.hostname(),
    };
    await fs.writeFile(lockFile, JSON.stringify(deadLockInfo));

    const isStale = await isLockStale(lockFile, 60000);

    expect(isStale).toBe(true);
  });

  test("returns true for non-existent lock file", async () => {
    const lockFile = path.join(testDir, "nonexistent.lock");

    const isStale = await isLockStale(lockFile);

    expect(isStale).toBe(true);
  });

  test("returns true for corrupted lock file", async () => {
    const lockFile = path.join(testDir, "corrupted.lock");

    await fs.writeFile(lockFile, "not valid json");

    const isStale = await isLockStale(lockFile);

    expect(isStale).toBe(true);
  });

  test("returns false for cross-host lock within threshold", async () => {
    const lockFile = path.join(testDir, "crosshost.lock");

    const crossHostLockInfo = {
      pid: 12345,
      timestamp: new Date().toISOString(),
      hostname: "other-host.example.com", // Different hostname
    };
    await fs.writeFile(lockFile, JSON.stringify(crossHostLockInfo));

    const isStale = await isLockStale(lockFile, 60000);

    // Can't verify process on different host, so rely on age only
    expect(isStale).toBe(false);
  });
});

// =============================================================================
// withLock Tests
// =============================================================================

describe("withLock", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("executes operation while holding lock", async () => {
    const lockFile = path.join(testDir, "test.lock");
    let executed = false;

    await withLock(lockFile, async () => {
      // Lock should be held during operation
      const exists = await fs
        .access(lockFile)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      executed = true;
    });

    expect(executed).toBe(true);

    // Lock should be released after operation
    const exists = await fs
      .access(lockFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  test("returns operation result", async () => {
    const lockFile = path.join(testDir, "test.lock");

    const result = await withLock(lockFile, async () => {
      return 42;
    });

    expect(result).toBe(42);
  });

  test("releases lock even if operation throws", async () => {
    const lockFile = path.join(testDir, "test.lock");

    await expect(
      withLock(lockFile, async () => {
        throw new Error("Operation failed");
      })
    ).rejects.toThrow("Operation failed");

    // Lock should be released
    const exists = await fs
      .access(lockFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  test("passes options to acquireLock", async () => {
    const lockFile = path.join(testDir, "test.lock");

    // Create a blocking lock that appears to be from a different host
    // This prevents the stale check from using process.kill
    const blockingLockInfo = {
      pid: 12345,
      timestamp: new Date().toISOString(),
      hostname: "other-host.example.com", // Different hostname
    };
    await fs.writeFile(lockFile, JSON.stringify(blockingLockInfo));

    await expect(
      withLock(
        lockFile,
        async () => {
          return "result";
        },
        { timeout: 100, staleThresholdMs: 300000 }
      )
    ).rejects.toThrow("Lock acquisition timeout");
  });
});

// =============================================================================
// withSeedLock Tests
// =============================================================================

describe("withSeedLock", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("uses .devac.lock in seed directory", async () => {
    const seedPath = path.join(testDir, "seed");
    await fs.mkdir(seedPath, { recursive: true });

    let lockFileDuringOperation: string | null = null;

    await withSeedLock(seedPath, async () => {
      // Check that .devac.lock exists
      const lockFile = path.join(seedPath, ".devac.lock");
      const exists = await fs
        .access(lockFile)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        lockFileDuringOperation = lockFile;
      }
    });

    expect(lockFileDuringOperation).toBe(path.join(seedPath, ".devac.lock"));
  });

  test("returns operation result", async () => {
    const seedPath = path.join(testDir, "seed");
    await fs.mkdir(seedPath, { recursive: true });

    const result = await withSeedLock(seedPath, async () => {
      return "seed operation result";
    });

    expect(result).toBe("seed operation result");
  });

  test("releases lock after operation", async () => {
    const seedPath = path.join(testDir, "seed");
    await fs.mkdir(seedPath, { recursive: true });

    await withSeedLock(seedPath, async () => {
      // Do something
    });

    const lockFile = path.join(seedPath, ".devac.lock");
    const exists = await fs
      .access(lockFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});

// =============================================================================
// getLockInfo Tests
// =============================================================================

describe("getLockInfo", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("returns lock info for existing lock", async () => {
    const lockFile = path.join(testDir, "test.lock");

    await acquireLock(lockFile);

    const info = await getLockInfo(lockFile);

    expect(info).not.toBeNull();
    expect(info?.pid).toBe(process.pid);
    expect(info?.hostname).toBe(os.hostname());
    expect(info?.timestamp).toBeDefined();

    await releaseLock(lockFile);
  });

  test("returns null for non-existent lock", async () => {
    const lockFile = path.join(testDir, "nonexistent.lock");

    const info = await getLockInfo(lockFile);

    expect(info).toBeNull();
  });

  test("returns null for corrupted lock file", async () => {
    const lockFile = path.join(testDir, "corrupted.lock");
    await fs.writeFile(lockFile, "invalid json content");

    const info = await getLockInfo(lockFile);

    expect(info).toBeNull();
  });
});

// =============================================================================
// forceReleaseLock Tests
// =============================================================================

describe("forceReleaseLock", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("removes lock file and returns true", async () => {
    const lockFile = path.join(testDir, "test.lock");

    await acquireLock(lockFile);

    const result = await forceReleaseLock(lockFile);

    expect(result).toBe(true);

    const exists = await fs
      .access(lockFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  test("returns false for non-existent lock", async () => {
    const lockFile = path.join(testDir, "nonexistent.lock");

    const result = await forceReleaseLock(lockFile);

    expect(result).toBe(false);
  });

  test("can release lock held by another process", async () => {
    const lockFile = path.join(testDir, "test.lock");

    // Create a lock that appears to be held by another process
    const lockInfo = {
      pid: 999999,
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
    };
    await fs.writeFile(lockFile, JSON.stringify(lockInfo));

    const result = await forceReleaseLock(lockFile);

    expect(result).toBe(true);

    const exists = await fs
      .access(lockFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});

// =============================================================================
// Concurrency Tests
// =============================================================================

describe("Concurrency", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("serializes concurrent operations", async () => {
    const lockFile = path.join(testDir, "concurrent.lock");
    const results: number[] = [];

    // Run two operations that should be serialized
    const op1 = withLock(lockFile, async () => {
      results.push(1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      results.push(2);
      return "op1";
    });

    // Start second operation after a small delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    const op2 = withLock(lockFile, async () => {
      results.push(3);
      await new Promise((resolve) => setTimeout(resolve, 50));
      results.push(4);
      return "op2";
    });

    await Promise.all([op1, op2]);

    // Operations should be serialized: either [1,2,3,4] or [3,4,1,2]
    expect(
      (results[0] === 1 && results[1] === 2 && results[2] === 3 && results[3] === 4) ||
        (results[0] === 3 && results[1] === 4 && results[2] === 1 && results[3] === 2)
    ).toBe(true);
  });
});
