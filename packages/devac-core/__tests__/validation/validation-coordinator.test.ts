// @ts-nocheck - TODO: Fix type mismatches with updated interfaces
/**
 * Tests for validation-coordinator.ts
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock dependencies before imports
vi.mock("../../src/validation/issue-enricher.js");
vi.mock("../../src/validation/symbol-affected-analyzer.js");
vi.mock("../../src/validation/validators/index.js");

import type { DuckDBPool } from "../../src/storage/duckdb-pool.js";
import type { SeedReader } from "../../src/storage/seed-reader.js";
import { createIssueEnricher } from "../../src/validation/issue-enricher.js";
import { createSymbolAffectedAnalyzer } from "../../src/validation/symbol-affected-analyzer.js";
import {
  ValidationCoordinator,
  createValidationCoordinator,
} from "../../src/validation/validation-coordinator.js";
import {
  createCoverageValidator,
  createLintValidator,
  createTestValidator,
  createTypecheckValidator,
} from "../../src/validation/validators/index.js";

describe("ValidationCoordinator", () => {
  const mockPool = {} as DuckDBPool;
  const mockPackagePath = "/test/package";
  const mockSeedReader = {} as SeedReader;

  // Mock validator instances
  const mockAffectedAnalyzer = {
    analyzeFileChanges: vi.fn(),
  };

  const mockIssueEnricher = {
    enrichIssues: vi.fn(),
    generatePrompt: vi.fn(),
  };

  const mockTypecheckValidator = {
    validate: vi.fn(),
  };

  const mockLintValidator = {
    validate: vi.fn(),
  };

  const mockTestValidator = {
    validate: vi.fn(),
  };

  const mockCoverageValidator = {
    validate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup factory mocks
    vi.mocked(createSymbolAffectedAnalyzer).mockReturnValue(mockAffectedAnalyzer as never);
    vi.mocked(createIssueEnricher).mockReturnValue(mockIssueEnricher as never);
    vi.mocked(createTypecheckValidator).mockReturnValue(mockTypecheckValidator as never);
    vi.mocked(createLintValidator).mockReturnValue(mockLintValidator as never);
    vi.mocked(createTestValidator).mockReturnValue(mockTestValidator as never);
    vi.mocked(createCoverageValidator).mockReturnValue(mockCoverageValidator as never);

    // Setup default mock implementations
    mockAffectedAnalyzer.analyzeFileChanges.mockResolvedValue({
      changedFiles: ["/test/file.ts"],
      affectedFiles: [],
      affectedSymbols: [],
      impactSummary: { total: 0, byType: {} },
    });

    mockIssueEnricher.enrichIssues.mockImplementation(async (issues) =>
      issues.map((i: { promptMarkdown?: string }) => ({ ...i, promptMarkdown: "enriched" }))
    );
    mockIssueEnricher.generatePrompt.mockReturnValue("prompt");

    mockTypecheckValidator.validate.mockResolvedValue({
      success: true,
      issues: [],
      timeMs: 100,
    });

    mockLintValidator.validate.mockResolvedValue({
      success: true,
      issues: [],
      timeMs: 50,
    });

    mockTestValidator.validate.mockResolvedValue({
      success: true,
      passed: 10,
      failed: 0,
      timeMs: 500,
    });

    mockCoverageValidator.validate.mockResolvedValue({
      success: true,
      issues: [],
      timeMs: 200,
      summary: { lines: 80, branches: 75, functions: 85, statements: 80 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    test("creates validators on initialization", () => {
      new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      expect(createSymbolAffectedAnalyzer).toHaveBeenCalledWith(
        mockPool,
        mockPackagePath,
        mockSeedReader
      );
      expect(createIssueEnricher).toHaveBeenCalledWith(mockSeedReader);
      expect(createTypecheckValidator).toHaveBeenCalled();
      expect(createLintValidator).toHaveBeenCalled();
      expect(createTestValidator).toHaveBeenCalled();
      expect(createCoverageValidator).toHaveBeenCalled();
    });
  });

  describe("validate", () => {
    test("runs affected analysis", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      await coordinator.validate(["/test/file.ts"], mockPackagePath);

      expect(mockAffectedAnalyzer.analyzeFileChanges).toHaveBeenCalledWith(
        ["/test/file.ts"],
        {},
        expect.objectContaining({ maxDepth: expect.any(Number) })
      );
    });

    test("returns quick mode when tests disabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTests: false,
      });

      expect(result.mode).toBe("quick");
    });

    test("returns full mode when tests enabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTests: true,
      });

      expect(result.mode).toBe("full");
    });

    test("runs typecheck when enabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTypecheck: true,
      });

      expect(mockTypecheckValidator.validate).toHaveBeenCalled();
      expect(result.typecheck).toBeDefined();
      expect(result.typecheck?.success).toBe(true);
    });

    test("skips typecheck when disabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTypecheck: false,
      });

      expect(mockTypecheckValidator.validate).not.toHaveBeenCalled();
      expect(result.typecheck).toBeUndefined();
    });

    test("runs lint when enabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runLint: true,
      });

      expect(mockLintValidator.validate).toHaveBeenCalled();
      expect(result.lint).toBeDefined();
      expect(result.lint?.success).toBe(true);
    });

    test("skips lint when disabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runLint: false,
      });

      expect(mockLintValidator.validate).not.toHaveBeenCalled();
      expect(result.lint).toBeUndefined();
    });

    test("runs tests when enabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTests: true,
      });

      expect(mockTestValidator.validate).toHaveBeenCalled();
      expect(result.tests).toBeDefined();
      expect(result.tests?.passed).toBe(10);
    });

    test("skips tests when disabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTests: false,
      });

      expect(mockTestValidator.validate).not.toHaveBeenCalled();
      expect(result.tests).toBeUndefined();
    });

    test("runs coverage when enabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runCoverage: true,
      });

      expect(mockCoverageValidator.validate).toHaveBeenCalled();
      expect(result.coverage).toBeDefined();
      expect(result.coverage?.summary.lines).toBe(80);
    });

    test("skips coverage when disabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runCoverage: false,
      });

      expect(mockCoverageValidator.validate).not.toHaveBeenCalled();
      expect(result.coverage).toBeUndefined();
    });

    test("returns success true when all validators pass", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTypecheck: true,
        runLint: true,
        runTests: true,
      });

      expect(result.success).toBe(true);
    });

    test("returns success false when typecheck fails", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      mockTypecheckValidator.validate.mockResolvedValue({
        success: false,
        issues: [
          {
            file: "/test.ts",
            line: 1,
            column: 0,
            message: "error",
            severity: "error",
            source: "tsc",
          },
        ],
        timeMs: 100,
      });

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTypecheck: true,
      });

      expect(result.success).toBe(false);
    });

    test("returns success false when lint fails", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      mockLintValidator.validate.mockResolvedValue({
        success: false,
        issues: [
          {
            file: "/test.ts",
            line: 1,
            column: 0,
            message: "error",
            severity: "error",
            source: "eslint",
          },
        ],
        timeMs: 50,
      });

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runLint: true,
      });

      expect(result.success).toBe(false);
    });

    test("returns success false when tests fail", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      mockTestValidator.validate.mockResolvedValue({
        success: false,
        passed: 8,
        failed: 2,
        timeMs: 500,
      });

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTests: true,
      });

      expect(result.success).toBe(false);
    });

    test("coverage issues do not fail overall validation", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      mockCoverageValidator.validate.mockResolvedValue({
        success: false,
        issues: [
          { file: "/test.ts", line: 0, column: 0, message: "low coverage", severity: "warning" },
        ],
        timeMs: 200,
        summary: { lines: 50, branches: 40, functions: 60, statements: 50 },
      });

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTypecheck: true,
        runLint: true,
        runCoverage: true,
      });

      expect(result.success).toBe(true);
    });

    test("counts total issues across all validators", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      mockTypecheckValidator.validate.mockResolvedValue({
        success: false,
        issues: [
          {
            file: "/test.ts",
            line: 1,
            column: 0,
            message: "error1",
            severity: "error",
            source: "tsc",
          },
          {
            file: "/test.ts",
            line: 2,
            column: 0,
            message: "error2",
            severity: "error",
            source: "tsc",
          },
        ],
        timeMs: 100,
      });

      mockLintValidator.validate.mockResolvedValue({
        success: false,
        issues: [
          {
            file: "/test.ts",
            line: 5,
            column: 0,
            message: "lint error",
            severity: "error",
            source: "eslint",
          },
        ],
        timeMs: 50,
      });

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTypecheck: true,
        runLint: true,
      });

      expect(result.totalIssues).toBe(3);
    });

    test("enriches issues when enabled", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      mockTypecheckValidator.validate.mockResolvedValue({
        success: false,
        issues: [
          {
            file: "/test.ts",
            line: 1,
            column: 0,
            message: "error",
            severity: "error",
            source: "tsc",
          },
        ],
        timeMs: 100,
      });

      await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTypecheck: true,
        enrichIssues: true,
      });

      expect(mockIssueEnricher.enrichIssues).toHaveBeenCalled();
    });

    test("handles typecheck error gracefully", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      mockTypecheckValidator.validate.mockRejectedValue(new Error("Typecheck crashed"));

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTypecheck: true,
      });

      expect(result.typecheck?.success).toBe(false);
      expect(result.typecheck?.issues[0].message).toBe("Typecheck crashed");
    });

    test("handles lint error gracefully", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      mockLintValidator.validate.mockRejectedValue(new Error("Lint crashed"));

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runLint: true,
      });

      expect(result.lint?.success).toBe(false);
      expect(result.lint?.issues[0].message).toBe("Lint crashed");
    });

    test("handles test error gracefully", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      mockTestValidator.validate.mockRejectedValue(new Error("Tests crashed"));

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runTests: true,
      });

      expect(result.tests?.success).toBe(false);
      expect(result.tests?.failed).toBe(1);
    });

    test("handles coverage error gracefully", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      mockCoverageValidator.validate.mockRejectedValue(new Error("Coverage crashed"));

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath, {
        runCoverage: true,
      });

      expect(result.coverage?.success).toBe(false);
      expect(result.coverage?.issues[0].message).toBe("Coverage crashed");
    });

    test("calculates total time", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validate(["/test/file.ts"], mockPackagePath);

      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("validateQuick", () => {
    test("uses quick mode configuration", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validateQuick(["/test/file.ts"], mockPackagePath);

      expect(result.mode).toBe("quick");
      expect(mockTestValidator.validate).not.toHaveBeenCalled();
      expect(mockCoverageValidator.validate).not.toHaveBeenCalled();
    });

    test("runs typecheck and lint by default", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      await coordinator.validateQuick(["/test/file.ts"], mockPackagePath);

      expect(mockTypecheckValidator.validate).toHaveBeenCalled();
      expect(mockLintValidator.validate).toHaveBeenCalled();
    });
  });

  describe("validateFull", () => {
    test("uses full mode configuration", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const result = await coordinator.validateFull(["/test/file.ts"], mockPackagePath);

      expect(result.mode).toBe("full");
    });

    test("runs all validators including tests and coverage", async () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      await coordinator.validateFull(["/test/file.ts"], mockPackagePath);

      expect(mockTypecheckValidator.validate).toHaveBeenCalled();
      expect(mockLintValidator.validate).toHaveBeenCalled();
      expect(mockTestValidator.validate).toHaveBeenCalled();
      expect(mockCoverageValidator.validate).toHaveBeenCalled();
    });
  });

  describe("getQuickModeConfig", () => {
    test("returns quick mode configuration", () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const config = coordinator.getQuickModeConfig();

      expect(config.maxDepth).toBe(1);
      expect(config.runTests).toBe(false);
      expect(config.runCoverage).toBe(false);
      expect(config.timeout).toBe(5000);
    });
  });

  describe("getFullModeConfig", () => {
    test("returns full mode configuration", () => {
      const coordinator = new ValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      const config = coordinator.getFullModeConfig();

      expect(config.maxDepth).toBe(10);
      expect(config.runTests).toBe(true);
      expect(config.runCoverage).toBe(true);
      expect(config.timeout).toBe(300000);
    });
  });

  describe("createValidationCoordinator", () => {
    test("creates a ValidationCoordinator instance", () => {
      const coordinator = createValidationCoordinator(mockPool, mockPackagePath, mockSeedReader);

      expect(coordinator).toBeInstanceOf(ValidationCoordinator);
    });
  });
});
