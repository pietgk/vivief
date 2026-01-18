/**
 * Workspace Status Tests
 *
 * Tests for status.ts - workspace status computation and formatting
 */

import type { Stats } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type WorkspaceStatus,
  formatStatusBrief,
  formatStatusFull,
  getRepoStatus,
  getWorkspaceStatus,
} from "../../src/workspace/status.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("../../src/hub/central-hub.js", () => ({
  CentralHub: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    listRepos: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock("../../src/utils/atomic-write.js", () => ({
  fileExists: vi.fn().mockResolvedValue(false),
}));
vi.mock("../../src/workspace/discover.js", () => ({
  getRepoId: vi.fn().mockResolvedValue("github.com/test/repo"),
  getGitBranch: vi.fn().mockResolvedValue("main"),
  findWorkspaceDir: vi.fn().mockResolvedValue(null),
  findGitRoot: vi.fn().mockResolvedValue("/test/repo"),
  discoverWorkspace: vi.fn().mockResolvedValue({ repos: [] }),
}));
vi.mock("../../src/workspace/seed-state.js", () => ({
  detectRepoSeedStatus: vi.fn().mockResolvedValue({
    repoPath: "/test/repo",
    repoId: "github.com/test/repo",
    packages: [],
    summary: { total: 0, none: 0, base: 0, delta: 0, both: 0 },
  }),
}));

const mockFs = vi.mocked(fs);
const { fileExists } = await import("../../src/utils/atomic-write.js");
const { getRepoId, getGitBranch, findWorkspaceDir, findGitRoot, discoverWorkspace } = await import(
  "../../src/workspace/discover.js"
);
const { detectRepoSeedStatus } = await import("../../src/workspace/seed-state.js");
const { CentralHub } = await import("../../src/hub/central-hub.js");

