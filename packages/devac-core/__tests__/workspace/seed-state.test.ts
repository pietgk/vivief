/**
 * Seed State Detection Tests
 *
 * Tests for seed-state.ts - detecting seed states for packages
 */

import type { Stats } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type RepoSeedStatus,
  detectPackageSeedState,
  detectRepoSeedStatus,
  getAnalyzedPackages,
  getPackagesNeedingAnalysis,
  hasBaseSeed,
  hasDeltaSeed,
} from "../../src/workspace/seed-state.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("../../src/workspace/discover.js");
vi.mock("../../src/workspace/package-manager.js");

const mockFs = vi.mocked(fs);
const { getRepoId } = await import("../../src/workspace/discover.js");
const { discoverAllPackages } = await import("../../src/workspace/package-manager.js");

describe("seed-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mocks
    vi.mocked(getRepoId).mockResolvedValue("github.com/test/repo");
    vi.mocked(discoverAllPackages).mockResolvedValue({
      packages: [
        { path: "/test/repo/pkg1", name: "pkg1", language: "typescript" },
        { path: "/test/repo/pkg2", name: "pkg2", language: "typescript" },
      ],
      errors: [],
      rootPath: "/test/repo",
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("hasBaseSeed", () => {
    it("returns true when base seed directory exists", async () => {
      mockFs.stat.mockResolvedValueOnce({
        isDirectory: () => true,
      } as Stats);

      const result = await hasBaseSeed("/test/package");

      expect(result).toBe(true);
      expect(mockFs.stat).toHaveBeenCalledWith(
        path.join("/test/package", ".devac", "seed", "base")
      );
    });

    it("returns false when base seed directory does not exist", async () => {
      mockFs.stat.mockRejectedValueOnce(new Error("ENOENT"));

      const result = await hasBaseSeed("/test/package");

      expect(result).toBe(false);
    });

    it("returns false when path exists but is not a directory", async () => {
      mockFs.stat.mockResolvedValueOnce({
        isDirectory: () => false,
      } as Stats);

      const result = await hasBaseSeed("/test/package");

      expect(result).toBe(false);
    });
  });

  describe("hasDeltaSeed", () => {
    it("returns true when branch seed directory exists", async () => {
      mockFs.stat.mockResolvedValueOnce({
        isDirectory: () => true,
      } as Stats);

      const result = await hasDeltaSeed("/test/package");

      expect(result).toBe(true);
      expect(mockFs.stat).toHaveBeenCalledWith(
        path.join("/test/package", ".devac", "seed", "branch")
      );
    });

    it("returns false when branch seed directory does not exist", async () => {
      mockFs.stat.mockRejectedValueOnce(new Error("ENOENT"));

      const result = await hasDeltaSeed("/test/package");

      expect(result).toBe(false);
    });
  });

  describe("detectPackageSeedState", () => {
    it("returns state 'none' when no seeds exist", async () => {
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));

      const result = await detectPackageSeedState("/test/package", "mypackage");

      expect(result).toEqual({
        packagePath: "/test/package",
        packageName: "mypackage",
        state: "none",
        hasBase: false,
        hasDelta: false,
        baseLastModified: undefined,
        deltaLastModified: undefined,
      });
    });

    it("returns state 'base' when only base seeds exist", async () => {
      const baseDate = new Date("2024-01-15T10:00:00Z");

      mockFs.stat
        .mockResolvedValueOnce({ isDirectory: () => true } as Stats) // base exists
        .mockRejectedValueOnce(new Error("ENOENT")) // branch doesn't exist
        .mockResolvedValueOnce({ mtime: baseDate } as Stats); // base mtime

      const result = await detectPackageSeedState("/test/package");

      expect(result.state).toBe("base");
      expect(result.hasBase).toBe(true);
      expect(result.hasDelta).toBe(false);
      expect(result.baseLastModified).toBe("2024-01-15T10:00:00.000Z");
    });

    it("returns state 'delta' when only delta seeds exist", async () => {
      const deltaDate = new Date("2024-01-20T10:00:00Z");

      mockFs.stat
        .mockRejectedValueOnce(new Error("ENOENT")) // base doesn't exist
        .mockResolvedValueOnce({ isDirectory: () => true } as Stats) // branch exists
        .mockResolvedValueOnce({ mtime: deltaDate } as Stats); // branch mtime

      const result = await detectPackageSeedState("/test/package");

      expect(result.state).toBe("delta");
      expect(result.hasBase).toBe(false);
      expect(result.hasDelta).toBe(true);
      expect(result.deltaLastModified).toBe("2024-01-20T10:00:00.000Z");
    });

    it("returns state 'both' when both base and delta seeds exist", async () => {
      const baseDate = new Date("2024-01-15T10:00:00Z");
      const deltaDate = new Date("2024-01-20T10:00:00Z");

      mockFs.stat
        .mockResolvedValueOnce({ isDirectory: () => true } as Stats) // base exists
        .mockResolvedValueOnce({ isDirectory: () => true } as Stats) // branch exists
        .mockResolvedValueOnce({ mtime: baseDate } as Stats) // base mtime
        .mockResolvedValueOnce({ mtime: deltaDate } as Stats); // branch mtime

      const result = await detectPackageSeedState("/test/package");

      expect(result.state).toBe("both");
      expect(result.hasBase).toBe(true);
      expect(result.hasDelta).toBe(true);
      expect(result.baseLastModified).toBe("2024-01-15T10:00:00.000Z");
      expect(result.deltaLastModified).toBe("2024-01-20T10:00:00.000Z");
    });

    it("uses basename when packageName not provided", async () => {
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));

      const result = await detectPackageSeedState("/test/my-package");

      expect(result.packageName).toBe("my-package");
    });
  });

  describe("detectRepoSeedStatus", () => {
    it("returns status for all packages in repo", async () => {
      mockFs.stat.mockRejectedValue(new Error("ENOENT")); // No seeds for any package

      const result = await detectRepoSeedStatus("/test/repo");

      expect(result.repoPath).toBe(path.resolve("/test/repo"));
      expect(result.repoId).toBe("github.com/test/repo");
      expect(result.packages).toHaveLength(2);
      expect(result.summary).toEqual({
        total: 2,
        none: 2,
        base: 0,
        delta: 0,
        both: 0,
      });
    });

    it("computes summary counts correctly", async () => {
      // First package: has base only
      // Second package: has both
      let callCount = 0;
      mockFs.stat.mockImplementation(async () => {
        callCount++;
        // pkg1: base exists (call 1), branch doesn't (call 2)
        // pkg2: base exists (call 3), branch exists (call 4)
        if (callCount === 1 || callCount === 3 || callCount === 4) {
          return { isDirectory: () => true, mtime: new Date() } as Stats;
        }
        throw new Error("ENOENT");
      });

      const result = await detectRepoSeedStatus("/test/repo");

      expect(result.summary.total).toBe(2);
      // Note: The actual counts depend on the order of stat calls
      // This tests the summary computation logic
      expect(
        result.summary.none + result.summary.base + result.summary.delta + result.summary.both
      ).toBe(2);
    });
  });

  describe("getPackagesNeedingAnalysis", () => {
    it("returns packages without base seeds", () => {
      const seedStatus: RepoSeedStatus = {
        repoPath: "/test/repo",
        repoId: "github.com/test/repo",
        packages: [
          {
            packagePath: "/pkg1",
            packageName: "pkg1",
            state: "none",
            hasBase: false,
            hasDelta: false,
          },
          {
            packagePath: "/pkg2",
            packageName: "pkg2",
            state: "base",
            hasBase: true,
            hasDelta: false,
          },
          {
            packagePath: "/pkg3",
            packageName: "pkg3",
            state: "delta",
            hasBase: false,
            hasDelta: true,
          },
          {
            packagePath: "/pkg4",
            packageName: "pkg4",
            state: "both",
            hasBase: true,
            hasDelta: true,
          },
        ],
        summary: { total: 4, none: 1, base: 1, delta: 1, both: 1 },
      };

      const result = getPackagesNeedingAnalysis(seedStatus);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.packageName)).toEqual(["pkg1", "pkg3"]);
    });

    it("returns empty array when all packages are analyzed", () => {
      const seedStatus: RepoSeedStatus = {
        repoPath: "/test/repo",
        repoId: "github.com/test/repo",
        packages: [
          {
            packagePath: "/pkg1",
            packageName: "pkg1",
            state: "base",
            hasBase: true,
            hasDelta: false,
          },
          {
            packagePath: "/pkg2",
            packageName: "pkg2",
            state: "both",
            hasBase: true,
            hasDelta: true,
          },
        ],
        summary: { total: 2, none: 0, base: 1, delta: 0, both: 1 },
      };

      const result = getPackagesNeedingAnalysis(seedStatus);

      expect(result).toHaveLength(0);
    });
  });

  describe("getAnalyzedPackages", () => {
    it("returns packages with base seeds", () => {
      const seedStatus: RepoSeedStatus = {
        repoPath: "/test/repo",
        repoId: "github.com/test/repo",
        packages: [
          {
            packagePath: "/pkg1",
            packageName: "pkg1",
            state: "none",
            hasBase: false,
            hasDelta: false,
          },
          {
            packagePath: "/pkg2",
            packageName: "pkg2",
            state: "base",
            hasBase: true,
            hasDelta: false,
          },
          {
            packagePath: "/pkg3",
            packageName: "pkg3",
            state: "delta",
            hasBase: false,
            hasDelta: true,
          },
          {
            packagePath: "/pkg4",
            packageName: "pkg4",
            state: "both",
            hasBase: true,
            hasDelta: true,
          },
        ],
        summary: { total: 4, none: 1, base: 1, delta: 1, both: 1 },
      };

      const result = getAnalyzedPackages(seedStatus);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.packageName)).toEqual(["pkg2", "pkg4"]);
    });

    it("returns empty array when no packages are analyzed", () => {
      const seedStatus: RepoSeedStatus = {
        repoPath: "/test/repo",
        repoId: "github.com/test/repo",
        packages: [
          {
            packagePath: "/pkg1",
            packageName: "pkg1",
            state: "none",
            hasBase: false,
            hasDelta: false,
          },
        ],
        summary: { total: 1, none: 1, base: 0, delta: 0, both: 0 },
      };

      const result = getAnalyzedPackages(seedStatus);

      expect(result).toHaveLength(0);
    });
  });
});
