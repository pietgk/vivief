// @ts-nocheck - TODO: Fix type mismatches with updated interfaces
/**
 * Seed Reader Tests
 *
 * Tests for seed-reader.ts - Query utilities for reading Parquet seed data
 */

import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SeedReader,
  createSeedReader,
  queryMultiplePackages,
} from "../../src/storage/seed-reader.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("../../src/types/config.js", () => ({
  getSeedPaths: vi.fn((packagePath: string, _branch: string) => ({
    seedRoot: `${packagePath}/.devac/seed`,
    basePath: `${packagePath}/.devac/seed/base`,
    branchPath: `${packagePath}/.devac/seed/branch`,
    nodesParquet: `${packagePath}/.devac/seed/base/nodes.parquet`,
    edgesParquet: `${packagePath}/.devac/seed/base/edges.parquet`,
    refsParquet: `${packagePath}/.devac/seed/base/external_refs.parquet`,
    effectsParquet: `${packagePath}/.devac/seed/base/effects.parquet`,
    metaJson: `${packagePath}/.devac/seed/meta.json`,
    lockFile: `${packagePath}/.devac/seed/.lock`,
  })),
}));
vi.mock("../../src/utils/atomic-write.js", () => ({
  fileExists: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../src/storage/duckdb-pool.js");
vi.mock("../../src/storage/parquet-schemas.js", () => ({
  getUnifiedQuery: vi.fn(
    (
      _tableName: string,
      basePath: string,
      branchPath: string,
      exists: { base: boolean; branch: boolean }
    ) => {
      if (exists.base && exists.branch) {
        return `SELECT * FROM '${basePath}' UNION ALL SELECT * FROM '${branchPath}'`;
      }
      if (exists.base) {
        return `SELECT * FROM '${basePath}'`;
      }
      if (exists.branch) {
        return `SELECT * FROM '${branchPath}'`;
      }
      return null;
    }
  ),
}));
vi.mock("../../src/storage/query-context.js", () => ({
  queryWithContext: vi.fn().mockResolvedValue({
    rows: [],
    rowCount: 0,
    timeMs: 10,
    packagesQueried: 1,
  }),
}));
vi.mock("../../src/storage/unified-query.js", () => ({
  query: vi.fn().mockResolvedValue({
    rows: [],
    rowCount: 0,
    timeMs: 10,
  }),
}));

const mockFs = vi.mocked(fs);
const { fileExists } = await import("../../src/utils/atomic-write.js");
const { executeWithRecovery } = await import("../../src/storage/duckdb-pool.js");
const { queryWithContext } = await import("../../src/storage/query-context.js");
const { query: unifiedQuery } = await import("../../src/storage/unified-query.js");

// Mock connection
const mockConnection = {
  all: vi.fn().mockResolvedValue([]),
};

// Mock pool
const mockPool = {} as Parameters<typeof createSeedReader>[0];

describe("SeedReader", () => {
  let reader: SeedReader;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up executeWithRecovery to call the function with mockConnection
    vi.mocked(executeWithRecovery).mockImplementation(async (_pool, fn) =>
      fn(mockConnection as unknown as Parameters<typeof fn>[0])
    );

    // Default file exists
    vi.mocked(fileExists).mockResolvedValue(true);

    reader = new SeedReader(mockPool, "/test/package");
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("readNodes", () => {
    it("reads all nodes from base branch", async () => {
      const mockNodes = [
        { entity_id: "node1", kind: "function" },
        { entity_id: "node2", kind: "class" },
      ];
      mockConnection.all.mockResolvedValueOnce(mockNodes);

      const result = await reader.readNodes();

      expect(result.rows).toEqual(mockNodes);
      expect(result.rowCount).toBe(2);
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });

    it("returns empty array when no parquet files exist", async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await reader.readNodes();

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it("reads nodes from specified branch", async () => {
      mockConnection.all.mockResolvedValueOnce([{ entity_id: "branch-node" }]);

      const result = await reader.readNodes("feature");

      expect(result.rows).toHaveLength(1);
    });
  });

  describe("readEdges", () => {
    it("reads all edges from base branch", async () => {
      const mockEdges = [
        { source_entity_id: "node1", target_entity_id: "node2", edge_type: "CALLS" },
      ];
      mockConnection.all.mockResolvedValueOnce(mockEdges);

      const result = await reader.readEdges();

      expect(result.rows).toEqual(mockEdges);
      expect(result.rowCount).toBe(1);
    });

    it("returns empty when no edges exist", async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await reader.readEdges();

      expect(result.rows).toEqual([]);
    });
  });

  describe("readExternalRefs", () => {
    it("reads all external references", async () => {
      const mockRefs = [{ module_specifier: "lodash", imported_symbol: "map" }];
      mockConnection.all.mockResolvedValueOnce(mockRefs);

      const result = await reader.readExternalRefs();

      expect(result.rows).toEqual(mockRefs);
      expect(result.rowCount).toBe(1);
    });
  });

  describe("querySeeds", () => {
    it("executes custom SQL query", async () => {
      const mockResult = [{ count: 42 }];
      mockConnection.all.mockResolvedValueOnce(mockResult);

      const result = await reader.querySeeds("SELECT COUNT(*) as count FROM nodes");

      expect(mockConnection.all).toHaveBeenCalledWith("SELECT COUNT(*) as count FROM nodes");
      expect(result.rows).toEqual(mockResult);
    });
  });

  describe("queryWithViews", () => {
    it("delegates to queryWithContext", async () => {
      vi.mocked(queryWithContext).mockResolvedValueOnce({
        rows: [{ id: 1 }],
        rowCount: 1,
        timeMs: 5,
        packagesQueried: 1,
      });

      const result = await reader.queryWithViews("SELECT * FROM nodes");

      expect(queryWithContext).toHaveBeenCalledWith(mockPool, {
        packagePath: "/test/package",
        sql: "SELECT * FROM nodes",
        branch: "base",
      });
      expect(result.rows).toEqual([{ id: 1 }]);
    });

    it("passes branch parameter", async () => {
      await reader.queryWithViews("SELECT * FROM nodes", "feature");

      expect(queryWithContext).toHaveBeenCalledWith(mockPool, {
        packagePath: "/test/package",
        sql: "SELECT * FROM nodes",
        branch: "feature",
      });
    });
  });

  describe("getNodesByIds", () => {
    it("returns empty array for empty input", async () => {
      const result = await reader.getNodesByIds([]);

      expect(result).toEqual([]);
      expect(mockConnection.all).not.toHaveBeenCalled();
    });

    it("queries nodes by entity IDs", async () => {
      const mockNodes = [{ entity_id: "node1" }];
      mockConnection.all.mockResolvedValueOnce(mockNodes);

      const result = await reader.getNodesByIds(["node1", "node2"]);

      expect(result).toEqual(mockNodes);
      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("entity_id IN ('node1', 'node2')")
      );
    });

    it("escapes single quotes in entity IDs", async () => {
      mockConnection.all.mockResolvedValueOnce([]);

      await reader.getNodesByIds(["node'with'quotes"]);

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("node''with''quotes")
      );
    });

    it("returns empty when no parquet files exist", async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await reader.getNodesByIds(["node1"]);

      expect(result).toEqual([]);
    });

    it("uses union query for branch with both base and branch files", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockConnection.all.mockResolvedValueOnce([]);

      await reader.getNodesByIds(["node1"], "feature");

      expect(mockConnection.all).toHaveBeenCalledWith(expect.stringContaining("UNION ALL"));
    });
  });

  describe("getNodesByFile", () => {
    it("queries nodes by file path", async () => {
      const mockNodes = [{ entity_id: "node1", file_path: "/test/file.ts" }];
      mockConnection.all.mockResolvedValueOnce(mockNodes);

      const result = await reader.getNodesByFile("/test/file.ts");

      expect(result).toEqual(mockNodes);
      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("file_path = '/test/file.ts'")
      );
    });

    it("escapes single quotes in file path", async () => {
      mockConnection.all.mockResolvedValueOnce([]);

      await reader.getNodesByFile("/test/file's.ts");

      expect(mockConnection.all).toHaveBeenCalledWith(expect.stringContaining("file''s.ts"));
    });

    it("returns empty when no files exist", async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await reader.getNodesByFile("/test/file.ts");

      expect(result).toEqual([]);
    });
  });

  describe("getEdgesBySource", () => {
    it("queries edges by source entity ID", async () => {
      const mockEdges = [{ source_entity_id: "node1", target_entity_id: "node2" }];
      mockConnection.all.mockResolvedValueOnce(mockEdges);

      const result = await reader.getEdgesBySource("node1");

      expect(result).toEqual(mockEdges);
      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("source_entity_id = 'node1'")
      );
    });

    it("returns empty when no files exist", async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await reader.getEdgesBySource("node1");

      expect(result).toEqual([]);
    });
  });

  describe("getEdgesByTarget", () => {
    it("queries edges by target entity ID", async () => {
      const mockEdges = [{ source_entity_id: "node1", target_entity_id: "node2" }];
      mockConnection.all.mockResolvedValueOnce(mockEdges);

      const result = await reader.getEdgesByTarget("node2");

      expect(result).toEqual(mockEdges);
      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("target_entity_id = 'node2'")
      );
    });
  });

  describe("getExternalRefsByFile", () => {
    it("queries refs by source file path", async () => {
      const mockRefs = [{ module_specifier: "lodash" }];
      mockConnection.all.mockResolvedValueOnce(mockRefs);

      const result = await reader.getExternalRefsByFile("/test/file.ts");

      expect(result).toEqual(mockRefs);
      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("source_file_path = '/test/file.ts'")
      );
    });
  });

  describe("getUnresolvedRefs", () => {
    it("queries unresolved external references", async () => {
      const mockRefs = [{ is_resolved: false }];
      mockConnection.all.mockResolvedValueOnce(mockRefs);

      const result = await reader.getUnresolvedRefs();

      expect(result).toEqual(mockRefs);
      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("is_resolved = false")
      );
    });
  });

  describe("getUnresolvedCallEdges", () => {
    it("returns unresolved CALLS edges", async () => {
      const mockRows = [
        {
          source_entity_id: "func1",
          target_entity_id: "unresolved:someFunc",
          source_file_path: "/test.ts",
          source_line: 10,
          source_column: 5,
          properties: JSON.stringify({ callee: "someFunc" }),
        },
      ];
      mockConnection.all.mockResolvedValueOnce(mockRows);

      const result = await reader.getUnresolvedCallEdges();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sourceEntityId: "func1",
        targetEntityId: "unresolved:someFunc",
        sourceFilePath: "/test.ts",
        sourceLine: 10,
        sourceColumn: 5,
        calleeName: "someFunc",
      });
    });

    it("handles properties as object", async () => {
      const mockRows = [
        {
          source_entity_id: "func1",
          target_entity_id: "unresolved:test",
          source_file_path: "/test.ts",
          source_line: 1,
          source_column: 1,
          properties: { callee: "test" },
        },
      ];
      mockConnection.all.mockResolvedValueOnce(mockRows);

      const result = await reader.getUnresolvedCallEdges();

      expect(result[0].calleeName).toBe("test");
    });

    it("handles invalid JSON properties", async () => {
      const mockRows = [
        {
          source_entity_id: "func1",
          target_entity_id: "unresolved:test",
          source_file_path: "/test.ts",
          source_line: 1,
          source_column: 1,
          properties: "invalid json",
        },
      ];
      mockConnection.all.mockResolvedValueOnce(mockRows);

      const result = await reader.getUnresolvedCallEdges();

      expect(result[0].calleeName).toBe("");
    });

    it("returns empty when no files exist", async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await reader.getUnresolvedCallEdges();

      expect(result).toEqual([]);
    });
  });

  describe("getUnresolvedExtendsEdges", () => {
    it("returns unresolved EXTENDS edges", async () => {
      const mockRows = [
        {
          source_entity_id: "class1",
          target_entity_id: "unresolved:BaseClass",
          source_file_path: "/test.ts",
          source_line: 5,
          source_column: 1,
          properties: JSON.stringify({ sourceKind: "class" }),
        },
      ];
      mockConnection.all.mockResolvedValueOnce(mockRows);

      const result = await reader.getUnresolvedExtendsEdges();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sourceEntityId: "class1",
        targetEntityId: "unresolved:BaseClass",
        sourceFilePath: "/test.ts",
        sourceLine: 5,
        sourceColumn: 1,
        targetName: "BaseClass",
        sourceKind: "class",
      });
    });

    it("defaults sourceKind to class", async () => {
      const mockRows = [
        {
          source_entity_id: "class1",
          target_entity_id: "unresolved:Base",
          source_file_path: "/test.ts",
          source_line: 1,
          source_column: 1,
          properties: "{}",
        },
      ];
      mockConnection.all.mockResolvedValueOnce(mockRows);

      const result = await reader.getUnresolvedExtendsEdges();

      expect(result[0].sourceKind).toBe("class");
    });
  });

  describe("getFileHashes", () => {
    it("returns map of file paths to hashes", async () => {
      const mockRows = [
        { file_path: "/test/a.ts", source_file_hash: "hash1" },
        { file_path: "/test/b.ts", source_file_hash: "hash2" },
      ];
      mockConnection.all.mockResolvedValueOnce(mockRows);

      const result = await reader.getFileHashes();

      expect(result.get("/test/a.ts")).toBe("hash1");
      expect(result.get("/test/b.ts")).toBe("hash2");
    });

    it("returns empty map when no file exists", async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await reader.getFileHashes();

      expect(result.size).toBe(0);
    });
  });

  describe("validateIntegrity", () => {
    it("returns valid result for healthy seeds", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ schemaVersion: "1.0.0" }));

      // Mock node stats
      mockConnection.all
        .mockResolvedValueOnce([{ count: 100, files: 10 }]) // nodes
        .mockResolvedValueOnce([{ count: 50 }]) // edges
        .mockResolvedValueOnce([{ count: 0 }]) // orphaned edges
        .mockResolvedValueOnce([{ total: 20, unresolved: 5 }]); // refs

      const result = await reader.validateIntegrity();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.stats.nodeCount).toBe(100);
      expect(result.stats.edgeCount).toBe(50);
      expect(result.stats.refCount).toBe(20);
      expect(result.stats.fileCount).toBe(10);
      expect(result.stats.unresolvedRefs).toBe(5);
    });

    it("reports warning when nodes.parquet missing", async () => {
      vi.mocked(fileExists).mockImplementation(async (path) => {
        return !String(path).includes("nodes.parquet");
      });
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ schemaVersion: "1.0.0" }));
      mockConnection.all.mockResolvedValue([{ count: 0 }]);

      const result = await reader.validateIntegrity();

      expect(result.warnings).toContain("nodes.parquet does not exist");
    });

    it("reports warning when meta.json missing", async () => {
      vi.mocked(fileExists).mockImplementation(async (path) => {
        return !String(path).includes("meta.json");
      });
      mockConnection.all.mockResolvedValue([{ count: 0, files: 0 }]);

      const result = await reader.validateIntegrity();

      expect(result.warnings).toContain("meta.json does not exist");
    });

    it("reports error when meta.json invalid", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockFs.readFile.mockResolvedValueOnce("invalid json");
      mockConnection.all.mockResolvedValue([{ count: 0, files: 0 }]);

      const result = await reader.validateIntegrity();

      expect(result.errors.some((e) => e.includes("Invalid meta.json"))).toBe(true);
    });

    it("reports error when meta.json missing schemaVersion", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ name: "test" }));
      mockConnection.all.mockResolvedValue([{ count: 0, files: 0 }]);

      const result = await reader.validateIntegrity();

      expect(result.errors).toContain("meta.json missing schemaVersion");
    });

    it("reports orphaned edges warning", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ schemaVersion: "1.0.0" }));

      mockConnection.all
        .mockResolvedValueOnce([{ count: 100, files: 10 }])
        .mockResolvedValueOnce([{ count: 50 }])
        .mockResolvedValueOnce([{ count: 5 }]) // 5 orphaned edges
        .mockResolvedValueOnce([{ total: 0, unresolved: 0 }]);

      const result = await reader.validateIntegrity();

      expect(result.warnings.some((w) => w.includes("5 edges with missing source nodes"))).toBe(
        true
      );
      expect(result.stats.orphanedEdges).toBe(5);
    });

    it("handles query errors gracefully", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ schemaVersion: "1.0.0" }));
      mockConnection.all.mockRejectedValueOnce(new Error("Query failed"));

      const result = await reader.validateIntegrity();

      expect(result.errors.some((e) => e.includes("Failed to read nodes.parquet"))).toBe(true);
    });
  });

  describe("getStats", () => {
    it("returns stats from validateIntegrity", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ schemaVersion: "1.0.0" }));
      mockConnection.all
        .mockResolvedValueOnce([{ count: 50, files: 5 }])
        .mockResolvedValueOnce([{ count: 25 }])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ total: 10, unresolved: 2 }]);

      const stats = await reader.getStats();

      expect(stats.nodeCount).toBe(50);
      expect(stats.edgeCount).toBe(25);
      expect(stats.fileCount).toBe(5);
    });
  });
});

