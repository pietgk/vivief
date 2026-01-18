/**
 * Effect Writer Tests
 *
 * Tests for effect-writer.ts - atomic Parquet writes for effects
 */

import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EffectWriter, createEffectWriter } from "../../src/storage/effect-writer.js";
import type { CodeEffect } from "../../src/types/index.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("../../src/types/config.js", () => ({
  getSeedPaths: vi.fn((packagePath: string, branch: string) => ({
    seedRoot: `${packagePath}/.devac/seed`,
    basePath: `${packagePath}/.devac/seed/base`,
    branchPath: `${packagePath}/.devac/seed/branch`,
    effectsParquet:
      branch === "base"
        ? `${packagePath}/.devac/seed/base/effects.parquet`
        : `${packagePath}/.devac/seed/branch/effects.parquet`,
  })),
}));
vi.mock("../../src/storage/file-lock.js");
vi.mock("../../src/storage/duckdb-pool.js");
vi.mock("../../src/storage/parquet-schemas.js", () => ({
  EFFECTS_SCHEMA: "CREATE TABLE IF NOT EXISTS effects (...)",
  getCopyToParquet: vi.fn(
    (table: string, path: string) => `COPY ${table} TO '${path}' (FORMAT PARQUET)`
  ),
}));

const mockFs = vi.mocked(fs);
const { withSeedLock } = await import("../../src/storage/file-lock.js");
const { executeWithRecovery } = await import("../../src/storage/duckdb-pool.js");

// Mock DuckDB connection
const mockStatement = {
  run: vi.fn().mockResolvedValue(undefined),
  finalize: vi.fn().mockResolvedValue(undefined),
};

const mockConnection = {
  run: vi.fn().mockResolvedValue(undefined),
  all: vi.fn().mockResolvedValue([{ count: 0 }]),
  prepare: vi.fn().mockResolvedValue(mockStatement),
};

// Mock DuckDB pool
const mockPool = {
  getConnection: vi.fn().mockResolvedValue(mockConnection),
  releaseConnection: vi.fn(),
};

// Sample effect for testing
const createSampleEffect = (overrides: Partial<CodeEffect> = {}): CodeEffect =>
  ({
    effect_id: "eff-123",
    effect_type: "FunctionCall",
    timestamp: "2024-01-15T10:00:00.000Z",
    source_entity_id: "func-1",
    source_file_path: "/test/file.ts",
    source_line: 10,
    source_column: 5,
    properties: {},
    target_entity_id: "func-2",
    callee_name: "doSomething",
    callee_qualified_name: "module.doSomething",
    is_method_call: false,
    is_async: true,
    is_constructor: false,
    argument_count: 2,
    is_external: false,
    external_module: null,
    ...overrides,
  }) as CodeEffect;

