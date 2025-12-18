/**
 * Affected Analyzer Tests for DevAC v2.0
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type AffectedAnalyzer, createAffectedAnalyzer } from "../src/hub/affected-analyzer.js";
import { type HubStorage, createHubStorage } from "../src/hub/hub-storage.js";

describe("AffectedAnalyzer", () => {
  let tempDir: string;
  let storage: HubStorage;
  let analyzer: AffectedAnalyzer;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-affected-test-"));
    const dbPath = path.join(tempDir, "central.duckdb");
    storage = createHubStorage(dbPath);
    await storage.init();
    analyzer = createAffectedAnalyzer(storage);
  });

  afterEach(async () => {
    await storage.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to set up repos and edges in storage
   */
  async function setupRepos(
    repos: Array<{
      repoId: string;
      localPath: string;
    }>
  ): Promise<void> {
    for (const repo of repos) {
      await storage.addRepo({
        repo_id: repo.repoId,
        local_path: repo.localPath,
        manifest_hash: "test-hash",
        last_synced: new Date().toISOString(),
        status: "active",
      });
    }
  }

  /**
   * Helper to set up cross-repo edges
   */
  async function setupEdges(
    edges: Array<{
      sourceRepo: string;
      sourceEntity: string;
      targetRepo: string;
      targetEntity: string;
      edgeType?: string;
    }>
  ): Promise<void> {
    await storage.addCrossRepoEdges(
      edges.map((e) => ({
        source_repo: e.sourceRepo,
        source_entity_id: e.sourceEntity,
        target_repo: e.targetRepo,
        target_entity_id: e.targetEntity,
        edge_type: e.edgeType || "IMPORTS",
        metadata: {},
      }))
    );
  }

  describe("basic analysis", () => {
    it("finds direct dependents within same repo", async () => {
      await setupRepos([{ repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" }]);

      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-a",
          sourceEntity: "github.com/org/repo-a:src/consumer.ts:function:useHelper",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/helper.ts:function:helper",
        },
      ]);

      const result = await analyzer.analyze([
        "github.com/org/repo-a:src/helper.ts:function:helper",
      ]);

      expect(result.changedEntities).toHaveLength(1);
      expect(result.affectedRepos).toHaveLength(1);
      expect(result.affectedRepos[0]?.repoId).toBe("github.com/org/repo-a");
      expect(result.affectedRepos[0]?.affectedEntities).toContain(
        "github.com/org/repo-a:src/consumer.ts:function:useHelper"
      );
    });

    it("finds cross-repo dependents via hub", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
      ]);

      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/app.ts:function:main",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/lib.ts:function:utility",
        },
      ]);

      const result = await analyzer.analyze(["github.com/org/repo-a:src/lib.ts:function:utility"]);

      expect(result.affectedRepos).toHaveLength(1);
      expect(result.affectedRepos[0]?.repoId).toBe("github.com/org/repo-b");
    });

    it("finds transitive dependents up to max depth", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
        { repoId: "github.com/org/repo-c", localPath: "/path/to/repo-c" },
      ]);

      // A -> B -> C dependency chain
      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/b.ts:function:b",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/a.ts:function:a",
        },
        {
          sourceRepo: "github.com/org/repo-c",
          sourceEntity: "github.com/org/repo-c:src/c.ts:function:c",
          targetRepo: "github.com/org/repo-b",
          targetEntity: "github.com/org/repo-b:src/b.ts:function:b",
        },
      ]);

      const result = await analyzer.analyze(["github.com/org/repo-a:src/a.ts:function:a"], {
        maxDepth: 10,
      });

      // Should find both B (direct) and C (transitive)
      expect(result.affectedRepos).toHaveLength(2);
      const repoIds = result.affectedRepos.map((r) => r.repoId);
      expect(repoIds).toContain("github.com/org/repo-b");
      expect(repoIds).toContain("github.com/org/repo-c");
    });

    it("respects maxDepth option", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
        { repoId: "github.com/org/repo-c", localPath: "/path/to/repo-c" },
      ]);

      // A -> B -> C dependency chain
      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/b.ts:function:b",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/a.ts:function:a",
        },
        {
          sourceRepo: "github.com/org/repo-c",
          sourceEntity: "github.com/org/repo-c:src/c.ts:function:c",
          targetRepo: "github.com/org/repo-b",
          targetEntity: "github.com/org/repo-b:src/b.ts:function:b",
        },
      ]);

      const result = await analyzer.analyze(["github.com/org/repo-a:src/a.ts:function:a"], {
        maxDepth: 1,
      });

      // Should only find B (direct), not C (transitive at depth 2)
      expect(result.affectedRepos).toHaveLength(1);
      expect(result.affectedRepos[0]?.repoId).toBe("github.com/org/repo-b");
    });
  });

  describe("grouping and impact level", () => {
    it("groups results by repository", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
      ]);

      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/consumer1.ts:function:c1",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/lib.ts:function:shared",
        },
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/consumer2.ts:function:c2",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/lib.ts:function:shared",
        },
      ]);

      const result = await analyzer.analyze(["github.com/org/repo-a:src/lib.ts:function:shared"]);

      expect(result.affectedRepos).toHaveLength(1);
      expect(result.affectedRepos[0]?.repoId).toBe("github.com/org/repo-b");
      expect(result.affectedRepos[0]?.affectedEntities).toHaveLength(2);
    });

    it("calculates impact level (direct/transitive)", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
        { repoId: "github.com/org/repo-c", localPath: "/path/to/repo-c" },
      ]);

      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/b.ts:function:b",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/a.ts:function:a",
        },
        {
          sourceRepo: "github.com/org/repo-c",
          sourceEntity: "github.com/org/repo-c:src/c.ts:function:c",
          targetRepo: "github.com/org/repo-b",
          targetEntity: "github.com/org/repo-b:src/b.ts:function:b",
        },
      ]);

      const result = await analyzer.analyze(["github.com/org/repo-a:src/a.ts:function:a"], {
        maxDepth: 10,
      });

      const repoB = result.affectedRepos.find((r) => r.repoId === "github.com/org/repo-b");
      const repoC = result.affectedRepos.find((r) => r.repoId === "github.com/org/repo-c");

      expect(repoB?.impactLevel).toBe("direct");
      expect(repoC?.impactLevel).toBe("transitive");
    });
  });

  describe("circular dependencies", () => {
    it("handles circular dependencies without infinite loop", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
      ]);

      // Circular: A -> B -> A
      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/b.ts:function:b",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/a.ts:function:a",
        },
        {
          sourceRepo: "github.com/org/repo-a",
          sourceEntity: "github.com/org/repo-a:src/a2.ts:function:a2",
          targetRepo: "github.com/org/repo-b",
          targetEntity: "github.com/org/repo-b:src/b.ts:function:b",
        },
      ]);

      // Should complete without timeout/stack overflow
      const result = await analyzer.analyze(["github.com/org/repo-a:src/a.ts:function:a"]);

      expect(result).toBeDefined();
      expect(result.analysisTimeMs).toBeDefined();
    });
  });

  describe("filtering options", () => {
    it("limits analysis to specified repos with includeRepos", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
        { repoId: "github.com/org/repo-c", localPath: "/path/to/repo-c" },
      ]);

      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/b.ts:function:b",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/a.ts:function:a",
        },
        {
          sourceRepo: "github.com/org/repo-c",
          sourceEntity: "github.com/org/repo-c:src/c.ts:function:c",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/a.ts:function:a",
        },
      ]);

      const result = await analyzer.analyze(["github.com/org/repo-a:src/a.ts:function:a"], {
        includeRepos: ["github.com/org/repo-b"],
      });

      expect(result.affectedRepos).toHaveLength(1);
      expect(result.affectedRepos[0]?.repoId).toBe("github.com/org/repo-b");
    });

    it("excludes specified repos with excludeRepos", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
        { repoId: "github.com/org/repo-c", localPath: "/path/to/repo-c" },
      ]);

      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/b.ts:function:b",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/a.ts:function:a",
        },
        {
          sourceRepo: "github.com/org/repo-c",
          sourceEntity: "github.com/org/repo-c:src/c.ts:function:c",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/a.ts:function:a",
        },
      ]);

      const result = await analyzer.analyze(["github.com/org/repo-a:src/a.ts:function:a"], {
        excludeRepos: ["github.com/org/repo-c"],
      });

      expect(result.affectedRepos).toHaveLength(1);
      expect(result.affectedRepos[0]?.repoId).toBe("github.com/org/repo-b");
    });
  });

  describe("file-based analysis", () => {
    it("analyzes file and finds affected entities", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
      ]);

      // Set up edges where entities in a file are depended upon
      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/consumer.ts:function:use",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/utils.ts:function:helper",
        },
      ]);

      const result = await analyzer.analyzeFile("src/utils.ts", "/path/to/repo-a");

      expect(result.affectedRepos).toHaveLength(1);
      expect(result.affectedRepos[0]?.repoId).toBe("github.com/org/repo-b");
    });
  });

  describe("result metadata", () => {
    it("returns analysis time in result", async () => {
      const result = await analyzer.analyze([]);

      expect(result.analysisTimeMs).toBeDefined();
      expect(typeof result.analysisTimeMs).toBe("number");
      expect(result.analysisTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("includes total affected count", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
      ]);

      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/c1.ts:function:c1",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/lib.ts:function:lib",
        },
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/c2.ts:function:c2",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/lib.ts:function:lib",
        },
      ]);

      const result = await analyzer.analyze(["github.com/org/repo-a:src/lib.ts:function:lib"]);

      expect(result.totalAffected).toBe(2);
    });

    it("returns empty result for no dependencies", async () => {
      const result = await analyzer.analyze(["github.com/org/nonexistent:path:kind:hash"]);

      expect(result.affectedRepos).toHaveLength(0);
      expect(result.totalAffected).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles empty entity list", async () => {
      const result = await analyzer.analyze([]);

      expect(result.changedEntities).toHaveLength(0);
      expect(result.affectedRepos).toHaveLength(0);
      expect(result.totalAffected).toBe(0);
    });

    it("handles multiple changed entities", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
      ]);

      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/c1.ts:function:c1",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/lib1.ts:function:lib1",
        },
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/c2.ts:function:c2",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/lib2.ts:function:lib2",
        },
      ]);

      const result = await analyzer.analyze([
        "github.com/org/repo-a:src/lib1.ts:function:lib1",
        "github.com/org/repo-a:src/lib2.ts:function:lib2",
      ]);

      expect(result.changedEntities).toHaveLength(2);
      expect(result.totalAffected).toBe(2);
    });

    it("deduplicates affected entities", async () => {
      await setupRepos([
        { repoId: "github.com/org/repo-a", localPath: "/path/to/repo-a" },
        { repoId: "github.com/org/repo-b", localPath: "/path/to/repo-b" },
      ]);

      // Same consumer depends on two different entities in repo-a
      await setupEdges([
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/consumer.ts:function:use",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/lib1.ts:function:lib1",
        },
        {
          sourceRepo: "github.com/org/repo-b",
          sourceEntity: "github.com/org/repo-b:src/consumer.ts:function:use",
          targetRepo: "github.com/org/repo-a",
          targetEntity: "github.com/org/repo-a:src/lib2.ts:function:lib2",
        },
      ]);

      const result = await analyzer.analyze([
        "github.com/org/repo-a:src/lib1.ts:function:lib1",
        "github.com/org/repo-a:src/lib2.ts:function:lib2",
      ]);

      // Should only count the consumer once
      expect(result.affectedRepos[0]?.affectedEntities).toHaveLength(1);
      expect(result.totalAffected).toBe(1);
    });
  });
});
