// @ts-nocheck - TODO: Fix type mismatches with updated interfaces
/**
 * Tests for lint-validator.ts
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
  LintValidator,
  createLintValidator,
} from "../../../src/validation/validators/lint-validator.js";

describe("LintValidator", () => {
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

  describe("detectLinter", () => {
    test("detects biome when biome.json exists", () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join(mockPackagePath, "biome.json");
      });

      const linter = validator.detectLinter(mockPackagePath);

      expect(linter).toBe("biome");
    });

    test("detects biome when biome.jsonc exists", () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join(mockPackagePath, "biome.jsonc");
      });

      const linter = validator.detectLinter(mockPackagePath);

      expect(linter).toBe("biome");
    });

    test("detects eslint when .eslintrc exists", () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join(mockPackagePath, ".eslintrc");
      });

      const linter = validator.detectLinter(mockPackagePath);

      expect(linter).toBe("eslint");
    });

    test("detects eslint when eslint.config.js exists", () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join(mockPackagePath, "eslint.config.js");
      });

      const linter = validator.detectLinter(mockPackagePath);

      expect(linter).toBe("eslint");
    });

    test("detects eslint when eslint.config.mjs exists", () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join(mockPackagePath, "eslint.config.mjs");
      });

      const linter = validator.detectLinter(mockPackagePath);

      expect(linter).toBe("eslint");
    });

    test("detects biome in parent directory for monorepo", () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        // biome.json in parent, and biome binary exists
        if (p === path.join(path.dirname(mockPackagePath), "biome.json")) return true;
        if (p === path.join(path.dirname(mockPackagePath), "node_modules", ".bin", "biome"))
          return true;
        return false;
      });

      const linter = validator.detectLinter(mockPackagePath);

      expect(linter).toBe("biome");
    });

    test("detects eslint in parent directory for monorepo", () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join(path.dirname(mockPackagePath), ".eslintrc.js");
      });

      const linter = validator.detectLinter(mockPackagePath);

      expect(linter).toBe("eslint");
    });

    test("defaults to eslint when no config found", () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const linter = validator.detectLinter(mockPackagePath);

      expect(linter).toBe("eslint");
    });
  });

  describe("validate", () => {
    test("runs eslint when detected", async () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === path.join(mockPackagePath, ".eslintrc")) return true;
        return false;
      });

      const resultPromise = validator.validate(mockPackagePath);

      // Simulate eslint output
      setTimeout(() => {
        mockProcess.stdout.emit("data", "[]");
        mockProcess.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.linter).toBe("eslint");
      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        "eslint",
        expect.arrayContaining(["--format", "json"]),
        expect.any(Object)
      );
    });

    test("runs biome when detected and executable exists", async () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === path.join(mockPackagePath, "biome.json")) return true;
        if (p === path.join(mockPackagePath, "node_modules", ".bin", "biome")) return true;
        return false;
      });

      const resultPromise = validator.validate(mockPackagePath);

      // Simulate biome output
      setTimeout(() => {
        mockProcess.stdout.emit(
          "data",
          JSON.stringify({
            summary: { errors: 0, warnings: 0 },
            diagnostics: [],
          })
        );
        mockProcess.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.linter).toBe("biome");
      expect(result.success).toBe(true);
    });

    test("uses forced linter option", async () => {
      const validator = new LintValidator();

      const resultPromise = validator.validate(mockPackagePath, {
        linter: "eslint",
      });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "[]");
        mockProcess.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.linter).toBe("eslint");
    });

    test("returns error when linter execution fails", async () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === path.join(mockPackagePath, ".eslintrc")) return true;
        return false;
      });

      const resultPromise = validator.validate(mockPackagePath);

      setTimeout(() => {
        mockProcess.emit("error", new Error("Command not found"));
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.issues[0].message).toBe("Command not found");
    });

    test("includes files in args when specified", async () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === path.join(mockPackagePath, ".eslintrc")) return true;
        return false;
      });

      const resultPromise = validator.validate(mockPackagePath, {
        files: ["src/file1.ts", "src/file2.ts"],
      });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "[]");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        "eslint",
        expect.arrayContaining(["src/file1.ts", "src/file2.ts"]),
        expect.any(Object)
      );
    });

    test("adds --fix flag when fix option is true", async () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === path.join(mockPackagePath, ".eslintrc")) return true;
        return false;
      });

      const resultPromise = validator.validate(mockPackagePath, { fix: true });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "[]");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        "eslint",
        expect.arrayContaining(["--fix"]),
        expect.any(Object)
      );
    });

    test("adds --config flag when config option specified", async () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === path.join(mockPackagePath, ".eslintrc")) return true;
        return false;
      });

      const resultPromise = validator.validate(mockPackagePath, {
        config: "custom.eslintrc.js",
      });

      setTimeout(() => {
        mockProcess.stdout.emit("data", "[]");
        mockProcess.emit("close", 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        "eslint",
        expect.arrayContaining(["--config", "custom.eslintrc.js"]),
        expect.any(Object)
      );
    });

    test("returns error when biome executable not found", async () => {
      const validator = new LintValidator();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        // biome.json exists but no executable
        if (p === path.join(mockPackagePath, "biome.json")) return true;
        return false;
      });

      const result = await validator.validate(mockPackagePath, {
        linter: "biome",
      });

      expect(result.success).toBe(false);
      expect(result.issues[0].message).toBe("Biome executable not found");
    });
  });

  describe("parseEslintOutput", () => {
    test("parses valid eslint JSON output", () => {
      const validator = new LintValidator();
      const output = JSON.stringify([
        {
          filePath: "/test/package/src/file.ts",
          messages: [
            {
              ruleId: "no-unused-vars",
              severity: 2,
              message: "Unused variable",
              line: 10,
              column: 5,
            },
            {
              ruleId: "semi",
              severity: 1,
              message: "Missing semicolon",
              line: 15,
              column: 20,
            },
          ],
          errorCount: 1,
          warningCount: 1,
        },
      ]);

      const issues = validator.parseEslintOutput(output, mockPackagePath);

      expect(issues).toHaveLength(2);
      expect(issues[0]).toEqual({
        file: "src/file.ts",
        line: 10,
        column: 5,
        message: "Unused variable",
        severity: "error",
        source: "eslint",
        code: "no-unused-vars",
      });
      expect(issues[1].severity).toBe("warning");
    });

    test("handles empty output", () => {
      const validator = new LintValidator();

      const issues = validator.parseEslintOutput("", mockPackagePath);

      expect(issues).toEqual([]);
    });

    test("handles invalid JSON", () => {
      const validator = new LintValidator();

      const issues = validator.parseEslintOutput("not json", mockPackagePath);

      expect(issues).toEqual([]);
    });

    test("handles null ruleId", () => {
      const validator = new LintValidator();
      const output = JSON.stringify([
        {
          filePath: "/test/package/src/file.ts",
          messages: [
            {
              ruleId: null,
              severity: 2,
              message: "Parse error",
              line: 1,
              column: 1,
            },
          ],
          errorCount: 1,
          warningCount: 0,
        },
      ]);

      const issues = validator.parseEslintOutput(output, mockPackagePath);

      expect(issues[0].code).toBeUndefined();
    });
  });

  describe("parseBiomeOutput", () => {
    test("parses valid biome JSON output", () => {
      const validator = new LintValidator();
      const output = JSON.stringify({
        summary: { errors: 1, warnings: 1 },
        diagnostics: [
          {
            category: "lint/correctness",
            severity: "error",
            description: "Unused variable",
            message: [{ content: "Variable is never used" }],
            location: {
              path: { file: "src/file.ts" },
              span: [100, 110],
              sourceCode: "const x = 1;\nconst unused = 2;",
            },
          },
          {
            category: "lint/style",
            severity: "warning",
            description: "Missing trailing comma",
            message: [{ content: "Add trailing comma" }],
            location: {
              path: { file: "src/file.ts" },
              span: null,
              sourceCode: null,
            },
          },
        ],
      });

      const issues = validator.parseBiomeOutput(output, mockPackagePath);

      expect(issues).toHaveLength(2);
      expect(issues[0].severity).toBe("error");
      expect(issues[0].source).toBe("biome");
      expect(issues[1].severity).toBe("warning");
    });

    test("skips format diagnostics", () => {
      const validator = new LintValidator();
      const output = JSON.stringify({
        summary: { errors: 0, warnings: 0 },
        diagnostics: [
          {
            category: "format",
            severity: "error",
            description: "Formatting issue",
            message: [{ content: "Format this" }],
            location: {
              path: { file: "src/file.ts" },
              span: null,
              sourceCode: null,
            },
          },
        ],
      });

      const issues = validator.parseBiomeOutput(output, mockPackagePath);

      expect(issues).toHaveLength(0);
    });

    test("handles empty output", () => {
      const validator = new LintValidator();

      const issues = validator.parseBiomeOutput("", mockPackagePath);

      expect(issues).toEqual([]);
    });

    test("handles invalid JSON", () => {
      const validator = new LintValidator();

      const issues = validator.parseBiomeOutput("not json", mockPackagePath);

      expect(issues).toEqual([]);
    });

    test("handles missing diagnostics array", () => {
      const validator = new LintValidator();
      const output = JSON.stringify({ summary: { errors: 0, warnings: 0 } });

      const issues = validator.parseBiomeOutput(output, mockPackagePath);

      expect(issues).toEqual([]);
    });

    test("calculates line and column from span", () => {
      const validator = new LintValidator();
      // "line one here\n" = 14 chars (including newline)
      // span[0] = 15 means position 15 which is "l" of "line two here"
      // beforeSpan = "line one here\nl" (15 chars)
      // Has 1 newline -> line = 2
      // lastNewline is at position 13, so column = 15 - 13 = 2
      const output = JSON.stringify({
        summary: { errors: 1, warnings: 0 },
        diagnostics: [
          {
            category: "lint/correctness",
            severity: "error",
            description: "Error",
            message: [{ content: "Error message" }],
            location: {
              path: { file: "src/file.ts" },
              span: [15, 20], // Position 15 is second char of second line
              sourceCode: "line one here\nline two here",
            },
          },
        ],
      });

      const issues = validator.parseBiomeOutput(output, mockPackagePath);

      expect(issues[0].line).toBe(2); // Second line
      expect(issues[0].column).toBe(2); // Second character of second line (after the 'l')
    });

    test("uses description when message is empty", () => {
      const validator = new LintValidator();
      const output = JSON.stringify({
        summary: { errors: 1, warnings: 0 },
        diagnostics: [
          {
            category: "lint/correctness",
            severity: "error",
            description: "Descriptive error",
            message: [],
            location: {
              path: { file: "src/file.ts" },
              span: null,
              sourceCode: null,
            },
          },
        ],
      });

      const issues = validator.parseBiomeOutput(output, mockPackagePath);

      expect(issues[0].message).toBe("Descriptive error");
    });
  });

  describe("createLintValidator", () => {
    test("creates a LintValidator instance", () => {
      const validator = createLintValidator();

      expect(validator).toBeInstanceOf(LintValidator);
    });
  });
});
