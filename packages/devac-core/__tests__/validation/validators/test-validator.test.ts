/**
 * Tests for test-validator.ts
 */
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock dependencies before imports
vi.mock("node:child_process");
vi.mock("node:fs/promises");

import {
  TestValidator,
  createTestValidator,
} from "../../../src/validation/validators/test-validator.js";

describe("TestValidator", () => {
  const mockPackagePath = "/test/package";

  // Mock process for spawn
  class MockProcess extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
  }

  let mockProcess: MockProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = new MockProcess();

    vi.mocked(spawn).mockReturnValue(mockProcess as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validate", () => {
    test("returns success when all tests pass", async () => {
      const validator = new TestValidator();

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
      );

      const resultPromise = validator.validate(mockPackagePath);

      setTimeout(() => {
        mockProcess.stdout.emit("data", "Tests  10 passed (10)");
        mockProcess.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.passed).toBe(10);
      expect(result.failed).toBe(0);
    });

    test("returns failure when tests fail", async () => {
      const validator = new TestValidator();

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
      );

      const resultPromise = validator.validate(mockPackagePath);

      setTimeout(() => {
        mockProcess.stdout.emit("data", "Tests  2 failed | 8 passed (10)");
        mockProcess.emit("close", 1);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.passed).toBe(8);
      expect(result.failed).toBe(2);
    });

    test("uses specified runner", async () => {
      const validator = new TestValidator();

      const resultPromise = validator.validate(mockPackagePath, { runner: "jest" });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "Tests:       5 passed, 5 total");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith("jest", [], expect.any(Object));
    });

    test("adds updateSnapshot flag for vitest", async () => {
      const validator = new TestValidator();

      const resultPromise = validator.validate(mockPackagePath, {
        runner: "vitest",
        updateSnapshots: true,
      });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "Tests  1 passed (1)");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        "vitest",
        expect.arrayContaining(["--update"]),
        expect.any(Object)
      );
    });

    test("adds updateSnapshot flag for jest", async () => {
      const validator = new TestValidator();

      const resultPromise = validator.validate(mockPackagePath, {
        runner: "jest",
        updateSnapshots: true,
      });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "Tests:       1 passed, 1 total");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        "jest",
        expect.arrayContaining(["--updateSnapshot"]),
        expect.any(Object)
      );
    });

    test("passes specific files to runner", async () => {
      const validator = new TestValidator();

      const resultPromise = validator.validate(mockPackagePath, {
        runner: "vitest",
        files: ["test/file1.test.ts", "test/file2.test.ts"],
      });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "Tests  5 passed (5)");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        "vitest",
        expect.arrayContaining(["test/file1.test.ts", "test/file2.test.ts"]),
        expect.any(Object)
      );
    });

    test("uses npm test runner", async () => {
      const validator = new TestValidator();

      const resultPromise = validator.validate(mockPackagePath, { runner: "npm-test" });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "✓ test 1\n✓ test 2");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith("npm", ["test"], expect.any(Object));
    });

    test("handles spawn error gracefully", async () => {
      const validator = new TestValidator();

      const resultPromise = validator.validate(mockPackagePath, { runner: "vitest" });

      setTimeout(() => {
        mockProcess.emit("error", new Error("Command not found"));
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.failed).toBe(1);
      expect(result.passed).toBe(0);
    });

    test("uses timeout option", async () => {
      const validator = new TestValidator();

      const resultPromise = validator.validate(mockPackagePath, {
        runner: "vitest",
        timeout: 60000,
      });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "Tests  1 passed (1)");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        "vitest",
        expect.any(Array),
        expect.objectContaining({ timeout: 60000 })
      );
    });

    test("disables color output for parsing", async () => {
      const validator = new TestValidator();

      const resultPromise = validator.validate(mockPackagePath, { runner: "vitest" });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "Tests  1 passed (1)");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        "vitest",
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            NO_COLOR: "1",
            FORCE_COLOR: "0",
          }),
        })
      );
    });

    test("calculates time taken", async () => {
      const validator = new TestValidator();

      const resultPromise = validator.validate(mockPackagePath, { runner: "vitest" });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "Tests  1 passed (1)");
        mockProcess.emit("close", 0);
      }, 10);

      const result = await resultPromise;

      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("parseOutput", () => {
    test("parses vitest passed format", () => {
      const validator = new TestValidator();
      const output = "Tests  15 passed (15)";

      const counts = validator.parseOutput(output);

      expect(counts.passed).toBe(15);
      expect(counts.failed).toBe(0);
    });

    test("parses vitest failed format", () => {
      const validator = new TestValidator();
      const output = "Tests  3 failed | 12 passed (15)";

      const counts = validator.parseOutput(output);

      expect(counts.passed).toBe(12);
      expect(counts.failed).toBe(3);
    });

    test("parses jest passed format", () => {
      const validator = new TestValidator();
      const output = "Tests:       10 passed, 10 total";

      const counts = validator.parseOutput(output);

      expect(counts.passed).toBe(10);
      expect(counts.failed).toBe(0);
    });

    test("parses jest failed format", () => {
      const validator = new TestValidator();
      const output = "Tests:       2 failed, 8 passed, 10 total";

      const counts = validator.parseOutput(output);

      expect(counts.passed).toBe(8);
      expect(counts.failed).toBe(2);
    });

    test("counts checkmarks for passed tests", () => {
      const validator = new TestValidator();
      const output = "✓ test 1\n✓ test 2\n✓ test 3";

      const counts = validator.parseOutput(output);

      expect(counts.passed).toBe(3);
      expect(counts.failed).toBe(0);
    });

    test("counts x marks for failed tests", () => {
      const validator = new TestValidator();
      const output = "✓ test 1\n× test 2\n✓ test 3";

      const counts = validator.parseOutput(output);

      expect(counts.passed).toBe(2);
      expect(counts.failed).toBe(1);
    });

    test("handles empty output", () => {
      const validator = new TestValidator();

      const counts = validator.parseOutput("");

      expect(counts.passed).toBe(0);
      expect(counts.failed).toBe(0);
      expect(counts.skipped).toBe(0);
    });

    test("handles whitespace-only output", () => {
      const validator = new TestValidator();

      const counts = validator.parseOutput("   \n   ");

      expect(counts.passed).toBe(0);
      expect(counts.failed).toBe(0);
    });

    test("returns zeros for unrecognized format", () => {
      const validator = new TestValidator();
      const output = "Some random output without test counts";

      const counts = validator.parseOutput(output);

      expect(counts.passed).toBe(0);
      expect(counts.failed).toBe(0);
      expect(counts.skipped).toBe(0);
    });
  });

  describe("detectTestRunner", () => {
    test("detects vitest from devDependencies", async () => {
      const validator = new TestValidator();

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
      );

      const runner = await validator.detectTestRunner(mockPackagePath);

      expect(runner).toBe("vitest");
    });

    test("detects jest from devDependencies", async () => {
      const validator = new TestValidator();

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ devDependencies: { jest: "^29.0.0" } })
      );

      const runner = await validator.detectTestRunner(mockPackagePath);

      expect(runner).toBe("jest");
    });

    test("detects vitest from test script", async () => {
      const validator = new TestValidator();

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ scripts: { test: "vitest run" } }));

      const runner = await validator.detectTestRunner(mockPackagePath);

      expect(runner).toBe("vitest");
    });

    test("detects jest from test script", async () => {
      const validator = new TestValidator();

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ scripts: { test: "jest" } }));

      const runner = await validator.detectTestRunner(mockPackagePath);

      expect(runner).toBe("jest");
    });

    test("detects npm-test when test script exists but not vitest/jest", async () => {
      const validator = new TestValidator();

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ scripts: { test: "mocha" } }));

      const runner = await validator.detectTestRunner(mockPackagePath);

      expect(runner).toBe("npm-test");
    });

    test("returns null when package.json not found", async () => {
      const validator = new TestValidator();

      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

      const runner = await validator.detectTestRunner(mockPackagePath);

      expect(runner).toBeNull();
    });

    test("returns null when no test configuration", async () => {
      const validator = new TestValidator();

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({}));

      const runner = await validator.detectTestRunner(mockPackagePath);

      expect(runner).toBeNull();
    });

    test("prefers vitest over jest when both present", async () => {
      const validator = new TestValidator();

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          devDependencies: { vitest: "^1.0.0", jest: "^29.0.0" },
        })
      );

      const runner = await validator.detectTestRunner(mockPackagePath);

      expect(runner).toBe("vitest");
    });
  });

  describe("createTestValidator", () => {
    test("creates a TestValidator instance", () => {
      const validator = createTestValidator();

      expect(validator).toBeInstanceOf(TestValidator);
    });
  });
});
