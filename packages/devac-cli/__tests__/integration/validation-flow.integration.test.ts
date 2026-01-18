/**
 * Validation Flow Integration Tests
 *
 * Tests the full validation flow with real fixtures.
 * Verifies that validators correctly detect issues in fixture packages.
 */

import * as path from "node:path";
import { ValidationTestHarness } from "@pietgk/devac-core/test-harness";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/** Helper to get package path with runtime assertion (satisfies biome) */
function getPkgPath(packages: Record<string, string>, name: string): string {
  const pkgPath = packages[name];
  if (!pkgPath) throw new Error(`Package ${name} not found in workspace`);
  return pkgPath;
}

describe("Validation Flow Integration", () => {
  let harness: ValidationTestHarness;
  const fixturesPath = path.resolve(__dirname, "../../../fixtures-validation");

  beforeEach(() => {
    harness = new ValidationTestHarness(fixturesPath);
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  describe("Workspace Creation", () => {
    test("creates temporary workspace with fixtures", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
      });

      expect(workspace.rootDir).toBeTruthy();
      expect(workspace.packages["pkg-clean"]).toBeTruthy();
      expect(await harness.fileExists(getPkgPath(workspace.packages, "pkg-clean"))).toBe(true);
    });

    test("creates workspace with multiple fixtures", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean", "pkg-ts-errors"],
      });

      expect(workspace.packages["pkg-clean"]).toBeTruthy();
      expect(workspace.packages["pkg-ts-errors"]).toBeTruthy();
      expect(await harness.fileExists(getPkgPath(workspace.packages, "pkg-clean"))).toBe(true);
      expect(await harness.fileExists(getPkgPath(workspace.packages, "pkg-ts-errors"))).toBe(true);
    });

    test("throws error for non-existent fixture", async () => {
      await expect(
        harness.createTempWorkspace({
          fixtures: ["non-existent-fixture"],
        })
      ).rejects.toThrow("Fixture not found");
    });

    test("initializes Git in workspace when requested", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
      });

      expect(await workspace.git.isGitRepo()).toBe(true);
    });

    test("skips Git initialization when not requested", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      expect(await workspace.git.isGitRepo()).toBe(false);
    });
  });

  describe("File Operations", () => {
    test("writes and reads files in workspace", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
      });

      const testFilePath = path.join(getPkgPath(workspace.packages, "pkg-clean"), "test.txt");
      await harness.writeFile(testFilePath, "test content");

      const content = await harness.readFile(testFilePath);
      expect(content).toBe("test content");
    });

    test("fileExists returns correct status", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
      });

      const existingFile = path.join(getPkgPath(workspace.packages, "pkg-clean"), "package.json");
      const nonExistentFile = path.join(
        getPkgPath(workspace.packages, "pkg-clean"),
        "does-not-exist.txt"
      );

      expect(await harness.fileExists(existingFile)).toBe(true);
      expect(await harness.fileExists(nonExistentFile)).toBe(false);
    });
  });

  describe("Git Simulation", () => {
    test("stages files correctly", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Write a new file
      const newFilePath = path.join(getPkgPath(workspace.packages, "pkg-clean"), "new-file.ts");
      await harness.writeFile(newFilePath, "export const x = 1;");

      // Stage the file
      await workspace.git.stageFile(path.relative(workspace.rootDir, newFilePath));

      const staged = await workspace.git.getStagedFiles();
      expect(staged.length).toBeGreaterThan(0);
    });

    test("detects untracked files", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Write a new file (untracked)
      const newFilePath = path.join(getPkgPath(workspace.packages, "pkg-clean"), "untracked.ts");
      await harness.writeFile(newFilePath, "export const y = 2;");

      const untracked = await workspace.git.getUntrackedFiles();
      expect(untracked.some((f) => f.includes("untracked.ts"))).toBe(true);
    });

    test("detects changed files by category", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Write a new file and stage it
      const stagedFile = path.join(getPkgPath(workspace.packages, "pkg-clean"), "staged.ts");
      await harness.writeFile(stagedFile, "export const staged = 1;");
      await workspace.git.stageFile(path.relative(workspace.rootDir, stagedFile));

      // Write another untracked file
      const untrackedFile = path.join(getPkgPath(workspace.packages, "pkg-clean"), "untracked.ts");
      await harness.writeFile(untrackedFile, "export const untracked = 2;");

      const changed = await workspace.git.getChangedFiles();

      expect(changed.staged.length).toBeGreaterThan(0);
      expect(changed.untracked.some((f) => f.includes("untracked.ts"))).toBe(true);
    });
  });

  describe("Validation Result Assertions", () => {
    test("assertValidationResult checks success status", () => {
      const result = {
        mode: "quick" as const,
        success: true,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          totalAffected: 0,
          analysisTimeMs: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        totalIssues: 0,
        totalTimeMs: 100,
      };

      expect(() => harness.assertValidationResult(result, { success: true })).not.toThrow();
      expect(() => harness.assertValidationResult(result, { success: false })).toThrow(
        "Expected success=false"
      );
    });

    test("assertValidationResult checks mode", () => {
      const result = {
        mode: "quick" as const,
        success: true,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          totalAffected: 0,
          analysisTimeMs: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        totalIssues: 0,
        totalTimeMs: 100,
      };

      expect(() => harness.assertValidationResult(result, { mode: "quick" })).not.toThrow();
      expect(() => harness.assertValidationResult(result, { mode: "full" })).toThrow(
        "Expected mode=full"
      );
    });

    test("assertValidationResult checks typecheck errors", () => {
      const result = {
        mode: "quick" as const,
        success: false,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          totalAffected: 0,
          analysisTimeMs: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        typecheck: {
          success: false,
          issues: [
            {
              file: "test.ts",
              line: 1,
              column: 1,
              message: "error",
              severity: "error" as const,
              source: "tsc" as const,
              promptMarkdown: "Error at test.ts:1:1",
            },
            {
              file: "test.ts",
              line: 2,
              column: 1,
              message: "error2",
              severity: "error" as const,
              source: "tsc" as const,
              promptMarkdown: "Error at test.ts:2:1",
            },
            {
              file: "test.ts",
              line: 3,
              column: 1,
              message: "warning",
              severity: "warning" as const,
              source: "tsc" as const,
              promptMarkdown: "Warning at test.ts:3:1",
            },
          ],
          timeMs: 100,
        },
        totalIssues: 3,
        totalTimeMs: 100,
      };

      expect(() => harness.assertValidationResult(result, { typecheckErrors: 2 })).not.toThrow();
      expect(() => harness.assertValidationResult(result, { typecheckErrors: 3 })).toThrow(
        "Expected 3 typecheck errors, got 2"
      );
    });

    test("assertValidationResult checks total issues", () => {
      const result = {
        mode: "quick" as const,
        success: false,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          totalAffected: 0,
          analysisTimeMs: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        totalIssues: 5,
        totalTimeMs: 100,
      };

      expect(() => harness.assertValidationResult(result, { totalIssues: 5 })).not.toThrow();
      expect(() => harness.assertValidationResult(result, { totalIssues: 10 })).toThrow(
        "Expected 10 total issues, got 5"
      );
    });
  });

  describe("Cleanup", () => {
    test("cleanup removes all temporary workspaces", async () => {
      const workspace1 = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
      });
      const workspace2 = await harness.createTempWorkspace({
        fixtures: ["pkg-ts-errors"],
      });

      const rootDir1 = workspace1.rootDir;
      const rootDir2 = workspace2.rootDir;

      expect(await harness.fileExists(rootDir1)).toBe(true);
      expect(await harness.fileExists(rootDir2)).toBe(true);

      await harness.cleanup();

      // After cleanup, directories should be removed
      expect(await harness.fileExists(rootDir1)).toBe(false);
      expect(await harness.fileExists(rootDir2)).toBe(false);
    });

    test("cleanupWorkspace removes specific workspace", async () => {
      const workspace1 = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
      });
      const workspace2 = await harness.createTempWorkspace({
        fixtures: ["pkg-ts-errors"],
      });

      await harness.cleanupWorkspace(workspace1.rootDir);

      // Only workspace1 should be removed
      expect(await harness.fileExists(workspace1.rootDir)).toBe(false);
      expect(await harness.fileExists(workspace2.rootDir)).toBe(true);
    });
  });
});
