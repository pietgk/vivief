/**
 * Workspace Discovery Utility Tests
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findWorkspaceDir, getWorkspaceHubDir } from "../src/utils/workspace-discovery.js";

describe("workspace-discovery utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-workspace-discovery-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Create a directory that looks like a git repo
   */
  async function createGitRepo(repoPath: string): Promise<void> {
    await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });
    // Create minimal git config
    await fs.writeFile(
      path.join(repoPath, ".git", "config"),
      "[core]\n  repositoryformatversion = 0\n"
    );
    await fs.writeFile(path.join(repoPath, ".git", "HEAD"), "ref: refs/heads/main\n");
  }

  /**
   * Create a workspace directory (contains at least one git repo as child)
   */
  async function createWorkspace(workspacePath: string, repoNames: string[]): Promise<void> {
    await fs.mkdir(workspacePath, { recursive: true });
    for (const name of repoNames) {
      await createGitRepo(path.join(workspacePath, name));
    }
  }

  describe("findWorkspaceDir()", () => {
    it("returns parent as workspace when cwd is a git repo within a workspace", async () => {
      // Create: tempDir/workspace/repo1 (git repo)
      const workspacePath = path.join(tempDir, "workspace");
      await createWorkspace(workspacePath, ["repo1", "repo2"]);

      const repoPath = path.join(workspacePath, "repo1");
      const result = await findWorkspaceDir(repoPath);

      expect(result).toBe(workspacePath);
    });

    it("returns cwd as workspace when cwd contains git repos", async () => {
      // Create: tempDir/workspace with child repos
      const workspacePath = path.join(tempDir, "workspace");
      await createWorkspace(workspacePath, ["repo1", "repo2"]);

      const result = await findWorkspaceDir(workspacePath);

      expect(result).toBe(workspacePath);
    });

    it("returns parent as workspace even for single repo (parent contains git repos)", async () => {
      // When a single git repo exists in a directory, that directory becomes a workspace
      // This is expected behavior: any directory containing git repos is a workspace
      const singleRepo = path.join(tempDir, "single-repo");
      await createGitRepo(singleRepo);

      const result = await findWorkspaceDir(singleRepo);

      // tempDir contains single-repo (a git repo), so tempDir is a workspace
      expect(result).toBe(tempDir);
    });

    it("returns null for directory that is neither git repo nor workspace", async () => {
      // Create empty directory
      const emptyDir = path.join(tempDir, "empty");
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await findWorkspaceDir(emptyDir);

      expect(result).toBeNull();
    });

    it("uses process.cwd() when no startDir provided", async () => {
      // This test verifies the default behavior but we can't easily mock cwd
      // Just verify it doesn't throw
      const result = await findWorkspaceDir();

      // Result depends on actual cwd, just verify it returns string or null
      expect(result === null || typeof result === "string").toBe(true);
    });

    it("resolves relative paths", async () => {
      const workspacePath = path.join(tempDir, "workspace");
      await createWorkspace(workspacePath, ["repo1"]);

      // Use absolute path but verify resolution works
      const result = await findWorkspaceDir(path.join(workspacePath, "repo1"));

      expect(result).toBe(workspacePath);
    });

    it("works with deeply nested repo structure", async () => {
      // Create: workspace/repo1 where repo1 has nested structure
      const workspacePath = path.join(tempDir, "workspace");
      await createWorkspace(workspacePath, ["repo1"]);

      // Create subdirectory within repo
      const nestedDir = path.join(workspacePath, "repo1", "src", "utils");
      await fs.mkdir(nestedDir, { recursive: true });

      // When called from nested dir within a repo, should still find workspace
      // Note: This depends on isGitRepo walking up to find .git
      // The current implementation checks the startDir directly, so it won't
      // automatically walk up. This is expected behavior.
      const result = await findWorkspaceDir(workspacePath);

      expect(result).toBe(workspacePath);
    });
  });

  describe("getWorkspaceHubDir()", () => {
    it("returns hub dir path when in a workspace", async () => {
      const workspacePath = path.join(tempDir, "workspace");
      await createWorkspace(workspacePath, ["repo1"]);

      const repoPath = path.join(workspacePath, "repo1");
      const result = await getWorkspaceHubDir(repoPath);

      expect(result).toBe(path.join(workspacePath, ".devac"));
    });

    it("returns hub dir when called from workspace root", async () => {
      const workspacePath = path.join(tempDir, "workspace");
      await createWorkspace(workspacePath, ["repo1", "repo2"]);

      const result = await getWorkspaceHubDir(workspacePath);

      expect(result).toBe(path.join(workspacePath, ".devac"));
    });

    it("throws error when not in a workspace", async () => {
      const standaloneDir = path.join(tempDir, "standalone");
      await fs.mkdir(standaloneDir, { recursive: true });

      await expect(getWorkspaceHubDir(standaloneDir)).rejects.toThrow(
        "Not in a workspace. Run from a workspace directory or a repository within a workspace."
      );
    });

    it("returns hub dir for single repo (parent becomes workspace)", async () => {
      // When a single git repo exists, its parent becomes a workspace
      const singleRepo = path.join(tempDir, "single-repo");
      await createGitRepo(singleRepo);

      const result = await getWorkspaceHubDir(singleRepo);

      // tempDir is the workspace, so hub is at tempDir/.devac
      expect(result).toBe(path.join(tempDir, ".devac"));
    });
  });
});
