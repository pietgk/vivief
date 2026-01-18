/**
 * Coverage Validator Tests
 *
 * Tests for test coverage validation.
 * Based on DevAC v2.0 spec Section 10.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CoverageValidator,
  createCoverageValidator,
} from "../../../src/validation/validators/coverage-validator.js";

describe("CoverageValidator", () => {
  let tempDir: string;
  let validator: CoverageValidator;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = path.join(
      "/tmp",
      `devac-coverage-validator-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(tempDir, { recursive: true });

    // Create a basic package.json with vitest
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            "test:coverage": "vitest run --coverage",
          },
          devDependencies: {
            vitest: "^1.0.0",
          },
        },
        null,
        2
      )
    );

    // Create validator
    validator = createCoverageValidator();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validate", () => {
    it("returns proper result structure", async () => {
      // Test basic result structure even if coverage can't run
      const result = await validator.validate(tempDir);

      expect(typeof result.success).toBe("boolean");
      expect(Array.isArray(result.issues)).toBe(true);
      expect(typeof result.timeMs).toBe("number");
      expect(result.summary).toBeDefined();
      expect(typeof result.summary.lines).toBe("number");
      expect(typeof result.summary.branches).toBe("number");
      expect(typeof result.summary.functions).toBe("number");
      expect(typeof result.summary.statements).toBe("number");
      expect(Array.isArray(result.files)).toBe(true);
      expect(typeof result.tool).toBe("string");
    });

    it("respects threshold options", async () => {
      const result = await validator.validate(tempDir, {
        thresholdLines: 50,
        thresholdBranches: 50,
        thresholdFunctions: 50,
      });

      // Should complete even if coverage data not available
      expect(typeof result.success).toBe("boolean");
    });

    it("returns timing metrics", async () => {
      const result = await validator.validate(tempDir);

      expect(typeof result.timeMs).toBe("number");
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("parseCoverageJson", () => {
    it("parses Istanbul coverage JSON correctly", async () => {
      // Create coverage directory and file
      const coverageDir = path.join(tempDir, "coverage");
      await fs.mkdir(coverageDir, { recursive: true });

      const coverageData = {
        [path.join(tempDir, "src", "utils.ts")]: {
          path: path.join(tempDir, "src", "utils.ts"),
          statementMap: { "0": {}, "1": {}, "2": {}, "3": {} },
          fnMap: { "0": {}, "1": {} },
          branchMap: { "0": {} },
          s: { "0": 1, "1": 1, "2": 0, "3": 1 },
          f: { "0": 1, "1": 0 },
          b: { "0": [1, 0] },
        },
      };

      await fs.writeFile(
        path.join(coverageDir, "coverage-final.json"),
        JSON.stringify(coverageData)
      );

      const files = await validator.parseCoverageJson(
        path.join(coverageDir, "coverage-final.json"),
        tempDir
      );

      expect(files.length).toBe(1);
      const file = files[0] as (typeof files)[0];
      expect(file.file).toBe(path.join("src", "utils.ts"));
      expect(file.statements).toBe(75); // 3 out of 4 statements covered
      expect(file.functions).toBe(50); // 1 out of 2 functions covered
      expect(file.branches).toBe(50); // 1 out of 2 branches covered
    });

    it("handles empty coverage file", async () => {
      const coverageDir = path.join(tempDir, "coverage");
      await fs.mkdir(coverageDir, { recursive: true });

      await fs.writeFile(path.join(coverageDir, "coverage-final.json"), "{}");

      const files = await validator.parseCoverageJson(
        path.join(coverageDir, "coverage-final.json"),
        tempDir
      );

      expect(files).toEqual([]);
    });

    it("handles multiple files in coverage", async () => {
      const coverageDir = path.join(tempDir, "coverage");
      await fs.mkdir(coverageDir, { recursive: true });

      const coverageData = {
        [path.join(tempDir, "src", "a.ts")]: {
          path: path.join(tempDir, "src", "a.ts"),
          statementMap: { "0": {} },
          fnMap: {},
          branchMap: {},
          s: { "0": 1 },
          f: {},
          b: {},
        },
        [path.join(tempDir, "src", "b.ts")]: {
          path: path.join(tempDir, "src", "b.ts"),
          statementMap: { "0": {} },
          fnMap: {},
          branchMap: {},
          s: { "0": 0 },
          f: {},
          b: {},
        },
      };

      await fs.writeFile(
        path.join(coverageDir, "coverage-final.json"),
        JSON.stringify(coverageData)
      );

      const files = await validator.parseCoverageJson(
        path.join(coverageDir, "coverage-final.json"),
        tempDir
      );

      expect(files.length).toBe(2);
    });
  });

  describe("detectCoverageTool", () => {
    it("detects vitest from package.json", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { "test:coverage": "vitest run --coverage" },
          devDependencies: { vitest: "^1.0.0" },
        })
      );

      const tool = await validator.detectCoverageTool(tempDir);

      expect(tool).toBe("vitest");
    });

    it("detects jest from package.json", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { "test:coverage": "jest --coverage" },
          devDependencies: { jest: "^29.0.0" },
        })
      );

      const tool = await validator.detectCoverageTool(tempDir);

      expect(tool).toBe("jest");
    });

    it("detects nyc from package.json", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { "test:coverage": "nyc npm test" },
          devDependencies: { nyc: "^15.0.0" },
        })
      );

      const tool = await validator.detectCoverageTool(tempDir);

      expect(tool).toBe("nyc");
    });

    it("returns null when no package.json", async () => {
      await fs.rm(path.join(tempDir, "package.json"));

      const tool = await validator.detectCoverageTool(tempDir);

      expect(tool).toBeNull();
    });
  });

  describe("issue generation", () => {
    it("creates issues for files below threshold", async () => {
      const coverageDir = path.join(tempDir, "coverage");
      await fs.mkdir(coverageDir, { recursive: true });

      // File with 25% coverage (below 50% threshold)
      const coverageData = {
        [path.join(tempDir, "src", "low-coverage.ts")]: {
          path: path.join(tempDir, "src", "low-coverage.ts"),
          statementMap: { "0": {}, "1": {}, "2": {}, "3": {} },
          fnMap: { "0": {}, "1": {}, "2": {}, "3": {} },
          branchMap: { "0": {}, "1": {} },
          s: { "0": 1, "1": 0, "2": 0, "3": 0 },
          f: { "0": 1, "1": 0, "2": 0, "3": 0 },
          b: { "0": [1, 0], "1": [0, 0] },
        },
      };

      await fs.writeFile(
        path.join(coverageDir, "coverage-final.json"),
        JSON.stringify(coverageData)
      );

      // Mock the coverage command to just use existing coverage file
      const files = await validator.parseCoverageJson(
        path.join(coverageDir, "coverage-final.json"),
        tempDir
      );

      // Manually verify threshold logic
      const threshold = 50;
      const belowThreshold = files.filter(
        (f) => f.lines < threshold || f.branches < threshold || f.functions < threshold
      );

      expect(belowThreshold.length).toBe(1);
      expect(belowThreshold[0]?.statements).toBe(25); // 1/4 = 25%
    });

    it("does not create issues when above threshold", async () => {
      const coverageDir = path.join(tempDir, "coverage");
      await fs.mkdir(coverageDir, { recursive: true });

      // File with 100% coverage
      const coverageData = {
        [path.join(tempDir, "src", "full-coverage.ts")]: {
          path: path.join(tempDir, "src", "full-coverage.ts"),
          statementMap: { "0": {}, "1": {} },
          fnMap: { "0": {} },
          branchMap: {},
          s: { "0": 1, "1": 1 },
          f: { "0": 1 },
          b: {},
        },
      };

      await fs.writeFile(
        path.join(coverageDir, "coverage-final.json"),
        JSON.stringify(coverageData)
      );

      const files = await validator.parseCoverageJson(
        path.join(coverageDir, "coverage-final.json"),
        tempDir
      );

      const threshold = 50;
      const belowThreshold = files.filter(
        (f) => f.lines < threshold || f.branches < threshold || f.functions < threshold
      );

      expect(belowThreshold.length).toBe(0);
    });
  });

  describe("coverage calculation edge cases", () => {
    it("handles files with no statements (100% coverage)", async () => {
      const coverageDir = path.join(tempDir, "coverage");
      await fs.mkdir(coverageDir, { recursive: true });

      // File with no statements (empty file)
      const coverageData = {
        [path.join(tempDir, "src", "empty.ts")]: {
          path: path.join(tempDir, "src", "empty.ts"),
          statementMap: {},
          fnMap: {},
          branchMap: {},
          s: {},
          f: {},
          b: {},
        },
      };

      await fs.writeFile(
        path.join(coverageDir, "coverage-final.json"),
        JSON.stringify(coverageData)
      );

      const files = await validator.parseCoverageJson(
        path.join(coverageDir, "coverage-final.json"),
        tempDir
      );

      expect(files.length).toBe(1);
      // Empty files should report 100% coverage (nothing to cover)
      expect(files[0]?.statements).toBe(100);
      expect(files[0]?.functions).toBe(100);
      expect(files[0]?.branches).toBe(100);
    });

    it("calculates correct percentages for partial coverage", async () => {
      const coverageDir = path.join(tempDir, "coverage");
      await fs.mkdir(coverageDir, { recursive: true });

      // File with exactly 50% statement coverage
      const coverageData = {
        [path.join(tempDir, "src", "partial.ts")]: {
          path: path.join(tempDir, "src", "partial.ts"),
          statementMap: { "0": {}, "1": {} },
          fnMap: { "0": {}, "1": {}, "2": {} },
          branchMap: { "0": {} },
          s: { "0": 1, "1": 0 },
          f: { "0": 1, "1": 1, "2": 0 },
          b: { "0": [1, 1] },
        },
      };

      await fs.writeFile(
        path.join(coverageDir, "coverage-final.json"),
        JSON.stringify(coverageData)
      );

      const files = await validator.parseCoverageJson(
        path.join(coverageDir, "coverage-final.json"),
        tempDir
      );

      expect(files.length).toBe(1);
      expect(files[0]?.statements).toBe(50); // 1/2 = 50%
      expect(files[0]?.functions).toBeCloseTo(66.7, 0); // 2/3 ≈ 66.7%
      expect(files[0]?.branches).toBe(100); // 2/2 = 100%
    });

    it("handles branch coverage with mixed hit counts", async () => {
      const coverageDir = path.join(tempDir, "coverage");
      await fs.mkdir(coverageDir, { recursive: true });

      // File with mixed branch hits
      const coverageData = {
        [path.join(tempDir, "src", "branches.ts")]: {
          path: path.join(tempDir, "src", "branches.ts"),
          statementMap: { "0": {} },
          fnMap: {},
          branchMap: { "0": {}, "1": {} },
          s: { "0": 1 },
          f: {},
          b: { "0": [1, 0], "1": [1, 1] }, // 3 out of 4 branches covered
        },
      };

      await fs.writeFile(
        path.join(coverageDir, "coverage-final.json"),
        JSON.stringify(coverageData)
      );

      const files = await validator.parseCoverageJson(
        path.join(coverageDir, "coverage-final.json"),
        tempDir
      );

      expect(files.length).toBe(1);
      expect(files[0]?.branches).toBe(75); // 3/4 = 75%
    });
  });

  describe("detectCoverageTool edge cases", () => {
    it("detects vitest from dependencies (not devDependencies)", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          dependencies: { vitest: "^1.0.0" },
        })
      );

      const tool = await validator.detectCoverageTool(tempDir);
      expect(tool).toBe("vitest");
    });

    it("detects tool from script when not in dependencies", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { "test:coverage": "vitest run --coverage" },
        })
      );

      const tool = await validator.detectCoverageTool(tempDir);
      expect(tool).toBe("vitest");
    });

    it("returns null for malformed package.json", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), "not valid json");

      const tool = await validator.detectCoverageTool(tempDir);
      expect(tool).toBeNull();
    });

    it("returns null when no coverage tool found", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "no-test-tools",
          dependencies: { lodash: "^4.0.0" },
        })
      );

      const tool = await validator.detectCoverageTool(tempDir);
      expect(tool).toBeNull();
    });
  });
});
