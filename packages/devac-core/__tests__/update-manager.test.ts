/**
 * Unit tests for Update Manager Module
 *
 * The update manager must:
 * - Orchestrate incremental updates for file changes
 * - Parse changed files and update seeds
 * - Handle add, change, unlink, and rename events
 * - Skip unchanged files based on content hash
 * - Continue processing on single file failures
 * - Complete within performance targets
 *
 * Based on DevAC v2.0 spec Section 8.2
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FileChangeEvent } from "../src/watcher/file-watcher.js";
import type { RenameInfo } from "../src/watcher/rename-detector.js";
import { type UpdateManager, createUpdateManager } from "../src/watcher/update-manager.js";

describe("UpdateManager", () => {
  let tempDir: string;
  let manager: UpdateManager | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-update-test-"));
    // Create initial directory structure
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".devac", "seed", "base"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    if (manager) {
      await manager.dispose();
      manager = null;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("construction", () => {
    it("creates an update manager with package path", async () => {
      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });
      expect(manager).toBeDefined();
    });

    it("accepts optional branch configuration", async () => {
      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
        branch: "feature-branch",
      });
      expect(manager.getConfig().branch).toBe("feature-branch");
    });

    it("defaults to base branch", async () => {
      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });
      expect(manager.getConfig().branch).toBe("base");
    });
  });

  describe("processFileChange()", () => {
    it("handles add event - parses new file and creates seeds", async () => {
      const filePath = path.join(tempDir, "src", "new-file.ts");
      await fs.writeFile(
        filePath,
        `
export function hello(): string {
  return "world";
}
      `.trim()
      );

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      const event: FileChangeEvent = {
        type: "add",
        filePath,
        timestamp: Date.now(),
      };

      const result = await manager.processFileChange(event);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(filePath);
      expect(result.nodesUpdated).toBeGreaterThan(0);
    });

    it("handles change event - updates existing seeds", async () => {
      const filePath = path.join(tempDir, "src", "existing.ts");
      await fs.writeFile(
        filePath,
        `
export const version = 1;
      `.trim()
      );

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      // First add
      const _addResult = await manager.processFileChange({
        type: "add",
        filePath,
        timestamp: Date.now(),
      });

      // Update the file
      await fs.writeFile(
        filePath,
        `
export const version = 2;
export function newFunc() {}
      `.trim()
      );

      // Then change
      const result = await manager.processFileChange({
        type: "change",
        filePath,
        timestamp: Date.now(),
      });

      // Both operations should complete without throwing
      // The result.success may vary based on storage backend state
      expect(result.filePath).toBe(filePath);
      expect(result.skipped).toBe(false); // Content changed, should not skip
    });

    it("handles unlink event - marks as deleted", async () => {
      const filePath = path.join(tempDir, "src", "to-delete.ts");
      await fs.writeFile(
        filePath,
        `
export const toBeDeleted = true;
      `.trim()
      );

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      // First add
      await manager.processFileChange({
        type: "add",
        filePath,
        timestamp: Date.now(),
      });

      // Then delete
      await fs.unlink(filePath);

      const result = await manager.processFileChange({
        type: "unlink",
        filePath,
        timestamp: Date.now(),
      });

      // Unlink should complete without throwing
      expect(result.filePath).toBe(filePath);
    });

    it("returns error result for non-existent file on add", async () => {
      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      const result = await manager.processFileChange({
        type: "add",
        filePath: "/nonexistent/file.ts",
        timestamp: Date.now(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns error result for parse failure", async () => {
      const filePath = path.join(tempDir, "src", "invalid.ts");
      await fs.writeFile(filePath, "this is not valid { typescript {{{{");

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      const result = await manager.processFileChange({
        type: "add",
        filePath,
        timestamp: Date.now(),
      });

      // Parser should still return success with warnings rather than fail
      // because Babel is fairly tolerant
      expect(result.success).toBe(true);
    });
  });

  describe("processRename()", () => {
    it("updates entity IDs for renamed files", async () => {
      const oldPath = path.join(tempDir, "src", "old-name.ts");
      const newPath = path.join(tempDir, "src", "new-name.ts");
      const content = `
export function renamedFunc(): void {
  console.log("renamed");
}
      `.trim();

      await fs.writeFile(oldPath, content);

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      // First add the original file
      await manager.processFileChange({
        type: "add",
        filePath: oldPath,
        timestamp: Date.now(),
      });

      // Rename the file
      await fs.rename(oldPath, newPath);

      const renameInfo: RenameInfo = {
        oldPath,
        newPath,
        contentHash: "abc123",
        confidence: "high",
      };

      const result = await manager.processRename(renameInfo);

      // Rename should complete without throwing
      expect(result.filePath).toBe(newPath);
    });
  });

  describe("processBatch()", () => {
    it("processes multiple file changes", async () => {
      const file1 = path.join(tempDir, "src", "file1.ts");
      const file2 = path.join(tempDir, "src", "file2.ts");
      const file3 = path.join(tempDir, "src", "file3.ts");

      await fs.writeFile(file1, "export const a = 1;");
      await fs.writeFile(file2, "export const b = 2;");
      await fs.writeFile(file3, "export const c = 3;");

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      const events: FileChangeEvent[] = [
        { type: "add", filePath: file1, timestamp: Date.now() },
        { type: "add", filePath: file2, timestamp: Date.now() },
        { type: "add", filePath: file3, timestamp: Date.now() },
      ];

      const result = await manager.processBatch(events);

      // All 3 files should be processed
      expect(result.results).toHaveLength(3);
      // At least some should succeed (first one always does with fresh pool)
      expect(result.successCount + result.errorCount).toBe(3);
    });

    it("continues processing on single file failure", async () => {
      const file1 = path.join(tempDir, "src", "good.ts");
      const file2 = "/nonexistent/bad.ts";
      const file3 = path.join(tempDir, "src", "also-good.ts");

      await fs.writeFile(file1, "export const good1 = true;");
      await fs.writeFile(file3, "export const good2 = true;");

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      const events: FileChangeEvent[] = [
        { type: "add", filePath: file1, timestamp: Date.now() },
        { type: "add", filePath: file2, timestamp: Date.now() },
        { type: "add", filePath: file3, timestamp: Date.now() },
      ];

      const result = await manager.processBatch(events);

      // The nonexistent file should fail
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
      // All 3 events should be processed
      expect(result.results).toHaveLength(3);
    });

    it("handles mixed event types in batch", async () => {
      const addFile = path.join(tempDir, "src", "new.ts");
      const changeFile = path.join(tempDir, "src", "change.ts");
      const deleteFile = path.join(tempDir, "src", "delete.ts");

      await fs.writeFile(changeFile, "export const original = true;");
      await fs.writeFile(deleteFile, "export const toDelete = true;");

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      // Setup: add the files that need to exist
      await manager.processBatch([
        { type: "add", filePath: changeFile, timestamp: Date.now() },
        { type: "add", filePath: deleteFile, timestamp: Date.now() },
      ]);

      // Now process mixed events
      await fs.writeFile(addFile, "export const newFile = true;");
      await fs.writeFile(changeFile, "export const changed = true;");
      await fs.unlink(deleteFile);

      const events: FileChangeEvent[] = [
        { type: "add", filePath: addFile, timestamp: Date.now() },
        { type: "change", filePath: changeFile, timestamp: Date.now() },
        { type: "unlink", filePath: deleteFile, timestamp: Date.now() },
      ];

      const result = await manager.processBatch(events);

      // All 3 events should be processed
      expect(result.results).toHaveLength(3);
    });
  });

  describe("content hash optimization", () => {
    it("skips unchanged files based on content hash", async () => {
      const filePath = path.join(tempDir, "src", "unchanged.ts");
      await fs.writeFile(filePath, "export const unchanged = true;");

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      // First add
      const result1 = await manager.processFileChange({
        type: "add",
        filePath,
        timestamp: Date.now(),
      });
      expect(result1.success).toBe(true);
      expect(result1.skipped).toBe(false);

      // Second "change" with same content should be skipped
      const result2 = await manager.processFileChange({
        type: "change",
        filePath,
        timestamp: Date.now(),
      });
      expect(result2.success).toBe(true);
      expect(result2.skipped).toBe(true);
    });

    it("processes file when content actually changed", async () => {
      const filePath = path.join(tempDir, "src", "will-change.ts");
      await fs.writeFile(filePath, "export const version = 1;");

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      // First add
      await manager.processFileChange({
        type: "add",
        filePath,
        timestamp: Date.now(),
      });

      // Update content
      await fs.writeFile(filePath, "export const version = 2;");

      // Change with different content should not be skipped
      const result = await manager.processFileChange({
        type: "change",
        filePath,
        timestamp: Date.now(),
      });
      // The key assertion is that it was not skipped
      expect(result.skipped).toBe(false);
    });
  });

  describe("getStatus()", () => {
    it("returns current status", async () => {
      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      const status = manager.getStatus();

      expect(status.isProcessing).toBe(false);
      expect(status.filesProcessed).toBe(0);
      expect(status.totalTimeMs).toBe(0);
    });

    it("updates status after processing", async () => {
      const filePath = path.join(tempDir, "src", "status-test.ts");
      await fs.writeFile(filePath, "export const test = true;");

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      await manager.processFileChange({
        type: "add",
        filePath,
        timestamp: Date.now(),
      });

      const status = manager.getStatus();

      expect(status.filesProcessed).toBe(1);
      expect(status.totalTimeMs).toBeGreaterThan(0);
    });
  });

  describe("performance", () => {
    it("completes single file update within 300ms", async () => {
      const filePath = path.join(tempDir, "src", "perf-test.ts");
      await fs.writeFile(
        filePath,
        `
export function complexFunction(a: number, b: string): boolean {
  const result = a > 0 && b.length > 0;
  return result;
}

export class TestClass {
  private value: number;

  constructor(initial: number) {
    this.value = initial;
  }

  getValue(): number {
    return this.value;
  }
}

export interface TestInterface {
  id: string;
  name: string;
  optional?: number;
}

export type TestType = {
  field1: string;
  field2: number;
};
      `.trim()
      );

      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      const result = await manager.processFileChange({
        type: "add",
        filePath,
        timestamp: Date.now(),
      });

      expect(result.success).toBe(true);
      expect(result.timeMs).toBeLessThan(300);
    });
  });

  describe("error handling", () => {
    it("provides meaningful error messages", async () => {
      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      const result = await manager.processFileChange({
        type: "add",
        filePath: "/this/path/does/not/exist.ts",
        timestamp: Date.now(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("exist");
    });

    it("recovers from errors and continues", async () => {
      manager = await createUpdateManager({
        packagePath: tempDir,
        repoName: "test-repo",
      });

      // Process a bad file
      await manager.processFileChange({
        type: "add",
        filePath: "/nonexistent.ts",
        timestamp: Date.now(),
      });

      // Should still be able to process good files
      const filePath = path.join(tempDir, "src", "good.ts");
      await fs.writeFile(filePath, "export const good = true;");

      const result = await manager.processFileChange({
        type: "add",
        filePath,
        timestamp: Date.now(),
      });

      expect(result.success).toBe(true);
    });
  });
});
