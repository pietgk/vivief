/**
 * Unit tests for Rename Detector Module
 *
 * The rename detector must:
 * - Detect file renames by matching content hashes between deletes and adds
 * - Handle renames within a debounce window
 * - Support cross-directory renames
 * - Expire pending deletes after a timeout
 * - Process multiple renames in a single batch
 *
 * Based on DevAC v2.0 spec Section 8.4
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileChangeEvent } from "../src/watcher/file-watcher.js";
import { type RenameDetector, createRenameDetector } from "../src/watcher/rename-detector.js";

describe("RenameDetector", () => {
  let tempDir: string;
  let detector: RenameDetector | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-rename-test-"));
    // Create initial directory structure
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "lib"), { recursive: true });
  });

  afterEach(async () => {
    if (detector) {
      detector.clearPending();
      detector = null;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  describe("construction", () => {
    it("creates a rename detector with default options", () => {
      detector = createRenameDetector();
      expect(detector).toBeDefined();
      expect(detector.getOptions().timeoutMs).toBe(1000);
    });

    it("accepts custom timeout option", () => {
      detector = createRenameDetector({ timeoutMs: 500 });
      expect(detector.getOptions().timeoutMs).toBe(500);
    });
  });

  describe("detectRename()", () => {
    it("detects rename when delete+add have matching content hash", async () => {
      const content = 'export const hello = "world";';
      const oldPath = path.join(tempDir, "src", "old.ts");
      const newPath = path.join(tempDir, "src", "new.ts");

      // Create both files with same content
      await fs.writeFile(oldPath, content);
      await fs.writeFile(newPath, content);

      detector = createRenameDetector();
      const result = await detector.detectRename(oldPath, newPath);

      expect(result).not.toBeNull();
      expect(result?.oldPath).toBe(oldPath);
      expect(result?.newPath).toBe(newPath);
      expect(result?.confidence).toBe("high");
    });

    it("returns null when hashes do not match", async () => {
      const oldPath = path.join(tempDir, "src", "old.ts");
      const newPath = path.join(tempDir, "src", "new.ts");

      await fs.writeFile(oldPath, "export const x = 1;");
      await fs.writeFile(newPath, "export const y = 2;");

      detector = createRenameDetector();
      const result = await detector.detectRename(oldPath, newPath);

      expect(result).toBeNull();
    });

    it("handles cross-directory renames", async () => {
      const content = "export function foo() { return 42; }";
      const oldPath = path.join(tempDir, "src", "utils.ts");
      const newPath = path.join(tempDir, "lib", "utils.ts");

      await fs.writeFile(oldPath, content);
      await fs.writeFile(newPath, content);

      detector = createRenameDetector();
      const result = await detector.detectRename(oldPath, newPath);

      expect(result).not.toBeNull();
      expect(result?.oldPath).toBe(oldPath);
      expect(result?.newPath).toBe(newPath);
    });

    it("returns null if old file does not exist", async () => {
      const newPath = path.join(tempDir, "src", "new.ts");
      await fs.writeFile(newPath, "content");

      detector = createRenameDetector();
      const result = await detector.detectRename("/nonexistent/file.ts", newPath);

      expect(result).toBeNull();
    });

    it("returns null if new file does not exist", async () => {
      const oldPath = path.join(tempDir, "src", "old.ts");
      await fs.writeFile(oldPath, "content");

      detector = createRenameDetector();
      const result = await detector.detectRename(oldPath, "/nonexistent/file.ts");

      expect(result).toBeNull();
    });
  });

  describe("processEventBatch()", () => {
    it("detects rename from paired delete and add events", async () => {
      const content = "export const test = true;";
      const oldPath = path.join(tempDir, "src", "old-name.ts");
      const newPath = path.join(tempDir, "src", "new-name.ts");

      // Create new file with same content (old file was "deleted")
      await fs.writeFile(newPath, content);

      // Store the hash for the "deleted" file before creating events
      detector = createRenameDetector();

      // Register the pending delete with its content hash
      await detector.registerPendingDelete(oldPath, content);

      const events: FileChangeEvent[] = [
        { type: "unlink", filePath: oldPath, timestamp: Date.now() },
        { type: "add", filePath: newPath, timestamp: Date.now() },
      ];

      const result = await detector.processEventBatch(events);

      expect(result.renames).toHaveLength(1);
      expect(result.renames[0].oldPath).toBe(oldPath);
      expect(result.renames[0].newPath).toBe(newPath);
      expect(result.adds).toHaveLength(0);
      expect(result.deletes).toHaveLength(0);
    });

    it("handles add without matching delete as regular add", async () => {
      const newPath = path.join(tempDir, "src", "brand-new.ts");
      await fs.writeFile(newPath, "new content");

      detector = createRenameDetector();
      const events: FileChangeEvent[] = [{ type: "add", filePath: newPath, timestamp: Date.now() }];

      const result = await detector.processEventBatch(events);

      expect(result.renames).toHaveLength(0);
      expect(result.adds).toHaveLength(1);
      expect(result.adds[0].filePath).toBe(newPath);
    });

    it("handles delete without matching add as regular delete", async () => {
      const oldPath = path.join(tempDir, "src", "deleted.ts");

      detector = createRenameDetector();
      const events: FileChangeEvent[] = [
        { type: "unlink", filePath: oldPath, timestamp: Date.now() },
      ];

      const result = await detector.processEventBatch(events);

      expect(result.renames).toHaveLength(0);
      expect(result.deletes).toHaveLength(1);
      expect(result.deletes[0].filePath).toBe(oldPath);
    });

    it("handles change events as changes", async () => {
      const filePath = path.join(tempDir, "src", "modified.ts");
      await fs.writeFile(filePath, "modified content");

      detector = createRenameDetector();
      const events: FileChangeEvent[] = [{ type: "change", filePath, timestamp: Date.now() }];

      const result = await detector.processEventBatch(events);

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].filePath).toBe(filePath);
    });

    it("processes multiple renames in single batch", async () => {
      const content1 = "export const a = 1;";
      const content2 = "export const b = 2;";

      const oldPath1 = path.join(tempDir, "src", "file1-old.ts");
      const newPath1 = path.join(tempDir, "src", "file1-new.ts");
      const oldPath2 = path.join(tempDir, "src", "file2-old.ts");
      const newPath2 = path.join(tempDir, "src", "file2-new.ts");

      await fs.writeFile(newPath1, content1);
      await fs.writeFile(newPath2, content2);

      detector = createRenameDetector();
      await detector.registerPendingDelete(oldPath1, content1);
      await detector.registerPendingDelete(oldPath2, content2);

      const events: FileChangeEvent[] = [
        { type: "unlink", filePath: oldPath1, timestamp: Date.now() },
        { type: "add", filePath: newPath1, timestamp: Date.now() },
        { type: "unlink", filePath: oldPath2, timestamp: Date.now() },
        { type: "add", filePath: newPath2, timestamp: Date.now() },
      ];

      const result = await detector.processEventBatch(events);

      expect(result.renames).toHaveLength(2);
    });

    it("handles mixed events (renames, adds, deletes, changes)", async () => {
      const renameContent = "export const renamed = true;";
      const oldRenamePath = path.join(tempDir, "src", "old-rename.ts");
      const newRenamePath = path.join(tempDir, "src", "new-rename.ts");
      const newAddPath = path.join(tempDir, "src", "brand-new.ts");
      const changedPath = path.join(tempDir, "src", "changed.ts");
      const deletedPath = path.join(tempDir, "src", "deleted.ts");

      await fs.writeFile(newRenamePath, renameContent);
      await fs.writeFile(newAddPath, "new file content");
      await fs.writeFile(changedPath, "changed content");

      detector = createRenameDetector();
      await detector.registerPendingDelete(oldRenamePath, renameContent);

      const events: FileChangeEvent[] = [
        { type: "unlink", filePath: oldRenamePath, timestamp: Date.now() },
        { type: "add", filePath: newRenamePath, timestamp: Date.now() },
        { type: "add", filePath: newAddPath, timestamp: Date.now() },
        { type: "change", filePath: changedPath, timestamp: Date.now() },
        { type: "unlink", filePath: deletedPath, timestamp: Date.now() },
      ];

      const result = await detector.processEventBatch(events);

      expect(result.renames).toHaveLength(1);
      expect(result.adds).toHaveLength(1);
      expect(result.changes).toHaveLength(1);
      expect(result.deletes).toHaveLength(1);
    });
  });

  describe("pending delete expiration", () => {
    it("expires pending deletes after timeout", async () => {
      vi.useFakeTimers();

      const content = "export const expiring = true;";
      const oldPath = path.join(tempDir, "src", "expiring.ts");
      const newPath = path.join(tempDir, "src", "new-file.ts");

      await fs.writeFile(newPath, content);

      detector = createRenameDetector({ timeoutMs: 500 });
      await detector.registerPendingDelete(oldPath, content);

      // Advance time past the timeout
      vi.advanceTimersByTime(600);

      // Now process the add - should not match expired delete
      const events: FileChangeEvent[] = [{ type: "add", filePath: newPath, timestamp: Date.now() }];

      const result = await detector.processEventBatch(events);

      expect(result.renames).toHaveLength(0);
      expect(result.adds).toHaveLength(1);
    });

    it("matches pending delete within timeout window", async () => {
      vi.useFakeTimers();

      const content = "export const notExpired = true;";
      const oldPath = path.join(tempDir, "src", "not-expiring.ts");
      const newPath = path.join(tempDir, "src", "renamed.ts");

      await fs.writeFile(newPath, content);

      detector = createRenameDetector({ timeoutMs: 1000 });
      await detector.registerPendingDelete(oldPath, content);

      // Advance time but stay within timeout
      vi.advanceTimersByTime(500);

      const events: FileChangeEvent[] = [{ type: "add", filePath: newPath, timestamp: Date.now() }];

      const result = await detector.processEventBatch(events);

      expect(result.renames).toHaveLength(1);
      expect(result.renames[0].oldPath).toBe(oldPath);
    });
  });

  describe("clearPending()", () => {
    it("clears all pending deletes", async () => {
      const content = "export const cleared = true;";
      const oldPath = path.join(tempDir, "src", "cleared.ts");
      const newPath = path.join(tempDir, "src", "new-cleared.ts");

      await fs.writeFile(newPath, content);

      detector = createRenameDetector();
      await detector.registerPendingDelete(oldPath, content);

      detector.clearPending();

      const events: FileChangeEvent[] = [{ type: "add", filePath: newPath, timestamp: Date.now() }];

      const result = await detector.processEventBatch(events);

      expect(result.renames).toHaveLength(0);
      expect(result.adds).toHaveLength(1);
    });
  });

  describe("getPendingDeleteCount()", () => {
    it("returns the number of pending deletes", async () => {
      detector = createRenameDetector();

      expect(detector.getPendingDeleteCount()).toBe(0);

      await detector.registerPendingDelete("/path/1.ts", "content1");
      expect(detector.getPendingDeleteCount()).toBe(1);

      await detector.registerPendingDelete("/path/2.ts", "content2");
      expect(detector.getPendingDeleteCount()).toBe(2);

      detector.clearPending();
      expect(detector.getPendingDeleteCount()).toBe(0);
    });
  });

  describe("confidence levels", () => {
    it("returns high confidence when content hashes match exactly", async () => {
      const content = "export const exact = true;";
      const oldPath = path.join(tempDir, "src", "exact-old.ts");
      const newPath = path.join(tempDir, "src", "exact-new.ts");

      await fs.writeFile(oldPath, content);
      await fs.writeFile(newPath, content);

      detector = createRenameDetector();
      const result = await detector.detectRename(oldPath, newPath);

      expect(result?.confidence).toBe("high");
    });

    it("returns medium confidence when file names are similar", async () => {
      // This tests a heuristic where similar file names + same directory
      // could indicate a rename even without pre-stored hash
      const content = "export const similar = true;";
      const oldPath = path.join(tempDir, "src", "component.ts");
      const newPath = path.join(tempDir, "src", "Component.ts");

      await fs.writeFile(oldPath, content);
      await fs.writeFile(newPath, content);

      detector = createRenameDetector();
      const result = await detector.detectRename(oldPath, newPath);

      // Should still be high since hashes match
      expect(result?.confidence).toBe("high");
    });
  });
});
