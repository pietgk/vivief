/**
 * Tests for schema-generators.ts
 *
 * Verifies that SQL DDL and Parquet columns are correctly generated from Zod schemas.
 */

import { describe, expect, test } from "vitest";
import {
  EDGES_COLUMNS,
  EXTERNAL_REFS_COLUMNS,
  NODES_COLUMNS,
  NODES_SCHEMA,
} from "../../src/storage/parquet-schemas.js";
import {
  getColumnMetadata,
  safeValidateData,
  validateData,
  zodToColumnNames,
  zodToCreateTable,
  zodToValuesRow,
} from "../../src/storage/schema-generators.js";
import {
  EdgeSchema,
  ExternalRefSchema,
  NodeSchema,
  createEdgeFromTestData,
  createNodeFromTestData,
} from "../../src/storage/schemas/index.js";

describe("schema-generators", () => {
  describe("zodToCreateTable", () => {
    test("generates valid SQL for NodeSchema", () => {
      const sql = zodToCreateTable(NodeSchema, "nodes", {
        primaryKey: ["entity_id", "branch"],
      });

      // Check that the SQL contains expected column definitions
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS nodes");
      expect(sql).toContain("entity_id VARCHAR NOT NULL");
      expect(sql).toContain("name VARCHAR NOT NULL");
      expect(sql).toContain("kind VARCHAR NOT NULL");
      expect(sql).toContain("file_path VARCHAR NOT NULL");
      expect(sql).toContain("start_line INTEGER NOT NULL");
      expect(sql).toContain("is_exported BOOLEAN NOT NULL DEFAULT false");
      expect(sql).toContain("type_signature VARCHAR");
      expect(sql).toContain("decorators VARCHAR[] NOT NULL DEFAULT []");
      expect(sql).toContain("properties JSON NOT NULL DEFAULT");
      expect(sql).toContain("PRIMARY KEY (entity_id, branch)");
    });

    test("generates valid SQL for EdgeSchema", () => {
      const sql = zodToCreateTable(EdgeSchema, "edges");

      expect(sql).toContain("CREATE TABLE IF NOT EXISTS edges");
      expect(sql).toContain("source_entity_id VARCHAR NOT NULL");
      expect(sql).toContain("target_entity_id VARCHAR NOT NULL");
      expect(sql).toContain("edge_type VARCHAR NOT NULL");
      expect(sql).toContain("source_line INTEGER NOT NULL");
    });

    test("generates valid SQL for ExternalRefSchema", () => {
      const sql = zodToCreateTable(ExternalRefSchema, "external_refs");

      expect(sql).toContain("CREATE TABLE IF NOT EXISTS external_refs");
      expect(sql).toContain("source_entity_id VARCHAR NOT NULL");
      expect(sql).toContain("module_specifier VARCHAR NOT NULL");
      expect(sql).toContain("import_style VARCHAR NOT NULL DEFAULT");
      expect(sql).toContain("local_alias VARCHAR");
    });

    test("NODES_SCHEMA matches expected structure", () => {
      // The NODES_SCHEMA is now generated from Zod
      // Verify it has the same basic structure as before
      expect(NODES_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS nodes");
      expect(NODES_SCHEMA).toContain("entity_id");
      expect(NODES_SCHEMA).toContain("file_path");
      expect(NODES_SCHEMA).toContain("PRIMARY KEY");
    });
  });

  describe("zodToColumnNames", () => {
    test("returns column names in schema order for NodeSchema", () => {
      const columns = zodToColumnNames(NodeSchema);

      expect(columns).toContain("entity_id");
      expect(columns).toContain("name");
      expect(columns).toContain("kind");
      expect(columns).toContain("file_path");
      expect(columns).toContain("branch");
      expect(columns).toContain("updated_at");

      // Verify order - entity_id should come before name
      expect(columns.indexOf("entity_id")).toBeLessThan(columns.indexOf("name"));
    });

    test("NODES_COLUMNS matches zodToColumnNames output", () => {
      const zodColumns = zodToColumnNames(NodeSchema);
      expect(NODES_COLUMNS).toEqual(zodColumns);
    });

    test("EDGES_COLUMNS matches zodToColumnNames output", () => {
      const zodColumns = zodToColumnNames(EdgeSchema);
      expect(EDGES_COLUMNS).toEqual(zodColumns);
    });

    test("EXTERNAL_REFS_COLUMNS matches zodToColumnNames output", () => {
      const zodColumns = zodToColumnNames(ExternalRefSchema);
      expect(EXTERNAL_REFS_COLUMNS).toEqual(zodColumns);
    });
  });

  describe("zodToValuesRow", () => {
    test("generates valid VALUES clause for a node", () => {
      const node = createNodeFromTestData({
        name: "testFunc",
        kind: "function",
        file_path: "src/test.ts",
      });

      const valuesRow = zodToValuesRow(NodeSchema, node as unknown as Record<string, unknown>);

      // Check that the values clause is properly formatted
      expect(valuesRow).toMatch(/^\(.+\)$/);
      expect(valuesRow).toContain("'testFunc'");
      expect(valuesRow).toContain("'function'");
      expect(valuesRow).toContain("'src/test.ts'");
    });

    test("escapes single quotes in string values", () => {
      const node = createNodeFromTestData({
        name: "test's function",
        kind: "function",
        file_path: "src/test.ts",
        documentation: "It's a test",
      });

      const valuesRow = zodToValuesRow(NodeSchema, node as unknown as Record<string, unknown>);

      // Single quotes should be escaped
      expect(valuesRow).toContain("test''s function");
    });

    test("handles null values correctly", () => {
      const node = createNodeFromTestData({
        name: "testFunc",
        kind: "function",
        file_path: "src/test.ts",
        type_signature: null,
        documentation: null,
      });

      const valuesRow = zodToValuesRow(NodeSchema, node as unknown as Record<string, unknown>);

      // NULL values should appear as NULL (not 'null')
      expect(valuesRow).toContain("NULL");
    });

    test("handles empty arrays correctly", () => {
      const node = createNodeFromTestData({
        name: "testFunc",
        kind: "function",
        file_path: "src/test.ts",
        decorators: [],
        type_parameters: [],
      });

      const valuesRow = zodToValuesRow(NodeSchema, node as unknown as Record<string, unknown>);

      // Empty arrays should be []
      expect(valuesRow).toContain("[]");
    });
  });

  describe("getColumnMetadata", () => {
    test("returns metadata for all columns", () => {
      const metadata = getColumnMetadata(NodeSchema);

      expect(metadata.length).toBeGreaterThan(0);

      const entityIdMeta = metadata.find((m) => m.name === "entity_id");
      expect(entityIdMeta).toBeDefined();
      expect(entityIdMeta?.duckdbType).toBe("VARCHAR");
      expect(entityIdMeta?.nullable).toBe(false);

      const isExportedMeta = metadata.find((m) => m.name === "is_exported");
      expect(isExportedMeta).toBeDefined();
      expect(isExportedMeta?.duckdbType).toBe("BOOLEAN");
      expect(isExportedMeta?.hasDefault).toBe(true);

      const decoratorsMeta = metadata.find((m) => m.name === "decorators");
      expect(decoratorsMeta).toBeDefined();
      expect(decoratorsMeta?.duckdbType).toBe("VARCHAR[]");
    });
  });

  describe("validateData", () => {
    test("validates valid node data", () => {
      const node = createNodeFromTestData({
        name: "testFunc",
        kind: "function",
        file_path: "src/test.ts",
      });

      // Should not throw
      const validated = validateData(NodeSchema, node);
      expect(validated.name).toBe("testFunc");
    });

    test("throws on invalid node data", () => {
      const invalidNode = {
        name: "testFunc",
        // Missing required fields
      };

      expect(() => validateData(NodeSchema, invalidNode)).toThrow();
    });
  });

  describe("safeValidateData", () => {
    test("returns data for valid input", () => {
      const node = createNodeFromTestData({
        name: "testFunc",
        kind: "function",
        file_path: "src/test.ts",
      });

      const validated = safeValidateData(NodeSchema, node);
      expect(validated).not.toBeNull();
      expect(validated?.name).toBe("testFunc");
    });

    test("returns null for invalid input", () => {
      const invalidNode = {
        name: "testFunc",
        // Missing required fields
      };

      const validated = safeValidateData(NodeSchema, invalidNode);
      expect(validated).toBeNull();
    });
  });

  describe("createNodeFromTestData", () => {
    test("creates full node from minimal test data", () => {
      const node = createNodeFromTestData({
        name: "myFunction",
        kind: "function",
        file_path: "src/utils.ts",
      });

      // Required fields
      expect(node.name).toBe("myFunction");
      expect(node.kind).toBe("function");
      expect(node.file_path).toBe("src/utils.ts");

      // Defaults
      expect(node.qualified_name).toBe("myFunction");
      expect(node.start_line).toBe(1);
      expect(node.is_exported).toBe(false);
      expect(node.branch).toBe("base");
      expect(node.decorators).toEqual([]);

      // Generated
      expect(node.entity_id).toMatch(/^test:pkg:function:/);
    });

    test("allows overriding defaults", () => {
      const node = createNodeFromTestData({
        name: "myFunction",
        kind: "function",
        file_path: "src/utils.ts",
        is_exported: true,
        start_line: 42,
        documentation: "A test function",
      });

      expect(node.is_exported).toBe(true);
      expect(node.start_line).toBe(42);
      expect(node.documentation).toBe("A test function");
    });
  });

  describe("createEdgeFromTestData", () => {
    test("creates full edge from minimal test data", () => {
      const edge = createEdgeFromTestData({
        source_entity_id: "test:pkg:function:caller",
        target_entity_id: "test:pkg:function:callee",
        edge_type: "CALLS",
      });

      expect(edge.source_entity_id).toBe("test:pkg:function:caller");
      expect(edge.target_entity_id).toBe("test:pkg:function:callee");
      expect(edge.edge_type).toBe("CALLS");
      expect(edge.source_line).toBe(1);
      expect(edge.branch).toBe("base");
    });
  });
});
