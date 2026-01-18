// @ts-nocheck - TODO: Fix type mismatches with updated interfaces
/**
 * Tests for effect-reader.ts
 */
import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock dependencies before imports
vi.mock("node:fs/promises");
vi.mock("../../src/storage/duckdb-pool.js");
vi.mock("../../src/storage/query-context.js");
vi.mock("../../src/types/config.js");

import { executeWithRecovery } from "../../src/storage/duckdb-pool.js";
import { EffectReader, createEffectReader } from "../../src/storage/effect-reader.js";
import { queryWithContext } from "../../src/storage/query-context.js";
import { getSeedPaths } from "../../src/types/config.js";

describe("EffectReader", () => {
  const mockPackagePath = "/test/package";
  const mockPool = {} as Parameters<typeof createEffectReader>[0];
  const mockConnection = {
    all: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(getSeedPaths).mockReturnValue({
      seedDir: "/test/package/.devac",
      baseDir: "/test/package/.devac/base",
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

    vi.mocked(fs.access).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readEffects", () => {
    test("reads all effects without filter", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 2n }]) // Count query
        .mockResolvedValueOnce([
          {
            effect_id: "eff1",
            effect_type: "FunctionCall",
            timestamp: "2024-01-01T00:00:00Z",
            source_entity_id: "entity1",
            source_file_path: "/test/file.ts",
            source_line: 10,
            source_column: 5,
            branch: "base",
            properties: "{}",
            target_entity_id: "entity2",
            callee_name: "doSomething",
            callee_qualified_name: "module.doSomething",
            is_method_call: false,
            is_async: true,
            is_constructor: false,
            argument_count: 2,
            is_external: false,
            external_module: null,
          },
        ]);

      const result = await reader.readEffects();

      expect(result.totalCount).toBe(2);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].effect_type).toBe("FunctionCall");
      expect(result.hasMore).toBe(true);
    });

    test("returns empty when effects file does not exist", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await reader.readEffects();

      expect(result.effects).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    test("applies effectType filter for single type", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 1n }]).mockResolvedValueOnce([]);

      await reader.readEffects({ effectType: "Store" });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("effect_type = ?"),
        "Store"
      );
    });

    test("applies effectType filter for multiple types", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 1n }]).mockResolvedValueOnce([]);

      await reader.readEffects({ effectType: ["Store", "Retrieve"] });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("effect_type IN (?, ?)"),
        "Store",
        "Retrieve"
      );
    });

    test("applies sourceEntityId filter", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 0n }]).mockResolvedValueOnce([]);

      await reader.readEffects({ sourceEntityId: "entity123" });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("source_entity_id = ?"),
        "entity123"
      );
    });

    test("applies targetEntityId filter", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 0n }]).mockResolvedValueOnce([]);

      await reader.readEffects({ targetEntityId: "target456" });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("target_entity_id = ?"),
        "target456"
      );
    });

    test("applies sourceFilePath filter", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 0n }]).mockResolvedValueOnce([]);

      await reader.readEffects({ sourceFilePath: "/test/file.ts" });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("source_file_path = ?"),
        "/test/file.ts"
      );
    });

    test("applies isExternal filter", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 0n }]).mockResolvedValueOnce([]);

      await reader.readEffects({ isExternal: true });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("is_external = ?"),
        true
      );
    });

    test("applies calleeNamePattern filter", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 0n }]).mockResolvedValueOnce([]);

      await reader.readEffects({ calleeNamePattern: "fetch" });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("callee_name LIKE ?"),
        "%fetch%"
      );
    });

    test("applies limit and offset", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 100n }]).mockResolvedValueOnce([]);

      await reader.readEffects({ limit: 10, offset: 20 });

      const mainQuery = mockConnection.all.mock.calls[1][0];
      expect(mainQuery).toContain("LIMIT 10");
      expect(mainQuery).toContain("OFFSET 20");
    });

    test("calculates hasMore correctly", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 10n }])
        .mockResolvedValueOnce(
          [{ effect_id: "1" }, { effect_id: "2" }].map(makeMinimalFunctionCall)
        );

      const result = await reader.readEffects({ limit: 2, offset: 0 });

      expect(result.hasMore).toBe(true);
    });

    test("hasMore is false when all results returned", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 2n }])
        .mockResolvedValueOnce(
          [{ effect_id: "1" }, { effect_id: "2" }].map(makeMinimalFunctionCall)
        );

      const result = await reader.readEffects();

      expect(result.hasMore).toBe(false);
    });
  });

  describe("readByType", () => {
    test("reads effects by single type", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalFunctionCall({ effect_id: "1" })]);

      const effects = await reader.readByType("FunctionCall");

      expect(effects).toHaveLength(1);
    });

    test("reads effects by multiple types", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 2n }])
        .mockResolvedValueOnce([
          makeMinimalStore({ effect_id: "1" }),
          makeMinimalRetrieve({ effect_id: "2" }),
        ]);

      const effects = await reader.readByType(["Store", "Retrieve"]);

      expect(effects).toHaveLength(2);
    });
  });

  describe("readBySourceEntity", () => {
    test("reads effects by source entity ID", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalFunctionCall({ source_entity_id: "entity123" })]);

      const effects = await reader.readBySourceEntity("entity123");

      expect(effects).toHaveLength(1);
      expect(effects[0].source_entity_id).toBe("entity123");
    });
  });

  describe("readByTargetEntity", () => {
    test("reads effects by target entity ID", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalFunctionCall({ target_entity_id: "target456" })]);

      const effects = await reader.readByTargetEntity("target456");

      expect(effects).toHaveLength(1);
    });
  });

  describe("readFunctionCalls", () => {
    test("reads function call effects", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalFunctionCall({})]);

      const effects = await reader.readFunctionCalls();

      expect(effects).toHaveLength(1);
      expect(effects[0].effect_type).toBe("FunctionCall");
    });

    test("passes additional filter options", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 0n }]).mockResolvedValueOnce([]);

      await reader.readFunctionCalls({ sourceFilePath: "/test.ts" });

      // readFunctionCalls adds effectType: "FunctionCall" to the filter
      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("source_file_path = ?"),
        "FunctionCall",
        "/test.ts"
      );
    });
  });

  describe("readExternalCalls", () => {
    test("reads external function calls", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 1n }]).mockResolvedValueOnce([
        makeMinimalFunctionCall({
          is_external: true,
          external_module: "lodash",
        }),
      ]);

      const effects = await reader.readExternalCalls();

      expect(effects).toHaveLength(1);
      // readExternalCalls adds both effectType: "FunctionCall" and isExternal: true
      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining("is_external = ?"),
        "FunctionCall",
        true
      );
    });
  });

  describe("getStatistics", () => {
    test("returns statistics for effects", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 100n }]) // Total
        .mockResolvedValueOnce([
          { effect_type: "FunctionCall", count: 80n },
          { effect_type: "Store", count: 20n },
        ]) // By type
        .mockResolvedValueOnce([{ count: 30n }]) // External
        .mockResolvedValueOnce([{ count: 50n }]) // Unique source
        .mockResolvedValueOnce([{ count: 40n }]); // Unique target

      const stats = await reader.getStatistics();

      expect(stats.totalEffects).toBe(100);
      expect(stats.byType).toEqual({
        FunctionCall: 80,
        Store: 20,
      });
      expect(stats.externalCallCount).toBe(30);
      expect(stats.uniqueSourceEntities).toBe(50);
      expect(stats.uniqueTargetEntities).toBe(40);
    });

    test("returns empty statistics when effects file does not exist", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const stats = await reader.getStatistics();

      expect(stats.totalEffects).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.externalCallCount).toBe(0);
      expect(stats.uniqueSourceEntities).toBe(0);
      expect(stats.uniqueTargetEntities).toBe(0);
    });

    test("handles missing count values", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{}]) // Missing count
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}]);

      const stats = await reader.getStatistics();

      expect(stats.totalEffects).toBe(0);
    });
  });

  describe("query", () => {
    test("executes custom SQL query", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      vi.mocked(queryWithContext).mockResolvedValue({
        rows: [{ count: 5 }],
        viewsCreated: ["effects"],
      });

      const result = await reader.query("SELECT COUNT(*) as count FROM effects");

      expect(queryWithContext).toHaveBeenCalledWith(mockPool, {
        packagePath: mockPackagePath,
        sql: "SELECT COUNT(*) as count FROM effects",
      });
      expect(result).toEqual([{ count: 5 }]);
    });

    test("returns empty array when effects file does not exist", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await reader.query("SELECT * FROM effects");

      expect(result).toEqual([]);
      expect(queryWithContext).not.toHaveBeenCalled();
    });
  });

  describe("rowToEffect - different effect types", () => {
    test("parses Store effect", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalStore({})]);

      const result = await reader.readEffects();
      const effect = result.effects[0];

      expect(effect.effect_type).toBe("Store");
      if (effect.effect_type === "Store") {
        expect(effect.store_type).toBe("database");
        expect(effect.operation).toBe("insert");
        expect(effect.target_resource).toBe("users");
      }
    });

    test("parses Retrieve effect", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalRetrieve({})]);

      const result = await reader.readEffects();
      const effect = result.effects[0];

      expect(effect.effect_type).toBe("Retrieve");
      if (effect.effect_type === "Retrieve") {
        expect(effect.retrieve_type).toBe("database");
        expect(effect.operation).toBe("select");
      }
    });

    test("parses Send effect", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalSend({})]);

      const result = await reader.readEffects();
      const effect = result.effects[0];

      expect(effect.effect_type).toBe("Send");
      if (effect.effect_type === "Send") {
        expect(effect.send_type).toBe("http");
        expect(effect.target).toBe("https://api.example.com");
      }
    });

    test("parses Request effect", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalRequest({})]);

      const result = await reader.readEffects();
      const effect = result.effects[0];

      expect(effect.effect_type).toBe("Request");
      if (effect.effect_type === "Request") {
        expect(effect.request_type).toBe("http");
        expect(effect.route_pattern).toBe("/api/users");
      }
    });

    test("parses Response effect", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalResponse({})]);

      const result = await reader.readEffects();
      const effect = result.effects[0];

      expect(effect.effect_type).toBe("Response");
      if (effect.effect_type === "Response") {
        expect(effect.response_type).toBe("http");
        expect(effect.status_code).toBe(200);
      }
    });

    test("parses Condition effect", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalCondition({})]);

      const result = await reader.readEffects();
      const effect = result.effects[0];

      expect(effect.effect_type).toBe("Condition");
      if (effect.effect_type === "Condition") {
        expect(effect.condition_type).toBe("if");
        expect(effect.branch_count).toBe(2);
      }
    });

    test("parses Loop effect", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalLoop({})]);

      const result = await reader.readEffects();
      const effect = result.effects[0];

      expect(effect.effect_type).toBe("Loop");
      if (effect.effect_type === "Loop") {
        expect(effect.loop_type).toBe("for");
        expect(effect.is_async).toBe(false);
      }
    });

    test("parses Group effect", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalGroup({})]);

      const result = await reader.readEffects();
      const effect = result.effects[0];

      expect(effect.effect_type).toBe("Group");
      if (effect.effect_type === "Group") {
        expect(effect.group_type).toBe("Component");
        expect(effect.group_name).toBe("UserService");
      }
    });

    test("throws error for unknown effect type", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all.mockResolvedValueOnce([{ count: 1n }]).mockResolvedValueOnce([
        {
          ...makeBaseEffect({}),
          effect_type: "UnknownType",
        },
      ]);

      await expect(reader.readEffects()).rejects.toThrow("Unknown effect type: UnknownType");
    });

    test("handles properties as object instead of string", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalFunctionCall({ properties: { custom: "value" } })]);

      const result = await reader.readEffects();

      expect(result.effects[0].properties).toEqual({ custom: "value" });
    });

    test("handles null status_code in Response", async () => {
      const reader = new EffectReader(mockPool, mockPackagePath);

      mockConnection.all
        .mockResolvedValueOnce([{ count: 1n }])
        .mockResolvedValueOnce([makeMinimalResponse({ status_code: null })]);

      const result = await reader.readEffects();
      const effect = result.effects[0];

      if (effect.effect_type === "Response") {
        expect(effect.status_code).toBeNull();
      }
    });
  });

  describe("createEffectReader", () => {
    test("creates an EffectReader instance", () => {
      const reader = createEffectReader(mockPool, mockPackagePath);

      expect(reader).toBeInstanceOf(EffectReader);
    });
  });
});

