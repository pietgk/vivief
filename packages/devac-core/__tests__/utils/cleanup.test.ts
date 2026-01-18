/**
 * Cleanup Utilities Tests
 *
 * Tests for cleanup.ts - orphaned seeds, stale locks, temp files
 */

import type { Stats } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupOrphanedFiles,
  cleanupPackageSeeds,
  findOrphanedSeeds,
  getSeedStorageStats,
  removeAllSeeds,
  verifySeedStructure,
} from "../../src/utils/cleanup.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("../../src/storage/file-lock.js", () => ({
  forceReleaseLock: vi.fn().mockResolvedValue(undefined),
  isLockStale: vi.fn().mockResolvedValue(false),
}));
vi.mock("../../src/utils/atomic-write.js", () => ({
  cleanupTempFiles: vi.fn().mockResolvedValue(3),
  fileExists: vi.fn().mockResolvedValue(true),
}));

const mockFs = vi.mocked(fs);
const { isLockStale, forceReleaseLock } = await import("../../src/storage/file-lock.js");
const { fileExists, cleanupTempFiles } = await import("../../src/utils/atomic-write.js");

describe("cleanup utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("cleanupPackageSeeds", () => {
    it("returns empty result when seed directory does not exist", async () => {
      vi.mocked(fileExists).mockResolvedValueOnce(false);

      const result = await cleanupPackageSeeds("/test/package");

      expect(result).toEqual({
        orphansRemoved: [],
        locksRemoved: [],
        tempFilesRemoved: 0,
        errors: [],
      });
    });

    it("removes stale locks when removeStaleLocks is true", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(isLockStale).mockResolvedValueOnce(true);

      const result = await cleanupPackageSeeds("/test/package", {
        removeStaleLocks: true,
        removeTempFiles: false,
      });

      expect(forceReleaseLock).toHaveBeenCalledWith(
        path.join("/test/package", ".devac", "seed", ".devac.lock")
      );
      expect(result.locksRemoved).toHaveLength(1);
    });

    it("skips lock removal in dry run mode", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(isLockStale).mockResolvedValueOnce(true);

      const result = await cleanupPackageSeeds("/test/package", {
        removeStaleLocks: true,
        removeTempFiles: false,
        dryRun: true,
      });

      expect(forceReleaseLock).not.toHaveBeenCalled();
      expect(result.locksRemoved).toHaveLength(1);
    });

    it("does not remove locks when not stale", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(isLockStale).mockResolvedValueOnce(false);

      const result = await cleanupPackageSeeds("/test/package", {
        removeStaleLocks: true,
        removeTempFiles: false,
      });

      expect(forceReleaseLock).not.toHaveBeenCalled();
      expect(result.locksRemoved).toHaveLength(0);
    });

    it("cleans up temp files when removeTempFiles is true", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(cleanupTempFiles).mockResolvedValueOnce(5);

      const result = await cleanupPackageSeeds("/test/package", {
        removeStaleLocks: false,
        removeTempFiles: true,
      });

      expect(cleanupTempFiles).toHaveBeenCalled();
      expect(result.tempFilesRemoved).toBe(5);
    });

    it("counts temp files in dry run mode", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockFs.readdir.mockResolvedValueOnce(["file1", "file2", "file3"] as any);

      const result = await cleanupPackageSeeds("/test/package", {
        removeStaleLocks: false,
        removeTempFiles: true,
        dryRun: true,
      });

      expect(cleanupTempFiles).not.toHaveBeenCalled();
      expect(result.tempFilesRemoved).toBe(3);
    });

    it("handles lock check errors gracefully", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(isLockStale).mockRejectedValueOnce(new Error("Permission denied"));

      const result = await cleanupPackageSeeds("/test/package", {
        removeStaleLocks: true,
        removeTempFiles: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Permission denied");
    });

    it("handles temp file cleanup errors gracefully", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(cleanupTempFiles).mockRejectedValueOnce(new Error("Disk full"));

      const result = await cleanupPackageSeeds("/test/package", {
        removeStaleLocks: false,
        removeTempFiles: true,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Disk full");
    });

    it("uses custom stale lock age", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(isLockStale).mockResolvedValueOnce(true);

      await cleanupPackageSeeds("/test/package", {
        removeStaleLocks: true,
        removeTempFiles: false,
        staleLockAgeMs: 5000,
      });

      expect(isLockStale).toHaveBeenCalledWith(expect.any(String), 5000);
    });
  });

  describe("findOrphanedSeeds", () => {
    it("returns empty array (stub implementation)", async () => {
      const result = await findOrphanedSeeds("/test/package", new Set(["file1.ts", "file2.ts"]));

      expect(result).toEqual([]);
    });
  });

  describe("removeAllSeeds", () => {
    it("removes .devac directory when it exists", async () => {
      vi.mocked(fileExists).mockResolvedValueOnce(true);
      mockFs.rm.mockResolvedValueOnce(undefined);

      const result = await removeAllSeeds("/test/package");

      expect(mockFs.rm).toHaveBeenCalledWith(path.join("/test/package", ".devac"), {
        recursive: true,
        force: true,
      });
      expect(result.removed).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it("skips removal in dry run mode", async () => {
      vi.mocked(fileExists).mockResolvedValueOnce(true);

      const result = await removeAllSeeds("/test/package", true);

      expect(mockFs.rm).not.toHaveBeenCalled();
      expect(result.removed).toHaveLength(1);
    });

    it("returns empty when .devac does not exist", async () => {
      vi.mocked(fileExists).mockResolvedValueOnce(false);

      const result = await removeAllSeeds("/test/package");

      expect(mockFs.rm).not.toHaveBeenCalled();
      expect(result.removed).toHaveLength(0);
    });

    it("handles removal errors", async () => {
      vi.mocked(fileExists).mockResolvedValueOnce(true);
      mockFs.rm.mockRejectedValueOnce(new Error("Access denied"));

      const result = await removeAllSeeds("/test/package");

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Access denied");
    });
  });

  describe("cleanupOrphanedFiles", () => {
    it("returns empty result (stub implementation)", async () => {
      const result = await cleanupOrphanedFiles("/test/seed", new Set(["file1.ts"]), false);

      expect(result).toEqual({ removed: [], errors: [] });
    });
  });

  describe("getSeedStorageStats", () => {
    it("calculates storage stats correctly", async () => {
      const mockEntries = [{ name: "base", isDirectory: () => true, isFile: () => false }];
      const mockBaseEntries = [
        { name: "nodes.parquet", isDirectory: () => false, isFile: () => true },
        { name: "edges.parquet", isDirectory: () => false, isFile: () => true },
      ];

      mockFs.readdir
        .mockResolvedValueOnce(mockEntries as any)
        .mockResolvedValueOnce(mockBaseEntries as any);

      mockFs.stat
        .mockResolvedValueOnce({ size: 1000 } as Stats)
        .mockResolvedValueOnce({ size: 500 } as Stats);

      const result = await getSeedStorageStats("/test/package");

      expect(result.totalSizeBytes).toBe(1500);
      expect(result.fileCount).toBe(2);
      expect(result.basePartitionBytes).toBe(1500);
    });

    it("handles branch partition files", async () => {
      const mockEntries = [{ name: "branch", isDirectory: () => true, isFile: () => false }];
      const mockBranchEntries = [
        { name: "delta.parquet", isDirectory: () => false, isFile: () => true },
      ];

      mockFs.readdir
        .mockResolvedValueOnce(mockEntries as any)
        .mockResolvedValueOnce(mockBranchEntries as any);

      mockFs.stat.mockResolvedValueOnce({ size: 200 } as Stats);

      const result = await getSeedStorageStats("/test/package");

      expect(result.branchPartitionBytes).toBe(200);
    });

    it("handles missing seed directory gracefully", async () => {
      mockFs.readdir.mockRejectedValueOnce(new Error("ENOENT"));

      const result = await getSeedStorageStats("/test/package");

      expect(result.totalSizeBytes).toBe(0);
      expect(result.fileCount).toBe(0);
    });

    it("returns zero for empty seed directory", async () => {
      mockFs.readdir.mockResolvedValueOnce([]);

      const result = await getSeedStorageStats("/test/package");

      expect(result).toEqual({
        totalSizeBytes: 0,
        fileCount: 0,
        basePartitionBytes: 0,
        branchPartitionBytes: 0,
      });
    });
  });

  describe("verifySeedStructure", () => {
    it("returns valid for complete structure", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ schemaVersion: "1.0.0" }));

      const result = await verifySeedStructure("/test/package");

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns invalid when .devac directory missing", async () => {
      vi.mocked(fileExists).mockResolvedValueOnce(false);

      const result = await verifySeedStructure("/test/package");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(".devac directory does not exist");
    });

    it("returns invalid when seed directory missing", async () => {
      vi.mocked(fileExists)
        .mockResolvedValueOnce(true) // .devac exists
        .mockResolvedValueOnce(false); // seed does not exist

      const result = await verifySeedStructure("/test/package");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(".devac/seed directory does not exist");
    });

    it("reports error when meta.json missing", async () => {
      vi.mocked(fileExists)
        .mockResolvedValueOnce(true) // .devac exists
        .mockResolvedValueOnce(true) // seed exists
        .mockResolvedValueOnce(false) // meta.json missing
        .mockResolvedValueOnce(true); // base exists

      const result = await verifySeedStructure("/test/package");

      expect(result.errors).toContain("meta.json does not exist");
    });

    it("reports error when meta.json is invalid JSON", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockFs.readFile.mockResolvedValueOnce("not valid json");

      const result = await verifySeedStructure("/test/package");

      expect(result.errors.some((e) => e.includes("Invalid meta.json"))).toBe(true);
    });

    it("reports error when meta.json missing schemaVersion", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ name: "test" }));

      const result = await verifySeedStructure("/test/package");

      expect(result.errors).toContain("meta.json missing schemaVersion field");
    });

    it("reports error when base partition missing", async () => {
      vi.mocked(fileExists)
        .mockResolvedValueOnce(true) // .devac exists
        .mockResolvedValueOnce(true) // seed exists
        .mockResolvedValueOnce(true) // meta.json exists
        .mockResolvedValueOnce(false); // base missing

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ schemaVersion: "1.0.0" }));

      const result = await verifySeedStructure("/test/package");

      expect(result.errors).toContain("base partition directory does not exist");
    });
  });
});
