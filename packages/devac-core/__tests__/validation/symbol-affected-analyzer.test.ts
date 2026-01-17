/**
 * Symbol Affected Analyzer Tests
 *
 * Tests for symbol-level change impact analysis.
 * Based on DevAC v2.0 spec Section 10.1.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StructuralParseResult } from "../../src/parsers/parser-interface.js";
import { DuckDBPool } from "../../src/storage/duckdb-pool.js";
import { type SeedReader, createSeedReader } from "../../src/storage/seed-reader.js";
import { type SeedWriter, createSeedWriter } from "../../src/storage/seed-writer.js";
import type { NodeKind, ParsedEdge, ParsedExternalRef, ParsedNode } from "../../src/types/index.js";
import {
  type SymbolAffectedAnalyzer,
  createSymbolAffectedAnalyzer,
} from "../../src/validation/symbol-affected-analyzer.js";

/**
 * Helper to create a properly typed ParsedNode for testing
 */
function createTestNode(partial: {
  entity_id: string;
  name: string;
  kind: NodeKind;
  file_path: string;
  is_exported?: boolean;
  source_file_hash?: string;
  properties?: Record<string, unknown>;
}): ParsedNode {
  return {
    entity_id: partial.entity_id,
    name: partial.name,
    qualified_name: partial.name,
    kind: partial.kind,
    file_path: partial.file_path,
    start_line: 1,
    end_line: 10,
    start_column: 0,
    end_column: 1,
    is_exported: partial.is_exported ?? true,
    is_default_export: false,
    visibility: "public",
    is_async: false,
    is_generator: false,
    is_static: false,
    is_abstract: false,
    type_signature: null,
    documentation: null,
    decorators: [],
    type_parameters: [],
    properties: partial.properties ?? {},
    source_file_hash: partial.source_file_hash || "test-hash",
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Helper to create a properly typed ParsedExternalRef for testing
 */
function createTestRef(partial: {
  source_entity_id: string;
  source_file_path: string;
  module_specifier: string;
  imported_symbol: string;
  target_entity_id: string;
  source_file_hash?: string;
}): ParsedExternalRef {
  return {
    source_entity_id: partial.source_entity_id,
    source_file_path: partial.source_file_path,
    module_specifier: partial.module_specifier,
    imported_symbol: partial.imported_symbol,
    local_alias: null,
    import_style: "named",
    is_type_only: false,
    source_line: 1,
    source_column: 0,
    target_entity_id: partial.target_entity_id,
    is_resolved: true,
    is_reexport: false,
    export_alias: null,
    source_file_hash: partial.source_file_hash || "test-hash",
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Helper to create a StructuralParseResult for testing
 */
function createParseResult(
  nodes: ParsedNode[],
  edges: ParsedEdge[] = [],
  externalRefs: ParsedExternalRef[] = [],
  filePath = "test.ts"
): StructuralParseResult {
  return {
    nodes,
    edges,
    externalRefs,
    effects: [],
    sourceFileHash: `test-hash-${Date.now()}`,
    filePath,
    parseTimeMs: 0,
    warnings: [],
  };
}

/**
 * Helper to write multiple files' worth of nodes/refs to seeds.
 * Writes all data in a single batch to avoid merge issues.
 */
async function writeMultipleFiles(
  seedWriter: SeedWriter,
  nodes: ParsedNode[],
  edges: ParsedEdge[] = [],
  refs: ParsedExternalRef[] = []
): Promise<void> {
  // Write all data as a single parse result
  // The filePath is set to the first node's file_path for the result metadata
  const filePath = nodes.length > 0 ? nodes[0]?.file_path : "test.ts";
  const parseResult = createParseResult(nodes, edges, refs, filePath);
  await seedWriter.writeFile(parseResult);
}

describe("SymbolAffectedAnalyzer", () => {
  let pool: DuckDBPool;
  let tempDir: string;
  let packagePath: string;
  let seedWriter: SeedWriter;
  let seedReader: SeedReader;
  let analyzer: SymbolAffectedAnalyzer;

  beforeEach(async () => {
    // Create temp directory
    tempDir = path.join(
      "/tmp",
      `devac-test-symbol-affected-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    packagePath = path.join(tempDir, "test-package");
    await fs.mkdir(packagePath, { recursive: true });

    // Create DuckDB pool and initialize
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Create seed writer and reader
    seedWriter = createSeedWriter(pool, packagePath);
    seedReader = createSeedReader(pool, packagePath);

    // Create analyzer
    analyzer = createSymbolAffectedAnalyzer(pool, packagePath, seedReader);
  });

  afterEach(async () => {
    await pool.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("diffFileSymbols", () => {
    it("detects added exports when new symbols are introduced", async () => {
      // Setup: Write initial seeds with one exported function
      const initialNodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:abc123",
          name: "existingFunction",
          kind: "function",
          file_path: "src/utils.ts",
          source_file_hash: "hash1",
        }),
      ];

      await seedWriter.writeFile(createParseResult(initialNodes, [], [], "src/utils.ts"));

      // Simulate new file content with additional export
      const newNodes: ParsedNode[] = [
        ...initialNodes,
        createTestNode({
          entity_id: "test:test-package:function:def456",
          name: "newFunction",
          kind: "function",
          file_path: "src/utils.ts",
          source_file_hash: "hash2",
        }),
      ];

      // Call diffFileSymbols with the new parsed nodes
      const changes = await analyzer.diffFileSymbols("src/utils.ts", newNodes);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        entityId: "test:test-package:function:def456",
        name: "newFunction",
        kind: "function",
        changeType: "added",
        filePath: "src/utils.ts",
      });
    });

    it("detects removed exports when symbols are deleted", async () => {
      // Setup: Write initial seeds with two exported functions
      const initialNodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:abc123",
          name: "keepFunction",
          kind: "function",
          file_path: "src/utils.ts",
          source_file_hash: "hash1",
        }),
        createTestNode({
          entity_id: "test:test-package:function:def456",
          name: "removeFunction",
          kind: "function",
          file_path: "src/utils.ts",
          source_file_hash: "hash1",
        }),
      ];

      await seedWriter.writeFile(createParseResult(initialNodes, [], [], "src/utils.ts"));

      // Simulate file content with one function removed
      // Use same hash for unchanged node
      const newNodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:abc123",
          name: "keepFunction",
          kind: "function",
          file_path: "src/utils.ts",
          source_file_hash: "hash1", // Same hash as original
        }),
      ];

      const changes = await analyzer.diffFileSymbols("src/utils.ts", newNodes);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        entityId: "test:test-package:function:def456",
        name: "removeFunction",
        kind: "function",
        changeType: "removed",
        filePath: "src/utils.ts",
      });
    });

    it("detects modified exports when signature changes", async () => {
      // Setup: Write initial seeds with a function
      const initialNodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:abc123",
          name: "modifiedFunction",
          kind: "function",
          file_path: "src/utils.ts",
          source_file_hash: "hash1",
          properties: { returnType: "string" },
        }),
      ];

      await seedWriter.writeFile(createParseResult(initialNodes, [], [], "src/utils.ts"));

      // Simulate file content with modified return type
      const newNodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:abc123",
          name: "modifiedFunction",
          kind: "function",
          file_path: "src/utils.ts",
          source_file_hash: "hash2",
          properties: { returnType: "number" }, // Changed!
        }),
      ];

      const changes = await analyzer.diffFileSymbols("src/utils.ts", newNodes);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        entityId: "test:test-package:function:abc123",
        name: "modifiedFunction",
        kind: "function",
        changeType: "modified",
        filePath: "src/utils.ts",
      });
    });

    it("returns empty array when no exports changed", async () => {
      // Setup: Write initial seeds
      const initialNodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:abc123",
          name: "unchangedFunction",
          kind: "function",
          file_path: "src/utils.ts",
          source_file_hash: "hash1",
        }),
      ];

      await seedWriter.writeFile(createParseResult(initialNodes, [], [], "src/utils.ts"));

      // Same nodes, same content
      const changes = await analyzer.diffFileSymbols("src/utils.ts", initialNodes);

      expect(changes).toHaveLength(0);
    });

    it("handles file with no exports", async () => {
      // Setup: Write initial seeds with non-exported nodes
      const initialNodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:abc123",
          name: "privateFunction",
          kind: "function",
          file_path: "src/utils.ts",
          is_exported: false, // Not exported
          source_file_hash: "hash1",
        }),
      ];

      await seedWriter.writeFile(createParseResult(initialNodes, [], [], "src/utils.ts"));

      const changes = await analyzer.diffFileSymbols("src/utils.ts", initialNodes);

      // No changes to exports
      expect(changes).toHaveLength(0);
    });

    it("handles non-existent file gracefully", async () => {
      const changes = await analyzer.diffFileSymbols("src/nonexistent.ts", []);

      expect(changes).toHaveLength(0);
    });
  });

  describe("findSymbolImporters", () => {
    it("finds direct importers (1-hop)", async () => {
      // Setup: Create seeds with import relationships
      const nodes: ParsedNode[] = [
        // The exported symbol
        createTestNode({
          entity_id: "test:test-package:function:target123",
          name: "targetFunction",
          kind: "function",
          file_path: "src/shared/utils.ts",
          source_file_hash: "hash1",
        }),
        // A file that imports it
        createTestNode({
          entity_id: "test:test-package:function:importer1",
          name: "consumerA",
          kind: "function",
          file_path: "src/features/featureA.ts",
          source_file_hash: "hash2",
        }),
        // Another file that imports it
        createTestNode({
          entity_id: "test:test-package:function:importer2",
          name: "consumerB",
          kind: "function",
          file_path: "src/features/featureB.ts",
          source_file_hash: "hash3",
        }),
      ];

      // External refs showing imports
      const refs: ParsedExternalRef[] = [
        createTestRef({
          source_entity_id: "test:test-package:function:importer1",
          source_file_path: "src/features/featureA.ts",
          module_specifier: "../shared/utils",
          imported_symbol: "targetFunction",
          target_entity_id: "test:test-package:function:target123",
          source_file_hash: "hash2",
        }),
        createTestRef({
          source_entity_id: "test:test-package:function:importer2",
          source_file_path: "src/features/featureB.ts",
          module_specifier: "../shared/utils",
          imported_symbol: "targetFunction",
          target_entity_id: "test:test-package:function:target123",
          source_file_hash: "hash3",
        }),
      ];

      await writeMultipleFiles(seedWriter, nodes, [], refs);

      const affectedFiles = await analyzer.findSymbolImporters(
        ["test:test-package:function:target123"],
        { maxDepth: 1 }
      );

      expect(affectedFiles).toHaveLength(2);
      expect(affectedFiles.map((f) => f.filePath).sort()).toEqual([
        "src/features/featureA.ts",
        "src/features/featureB.ts",
      ]);
      expect(affectedFiles.every((f) => f.impactLevel === "direct")).toBe(true);
      expect(affectedFiles.every((f) => f.depth === 1)).toBe(true);
    });

    it("finds transitive importers (N-hop)", async () => {
      // Setup: A -> B -> C chain of imports
      const nodes: ParsedNode[] = [
        // Target (C)
        createTestNode({
          entity_id: "test:test-package:function:targetC",
          name: "functionC",
          kind: "function",
          file_path: "src/c.ts",
          source_file_hash: "hashC",
        }),
        // B imports C
        createTestNode({
          entity_id: "test:test-package:function:functionB",
          name: "functionB",
          kind: "function",
          file_path: "src/b.ts",
          source_file_hash: "hashB",
        }),
        // A imports B
        createTestNode({
          entity_id: "test:test-package:function:functionA",
          name: "functionA",
          kind: "function",
          file_path: "src/a.ts",
          source_file_hash: "hashA",
        }),
      ];

      const refs: ParsedExternalRef[] = [
        // B imports C
        createTestRef({
          source_entity_id: "test:test-package:function:functionB",
          source_file_path: "src/b.ts",
          module_specifier: "./c",
          imported_symbol: "functionC",
          target_entity_id: "test:test-package:function:targetC",
          source_file_hash: "hashB",
        }),
        // A imports B
        createTestRef({
          source_entity_id: "test:test-package:function:functionA",
          source_file_path: "src/a.ts",
          module_specifier: "./b",
          imported_symbol: "functionB",
          target_entity_id: "test:test-package:function:functionB",
          source_file_hash: "hashA",
        }),
      ];

      await writeMultipleFiles(seedWriter, nodes, [], refs);

      // Find with depth 2 to get transitive imports
      const affectedFiles = await analyzer.findSymbolImporters(
        ["test:test-package:function:targetC"],
        { maxDepth: 2, includeTransitive: true }
      );

      expect(affectedFiles).toHaveLength(2);

      const fileB = affectedFiles.find((f) => f.filePath === "src/b.ts");
      const fileA = affectedFiles.find((f) => f.filePath === "src/a.ts");

      expect(fileB).toBeDefined();
      expect(fileB?.impactLevel).toBe("direct");
      expect(fileB?.depth).toBe(1);

      expect(fileA).toBeDefined();
      expect(fileA?.impactLevel).toBe("transitive");
      expect(fileA?.depth).toBe(2);
    });

    it("respects depth limit", async () => {
      // Setup: Same A -> B -> C chain
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:targetC",
          name: "functionC",
          kind: "function",
          file_path: "src/c.ts",
          source_file_hash: "hashC",
        }),
        createTestNode({
          entity_id: "test:test-package:function:functionB",
          name: "functionB",
          kind: "function",
          file_path: "src/b.ts",
          source_file_hash: "hashB",
        }),
        createTestNode({
          entity_id: "test:test-package:function:functionA",
          name: "functionA",
          kind: "function",
          file_path: "src/a.ts",
          source_file_hash: "hashA",
        }),
      ];

      const refs: ParsedExternalRef[] = [
        createTestRef({
          source_entity_id: "test:test-package:function:functionB",
          source_file_path: "src/b.ts",
          module_specifier: "./c",
          imported_symbol: "functionC",
          target_entity_id: "test:test-package:function:targetC",
          source_file_hash: "hashB",
        }),
        createTestRef({
          source_entity_id: "test:test-package:function:functionA",
          source_file_path: "src/a.ts",
          module_specifier: "./b",
          imported_symbol: "functionB",
          target_entity_id: "test:test-package:function:functionB",
          source_file_hash: "hashA",
        }),
      ];

      await writeMultipleFiles(seedWriter, nodes, [], refs);

      // Find with depth 1 only - should not include A
      const affectedFiles = await analyzer.findSymbolImporters(
        ["test:test-package:function:targetC"],
        { maxDepth: 1 }
      );

      expect(affectedFiles).toHaveLength(1);
      expect(affectedFiles[0]?.filePath).toBe("src/b.ts");
    });

    it("handles circular dependencies", async () => {
      // Setup: A -> B -> A (circular)
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:functionA",
          name: "functionA",
          kind: "function",
          file_path: "src/a.ts",
          source_file_hash: "hashA",
        }),
        createTestNode({
          entity_id: "test:test-package:function:functionB",
          name: "functionB",
          kind: "function",
          file_path: "src/b.ts",
          source_file_hash: "hashB",
        }),
      ];

      const refs: ParsedExternalRef[] = [
        // A imports B
        createTestRef({
          source_entity_id: "test:test-package:function:functionA",
          source_file_path: "src/a.ts",
          module_specifier: "./b",
          imported_symbol: "functionB",
          target_entity_id: "test:test-package:function:functionB",
          source_file_hash: "hashA",
        }),
        // B imports A (circular)
        createTestRef({
          source_entity_id: "test:test-package:function:functionB",
          source_file_path: "src/b.ts",
          module_specifier: "./a",
          imported_symbol: "functionA",
          target_entity_id: "test:test-package:function:functionA",
          source_file_hash: "hashB",
        }),
      ];

      await writeMultipleFiles(seedWriter, nodes, [], refs);

      // Should not infinite loop
      const affectedFiles = await analyzer.findSymbolImporters(
        ["test:test-package:function:functionA"],
        { maxDepth: 10, includeTransitive: true }
      );

      // B imports A directly
      expect(affectedFiles).toHaveLength(1);
      expect(affectedFiles[0]?.filePath).toBe("src/b.ts");
    });

    it("returns empty array when no importers found", async () => {
      // Setup: isolated symbol with no imports
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:isolated",
          name: "isolatedFunction",
          kind: "function",
          file_path: "src/isolated.ts",
          source_file_hash: "hash1",
        }),
      ];

      await writeMultipleFiles(seedWriter, nodes, [], []);

      const affectedFiles = await analyzer.findSymbolImporters([
        "test:test-package:function:isolated",
      ]);

      expect(affectedFiles).toHaveLength(0);
    });
  });

  describe("analyzeFileChanges", () => {
    it("orchestrates diff + importer finding", async () => {
      // Setup: Target file with one export, imported by two files
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target",
          name: "targetFunction",
          kind: "function",
          file_path: "src/target.ts",
          source_file_hash: "hash1",
        }),
        createTestNode({
          entity_id: "test:test-package:function:consumer1",
          name: "consumer1",
          kind: "function",
          file_path: "src/consumer1.ts",
          source_file_hash: "hash2",
        }),
        createTestNode({
          entity_id: "test:test-package:function:consumer2",
          name: "consumer2",
          kind: "function",
          file_path: "src/consumer2.ts",
          source_file_hash: "hash3",
        }),
      ];

      const refs: ParsedExternalRef[] = [
        createTestRef({
          source_entity_id: "test:test-package:function:consumer1",
          source_file_path: "src/consumer1.ts",
          module_specifier: "./target",
          imported_symbol: "targetFunction",
          target_entity_id: "test:test-package:function:target",
          source_file_hash: "hash2",
        }),
        createTestRef({
          source_entity_id: "test:test-package:function:consumer2",
          source_file_path: "src/consumer2.ts",
          module_specifier: "./target",
          imported_symbol: "targetFunction",
          target_entity_id: "test:test-package:function:target",
          source_file_hash: "hash3",
        }),
      ];

      await writeMultipleFiles(seedWriter, nodes, [], refs);

      // Simulate modifying the target file
      const modifiedNodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target",
          name: "targetFunction",
          kind: "function",
          file_path: "src/target.ts",
          source_file_hash: "hash1-modified", // Changed!
          properties: { returnType: "number" }, // Signature change
        }),
      ];

      const result = await analyzer.analyzeFileChanges(["src/target.ts"], {
        "src/target.ts": modifiedNodes,
      });

      expect(result.changedSymbols).toHaveLength(1);
      expect(result.changedSymbols[0]?.name).toBe("targetFunction");
      expect(result.changedSymbols[0]?.changeType).toBe("modified");

      expect(result.affectedFiles).toHaveLength(2);
      expect(result.affectedFiles.map((f) => f.filePath).sort()).toEqual([
        "src/consumer1.ts",
        "src/consumer2.ts",
      ]);

      expect(result.totalAffected).toBe(2);
      expect(result.analysisTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("handles multiple changed files", async () => {
      // Setup: Two target files
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target1",
          name: "targetFunction1",
          kind: "function",
          file_path: "src/target1.ts",
          source_file_hash: "hash1",
        }),
        createTestNode({
          entity_id: "test:test-package:function:target2",
          name: "targetFunction2",
          kind: "function",
          file_path: "src/target2.ts",
          source_file_hash: "hash2",
        }),
        createTestNode({
          entity_id: "test:test-package:function:consumer",
          name: "consumer",
          kind: "function",
          file_path: "src/consumer.ts",
          source_file_hash: "hash3",
        }),
      ];

      const refs: ParsedExternalRef[] = [
        createTestRef({
          source_entity_id: "test:test-package:function:consumer",
          source_file_path: "src/consumer.ts",
          module_specifier: "./target1",
          imported_symbol: "targetFunction1",
          target_entity_id: "test:test-package:function:target1",
          source_file_hash: "hash3",
        }),
        createTestRef({
          source_entity_id: "test:test-package:function:consumer",
          source_file_path: "src/consumer.ts",
          module_specifier: "./target2",
          imported_symbol: "targetFunction2",
          target_entity_id: "test:test-package:function:target2",
          source_file_hash: "hash3",
        }),
      ];

      await writeMultipleFiles(seedWriter, nodes, [], refs);

      // Modify both target files (change source_file_hash to indicate content change)
      const target1Node = nodes[0];
      const target2Node = nodes[1];
      if (!target1Node || !target2Node) {
        throw new Error("Test setup error: expected nodes to be defined");
      }
      const result = await analyzer.analyzeFileChanges(["src/target1.ts", "src/target2.ts"], {
        "src/target1.ts": [
          {
            ...target1Node,
            source_file_hash: "hash1-modified",
          },
        ],
        "src/target2.ts": [
          {
            ...target2Node,
            source_file_hash: "hash2-modified",
          },
        ],
      });

      expect(result.changedSymbols).toHaveLength(2);
      // Consumer is affected by both, but should only appear once
      expect(result.affectedFiles).toHaveLength(1);
      expect(result.affectedFiles[0]?.filePath).toBe("src/consumer.ts");
    });

    it("returns timing metrics", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:simple",
          name: "simpleFunction",
          kind: "function",
          file_path: "src/simple.ts",
          source_file_hash: "hash1",
        }),
      ];

      await writeMultipleFiles(seedWriter, nodes, [], []);

      const result = await analyzer.analyzeFileChanges(["src/simple.ts"], {
        "src/simple.ts": nodes,
      });

      expect(typeof result.analysisTimeMs).toBe("number");
      expect(result.analysisTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.truncated).toBe(false);
    });
  });
});
