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
  type ValidationError,
  createHubStorage,
} from "../src/hub/hub-storage.js";

// CI environments need longer timeouts for timing-sensitive tests
const CI_TIMEOUT_MULTIPLIER = process.env.CI === "true" ? 3 : 1;

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
      expect(repos[0]?.repo_id).toBe("github.com/org/repo");
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
      expect(retrieved).toBeDefined();
      expect(new Date(retrieved?.last_synced ?? "").getTime()).toBeGreaterThan(
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
      expect(repos[0]?.local_path).toBe("/path/to/new");
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
      expect(retrieved[0]?.source_entity_id).toBe("github.com/org/repo-a:pkg:function:abc123");
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
      expect(retrieved[0]?.metadata).toBeDefined();
      expect(retrieved[0]?.metadata?.version).toBe("^1.0.0");
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

      // Cache with 0ms TTL (immediate expiry)
      await storage.cacheQuery(queryHash, result, 0);

      // Wait for expiry (longer in CI for timing consistency)
      await new Promise((resolve) => setTimeout(resolve, 50 * CI_TIMEOUT_MULTIPLIER));

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

  describe("validation errors", () => {
    beforeEach(async () => {
      await storage.init();
    });

    it("upserts validation errors", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "src/auth.ts",
          line: 42,
          column: 5,
          message: "Type 'string' is not assignable to type 'number'",
          severity: "error",
          source: "tsc",
          code: "TS2322",
        },
        {
          file: "src/auth.ts",
          line: 50,
          column: 10,
          message: "Unused variable 'x'",
          severity: "warning",
          source: "eslint",
          code: "no-unused-vars",
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "packages/api", errors);

      const retrieved = await storage.queryValidationErrors({});
      expect(retrieved.length).toBe(2);
      expect(retrieved[0]?.file).toBe("src/auth.ts");
      expect(retrieved[0]?.severity).toBe("error");
    });

    it("clears validation errors for a repo", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "src/index.ts",
          line: 10,
          column: 1,
          message: "Test error",
          severity: "error",
          source: "tsc",
          code: "TS1234",
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo-a", "pkg", errors);
      await storage.upsertValidationErrors("github.com/org/repo-b", "pkg", errors);

      await storage.clearValidationErrors("github.com/org/repo-a");

      const retrieved = await storage.queryValidationErrors({});
      expect(retrieved.length).toBe(1);
      expect(retrieved[0]?.repo_id).toBe("github.com/org/repo-b");
    });

    it("queries validation errors by severity", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "src/a.ts",
          line: 1,
          column: 1,
          message: "Error 1",
          severity: "error",
          source: "tsc",
          code: "TS1",
        },
        {
          file: "src/b.ts",
          line: 2,
          column: 2,
          message: "Warning 1",
          severity: "warning",
          source: "eslint",
          code: "warn1",
        },
        {
          file: "src/c.ts",
          line: 3,
          column: 3,
          message: "Error 2",
          severity: "error",
          source: "tsc",
          code: "TS2",
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "pkg", errors);

      const onlyErrors = await storage.queryValidationErrors({ severity: "error" });
      expect(onlyErrors.length).toBe(2);
      expect(onlyErrors.every((e) => e.severity === "error")).toBe(true);

      const onlyWarnings = await storage.queryValidationErrors({ severity: "warning" });
      expect(onlyWarnings.length).toBe(1);
      expect(onlyWarnings[0]?.severity).toBe("warning");
    });

    it("queries validation errors by source", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "src/a.ts",
          line: 1,
          column: 1,
          message: "TSC error",
          severity: "error",
          source: "tsc",
          code: "TS1",
        },
        {
          file: "src/b.ts",
          line: 2,
          column: 2,
          message: "ESLint warning",
          severity: "warning",
          source: "eslint",
          code: "rule1",
        },
        {
          file: "src/c.ts",
          line: 3,
          column: 3,
          message: "Test failure",
          severity: "error",
          source: "test",
          code: null,
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "pkg", errors);

      const tscErrors = await storage.queryValidationErrors({ source: "tsc" });
      expect(tscErrors.length).toBe(1);
      expect(tscErrors[0]?.source).toBe("tsc");

      const testErrors = await storage.queryValidationErrors({ source: "test" });
      expect(testErrors.length).toBe(1);
      expect(testErrors[0]?.source).toBe("test");
    });

    it("queries validation errors by file", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "src/auth.ts",
          line: 1,
          column: 1,
          message: "Error in auth",
          severity: "error",
          source: "tsc",
          code: "TS1",
        },
        {
          file: "src/auth.ts",
          line: 2,
          column: 2,
          message: "Another error in auth",
          severity: "error",
          source: "tsc",
          code: "TS2",
        },
        {
          file: "src/utils.ts",
          line: 3,
          column: 3,
          message: "Error in utils",
          severity: "error",
          source: "tsc",
          code: "TS3",
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "pkg", errors);

      const authErrors = await storage.queryValidationErrors({ file: "src/auth.ts" });
      expect(authErrors.length).toBe(2);
      expect(authErrors.every((e) => e.file === "src/auth.ts")).toBe(true);
    });

    it("queries validation errors by repo_id", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "src/index.ts",
          line: 1,
          column: 1,
          message: "Error",
          severity: "error",
          source: "tsc",
          code: "TS1",
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo-a", "pkg", errors);
      await storage.upsertValidationErrors("github.com/org/repo-b", "pkg", errors);

      const repoAErrors = await storage.queryValidationErrors({ repo_id: "github.com/org/repo-a" });
      expect(repoAErrors.length).toBe(1);
      expect(repoAErrors[0]?.repo_id).toBe("github.com/org/repo-a");
    });

    it("gets validation summary grouped by severity", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "a.ts",
          line: 1,
          column: 1,
          message: "E1",
          severity: "error",
          source: "tsc",
          code: "T1",
        },
        {
          file: "b.ts",
          line: 2,
          column: 2,
          message: "E2",
          severity: "error",
          source: "tsc",
          code: "T2",
        },
        {
          file: "c.ts",
          line: 3,
          column: 3,
          message: "W1",
          severity: "warning",
          source: "eslint",
          code: "L1",
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "pkg", errors);

      const summary = await storage.getValidationSummary("severity");
      expect(summary.length).toBe(2);

      const errorSummary = summary.find((s) => s.group_key === "error");
      const warningSummary = summary.find((s) => s.group_key === "warning");

      expect(errorSummary?.total_count).toBe(2);
      expect(warningSummary?.total_count).toBe(1);
    });

    it("gets validation summary grouped by source", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "a.ts",
          line: 1,
          column: 1,
          message: "E1",
          severity: "error",
          source: "tsc",
          code: "T1",
        },
        {
          file: "b.ts",
          line: 2,
          column: 2,
          message: "E2",
          severity: "error",
          source: "tsc",
          code: "T2",
        },
        {
          file: "c.ts",
          line: 3,
          column: 3,
          message: "E3",
          severity: "error",
          source: "eslint",
          code: "L1",
        },
        {
          file: "d.ts",
          line: 4,
          column: 4,
          message: "E4",
          severity: "error",
          source: "test",
          code: null,
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "pkg", errors);

      const summary = await storage.getValidationSummary("source");
      expect(summary.length).toBe(3);

      const tscSummary = summary.find((s) => s.group_key === "tsc");
      const eslintSummary = summary.find((s) => s.group_key === "eslint");
      const testSummary = summary.find((s) => s.group_key === "test");

      expect(tscSummary?.total_count).toBe(2);
      expect(eslintSummary?.total_count).toBe(1);
      expect(testSummary?.total_count).toBe(1);
    });

    it("gets validation counts", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "a.ts",
          line: 1,
          column: 1,
          message: "E1",
          severity: "error",
          source: "tsc",
          code: "T1",
        },
        {
          file: "b.ts",
          line: 2,
          column: 2,
          message: "E2",
          severity: "error",
          source: "tsc",
          code: "T2",
        },
        {
          file: "c.ts",
          line: 3,
          column: 3,
          message: "W1",
          severity: "warning",
          source: "eslint",
          code: "L1",
        },
        {
          file: "d.ts",
          line: 4,
          column: 4,
          message: "W2",
          severity: "warning",
          source: "eslint",
          code: "L2",
        },
        {
          file: "e.ts",
          line: 5,
          column: 5,
          message: "W3",
          severity: "warning",
          source: "eslint",
          code: "L3",
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "pkg", errors);

      const counts = await storage.getValidationCounts();
      expect(counts.errors).toBe(2);
      expect(counts.warnings).toBe(3);
      expect(counts.total).toBe(5);
    });

    it("returns empty counts when no errors exist", async () => {
      const counts = await storage.getValidationCounts();
      expect(counts.errors).toBe(0);
      expect(counts.warnings).toBe(0);
      expect(counts.total).toBe(0);
    });

    it("updates existing validation errors on upsert", async () => {
      const initialErrors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "src/auth.ts",
          line: 42,
          column: 5,
          message: "Initial message",
          severity: "error",
          source: "tsc",
          code: "TS2322",
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "pkg", initialErrors);

      const updatedErrors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "src/auth.ts",
          line: 42,
          column: 5,
          message: "Updated message",
          severity: "error",
          source: "tsc",
          code: "TS2322",
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "pkg", updatedErrors);

      const retrieved = await storage.queryValidationErrors({});
      expect(retrieved.length).toBe(1);
      expect(retrieved[0]?.message).toBe("Updated message");
    });

    it("handles empty error list", async () => {
      await storage.upsertValidationErrors("github.com/org/repo", "pkg", []);

      const retrieved = await storage.queryValidationErrors({});
      expect(retrieved.length).toBe(0);
    });

    it("handles null code values", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "src/test.ts",
          line: 1,
          column: 1,
          message: "Test failed: expected true to be false",
          severity: "error",
          source: "test",
          code: null,
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "pkg", errors);

      const retrieved = await storage.queryValidationErrors({});
      expect(retrieved.length).toBe(1);
      expect(retrieved[0]?.code).toBeNull();
    });

    it("queries with combined filters", async () => {
      const errors: Omit<ValidationError, "repo_id" | "package_path" | "updated_at">[] = [
        {
          file: "src/auth.ts",
          line: 1,
          column: 1,
          message: "E1",
          severity: "error",
          source: "tsc",
          code: "T1",
        },
        {
          file: "src/auth.ts",
          line: 2,
          column: 2,
          message: "W1",
          severity: "warning",
          source: "tsc",
          code: "T2",
        },
        {
          file: "src/utils.ts",
          line: 3,
          column: 3,
          message: "E2",
          severity: "error",
          source: "tsc",
          code: "T3",
        },
        {
          file: "src/auth.ts",
          line: 4,
          column: 4,
          message: "E3",
          severity: "error",
          source: "eslint",
          code: "L1",
        },
      ];

      await storage.upsertValidationErrors("github.com/org/repo", "pkg", errors);

      // Query errors in auth.ts from tsc
      const filtered = await storage.queryValidationErrors({
        file: "src/auth.ts",
        source: "tsc",
        severity: "error",
      });

      expect(filtered.length).toBe(1);
      expect(filtered[0]?.file).toBe("src/auth.ts");
      expect(filtered[0]?.source).toBe("tsc");
      expect(filtered[0]?.severity).toBe("error");
    });
  });
});
