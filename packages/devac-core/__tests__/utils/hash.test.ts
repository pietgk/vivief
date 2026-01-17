/**
 * Tests for hash.ts
 *
 * Tests the hash utilities for file change detection.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  combineHashes,
  computeBufferHash,
  computeFileHash,
  computeFileHashes,
  computeStringHash,
  findChangedFiles,
  generateRandomHash,
  generateScopeHash,
  hasFileChanged,
} from "../../src/utils/hash.js";

// =============================================================================
// Test Helpers
// =============================================================================

let testDir: string;

async function createTestFile(filename: string, content: string): Promise<string> {
  const filePath = path.join(testDir, filename);
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

// =============================================================================
// computeStringHash Tests
// =============================================================================

describe("computeStringHash", () => {
  test("returns consistent hash for same input", () => {
    const input = "hello world";
    const hash1 = computeStringHash(input);
    const hash2 = computeStringHash(input);

    expect(hash1).toBe(hash2);
  });

  test("returns different hash for different input", () => {
    const hash1 = computeStringHash("hello");
    const hash2 = computeStringHash("world");

    expect(hash1).not.toBe(hash2);
  });

  test("returns 64-character hex string (SHA-256)", () => {
    const hash = computeStringHash("test");

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  test("handles empty string", () => {
    const hash = computeStringHash("");

    expect(hash).toHaveLength(64);
    // SHA-256 of empty string is known
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  test("handles unicode characters", () => {
    const hash = computeStringHash("日本語テスト");

    expect(hash).toHaveLength(64);
  });

  test("handles special characters", () => {
    const hash = computeStringHash("!@#$%^&*()_+{}|:<>?");

    expect(hash).toHaveLength(64);
  });
});

// =============================================================================
// computeBufferHash Tests
// =============================================================================

describe("computeBufferHash", () => {
  test("returns consistent hash for same buffer", () => {
    const buffer = Buffer.from("hello world");
    const hash1 = computeBufferHash(buffer);
    const hash2 = computeBufferHash(buffer);

    expect(hash1).toBe(hash2);
  });

  test("returns same hash as string version for same content", () => {
    const content = "test content";
    const stringHash = computeStringHash(content);
    const bufferHash = computeBufferHash(Buffer.from(content, "utf8"));

    expect(stringHash).toBe(bufferHash);
  });

  test("handles binary data", () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    const hash = computeBufferHash(buffer);

    expect(hash).toHaveLength(64);
  });

  test("handles empty buffer", () => {
    const buffer = Buffer.alloc(0);
    const hash = computeBufferHash(buffer);

    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

// =============================================================================
// computeFileHash Tests
// =============================================================================

describe("computeFileHash", () => {
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "hash-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("computes hash of file contents", async () => {
    const content = "file content for hashing";
    const filePath = await createTestFile("test.txt", content);

    const hash = await computeFileHash(filePath);

    expect(hash).toBe(computeStringHash(content));
  });

  test("returns consistent hash for same file", async () => {
    const filePath = await createTestFile("test.txt", "consistent content");

    const hash1 = await computeFileHash(filePath);
    const hash2 = await computeFileHash(filePath);

    expect(hash1).toBe(hash2);
  });

  test("throws error for non-existent file", async () => {
    await expect(computeFileHash("/non/existent/file.txt")).rejects.toThrow();
  });

  test("handles binary files", async () => {
    const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
    const filePath = path.join(testDir, "binary.bin");
    await fs.writeFile(filePath, binaryContent);

    const hash = await computeFileHash(filePath);

    expect(hash).toBe(computeBufferHash(binaryContent));
  });
});

// =============================================================================
// computeFileHashes Tests
// =============================================================================

describe("computeFileHashes", () => {
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "hash-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("computes hashes for multiple files", async () => {
    const file1 = await createTestFile("file1.txt", "content 1");
    const file2 = await createTestFile("file2.txt", "content 2");
    const file3 = await createTestFile("file3.txt", "content 3");

    const hashes = await computeFileHashes([file1, file2, file3]);

    expect(hashes.size).toBe(3);
    expect(hashes.get(file1)).toBe(computeStringHash("content 1"));
    expect(hashes.get(file2)).toBe(computeStringHash("content 2"));
    expect(hashes.get(file3)).toBe(computeStringHash("content 3"));
  });

  test("skips files that cannot be read", async () => {
    const file1 = await createTestFile("file1.txt", "content 1");
    const nonExistent = path.join(testDir, "nonexistent.txt");

    const hashes = await computeFileHashes([file1, nonExistent]);

    expect(hashes.size).toBe(1);
    expect(hashes.has(file1)).toBe(true);
    expect(hashes.has(nonExistent)).toBe(false);
  });

  test("handles empty array", async () => {
    const hashes = await computeFileHashes([]);

    expect(hashes.size).toBe(0);
  });

  test("handles all unreadable files", async () => {
    const hashes = await computeFileHashes(["/nonexistent1.txt", "/nonexistent2.txt"]);

    expect(hashes.size).toBe(0);
  });
});

// =============================================================================
// generateScopeHash Tests
// =============================================================================

describe("generateScopeHash", () => {
  test("returns 8-character hash", () => {
    const hash = generateScopeHash("src/file.ts", "MyClass.myMethod", "method");

    expect(hash).toHaveLength(8);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  test("returns consistent hash for same inputs", () => {
    const hash1 = generateScopeHash("src/file.ts", "MyClass", "class");
    const hash2 = generateScopeHash("src/file.ts", "MyClass", "class");

    expect(hash1).toBe(hash2);
  });

  test("returns different hash when file path differs", () => {
    const hash1 = generateScopeHash("src/file1.ts", "MyClass", "class");
    const hash2 = generateScopeHash("src/file2.ts", "MyClass", "class");

    expect(hash1).not.toBe(hash2);
  });

  test("returns different hash when scoped name differs", () => {
    const hash1 = generateScopeHash("src/file.ts", "ClassA", "class");
    const hash2 = generateScopeHash("src/file.ts", "ClassB", "class");

    expect(hash1).not.toBe(hash2);
  });

  test("returns different hash when kind differs", () => {
    const hash1 = generateScopeHash("src/file.ts", "doSomething", "function");
    const hash2 = generateScopeHash("src/file.ts", "doSomething", "method");

    expect(hash1).not.toBe(hash2);
  });

  test("normalizes whitespace", () => {
    const hash1 = generateScopeHash("  src/file.ts  ", "  MyClass  ", "  class  ");
    const hash2 = generateScopeHash("src/file.ts", "MyClass", "class");

    expect(hash1).toBe(hash2);
  });

  test("handles unicode normalization", () => {
    // These are different unicode representations of the same character
    const hash1 = generateScopeHash("src/file.ts", "café", "variable");
    const hash2 = generateScopeHash("src/file.ts", "café".normalize("NFC"), "variable");

    expect(hash1).toBe(hash2);
  });
});

// =============================================================================
// hasFileChanged Tests
// =============================================================================

describe("hasFileChanged", () => {
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "hash-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("returns false when file hash matches", async () => {
    const content = "unchanged content";
    const filePath = await createTestFile("test.txt", content);
    const expectedHash = computeStringHash(content);

    const changed = await hasFileChanged(filePath, expectedHash);

    expect(changed).toBe(false);
  });

  test("returns true when file hash differs", async () => {
    const filePath = await createTestFile("test.txt", "new content");
    const oldHash = computeStringHash("old content");

    const changed = await hasFileChanged(filePath, oldHash);

    expect(changed).toBe(true);
  });

  test("returns true when file does not exist", async () => {
    const changed = await hasFileChanged("/nonexistent/file.txt", "somehash");

    expect(changed).toBe(true);
  });

  test("returns true when file cannot be read", async () => {
    const changed = await hasFileChanged("/root/protected/file.txt", "somehash");

    expect(changed).toBe(true);
  });
});

// =============================================================================
// findChangedFiles Tests
// =============================================================================

describe("findChangedFiles", () => {
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "hash-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("identifies unchanged files", async () => {
    const content = "unchanged content";
    const file = await createTestFile("unchanged.txt", content);
    const storedHashes = new Map([[file, computeStringHash(content)]]);

    const result = await findChangedFiles([file], storedHashes);

    expect(result.unchanged).toContain(file);
    expect(result.changed).toHaveLength(0);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  test("identifies changed files", async () => {
    const file = await createTestFile("changed.txt", "new content");
    const storedHashes = new Map([[file, computeStringHash("old content")]]);

    const result = await findChangedFiles([file], storedHashes);

    expect(result.changed).toContain(file);
    expect(result.unchanged).toHaveLength(0);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  test("identifies added files", async () => {
    const file = await createTestFile("new.txt", "new content");
    const storedHashes = new Map<string, string>();

    const result = await findChangedFiles([file], storedHashes);

    expect(result.added).toContain(file);
    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  test("identifies removed files", async () => {
    const existingFile = await createTestFile("existing.txt", "content");
    const removedFile = path.join(testDir, "removed.txt");
    const storedHashes = new Map([
      [existingFile, computeStringHash("content")],
      [removedFile, computeStringHash("removed content")],
    ]);

    const result = await findChangedFiles([existingFile], storedHashes);

    expect(result.removed).toContain(removedFile);
    expect(result.unchanged).toContain(existingFile);
  });

  test("handles mixed scenarios", async () => {
    const unchanged = await createTestFile("unchanged.txt", "same");
    const changed = await createTestFile("changed.txt", "new");
    const added = await createTestFile("added.txt", "fresh");
    const removedPath = path.join(testDir, "removed.txt");

    const storedHashes = new Map([
      [unchanged, computeStringHash("same")],
      [changed, computeStringHash("old")],
      [removedPath, computeStringHash("gone")],
    ]);

    const result = await findChangedFiles([unchanged, changed, added], storedHashes);

    expect(result.unchanged).toContain(unchanged);
    expect(result.changed).toContain(changed);
    expect(result.added).toContain(added);
    expect(result.removed).toContain(removedPath);
  });

  test("handles empty inputs", async () => {
    const result = await findChangedFiles([], new Map());

    expect(result.unchanged).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  test("skips unreadable files", async () => {
    const readable = await createTestFile("readable.txt", "content");
    const unreadable = "/nonexistent/file.txt";

    const storedHashes = new Map([[readable, computeStringHash("content")]]);

    const result = await findChangedFiles([readable, unreadable], storedHashes);

    expect(result.unchanged).toContain(readable);
    // Unreadable file is just skipped, not added to any category
  });
});

// =============================================================================
// generateRandomHash Tests
// =============================================================================

describe("generateRandomHash", () => {
  test("returns hash of default length (8)", () => {
    const hash = generateRandomHash();

    expect(hash).toHaveLength(8);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  test("returns hash of specified length", () => {
    const hash = generateRandomHash(16);

    expect(hash).toHaveLength(16);
  });

  test("returns different values on each call", () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      hashes.add(generateRandomHash());
    }

    // Should have 100 unique hashes (extremely unlikely to have collisions)
    expect(hashes.size).toBe(100);
  });

  test("handles small lengths", () => {
    const hash = generateRandomHash(2);

    expect(hash).toHaveLength(2);
  });

  test("handles odd lengths", () => {
    const hash = generateRandomHash(7);

    expect(hash).toHaveLength(7);
  });
});

// =============================================================================
// combineHashes Tests
// =============================================================================

describe("combineHashes", () => {
  test("combines multiple hashes into one", () => {
    const hash1 = computeStringHash("content 1");
    const hash2 = computeStringHash("content 2");
    const hash3 = computeStringHash("content 3");

    const combined = combineHashes([hash1, hash2, hash3]);

    expect(combined).toHaveLength(64);
    expect(combined).toMatch(/^[a-f0-9]+$/);
  });

  test("returns consistent result for same inputs", () => {
    const hashes = ["abc123", "def456", "ghi789"];

    const combined1 = combineHashes(hashes);
    const combined2 = combineHashes(hashes);

    expect(combined1).toBe(combined2);
  });

  test("returns same result regardless of input order", () => {
    const combined1 = combineHashes(["abc123", "def456", "ghi789"]);
    const combined2 = combineHashes(["ghi789", "abc123", "def456"]);
    const combined3 = combineHashes(["def456", "ghi789", "abc123"]);

    expect(combined1).toBe(combined2);
    expect(combined2).toBe(combined3);
  });

  test("handles single hash", () => {
    const hash = "single_hash_value";

    const combined = combineHashes([hash]);

    expect(combined).toHaveLength(64);
  });

  test("handles empty array", () => {
    const combined = combineHashes([]);

    // SHA-256 of empty input
    expect(combined).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  test("produces different output for different inputs", () => {
    const combined1 = combineHashes(["hash1", "hash2"]);
    const combined2 = combineHashes(["hash1", "hash3"]);

    expect(combined1).not.toBe(combined2);
  });
});
