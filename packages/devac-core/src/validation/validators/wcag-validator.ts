/**
 * WCAG Validator Implementation
 *
 * Wraps the WCAG Analyzer in the validator interface pattern.
 * Uses parsed seed data from SeedReader to detect accessibility violations.
 *
 * Part of DevAC Phase 2: WCAG Validation.
 * Extended with Accessibility Intelligence Layer (Issue #235).
 */

import type { WcagLevel } from "../../rules/wcag-rules.js";
import type { SeedReader } from "../../storage/seed-reader.js";
import type { ValidationIssue } from "../issue-enricher.js";
import {
  type WcagAnalysisResult,
  type WcagIssue,
  analyzeWcag,
  getAnalysisSummary,
} from "../wcag-analyzer.js";

// ============================================================================
// Accessibility Intelligence Layer Types
// ============================================================================

/**
 * Platform for accessibility validation
 */
export type A11yPlatform = "web" | "react-native";

/**
 * Detection source for accessibility issues
 */
export type A11yDetectionSource = "static" | "runtime" | "semantic";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for WCAG validation
 */
export interface WcagOptions {
  /** WCAG conformance level (default: AA) */
  level?: WcagLevel;
  /** Specific rule IDs to run (default: all enabled) */
  rules?: string[];
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Git branch for seed data (default: base) */
  branch?: string;
  /** Platform being validated (default: web) */
  platform?: A11yPlatform;
  /** Detection source for tracking (default: static) */
  detectionSource?: A11yDetectionSource;
}

/**
 * Result from WCAG validation
 */
export interface WcagResult {
  /** Whether validation passed (no errors) */
  success: boolean;
  /** List of validation issues */
  issues: ValidationIssue[];
  /** Time taken in milliseconds */
  timeMs: number;
  /** Number of elements checked */
  checkedCount: number;
  /** Number of elements that passed */
  passedCount: number;
  /** Pass rate as percentage */
  passRate: number;
  /** Count of errors (severity: error) */
  errorCount: number;
  /** Count of warnings (severity: warning) */
  warningCount: number;
  /** Platform that was validated */
  platform: A11yPlatform;
  /** Detection source used */
  detectionSource: A11yDetectionSource;
  /** Raw WCAG issues (for hub integration) */
  rawIssues: WcagIssue[];
}

// ============================================================================
// WCAG Validator Class
// ============================================================================

/**
 * WCAG Validator
 *
 * Validates accessibility compliance by analyzing parsed JSX nodes and edges
 * from seed data.
 */
export class WcagValidator {
  constructor(private seedReader: SeedReader) {}

  /**
   * Run WCAG validation on parsed seed data
   *
   * @param options - Validation options
   * @returns Validation result with issues and statistics
   *
   * @example
   * ```typescript
   * const validator = new WcagValidator(seedReader);
   * const result = await validator.validate({ level: "AA" });
   * if (!result.success) {
   *   console.log(`Found ${result.errorCount} errors`);
   * }
   * ```
   */
  async validate(options: WcagOptions = {}): Promise<WcagResult> {
    const startTime = Date.now();
    const branch = options.branch ?? "base";
    const platform = options.platform ?? "web";
    const detectionSource = options.detectionSource ?? "static";

    try {
      // Read nodes and edges from seed data
      const [nodesResult, edgesResult] = await Promise.all([
        this.seedReader.readNodes(branch),
        this.seedReader.readEdges(branch),
      ]);

      // Run WCAG analysis
      const analysisResult = analyzeWcag(nodesResult.rows, edgesResult.rows, {
        level: options.level,
        rules: options.rules,
      });

      // Convert to validator result format
      return this.toWcagResult(analysisResult, startTime, platform, detectionSource);
    } catch (error) {
      // Handle seed reading errors gracefully
      return {
        success: false,
        issues: [
          {
            file: "",
            line: 0,
            column: 0,
            message: error instanceof Error ? error.message : String(error),
            severity: "error",
            source: "wcag",
          },
        ],
        timeMs: Date.now() - startTime,
        checkedCount: 0,
        passedCount: 0,
        passRate: 0,
        errorCount: 1,
        warningCount: 0,
        platform,
        detectionSource,
        rawIssues: [],
      };
    }
  }

  /**
   * Convert WCAG analysis result to validator result format
   */
  private toWcagResult(
    analysisResult: WcagAnalysisResult,
    startTime: number,
    platform: A11yPlatform,
    detectionSource: A11yDetectionSource
  ): WcagResult {
    const summary = getAnalysisSummary(analysisResult);
    const issues = analysisResult.issues.map((issue) => this.toValidationIssue(issue));

    return {
      success: summary.errorCount === 0,
      issues,
      timeMs: Date.now() - startTime,
      checkedCount: analysisResult.checkedCount,
      passedCount: analysisResult.passedCount,
      passRate: summary.passRate,
      errorCount: summary.errorCount,
      warningCount: summary.warningCount,
      platform,
      detectionSource,
      rawIssues: analysisResult.issues,
    };
  }

  /**
   * Convert a WCAG issue to the standard ValidationIssue format
   */
  private toValidationIssue(issue: WcagIssue): ValidationIssue {
    // Return base ValidationIssue format
    // WCAG-specific fields can be accessed via WcagValidationIssue type
    return {
      file: issue.filePath,
      line: issue.line,
      column: issue.column,
      message: issue.message,
      severity: issue.severity,
      source: "wcag",
      code: issue.ruleId,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a WCAG validator instance
 *
 * @param seedReader - SeedReader for accessing parsed seed data
 * @returns WcagValidator instance
 */
export function createWcagValidator(seedReader: SeedReader): WcagValidator {
  return new WcagValidator(seedReader);
}

// ============================================================================
// Extended ValidationIssue Type
// ============================================================================

/**
 * WCAG-specific validation issue with additional fields
 */
export interface WcagValidationIssue extends ValidationIssue {
  /** WCAG success criterion (e.g., "2.1.1") */
  wcagCriterion?: string;
  /** WCAG conformance level */
  wcagLevel?: WcagLevel;
  /** Human-readable rule name */
  ruleName?: string;
  /** Suggested fix */
  suggestion?: string;
  /** Platform this issue applies to */
  platform?: A11yPlatform;
  /** How this issue was detected */
  detectionSource?: A11yDetectionSource;
}
