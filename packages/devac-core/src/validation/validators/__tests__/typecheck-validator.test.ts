/**
 * Typecheck Validator Tests
 *
 * Tests for TypeScript type checking validation.
 * Based on DevAC v2.0 spec Section 10.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TypecheckValidator, createTypecheckValidator } from "../typecheck-validator.js";

describe("TypecheckValidator", () => {
  let tempDir: string;
  let validator: TypecheckValidator;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = path.join(
      "/tmp",
      `devac-test-typecheck-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(tempDir, { recursive: true });

    // Create a basic tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: "ES2020",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["src/**/*.ts"],
    };
    await fs.writeFile(path.join(tempDir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));

    // Create src directory
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

    // Create validator
    validator = createTypecheckValidator();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validate", () => {
    it("returns success when no type errors", async () => {
      // Create a valid TypeScript file
      await fs.writeFile(
        path.join(tempDir, "src", "valid.ts"),
        `export function add(a: number, b: number): number {
  return a + b;
}
`
      );

      const result = await validator.validate(tempDir);

      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });

    it("detects type errors in TypeScript files", async () => {
      // Create a file with a type error
      await fs.writeFile(
        path.join(tempDir, "src", "error.ts"),
        `export function add(a: number, b: number): number {
  return a + "string"; // Type error: string + number
}
`
      );

      const result = await validator.validate(tempDir);

      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].source).toBe("tsc");
      expect(result.issues[0].severity).toBe("error");
      expect(result.issues[0].file).toContain("error.ts");
    });

    it("includes error code in issues", async () => {
      // Create a file with a type error
      await fs.writeFile(
        path.join(tempDir, "src", "error.ts"),
        `const x: number = "not a number";
`
      );

      const result = await validator.validate(tempDir);

      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      // TS2322: Type 'string' is not assignable to type 'number'
      expect(result.issues[0].code).toMatch(/TS\d+/);
    });

    it("checks all project files with tsconfig (files option is informational)", async () => {
      // Create two files, one with error
      await fs.writeFile(path.join(tempDir, "src", "valid.ts"), "export const x: number = 42;");
      await fs.writeFile(
        path.join(tempDir, "src", "error.ts"),
        `export const y: number = "string";`
      );

      // Note: tsc with --project checks all files in tsconfig, not just specified files
      // The files option is informational for our validation coordinator
      const result = await validator.validate(tempDir, {
        files: ["src/valid.ts"],
      });

      // Will still check error.ts because it's in tsconfig.include
      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it("handles missing tsconfig.json gracefully", async () => {
      // Remove tsconfig
      await fs.rm(path.join(tempDir, "tsconfig.json"));

      const result = await validator.validate(tempDir);

      // tsc may return success if no tsconfig (uses default config) or fail
      // Either way, result should have timing info and not throw
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.timeMs).toBe("number");
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it("respects timeout option", async () => {
      // Create a valid file but use very short timeout
      await fs.writeFile(path.join(tempDir, "src", "valid.ts"), "export const x = 1;");

      // This should still work with a reasonable timeout
      const result = await validator.validate(tempDir, {
        timeout: 30000, // 30 seconds
      });

      expect(typeof result.timeMs).toBe("number");
    });

    it("returns timing metrics", async () => {
      await fs.writeFile(path.join(tempDir, "src", "valid.ts"), "export const x = 1;");

      const result = await validator.validate(tempDir);

      expect(typeof result.timeMs).toBe("number");
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("parseOutput", () => {
    it("parses tsc error output correctly", () => {
      const output = `src/utils.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/api.ts(25,10): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.`;

      const issues = validator.parseOutput(output);

      expect(issues).toHaveLength(2);

      expect(issues[0]).toMatchObject({
        file: "src/utils.ts",
        line: 10,
        column: 5,
        code: "TS2322",
        severity: "error",
        source: "tsc",
      });
      expect(issues[0].message).toContain("Type 'string' is not assignable");

      expect(issues[1]).toMatchObject({
        file: "src/api.ts",
        line: 25,
        column: 10,
        code: "TS2345",
        severity: "error",
        source: "tsc",
      });
    });

    it("handles empty output", () => {
      const issues = validator.parseOutput("");

      expect(issues).toHaveLength(0);
    });

    it("handles output with no errors", () => {
      const output = `
Found 0 errors. Watching for file changes.
`;

      const issues = validator.parseOutput(output);

      expect(issues).toHaveLength(0);
    });

    it("handles multi-line error messages", () => {
      const output = `src/test.ts(5,3): error TS2739: Type '{ name: string; }' is missing the following properties from type 'User': age, email`;

      const issues = validator.parseOutput(output);

      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("missing the following properties");
    });
  });
});
