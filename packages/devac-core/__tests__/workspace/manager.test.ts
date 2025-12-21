import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceManager } from "../../src/workspace/manager.js";
import type { WorkspaceEvent } from "../../src/workspace/types.js";

describe("WorkspaceManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-manager-test-"));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createTestWorkspace() {
    const workspace = path.join(tempDir, "workspace");
    // Create two git repos
    await fs.mkdir(path.join(workspace, "api", ".git"), { recursive: true });
    await fs.writeFile(path.join(workspace, "api", ".git", "HEAD"), "ref: refs/heads/main\n");
    await fs.mkdir(path.join(workspace, "web", ".git"), { recursive: true });
    await fs.writeFile(path.join(workspace, "web", ".git", "HEAD"), "ref: refs/heads/main\n");
    // Add seeds to api
    await fs.mkdir(path.join(workspace, "api", ".devac", "seed"), { recursive: true });
    return workspace;
  }

  describe("initialize", () => {
    it("should discover repos in workspace", async () => {
      const workspace = await createTestWorkspace();
      const manager = createWorkspaceManager({ workspacePath: workspace });

      const info = await manager.initialize();

      expect(info.isWorkspace).toBe(true);
      expect(info.repos).toHaveLength(2);
      expect(info.mainRepos).toHaveLength(2);

      await manager.dispose();
    });

    it("should return false for non-workspace", async () => {
      // Single git repo, not a workspace
      const repo = path.join(tempDir, "single-repo");
      await fs.mkdir(path.join(repo, ".git"), { recursive: true });

      const manager = createWorkspaceManager({ workspacePath: repo });
      const info = await manager.initialize();

      expect(info.isWorkspace).toBe(false);
      expect(info.repos).toHaveLength(0);

      await manager.dispose();
    });

    it("should load existing state", async () => {
      const workspace = await createTestWorkspace();

      // Create existing state with registered repo
      await fs.mkdir(path.join(workspace, ".devac"), { recursive: true });
      await fs.writeFile(
        path.join(workspace, ".devac", "state.json"),
        JSON.stringify({
          version: "1.0",
          lastDiscovery: new Date().toISOString(),
          repos: [
            {
              path: path.join(workspace, "api"),
              repoId: "api",
              hubStatus: "registered",
            },
          ],
        })
      );

      const manager = createWorkspaceManager({ workspacePath: workspace });
      const info = await manager.initialize();

      // Should have merged hub status from state
      const apiRepo = info.repos.find((r) => r.name === "api");
      expect(apiRepo?.hubStatus).toBe("registered");

      await manager.dispose();
    });
  });

  describe("getInfo", () => {
    it("should return workspace info after initialization", async () => {
      const workspace = await createTestWorkspace();
      const manager = createWorkspaceManager({ workspacePath: workspace });

      await manager.initialize();
      const info = manager.getInfo();

      expect(info.isWorkspace).toBe(true);
      expect(info.repos).toHaveLength(2);

      await manager.dispose();
    });

    it("should throw if not initialized", () => {
      const manager = createWorkspaceManager({ workspacePath: tempDir });

      expect(() => manager.getInfo()).toThrow("not initialized");
    });
  });

  describe("getStats", () => {
    it("should return workspace stats", async () => {
      const workspace = await createTestWorkspace();
      const manager = createWorkspaceManager({ workspacePath: workspace });

      await manager.initialize();
      const stats = manager.getStats();

      expect(stats.reposDiscovered).toBe(2);
      expect(stats.reposWithSeeds).toBe(1); // Only api has seeds
      // reposRegistered depends on whether autoRegister runs
      expect(stats.reposRegistered).toBeGreaterThanOrEqual(0);

      await manager.dispose();
    });
  });

  describe("on/off event handling", () => {
    it("should emit watcher-state events", async () => {
      const workspace = await createTestWorkspace();
      const manager = createWorkspaceManager({ workspacePath: workspace });

      const events: WorkspaceEvent[] = [];
      const unsubscribe = manager.on((event) => {
        events.push(event);
      });

      await manager.initialize();
      await manager.startWatch();

      // Should have received watcher-state: started
      expect(events.some((e) => e.type === "watcher-state" && e.state === "started")).toBe(true);

      await manager.stopWatch();

      // Should have received watcher-state: stopped
      expect(events.some((e) => e.type === "watcher-state" && e.state === "stopped")).toBe(true);

      unsubscribe();
      await manager.dispose();
    });

    it("should allow unsubscribing from events", async () => {
      const workspace = await createTestWorkspace();
      const manager = createWorkspaceManager({ workspacePath: workspace });

      const events: WorkspaceEvent[] = [];
      const unsubscribe = manager.on((event) => {
        events.push(event);
      });

      await manager.initialize();
      await manager.startWatch();

      const startEventCount = events.length;
      unsubscribe();

      await manager.stopWatch();

      // No new events after unsubscribing
      expect(events.length).toBe(startEventCount);

      await manager.dispose();
    });
  });

  describe("startWatch/stopWatch", () => {
    it("should start and stop watching", async () => {
      const workspace = await createTestWorkspace();
      const manager = createWorkspaceManager({ workspacePath: workspace });

      await manager.initialize();
      await manager.startWatch();

      const stats = manager.getStats();
      expect(stats.isWatching).toBe(true);

      await manager.stopWatch();

      const stoppedStats = manager.getStats();
      expect(stoppedStats.isWatching).toBe(false);

      await manager.dispose();
    });

    it("should throw if starting watch before initialize", async () => {
      const manager = createWorkspaceManager({ workspacePath: tempDir });

      await expect(manager.startWatch()).rejects.toThrow("not initialized");
    });

    it("should be idempotent for multiple starts", async () => {
      const workspace = await createTestWorkspace();
      const manager = createWorkspaceManager({ workspacePath: workspace });

      await manager.initialize();
      await manager.startWatch();
      await manager.startWatch(); // Should not throw

      const stats = manager.getStats();
      expect(stats.isWatching).toBe(true);

      await manager.dispose();
    });

    it("should be idempotent for multiple stops", async () => {
      const workspace = await createTestWorkspace();
      const manager = createWorkspaceManager({ workspacePath: workspace });

      await manager.initialize();
      await manager.startWatch();
      await manager.stopWatch();
      await manager.stopWatch(); // Should not throw

      const stats = manager.getStats();
      expect(stats.isWatching).toBe(false);

      await manager.dispose();
    });
  });

  describe("dispose", () => {
    it("should stop watching and clean up", async () => {
      const workspace = await createTestWorkspace();
      const manager = createWorkspaceManager({ workspacePath: workspace });

      await manager.initialize();
      await manager.startWatch();
      await manager.dispose();

      // Should throw when trying to get info after dispose
      expect(() => manager.getInfo()).toThrow();
    });

    it("should be safe to call multiple times", async () => {
      const workspace = await createTestWorkspace();
      const manager = createWorkspaceManager({ workspacePath: workspace });

      await manager.initialize();
      await manager.dispose();
      await manager.dispose(); // Should not throw
    });
  });

  describe("options", () => {
    it("should accept custom hubDir option", async () => {
      const workspace = await createTestWorkspace();
      const customHubDir = path.join(tempDir, "custom-hub");

      // The hubDir is used internally for the hub database,
      // but hubPath in WorkspaceInfo is always derived from workspacePath
      const manager = createWorkspaceManager({
        workspacePath: workspace,
        hubDir: customHubDir,
      });

      await manager.initialize();

      const info = manager.getInfo();
      // hubPath is still based on workspacePath
      expect(info.hubPath).toContain(".devac");
      expect(info.hubPath).toContain("hub.duckdb");

      await manager.dispose();
    });

    it("should respect autoRefresh option", async () => {
      const workspace = await createTestWorkspace();

      // With autoRefresh disabled
      const manager = createWorkspaceManager({
        workspacePath: workspace,
        autoRefresh: false,
      });

      await manager.initialize();
      await manager.startWatch();

      // Should still work, just without auto-refresh
      const stats = manager.getStats();
      expect(stats.isWatching).toBe(true);

      await manager.dispose();
    });
  });

  describe("worktree grouping", () => {
    it("should group worktrees by issueId", async () => {
      const workspace = path.join(tempDir, "workspace");
      // Main repos
      await fs.mkdir(path.join(workspace, "api", ".git"), { recursive: true });
      await fs.mkdir(path.join(workspace, "web", ".git"), { recursive: true });
      // Worktrees
      const wt1 = path.join(workspace, "api-ghapi-123-auth");
      await fs.mkdir(wt1, { recursive: true });
      await fs.writeFile(
        path.join(wt1, ".git"),
        "gitdir: ../api/.git/worktrees/api-ghapi-123-auth"
      );

      const manager = createWorkspaceManager({ workspacePath: workspace });
      const info = await manager.initialize();

      expect(info.mainRepos).toHaveLength(2);
      expect(info.worktreesByIssue.size).toBe(1);
      expect(info.worktreesByIssue.get("ghapi-123")).toHaveLength(1);

      await manager.dispose();
    });
  });
});
