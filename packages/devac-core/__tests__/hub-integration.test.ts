/**
 * Hub Integration Tests
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CentralHub, createCentralHub } from "../src/hub/central-hub.js";
import {
  clearValidationErrorsFromHub,
  pushValidationResultsToHub,
} from "../src/validation/hub-integration.js";
import type { ValidationCoordinatorResult } from "../src/validation/validation-coordinator.js";

describe("Hub Integration", () => {
  let tempDir: string;
  let hubDir: string;
  let hub: CentralHub;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-integration-test-"));
    hubDir = path.join(tempDir, ".devac");
    hub = createCentralHub({ hubDir });
    await hub.init({ skipValidation: true }); // Skip validation for tests
  });

  afterEach(async () => {
    await hub.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("pushValidationResultsToHub", () => {
    it("pushes typecheck issues to hub", async () => {
      const result: ValidationCoordinatorResult = {
        mode: "quick",
        success: false,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          analysisTimeMs: 0,
          totalAffected: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        typecheck: {
          success: false,
          issues: [
            {
              file: "src/auth.ts",
              line: 42,
              column: 5,
              message: "Type error",
              severity: "error",
              source: "tsc",
              code: "TS2322",
              promptMarkdown: "",
            },
          ],
          timeMs: 100,
        },
        totalIssues: 1,
        totalTimeMs: 100,
      };

      const pushResult = await pushValidationResultsToHub(
        hub,
        "github.com/org/repo",
        "pkg",
        result
      );

      expect(pushResult.pushed).toBe(1);

      const errors = await hub.getValidationErrors({});
      expect(errors.length).toBe(1);
      expect(errors[0]?.file).toBe("src/auth.ts");
      expect(errors[0]?.source).toBe("tsc");
      expect(errors[0]?.code).toBe("TS2322");
    });

    it("pushes lint issues to hub", async () => {
      const result: ValidationCoordinatorResult = {
        mode: "quick",
        success: false,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          analysisTimeMs: 0,
          totalAffected: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        lint: {
          success: false,
          issues: [
            {
              file: "src/utils.ts",
              line: 10,
              column: 1,
              message: "Unused variable",
              severity: "warning",
              source: "eslint",
              code: "no-unused-vars",
              promptMarkdown: "",
            },
          ],
          timeMs: 50,
        },
        totalIssues: 1,
        totalTimeMs: 50,
      };

      const pushResult = await pushValidationResultsToHub(
        hub,
        "github.com/org/repo",
        "pkg",
        result
      );

      expect(pushResult.pushed).toBe(1);

      const errors = await hub.getValidationErrors({});
      expect(errors.length).toBe(1);
      expect(errors[0]?.source).toBe("eslint");
      expect(errors[0]?.severity).toBe("warning");
    });

    it("pushes both typecheck and lint issues", async () => {
      const result: ValidationCoordinatorResult = {
        mode: "quick",
        success: false,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          analysisTimeMs: 0,
          totalAffected: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        typecheck: {
          success: false,
          issues: [
            {
              file: "src/a.ts",
              line: 1,
              column: 1,
              message: "Type error",
              severity: "error",
              source: "tsc",
              promptMarkdown: "",
            },
          ],
          timeMs: 100,
        },
        lint: {
          success: false,
          issues: [
            {
              file: "src/b.ts",
              line: 2,
              column: 2,
              message: "Lint error",
              severity: "warning",
              source: "eslint",
              promptMarkdown: "",
            },
          ],
          timeMs: 50,
        },
        totalIssues: 2,
        totalTimeMs: 150,
      };

      const pushResult = await pushValidationResultsToHub(
        hub,
        "github.com/org/repo",
        "pkg",
        result
      );

      expect(pushResult.pushed).toBe(2);

      const errors = await hub.getValidationErrors({});
      expect(errors.length).toBe(2);
    });

    it("clears previous errors on push", async () => {
      // First push
      const result1: ValidationCoordinatorResult = {
        mode: "quick",
        success: false,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          analysisTimeMs: 0,
          totalAffected: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        typecheck: {
          success: false,
          issues: [
            {
              file: "old.ts",
              line: 1,
              column: 1,
              message: "Old error",
              severity: "error",
              source: "tsc",
              promptMarkdown: "",
            },
          ],
          timeMs: 100,
        },
        totalIssues: 1,
        totalTimeMs: 100,
      };

      await pushValidationResultsToHub(hub, "github.com/org/repo", "pkg", result1);

      // Second push with different errors
      const result2: ValidationCoordinatorResult = {
        mode: "quick",
        success: false,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          analysisTimeMs: 0,
          totalAffected: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        typecheck: {
          success: false,
          issues: [
            {
              file: "new.ts",
              line: 2,
              column: 2,
              message: "New error",
              severity: "error",
              source: "tsc",
              promptMarkdown: "",
            },
          ],
          timeMs: 100,
        },
        totalIssues: 1,
        totalTimeMs: 100,
      };

      await pushValidationResultsToHub(hub, "github.com/org/repo", "pkg", result2);

      const errors = await hub.getValidationErrors({});
      expect(errors.length).toBe(1);
      expect(errors[0]?.file).toBe("new.ts");
    });

    it("handles successful validation with no issues", async () => {
      const result: ValidationCoordinatorResult = {
        mode: "quick",
        success: true,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          analysisTimeMs: 0,
          totalAffected: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        typecheck: {
          success: true,
          issues: [],
          timeMs: 100,
        },
        lint: {
          success: true,
          issues: [],
          timeMs: 50,
        },
        totalIssues: 0,
        totalTimeMs: 150,
      };

      const pushResult = await pushValidationResultsToHub(
        hub,
        "github.com/org/repo",
        "pkg",
        result
      );

      expect(pushResult.pushed).toBe(0);

      const errors = await hub.getValidationErrors({});
      expect(errors.length).toBe(0);
    });

    it("handles issues without code", async () => {
      const result: ValidationCoordinatorResult = {
        mode: "quick",
        success: false,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          analysisTimeMs: 0,
          totalAffected: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        typecheck: {
          success: false,
          issues: [
            {
              file: "src/test.ts",
              line: 1,
              column: 1,
              message: "Some error without code",
              severity: "error",
              source: "tsc",
              // No code property
              promptMarkdown: "",
            },
          ],
          timeMs: 100,
        },
        totalIssues: 1,
        totalTimeMs: 100,
      };

      const pushResult = await pushValidationResultsToHub(
        hub,
        "github.com/org/repo",
        "pkg",
        result
      );

      expect(pushResult.pushed).toBe(1);

      const errors = await hub.getValidationErrors({});
      expect(errors[0]?.code).toBeNull();
    });
  });

  describe("clearValidationErrorsFromHub", () => {
    it("clears all errors for a repo", async () => {
      const result: ValidationCoordinatorResult = {
        mode: "quick",
        success: false,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          analysisTimeMs: 0,
          totalAffected: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        typecheck: {
          success: false,
          issues: [
            {
              file: "a.ts",
              line: 1,
              column: 1,
              message: "Error",
              severity: "error",
              source: "tsc",
              promptMarkdown: "",
            },
          ],
          timeMs: 100,
        },
        totalIssues: 1,
        totalTimeMs: 100,
      };

      await pushValidationResultsToHub(hub, "github.com/org/repo", "pkg", result);

      let errors = await hub.getValidationErrors({});
      expect(errors.length).toBe(1);

      await clearValidationErrorsFromHub(hub, "github.com/org/repo");

      errors = await hub.getValidationErrors({});
      expect(errors.length).toBe(0);
    });

    it("only clears errors for specified repo", async () => {
      const result: ValidationCoordinatorResult = {
        mode: "quick",
        success: false,
        affected: {
          changedSymbols: [],
          affectedFiles: [],
          analysisTimeMs: 0,
          totalAffected: 0,
          truncated: false,
          maxDepthReached: 0,
        },
        typecheck: {
          success: false,
          issues: [
            {
              file: "a.ts",
              line: 1,
              column: 1,
              message: "Error",
              severity: "error",
              source: "tsc",
              promptMarkdown: "",
            },
          ],
          timeMs: 100,
        },
        totalIssues: 1,
        totalTimeMs: 100,
      };

      await pushValidationResultsToHub(hub, "github.com/org/repo-a", "pkg", result);
      await pushValidationResultsToHub(hub, "github.com/org/repo-b", "pkg", result);

      let errors = await hub.getValidationErrors({});
      expect(errors.length).toBe(2);

      await clearValidationErrorsFromHub(hub, "github.com/org/repo-a");

      errors = await hub.getValidationErrors({});
      expect(errors.length).toBe(1);
      expect(errors[0]?.repo_id).toBe("github.com/org/repo-b");
    });
  });
});
