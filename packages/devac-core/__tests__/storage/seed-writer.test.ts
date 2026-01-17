// @ts-nocheck - TODO: Fix type mismatches with updated interfaces
/**
 * Tests for seed-writer.ts
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock dependencies before imports
vi.mock("node:fs/promises");
vi.mock("node:crypto");
vi.mock("../../src/storage/duckdb-pool.js");
vi.mock("../../src/storage/file-lock.js");
vi.mock("../../src/storage/parquet-schemas.js");
vi.mock("../../src/types/config.js");
vi.mock("../../src/utils/atomic-write.js");

import type { StructuralParseResult } from "../../src/parsers/parser-interface.js";
import { executeWithRecovery } from "../../src/storage/duckdb-pool.js";
import { withSeedLock } from "../../src/storage/file-lock.js";
import { getCopyToParquet, initializeSchemas } from "../../src/storage/parquet-schemas.js";
import { SeedWriter, createSeedWriter } from "../../src/storage/seed-writer.js";
import { getSeedPaths } from "../../src/types/config.js";
import { fileExists } from "../../src/utils/atomic-write.js";

describe("SeedWriter", () => {
  const mockPackagePath = "/test/package";
  const mockPool = {} as Parameters<typeof createSeedWriter>[0];
  const mockConnection = {
    run: vi.fn(),
    all: vi.fn(),
  };
  const mockDirHandle = {
    sync: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(getSeedPaths).mockReturnValue({
      seedRoot: "/test/package/.devac",
      seedDir: "/test/package/.devac",
      basePath: "/test/package/.devac/base",
      branchPath: "/test/package/.devac/branches/feature",
      metaJson: "/test/package/.devac/base/meta.json",
      nodesParquet: "/test/package/.devac/base/nodes.parquet",
      edgesParquet: "/test/package/.devac/base/edges.parquet",
      externalRefsParquet: "/test/package/.devac/base/external_refs.parquet",
      effectsParquet: "/test/package/.devac/base/effects.parquet",
      fileHashesParquet: "/test/package/.devac/base/file_hashes.parquet",
    });

    vi.mocked(executeWithRecovery).mockImplementation(async (_pool, fn) =>
      fn(mockConnection as unknown as Parameters<typeof fn>[0])
    );

    vi.mocked(withSeedLock).mockImplementation(async (_path, fn) => fn());

    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockResolvedValue([]);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
    vi.mocked(fs.rmdir).mockResolvedValue(undefined);
    vi.mocked(fs.open).mockResolvedValue(mockDirHandle as unknown as fs.FileHandle);

    vi.mocked(crypto.randomBytes).mockReturnValue(Buffer.from("abcd1234"));

    vi.mocked(initializeSchemas).mockResolvedValue(undefined);
    vi.mocked(getCopyToParquet).mockReturnValue("COPY nodes TO '/tmp/nodes.parquet'");
    vi.mocked(fileExists).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("writeFile", () => {
    test("writes structural parse result to Parquet files", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result: StructuralParseResult = {
        nodes: [createMockNode()],
        edges: [createMockEdge()],
        externalRefs: [createMockExternalRef()],
        effects: [createMockEffect()],
        errors: [],
        fileHash: "abc123",
        parseTimeMs: 100,
      };

      const writeResult = await writer.writeFile(result);

      expect(writeResult.success).toBe(true);
      expect(writeResult.nodesWritten).toBe(1);
      expect(writeResult.edgesWritten).toBe(1);
      expect(writeResult.refsWritten).toBe(1);
      expect(writeResult.effectsWritten).toBe(1);
      expect(writeResult.filesProcessed).toBe(1);
      expect(writeResult.timeMs).toBeGreaterThanOrEqual(0);
    });

    test("ensures directories exist before writing", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result = createEmptyResult();

      await writer.writeFile(result);

      expect(fs.mkdir).toHaveBeenCalledWith("/test/package/.devac/base", {
        recursive: true,
      });
    });

    test("acquires seed lock during write", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result = createEmptyResult();

      await writer.writeFile(result);

      expect(withSeedLock).toHaveBeenCalledWith("/test/package/.devac", expect.any(Function));
    });

    test("writes to branch partition when branch specified", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result = createEmptyResult();

      vi.mocked(getSeedPaths).mockReturnValue({
        seedRoot: "/test/package/.devac",
        seedDir: "/test/package/.devac",
        basePath: "/test/package/.devac/base",
        branchPath: "/test/package/.devac/branches/feature",
        metaJson: "/test/package/.devac/branches/feature/meta.json",
        nodesParquet: "/test/package/.devac/branches/feature/nodes.parquet",
        edgesParquet: "/test/package/.devac/branches/feature/edges.parquet",
        externalRefsParquet: "/test/package/.devac/branches/feature/external_refs.parquet",
        effectsParquet: "/test/package/.devac/branches/feature/effects.parquet",
        fileHashesParquet: "/test/package/.devac/branches/feature/file_hashes.parquet",
      });

      await writer.writeFile(result, { branch: "feature" });

      expect(getSeedPaths).toHaveBeenCalledWith(mockPackagePath, "feature");
    });

    test("returns error result on failure", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result = createEmptyResult();

      vi.mocked(fs.mkdir).mockRejectedValue(new Error("Permission denied"));

      const writeResult = await writer.writeFile(result);

      expect(writeResult.success).toBe(false);
      expect(writeResult.error).toBe("Permission denied");
    });

    test("initializes schemas before inserting data", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result: StructuralParseResult = {
        nodes: [createMockNode()],
        edges: [],
        externalRefs: [],
        effects: [],
        errors: [],
        fileHash: "abc123",
        parseTimeMs: 100,
      };

      await writer.writeFile(result);

      expect(initializeSchemas).toHaveBeenCalledWith(mockConnection);
    });

    test("writes meta.json with schema version", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result: StructuralParseResult = {
        nodes: [createMockNode()],
        edges: [],
        externalRefs: [],
        effects: [],
        errors: [],
        fileHash: "abc123",
        parseTimeMs: 100,
      };

      await writer.writeFile(result);

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/package/.devac/base/meta.json.tmp",
        expect.stringContaining("schemaVersion")
      );
    });

    test("cleans up temp directory after write", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result: StructuralParseResult = {
        nodes: [createMockNode()],
        edges: [],
        externalRefs: [],
        effects: [],
        errors: [],
        fileHash: "abc123",
        parseTimeMs: 100,
      };

      vi.mocked(fs.readdir).mockResolvedValue(["temp_file.parquet"] as unknown as fs.Dirent[]);

      await writer.writeFile(result);

      expect(fs.readdir).toHaveBeenCalled();
    });
  });

  describe("deleteFile", () => {
    test("rewrites excluding specified files for base branch", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(fileExists).mockResolvedValue(true);
      mockConnection.all.mockResolvedValue([]);

      const result = await writer.deleteFile(["/test/file.ts"]);

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(1);
    });

    test("marks files as deleted for feature branch", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(fileExists).mockResolvedValue(true);
      mockConnection.all.mockResolvedValue([]);

      const result = await writer.deleteFile(["/test/file.ts"], {
        branch: "feature",
      });

      expect(result.success).toBe(true);
    });

    test("returns error on failure", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(withSeedLock).mockRejectedValue(new Error("Lock timeout"));

      const result = await writer.deleteFile(["/test/file.ts"], {
        branch: "feature",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Lock timeout");
    });
  });

  describe("updateResolvedRefs", () => {
    test("returns early with empty input", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      const result = await writer.updateResolvedRefs([]);

      expect(result.success).toBe(true);
      expect(result.refsUpdated).toBe(0);
      expect(withSeedLock).not.toHaveBeenCalled();
    });

    test("updates resolved references", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(fileExists).mockResolvedValue(true);
      mockConnection.all.mockResolvedValue([
        {
          source_entity_id: "entity1",
          module_specifier: "./module",
          imported_symbol: "foo",
          local_alias: "foo",
          import_style: "named",
          is_type_only: false,
          source_file_path: "/test/file.ts",
          source_line: 1,
          source_column: 0,
          target_entity_id: null,
          is_resolved: false,
          is_reexport: false,
          export_alias: null,
          source_file_hash: "hash123",
          branch: "base",
          is_deleted: false,
        },
      ]);

      const result = await writer.updateResolvedRefs([
        {
          sourceEntityId: "entity1",
          moduleSpecifier: "./module",
          importedSymbol: "foo",
          targetEntityId: "resolved-entity",
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.refsUpdated).toBe(1);
    });

    test("returns 0 when refs file does not exist", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await writer.updateResolvedRefs([
        {
          sourceEntityId: "entity1",
          moduleSpecifier: "./module",
          importedSymbol: "foo",
          targetEntityId: "resolved-entity",
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.refsUpdated).toBe(0);
    });

    test("returns error on failure", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(withSeedLock).mockRejectedValue(new Error("Lock error"));

      const result = await writer.updateResolvedRefs([
        {
          sourceEntityId: "entity1",
          moduleSpecifier: "./module",
          importedSymbol: "foo",
          targetEntityId: "resolved-entity",
        },
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Lock error");
    });
  });

  describe("updateResolvedCallEdges", () => {
    test("returns early with empty input", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      const result = await writer.updateResolvedCallEdges([]);

      expect(result.success).toBe(true);
      expect(result.edgesUpdated).toBe(0);
      expect(withSeedLock).not.toHaveBeenCalled();
    });

    test("updates resolved CALLS edges", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(fileExists).mockResolvedValue(true);
      mockConnection.all.mockResolvedValue([
        {
          source_entity_id: "caller",
          target_entity_id: "unresolved:foo",
          edge_type: "CALLS",
          source_file_path: "/test/file.ts",
          source_line: 10,
          source_column: 5,
          properties: "{}",
          source_file_hash: "hash123",
          branch: "base",
          is_deleted: false,
        },
      ]);

      const result = await writer.updateResolvedCallEdges([
        {
          sourceEntityId: "caller",
          oldTargetEntityId: "unresolved:foo",
          newTargetEntityId: "resolved-target",
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.edgesUpdated).toBe(1);
    });

    test("preserves non-CALLS edges", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(fileExists).mockResolvedValue(true);
      mockConnection.all.mockResolvedValue([
        {
          source_entity_id: "entity1",
          target_entity_id: "entity2",
          edge_type: "CONTAINS",
          source_file_path: "/test/file.ts",
          source_line: 1,
          source_column: 0,
          properties: "{}",
          source_file_hash: "hash123",
          branch: "base",
          is_deleted: false,
        },
      ]);

      const result = await writer.updateResolvedCallEdges([
        {
          sourceEntityId: "caller",
          oldTargetEntityId: "unresolved:foo",
          newTargetEntityId: "resolved-target",
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.edgesUpdated).toBe(0);
    });

    test("returns 0 when edges file does not exist", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await writer.updateResolvedCallEdges([
        {
          sourceEntityId: "caller",
          oldTargetEntityId: "unresolved:foo",
          newTargetEntityId: "resolved-target",
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.edgesUpdated).toBe(0);
    });

    test("returns error on failure", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(withSeedLock).mockRejectedValue(new Error("Lock error"));

      const result = await writer.updateResolvedCallEdges([
        {
          sourceEntityId: "caller",
          oldTargetEntityId: "unresolved:foo",
          newTargetEntityId: "resolved-target",
        },
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Lock error");
    });
  });

  describe("updateResolvedExtendsEdges", () => {
    test("returns early with empty input", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      const result = await writer.updateResolvedExtendsEdges([]);

      expect(result.success).toBe(true);
      expect(result.edgesUpdated).toBe(0);
      expect(withSeedLock).not.toHaveBeenCalled();
    });

    test("updates resolved EXTENDS edges", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(fileExists).mockResolvedValue(true);
      mockConnection.all.mockResolvedValue([
        {
          source_entity_id: "child-class",
          target_entity_id: "unresolved:ParentClass",
          edge_type: "EXTENDS",
          source_file_path: "/test/file.ts",
          source_line: 10,
          source_column: 5,
          properties: "{}",
          source_file_hash: "hash123",
          branch: "base",
          is_deleted: false,
        },
      ]);

      const result = await writer.updateResolvedExtendsEdges([
        {
          sourceEntityId: "child-class",
          oldTargetEntityId: "unresolved:ParentClass",
          newTargetEntityId: "resolved-parent",
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.edgesUpdated).toBe(1);
    });

    test("returns 0 when edges file does not exist", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await writer.updateResolvedExtendsEdges([
        {
          sourceEntityId: "child-class",
          oldTargetEntityId: "unresolved:ParentClass",
          newTargetEntityId: "resolved-parent",
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.edgesUpdated).toBe(0);
    });

    test("returns error on failure", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(withSeedLock).mockRejectedValue(new Error("Lock error"));

      const result = await writer.updateResolvedExtendsEdges([
        {
          sourceEntityId: "child-class",
          oldTargetEntityId: "unresolved:ParentClass",
          newTargetEntityId: "resolved-parent",
        },
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Lock error");
    });
  });

  describe("updateFile", () => {
    test("merges and writes for base branch", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result: StructuralParseResult = {
        nodes: [createMockNode()],
        edges: [],
        externalRefs: [],
        effects: [],
        errors: [],
        fileHash: "abc123",
        parseTimeMs: 100,
      };

      vi.mocked(fileExists).mockResolvedValue(true);
      mockConnection.all
        .mockResolvedValueOnce([]) // existing nodes
        .mockResolvedValueOnce([]) // existing edges
        .mockResolvedValueOnce([]) // existing refs
        .mockResolvedValueOnce([{ count: 1n }]) // node count
        .mockResolvedValueOnce([{ count: 0n }]) // edge count
        .mockResolvedValueOnce([{ count: 0n }]) // ref count
        .mockResolvedValueOnce([{ count: 0n }]); // effect count

      const updateResult = await writer.updateFile(["/test/changed.ts"], result);

      expect(updateResult.success).toBe(true);
      expect(updateResult.nodesWritten).toBe(1);
    });

    test("writes delta directly for feature branch", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result: StructuralParseResult = {
        nodes: [createMockNode()],
        edges: [],
        externalRefs: [],
        effects: [],
        errors: [],
        fileHash: "abc123",
        parseTimeMs: 100,
      };

      const updateResult = await writer.updateFile(["/test/changed.ts"], result, {
        branch: "feature",
      });

      expect(updateResult.success).toBe(true);
    });

    test("returns error on failure", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result = createEmptyResult();

      vi.mocked(withSeedLock).mockRejectedValue(new Error("Update failed"));

      const updateResult = await writer.updateFile(["/test/changed.ts"], result);

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBe("Update failed");
    });
  });

  describe("createSeedWriter", () => {
    test("creates a SeedWriter instance", () => {
      const writer = createSeedWriter(mockPool, mockPackagePath);

      expect(writer).toBeInstanceOf(SeedWriter);
    });
  });

  describe("atomic operations", () => {
    test("uses temp file + rename pattern", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result: StructuralParseResult = {
        nodes: [createMockNode()],
        edges: [],
        externalRefs: [],
        effects: [],
        errors: [],
        fileHash: "abc123",
        parseTimeMs: 100,
      };

      await writer.writeFile(result);

      // Should create temp directory
      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining(".tmp"), {
        recursive: true,
      });

      // Should rename temp files to final locations
      expect(fs.rename).toHaveBeenCalled();
    });

    test("syncs directory after rename", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);
      const result: StructuralParseResult = {
        nodes: [createMockNode()],
        edges: [],
        externalRefs: [],
        effects: [],
        errors: [],
        fileHash: "abc123",
        parseTimeMs: 100,
      };

      await writer.writeFile(result);

      // Should open directory and sync for durability
      expect(fs.open).toHaveBeenCalled();
      expect(mockDirHandle.sync).toHaveBeenCalled();
      expect(mockDirHandle.close).toHaveBeenCalled();
    });
  });

  describe("SQL escaping", () => {
    test("escapes single quotes in file paths for rewrite", async () => {
      const writer = new SeedWriter(mockPool, mockPackagePath);

      vi.mocked(fileExists).mockResolvedValue(true);
      mockConnection.all.mockResolvedValue([]);

      await writer.deleteFile(["/test/file's.ts"]);

      // The SQL should escape single quotes (single quote becomes two single quotes)
      expect(mockConnection.all).toHaveBeenCalledWith(expect.stringContaining("file''s.ts"));
    });
  });
});

// Helper functions
function createEmptyResult(): StructuralParseResult {
  return {
    nodes: [],
    edges: [],
    externalRefs: [],
    effects: [],
    errors: [],
    fileHash: "empty",
    parseTimeMs: 0,
  };
}

function createMockNode() {
  return {
    entity_id: "node-1",
    name: "TestFunction",
    qualified_name: "test.TestFunction",
    kind: "function" as const,
    file_path: "/test/file.ts",
    start_line: 1,
    end_line: 10,
    start_column: 0,
    end_column: 1,
    is_exported: true,
    is_default_export: false,
    visibility: "public" as const,
    is_async: false,
    is_generator: false,
    is_static: false,
    is_abstract: false,
    type_signature: "() => void",
    documentation: null,
    decorators: [],
    type_parameters: [],
    properties: {},
    source_file_hash: "hash123",
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
  };
}

function createMockEdge() {
  return {
    source_entity_id: "node-1",
    target_entity_id: "node-2",
    edge_type: "CALLS" as const,
    source_file_path: "/test/file.ts",
    source_line: 5,
    source_column: 10,
    properties: {},
    source_file_hash: "hash123",
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
  };
}

function createMockExternalRef() {
  return {
    source_entity_id: "node-1",
    module_specifier: "./other",
    imported_symbol: "helper",
    local_alias: "helper",
    import_style: "named" as const,
    is_type_only: false,
    source_file_path: "/test/file.ts",
    source_line: 1,
    source_column: 0,
    target_entity_id: null,
    is_resolved: false,
    is_reexport: false,
    export_alias: null,
    source_file_hash: "hash123",
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
  };
}

function createMockEffect() {
  return {
    effect_id: "effect-1",
    effect_type: "FunctionCall" as const,
    timestamp: new Date().toISOString(),
    source_entity_id: "node-1",
    source_file_path: "/test/file.ts",
    source_line: 5,
    source_column: 10,
    branch: "base",
    properties: {},
    target_entity_id: "node-2",
    callee_name: "doSomething",
    callee_qualified_name: "module.doSomething",
    is_method_call: false,
    is_async: false,
    is_constructor: false,
    argument_count: 0,
    is_external: false,
    external_module: null,
  };
}