// Helper functions to create mock effect rows
function makeBaseEffect(overrides: Record<string, unknown>) {
  return {
    effect_id: "eff-1",
    timestamp: "2024-01-01T00:00:00Z",
    source_entity_id: "entity1",
    source_file_path: "/test/file.ts",
    source_line: 10,
    source_column: 5,
    branch: "base",
    properties: "{}",
    is_deleted: false,
    ...overrides,
  };
}

function makeMinimalFunctionCall(overrides: Record<string, unknown>) {
  return {
    ...makeBaseEffect(overrides),
    effect_type: "FunctionCall",
    target_entity_id: overrides.target_entity_id ?? "entity2",
    callee_name: "doSomething",
    callee_qualified_name: "module.doSomething",
    is_method_call: false,
    is_async: false,
    is_constructor: false,
    argument_count: 0,
    is_external: overrides.is_external ?? false,
    external_module: overrides.external_module ?? null,
    ...overrides,
  };
}

function makeMinimalStore(overrides: Record<string, unknown>) {
  return {
    ...makeBaseEffect(overrides),
    effect_type: "Store",
    store_type: "database",
    operation: "insert",
    target_resource: "users",
    provider: "postgres",
    ...overrides,
  };
}

function makeMinimalRetrieve(overrides: Record<string, unknown>) {
  return {
    ...makeBaseEffect(overrides),
    effect_type: "Retrieve",
    retrieve_type: "database",
    operation: "select",
    target_resource: "users",
    provider: "postgres",
    ...overrides,
  };
}

