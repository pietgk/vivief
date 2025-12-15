/**
 * Hub Storage Tests for DevAC v2.0
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type CrossRepoEdge,
  type HubStorage,
  type RepoRegistration,
  createHubStorage,
} from "../src/hub/hub-storage.js";

describe("HubStorage", () => {
  let tempDir: string;
  let hubPath: string;
  let storage: HubStorage;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-storage-test-"));
    hubPath = path.join(tempDir, "central.duckdb");
    storage = createHubStorage(hubPath);
  });

  afterEach(async () => {
    await storage.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("initialization", () => {
    it("creates central.duckdb at specified path", async () => {
      await storage.init();

      const exists = await fs
        .access(hubPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("creates repo_registry table on init", async () => {
      await storage.init();

      // Verify table exists by listing repos (should be empty)
      const repos = await storage.listRepos();
      expect(repos).toEqual([]);
    });

    it("creates cross_repo_edges table on init", async () => {
      await storage.init();

      // Verify table exists by querying edges
      const edges = await storage.getCrossRepoDependents([]);
      expect(edges).toEqual([]);
    });

    it("creates query_cache table on init", async () => {
      await storage.init();

      // Verify cache operations work
      const cached = await storage.getCachedQuery("test-hash");
      expect(cached).toBeNull();
    });

    it("is idempotent - can be called multiple times", async () => {
      await storage.init();
      await storage.init();
      await storage.init();

      const repos = await storage.listRepos();
      expect(repos).toEqual([]);
    });
  });

  describe("repo registry", () => {
    beforeEach(async () => {
      await storage.init();
    });

    it("adds repo to registry", async () => {
      const repo: RepoRegistration = {
        repo_id: "github.com/org/repo",
        local_path: "/Users/dev/projects/repo",
        manifest_hash: "abc123",
        last_synced: new Date().toISOString(),
        status: "active",
      };

      await storage.addRepo(repo);

      const repos = await storage.listRepos();
      expect(repos.length).toBe(1);
      expect(repos[0].repo_id).toBe("github.com/org/repo");
    });

    it("removes repo from registry", async () => {
      const repo: RepoRegistration = {
        repo_id: "github.com/org/repo",
        local_path: "/path/to/repo",
        manifest_hash: "abc123",
        last_synced: new Date().toISOString(),
        status: "active",
      };

      await storage.addRepo(repo);
      await storage.removeRepo("github.com/org/repo");

      const repos = await storage.listRepos();
      expect(repos.length).toBe(0);
    });

    it("lists all registered repos", async () => {
      const repos: RepoRegistration[] = [
        {
          repo_id: "github.com/org/repo1",
          local_path: "/path/to/repo1",
          manifest_hash: "hash1",
          last_synced: new Date().toISOString(),
          status: "active",
        },
        {
          repo_id: "github.com/org/repo2",
          local_path: "/path/to/repo2",
          manifest_hash: "hash2",
          last_synced: new Date().toISOString(),
          status: "active",
        },
        {
          repo_id: "github.com/org/repo3",
          local_path: "/path/to/repo3",
          manifest_hash: "hash3",
          last_synced: new Date().toISOString(),
          status: "stale",
        },
      ];

      for (const repo of repos) {
        await storage.addRepo(repo);
      }

      const listed = await storage.listRepos();
      expect(listed.length).toBe(3);

      const repoIds = listed.map((r) => r.repo_id);
      expect(repoIds).toContain("github.com/org/repo1");
      expect(repoIds).toContain("github.com/org/repo2");
      expect(repoIds).toContain("github.com/org/repo3");
    });

    it("gets repo by id", async () => {
      const repo: RepoRegistration = {
        repo_id: "github.com/org/repo",
        local_path: "/path/to/repo",
        manifest_hash: "abc123",
        last_synced: new Date().toISOString(),
        status: "active",
      };

      await storage.addRepo(repo);

      const retrieved = await storage.getRepo("github.com/org/repo");
      expect(retrieved).toBeDefined();
      expect(retrieved?.repo_id).toBe("github.com/org/repo");
      expect(retrieved?.local_path).toBe("/path/to/repo");
    });

    it("returns null for non-existent repo", async () => {
      const retrieved = await storage.getRepo("github.com/org/nonexistent");
      expect(retrieved).toBeNull();
    });

    it("updates repo manifest hash", async () => {
      const repo: RepoRegistration = {
        repo_id: "github.com/org/repo",
        local_path: "/path/to/repo",
        manifest_hash: "old-hash",
        last_synced: new Date().toISOString(),
        status: "active",
      };

      await storage.addRepo(repo);
      await storage.updateRepoSync("github.com/org/repo", "new-hash");

      const retrieved = await storage.getRepo("github.com/org/repo");
      expect(retrieved?.manifest_hash).toBe("new-hash");
    });

    it("updates last_synced on sync", async () => {
      const oldTime = new Date("2024-01-01").toISOString();
      const repo: RepoRegistration = {
        repo_id: "github.com/org/repo",
        local_path: "/path/to/repo",
        manifest_hash: "hash",
        last_synced: oldTime,
        status: "active",
      };

      await storage.addRepo(repo);

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await storage.updateRepoSync("github.com/org/repo", "new-hash");

      const retrieved = await storage.getRepo("github.com/org/repo");
      expect(new Date(retrieved?.last_synced).getTime()).toBeGreaterThan(
        new Date(oldTime).getTime()
      );
    });

    it("handles duplicate repo_id by updating", async () => {
      const repo1: RepoRegistration = {
        repo_id: "github.com/org/repo",
        local_path: "/path/to/old",
        manifest_hash: "old-hash",
        last_synced: new Date().toISOString(),
        status: "active",
      };

      const repo2: RepoRegistration = {
        repo_id: "github.com/org/repo",
        local_path: "/path/to/new",
        manifest_hash: "new-hash",
        last_synced: new Date().toISOString(),
        status: "active",
      };

      await storage.addRepo(repo1);
      await storage.addRepo(repo2);

      const repos = await storage.listRepos();
      expect(repos.length).toBe(1);
      expect(repos[0].local_path).toBe("/path/to/new");
    });
  });

  describe("cross-repo edges", () => {
    beforeEach(async () => {
      await storage.init();

      // Add some repos first
      await storage.addRepo({
        repo_id: "github.com/org/repo-a",
        local_path: "/path/to/repo-a",
        manifest_hash: "hash-a",
        last_synced: new Date().toISOString(),
        status: "active",
      });
      await storage.addRepo({
        repo_id: "github.com/org/repo-b",
        local_path: "/path/to/repo-b",
        manifest_hash: "hash-b",
        last_synced: new Date().toISOString(),
        status: "active",
      });
    });

    it("inserts cross-repo edges", async () => {
      const edges: CrossRepoEdge[] = [
        {
          source_repo: "github.com/org/repo-a",
          source_entity_id: "github.com/org/repo-a:pkg:function:abc123",
          target_repo: "github.com/org/repo-b",
          target_entity_id: "github.com/org/repo-b:pkg:class:def456",
          edge_type: "IMPORTS",
        },
      ];

      await storage.addCrossRepoEdges(edges);

      const retrieved = await storage.getCrossRepoDependents([
        "github.com/org/repo-b:pkg:class:def456",
      ]);
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].source_entity_id).toBe("github.com/org/repo-a:pkg:function:abc123");
    });

    it("queries cross-repo edges by source entity", async () => {
      const edges: CrossRepoEdge[] = [
        {
          source_repo: "github.com/org/repo-a",
          source_entity_id: "github.com/org/repo-a:pkg:function:abc123",
          target_repo: "github.com/org/repo-b",
          target_entity_id: "github.com/org/repo-b:pkg:class:target1",
          edge_type: "IMPORTS",
        },
        {
          source_repo: "github.com/org/repo-a",
          source_entity_id: "github.com/org/repo-a:pkg:function:abc123",
          target_repo: "github.com/org/repo-b",
          target_entity_id: "github.com/org/repo-b:pkg:class:target2",
          edge_type: "CALLS",
        },
      ];

      await storage.addCrossRepoEdges(edges);

      // Query by target - should find entities that depend on these targets
      const dependents = await storage.getCrossRepoDependents([
        "github.com/org/repo-b:pkg:class:target1",
      ]);
      expect(dependents.length).toBe(1);
    });

    it("cleans up edges when repo is removed", async () => {
      const edges: CrossRepoEdge[] = [
        {
          source_repo: "github.com/org/repo-a",
          source_entity_id: "github.com/org/repo-a:pkg:function:abc123",
          target_repo: "github.com/org/repo-b",
          target_entity_id: "github.com/org/repo-b:pkg:class:def456",
          edge_type: "IMPORTS",
        },
      ];

      await storage.addCrossRepoEdges(edges);
      await storage.removeCrossRepoEdges("github.com/org/repo-a");

      const dependents = await storage.getCrossRepoDependents([
        "github.com/org/repo-b:pkg:class:def456",
      ]);
      expect(dependents.length).toBe(0);
    });

    it("handles multiple edges from same source", async () => {
      const edges: CrossRepoEdge[] = [
        {
          source_repo: "github.com/org/repo-a",
          source_entity_id: "github.com/org/repo-a:pkg:function:source",
          target_repo: "github.com/org/repo-b",
          target_entity_id: "github.com/org/repo-b:pkg:class:target1",
          edge_type: "IMPORTS",
        },
        {
          source_repo: "github.com/org/repo-a",
          source_entity_id: "github.com/org/repo-a:pkg:function:source",
          target_repo: "github.com/org/repo-b",
          target_entity_id: "github.com/org/repo-b:pkg:class:target2",
          edge_type: "IMPORTS",
        },
        {
          source_repo: "github.com/org/repo-a",
          source_entity_id: "github.com/org/repo-a:pkg:function:source",
          target_repo: "github.com/org/repo-b",
          target_entity_id: "github.com/org/repo-b:pkg:class:target3",
          edge_type: "IMPORTS",
        },
      ];

      await storage.addCrossRepoEdges(edges);

      // All three targets should have the same source as a dependent
      const deps1 = await storage.getCrossRepoDependents([
        "github.com/org/repo-b:pkg:class:target1",
      ]);
      const deps2 = await storage.getCrossRepoDependents([
        "github.com/org/repo-b:pkg:class:target2",
      ]);
      const deps3 = await storage.getCrossRepoDependents([
        "github.com/org/repo-b:pkg:class:target3",
      ]);

      expect(deps1.length).toBe(1);
      expect(deps2.length).toBe(1);
      expect(deps3.length).toBe(1);
    });

    it("stores edge metadata", async () => {
      const edges: CrossRepoEdge[] = [
        {
          source_repo: "github.com/org/repo-a",
          source_entity_id: "github.com/org/repo-a:pkg:function:abc123",
          target_repo: "github.com/org/repo-b",
          target_entity_id: "github.com/org/repo-b:pkg:class:def456",
          edge_type: "IMPORTS",
          metadata: { version: "^1.0.0", aliased: true },
        },
      ];

      await storage.addCrossRepoEdges(edges);

      const retrieved = await storage.getCrossRepoDependents([
        "github.com/org/repo-b:pkg:class:def456",
      ]);
      expect(retrieved[0].metadata).toBeDefined();
      expect(retrieved[0].metadata?.version).toBe("^1.0.0");
    });
  });

  describe("query cache", () => {
    beforeEach(async () => {
      await storage.init();
    });

    it("caches query results", async () => {
      const queryHash = "query-hash-123";
      const result = { rows: [{ id: 1 }, { id: 2 }], count: 2 };

      await storage.cacheQuery(queryHash, result);

      const cached = await storage.getCachedQuery(queryHash);
      expect(cached).toEqual(result);
    });

    it("returns null for uncached queries", async () => {
      const cached = await storage.getCachedQuery("nonexistent-hash");
      expect(cached).toBeNull();
    });

    it("respects TTL for cached queries", async () => {
      const queryHash = "query-hash-ttl";
      const result = { rows: [], count: 0 };

      // Cache with 1ms TTL
      await storage.cacheQuery(queryHash, result, 0);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 50));

      const cached = await storage.getCachedQuery(queryHash);
      expect(cached).toBeNull();
    });

    it("clears all cache", async () => {
      await storage.cacheQuery("hash1", { data: 1 });
      await storage.cacheQuery("hash2", { data: 2 });
      await storage.cacheQuery("hash3", { data: 3 });

      await storage.clearCache();

      expect(await storage.getCachedQuery("hash1")).toBeNull();
      expect(await storage.getCachedQuery("hash2")).toBeNull();
      expect(await storage.getCachedQuery("hash3")).toBeNull();
    });

    it("updates existing cache entry", async () => {
      const queryHash = "update-hash";

      await storage.cacheQuery(queryHash, { version: 1 });
      await storage.cacheQuery(queryHash, { version: 2 });

      const cached = await storage.getCachedQuery(queryHash);
      expect(cached).toEqual({ version: 2 });
    });
  });

  describe("edge cases", () => {
    it("handles closing and reopening", async () => {
      await storage.init();
      await storage.addRepo({
        repo_id: "github.com/org/repo",
        local_path: "/path",
        manifest_hash: "hash",
        last_synced: new Date().toISOString(),
        status: "active",
      });

      await storage.close();

      // Reopen
      storage = createHubStorage(hubPath);
      await storage.init();

      const repos = await storage.listRepos();
      expect(repos.length).toBe(1);
    });

    it("handles special characters in repo IDs", async () => {
      await storage.init();

      const repo: RepoRegistration = {
        repo_id: "github.com/org/repo-with-special_chars.v2",
        local_path: "/path/to/repo's folder",
        manifest_hash: "hash",
        last_synced: new Date().toISOString(),
        status: "active",
      };

      await storage.addRepo(repo);

      const retrieved = await storage.getRepo("github.com/org/repo-with-special_chars.v2");
      expect(retrieved).toBeDefined();
      expect(retrieved?.local_path).toBe("/path/to/repo's folder");
    });

    it("handles empty edge list", async () => {
      await storage.init();

      await storage.addCrossRepoEdges([]);

      const edges = await storage.getCrossRepoDependents([]);
      expect(edges).toEqual([]);
    });

    it("handles removing non-existent repo", async () => {
      await storage.init();

      // Should not throw
      await storage.removeRepo("github.com/org/nonexistent");

      const repos = await storage.listRepos();
      expect(repos.length).toBe(0);
    });
  });
});
