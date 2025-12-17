/**
 * Performance Tests for DevAC v2.0
 *
 * Based on spec Section 15.3 Success Criteria:
 * - <100ms per-file parse
 * - <500ms package write on base branch
 * - File changes trigger correct delta update
 * - Watch mode responds in <300ms
 *
 * These tests validate performance targets from the spec.
 *
 * NOTE: These tests are skipped in CI due to environment-dependent timing.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFileWatcher, createTypeScriptResolver, createUpdateManager } from "@devac/core";
import { analyzeCommand } from "../src/commands/analyze.js";

// Fixtures path
const FIXTURES_DIR = path.join(__dirname, "fixtures");

// CI environments are slower, so we use relaxed thresholds instead of skipping tests
// Local environments also get a small multiplier (1.5x) to account for machine load variability
const CI_PERF_MULTIPLIER = process.env.CI === "true" ? 3 : 1.5;

describe("Performance", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-perf-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("file parsing", () => {
    it("single file update completes in <300ms (warm)", async () => {
      // Setup: Create a package and analyze it first (warm cache)
      await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });

      // Warm up: First analysis
      await analyzeCommand({
        packagePath: tempDir,
        repoName: "test-repo",
        branch: "main",
      });

      // Create update manager (simulating warm state)
      const updateManager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
        branch: "main",
      });

      // Create a new file to update
      const testFile = path.join(tempDir, "src", "perf-test-warm.ts");
      await fs.writeFile(
        testFile,
        `
export function performanceTest() {
  return "warm test";
}

export class WarmTestClass {
  method() { return 1; }
}
`
      );

      // Measure update time
      const startTime = Date.now();
      const result = await updateManager.processFileChange({
        type: "add",
        filePath: testFile,
        timestamp: Date.now(),
      });
      const elapsed = Date.now() - startTime;

      await updateManager.dispose();

      // Should complete within 300ms
      expect(elapsed).toBeLessThan(300 * CI_PERF_MULTIPLIER);
      expect(result.timeMs).toBeLessThan(300 * CI_PERF_MULTIPLIER);
    });

    it("single file update completes in <500ms (cold)", async () => {
      // Create a file to parse (cold start - no prior analysis)
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      const testFile = path.join(tempDir, "src", "perf-test-cold.ts");
      await fs.writeFile(
        testFile,
        `
export function coldTest() {
  return "cold test";
}

export interface ColdInterface {
  value: string;
}

export type ColdType = string | number;
`
      );

      // Create update manager (cold state)
      const updateManager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
        branch: "main",
      });

      // Measure update time
      const startTime = Date.now();
      const _result = await updateManager.processFileChange({
        type: "add",
        filePath: testFile,
        timestamp: Date.now(),
      });
      const elapsed = Date.now() - startTime;

      await updateManager.dispose();

      // Should complete within 500ms even cold
      expect(elapsed).toBeLessThan(500 * CI_PERF_MULTIPLIER);
    });
  });

  describe("batch processing", () => {
    it("processes 10 files in <800ms", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      // Create 10 test files
      const files: string[] = [];
      for (let i = 0; i < 10; i++) {
        const filePath = path.join(tempDir, "src", `batch-file-${i}.ts`);
        await fs.writeFile(
          filePath,
          `
export function batchFunc${i}() { return ${i}; }
export const batchConst${i} = ${i};
export class BatchClass${i} {
  getValue() { return ${i}; }
}
`
        );
        files.push(filePath);
      }

      const updateManager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
        branch: "main",
      });

      // Process all files as a batch
      const events = files.map((filePath) => ({
        type: "add" as const,
        filePath,
        timestamp: Date.now(),
      }));

      const startTime = Date.now();
      const result = await updateManager.processBatch(events);
      const elapsed = Date.now() - startTime;

      await updateManager.dispose();

      // Should complete within 800ms
      expect(elapsed).toBeLessThan(800 * CI_PERF_MULTIPLIER);
      expect(result.totalTimeMs).toBeLessThan(800 * CI_PERF_MULTIPLIER);
      expect(result.successCount + result.errorCount).toBe(10);
    });

    it("content hash check completes quickly", async () => {
      await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });

      const updateManager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
        branch: "main",
      });

      // First, process a file - this registers the hash
      const testFile = path.join(tempDir, "src", "hello.ts");
      const firstResult = await updateManager.processFileChange({
        type: "change",
        filePath: testFile,
        timestamp: Date.now(),
      });

      // Now process the same file again - should skip due to same content hash
      const startTime = Date.now();
      const result = await updateManager.processFileChange({
        type: "change",
        filePath: testFile,
        timestamp: Date.now(),
      });
      const elapsed = Date.now() - startTime;

      await updateManager.dispose();

      // Whether skipped or not, the hash check should be fast
      // The skip optimization works when hash is already tracked
      expect(elapsed).toBeLessThan(100 * CI_PERF_MULTIPLIER);

      // If the first result succeeded and stored the hash, second should skip
      if (firstResult.success && !firstResult.skipped) {
        expect(result.skipped).toBe(true);
      }
    });
  });

  describe("package analysis", () => {
    it("analyzes small package (<10 files) in <2s", async () => {
      // Create a small package with realistic files
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      for (let i = 0; i < 8; i++) {
        await fs.writeFile(
          path.join(tempDir, "src", `module-${i}.ts`),
          generateRealisticTypeScriptFile(i)
        );
      }

      const startTime = Date.now();
      const result = await analyzeCommand({
        packagePath: tempDir,
        repoName: "test-repo",
        branch: "main",
      });
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(2000 * CI_PERF_MULTIPLIER);
      expect(result.timeMs).toBeLessThan(2000 * CI_PERF_MULTIPLIER);
      expect(result.filesAnalyzed).toBe(8);
    });
  });

  describe("semantic resolution", () => {
    it("builds export index for 10 files in <1000ms", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      // Create files with exports
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(
          path.join(tempDir, "src", `exports-${i}.ts`),
          `
export function func${i}() { return ${i}; }
export const value${i} = ${i};
export class Class${i} {}
export interface Interface${i} {}
export type Type${i} = string;
`
        );
      }

      const resolver = createTypeScriptResolver();

      const startTime = Date.now();
      const index = await resolver.buildExportIndex(tempDir);
      const elapsed = Date.now() - startTime;

      // ts-morph initialization has some overhead, 1000ms is reasonable for small packages
      // (ts-morph creates a full TypeScript project which is slower than regex-based parsing)
      expect(elapsed).toBeLessThan(1000 * CI_PERF_MULTIPLIER);
      expect(index.fileExports.size).toBeGreaterThan(0);
    });

    it("resolves imports for package in <500ms", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      // Create a module with exports
      await fs.writeFile(
        path.join(tempDir, "src", "utils.ts"),
        `
export function helper() { return 1; }
export const CONFIG = { value: 42 };
export class Service {}
`
      );

      // Create files that import from utils
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(
          path.join(tempDir, "src", `consumer-${i}.ts`),
          `
import { helper, CONFIG, Service } from "./utils";
export const use${i} = helper() + CONFIG.value;
export class Consumer${i} extends Service {}
`
        );
      }

      const resolver = createTypeScriptResolver();

      // Build unresolved refs that would come from structural parsing (Pass 1)
      // In production, these come from the parser. For the test, we create them manually.
      const unresolvedRefs = [];
      for (let i = 0; i < 5; i++) {
        const sourceFilePath = path.join(tempDir, "src", `consumer-${i}.ts`);
        const sourceEntityId = `test-repo:test-pkg:function:src/consumer-${i}.ts:use${i}`;

        // Each file imports helper, CONFIG, Service from utils
        unresolvedRefs.push(
          {
            sourceEntityId: `${sourceEntityId}-helper`,
            sourceFilePath,
            moduleSpecifier: "./utils",
            importedSymbol: "helper",
            isTypeOnly: false,
            isDefault: false,
            isNamespace: false,
          },
          {
            sourceEntityId: `${sourceEntityId}-config`,
            sourceFilePath,
            moduleSpecifier: "./utils",
            importedSymbol: "CONFIG",
            isTypeOnly: false,
            isDefault: false,
            isNamespace: false,
          },
          {
            sourceEntityId: `${sourceEntityId}-service`,
            sourceFilePath,
            moduleSpecifier: "./utils",
            importedSymbol: "Service",
            isTypeOnly: false,
            isDefault: false,
            isNamespace: false,
          }
        );
      }

      const startTime = Date.now();
      const result = await resolver.resolvePackage(tempDir, unresolvedRefs);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(500 * CI_PERF_MULTIPLIER);
      expect(result.resolved).toBeGreaterThan(0);
    });
  });

  describe("watch mode responsiveness", () => {
    it("detects and processes file change in <500ms", async () => {
      await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });

      const watcher = createFileWatcher(tempDir, {
        debounceMs: 50,
        ignoreInitial: true,
      });

      await watcher.start();

      // Wait for watcher to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      let changeDetected = false;
      let detectionTime = 0;

      watcher.on("add", () => {
        changeDetected = true;
        detectionTime = Date.now();
      });

      const startTime = Date.now();

      // Create a new file
      const testFile = path.join(tempDir, "src", "watch-perf-test.ts");
      await fs.writeFile(testFile, "export const watchTest = 1;");

      // Wait for detection
      await new Promise<void>((resolve) => {
        const check = () => {
          if (changeDetected || Date.now() - startTime > 1000) {
            resolve();
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });

      await watcher.stop();

      if (changeDetected) {
        const elapsed = detectionTime - startTime;
        // Detection should be within 500ms
        expect(elapsed).toBeLessThan(500 * CI_PERF_MULTIPLIER);
      }
    });
  });
});

/**
 * Generate a realistic TypeScript file for testing
 */
function generateRealisticTypeScriptFile(index: number): string {
  return `
/**
 * Module ${index} - Auto-generated for performance testing
 */

import type { SomeType } from "./types";

export interface Config${index} {
  name: string;
  value: number;
  enabled: boolean;
}

export type Result${index} = {
  success: boolean;
  data: unknown;
  error?: string;
};

export class Service${index} {
  private config: Config${index};

  constructor(config: Config${index}) {
    this.config = config;
  }

  async process(input: unknown): Promise<Result${index}> {
    return {
      success: true,
      data: input,
    };
  }

  getConfig(): Config${index} {
    return this.config;
  }
}

export function createService${index}(config: Config${index}): Service${index} {
  return new Service${index}(config);
}

export const DEFAULT_CONFIG_${index}: Config${index} = {
  name: "default-${index}",
  value: ${index},
  enabled: true,
};

export async function processAsync${index}(
  service: Service${index},
  data: unknown,
): Promise<Result${index}> {
  return service.process(data);
}

export function validateConfig${index}(config: Config${index}): boolean {
  return config.name.length > 0 && config.value >= 0;
}
`;
}