function makeMinimalSend(overrides: Record<string, unknown>) {
  return {
    ...makeBaseEffect(overrides),
    effect_type: "Send",
    send_type: "http",
    method: "POST",
    target: "https://api.example.com",
    is_third_party: true,
    service_name: "ExternalAPI",
    ...overrides,
  };
}

function makeMinimalRequest(overrides: Record<string, unknown>) {
  return {
    ...makeBaseEffect(overrides),
    effect_type: "Request",
    request_type: "http",
    method: "GET",
    route_pattern: "/api/users",
    framework: "express",
    ...overrides,
  };
}

function makeMinimalResponse(overrides: Record<string, unknown>) {
  return {
    ...makeBaseEffect(overrides),
    effect_type: "Response",
    response_type: "http",
    status_code: 200,
    content_type: "application/json",
    ...overrides,
  };
}

function makeMinimalCondition(overrides: Record<string, unknown>) {
  return {
    ...makeBaseEffect(overrides),
    effect_type: "Condition",
    condition_type: "if",
    branch_count: 2,
    has_default: false,
    ...overrides,
  };
}

function makeMinimalLoop(overrides: Record<string, unknown>) {
  return {
    ...makeBaseEffect(overrides),
    effect_type: "Loop",
    loop_type: "for",
    is_async: false,
    ...overrides,
  };
}

function makeMinimalGroup(overrides: Record<string, unknown>) {
  return {
    ...makeBaseEffect(overrides),
    effect_type: "Group",
    group_type: "Component",
    group_name: "UserService",
    description: "Handles user operations",
    technology: "TypeScript",
    parent_group_id: null,
    ...overrides,
  };
}
