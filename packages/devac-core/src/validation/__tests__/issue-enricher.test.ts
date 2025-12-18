/**
 * Issue Enricher Tests
 *
 * Tests for validation issue enrichment with CodeGraph context.
 * Based on DevAC v2.0 spec Section 10.3.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StructuralParseResult } from "../../parsers/parser-interface.js";
import { DuckDBPool } from "../../storage/duckdb-pool.js";
import { type SeedReader, createSeedReader } from "../../storage/seed-reader.js";
import { type SeedWriter, createSeedWriter } from "../../storage/seed-writer.js";
import type {
  EdgeType,
  NodeKind,
  ParsedEdge,
  ParsedExternalRef,
  ParsedNode,
} from "../../types/index.js";
import {
  type EnrichedIssue,
  type EnrichmentOptions,
  type IssueEnricher,
  type ValidationIssue,
  createIssueEnricher,
} from "../issue-enricher.js";

/**
 * Helper to create a properly typed ParsedNode for testing
 */
function createTestNode(partial: {
  entity_id: string;
  name: string;
  kind: NodeKind;
  file_path: string;
  start_line?: number;
  end_line?: number;
  start_column?: number;
  end_column?: number;
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
    start_line: partial.start_line ?? 1,
    end_line: partial.end_line ?? 10,
    start_column: partial.start_column ?? 0,
    end_column: partial.end_column ?? 1,
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
 * Helper to create a properly typed ParsedEdge for testing
 */
function createTestEdge(partial: {
  source_entity_id: string;
  target_entity_id: string;
  edge_type: EdgeType;
  source_file_hash?: string;
}): ParsedEdge {
  return {
    source_entity_id: partial.source_entity_id,
    target_entity_id: partial.target_entity_id,
    edge_type: partial.edge_type,
    source_file_path: "test.ts",
    source_line: 1,
    source_column: 0,
    properties: {},
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
    sourceFileHash: `test-hash-${Date.now()}`,
    filePath,
    parseTimeMs: 0,
    warnings: [],
  };
}

/**
 * Helper to create a ValidationIssue for testing
 */
function createValidationIssue(partial: Partial<ValidationIssue> = {}): ValidationIssue {
  return {
    file: partial.file ?? "src/test.ts",
    line: partial.line ?? 10,
    column: partial.column ?? 5,
    message: partial.message ?? "Test error message",
    severity: partial.severity ?? "error",
    source: partial.source ?? "tsc",
    code: partial.code ?? "TS2345",
  };
}

describe("IssueEnricher", () => {
  let pool: DuckDBPool;
  let tempDir: string;
  let packagePath: string;
  let seedWriter: SeedWriter;
  let seedReader: SeedReader;
  let enricher: IssueEnricher;

  beforeEach(async () => {
    // Create temp directory
    tempDir = path.join(
      "/tmp",
      `devac-test-issue-enricher-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    packagePath = path.join(tempDir, "test-package");
    await fs.mkdir(packagePath, { recursive: true });

    // Create DuckDB pool and initialize
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Create seed writer and reader
    seedWriter = createSeedWriter(pool, packagePath);
    seedReader = createSeedReader(pool, packagePath);

    // Create enricher
    enricher = createIssueEnricher(seedReader);
  });

  afterEach(async () => {
    await pool.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("findSymbolAtLocation", () => {
    it("finds symbol containing the specified line and column", async () => {
      // Setup: Create a node that spans lines 5-15
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:abc123",
          name: "targetFunction",
          kind: "function",
          file_path: "src/utils.ts",
          start_line: 5,
          end_line: 15,
          start_column: 0,
          end_column: 1,
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, [], [], "src/utils.ts"));

      // Look for symbol at line 10, column 5 (inside the function)
      const symbol = await enricher.findSymbolAtLocation("src/utils.ts", 10, 5);

      expect(symbol).toBeDefined();
      expect(symbol?.entityId).toBe("test:test-package:function:abc123");
      expect(symbol?.name).toBe("targetFunction");
      expect(symbol?.kind).toBe("function");
    });

    it("finds innermost symbol when multiple symbols contain location", async () => {
      // Setup: Nested symbols - class containing method
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:class:outer",
          name: "OuterClass",
          kind: "class",
          file_path: "src/service.ts",
          start_line: 1,
          end_line: 50,
          start_column: 0,
          end_column: 1,
        }),
        createTestNode({
          entity_id: "test:test-package:method:inner",
          name: "innerMethod",
          kind: "method",
          file_path: "src/service.ts",
          start_line: 10,
          end_line: 20,
          start_column: 2,
          end_column: 3,
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, [], [], "src/service.ts"));

      // Look for symbol at line 15 (inside the method)
      const symbol = await enricher.findSymbolAtLocation("src/service.ts", 15, 5);

      expect(symbol).toBeDefined();
      expect(symbol?.name).toBe("innerMethod");
      expect(symbol?.kind).toBe("method");
    });

    it("returns null when no symbol at location", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:abc123",
          name: "someFunction",
          kind: "function",
          file_path: "src/utils.ts",
          start_line: 1,
          end_line: 10,
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, [], [], "src/utils.ts"));

      // Look for symbol at line 100 (outside any symbol)
      const symbol = await enricher.findSymbolAtLocation("src/utils.ts", 100, 0);

      expect(symbol).toBeNull();
    });

    it("returns null for non-existent file", async () => {
      const symbol = await enricher.findSymbolAtLocation("src/nonexistent.ts", 10, 5);

      expect(symbol).toBeNull();
    });
  });

  describe("getCallers", () => {
    it("finds functions that call the target symbol", async () => {
      // Setup: Target function and callers
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target",
          name: "targetFunction",
          kind: "function",
          file_path: "src/target.ts",
        }),
        createTestNode({
          entity_id: "test:test-package:function:caller1",
          name: "caller1",
          kind: "function",
          file_path: "src/caller1.ts",
        }),
        createTestNode({
          entity_id: "test:test-package:function:caller2",
          name: "caller2",
          kind: "function",
          file_path: "src/caller2.ts",
        }),
      ];

      // CALLS edges from callers to target
      const edges: ParsedEdge[] = [
        createTestEdge({
          source_entity_id: "test:test-package:function:caller1",
          target_entity_id: "test:test-package:function:target",
          edge_type: "CALLS",
        }),
        createTestEdge({
          source_entity_id: "test:test-package:function:caller2",
          target_entity_id: "test:test-package:function:target",
          edge_type: "CALLS",
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, edges, [], "src/target.ts"));

      const callers = await enricher.getCallers("test:test-package:function:target");

      expect(callers).toHaveLength(2);
      expect(callers.map((c) => c.name).sort()).toEqual(["caller1", "caller2"]);
      expect(callers.every((c) => c.entityId && c.filePath)).toBe(true);
    });

    it("returns empty array when no callers exist", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:isolated",
          name: "isolatedFunction",
          kind: "function",
          file_path: "src/isolated.ts",
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, [], [], "src/isolated.ts"));

      const callers = await enricher.getCallers("test:test-package:function:isolated");

      expect(callers).toHaveLength(0);
    });

    it("respects limit option", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target",
          name: "targetFunction",
          kind: "function",
          file_path: "src/target.ts",
        }),
        ...Array.from({ length: 10 }, (_, i) =>
          createTestNode({
            entity_id: `test:test-package:function:caller${i}`,
            name: `caller${i}`,
            kind: "function",
            file_path: `src/caller${i}.ts`,
          })
        ),
      ];

      const edges: ParsedEdge[] = Array.from({ length: 10 }, (_, i) =>
        createTestEdge({
          source_entity_id: `test:test-package:function:caller${i}`,
          target_entity_id: "test:test-package:function:target",
          edge_type: "CALLS",
        })
      );

      await seedWriter.writeFile(createParseResult(nodes, edges, [], "src/target.ts"));

      const callers = await enricher.getCallers("test:test-package:function:target", { limit: 3 });

      expect(callers).toHaveLength(3);
    });
  });

  describe("getDependentFiles", () => {
    it("finds files that import the target symbol", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target",
          name: "targetFunction",
          kind: "function",
          file_path: "src/shared/utils.ts",
        }),
        createTestNode({
          entity_id: "test:test-package:function:consumer1",
          name: "consumer1",
          kind: "function",
          file_path: "src/features/a.ts",
        }),
        createTestNode({
          entity_id: "test:test-package:function:consumer2",
          name: "consumer2",
          kind: "function",
          file_path: "src/features/b.ts",
        }),
      ];

      const refs: ParsedExternalRef[] = [
        createTestRef({
          source_entity_id: "test:test-package:function:consumer1",
          source_file_path: "src/features/a.ts",
          module_specifier: "../shared/utils",
          imported_symbol: "targetFunction",
          target_entity_id: "test:test-package:function:target",
        }),
        createTestRef({
          source_entity_id: "test:test-package:function:consumer2",
          source_file_path: "src/features/b.ts",
          module_specifier: "../shared/utils",
          imported_symbol: "targetFunction",
          target_entity_id: "test:test-package:function:target",
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, [], refs, "src/shared/utils.ts"));

      const dependentFiles = await enricher.getDependentFiles("test:test-package:function:target");

      expect(dependentFiles).toHaveLength(2);
      expect(dependentFiles.sort()).toEqual(["src/features/a.ts", "src/features/b.ts"]);
    });

    it("returns empty array when no dependents exist", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:isolated",
          name: "isolatedFunction",
          kind: "function",
          file_path: "src/isolated.ts",
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, [], [], "src/isolated.ts"));

      const dependentFiles = await enricher.getDependentFiles(
        "test:test-package:function:isolated"
      );

      expect(dependentFiles).toHaveLength(0);
    });
  });

  describe("enrichIssue", () => {
    it("enriches issue with symbol context when symbol found at location", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:problematic",
          name: "problematicFunction",
          kind: "function",
          file_path: "src/utils.ts",
          start_line: 5,
          end_line: 20,
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, [], [], "src/utils.ts"));

      const issue = createValidationIssue({
        file: "src/utils.ts",
        line: 10,
        column: 5,
        message: "Type mismatch",
        source: "tsc",
      });

      const enriched = await enricher.enrichIssue(issue, packagePath);

      expect(enriched.affectedSymbol).toBeDefined();
      expect(enriched.affectedSymbol?.name).toBe("problematicFunction");
      expect(enriched.affectedSymbol?.kind).toBe("function");
    });

    it("enriches issue with callers when symbol has callers", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target",
          name: "targetFunction",
          kind: "function",
          file_path: "src/target.ts",
          start_line: 1,
          end_line: 20,
        }),
        createTestNode({
          entity_id: "test:test-package:function:caller",
          name: "callerFunction",
          kind: "function",
          file_path: "src/caller.ts",
        }),
      ];

      const edges: ParsedEdge[] = [
        createTestEdge({
          source_entity_id: "test:test-package:function:caller",
          target_entity_id: "test:test-package:function:target",
          edge_type: "CALLS",
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, edges, [], "src/target.ts"));

      const issue = createValidationIssue({
        file: "src/target.ts",
        line: 10,
      });

      const enriched = await enricher.enrichIssue(issue, packagePath);

      expect(enriched.callers).toBeDefined();
      expect(enriched.callers).toHaveLength(1);
      expect(enriched.callers?.[0]!.name).toBe("callerFunction");
    });

    it("enriches issue with dependent files when symbol is imported", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target",
          name: "targetFunction",
          kind: "function",
          file_path: "src/target.ts",
          start_line: 1,
          end_line: 20,
        }),
        createTestNode({
          entity_id: "test:test-package:function:consumer",
          name: "consumerFunction",
          kind: "function",
          file_path: "src/consumer.ts",
        }),
      ];

      const refs: ParsedExternalRef[] = [
        createTestRef({
          source_entity_id: "test:test-package:function:consumer",
          source_file_path: "src/consumer.ts",
          module_specifier: "./target",
          imported_symbol: "targetFunction",
          target_entity_id: "test:test-package:function:target",
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, [], refs, "src/target.ts"));

      const issue = createValidationIssue({
        file: "src/target.ts",
        line: 10,
      });

      const enriched = await enricher.enrichIssue(issue, packagePath);

      expect(enriched.dependentFiles).toBeDefined();
      expect(enriched.dependentFiles).toContain("src/consumer.ts");
      expect(enriched.dependentCount).toBe(1);
    });

    it("generates LLM-ready prompt markdown", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target",
          name: "targetFunction",
          kind: "function",
          file_path: "src/target.ts",
          start_line: 1,
          end_line: 20,
        }),
        createTestNode({
          entity_id: "test:test-package:function:caller",
          name: "callerFunction",
          kind: "function",
          file_path: "src/caller.ts",
        }),
      ];

      const edges: ParsedEdge[] = [
        createTestEdge({
          source_entity_id: "test:test-package:function:caller",
          target_entity_id: "test:test-package:function:target",
          edge_type: "CALLS",
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, edges, [], "src/target.ts"));

      const issue = createValidationIssue({
        file: "src/target.ts",
        line: 10,
        message: "Argument of type 'string' is not assignable to parameter of type 'number'",
        source: "tsc",
        code: "TS2345",
      });

      const enriched = await enricher.enrichIssue(issue, packagePath);

      expect(enriched.promptMarkdown).toBeDefined();
      expect(enriched.promptMarkdown).toContain("## Validation Issue");
      expect(enriched.promptMarkdown).toContain("src/target.ts");
      expect(enriched.promptMarkdown).toContain("10"); // line
      expect(enriched.promptMarkdown).toContain("Argument of type");
      expect(enriched.promptMarkdown).toContain("targetFunction");
      expect(enriched.promptMarkdown).toContain("callerFunction");
    });

    it("handles issue with no matching symbol gracefully", async () => {
      const issue = createValidationIssue({
        file: "src/nonexistent.ts",
        line: 10,
        message: "Some error",
      });

      const enriched = await enricher.enrichIssue(issue, packagePath);

      expect(enriched.affectedSymbol).toBeUndefined();
      expect(enriched.callers).toBeUndefined();
      expect(enriched.dependentFiles).toBeUndefined();
      // Should still have base issue properties
      expect(enriched.file).toBe("src/nonexistent.ts");
      expect(enriched.message).toBe("Some error");
      // Should still generate minimal prompt
      expect(enriched.promptMarkdown).toBeDefined();
      expect(enriched.promptMarkdown).toContain("## Validation Issue");
    });
  });

  describe("enrichIssues", () => {
    it("enriches multiple issues", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:func1",
          name: "function1",
          kind: "function",
          file_path: "src/file1.ts",
          start_line: 1,
          end_line: 20,
        }),
        createTestNode({
          entity_id: "test:test-package:function:func2",
          name: "function2",
          kind: "function",
          file_path: "src/file2.ts",
          start_line: 1,
          end_line: 20,
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, [], [], "src/file1.ts"));

      const issues: ValidationIssue[] = [
        createValidationIssue({
          file: "src/file1.ts",
          line: 10,
          message: "Error 1",
        }),
        createValidationIssue({
          file: "src/file2.ts",
          line: 15,
          message: "Error 2",
        }),
      ];

      const enriched = await enricher.enrichIssues(issues, packagePath);

      expect(enriched).toHaveLength(2);
      expect(enriched[0]!.affectedSymbol?.name).toBe("function1");
      expect(enriched[1]!.affectedSymbol?.name).toBe("function2");
    });

    it("respects enrichment options", async () => {
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target",
          name: "targetFunction",
          kind: "function",
          file_path: "src/target.ts",
          start_line: 1,
          end_line: 20,
        }),
        createTestNode({
          entity_id: "test:test-package:function:caller",
          name: "callerFunction",
          kind: "function",
          file_path: "src/caller.ts",
        }),
      ];

      const edges: ParsedEdge[] = [
        createTestEdge({
          source_entity_id: "test:test-package:function:caller",
          target_entity_id: "test:test-package:function:target",
          edge_type: "CALLS",
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, edges, [], "src/target.ts"));

      const issues: ValidationIssue[] = [
        createValidationIssue({
          file: "src/target.ts",
          line: 10,
        }),
      ];

      // Disable callers lookup
      const options: EnrichmentOptions = {
        includeCallers: false,
        includeDependents: true,
      };

      const enriched = await enricher.enrichIssues(issues, packagePath, options);

      expect(enriched[0]!.affectedSymbol).toBeDefined();
      expect(enriched[0]!.callers).toBeUndefined(); // Disabled
    });
  });

  describe("generatePrompt", () => {
    it("generates markdown with all enrichment data", async () => {
      const enrichedIssue: EnrichedIssue = {
        file: "src/utils.ts",
        line: 42,
        column: 10,
        message: "Cannot find name 'foo'",
        severity: "error",
        source: "tsc",
        code: "TS2304",
        affectedSymbol: {
          entityId: "test:pkg:function:xyz",
          name: "processData",
          kind: "function",
        },
        callers: [
          { entityId: "test:pkg:function:a", name: "handleRequest", filePath: "src/api.ts" },
          { entityId: "test:pkg:function:b", name: "handleEvent", filePath: "src/events.ts" },
        ],
        dependentFiles: ["src/api.ts", "src/events.ts", "src/index.ts"],
        dependentCount: 3,
        promptMarkdown: "", // Will be generated
      };

      const prompt = enricher.generatePrompt(enrichedIssue);

      expect(prompt).toContain("## Validation Issue");
      expect(prompt).toContain("**File:** `src/utils.ts`");
      expect(prompt).toContain("**Line:** 42");
      expect(prompt).toContain("Cannot find name 'foo'");
      expect(prompt).toContain("### Affected Symbol");
      expect(prompt).toContain("`processData` (function)");
      expect(prompt).toContain("### Called By");
      expect(prompt).toContain("handleRequest");
      expect(prompt).toContain("handleEvent");
      expect(prompt).toContain("### Files That May Be Affected");
      expect(prompt).toContain("src/api.ts");
    });

    it("generates minimal prompt when no enrichment data", () => {
      const issue: EnrichedIssue = {
        file: "src/test.ts",
        line: 10,
        column: 5,
        message: "Some error",
        severity: "error",
        source: "eslint",
        promptMarkdown: "",
      };

      const prompt = enricher.generatePrompt(issue);

      expect(prompt).toContain("## Validation Issue");
      expect(prompt).toContain("**File:** `src/test.ts`");
      expect(prompt).toContain("Some error");
      expect(prompt).not.toContain("### Affected Symbol");
      expect(prompt).not.toContain("### Called By");
    });
  });
});
