/**
 * Git Integration E2E Tests
 *
 * Tests that verify the validation system correctly interacts with Git state.
 * Verifies --on-stop behavior with staged vs unstaged files.
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

describe("Git Integration E2E", () => {
  let harness: ValidationTestHarness;
  const fixturesPath = path.resolve(__dirname, "../../../fixtures-validation");

  beforeEach(() => {
    harness = new ValidationTestHarness(fixturesPath);
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  describe("Git Simulator Basic Operations", () => {
    test("initializes Git repository correctly", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: false,
      });

      expect(await workspace.git.isGitRepo()).toBe(true);
    });

    test("creates initial commit", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // After initial commit, staged files should be empty
      const staged = await workspace.git.getStagedFiles();
      expect(staged).toHaveLength(0);
    });

    test("getRepoRoot returns correct path", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
      });

      const repoRoot = await workspace.git.getRepoRoot();
      // On macOS, /var is a symlink to /private/var, so git returns the resolved path
      // We need to compare resolved paths
      const fs = await import("node:fs/promises");
      const resolvedRootDir = await fs.realpath(workspace.rootDir);
      expect(repoRoot).toBe(resolvedRootDir);
    });
  });

  describe("File Staging Detection", () => {
    test("detects newly staged files", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Add a new file
      const newFilePath = path.join(getPkgPath(workspace.packages, "pkg-clean"), "src", "new.ts");
      await harness.writeFile(newFilePath, "export const value = 1;");

      // Before staging
      const beforeStaged = await workspace.git.getStagedFiles();
      expect(beforeStaged).toHaveLength(0);

      // Stage the file
      await workspace.git.stageFile(path.relative(workspace.rootDir, newFilePath));

      // After staging
      const afterStaged = await workspace.git.getStagedFiles();
      expect(afterStaged.some((f) => f.includes("new.ts"))).toBe(true);
    });

    test("unstages files correctly", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Add and stage a file
      const newFilePath = path.join(
        getPkgPath(workspace.packages, "pkg-clean"),
        "src",
        "unstage-test.ts"
      );
      await harness.writeFile(newFilePath, "export const x = 1;");
      await workspace.git.stageFile(path.relative(workspace.rootDir, newFilePath));

      // Verify staged
      const staged = await workspace.git.getStagedFiles();
      expect(staged.some((f) => f.includes("unstage-test.ts"))).toBe(true);

      // Unstage
      await workspace.git.unstageFile(path.relative(workspace.rootDir, newFilePath));

      // Verify unstaged (now untracked)
      const afterUnstage = await workspace.git.getStagedFiles();
      expect(afterUnstage.some((f) => f.includes("unstage-test.ts"))).toBe(false);
    });
  });

  describe("File State Categories", () => {
    test("categorizes files into staged, unstaged, and untracked", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Create an untracked file
      const untrackedPath = path.join(getPkgPath(workspace.packages, "pkg-clean"), "untracked.ts");
      await harness.writeFile(untrackedPath, "export const untracked = 1;");

      // Create and stage a file
      const stagedPath = path.join(getPkgPath(workspace.packages, "pkg-clean"), "staged.ts");
      await harness.writeFile(stagedPath, "export const staged = 2;");
      await workspace.git.stageFile(path.relative(workspace.rootDir, stagedPath));

      // Get all changed files
      const changed = await workspace.git.getChangedFiles();

      expect(changed.untracked.some((f) => f.includes("untracked.ts"))).toBe(true);
      expect(changed.staged.some((f) => f.includes("staged.ts"))).toBe(true);
    });

    test("handles mixed staged and unstaged modifications", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Create and commit a file first
      const filePath = path.join(getPkgPath(workspace.packages, "pkg-clean"), "src", "modify.ts");
      await harness.writeFile(filePath, "export const original = 1;");
      await workspace.git.stageAll();
      await workspace.git.commit("Add modify.ts");

      // Now modify it
      await harness.writeFile(filePath, "export const modified = 2;");

      // Stage the modification
      await workspace.git.stageFile(path.relative(workspace.rootDir, filePath));

      // Modify it again (unstaged change)
      await harness.writeFile(filePath, "export const modifiedAgain = 3;");

      const changed = await workspace.git.getChangedFiles();

      // File should appear in both staged and unstaged
      expect(changed.staged.some((f) => f.includes("modify.ts"))).toBe(true);
      expect(changed.unstaged.some((f) => f.includes("modify.ts"))).toBe(true);
    });
  });

  describe("Commit Operations", () => {
    test("commits staged files", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Add and stage a file
      const newFilePath = path.join(getPkgPath(workspace.packages, "pkg-clean"), "committed.ts");
      await harness.writeFile(newFilePath, "export const committed = true;");
      await workspace.git.stageFile(path.relative(workspace.rootDir, newFilePath));

      // Commit
      const commitResult = await workspace.git.commit("Add committed.ts");
      expect(commitResult).toBe(true);

      // After commit, staged should be empty
      const staged = await workspace.git.getStagedFiles();
      expect(staged).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    test("handles empty repository (no commits)", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: false,
      });

      // Git operations should still work on empty repo
      const changed = await workspace.git.getChangedFiles();

      // All fixture files should be untracked in empty repo
      expect(changed.untracked.length).toBeGreaterThan(0);
    });

    test("handles files with spaces in names", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Create a file with spaces
      const spacedPath = path.join(
        getPkgPath(workspace.packages, "pkg-clean"),
        "file with spaces.ts"
      );
      await harness.writeFile(spacedPath, "export const x = 1;");

      // Stage should work
      await workspace.git.stageFile(path.relative(workspace.rootDir, spacedPath));

      const staged = await workspace.git.getStagedFiles();
      expect(staged.some((f) => f.includes("file with spaces.ts"))).toBe(true);
    });

    test("handles deeply nested files", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Create a deeply nested file
      const nestedPath = path.join(
        getPkgPath(workspace.packages, "pkg-clean"),
        "src",
        "deep",
        "nested",
        "file.ts"
      );
      await harness.writeFile(nestedPath, "export const nested = true;");

      // Stage should work
      await workspace.git.stageFile(path.relative(workspace.rootDir, nestedPath));

      const staged = await workspace.git.getStagedFiles();
      expect(staged.some((f) => f.includes("deep/nested/file.ts"))).toBe(true);
    });
  });

  describe("Stage All Operation", () => {
    test("stageAll stages all untracked and modified files", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Create multiple new files
      await harness.writeFile(
        path.join(getPkgPath(workspace.packages, "pkg-clean"), "file1.ts"),
        "export const a = 1;"
      );
      await harness.writeFile(
        path.join(getPkgPath(workspace.packages, "pkg-clean"), "file2.ts"),
        "export const b = 2;"
      );
      await harness.writeFile(
        path.join(getPkgPath(workspace.packages, "pkg-clean"), "file3.ts"),
        "export const c = 3;"
      );

      // Stage all
      await workspace.git.stageAll();

      const staged = await workspace.git.getStagedFiles();
      expect(staged.length).toBe(3);
    });
  });
});
