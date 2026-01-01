/**
 * Unit tests for File Watcher Module
 *
 * The file watcher must:
 * - Watch for file changes using chokidar
 * - Debounce rapid changes
 * - Batch multiple changes within debounce window
 * - Filter by supported extensions
 * - Ignore node_modules, .devac, dist directories
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type FileChangeEvent,
  type FileWatcher,
  type FileWatcherOptions,
  createFileWatcher,
} from "../src/watcher/file-watcher.js";

// CI environments (especially Linux with inotify) need longer timeouts for file system events
const CI_TIMEOUT_MULTIPLIER = process.env.CI === "true" ? 5 : 1;

describe("FileWatcher", () => {
  let tempDir: string;
  let watcher: FileWatcher | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-watcher-test-"));
    // Create initial structure
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
      watcher = null;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("construction", () => {
    it("accepts package path and options", () => {
      const options: FileWatcherOptions = {
        debounceMs: 200,
        ignoreInitial: true,
      };
      watcher = createFileWatcher(tempDir, options);
      expect(watcher).toBeDefined();
      expect(watcher.isWatching()).toBe(false);
    });

    it("throws if package path does not exist", async () => {
      watcher = createFileWatcher("/nonexistent/path");
      await expect(watcher.start()).rejects.toThrow();
    });

    it("uses default debounce of 100ms", () => {
      watcher = createFileWatcher(tempDir);
      expect(watcher.getOptions().debounceMs).toBe(100);
    });

    it("accepts custom debounce time", () => {
      watcher = createFileWatcher(tempDir, { debounceMs: 500 });
      expect(watcher.getOptions().debounceMs).toBe(500);
    });
  });

  describe("start()", () => {
    it("begins watching after start is called", async () => {
      watcher = createFileWatcher(tempDir);
      expect(watcher.isWatching()).toBe(false);

      await watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });

    it("ignores node_modules directory", async () => {
      // Create node_modules with a file
      await fs.mkdir(path.join(tempDir, "node_modules"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "node_modules", "test.ts"), "export const x = 1;");

      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, { ignoreInitial: false });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();
      // Wait for initial scan
      await new Promise((resolve) => setTimeout(resolve, 200 * CI_TIMEOUT_MULTIPLIER));

      // Should not have picked up node_modules file
      const nodeModulesEvents = events.filter((e) => e.filePath.includes("node_modules"));
      expect(nodeModulesEvents).toHaveLength(0);
    });

    it("ignores .devac directory", async () => {
      await fs.mkdir(path.join(tempDir, ".devac", "seed"), { recursive: true });
      await fs.writeFile(path.join(tempDir, ".devac", "test.ts"), "export const x = 1;");

      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, { ignoreInitial: false });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 200 * CI_TIMEOUT_MULTIPLIER));

      const devacEvents = events.filter((e) => e.filePath.includes(".devac"));
      expect(devacEvents).toHaveLength(0);
    });

    it("ignores dist directory", async () => {
      await fs.mkdir(path.join(tempDir, "dist"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "dist", "index.js"), "export const x = 1;");

      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, { ignoreInitial: false });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 200 * CI_TIMEOUT_MULTIPLIER));

      const distEvents = events.filter((e) => e.filePath.includes("dist"));
      expect(distEvents).toHaveLength(0);
    });
  });

  describe("stop()", () => {
    it("stops watching and releases resources", async () => {
      watcher = createFileWatcher(tempDir);
      await watcher.start();
      expect(watcher.isWatching()).toBe(true);

      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    it("is idempotent - can be called multiple times", async () => {
      watcher = createFileWatcher(tempDir);
      await watcher.start();

      await watcher.stop();
      await watcher.stop(); // Should not throw
      expect(watcher.isWatching()).toBe(false);
    });

    it("cancels pending debounce timers", async () => {
      watcher = createFileWatcher(tempDir, { debounceMs: 1000 });
      await watcher.start();

      // Create a file to trigger debounce
      await fs.writeFile(path.join(tempDir, "src", "test.ts"), "const x = 1;");

      // Stop immediately (before debounce completes)
      await watcher.stop();

      // No events should be emitted after stop
      const events: FileChangeEvent[] = [];
      watcher.on("batch", (batch) => events.push(...batch));

      await new Promise((resolve) => setTimeout(resolve, 1100 * CI_TIMEOUT_MULTIPLIER));
      expect(events).toHaveLength(0);
    });
  });

  describe("event emission", () => {
    it("emits add event for new files", async () => {
      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
      });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();

      // Small delay to ensure watcher is fully ready
      await new Promise((resolve) => setTimeout(resolve, 100 * CI_TIMEOUT_MULTIPLIER));

      // Create a new file
      const filePath = path.join(tempDir, "src", "new-file.ts");
      await fs.writeFile(filePath, 'export const hello = "world";');

      // Wait for debounce + file write stabilization
      await new Promise((resolve) => setTimeout(resolve, 300 * CI_TIMEOUT_MULTIPLIER));

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]?.type).toBe("add");
      expect(events[0]?.filePath).toBe(filePath);
    });

    it("emits change event for modified files", async () => {
      // Create file first
      const filePath = path.join(tempDir, "src", "existing.ts");
      await fs.writeFile(filePath, "export const x = 1;");

      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
      });
      watcher.on("change", (event) => events.push(event));

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100 * CI_TIMEOUT_MULTIPLIER));

      // Modify the file
      await fs.writeFile(filePath, "export const x = 2;");

      await new Promise((resolve) => setTimeout(resolve, 300 * CI_TIMEOUT_MULTIPLIER));

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]?.type).toBe("change");
      expect(events[0]?.filePath).toBe(filePath);
    });

    it("emits unlink event for deleted files", async () => {
      // Create file first
      const filePath = path.join(tempDir, "src", "to-delete.ts");
      await fs.writeFile(filePath, "export const x = 1;");

      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
      });
      watcher.on("unlink", (event) => events.push(event));

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100 * CI_TIMEOUT_MULTIPLIER));

      // Delete the file
      await fs.unlink(filePath);

      await new Promise((resolve) => setTimeout(resolve, 300 * CI_TIMEOUT_MULTIPLIER));

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]?.type).toBe("unlink");
      expect(events[0]?.filePath).toBe(filePath);
    });

    it("debounces rapid changes to same file", async () => {
      const filePath = path.join(tempDir, "src", "rapid.ts");
      await fs.writeFile(filePath, "const x = 0;");

      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 100,
      });
      watcher.on("change", (event) => events.push(event));

      await watcher.start();

      // Rapid changes
      for (let i = 1; i <= 5; i++) {
        await fs.writeFile(filePath, `const x = ${i};`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      // Wait for debounce to complete
      await new Promise((resolve) => setTimeout(resolve, 200 * CI_TIMEOUT_MULTIPLIER));

      // Should have fewer events than changes due to debouncing
      expect(events.length).toBeLessThan(5);
    });

    it("batches multiple file changes within debounce window", async () => {
      let batchEvents: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 100,
      });
      watcher.on("batch", (batch) => {
        batchEvents = [...batchEvents, ...batch];
      });

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100 * CI_TIMEOUT_MULTIPLIER));

      // Create multiple files quickly
      await fs.writeFile(path.join(tempDir, "src", "file1.ts"), "const a = 1;");
      await fs.writeFile(path.join(tempDir, "src", "file2.ts"), "const b = 2;");
      await fs.writeFile(path.join(tempDir, "src", "file3.ts"), "const c = 3;");

      // Wait for batch
      await new Promise((resolve) => setTimeout(resolve, 400 * CI_TIMEOUT_MULTIPLIER));

      expect(batchEvents.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("filter patterns", () => {
    it("watches .ts files", async () => {
      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
      });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 150 * CI_TIMEOUT_MULTIPLIER));

      await fs.writeFile(path.join(tempDir, "src", "test.ts"), "export const x = 1;");
      await new Promise((resolve) => setTimeout(resolve, 500 * CI_TIMEOUT_MULTIPLIER));

      expect(events.some((e) => e.filePath.endsWith(".ts"))).toBe(true);
    });

    it("watches .tsx files", async () => {
      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
      });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 150 * CI_TIMEOUT_MULTIPLIER));

      await fs.writeFile(
        path.join(tempDir, "src", "component.tsx"),
        "export const C = () => <div/>;"
      );
      await new Promise((resolve) => setTimeout(resolve, 500 * CI_TIMEOUT_MULTIPLIER));

      expect(events.some((e) => e.filePath.endsWith(".tsx"))).toBe(true);
    });

    it("ignores .d.ts files", async () => {
      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
      });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();

      await fs.writeFile(path.join(tempDir, "src", "types.d.ts"), "declare const x: number;");
      await new Promise((resolve) => setTimeout(resolve, 150 * CI_TIMEOUT_MULTIPLIER));

      expect(events.some((e) => e.filePath.endsWith(".d.ts"))).toBe(false);
    });

    it("respects custom extensions option", async () => {
      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
        extensions: [".js"], // Only watch .js files
      });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100 * CI_TIMEOUT_MULTIPLIER));

      await fs.writeFile(path.join(tempDir, "src", "file.ts"), "export const x = 1;");
      await fs.writeFile(path.join(tempDir, "src", "file.js"), "export const y = 2;");
      await new Promise((resolve) => setTimeout(resolve, 300 * CI_TIMEOUT_MULTIPLIER));

      expect(events.some((e) => e.filePath.endsWith(".js"))).toBe(true);
      expect(events.some((e) => e.filePath.endsWith(".ts"))).toBe(false);
    });

    it("respects custom ignore patterns", async () => {
      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
        ignorePatterns: ["**/test/**"],
      });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100 * CI_TIMEOUT_MULTIPLIER));

      await fs.mkdir(path.join(tempDir, "test"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "test", "spec.ts"), "test content");
      await fs.writeFile(path.join(tempDir, "src", "main.ts"), "main content");
      await new Promise((resolve) => setTimeout(resolve, 300 * CI_TIMEOUT_MULTIPLIER));

      expect(events.some((e) => e.filePath.includes("/test/"))).toBe(false);
      expect(events.some((e) => e.filePath.includes("/src/"))).toBe(true);
    });
  });

  describe("initial scan", () => {
    it("performs initial scan when ignoreInitial is false", async () => {
      // Create files before starting watcher
      await fs.writeFile(path.join(tempDir, "src", "existing1.ts"), "export const a = 1;");
      await fs.writeFile(path.join(tempDir, "src", "existing2.ts"), "export const b = 2;");

      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: false,
        debounceMs: 50,
      });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 200 * CI_TIMEOUT_MULTIPLIER));

      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it("skips initial scan when ignoreInitial is true", async () => {
      // Create files before starting watcher
      await fs.writeFile(path.join(tempDir, "src", "existing.ts"), "export const x = 1;");

      const events: FileChangeEvent[] = [];
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
      });
      watcher.on("add", (event) => events.push(event));

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 200 * CI_TIMEOUT_MULTIPLIER));

      // Should not pick up existing files
      expect(events).toHaveLength(0);
    });
  });

  describe("event handler management", () => {
    it("supports multiple handlers for same event", async () => {
      let handler1Called = false;
      let handler2Called = false;

      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
      });
      watcher.on("add", () => {
        handler1Called = true;
      });
      watcher.on("add", () => {
        handler2Called = true;
      });

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100 * CI_TIMEOUT_MULTIPLIER));

      await fs.writeFile(path.join(tempDir, "src", "test.ts"), "export const x = 1;");
      await new Promise((resolve) => setTimeout(resolve, 300 * CI_TIMEOUT_MULTIPLIER));

      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(true);
    });

    it("can remove handlers with off()", async () => {
      let callCount = 0;
      let resolveFirstCall: (() => void) | null = null;
      const firstCallPromise = new Promise<void>((resolve) => {
        resolveFirstCall = resolve;
      });

      const handler = () => {
        callCount++;
        if (callCount === 1 && resolveFirstCall) {
          resolveFirstCall();
        }
      };

      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
      });
      watcher.on("add", handler);

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100 * CI_TIMEOUT_MULTIPLIER));

      await fs.writeFile(path.join(tempDir, "src", "test1.ts"), "export const x = 1;");

      // Wait for the handler to be called or timeout after 5 seconds
      await Promise.race([firstCallPromise, new Promise((resolve) => setTimeout(resolve, 5000))]);

      expect(callCount).toBe(1);

      watcher.off("add", handler);
      await fs.writeFile(path.join(tempDir, "src", "test2.ts"), "export const y = 2;");
      await new Promise((resolve) => setTimeout(resolve, 300 * CI_TIMEOUT_MULTIPLIER));

      expect(callCount).toBe(1); // Should not increase
    });
  });

  describe("getStats()", () => {
    it("returns watcher statistics", async () => {
      watcher = createFileWatcher(tempDir, {
        ignoreInitial: true,
        debounceMs: 50,
      });
      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100 * CI_TIMEOUT_MULTIPLIER));

      await fs.writeFile(path.join(tempDir, "src", "test.ts"), "export const x = 1;");
      await new Promise((resolve) => setTimeout(resolve, 300 * CI_TIMEOUT_MULTIPLIER));

      const stats = watcher.getStats();
      expect(stats.isWatching).toBe(true);
      expect(stats.eventsProcessed).toBeGreaterThanOrEqual(1);
      expect(typeof stats.lastEventTime).toBe("number");
    });
  });
});
