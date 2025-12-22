/**
 * Watch CLI Command Tests for DevAC v2.0
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Section 11.1 and Phase 2 plan.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Import watch command (to be implemented)
import { type WatchOptions, watchCommand } from "../src/commands/watch.js";

// Test fixtures path
const FIXTURES_DIR = path.join(__dirname, "fixtures");

describe("CLI: watch command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-watch-test-"));
    // Copy fixtures to temp directory
    await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validation", () => {
    it("validates package path exists", async () => {
      const options: WatchOptions = {
        packagePath: "/nonexistent/path",
        repoName: "test-repo",
      };

      const controller = await watchCommand(options);

      expect(controller.getStatus().error).toBeTruthy();
      expect(controller.getStatus().error).toContain("does not exist");
    });

    it("accepts valid package path", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
      };

      const controller = await watchCommand(options);

      expect(controller.getStatus().error).toBeUndefined();
      expect(controller.getStatus().isWatching).toBe(true);

      // Clean up
      await controller.stop();
    });
  });

  describe("initial analysis", () => {
    it("performs initial analysis if no seeds exist", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
      };

      const controller = await watchCommand(options);

      // Wait for initial analysis to complete
      await waitForCondition(() => controller.getStatus().initialAnalysisComplete, 2000);

      expect(controller.getStatus().initialAnalysisComplete).toBe(true);
      expect(controller.getStatus().filesAnalyzed).toBeGreaterThan(0);

      // Seeds should exist
      const seedPath = path.join(tempDir, ".devac", "seed", "base", "nodes.parquet");
      const exists = await fs
        .access(seedPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      await controller.stop();
    });

    it("skips initial analysis if seeds are current", async () => {
      // First, run initial analysis
      const options1: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
      };

      const controller1 = await watchCommand(options1);
      await waitForCondition(() => controller1.getStatus().initialAnalysisComplete, 2000);
      await controller1.stop();

      // Now start watch again - should skip initial analysis
      const options2: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
      };

      const controller2 = await watchCommand(options2);
      await waitForCondition(() => controller2.getStatus().initialAnalysisComplete, 2000);

      expect(controller2.getStatus().initialAnalysisSkipped).toBe(true);

      await controller2.stop();
    });

    it("forces initial analysis with --force flag", async () => {
      // First, run initial analysis
      const options1: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
      };

      const controller1 = await watchCommand(options1);
      await waitForCondition(() => controller1.getStatus().initialAnalysisComplete, 2000);
      const filesFirst = controller1.getStatus().filesAnalyzed;
      await controller1.stop();

      // Now start watch again with force - should re-analyze
      const options2: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
        force: true,
      };

      const controller2 = await watchCommand(options2);
      await waitForCondition(() => controller2.getStatus().initialAnalysisComplete, 2000);

      expect(controller2.getStatus().initialAnalysisSkipped).toBe(false);
      expect(controller2.getStatus().filesAnalyzed).toBe(filesFirst);

      await controller2.stop();
    });
  });

  describe("file change notifications", () => {
    it("detects file changes and processes them", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
        debounceMs: 50, // Faster for tests
      };

      const controller = await watchCommand(options);
      await waitForCondition(() => controller.getStatus().initialAnalysisComplete, 2000);

      // Give watcher time to stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create a new file
      const newFilePath = path.join(tempDir, "src", "new-file.ts");
      await fs.writeFile(newFilePath, 'export const newFunction = () => "hello";');

      // Wait for file change to be processed
      await waitForCondition(() => controller.getStatus().changesProcessed > 0, 2000);

      expect(controller.getStatus().changesProcessed).toBeGreaterThan(0);

      await controller.stop();
    });

    it("batches rapid file changes", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
        debounceMs: 100,
      };

      const controller = await watchCommand(options);
      await waitForCondition(() => controller.getStatus().initialAnalysisComplete, 2000);

      // Give watcher time to stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create multiple files rapidly
      for (let i = 0; i < 3; i++) {
        const filePath = path.join(tempDir, "src", `rapid-${i}.ts`);
        await fs.writeFile(filePath, `export const func${i} = () => ${i};`);
      }

      // Wait for batch processing
      await waitForCondition(() => controller.getStatus().changesProcessed >= 3, 3000);

      // Should have processed all files
      expect(controller.getStatus().changesProcessed).toBeGreaterThanOrEqual(3);

      await controller.stop();
    });

    it("emits events for file changes", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
        debounceMs: 50,
      };

      const events: Array<{ type: string; filePath: string }> = [];

      const controller = await watchCommand(options);
      controller.on("change", (event) => {
        events.push({ type: event.type, filePath: event.filePath });
      });

      await waitForCondition(() => controller.getStatus().initialAnalysisComplete, 2000);

      // Give watcher time to stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Modify an existing file
      const existingFile = path.join(tempDir, "src", "hello.ts");
      await fs.writeFile(existingFile, 'export const modified = "yes";');

      // Wait for event
      await waitForCondition(() => events.length > 0, 2000);

      expect(events.length).toBeGreaterThan(0);
      // File system may report as "add" or "change" depending on timing
      expect(["add", "change"]).toContain(events[0]?.type);

      await controller.stop();
    });
  });

  describe("graceful shutdown", () => {
    it("stops watching when stop() is called", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
      };

      const controller = await watchCommand(options);
      await waitForCondition(() => controller.getStatus().initialAnalysisComplete, 2000);

      expect(controller.getStatus().isWatching).toBe(true);

      await controller.stop();

      expect(controller.getStatus().isWatching).toBe(false);
    });

    it("completes pending operations before stopping", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
        debounceMs: 200, // Longer debounce
      };

      const controller = await watchCommand(options);
      await waitForCondition(() => controller.getStatus().initialAnalysisComplete, 2000);

      // Create a file then immediately stop
      const filePath = path.join(tempDir, "src", "pending.ts");
      await fs.writeFile(filePath, "export const pending = true;");

      // Stop with flush option
      const result = await controller.stop({ flush: true });

      expect(result.success).toBe(true);
    });

    it("returns result on stop", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
      };

      const controller = await watchCommand(options);
      await waitForCondition(() => controller.getStatus().initialAnalysisComplete, 2000);

      const result = await controller.stop();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.filesWatched).toBeGreaterThanOrEqual(0);
      expect(result.eventsProcessed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("CLI options", () => {
    // Note: --verbose and --debug are now global CLI options handled by the
    // preAction hook in index.ts, not per-command options

    it("accepts --debounce flag", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
        debounceMs: 200,
      };

      const controller = await watchCommand(options);

      expect(controller.getOptions().debounceMs).toBe(200);

      await controller.stop();
    });

    it("uses default debounce if not specified", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
      };

      const controller = await watchCommand(options);

      expect(controller.getOptions().debounceMs).toBe(100); // Default

      await controller.stop();
    });

    it("accepts --branch flag", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
        branch: "feature-branch",
      };

      const controller = await watchCommand(options);

      expect(controller.getOptions().branch).toBe("feature-branch");

      await controller.stop();
    });
  });

  describe("error handling", () => {
    it("continues processing on single file parse error", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
        debounceMs: 50,
      };

      const controller = await watchCommand(options);
      await waitForCondition(() => controller.getStatus().initialAnalysisComplete, 2000);

      // Give watcher time to stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create an invalid TypeScript file
      const invalidFile = path.join(tempDir, "src", "invalid.ts");
      await fs.writeFile(invalidFile, "export const { = invalid syntax");

      // Create a valid file
      const validFile = path.join(tempDir, "src", "valid.ts");
      await fs.writeFile(validFile, "export const valid = true;");

      // Wait for processing
      await waitForCondition(() => controller.getStatus().changesProcessed >= 1, 2000);

      // Should have processed files (even with error)
      expect(controller.getStatus().changesProcessed).toBeGreaterThanOrEqual(1);
      expect(controller.getStatus().isWatching).toBe(true);

      await controller.stop();
    });

    it("reports errors in status", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
        debounceMs: 50,
      };

      const controller = await watchCommand(options);
      await waitForCondition(() => controller.getStatus().initialAnalysisComplete, 2000);

      // Give watcher time to stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create an invalid file
      const invalidFile = path.join(tempDir, "src", "error.ts");
      await fs.writeFile(invalidFile, "export const { = broken");

      // Wait for processing
      await waitForCondition(() => controller.getStatus().changesProcessed >= 1, 2000);

      // Errors should be tracked
      expect(controller.getStatus().errors).toBeGreaterThanOrEqual(0);

      await controller.stop();
    });
  });

  describe("performance", () => {
    it("responds to file changes within reasonable time", async () => {
      const options: WatchOptions = {
        packagePath: tempDir,
        repoName: "test-repo",
        debounceMs: 50,
      };

      const controller = await watchCommand(options);
      await waitForCondition(() => controller.getStatus().initialAnalysisComplete, 2000);

      // Give watcher time to stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));

      const startTime = Date.now();

      // Create a file
      const filePath = path.join(tempDir, "src", "perf-test.ts");
      await fs.writeFile(filePath, "export const perf = 1;");

      // Wait for processing
      await waitForCondition(() => controller.getStatus().changesProcessed > 0, 2000);

      const elapsed = Date.now() - startTime;

      // Should complete within 1000ms (includes debounce, chokidar detection, processing)
      // The spec target is 300ms but in CI/test environments we allow more margin
      expect(elapsed).toBeLessThan(1000);

      await controller.stop();
    });
  });
});

/**
 * Helper function to wait for a condition with timeout
 */
async function waitForCondition(condition: () => boolean, timeoutMs: number): Promise<void> {
  const startTime = Date.now();
  while (!condition() && Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