describe("EffectWriter", () => {
  let writer: EffectWriter;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock connection state
    mockConnection.run.mockResolvedValue(undefined);
    mockConnection.all.mockResolvedValue([{ count: 0 }]);
    mockConnection.prepare.mockResolvedValue(mockStatement);
    mockStatement.run.mockResolvedValue(undefined);
    mockStatement.finalize.mockResolvedValue(undefined);

    // Set up withSeedLock to call the function
    vi.mocked(withSeedLock).mockImplementation(async (_path, fn) => fn());

    // Set up executeWithRecovery to call the function with mockConnection
    vi.mocked(executeWithRecovery).mockImplementation(async (_pool, fn) =>
      fn(mockConnection as unknown as Parameters<typeof fn>[0])
    );

    writer = new EffectWriter(
      mockPool as unknown as Parameters<typeof createEffectWriter>[0],
      "/test/package"
    );

    // Default mock implementations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);

    const mockHandle = {
      sync: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mockFs.open.mockResolvedValue(mockHandle as unknown as fs.FileHandle);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("writeEffects", () => {
    it("returns early when no effects and force is false", async () => {
      const result = await writer.writeEffects([], "hash123", "/test/file.ts");

      expect(result.success).toBe(true);
      expect(result.effectsWritten).toBe(0);
      expect(mockConnection.run).not.toHaveBeenCalled();
    });

    it("writes effects when force is true even with empty array", async () => {
      const result = await writer.writeEffects([], "hash123", "/test/file.ts", {
        force: true,
      });

      expect(result.success).toBe(true);
      expect(mockFs.mkdir).toHaveBeenCalled();
    });

    it("writes effects to base branch by default", async () => {
      const effects = [createSampleEffect()];

      const result = await writer.writeEffects(effects, "hash123", "/test/file.ts");

      expect(result.success).toBe(true);
      expect(result.effectsWritten).toBe(1);
      expect(mockFs.mkdir).toHaveBeenCalledWith("/test/package/.devac/seed/base", {
        recursive: true,
      });
    });

    it("writes effects to specified branch", async () => {
      const effects = [createSampleEffect()];

      const result = await writer.writeEffects(effects, "hash123", "/test/file.ts", {
        branch: "feature",
      });

      expect(result.success).toBe(true);
      expect(mockFs.mkdir).toHaveBeenCalledWith("/test/package/.devac/seed/branch", {
        recursive: true,
      });
    });

    it("deletes existing effects for file before inserting new ones", async () => {
      const effects = [createSampleEffect()];

      await writer.writeEffects(effects, "hash123", "/test/file.ts");

      expect(mockConnection.run).toHaveBeenCalledWith(
        "DELETE FROM effects WHERE source_file_path = ?",
        "/test/file.ts"
      );
    });

    it("prepares and executes insert statement for each effect", async () => {
      const effects = [
        createSampleEffect({ effect_id: "eff-1" }),
        createSampleEffect({ effect_id: "eff-2" }),
      ];

      await writer.writeEffects(effects, "hash123", "/test/file.ts");

      expect(mockConnection.prepare).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(2);
      expect(mockStatement.finalize).toHaveBeenCalled();
    });

    it("performs atomic rename after writing", async () => {
      const effects = [createSampleEffect()];

      await writer.writeEffects(effects, "hash123", "/test/file.ts");

      expect(mockFs.rename).toHaveBeenCalledWith(
        "/test/package/.devac/seed/base/effects.parquet.tmp",
        "/test/package/.devac/seed/base/effects.parquet"
      );
    });

    it("fsyncs directory for durability", async () => {
      const mockHandle = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockHandle as unknown as fs.FileHandle);

      const effects = [createSampleEffect()];
      await writer.writeEffects(effects, "hash123", "/test/file.ts");

      expect(mockFs.open).toHaveBeenCalledWith("/test/package/.devac/seed/base", "r");
      expect(mockHandle.sync).toHaveBeenCalled();
      expect(mockHandle.close).toHaveBeenCalled();
    });

    it("returns error result on failure", async () => {
      mockFs.mkdir.mockRejectedValueOnce(new Error("Permission denied"));

      const effects = [createSampleEffect()];
      const result = await writer.writeEffects(effects, "hash123", "/test/file.ts");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Permission denied");
    });

    it("tracks time spent", async () => {
      const effects = [createSampleEffect()];
      const result = await writer.writeEffects(effects, "hash123", "/test/file.ts");

      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("deleteEffectsForFile", () => {
    it("returns early when effects file does not exist for base branch", async () => {
      mockFs.access.mockRejectedValueOnce(new Error("ENOENT"));

      const result = await writer.deleteEffectsForFile(["/test/file.ts"]);

      expect(result.success).toBe(true);
      expect(result.effectsWritten).toBe(0);
    });

    it("rewrites base effects excluding deleted files", async () => {
      mockConnection.all.mockResolvedValueOnce([{ count: 5 }]);

      const result = await writer.deleteEffectsForFile(["/test/file.ts"]);

      expect(result.success).toBe(true);
      expect(mockConnection.run).toHaveBeenCalledWith(
        "DELETE FROM effects WHERE source_file_path = ?",
        "/test/file.ts"
      );
    });

    it("removes effects file when no effects remain", async () => {
      mockConnection.all.mockResolvedValueOnce([{ count: 0 }]);

      await writer.deleteEffectsForFile(["/test/file.ts"]);

      expect(mockFs.unlink).toHaveBeenCalledWith("/test/package/.devac/seed/base/effects.parquet");
    });

    it("marks effects as deleted for feature branch", async () => {
      const result = await writer.deleteEffectsForFile(["/test/file.ts"], {
        branch: "feature",
      });

      expect(result.success).toBe(true);
      expect(mockConnection.run).toHaveBeenCalledWith(
        "UPDATE effects SET is_deleted = true WHERE source_file_path = ?",
        "/test/file.ts"
      );
    });

    it("handles multiple files", async () => {
      mockConnection.all.mockResolvedValueOnce([{ count: 10 }]);

      await writer.deleteEffectsForFile(["/test/file1.ts", "/test/file2.ts"]);

      expect(mockConnection.run).toHaveBeenCalledWith(
        "DELETE FROM effects WHERE source_file_path = ?",
        "/test/file1.ts"
      );
      expect(mockConnection.run).toHaveBeenCalledWith(
        "DELETE FROM effects WHERE source_file_path = ?",
        "/test/file2.ts"
      );
    });

    it("returns error result on failure", async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockConnection.run.mockRejectedValueOnce(new Error("Database error"));

      const result = await writer.deleteEffectsForFile(["/test/file.ts"]);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Database error");
    });
  });

  describe("effect type handling", () => {
    it("handles FunctionCall effects", async () => {
      const effect = createSampleEffect({
        effect_type: "FunctionCall",
        callee_name: "testFunc",
        is_async: true,
        is_external: true,
        external_module: "lodash",
      });

      const result = await writer.writeEffects([effect], "hash", "/test.ts");

      expect(result.success).toBe(true);
      expect(mockStatement.run).toHaveBeenCalled();
    });

    it("handles Store effects", async () => {
      const effect = {
        effect_id: "eff-store",
        effect_type: "Store",
        timestamp: "2024-01-15T10:00:00.000Z",
        source_entity_id: "func-1",
        source_file_path: "/test/file.ts",
        source_line: 10,
        source_column: 5,
        properties: {},
        store_type: "database",
        operation: "insert",
        target_resource: "users",
        provider: "postgres",
      } as unknown as CodeEffect;

      const result = await writer.writeEffects([effect], "hash", "/test.ts");

      expect(result.success).toBe(true);
    });

    it("handles Retrieve effects", async () => {
      const effect = {
        effect_id: "eff-retrieve",
        effect_type: "Retrieve",
        timestamp: "2024-01-15T10:00:00.000Z",
        source_entity_id: "func-1",
        source_file_path: "/test/file.ts",
        source_line: 10,
        source_column: 5,
        properties: {},
        branch: "main",
        retrieve_type: "cache",
        operation: "get",
        target_resource: "session",
        provider: "redis",
      } as unknown as CodeEffect;

      const result = await writer.writeEffects([effect], "hash", "/test.ts");

      expect(result.success).toBe(true);
    });

    it("handles Send effects", async () => {
      const effect = {
        effect_id: "eff-send",
        effect_type: "Send",
        timestamp: "2024-01-15T10:00:00.000Z",
        source_entity_id: "func-1",
        source_file_path: "/test/file.ts",
        source_line: 10,
        source_column: 5,
        properties: {},
        branch: "main",
        send_type: "http",
        method: "POST",
        target: "https://api.example.com",
        is_third_party: true,
        service_name: "PaymentService",
      } as unknown as CodeEffect;

      const result = await writer.writeEffects([effect], "hash", "/test.ts");

      expect(result.success).toBe(true);
    });

    it("handles Request effects", async () => {
      const effect = {
        effect_id: "eff-request",
        effect_type: "Request",
        timestamp: "2024-01-15T10:00:00.000Z",
        source_entity_id: "func-1",
        source_file_path: "/test/file.ts",
        source_line: 10,
        source_column: 5,
        properties: {},
        branch: "main",
        request_type: "rest",
        method: "GET",
        route_pattern: "/api/users/:id",
        framework: "express",
      } as unknown as CodeEffect;

      const result = await writer.writeEffects([effect], "hash", "/test.ts");

      expect(result.success).toBe(true);
    });

    it("handles Response effects", async () => {
      const effect = {
        effect_id: "eff-response",
        effect_type: "Response",
        timestamp: "2024-01-15T10:00:00.000Z",
        source_entity_id: "func-1",
        source_file_path: "/test/file.ts",
        source_line: 10,
        source_column: 5,
        properties: {},
        branch: "main",
        response_type: "json",
        status_code: 200,
        content_type: "application/json",
      } as unknown as CodeEffect;

      const result = await writer.writeEffects([effect], "hash", "/test.ts");

      expect(result.success).toBe(true);
    });

    it("handles Condition effects", async () => {
      const effect = {
        effect_id: "eff-condition",
        effect_type: "Condition",
        timestamp: "2024-01-15T10:00:00.000Z",
        source_entity_id: "func-1",
        source_file_path: "/test/file.ts",
        source_line: 10,
        source_column: 5,
        properties: {},
        condition_type: "switch",
        branch_count: 3,
        has_default: true,
      } as unknown as CodeEffect;

      const result = await writer.writeEffects([effect], "hash", "/test.ts");

      expect(result.success).toBe(true);
    });

    it("handles Loop effects", async () => {
      const effect = {
        effect_id: "eff-loop",
        effect_type: "Loop",
        timestamp: "2024-01-15T10:00:00.000Z",
        source_entity_id: "func-1",
        source_file_path: "/test/file.ts",
        source_line: 10,
        source_column: 5,
        properties: {},
        branch: "main",
        loop_type: "for-of",
        is_async: true,
      } as unknown as CodeEffect;

      const result = await writer.writeEffects([effect], "hash", "/test.ts");

      expect(result.success).toBe(true);
    });

    it("handles Group effects", async () => {
      const effect = {
        effect_id: "eff-group",
        effect_type: "Group",
        timestamp: "2024-01-15T10:00:00.000Z",
        source_entity_id: "func-1",
        source_file_path: "/test/file.ts",
        source_line: 10,
        source_column: 5,
        properties: {},
        branch: "main",
        group_type: "transaction",
        group_name: "paymentTransaction",
        description: "Payment processing group",
        technology: "stripe",
        parent_group_id: null,
      } as unknown as CodeEffect;

      const result = await writer.writeEffects([effect], "hash", "/test.ts");

      expect(result.success).toBe(true);
    });
  });
});

describe("createEffectWriter", () => {
  it("creates an EffectWriter instance", () => {
    const writer = createEffectWriter(
      mockPool as unknown as Parameters<typeof createEffectWriter>[0],
      "/test/package"
    );

    expect(writer).toBeInstanceOf(EffectWriter);
  });
});
