/**
 * Validation Module
 *
 * Phase 5: Validation Integration for DevAC v2.0.
 * Based on spec Section 10.
 */

export {
  SymbolAffectedAnalyzer,
  createSymbolAffectedAnalyzer,
  type ChangedSymbol,
  type AffectedFile,
  type SymbolAffectedResult,
  type SymbolAffectedOptions,
} from "./symbol-affected-analyzer.js";

export {
  IssueEnricher,
  createIssueEnricher,
  type ValidationIssue,
  type EnrichedIssue,
  type EnrichmentOptions,
  type SymbolInfo,
  type CallerInfo,
  type GetCallersOptions,
} from "./issue-enricher.js";

// Validators
export {
  TypecheckValidator,
  createTypecheckValidator,
  type TypecheckOptions,
  type TypecheckResult,
  LintValidator,
  createLintValidator,
  type LintOptions,
  type LintResult,
  TestValidator,
  createTestValidator,
  type TestOptions,
  type TestResult,
  CoverageValidator,
  createCoverageValidator,
  type CoverageOptions,
  type CoverageResult,
  type CoverageIssue,
  type FileCoverage,
  type CoverageSummary,
  WcagValidator,
  createWcagValidator,
  type WcagOptions,
  type WcagResult,
  type WcagValidationIssue,
  type A11yPlatform,
  type A11yDetectionSource,
} from "./validators/index.js";

// WCAG Analyzer
export {
  analyzeWcag,
  groupIssuesByFile,
  groupIssuesBySeverity,
  groupIssuesByCriterion,
  getIssueCounts,
  filterIssuesBySeverity,
  getAnalysisSummary,
  type WcagAnalyzerOptions,
  type WcagIssue,
  type WcagAnalysisResult,
} from "./wcag-analyzer.js";

// Validation Coordinator
export {
  ValidationCoordinator,
  createValidationCoordinator,
  type ValidationMode,
  type ValidationConfig,
  type ValidationCoordinatorResult,
} from "./validation-coordinator.js";

// Hub Integration
export {
  pushValidationResultsToHub,
  clearValidationErrorsFromHub,
} from "./hub-integration.js";
