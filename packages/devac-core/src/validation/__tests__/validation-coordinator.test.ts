/**
 * Validation Coordinator Tests
 *
 * Tests for orchestrating validation flow.
 * Based on DevAC v2.0 spec Section 10.2.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StructuralParseResult } from "../../parsers/parser-interface.js";
import { DuckDBPool } from "../../storage/duckdb-pool.js";
import { type SeedReader, createSeedReader } from "../../storage/seed-reader.js";
import { type SeedWriter, createSeedWriter } from "../../storage/seed-writer.js";
import type { ParsedEdge, ParsedExternalRef, ParsedNode } from "../../types/index.js";
import {
  type ValidationConfig,
  type ValidationCoordinator,
  createValidationCoordinator,
} from "../validation-coordinator.js";

/**
 * Helper to create a properly typed ParsedNode for testing
 */
function createTestNode(partial: {
  entity_id: string;
  name: string;
  kind: string;
  file_path: string;
  start_line?: number;
  end_line?: number;
  is_exported?: boolean;
  source_file_hash?: string;
}): ParsedNode {
  return {
    entity_id: partial.entity_id,
    name: partial.name,
    qualified_name: partial.name,
    kind: partial.kind,
    file_path: partial.file_path,
    start_line: partial.start_line ?? 1,
    end_line: partial.end_line ?? 10,
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
    properties: {},
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

describe("ValidationCoordinator", () => {
  let pool: DuckDBPool;
  let tempDir: string;
  let packagePath: string;
  let seedWriter: SeedWriter;
  let seedReader: SeedReader;
  let coordinator: ValidationCoordinator;

  beforeEach(async () => {
    // Create temp directory
    tempDir = path.join(
      "/tmp",
      `devac-test-coordinator-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    packagePath = path.join(tempDir, "test-package");
    await fs.mkdir(packagePath, { recursive: true });

    // Create basic TypeScript project structure
    await fs.mkdir(path.join(packagePath, "src"), { recursive: true });

    // Create tsconfig.json
    await fs.writeFile(
      path.join(packagePath, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            noEmit: true,
            skipLibCheck: true,
          },
          include: ["src/**/*.ts"],
        },
        null,
        2
      )
    );

    // Create package.json
    await fs.writeFile(
      path.join(packagePath, "package.json"),
      JSON.stringify(
        {
          name: "test-package",
          type: "module",
        },
        null,
        2
      )
    );

    // Create DuckDB pool and initialize
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Create seed writer and reader
    seedWriter = createSeedWriter(pool, packagePath);
    seedReader = createSeedReader(pool, packagePath);

    // Create coordinator
    coordinator = createValidationCoordinator(pool, packagePath, seedReader);
  });

  afterEach(async () => {
    await pool.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validate", () => {
    it("returns proper result structure", async () => {
      // Create a simple TypeScript file
      await fs.writeFile(path.join(packagePath, "src", "index.ts"), "export const x: number = 42;");

      const result = await coordinator.validate(["src/index.ts"], packagePath);

      expect(result.mode).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.affected).toBeDefined();
      expect(result.totalIssues).toBeDefined();
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("runs typecheck validation", async () => {
      // Create a TypeScript file with an error
      await fs.writeFile(
        path.join(packagePath, "src", "error.ts"),
        `export const x: number = "not a number";`
      );

      const result = await coordinator.validate(["src/error.ts"], packagePath, {
        runTypecheck: true,
        runLint: false,
        runTests: false,
      });

      expect(result.typecheck).toBeDefined();
      expect(result.typecheck?.success).toBe(false);
      expect(result.typecheck?.issues.length).toBeGreaterThan(0);
    });

    it("aggregates issues from multiple validators", async () => {
      await fs.writeFile(
        path.join(packagePath, "src", "multi.ts"),
        `export const x: number = "wrong";` // type error
      );

      const result = await coordinator.validate(["src/multi.ts"], packagePath, {
        runTypecheck: true,
        runLint: false,
        runTests: false,
      });

      // Should have issues from typecheck
      expect(result.totalIssues).toBeGreaterThan(0);
    });

    it("respects validation config", async () => {
      await fs.writeFile(path.join(packagePath, "src", "valid.ts"), "export const x: number = 42;");

      const config: Partial<ValidationConfig> = {
        runTypecheck: true,
        runLint: false,
        runTests: false,
      };

      const result = await coordinator.validate(["src/valid.ts"], packagePath, config);

      expect(result.typecheck).toBeDefined();
      expect(result.lint).toBeUndefined();
      expect(result.tests).toBeUndefined();
    });
  });

  describe("validateQuick", () => {
    it("runs in quick mode with 1-hop depth", async () => {
      await fs.writeFile(path.join(packagePath, "src", "index.ts"), "export const x = 1;");

      const result = await coordinator.validateQuick(["src/index.ts"], packagePath);

      expect(result.mode).toBe("quick");
      // Quick mode should not run tests
      expect(result.tests).toBeUndefined();
    });

    it("completes quickly for simple changes", async () => {
      await fs.writeFile(path.join(packagePath, "src", "simple.ts"), "export const simple = true;");

      const startTime = Date.now();
      const result = await coordinator.validateQuick(["src/simple.ts"], packagePath);
      const elapsed = Date.now() - startTime;

      // Quick mode should be reasonably fast (less than 10 seconds for simple file)
      expect(elapsed).toBeLessThan(10000);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("validateFull", () => {
    it("runs in full mode with N-hop depth", async () => {
      await fs.writeFile(path.join(packagePath, "src", "index.ts"), "export const x = 1;");

      const result = await coordinator.validateFull(["src/index.ts"], packagePath);

      expect(result.mode).toBe("full");
    });

    it("includes all validation types", async () => {
      await fs.writeFile(path.join(packagePath, "src", "full.ts"), "export const full = true;");

      const result = await coordinator.validateFull(["src/full.ts"], packagePath);

      // Full mode should have typecheck at minimum
      expect(result.typecheck).toBeDefined();
    });
  });

  describe("affected analysis", () => {
    it("includes affected files in result", async () => {
      // Setup: Create seeds with import relationships
      const nodes: ParsedNode[] = [
        createTestNode({
          entity_id: "test:test-package:function:target",
          name: "targetFunction",
          kind: "function",
          file_path: "src/target.ts",
        }),
        createTestNode({
          entity_id: "test:test-package:function:consumer",
          name: "consumer",
          kind: "function",
          file_path: "src/consumer.ts",
        }),
      ];

      await seedWriter.writeFile(createParseResult(nodes, [], [], "src/target.ts"));

      // Create actual files
      await fs.writeFile(
        path.join(packagePath, "src", "target.ts"),
        "export function targetFunction(): number { return 42; }"
      );
      await fs.writeFile(
        path.join(packagePath, "src", "consumer.ts"),
        `import { targetFunction } from './target';
export const result = targetFunction();`
      );

      const result = await coordinator.validate(["src/target.ts"], packagePath);

      expect(result.affected).toBeDefined();
      expect(result.affected.analysisTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("mode configuration", () => {
    it("quick mode has correct defaults", () => {
      const quickConfig = coordinator.getQuickModeConfig();

      expect(quickConfig.maxDepth).toBe(1);
      expect(quickConfig.runTests).toBe(false);
      expect(quickConfig.runTypecheck).toBe(true);
      expect(quickConfig.runLint).toBe(true);
    });

    it("full mode has correct defaults", () => {
      const fullConfig = coordinator.getFullModeConfig();

      expect(fullConfig.maxDepth).toBe(10);
      expect(fullConfig.runTests).toBe(true);
      expect(fullConfig.runTypecheck).toBe(true);
      expect(fullConfig.runLint).toBe(true);
    });
  });

  describe("error handling", () => {
    it("handles missing files gracefully", async () => {
      const result = await coordinator.validate(["src/nonexistent.ts"], packagePath);

      // Should not throw, should return result with affected analysis
      expect(result).toBeDefined();
      expect(result.affected).toBeDefined();
    });

    it("continues validation even if one validator fails", async () => {
      await fs.writeFile(path.join(packagePath, "src", "valid.ts"), "export const x = 1;");

      // Even if lint fails to find config, typecheck should still run
      const result = await coordinator.validate(["src/valid.ts"], packagePath, {
        runTypecheck: true,
        runLint: true,
        runTests: false,
      });

      expect(result).toBeDefined();
      expect(result.typecheck).toBeDefined();
    });
  });

  describe("timing", () => {
    it("tracks individual validator timing", async () => {
      await fs.writeFile(path.join(packagePath, "src", "timed.ts"), "export const x = 1;");

      const result = await coordinator.validate(["src/timed.ts"], packagePath, {
        runTypecheck: true,
        runLint: false,
        runTests: false,
      });

      expect(result.typecheck?.timeMs).toBeGreaterThanOrEqual(0);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("total time includes all validators", async () => {
      await fs.writeFile(path.join(packagePath, "src", "total.ts"), "export const x = 1;");

      const result = await coordinator.validate(["src/total.ts"], packagePath, {
        runTypecheck: true,
        runLint: false,
        runTests: false,
      });

      // Total time should be at least the typecheck time
      if (result.typecheck) {
        expect(result.totalTimeMs).toBeGreaterThanOrEqual(result.typecheck.timeMs);
      }
    });
  });
});
