/**
 * Validators Module
 *
 * Validation tools for typecheck, lint, and test.
 * Based on DevAC v2.0 spec Section 10.
 */

export {
  TypecheckValidator,
  createTypecheckValidator,
  type TypecheckOptions,
  type TypecheckResult,
} from "./typecheck-validator.js";

export {
  LintValidator,
  createLintValidator,
  type LintOptions,
  type LintResult,
} from "./lint-validator.js";

export {
  TestValidator,
  createTestValidator,
  type TestOptions,
  type TestResult,
} from "./test-validator.js";

export {
  CoverageValidator,
  createCoverageValidator,
  type CoverageOptions,
  type CoverageResult,
  type CoverageIssue,
  type FileCoverage,
  type CoverageSummary,
} from "./coverage-validator.js";

export {
  WcagValidator,
  createWcagValidator,
  type WcagOptions,
  type WcagResult,
  type WcagValidationIssue,
} from "./wcag-validator.js";
