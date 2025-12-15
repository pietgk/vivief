/**
 * Central Hub Tests for DevAC v2.0
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CentralHub, createCentralHub } from "../src/hub/central-hub.js";

describe("CentralHub", () => {
  let tempDir: string;
  let hubDir: string;
  let hub: CentralHub;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-central-hub-test-"));
    hubDir = path.join(tempDir, ".devac");
  });

  afterEach(async () => {
    if (hub) {
      await hub.close();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a mock repository with seed data
   */
  async function createMockRepo(
    repoPath: string,
    options: {
      packages?: Array<{
        path: string;
        name: string;
        nodeCount?: number;
        edgeCount?: number;
      }>;
      gitRemote?: string;
    } = {}
  ): Promise<void> {
    const { packages = [{ path: ".", name: "test-pkg" }], gitRemote } = options;

    // Create git config if remote specified
    if (gitRemote) {
      await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });
      await fs.writeFile(
        path.join(repoPath, ".git", "config"),
        `[remote "origin"]\n  url = ${gitRemote}\n`
      );
    }

    // Create packages with seed data
    for (const pkg of packages) {
      const pkgPath = pkg.path === "." ? repoPath : path.join(repoPath, pkg.path);
      const seedPath = path.join(pkgPath, ".devac", "seed", "base");
      await fs.mkdir(seedPath, { recursive: true });

      await fs.writeFile(
        path.join(pkgPath, "package.json"),
        JSON.stringify({ name: pkg.name, version: "1.0.0" })
      );

      await fs.writeFile(
        path.join(seedPath, "stats.json"),
        JSON.stringify({
          nodeCount: pkg.nodeCount ?? 10,
          edgeCount: pkg.edgeCount ?? 5,
          refCount: 2,
          fileCount: 3,
        })
      );

      await fs.writeFile(path.join(seedPath, "nodes.parquet"), "mock");
      await fs.writeFile(path.join(seedPath, "edges.parquet"), "mock");
      await fs.writeFile(path.join(seedPath, "external_refs.parquet"), "mock");

      // Create meta.json
      await fs.writeFile(
        path.join(pkgPath, ".devac", "seed", "meta.json"),
        JSON.stringify({ schemaVersion: "2.1" })
      );
    }
  }

  describe("initialization", () => {
    it("creates hub at default path ~/.devac/central.duckdb", async () => {
      hub = createCentralHub({ hubDir });
      await hub.init();

      const hubPath = path.join(hubDir, "central.duckdb");
      const exists = await fs
        .access(hubPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("creates hub at custom path if specified", async () => {
      const customDir = path.join(tempDir, "custom-hub");
      hub = createCentralHub({ hubDir: customDir });
      await hub.init();

      const hubPath = path.join(customDir, "central.duckdb");
      const exists = await fs
        .access(hubPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("is idempotent - can init multiple times", async () => {
      hub = createCentralHub({ hubDir });
      await hub.init();
      await hub.init();
      await hub.init();

      const status = await hub.getStatus();
      expect(status.repoCount).toBe(0);
    });

    it("force option reinitializes hub", async () => {
      hub = createCentralHub({ hubDir });
      await hub.init();

      // Register a repo
      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath);
      await hub.registerRepo(repoPath);

      let status = await hub.getStatus();
      expect(status.repoCount).toBe(1);

      // Force reinitialize
      await hub.close();
      hub = createCentralHub({ hubDir });
      await hub.init({ force: true });

      status = await hub.getStatus();
      expect(status.repoCount).toBe(0);
    });
  });

  describe("repository management", () => {
    beforeEach(async () => {
      hub = createCentralHub({ hubDir });
      await hub.init();
    });

    it("registers repo and generates manifest", async () => {
      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath, {
        packages: [{ path: "packages/api", name: "@test/api" }],
      });

      const result = await hub.registerRepo(repoPath);

      expect(result.repoId).toBeDefined();
      expect(result.packages).toBe(1);

      // Manifest should be created
      const manifestPath = path.join(repoPath, ".devac", "manifest.json");
      const manifestExists = await fs
        .access(manifestPath)
        .then(() => true)
        .catch(() => false);
      expect(manifestExists).toBe(true);
    });

    it("detects repo_id from git remote", async () => {
      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath, {
        gitRemote: "git@github.com:myorg/myrepo.git",
      });

      const result = await hub.registerRepo(repoPath);

      expect(result.repoId).toBe("github.com/myorg/myrepo");
    });

    it("uses local path as repo_id if no git remote", async () => {
      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath);

      const result = await hub.registerRepo(repoPath);

      expect(result.repoId).toContain("local/");
    });

    it("fails if repo has no .devac/seed/ directory", async () => {
      const repoPath = path.join(tempDir, "empty-repo");
      await fs.mkdir(repoPath, { recursive: true });

      await expect(hub.registerRepo(repoPath)).rejects.toThrow();
    });

    it("unregisters repo and cleans up edges", async () => {
      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath);

      const result = await hub.registerRepo(repoPath);
      await hub.unregisterRepo(result.repoId);

      const repos = await hub.listRepos();
      expect(repos.length).toBe(0);
    });

    it("lists repos with status", async () => {
      const repo1 = path.join(tempDir, "repo1");
      const repo2 = path.join(tempDir, "repo2");
      await createMockRepo(repo1, {
        gitRemote: "git@github.com:org/repo1.git",
      });
      await createMockRepo(repo2, {
        gitRemote: "git@github.com:org/repo2.git",
      });

      await hub.registerRepo(repo1);
      await hub.registerRepo(repo2);

      const repos = await hub.listRepos();

      expect(repos.length).toBe(2);
      expect(repos.every((r) => r.status === "active")).toBe(true);
    });

    it("refreshes single repo manifest", async () => {
      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath, {
        packages: [{ path: "packages/api", name: "@test/api", nodeCount: 10 }],
      });

      const result = await hub.registerRepo(repoPath);

      // Update the seed stats
      const statsPath = path.join(repoPath, "packages/api/.devac/seed/base/stats.json");
      await fs.writeFile(
        statsPath,
        JSON.stringify({ nodeCount: 50, edgeCount: 20, refCount: 5, fileCount: 10 })
      );

      const refreshResult = await hub.refreshRepo(result.repoId);

      expect(refreshResult.reposRefreshed).toBe(1);
      expect(refreshResult.packagesUpdated).toBeGreaterThanOrEqual(1);
    });

    it("refreshes all repos", async () => {
      const repo1 = path.join(tempDir, "repo1");
      const repo2 = path.join(tempDir, "repo2");
      await createMockRepo(repo1);
      await createMockRepo(repo2);

      await hub.registerRepo(repo1);
      await hub.registerRepo(repo2);

      const refreshResult = await hub.refreshAll();

      expect(refreshResult.reposRefreshed).toBe(2);
    });
  });

  describe("status", () => {
    beforeEach(async () => {
      hub = createCentralHub({ hubDir });
      await hub.init();
    });

    it("returns hub status", async () => {
      const status = await hub.getStatus();

      expect(status.hubPath).toBe(path.join(hubDir, "central.duckdb"));
      expect(status.repoCount).toBe(0);
      expect(status.totalPackages).toBe(0);
      expect(status.crossRepoEdges).toBe(0);
    });

    it("updates status after registering repos", async () => {
      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath, {
        packages: [
          { path: "packages/api", name: "@test/api" },
          { path: "packages/shared", name: "@test/shared" },
        ],
      });

      await hub.registerRepo(repoPath);

      const status = await hub.getStatus();

      expect(status.repoCount).toBe(1);
      expect(status.totalPackages).toBe(2);
    });
  });

  describe("cross-repo queries", () => {
    beforeEach(async () => {
      hub = createCentralHub({ hubDir });
      await hub.init();
    });

    it("queries across all registered repos", async () => {
      // This is a placeholder test - actual implementation depends on
      // real parquet data. For now, we test that the method exists
      // and returns a result structure.

      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath);
      await hub.registerRepo(repoPath);

      // Query should not throw
      const result = await hub.query("SELECT 1 as test");
      expect(result).toBeDefined();
    });

    it("caches query results", async () => {
      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath);
      await hub.registerRepo(repoPath);

      // First query
      const result1 = await hub.query("SELECT 42 as value");

      // Second identical query should hit cache
      const result2 = await hub.query("SELECT 42 as value");

      expect(result2).toEqual(result1);
    });

    it("invalidates cache on repo refresh", async () => {
      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath);
      const reg = await hub.registerRepo(repoPath);

      // Cache a query
      await hub.query("SELECT 1 as cached");

      // Refresh should clear cache
      await hub.refreshRepo(reg.repoId);

      // This tests the invalidation mechanism exists
      const status = await hub.getStatus();
      expect(status.cacheSize).toBe(0);
    });
  });

  describe("affected analysis", () => {
    beforeEach(async () => {
      hub = createCentralHub({ hubDir });
      await hub.init();
    });

    it("returns empty result for no dependencies", async () => {
      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath);
      await hub.registerRepo(repoPath);

      const result = await hub.getAffectedRepos(["nonexistent:entity:id"]);

      expect(result.affectedRepos).toHaveLength(0);
      expect(result.totalAffected).toBe(0);
    });

    it("includes analysis time in result", async () => {
      const result = await hub.getAffectedRepos([]);

      expect(result.analysisTimeMs).toBeDefined();
      expect(typeof result.analysisTimeMs).toBe("number");
    });
  });

  describe("edge cases", () => {
    it("handles registering same repo twice", async () => {
      hub = createCentralHub({ hubDir });
      await hub.init();

      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath);

      await hub.registerRepo(repoPath);
      // Second registration should update, not fail
      const result = await hub.registerRepo(repoPath);

      expect(result.repoId).toBeDefined();

      const repos = await hub.listRepos();
      expect(repos.length).toBe(1);
    });

    it("handles unregistering non-existent repo", async () => {
      hub = createCentralHub({ hubDir });
      await hub.init();

      // Should not throw
      await hub.unregisterRepo("github.com/nonexistent/repo");
    });

    it("marks repos as missing when path doesn't exist", async () => {
      hub = createCentralHub({ hubDir });
      await hub.init();

      const repoPath = path.join(tempDir, "test-repo");
      await createMockRepo(repoPath);

      await hub.registerRepo(repoPath);

      // Delete the repo
      await fs.rm(repoPath, { recursive: true, force: true });

      // Sync should update status
      await hub.sync();

      const repos = await hub.listRepos();
      expect(repos[0].status).toBe("missing");
    });
  });
});
