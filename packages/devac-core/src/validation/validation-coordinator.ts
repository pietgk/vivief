/**
 * Validation Coordinator Implementation
 *
 * Orchestrates validation flow with quick/full modes.
 * Based on DevAC v2.0 spec Section 10.2.
 */

import type { DuckDBPool } from "../storage/duckdb-pool.js";
import type { SeedReader } from "../storage/seed-reader.js";
import { type EnrichedIssue, type IssueEnricher, createIssueEnricher } from "./issue-enricher.js";
import {
  type SymbolAffectedAnalyzer,
  type SymbolAffectedResult,
  createSymbolAffectedAnalyzer,
} from "./symbol-affected-analyzer.js";
import {
  type LintValidator,
  type TestValidator,
  type TypecheckValidator,
  createLintValidator,
  createTestValidator,
  createTypecheckValidator,
} from "./validators/index.js";

/**
 * Validation mode
 */
export type ValidationMode = "quick" | "full";

/**
 * Configuration for validation
 */
export interface ValidationConfig {
  /** Maximum depth for affected analysis */
  maxDepth: number;
  /** Whether to run TypeScript typecheck */
  runTypecheck: boolean;
  /** Whether to run ESLint */
  runLint: boolean;
  /** Whether to run tests */
  runTests: boolean;
  /** Timeout for each validator in milliseconds */
  timeout: number;
  /** Whether to enrich issues with CodeGraph context */
  enrichIssues: boolean;
}

/**
 * Result from validation coordination
 */
export interface ValidationCoordinatorResult {
  /** Validation mode used */
  mode: ValidationMode;
  /** Overall success (no errors from any validator) */
  success: boolean;
  /** Affected files analysis */
  affected: SymbolAffectedResult;
  /** Typecheck results (if run) */
  typecheck?: {
    success: boolean;
    issues: EnrichedIssue[];
    timeMs: number;
  };
  /** Lint results (if run) */
  lint?: {
    success: boolean;
    issues: EnrichedIssue[];
    timeMs: number;
  };
  /** Test results (if run) */
  tests?: {
    success: boolean;
    passed: number;
    failed: number;
    timeMs: number;
  };
  /** Total number of issues across all validators */
  totalIssues: number;
  /** Total time taken in milliseconds */
  totalTimeMs: number;
}

/**
 * Default configuration for quick mode
 */
const QUICK_MODE_CONFIG: ValidationConfig = {
  maxDepth: 1,
  runTypecheck: true,
  runLint: true,
  runTests: false,
  timeout: 5000, // 5 seconds
  enrichIssues: true,
};

/**
 * Default configuration for full mode
 */
const FULL_MODE_CONFIG: ValidationConfig = {
  maxDepth: 10,
  runTypecheck: true,
  runLint: true,
  runTests: true,
  timeout: 300000, // 5 minutes
  enrichIssues: true,
};

/**
 * Validation Coordinator
 *
 * Orchestrates validation flow including affected analysis,
 * typecheck, lint, and tests.
 */
export class ValidationCoordinator {
  private affectedAnalyzer: SymbolAffectedAnalyzer;
  private issueEnricher: IssueEnricher;
  private typecheckValidator: TypecheckValidator;
  private lintValidator: LintValidator;
  private testValidator: TestValidator;

  constructor(
    private pool: DuckDBPool,
    private packagePath: string,
    private seedReader: SeedReader
  ) {
    this.affectedAnalyzer = createSymbolAffectedAnalyzer(pool, packagePath, seedReader);
    this.issueEnricher = createIssueEnricher(seedReader);
    this.typecheckValidator = createTypecheckValidator();
    this.lintValidator = createLintValidator();
    this.testValidator = createTestValidator();
  }

