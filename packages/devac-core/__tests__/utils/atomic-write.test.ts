/**
 * Atomic Write Utilities Tests
 *
 * Tests for atomic-write.ts - atomic file operations
 */

import type { Stats } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupTempFiles,
  copyFileAtomic,
  createTempFile,
  ensureDir,
  fileExists,
  fsyncDirectory,
  getFileMtime,
  moveFileAtomic,
  removeIfExists,
  writeFileAtomic,
  writeJsonAtomic,
} from "../../src/utils/atomic-write.js";

// Mock fs/promises
vi.mock("node:fs/promises");
vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => ({
    toString: () => "abcd1234",
  })),
}));

const mockFs = vi.mocked(fs);

describe("atomic-write utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("writeFileAtomic", () => {
    it("writes file using temp + rename pattern", async () => {
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await writeFileAtomic("/test/dir/file.txt", "content");

      // Should create directory
      expect(mockFs.mkdir).toHaveBeenCalledWith("/test/dir", { recursive: true });

      // Should write to temp file
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(".tmp_file.txt_"),
        "content",
        { mode: 0o644 }
      );

      // Should fsync temp file
      expect(mockFd.sync).toHaveBeenCalled();

      // Should rename to final path
      expect(mockFs.rename).toHaveBeenCalledWith(
        expect.stringContaining(".tmp_file.txt_"),
        "/test/dir/file.txt"
      );
    });

    it("uses custom temp directory when provided", async () => {
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await writeFileAtomic("/test/dir/file.txt", "content", {
        tempDir: "/tmp/custom",
      });

      // Should create both directories
      expect(mockFs.mkdir).toHaveBeenCalledWith("/test/dir", { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith("/tmp/custom", { recursive: true });

      // Temp file should be in custom dir
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("/tmp/custom/.tmp_file.txt_"),
        "content",
        expect.any(Object)
      );
    });

    it("uses custom file mode when provided", async () => {
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await writeFileAtomic("/test/file.txt", "content", { mode: 0o755 });

      expect(mockFs.writeFile).toHaveBeenCalledWith(expect.any(String), "content", { mode: 0o755 });
    });

    it("cleans up temp file on write failure", async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error("Disk full"));

      await expect(writeFileAtomic("/test/file.txt", "content")).rejects.toThrow("Disk full");

      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining(".tmp_file.txt_"));
    });

    it("cleans up temp file on fsync failure", async () => {
      const mockFd = {
        sync: vi.fn().mockRejectedValue(new Error("I/O error")),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await expect(writeFileAtomic("/test/file.txt", "content")).rejects.toThrow("I/O error");

      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it("skips directory fsync when fsyncDir is false", async () => {
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await writeFileAtomic("/test/file.txt", "content", { fsyncDir: false });

      // Should only open temp file for fsync, not directory
      expect(mockFs.open).toHaveBeenCalledTimes(1);
    });

    it("fsyncs directory when fsyncDir is true (default)", async () => {
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await writeFileAtomic("/test/file.txt", "content");

      // Should open both temp file and directory for fsync
      expect(mockFs.open).toHaveBeenCalledTimes(2);
      expect(mockFs.open).toHaveBeenCalledWith(expect.stringContaining(".tmp_"), "r");
      expect(mockFs.open).toHaveBeenCalledWith("/test", "r");
    });
  });

  describe("writeJsonAtomic", () => {
    it("writes pretty-printed JSON by default", async () => {
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await writeJsonAtomic("/test/data.json", { key: "value" });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({ key: "value" }, null, 2),
        expect.any(Object)
      );
    });

    it("writes compact JSON when pretty is false", async () => {
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await writeJsonAtomic("/test/data.json", { key: "value" }, {}, false);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({ key: "value" }),
        expect.any(Object)
      );
    });
  });

  describe("copyFileAtomic", () => {
    it("reads source and writes atomically to destination", async () => {
      const sourceContent = Buffer.from("source content");
      mockFs.readFile.mockResolvedValueOnce(sourceContent);
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await copyFileAtomic("/src/file.txt", "/dest/file.txt");

      expect(mockFs.readFile).toHaveBeenCalledWith("/src/file.txt");
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(".tmp_file.txt_"),
        sourceContent,
        expect.any(Object)
      );
    });
  });

  describe("moveFileAtomic", () => {
    it("moves file using rename", async () => {
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await moveFileAtomic("/src/file.txt", "/dest/file.txt");

      expect(mockFs.mkdir).toHaveBeenCalledWith("/dest", { recursive: true });
      expect(mockFs.rename).toHaveBeenCalledWith("/src/file.txt", "/dest/file.txt");
    });

    it("fsyncs destination directory by default", async () => {
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await moveFileAtomic("/src/file.txt", "/dest/file.txt");

      expect(mockFs.open).toHaveBeenCalledWith("/dest", "r");
      expect(mockFd.sync).toHaveBeenCalled();
    });

    it("skips fsync when fsyncDir is false", async () => {
      await moveFileAtomic("/src/file.txt", "/dest/file.txt", { fsyncDir: false });

      expect(mockFs.open).not.toHaveBeenCalled();
    });
  });

  describe("fsyncDirectory", () => {
    it("opens and syncs directory", async () => {
      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await fsyncDirectory("/test/dir");

      expect(mockFs.open).toHaveBeenCalledWith("/test/dir", "r");
      expect(mockFd.sync).toHaveBeenCalled();
      expect(mockFd.close).toHaveBeenCalled();
    });

    it("closes fd even if sync fails", async () => {
      const mockFd = {
        sync: vi.fn().mockRejectedValue(new Error("Sync failed")),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockFs.open.mockResolvedValue(mockFd as unknown as fs.FileHandle);

      await expect(fsyncDirectory("/test/dir")).rejects.toThrow("Sync failed");

      expect(mockFd.close).toHaveBeenCalled();
    });
  });

  describe("createTempFile", () => {
    it("creates temp file with unique name", async () => {
      const result = await createTempFile("/tmp");

      expect(mockFs.mkdir).toHaveBeenCalledWith("/tmp", { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(expect.stringContaining("/tmp/tmp_"), "");
      expect(result).toMatch(/^\/tmp\/tmp_[a-f0-9]+$/);
    });

    it("uses custom prefix", async () => {
      const result = await createTempFile("/tmp", "myprefix");

      expect(mockFs.writeFile).toHaveBeenCalledWith(expect.stringContaining("/tmp/myprefix_"), "");
      expect(result).toMatch(/^\/tmp\/myprefix_[a-f0-9]+$/);
    });
  });

  describe("cleanupTempFiles", () => {
    it("removes temp files older than maxAge", async () => {
      const now = Date.now();
      const oldTime = now - 2 * 60 * 60 * 1000; // 2 hours ago

      // Mock Dirent-like objects for fs.readdir
      const mockDirents = [
        { name: ".tmp_old", isFile: () => true },
        { name: "tmp_also_old", isFile: () => true },
        { name: "regular_file", isFile: () => true },
      ] as never[];
      mockFs.readdir.mockResolvedValueOnce(mockDirents);

      mockFs.stat
        .mockResolvedValueOnce({ mtimeMs: oldTime } as Stats)
        .mockResolvedValueOnce({ mtimeMs: oldTime } as Stats);

      const result = await cleanupTempFiles("/test/dir", 60 * 60 * 1000); // 1 hour max age

      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
      expect(result).toBe(2);
    });

    it("keeps temp files newer than maxAge", async () => {
      const now = Date.now();
      const recentTime = now - 30 * 60 * 1000; // 30 minutes ago

      const mockDirents = [{ name: ".tmp_recent", isFile: () => true }] as never[];
      mockFs.readdir.mockResolvedValueOnce(mockDirents);

      mockFs.stat.mockResolvedValueOnce({ mtimeMs: recentTime } as Stats);

      const result = await cleanupTempFiles("/test/dir", 60 * 60 * 1000);

      expect(mockFs.unlink).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it("ignores directories", async () => {
      const mockDirents = [
        { name: ".tmp_dir", isFile: () => false, isDirectory: () => true },
      ] as never[];
      mockFs.readdir.mockResolvedValueOnce(mockDirents);

      const result = await cleanupTempFiles("/test/dir");

      expect(mockFs.stat).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it("ignores files not matching pattern", async () => {
      const mockDirents = [{ name: "regular_file.txt", isFile: () => true }] as never[];
      mockFs.readdir.mockResolvedValueOnce(mockDirents);

      const result = await cleanupTempFiles("/test/dir");

      expect(mockFs.stat).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it("handles non-existent directory gracefully", async () => {
      mockFs.readdir.mockRejectedValueOnce(new Error("ENOENT"));

      const result = await cleanupTempFiles("/nonexistent");

      expect(result).toBe(0);
    });

    it("handles individual file errors gracefully", async () => {
      const now = Date.now();
      const oldTime = now - 2 * 60 * 60 * 1000;

      const mockDirents = [
        { name: ".tmp_file1", isFile: () => true },
        { name: ".tmp_file2", isFile: () => true },
      ] as never[];
      mockFs.readdir.mockResolvedValueOnce(mockDirents);

      mockFs.stat
        .mockRejectedValueOnce(new Error("Permission denied"))
        .mockResolvedValueOnce({ mtimeMs: oldTime } as Stats);

      const result = await cleanupTempFiles("/test/dir", 60 * 60 * 1000);

      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(result).toBe(1);
    });

    it("uses custom pattern", async () => {
      const now = Date.now();
      const oldTime = now - 2 * 60 * 60 * 1000;

      const mockDirents = [
        { name: "custom_prefix_file", isFile: () => true },
        { name: ".tmp_not_matched", isFile: () => true },
      ] as never[];
      mockFs.readdir.mockResolvedValueOnce(mockDirents);

      mockFs.stat.mockResolvedValueOnce({ mtimeMs: oldTime } as Stats);

      const result = await cleanupTempFiles("/test/dir", 60 * 60 * 1000, /^custom_prefix_/);

      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(path.join("/test/dir", "custom_prefix_file"));
      expect(result).toBe(1);
    });
  });

  describe("ensureDir", () => {
    it("creates directory recursively", async () => {
      await ensureDir("/test/nested/dir");

      expect(mockFs.mkdir).toHaveBeenCalledWith("/test/nested/dir", { recursive: true });
    });
  });

  describe("removeIfExists", () => {
    it("returns true when file is removed", async () => {
      mockFs.unlink.mockResolvedValueOnce(undefined);

      const result = await removeIfExists("/test/file.txt");

      expect(result).toBe(true);
      expect(mockFs.unlink).toHaveBeenCalledWith("/test/file.txt");
    });

    it("returns false when file does not exist", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockFs.unlink.mockRejectedValueOnce(error);

      const result = await removeIfExists("/test/nonexistent.txt");

      expect(result).toBe(false);
    });

    it("throws on other errors", async () => {
      const error = new Error("Permission denied") as NodeJS.ErrnoException;
      error.code = "EACCES";
      mockFs.unlink.mockRejectedValueOnce(error);

      await expect(removeIfExists("/test/file.txt")).rejects.toThrow("Permission denied");
    });
  });

  describe("fileExists", () => {
    it("returns true when file exists", async () => {
      mockFs.access.mockResolvedValueOnce(undefined);

      const result = await fileExists("/test/file.txt");

      expect(result).toBe(true);
    });

    it("returns false when file does not exist", async () => {
      mockFs.access.mockRejectedValueOnce(new Error("ENOENT"));

      const result = await fileExists("/test/nonexistent.txt");

      expect(result).toBe(false);
    });
  });

  describe("getFileMtime", () => {
    it("returns modification time for existing file", async () => {
      const mtime = Date.now();
      mockFs.stat.mockResolvedValueOnce({ mtimeMs: mtime } as Stats);

      const result = await getFileMtime("/test/file.txt");

      expect(result).toBe(mtime);
    });

    it("returns null for non-existent file", async () => {
      mockFs.stat.mockRejectedValueOnce(new Error("ENOENT"));

      const result = await getFileMtime("/test/nonexistent.txt");

      expect(result).toBe(null);
    });
  });
});
