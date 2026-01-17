// @ts-nocheck - TODO: Fix type mismatches with updated interfaces
/**
 * Tests for typecheck-validator.ts
 */
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock dependencies before imports
vi.mock("node:child_process");
vi.mock("node:fs");

import {
  TypecheckValidator,
  createTypecheckValidator,
} from "../../../src/validation/validators/typecheck-validator.js";

describe("TypecheckValidator", () => {
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
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validate", () => {
    test("returns success when no errors", async () => {
      const validator = new TypecheckValidator();

      const resultPromise = validator.validate(mockPackagePath);

      setTimeout(() => {
        mockProcess.stdout.emit("data", "");
        mockProcess.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test("parses typecheck errors from output", async () => {
      const validator = new TypecheckValidator();

      const resultPromise = validator.validate(mockPackagePath);

      setTimeout(() => {
        mockProcess.stdout.emit(
          "data",
          "src/file.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'."
        );
        mockProcess.emit("close", 1);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toEqual({
        file: "src/file.ts",
        line: 10,
        column: 5,
        message: "Type 'string' is not assignable to type 'number'.",
        severity: "error",
        source: "tsc",
        code: "TS2322",
      });
    });

    test("uses custom tsconfig when specified", async () => {
      const validator = new TypecheckValidator();

      const resultPromise = validator.validate(mockPackagePath, {
        tsconfig: "tsconfig.build.json",
      });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        "tsc",
        expect.arrayContaining(["--project", "/test/package/tsconfig.build.json"]),
        expect.any(Object)
      );
    });

    test("uses timeout option", async () => {
      const validator = new TypecheckValidator();

      const resultPromise = validator.validate(mockPackagePath, { timeout: 30000 });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        "tsc",
        expect.any(Array),
        expect.objectContaining({ timeout: 30000 })
      );
    });

    test("uses local tsc when available", async () => {
      const validator = new TypecheckValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join(mockPackagePath, "node_modules", ".bin", "tsc");
      });

      const resultPromise = validator.validate(mockPackagePath);

      setTimeout(() => {
        mockProcess.stdout.emit("data", "");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        path.join(mockPackagePath, "node_modules", ".bin", "tsc"),
        expect.any(Array),
        expect.any(Object)
      );
    });

    test("uses parent tsc in monorepo setup", async () => {
      const validator = new TypecheckValidator();
      const parentPath = path.dirname(mockPackagePath);

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join(parentPath, "node_modules", ".bin", "tsc");
      });

      const resultPromise = validator.validate(mockPackagePath);

      setTimeout(() => {
        mockProcess.stdout.emit("data", "");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        path.join(parentPath, "node_modules", ".bin", "tsc"),
        expect.any(Array),
        expect.any(Object)
      );
    });

    test("handles spawn error gracefully", async () => {
      const validator = new TypecheckValidator();

      const resultPromise = validator.validate(mockPackagePath);

      setTimeout(() => {
        mockProcess.emit("error", new Error("tsc not found"));
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.issues[0].message).toBe("tsc not found");
    });

    test("calculates time taken", async () => {
      const validator = new TypecheckValidator();

      const resultPromise = validator.validate(mockPackagePath);

      setTimeout(() => {
        mockProcess.stdout.emit("data", "");
        mockProcess.emit("close", 0);
      }, 10);

      const result = await resultPromise;

      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });

    test("handles stderr output on non-zero exit", async () => {
      const validator = new TypecheckValidator();

      const resultPromise = validator.validate(mockPackagePath);

      setTimeout(() => {
        mockProcess.stderr.emit("data", "Some stderr output");
        mockProcess.emit("close", 2);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true); // No parseable errors in stderr
      expect(result.issues).toHaveLength(0);
    });
  });

  describe("parseOutput", () => {
    test("parses single error", () => {
      const validator = new TypecheckValidator();
      const output =
        "src/utils.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.";

      const issues = validator.parseOutput(output);

      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual({
        file: "src/utils.ts",
        line: 10,
        column: 5,
        message: "Type 'string' is not assignable to type 'number'.",
        severity: "error",
        source: "tsc",
        code: "TS2322",
      });
    });

    test("parses multiple errors", () => {
      const validator = new TypecheckValidator();
      const output = `src/file1.ts(5,3): error TS2304: Cannot find name 'foo'.
src/file2.ts(20,10): error TS2551: Property 'naem' does not exist on type 'User'.`;

      const issues = validator.parseOutput(output);

      expect(issues).toHaveLength(2);
      expect(issues[0].file).toBe("src/file1.ts");
      expect(issues[0].code).toBe("TS2304");
      expect(issues[1].file).toBe("src/file2.ts");
      expect(issues[1].code).toBe("TS2551");
    });

    test("parses warnings", () => {
      const validator = new TypecheckValidator();
      const output = "src/utils.ts(10,5): warning TS6133: 'unused' is declared but never used.";

      const issues = validator.parseOutput(output);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("warning");
    });

    test("handles empty output", () => {
      const validator = new TypecheckValidator();

      const issues = validator.parseOutput("");

      expect(issues).toEqual([]);
    });

    test("handles whitespace-only output", () => {
      const validator = new TypecheckValidator();

      const issues = validator.parseOutput("   \n   \n   ");

      expect(issues).toEqual([]);
    });

    test("ignores non-error lines", () => {
      const validator = new TypecheckValidator();
      const output = `Starting compilation...
src/file.ts(1,1): error TS2304: Cannot find name 'x'.
Compilation complete.
Found 1 error.`;

      const issues = validator.parseOutput(output);

      expect(issues).toHaveLength(1);
      expect(issues[0].file).toBe("src/file.ts");
    });

    test("handles Windows-style paths", () => {
      const validator = new TypecheckValidator();
      const output = "C:\\project\\src\\file.ts(10,5): error TS2322: Type error.";

      const issues = validator.parseOutput(output);

      expect(issues).toHaveLength(1);
      expect(issues[0].file).toBe("C:\\project\\src\\file.ts");
    });

    test("handles paths with spaces", () => {
      const validator = new TypecheckValidator();
      const output = "src/my file.ts(10,5): error TS2322: Type error.";

      const issues = validator.parseOutput(output);

      expect(issues).toHaveLength(1);
      expect(issues[0].file).toBe("src/my file.ts");
    });
  });

  describe("createTypecheckValidator", () => {
    test("creates a TypecheckValidator instance", () => {
      const validator = createTypecheckValidator();

      expect(validator).toBeInstanceOf(TypecheckValidator);
    });
  });
});