  /**
   * Run validation with specified configuration
   */
  async validate(
    changedFiles: string[],
    packagePath: string,
    config: Partial<ValidationConfig> = {}
  ): Promise<ValidationCoordinatorResult> {
    const startTime = Date.now();
    const fullConfig = { ...QUICK_MODE_CONFIG, ...config };
    const mode: ValidationMode = fullConfig.runTests ? "full" : "quick";

    // Run affected analysis
    const affected = await this.affectedAnalyzer.analyzeFileChanges(
      changedFiles,
      {},
      { maxDepth: fullConfig.maxDepth }
    );

    let typecheckResult: ValidationCoordinatorResult["typecheck"];
    let lintResult: ValidationCoordinatorResult["lint"];
    let testsResult: ValidationCoordinatorResult["tests"];
    let totalIssues = 0;

    // Run typecheck if enabled
    if (fullConfig.runTypecheck) {
      const result = await this.runTypecheck(packagePath, fullConfig);
      typecheckResult = result;
      totalIssues += result.issues.length;
    }

    // Run lint if enabled
    if (fullConfig.runLint) {
      const result = await this.runLint(packagePath, changedFiles, fullConfig);
      lintResult = result;
      totalIssues += result.issues.length;
    }

    // Run tests if enabled
    if (fullConfig.runTests) {
      const result = await this.runTests(packagePath, fullConfig);
      testsResult = result;
      if (!result.success) {
        totalIssues += result.failed;
      }
    }

    // Determine overall success
    const success =
      (typecheckResult?.success ?? true) &&
      (lintResult?.success ?? true) &&
      (testsResult?.success ?? true);

    return {
      mode,
      success,
      affected,
      typecheck: typecheckResult,
      lint: lintResult,
      tests: testsResult,
      totalIssues,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Run quick validation (1-hop, no tests)
   */
  async validateQuick(
    changedFiles: string[],
    packagePath: string
  ): Promise<ValidationCoordinatorResult> {
    return this.validate(changedFiles, packagePath, QUICK_MODE_CONFIG);
  }

  /**
   * Run full validation (N-hop, with tests)
   */
  async validateFull(
    changedFiles: string[],
    packagePath: string
  ): Promise<ValidationCoordinatorResult> {
    return this.validate(changedFiles, packagePath, FULL_MODE_CONFIG);
  }

  /**
   * Get quick mode default configuration
   */
  getQuickModeConfig(): ValidationConfig {
    return { ...QUICK_MODE_CONFIG };
  }

  /**
   * Get full mode default configuration
   */
  getFullModeConfig(): ValidationConfig {
    return { ...FULL_MODE_CONFIG };
  }

  /**
   * Run typecheck validation
   */
  private async runTypecheck(
    packagePath: string,
    config: ValidationConfig
  ): Promise<NonNullable<ValidationCoordinatorResult["typecheck"]>> {
    try {
      const result = await this.typecheckValidator.validate(packagePath, {
        timeout: config.timeout,
      });

      let issues: EnrichedIssue[] = result.issues.map((issue) => ({
        ...issue,
        promptMarkdown: this.issueEnricher.generatePrompt({
          ...issue,
          promptMarkdown: "",
        }),
      }));

      // Enrich issues if enabled
      if (config.enrichIssues && issues.length > 0) {
        issues = await this.issueEnricher.enrichIssues(result.issues, packagePath);
      }

      return {
        success: result.success,
        issues,
        timeMs: result.timeMs,
      };
    } catch (error) {
      return {
        success: false,
        issues: [
          {
            file: packagePath,
            line: 0,
            column: 0,
            message: error instanceof Error ? error.message : String(error),
            severity: "error",
            source: "tsc",
            promptMarkdown: "",
          },
        ],
        timeMs: 0,
      };
    }
  }

  /**
   * Run lint validation
   */
  private async runLint(
    packagePath: string,
    files: string[],
    config: ValidationConfig
  ): Promise<NonNullable<ValidationCoordinatorResult["lint"]>> {
    try {
      const result = await this.lintValidator.validate(packagePath, {
        files,
        timeout: config.timeout,
      });

      let issues: EnrichedIssue[] = result.issues.map((issue) => ({
        ...issue,
        promptMarkdown: this.issueEnricher.generatePrompt({
          ...issue,
          promptMarkdown: "",
        }),
      }));

      // Enrich issues if enabled
      if (config.enrichIssues && issues.length > 0) {
        issues = await this.issueEnricher.enrichIssues(result.issues, packagePath);
      }

      return {
        success: result.success,
        issues,
        timeMs: result.timeMs,
      };
    } catch (error) {
      return {
        success: false,
        issues: [
          {
            file: packagePath,
            line: 0,
            column: 0,
            message: error instanceof Error ? error.message : String(error),
            severity: "error",
            source: "eslint",
            promptMarkdown: "",
          },
        ],
        timeMs: 0,
      };
    }
  }

  /**
   * Run test validation
   */
  private async runTests(
    packagePath: string,
    config: ValidationConfig
  ): Promise<NonNullable<ValidationCoordinatorResult["tests"]>> {
    try {
      const result = await this.testValidator.validate(packagePath, {
        timeout: config.timeout,
      });

      return {
        success: result.success,
        passed: result.passed,
        failed: result.failed,
        timeMs: result.timeMs,
      };
    } catch (_error) {
      return {
        success: false,
        passed: 0,
        failed: 1,
        timeMs: 0,
      };
    }
  }
}

/**
 * Create a ValidationCoordinator instance
 */
export function createValidationCoordinator(
  pool: DuckDBPool,
  packagePath: string,
  seedReader: SeedReader
): ValidationCoordinator {
  return new ValidationCoordinator(pool, packagePath, seedReader);
}