describe("createSeedReader", () => {
  it("creates a SeedReader instance", () => {
    const reader = createSeedReader(mockPool, "/test/package");
    expect(reader).toBeInstanceOf(SeedReader);
  });
});

describe("queryMultiplePackages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(unifiedQuery).mockResolvedValue({
      rows: [{ count: 10 }],
      rowCount: 1,
      timeMs: 5,
    });
  });

  it("replaces placeholder syntax with view names", async () => {
    await queryMultiplePackages(
      mockPool,
      ["/pkg1", "/pkg2"],
      "SELECT * FROM {nodes} WHERE kind = 'function'"
    );

    expect(unifiedQuery).toHaveBeenCalledWith(mockPool, {
      packages: ["/pkg1", "/pkg2"],
      sql: "SELECT * FROM nodes WHERE kind = 'function'",
      branch: "base",
    });
  });

  it("replaces all placeholder types", async () => {
    await queryMultiplePackages(
      mockPool,
      ["/pkg"],
      "SELECT * FROM {nodes} JOIN {edges} ON {nodes}.entity_id = {edges}.source_entity_id"
    );

    expect(unifiedQuery).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        sql: "SELECT * FROM nodes JOIN edges ON nodes.entity_id = edges.source_entity_id",
      })
    );
  });

  it("passes branch parameter", async () => {
    await queryMultiplePackages(mockPool, ["/pkg"], "SELECT * FROM {nodes}", "feature");

    expect(unifiedQuery).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        branch: "feature",
      })
    );
  });

  it("returns result in legacy format", async () => {
    const result = await queryMultiplePackages(mockPool, ["/pkg"], "SELECT * FROM {nodes}");

    expect(result).toEqual({
      rows: [{ count: 10 }],
      rowCount: 1,
      timeMs: 5,
    });
  });
});
