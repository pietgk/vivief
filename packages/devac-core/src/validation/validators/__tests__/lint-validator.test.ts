/**
 * Lint Validator Tests
 *
 * Tests for ESLint validation.
 * Based on DevAC v2.0 spec Section 10.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LintValidator, createLintValidator } from "../lint-validator.js";

describe("LintValidator", () => {
  let tempDir: string;
  let validator: LintValidator;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = path.join(
      "/tmp",
      `devac-test-lint-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(tempDir, { recursive: true });

    // Create a basic eslint.config.js (flat config)
    const eslintConfig = `
export default [
  {
    rules: {
      "no-unused-vars": "error",
      "no-console": "warn",
    },
  },
];
`;
    await fs.writeFile(path.join(tempDir, "eslint.config.js"), eslintConfig);

    // Create a package.json to make it a proper module
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ type: "module" }, null, 2)
    );

    // Create src directory
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

    // Create validator
    validator = createLintValidator();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validate", () => {
    it("returns success when no lint errors", async () => {
      // Create a valid file
      await fs.writeFile(
        path.join(tempDir, "src", "valid.js"),
        `const x = 42;
export { x };
`
      );

      const result = await validator.validate(tempDir, {
        files: ["src/valid.js"],
      });

      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });

    it("detects lint errors", async () => {
      // Create a file with unused variable (error)
      await fs.writeFile(
        path.join(tempDir, "src", "error.js"),
        `const unusedVar = 42;
export const x = 1;
`
      );

      const result = await validator.validate(tempDir, {
        files: ["src/error.js"],
      });

      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]!.source).toBe("eslint");
      expect(result.issues[0]!.severity).toBe("error");
    });

    it("detects lint warnings", async () => {
      // Create a file with console.log (warning)
      await fs.writeFile(
        path.join(tempDir, "src", "warning.js"),
        `console.log("hello");
export const x = 1;
`
      );

      const result = await validator.validate(tempDir, {
        files: ["src/warning.js"],
      });

      // Warnings don't fail the check
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.severity === "warning")).toBe(true);
    });

    it("includes rule id in issues", async () => {
      await fs.writeFile(
        path.join(tempDir, "src", "error.js"),
        `const unusedVar = 42;
export const x = 1;
`
      );

      const result = await validator.validate(tempDir, {
        files: ["src/error.js"],
      });

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]!.code).toBe("no-unused-vars");
    });

    it("returns timing metrics", async () => {
      await fs.writeFile(path.join(tempDir, "src", "valid.js"), "export const x = 1;");

      const result = await validator.validate(tempDir, {
        files: ["src/valid.js"],
      });

      expect(typeof result.timeMs).toBe("number");
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });

    it("handles non-existent files gracefully", async () => {
      const result = await validator.validate(tempDir, {
        files: ["src/nonexistent.js"],
      });

      // ESLint may or may not error on missing files depending on config
      expect(typeof result.success).toBe("boolean");
      expect(Array.isArray(result.issues)).toBe(true);
    });
  });

  describe("parseOutput", () => {
    it("parses ESLint JSON output correctly", () => {
      const output = JSON.stringify([
        {
          filePath: "/project/src/test.js",
          messages: [
            {
              ruleId: "no-unused-vars",
              severity: 2,
              message: "'x' is defined but never used.",
              line: 1,
              column: 7,
            },
            {
              ruleId: "no-console",
              severity: 1,
              message: "Unexpected console statement.",
              line: 5,
              column: 1,
            },
          ],
          errorCount: 1,
          warningCount: 1,
        },
      ]);

      const issues = validator.parseOutput(output, "/project");

      expect(issues).toHaveLength(2);

      expect(issues[0]).toMatchObject({
        file: "src/test.js",
        line: 1,
        column: 7,
        code: "no-unused-vars",
        severity: "error",
        source: "eslint",
      });
      expect(issues[0]!.message).toContain("defined but never used");

      expect(issues[1]).toMatchObject({
        file: "src/test.js",
        line: 5,
        column: 1,
        code: "no-console",
        severity: "warning",
        source: "eslint",
      });
    });

    it("handles empty output", () => {
      const issues = validator.parseOutput("[]", "/project");

      expect(issues).toHaveLength(0);
    });

    it("handles files with no messages", () => {
      const output = JSON.stringify([
        {
          filePath: "/project/src/clean.js",
          messages: [],
          errorCount: 0,
          warningCount: 0,
        },
      ]);

      const issues = validator.parseOutput(output, "/project");

      expect(issues).toHaveLength(0);
    });

    it("handles invalid JSON gracefully", () => {
      const issues = validator.parseOutput("not valid json", "/project");

      expect(issues).toHaveLength(0);
    });

    it("handles multiple files", () => {
      const output = JSON.stringify([
        {
          filePath: "/project/src/a.js",
          messages: [
            {
              ruleId: "no-unused-vars",
              severity: 2,
              message: "Error in a.js",
              line: 1,
              column: 1,
            },
          ],
          errorCount: 1,
          warningCount: 0,
        },
        {
          filePath: "/project/src/b.js",
          messages: [
            {
              ruleId: "no-console",
              severity: 1,
              message: "Warning in b.js",
              line: 2,
              column: 1,
            },
          ],
          errorCount: 0,
          warningCount: 1,
        },
      ]);

      const issues = validator.parseOutput(output, "/project");

      expect(issues).toHaveLength(2);
      expect(issues[0]!.file).toBe("src/a.js");
      expect(issues[1]!.file).toBe("src/b.js");
    });
  });
});
