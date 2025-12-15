/**
 * Test Validator Tests
 *
 * Tests for test runner validation.
 * Based on DevAC v2.0 spec Section 10.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestValidator, createTestValidator } from "../test-validator.js";

describe("TestValidator", () => {
  let tempDir: string;
  let validator: TestValidator;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = path.join(
      "/tmp",
      `devac-test-validator-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(tempDir, { recursive: true });

    // Create a basic package.json with test script
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            test: "vitest run",
          },
        },
        null,
        2
      )
    );

    // Create vitest config
    await fs.writeFile(
      path.join(tempDir, "vitest.config.js"),
      `
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
  },
});
`
    );

    // Create src directory
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

    // Create validator
    validator = createTestValidator();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validate", () => {
    it("returns proper result structure", async () => {
      // Test basic result structure without requiring vitest to be installed
      const result = await validator.validate(tempDir);

      // Should return proper structure even if tests can't run
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.passed).toBe("number");
      expect(typeof result.failed).toBe("number");
      expect(typeof result.skipped).toBe("number");
      expect(typeof result.timeMs).toBe("number");
      expect(typeof result.runner).toBe("string");
    });

    it("respects timeout option", async () => {
      const result = await validator.validate(tempDir, {
        timeout: 1000, // 1 second timeout
      });

      // Should complete (even if failed) within reasonable time
      expect(result.timeMs).toBeLessThan(60000); // Less than 60s
    });

    it("returns timing metrics", async () => {
      const result = await validator.validate(tempDir);

      expect(typeof result.timeMs).toBe("number");
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("parseOutput", () => {
    it("parses vitest output correctly", () => {
      const output = `
 ✓ src/utils.test.ts (3 tests) 50ms
   ✓ add > adds two numbers
   ✓ add > adds negative numbers
   ✓ subtract > subtracts numbers

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  10:30:00
   Duration  150ms
`;

      const result = validator.parseOutput(output);

      expect(result.passed).toBe(3);
      expect(result.failed).toBe(0);
    });

    it("parses vitest output with failures", () => {
      const output = `
 ❯ src/utils.test.ts (3 tests | 1 failed) 50ms
   ✓ add > adds two numbers
   × add > handles edge case
   ✓ subtract > subtracts numbers

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Start at  10:30:00
   Duration  150ms
`;

      const result = validator.parseOutput(output);

      expect(result.passed).toBe(2);
      expect(result.failed).toBe(1);
    });

    it("handles empty output", () => {
      const result = validator.parseOutput("");

      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("handles output with no tests", () => {
      const output = `
No test files found, exiting with code 0
`;

      const result = validator.parseOutput(output);

      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe("detectTestRunner", () => {
    it("detects vitest from package.json", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { test: "vitest run" },
          devDependencies: { vitest: "^1.0.0" },
        })
      );

      const runner = await validator.detectTestRunner(tempDir);

      expect(runner).toBe("vitest");
    });

    it("detects jest from package.json", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { test: "jest" },
          devDependencies: { jest: "^29.0.0" },
        })
      );

      const runner = await validator.detectTestRunner(tempDir);

      expect(runner).toBe("jest");
    });

    it("returns npm-test for generic test script", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { test: "node test.js" },
        })
      );

      const runner = await validator.detectTestRunner(tempDir);

      expect(runner).toBe("npm-test");
    });

    it("returns null when no package.json", async () => {
      await fs.rm(path.join(tempDir, "package.json"));

      const runner = await validator.detectTestRunner(tempDir);

      expect(runner).toBeNull();
    });
  });
});
