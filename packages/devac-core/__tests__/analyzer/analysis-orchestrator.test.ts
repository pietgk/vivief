/**
 * Analysis Orchestrator Tests
 *
 * Tests for the analysis pipeline orchestrator.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FileChangeEvent,
  type OrchestratorOptions,
  createAnalysisOrchestrator,
} from "../../src/analyzer/analysis-orchestrator.js";
import type { LanguageRouter } from "../../src/analyzer/language-router.js";
import type { StructuralParseResult } from "../../src/parsers/parser-interface.js";
import type { LanguageParser } from "../../src/parsers/parser-interface.js";
import type { DuckDBPool } from "../../src/storage/duckdb-pool.js";
import type { SeedWriter } from "../../src/storage/seed-writer.js";

// Mock dependencies
vi.mock("../../src/effects/index.js", () => ({
  applyMappings: vi.fn((effects) => effects),
  loadEffectMappings: vi.fn(() =>
    Promise.resolve({ hasMappings: false, mappings: {}, sources: [] })
  ),
}));

vi.mock("../../src/workspace/discover.js", () => ({
  findGitRoot: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../../src/storage/seed-reader.js", () => ({
  createSeedReader: vi.fn(() => ({
    getUnresolvedRefs: vi.fn(() => Promise.resolve([])),
    getUnresolvedCallEdges: vi.fn(() => Promise.resolve([])),
    getUnresolvedExtendsEdges: vi.fn(() => Promise.resolve([])),
  })),
}));

vi.mock("../../src/semantic/index.js", () => ({
  getSemanticResolverFactory: vi.fn(() => ({
    detectPackageLanguage: vi.fn(() => null),
    getResolver: vi.fn(() => null),
  })),
  toUnresolvedRef: vi.fn((ref) => ref),
}));

describe("analysis-orchestrator", () => {
  let tempDir: string;
  let packagePath: string;
  let mockRouter: LanguageRouter;
  let mockWriter: SeedWriter;
  let mockPool: DuckDBPool;
  let mockParser: LanguageParser;

  beforeEach(async () => {
    // Create temp directory
    tempDir = path.join(
      "/tmp",
      `devac-test-orchestrator-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    packagePath = path.join(tempDir, "test-package");
    await fs.mkdir(packagePath, { recursive: true });

    // Create mock parser
    mockParser = {
      language: "typescript",
      extensions: [".ts", ".js"],
      version: "1.0.0",
      parse: vi.fn(
        async (filePath: string): Promise<StructuralParseResult> => ({
          nodes: [
            {
              entity_id: "test:pkg:function:test123",
              name: "testFunction",
              qualified_name: "testFunction",
              kind: "function",
              file_path: filePath,
              start_line: 1,
              end_line: 10,
              start_column: 0,
              end_column: 1,
              is_exported: true,
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
              source_file_hash: "test-hash",
              branch: "base",
              is_deleted: false,
              updated_at: new Date().toISOString(),
            },
          ],
          edges: [],
          externalRefs: [],
          effects: [],
          sourceFileHash: "test-hash",
          filePath,
          parseTimeMs: 5,
          warnings: [],
        })
      ),
      parseContent: vi.fn(),
      canParse: vi.fn((filePath: string) => filePath.endsWith(".ts") || filePath.endsWith(".js")),
    };

    // Create mock router
    mockRouter = {
      getParser: vi.fn((filePath: string) => {
        if (filePath.endsWith(".ts") || filePath.endsWith(".js")) {
          return mockParser;
        }
        return null;
      }),
      getSupportedExtensions: vi.fn(() => [".ts", ".tsx", ".js", ".jsx"]),
    } as unknown as LanguageRouter;

    // Create mock writer
    mockWriter = {
      writeFile: vi.fn(() => Promise.resolve()),
      updateFile: vi.fn(() => Promise.resolve()),
      deleteFile: vi.fn(() => Promise.resolve()),
      updateResolvedRefs: vi.fn(() => Promise.resolve({ success: true })),
      updateResolvedCallEdges: vi.fn(() => Promise.resolve({ success: true })),
      updateResolvedExtendsEdges: vi.fn(() => Promise.resolve({ success: true })),
    } as unknown as SeedWriter;

    // Create mock pool
    mockPool = {} as unknown as DuckDBPool;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("createAnalysisOrchestrator", () => {
    it("creates an orchestrator with default options", () => {
      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      expect(orchestrator).toBeDefined();
      expect(orchestrator.analyzeFile).toBeDefined();
      expect(orchestrator.analyzePackage).toBeDefined();
      expect(orchestrator.analyzeBatch).toBeDefined();
      expect(orchestrator.resolveSemantics).toBeDefined();
      expect(orchestrator.getStatus).toBeDefined();
    });

    it("creates an orchestrator with custom options", () => {
      const options: OrchestratorOptions = {
        batchSize: 100,
        concurrency: 20,
        repoName: "my-repo",
        branch: "develop",
        verbose: true,
      };

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool, options);

      expect(orchestrator).toBeDefined();
    });
  });

  describe("getStatus", () => {
    it("returns idle status initially", () => {
      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const status = orchestrator.getStatus();

      expect(status.mode).toBe("idle");
      expect(status.currentFile).toBeUndefined();
      expect(status.progress).toBeUndefined();
    });
  });

  describe("analyzeFile", () => {
    it("successfully analyzes a TypeScript file", async () => {
      // Create a test file
      const filePath = path.join(packagePath, "test.ts");
      await fs.writeFile(filePath, "export function test() { return 42; }");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const event: FileChangeEvent = {
        type: "add",
        filePath,
        packagePath,
        timestamp: Date.now(),
      };

      const result = await orchestrator.analyzeFile(event);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(filePath);
      expect(result.nodeCount).toBe(1);
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.writeTimeMs).toBeGreaterThanOrEqual(0);
      expect(mockParser.parse).toHaveBeenCalledWith(filePath, expect.any(Object));
      expect(mockWriter.updateFile).toHaveBeenCalled();
    });

    it("returns error for unsupported file type", async () => {
      const filePath = path.join(packagePath, "test.xyz");
      await fs.writeFile(filePath, "some content");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const event: FileChangeEvent = {
        type: "add",
        filePath,
        packagePath,
        timestamp: Date.now(),
      };

      const result = await orchestrator.analyzeFile(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No parser available");
    });

    it("handles file deletion", async () => {
      const filePath = path.join(packagePath, "deleted.ts");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const event: FileChangeEvent = {
        type: "unlink",
        filePath,
        packagePath,
        timestamp: Date.now(),
      };

      const result = await orchestrator.analyzeFile(event);

      expect(result.success).toBe(true);
      expect(result.nodeCount).toBe(0);
      expect(mockWriter.deleteFile).toHaveBeenCalledWith([filePath]);
    });

    it("handles parser errors gracefully", async () => {
      // Make parser throw an error
      (mockParser.parse as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Parse error: unexpected token")
      );

      const filePath = path.join(packagePath, "error.ts");
      await fs.writeFile(filePath, "invalid { syntax }");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const event: FileChangeEvent = {
        type: "add",
        filePath,
        packagePath,
        timestamp: Date.now(),
      };

      const result = await orchestrator.analyzeFile(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Parse error");
    });

    it("handles file change event", async () => {
      const filePath = path.join(packagePath, "changed.ts");
      await fs.writeFile(filePath, "export const x = 1;");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const event: FileChangeEvent = {
        type: "change",
        filePath,
        packagePath,
        timestamp: Date.now(),
      };

      const result = await orchestrator.analyzeFile(event);

      expect(result.success).toBe(true);
      expect(mockWriter.updateFile).toHaveBeenCalled();
    });
  });

  describe("analyzePackage", () => {
    it("analyzes all supported files in a package", async () => {
      // Create test files
      await fs.writeFile(path.join(packagePath, "index.ts"), "export const a = 1;");
      await fs.writeFile(path.join(packagePath, "utils.ts"), "export const b = 2;");
      await fs.writeFile(path.join(packagePath, "styles.css"), ".class {}"); // Should be skipped

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const result = await orchestrator.analyzePackage(packagePath);

      expect(result.packagePath).toBe(packagePath);
      expect(result.filesAnalyzed).toBe(2); // Only .ts files
      expect(result.filesFailed).toBe(0);
      expect(result.totalNodes).toBeGreaterThan(0);
      expect(result.totalTimeMs).toBeGreaterThan(0);
    });

    it("returns empty results for package with no supported files", async () => {
      // Create only unsupported files
      await fs.writeFile(path.join(packagePath, "readme.md"), "# Readme");
      await fs.writeFile(path.join(packagePath, "data.json"), "{}");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const result = await orchestrator.analyzePackage(packagePath);

      expect(result.filesAnalyzed).toBe(0);
      expect(result.totalNodes).toBe(0);
    });

    it("ignores files in node_modules", async () => {
      // Create files in node_modules
      const nodeModulesDir = path.join(packagePath, "node_modules", "some-lib");
      await fs.mkdir(nodeModulesDir, { recursive: true });
      await fs.writeFile(path.join(nodeModulesDir, "index.ts"), "export const x = 1;");

      // Create a regular file
      await fs.writeFile(path.join(packagePath, "src.ts"), "export const y = 2;");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const result = await orchestrator.analyzePackage(packagePath);

      // Should only analyze src.ts, not the one in node_modules
      expect(result.filesAnalyzed).toBe(1);
    });

    it("ignores .d.ts files", async () => {
      await fs.writeFile(path.join(packagePath, "types.d.ts"), "declare const x: number;");
      await fs.writeFile(path.join(packagePath, "index.ts"), "export const x = 1;");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const result = await orchestrator.analyzePackage(packagePath);

      // Should only analyze index.ts, not types.d.ts
      expect(result.filesAnalyzed).toBe(1);
    });

    it("collects errors from failed files", async () => {
      // Create files where one will fail
      await fs.writeFile(path.join(packagePath, "good.ts"), "export const x = 1;");
      await fs.writeFile(path.join(packagePath, "bad.ts"), "invalid code");

      // Make parser fail for bad.ts
      (mockParser.parse as ReturnType<typeof vi.fn>).mockImplementation(
        async (filePath: string) => {
          if (filePath.includes("bad.ts")) {
            throw new Error("Parse error");
          }
          return {
            nodes: [
              {
                entity_id: "test:pkg:function:test",
                name: "test",
                qualified_name: "test",
                kind: "function",
                file_path: filePath,
                start_line: 1,
                end_line: 1,
                start_column: 0,
                end_column: 1,
                is_exported: true,
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
                source_file_hash: "hash",
                branch: "base",
                is_deleted: false,
                updated_at: new Date().toISOString(),
              },
            ],
            edges: [],
            externalRefs: [],
            effects: [],
            sourceFileHash: "hash",
            filePath,
            parseTimeMs: 1,
            warnings: [],
          };
        }
      );

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const result = await orchestrator.analyzePackage(packagePath);

      expect(result.filesAnalyzed).toBe(1);
      expect(result.filesFailed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain("Parse error");
    });

    it("creates seed directory if it does not exist", async () => {
      await fs.writeFile(path.join(packagePath, "index.ts"), "export const x = 1;");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      await orchestrator.analyzePackage(packagePath);

      const seedDirExists = await fs
        .access(path.join(packagePath, ".devac", "seed"))
        .then(() => true)
        .catch(() => false);

      expect(seedDirExists).toBe(true);
    });

    it("scans nested directories", async () => {
      // Create nested structure
      const srcDir = path.join(packagePath, "src");
      const utilsDir = path.join(srcDir, "utils");
      await fs.mkdir(utilsDir, { recursive: true });

      await fs.writeFile(path.join(srcDir, "index.ts"), "export const a = 1;");
      await fs.writeFile(path.join(utilsDir, "helper.ts"), "export const b = 2;");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const result = await orchestrator.analyzePackage(packagePath);

      expect(result.filesAnalyzed).toBe(2);
    });
  });

  describe("analyzeBatch", () => {
    it("analyzes multiple file changes", async () => {
      const file1 = path.join(packagePath, "file1.ts");
      const file2 = path.join(packagePath, "file2.ts");
      await fs.writeFile(file1, "export const a = 1;");
      await fs.writeFile(file2, "export const b = 2;");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const events: FileChangeEvent[] = [
        { type: "add", filePath: file1, packagePath, timestamp: Date.now() },
        { type: "add", filePath: file2, packagePath, timestamp: Date.now() },
      ];

      const result = await orchestrator.analyzeBatch(events);

      expect(result.events).toHaveLength(2);
      expect(result.results).toHaveLength(2);
      expect(result.results.every((r) => r.success)).toBe(true);
      expect(result.totalTimeMs).toBeGreaterThan(0);
    });

    it("handles mixed success and failure", async () => {
      const goodFile = path.join(packagePath, "good.ts");
      const badFile = path.join(packagePath, "bad.xyz"); // Unsupported

      await fs.writeFile(goodFile, "export const x = 1;");
      await fs.writeFile(badFile, "content");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const events: FileChangeEvent[] = [
        { type: "add", filePath: goodFile, packagePath, timestamp: Date.now() },
        { type: "add", filePath: badFile, packagePath, timestamp: Date.now() },
      ];

      const result = await orchestrator.analyzeBatch(events);

      expect(result.results).toHaveLength(2);
      expect(result.results.filter((r) => r.success)).toHaveLength(1);
      expect(result.results.filter((r) => !r.success)).toHaveLength(1);
    });

    it("groups events by package", async () => {
      const pkg1Path = path.join(tempDir, "pkg1");
      const pkg2Path = path.join(tempDir, "pkg2");
      await fs.mkdir(pkg1Path, { recursive: true });
      await fs.mkdir(pkg2Path, { recursive: true });

      const file1 = path.join(pkg1Path, "a.ts");
      const file2 = path.join(pkg2Path, "b.ts");
      await fs.writeFile(file1, "export const a = 1;");
      await fs.writeFile(file2, "export const b = 2;");

      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const events: FileChangeEvent[] = [
        {
          type: "add",
          filePath: file1,
          packagePath: pkg1Path,
          timestamp: Date.now(),
        },
        {
          type: "add",
          filePath: file2,
          packagePath: pkg2Path,
          timestamp: Date.now(),
        },
      ];

      const result = await orchestrator.analyzeBatch(events);

      expect(result.results).toHaveLength(2);
    });
  });

  describe("resolveSemantics", () => {
    it("returns empty result when no unresolved refs", async () => {
      const orchestrator = createAnalysisOrchestrator(mockRouter, mockWriter, mockPool);

      const result = await orchestrator.resolveSemantics(packagePath);

      expect(result.packagePath).toBe(packagePath);
      expect(result.refsResolved).toBe(0);
      expect(result.refsFailed).toBe(0);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