describe("workspace status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mocks
    vi.mocked(getRepoId).mockResolvedValue("github.com/test/repo");
    vi.mocked(getGitBranch).mockResolvedValue("main");
    vi.mocked(findWorkspaceDir).mockResolvedValue(null);
    vi.mocked(findGitRoot).mockResolvedValue("/test/repo");
    vi.mocked(discoverWorkspace).mockResolvedValue({
      repos: [],
      workspacePath: "/workspace",
      isWorkspace: false,
      mainRepos: [],
      worktreesByIssue: new Map(),
      hubPath: "/workspace/.devac/hub.duckdb",
      config: { version: "1.0" },
    });
    vi.mocked(fileExists).mockResolvedValue(false);
    vi.mocked(detectRepoSeedStatus).mockResolvedValue({
      repoPath: "/test/repo",
      repoId: "github.com/test/repo",
      packages: [],
      summary: { total: 0, none: 0, base: 0, delta: 0, both: 0 },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getRepoStatus", () => {
    it("returns status for a repository", async () => {
      mockFs.stat.mockRejectedValueOnce(new Error("ENOENT")); // Not a worktree

      const result = await getRepoStatus("/test/repo");

      expect(result.path).toBe(path.resolve("/test/repo"));
      expect(result.repoId).toBe("github.com/test/repo");
      expect(result.name).toBe("repo");
      expect(result.isWorktree).toBe(false);
      expect(result.hubStatus).toBe("unregistered");
      expect(result.branch).toBe("main");
    });

    it("detects worktree when .git is a file", async () => {
      mockFs.stat.mockResolvedValueOnce({
        isFile: () => true,
      } as Stats);

      const result = await getRepoStatus("/test/worktree");

      expect(result.isWorktree).toBe(true);
    });

    it("detects regular repo when .git is a directory", async () => {
      mockFs.stat.mockResolvedValueOnce({
        isFile: () => false,
      } as Stats);

      const result = await getRepoStatus("/test/repo");

      expect(result.isWorktree).toBe(false);
    });
  });

  describe("getWorkspaceStatus", () => {
    it("returns status for single repo when not in workspace", async () => {
      vi.mocked(findWorkspaceDir).mockResolvedValueOnce(null);
      vi.mocked(findGitRoot).mockResolvedValue("/test/repo");
      vi.mocked(fileExists).mockResolvedValue(false); // No hub
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));

      const result = await getWorkspaceStatus({ path: "/test/repo" });

      expect(result.isWorkspace).toBe(false);
      expect(result.hubInitialized).toBe(false);
      expect(result.repos).toHaveLength(1);
    });

    it("returns status for workspace with multiple repos", async () => {
      vi.mocked(findWorkspaceDir).mockResolvedValueOnce("/workspace");
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(discoverWorkspace).mockResolvedValueOnce({
        repos: [
          {
            path: "/workspace/repo1",
            name: "repo1",
            repoId: "github.com/test/repo1",
            isWorktree: false,
            branch: "main",
            hasSeeds: false,
            hubStatus: "unregistered",
          },
          {
            path: "/workspace/repo2",
            name: "repo2",
            repoId: "github.com/test/repo2",
            isWorktree: false,
            branch: "feature",
            hasSeeds: false,
            hubStatus: "unregistered",
          },
        ],
        workspacePath: "/workspace",
        isWorkspace: true,
        mainRepos: [],
        worktreesByIssue: new Map(),
        hubPath: "/workspace/.devac/hub.duckdb",
        config: { version: "1.0" },
      });
      vi.mocked(detectRepoSeedStatus).mockResolvedValue({
        repoPath: "/workspace/repo1",
        repoId: "github.com/test/repo1",
        packages: [],
        summary: { total: 0, none: 0, base: 0, delta: 0, both: 0 },
      });

      const result = await getWorkspaceStatus({ path: "/workspace/repo1" });

      expect(result.isWorkspace).toBe(true);
      expect(result.workspacePath).toBe("/workspace");
      expect(result.repos).toHaveLength(2);
    });

    it("connects to hub when initialized", async () => {
      vi.mocked(findWorkspaceDir).mockResolvedValueOnce(null);
      vi.mocked(findGitRoot).mockResolvedValue("/test/repo");
      vi.mocked(fileExists).mockResolvedValue(true); // Hub exists
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));

      const mockHub = {
        init: vi.fn().mockResolvedValue(undefined),
        listRepos: vi.fn().mockResolvedValue([{ repoId: "github.com/test/repo" }]),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(CentralHub).mockImplementation(
        () => mockHub as unknown as InstanceType<typeof CentralHub>
      );

      const result = await getWorkspaceStatus({ path: "/test/repo" });

      expect(result.hubInitialized).toBe(true);
      expect(mockHub.init).toHaveBeenCalled();
      expect(mockHub.close).toHaveBeenCalled();
    });

    it("handles hub connection errors gracefully", async () => {
      vi.mocked(findWorkspaceDir).mockResolvedValueOnce(null);
      vi.mocked(findGitRoot).mockResolvedValue("/test/repo");
      vi.mocked(fileExists).mockResolvedValue(true); // Hub exists
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));

      const mockHub = {
        init: vi.fn().mockRejectedValue(new Error("Database locked")),
        listRepos: vi.fn(),
        close: vi.fn(),
      };
      vi.mocked(CentralHub).mockImplementation(
        () => mockHub as unknown as InstanceType<typeof CentralHub>
      );

      const result = await getWorkspaceStatus({ path: "/test/repo" });

      expect(result.hubError).toContain("Database locked");
    });

    it("marks repos as registered when found in hub", async () => {
      vi.mocked(findWorkspaceDir).mockResolvedValueOnce("/workspace");
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(discoverWorkspace).mockResolvedValueOnce({
        repos: [
          {
            path: "/workspace/repo1",
            name: "repo1",
            repoId: "github.com/test/repo1",
            isWorktree: false,
            branch: "main",
            hasSeeds: false,
            hubStatus: "unregistered",
          },
          {
            path: "/workspace/repo2",
            name: "repo2",
            repoId: "github.com/test/repo2",
            isWorktree: false,
            branch: "main",
            hasSeeds: false,
            hubStatus: "unregistered",
          },
        ],
        workspacePath: "/workspace",
        isWorkspace: true,
        mainRepos: [],
        worktreesByIssue: new Map(),
        hubPath: "/workspace/.devac/hub.duckdb",
        config: { version: "1.0" },
      });
      vi.mocked(detectRepoSeedStatus).mockResolvedValue({
        repoPath: "/workspace/repo1",
        repoId: "github.com/test/repo1",
        packages: [],
        summary: { total: 0, none: 0, base: 0, delta: 0, both: 0 },
      });

      const mockHub = {
        init: vi.fn().mockResolvedValue(undefined),
        listRepos: vi.fn().mockResolvedValue([
          { repoId: "github.com/test/repo1" }, // Only repo1 is registered
        ]),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(CentralHub).mockImplementation(
        () => mockHub as unknown as InstanceType<typeof CentralHub>
      );

      const result = await getWorkspaceStatus({ path: "/workspace" });

      expect(result.repos[0]?.hubStatus).toBe("registered");
      expect(result.repos[1]?.hubStatus).toBe("unregistered");
    });

    it("skips seed detection when checkSeeds is false", async () => {
      vi.mocked(findWorkspaceDir).mockResolvedValueOnce("/workspace");
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(discoverWorkspace).mockResolvedValueOnce({
        repos: [
          {
            path: "/workspace/repo1",
            name: "repo1",
            repoId: "github.com/test/repo1",
            isWorktree: false,
            branch: "main",
            hasSeeds: false,
            hubStatus: "unregistered",
          },
        ],
        workspacePath: "/workspace",
        isWorkspace: true,
        mainRepos: [],
        worktreesByIssue: new Map(),
        hubPath: "/workspace/.devac/hub.duckdb",
        config: { version: "1.0" },
      });

      await getWorkspaceStatus({ path: "/workspace", checkSeeds: false });

      expect(detectRepoSeedStatus).not.toHaveBeenCalled();
    });

    it("computes summary correctly", async () => {
      vi.mocked(findWorkspaceDir).mockResolvedValueOnce("/workspace");
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(discoverWorkspace).mockResolvedValueOnce({
        repos: [
          {
            path: "/workspace/repo1",
            name: "repo1",
            repoId: "id1",
            isWorktree: false,
            branch: "main",
            hasSeeds: false,
            hubStatus: "unregistered",
          },
          {
            path: "/workspace/repo2",
            name: "repo2",
            repoId: "id2",
            isWorktree: false,
            branch: "main",
            hasSeeds: false,
            hubStatus: "unregistered",
          },
        ],
        workspacePath: "/workspace",
        isWorkspace: true,
        mainRepos: [],
        worktreesByIssue: new Map(),
        hubPath: "/workspace/.devac/hub.duckdb",
        config: { version: "1.0" },
      });

      let callCount = 0;
      vi.mocked(detectRepoSeedStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            repoPath: "/workspace/repo1",
            repoId: "id1",
            packages: [
              {
                packagePath: "/p1",
                packageName: "p1",
                state: "base",
                hasBase: true,
                hasDelta: false,
              },
            ],
            summary: { total: 1, none: 0, base: 1, delta: 0, both: 0 },
          };
        }
        return {
          repoPath: "/workspace/repo2",
          repoId: "id2",
          packages: [
            {
              packagePath: "/p2",
              packageName: "p2",
              state: "none",
              hasBase: false,
              hasDelta: false,
            },
          ],
          summary: { total: 1, none: 1, base: 0, delta: 0, both: 0 },
        };
      });

      const mockHub = {
        init: vi.fn().mockResolvedValue(undefined),
        listRepos: vi.fn().mockResolvedValue([{ repoId: "id1" }]),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(CentralHub).mockImplementation(
        () => mockHub as unknown as InstanceType<typeof CentralHub>
      );

      const result = await getWorkspaceStatus({ path: "/workspace" });

      expect(result.summary).toEqual({
        totalRepos: 2,
        reposWithSeeds: 1,
        reposRegistered: 1,
        packagesAnalyzed: 1,
        packagesNeedAnalysis: 1,
      });
    });
  });

  describe("formatStatusBrief", () => {
    it("formats workspace status correctly", () => {
      const status: WorkspaceStatus = {
        workspacePath: "/workspace",
        isWorkspace: true,
        hubInitialized: true,
        repos: [
          {
            path: "/workspace/repo1",
            repoId: "id1",
            name: "repo1",
            isWorktree: false,
            hubStatus: "registered",
            seedStatus: {
              repoPath: "/workspace/repo1",
              repoId: "id1",
              packages: [],
              summary: { total: 2, none: 0, base: 2, delta: 0, both: 0 },
            },
          },
        ],
        summary: {
          totalRepos: 1,
          reposWithSeeds: 1,
          reposRegistered: 1,
          packagesAnalyzed: 2,
          packagesNeedAnalysis: 0,
        },
      };

      const result = formatStatusBrief(status);

      expect(result).toContain("Workspace: /workspace");
      expect(result).toContain("repo1 (registered): 2 packages analyzed");
      expect(result).toContain("Hub: 1 repos registered");
    });

    it("formats single repo status correctly", () => {
      const status: WorkspaceStatus = {
        workspacePath: "/test/repo",
        isWorkspace: false,
        hubInitialized: false,
        repos: [
          {
            path: "/test/repo",
            repoId: "id1",
            name: "repo",
            isWorktree: false,
            hubStatus: "unregistered",
            seedStatus: {
              repoPath: "/test/repo",
              repoId: "id1",
              packages: [],
              summary: { total: 1, none: 1, base: 0, delta: 0, both: 0 },
            },
          },
        ],
        summary: {
          totalRepos: 1,
          reposWithSeeds: 0,
          reposRegistered: 0,
          packagesAnalyzed: 0,
          packagesNeedAnalysis: 1,
        },
      };

      const result = formatStatusBrief(status);

      expect(result).toContain("Repository: /test/repo");
      expect(result).toContain("repo: not analyzed");
      expect(result).toContain("Hub: not initialized");
    });

    it("handles no packages case", () => {
      const status: WorkspaceStatus = {
        workspacePath: "/test/repo",
        isWorkspace: false,
        hubInitialized: false,
        repos: [
          {
            path: "/test/repo",
            repoId: "id1",
            name: "repo",
            isWorktree: false,
            hubStatus: "unregistered",
            seedStatus: {
              repoPath: "/test/repo",
              repoId: "id1",
              packages: [],
              summary: { total: 0, none: 0, base: 0, delta: 0, both: 0 },
            },
          },
        ],
        summary: {
          totalRepos: 1,
          reposWithSeeds: 0,
          reposRegistered: 0,
          packagesAnalyzed: 0,
          packagesNeedAnalysis: 0,
        },
      };

      const result = formatStatusBrief(status);

      expect(result).toContain("repo: no packages");
    });

    it("handles partial analysis", () => {
      const status: WorkspaceStatus = {
        workspacePath: "/test/repo",
        isWorkspace: false,
        hubInitialized: false,
        repos: [
          {
            path: "/test/repo",
            repoId: "id1",
            name: "repo",
            isWorktree: false,
            hubStatus: "unregistered",
            seedStatus: {
              repoPath: "/test/repo",
              repoId: "id1",
              packages: [],
              summary: { total: 5, none: 2, base: 2, delta: 0, both: 1 },
            },
          },
        ],
        summary: {
          totalRepos: 1,
          reposWithSeeds: 1,
          reposRegistered: 0,
          packagesAnalyzed: 3,
          packagesNeedAnalysis: 2,
        },
      };

      const result = formatStatusBrief(status);

      expect(result).toContain("repo: 3/5 analyzed");
    });
  });

  describe("formatStatusFull", () => {
    it("formats full status with package details", () => {
      const status: WorkspaceStatus = {
        workspacePath: "/workspace",
        isWorkspace: true,
        hubInitialized: true,
        repos: [
          {
            path: "/workspace/repo1",
            repoId: "id1",
            name: "repo1",
            isWorktree: false,
            hubStatus: "registered",
            seedStatus: {
              repoPath: "/workspace/repo1",
              repoId: "id1",
              packages: [
                {
                  packagePath: "/workspace/repo1/pkg1",
                  packageName: "pkg1",
                  state: "base",
                  hasBase: true,
                  hasDelta: false,
                  baseLastModified: "2024-01-15T10:00:00.000Z",
                },
                {
                  packagePath: "/workspace/repo1/pkg2",
                  packageName: "pkg2",
                  state: "none",
                  hasBase: false,
                  hasDelta: false,
                },
              ],
              summary: { total: 2, none: 1, base: 1, delta: 0, both: 0 },
            },
          },
        ],
        summary: {
          totalRepos: 1,
          reposWithSeeds: 1,
          reposRegistered: 1,
          packagesAnalyzed: 1,
          packagesNeedAnalysis: 1,
        },
      };

      const result = formatStatusFull(status);

      expect(result).toContain("SEED STATUS");
      expect(result).toContain("repo1 (registered)");
      expect(result).toContain("pkg1");
      expect(result).toContain("[base ]");
      expect(result).toContain("2024-01-15");
      expect(result).toContain("pkg2");
      expect(result).toContain("[none ]");
      expect(result).toContain("devac analyze");
      expect(result).toContain("SUMMARY");
      expect(result).toContain("Repositories:       1");
    });

    it("handles both state with dates", () => {
      const status: WorkspaceStatus = {
        workspacePath: "/workspace",
        isWorkspace: true,
        hubInitialized: false,
        repos: [
          {
            path: "/workspace/repo1",
            repoId: "id1",
            name: "repo1",
            isWorktree: false,
            hubStatus: "unregistered",
            seedStatus: {
              repoPath: "/workspace/repo1",
              repoId: "id1",
              packages: [
                {
                  packagePath: "/workspace/repo1/pkg1",
                  packageName: "pkg1",
                  state: "both",
                  hasBase: true,
                  hasDelta: true,
                  baseLastModified: "2024-01-15T10:00:00.000Z",
                  deltaLastModified: "2024-01-20T10:00:00.000Z",
                },
              ],
              summary: { total: 1, none: 0, base: 0, delta: 0, both: 1 },
            },
          },
        ],
        summary: {
          totalRepos: 1,
          reposWithSeeds: 1,
          reposRegistered: 0,
          packagesAnalyzed: 1,
          packagesNeedAnalysis: 0,
        },
      };

      const result = formatStatusFull(status);

      expect(result).toContain("[both ]");
      expect(result).toContain("base: 2024-01-15");
      expect(result).toContain("delta: 2024-01-20");
    });

    it("handles repo with no packages", () => {
      const status: WorkspaceStatus = {
        workspacePath: "/workspace",
        isWorkspace: true,
        hubInitialized: false,
        repos: [
          {
            path: "/workspace/repo1",
            repoId: "id1",
            name: "repo1",
            isWorktree: false,
            hubStatus: "unregistered",
            seedStatus: {
              repoPath: "/workspace/repo1",
              repoId: "id1",
              packages: [],
              summary: { total: 0, none: 0, base: 0, delta: 0, both: 0 },
            },
          },
        ],
        summary: {
          totalRepos: 1,
          reposWithSeeds: 0,
          reposRegistered: 0,
          packagesAnalyzed: 0,
          packagesNeedAnalysis: 0,
        },
      };

      const result = formatStatusFull(status);

      expect(result).toContain("No packages detected");
    });

    it("handles pending hub status", () => {
      const status: WorkspaceStatus = {
        workspacePath: "/workspace",
        isWorkspace: true,
        hubInitialized: true,
        repos: [
          {
            path: "/workspace/repo1",
            repoId: "id1",
            name: "repo1",
            isWorktree: false,
            hubStatus: "pending",
            seedStatus: {
              repoPath: "/workspace/repo1",
              repoId: "id1",
              packages: [],
              summary: { total: 0, none: 0, base: 0, delta: 0, both: 0 },
            },
          },
        ],
        summary: {
          totalRepos: 1,
          reposWithSeeds: 0,
          reposRegistered: 0,
          packagesAnalyzed: 0,
          packagesNeedAnalysis: 0,
        },
      };

      const result = formatStatusFull(status);

      expect(result).toContain("(pending)");
    });
  });
});
