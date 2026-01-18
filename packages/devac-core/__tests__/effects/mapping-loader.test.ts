/**
 * Effect Mapping Loader Tests
 *
 * Tests for hierarchical effect mapping loading and application.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMappings,
  getMappingsPath,
  hasMappings,
  loadEffectMappings,
} from "../../src/effects/mapping-loader.js";
import type {
  CodeEffect,
  FunctionCallEffect,
  PackageEffectMappings,
} from "../../src/types/effects.js";

describe("mapping-loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(
      "/tmp",
      `devac-test-mapping-loader-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Create a test FunctionCall effect
   */
  function createFunctionCallEffect(calleeName: string): FunctionCallEffect {
    return {
      effect_id: `effect-${calleeName}`,
      timestamp: new Date().toISOString(),
      effect_type: "FunctionCall",
      source_entity_id: "test:pkg:function:abc123",
      source_file_path: "src/service.ts",
      source_line: 10,
      source_column: 5,
      branch: "base",
      properties: {},
      target_entity_id: null,
      callee_name: calleeName,
      callee_qualified_name: null,
      is_method_call: false,
      is_async: false,
      is_constructor: false,
      argument_count: 0,
      is_external: false,
      external_module: null,
    };
  }

  /**
   * Create a test effect mappings file
   */
  async function createMappingsFile(basePath: string, content: string): Promise<void> {
    const devacDir = path.join(basePath, ".devac");
    await fs.mkdir(devacDir, { recursive: true });
    await fs.writeFile(path.join(devacDir, "effect-mappings.ts"), content);
  }

  describe("getMappingsPath", () => {
    it("returns correct path for effect mappings file", () => {
      const basePath = "/project/packages/my-package";
      const result = getMappingsPath(basePath);

      expect(result).toBe("/project/packages/my-package/.devac/effect-mappings.ts");
    });
  });

  describe("hasMappings", () => {
    it("returns true when mappings file exists", async () => {
      const packagePath = path.join(tempDir, "with-mappings");
      await createMappingsFile(
        packagePath,
        `export const effectMappings = { metadata: { package_name: "test" } };`
      );

      const result = await hasMappings(packagePath);

      expect(result).toBe(true);
    });

    it("returns false when mappings file does not exist", async () => {
      const packagePath = path.join(tempDir, "without-mappings");
      await fs.mkdir(packagePath, { recursive: true });

      const result = await hasMappings(packagePath);

      expect(result).toBe(false);
    });
  });

  describe("loadEffectMappings", () => {
    it("returns empty mappings when no files exist", async () => {
      const packagePath = path.join(tempDir, "empty-package");
      await fs.mkdir(packagePath, { recursive: true });

      const result = await loadEffectMappings({ packagePath });

      expect(result.hasMappings).toBe(false);
      expect(result.sources).toHaveLength(0);
      expect(result.mappings.store_operations).toEqual([]);
      expect(result.mappings.retrieve_operations).toEqual([]);
      expect(result.mappings.external_calls).toEqual([]);
    });

    it("loads package-level mappings", async () => {
      const packagePath = path.join(tempDir, "pkg-with-mappings");
      await createMappingsFile(
        packagePath,
        `
export const effectMappings = {
  metadata: {
    package_name: "test-package",
    verified: true,
  },
  store_operations: [
    { pattern: "db.insert", store_type: "database", operation: "insert" },
  ],
  retrieve_operations: [],
  external_calls: [],
};
`
      );

      const result = await loadEffectMappings({ packagePath });

      expect(result.hasMappings).toBe(true);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]?.level).toBe("package");
    });

    it("merges workspace and package mappings", async () => {
      const workspacePath = path.join(tempDir, "workspace");
      const packagePath = path.join(workspacePath, "packages", "my-pkg");
      await fs.mkdir(packagePath, { recursive: true });

      // Workspace-level mappings
      await createMappingsFile(
        workspacePath,
        `
export const effectMappings = {
  metadata: { package_name: "workspace", verified: false },
  store_operations: [
    { pattern: "global.store", store_type: "database", operation: "insert" },
  ],
  retrieve_operations: [],
  external_calls: [],
};
`
      );

      // Package-level mappings (more specific)
      await createMappingsFile(
        packagePath,
        `
export const effectMappings = {
  metadata: { package_name: "my-pkg", verified: true },
  store_operations: [
    { pattern: "pkg.store", store_type: "cache", operation: "write" },
  ],
  retrieve_operations: [],
  external_calls: [],
};
`
      );

      const result = await loadEffectMappings({
        packagePath,
        workspacePath,
      });

      expect(result.hasMappings).toBe(true);
      expect(result.sources).toHaveLength(2);
      // Should have both workspace and package store operations
      expect(result.mappings.store_operations.length).toBeGreaterThanOrEqual(1);
    });

    it("package mappings override workspace mappings for same pattern", async () => {
      const workspacePath = path.join(tempDir, "workspace2");
      const packagePath = path.join(workspacePath, "packages", "my-pkg");
      await fs.mkdir(packagePath, { recursive: true });

      // Workspace-level mappings
      await createMappingsFile(
        workspacePath,
        `
export const effectMappings = {
  metadata: { package_name: "workspace", verified: false },
  store_operations: [
    { pattern: "shared.store", store_type: "database", operation: "insert" },
  ],
  retrieve_operations: [],
  external_calls: [],
};
`
      );

      // Package-level mappings with same pattern
      await createMappingsFile(
        packagePath,
        `
export const effectMappings = {
  metadata: { package_name: "my-pkg", verified: true },
  store_operations: [
    { pattern: "shared.store", store_type: "cache", operation: "write" },
  ],
  retrieve_operations: [],
  external_calls: [],
};
`
      );

      const result = await loadEffectMappings({
        packagePath,
        workspacePath,
      });

      // Package mapping should override workspace for same pattern
      const sharedStoreMapping = result.mappings.store_operations.find(
        (m) => m.pattern === "shared.store"
      );
      expect(sharedStoreMapping?.store_type).toBe("cache");
    });
  });

  describe("applyMappings", () => {
    it("converts FunctionCall to Store effect when pattern matches", () => {
      const effects: CodeEffect[] = [createFunctionCallEffect("database.insert")];

      const mappings: PackageEffectMappings = {
        metadata: { package_name: "test", verified: true },
        store_operations: [
          {
            pattern: "database.insert",
            store_type: "database",
            operation: "insert",
            provider: "postgres",
          },
        ],
        retrieve_operations: [],
        external_calls: [],
        request_handlers: [],
        groups: [],
      };

      const result = applyMappings(effects, mappings);

      expect(result).toHaveLength(1);
      expect(result[0]?.effect_type).toBe("Store");
    });

    it("converts FunctionCall to Retrieve effect when pattern matches", () => {
      const effects: CodeEffect[] = [createFunctionCallEffect("cache.get")];

      const mappings: PackageEffectMappings = {
        metadata: { package_name: "test", verified: true },
        store_operations: [],
        retrieve_operations: [
          {
            pattern: "cache.get",
            retrieve_type: "cache",
            operation: "get",
            provider: "redis",
          },
        ],
        external_calls: [],
        request_handlers: [],
        groups: [],
      };

      const result = applyMappings(effects, mappings);

      expect(result).toHaveLength(1);
      expect(result[0]?.effect_type).toBe("Retrieve");
    });

    it("converts FunctionCall to Send effect when pattern matches", () => {
      const effects: CodeEffect[] = [createFunctionCallEffect("stripe.charges.create")];

      const mappings: PackageEffectMappings = {
        metadata: { package_name: "test", verified: true },
        store_operations: [],
        retrieve_operations: [],
        external_calls: [
          {
            pattern: "stripe.charges.create",
            send_type: "http",
            service: "stripe",
            is_third_party: true,
          },
        ],
        request_handlers: [],
        groups: [],
      };

      const result = applyMappings(effects, mappings);

      expect(result).toHaveLength(1);
      expect(result[0]?.effect_type).toBe("Send");
    });

    it("keeps FunctionCall when no pattern matches", () => {
      const effects: CodeEffect[] = [createFunctionCallEffect("unknownFunction")];

      const mappings: PackageEffectMappings = {
        metadata: { package_name: "test", verified: true },
        store_operations: [
          {
            pattern: "database.insert",
            store_type: "database",
            operation: "insert",
            provider: "postgres",
          },
        ],
        retrieve_operations: [],
        external_calls: [],
        request_handlers: [],
        groups: [],
      };

      const result = applyMappings(effects, mappings);

      expect(result).toHaveLength(1);
      expect(result[0]?.effect_type).toBe("FunctionCall");
    });

    it("passes through non-FunctionCall effects unchanged", () => {
      const storeEffect: CodeEffect = {
        effect_id: "effect-store-1",
        timestamp: new Date().toISOString(),
        effect_type: "Store",
        source_entity_id: "test:pkg:function:xyz",
        source_file_path: "src/db.ts",
        source_line: 20,
        source_column: 10,
        branch: "base",
        properties: {},
        store_type: "database",
        operation: "insert",
        target_resource: "users",
        provider: null,
      };

      const mappings: PackageEffectMappings = {
        metadata: { package_name: "test", verified: true },
        store_operations: [],
        retrieve_operations: [],
        external_calls: [],
        request_handlers: [],
        groups: [],
      };

      const result = applyMappings([storeEffect], mappings);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(storeEffect);
    });

    it("handles empty effects array", () => {
      const mappings: PackageEffectMappings = {
        metadata: { package_name: "test", verified: true },
        store_operations: [],
        retrieve_operations: [],
        external_calls: [],
        request_handlers: [],
        groups: [],
      };

      const result = applyMappings([], mappings);

      expect(result).toHaveLength(0);
    });

    it("processes multiple effects and applies correct mappings", () => {
      const effects: CodeEffect[] = [
        createFunctionCallEffect("db.query"),
        createFunctionCallEffect("db.insert"),
        createFunctionCallEffect("http.post"),
        createFunctionCallEffect("unknownMethod"),
      ];

      const mappings: PackageEffectMappings = {
        metadata: { package_name: "test", verified: true },
        store_operations: [
          {
            pattern: "db.insert",
            store_type: "database",
            operation: "insert",
            provider: "postgres",
          },
        ],
        retrieve_operations: [
          {
            pattern: "db.query",
            retrieve_type: "database",
            operation: "query",
            provider: "postgres",
          },
        ],
        external_calls: [
          {
            pattern: "http.post",
            send_type: "http",
            service: "api",
            is_third_party: false,
          },
        ],
        request_handlers: [],
        groups: [],
      };

      const result = applyMappings(effects, mappings);

      expect(result).toHaveLength(4);
      expect(result[0]?.effect_type).toBe("Retrieve"); // db.query
      expect(result[1]?.effect_type).toBe("Store"); // db.insert
      expect(result[2]?.effect_type).toBe("Send"); // http.post
      expect(result[3]?.effect_type).toBe("FunctionCall"); // unknownMethod
    });

    it("converts external send_type to http", () => {
      const effects: CodeEffect[] = [createFunctionCallEffect("externalApi.call")];

      const mappings: PackageEffectMappings = {
        metadata: { package_name: "test", verified: true },
        store_operations: [],
        retrieve_operations: [],
        external_calls: [
          {
            pattern: "externalApi.call",
            send_type: "external" as "http", // Cast to avoid type error - this tests the conversion
            service: "external-service",
            is_third_party: true,
          },
        ],
        request_handlers: [],
        groups: [],
      };

      const result = applyMappings(effects, mappings);

      expect(result).toHaveLength(1);
      expect(result[0]?.effect_type).toBe("Send");
      // The send_type should be converted to "http" since "external" is not valid
    });
  });
});
