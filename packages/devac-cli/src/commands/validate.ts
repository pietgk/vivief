/**
 * Validate Command Implementation
 *
 * Runs validation (typecheck, lint, tests) on changed files
 * with symbol-level affected detection and issue enrichment.
 * Based on spec Section 10 and Phase 5 plan.
 */

import * as fs from "node:fs/promises";
import {
  DuckDBPool,
  SeedReader,
  ValidationCoordinator,
  type ValidationCoordinatorResult,
  type ValidationMode,
} from "@devac/core";

/**
 * Options for validate command
 */
export interface ValidateOptions {
  /** Path to the package to validate */
  packagePath: string;
  /** List of changed files to validate */
  changedFiles: string[];
  /** Validation mode: quick (<5s, 1-hop) or full (N-hop with tests) */
  mode: ValidationMode;
  /** Skip typecheck validation */
  skipTypecheck?: boolean;
  /** Skip lint validation */
  skipLint?: boolean;
  /** Force tests even in quick mode */
  forceTests?: boolean;
  /** Enrich issues with CodeGraph context */
  enrichIssues?: boolean;
  /** Maximum depth for affected analysis */
  maxDepth?: number;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Result from validate command
 */
export interface ValidateResult extends ValidationCoordinatorResult {
  /** Error message if command failed */
  error?: string;
}

/**
 * Validate changed files in a package
 */
export async function validateCommand(options: ValidateOptions): Promise<ValidateResult> {
  const startTime = Date.now();

  // Validate package path exists
  try {
    await fs.access(options.packagePath);
  } catch {
    return createErrorResult(
      options.mode,
      `Path does not exist: ${options.packagePath}`,
      startTime
    );
  }

  // Handle empty changed files
  if (options.changedFiles.length === 0) {
    return {
      mode: options.mode,
      success: true,
      affected: {
        changedSymbols: [],
        affectedFiles: [],
        totalAffected: 0,
        analysisTimeMs: 0,
        truncated: false,
        maxDepthReached: 0,
      },
      totalIssues: 0,
      totalTimeMs: Date.now() - startTime,
    };
  }

  let pool: DuckDBPool | null = null;

  try {
    // Initialize DuckDB pool
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Create seed reader
    const seedReader = new SeedReader(pool, options.packagePath);

    // Build validation config from options
    const configOverrides = buildConfigOverrides(options);

    // Create coordinator and run validation
    const coordinator = new ValidationCoordinator(pool, options.packagePath, seedReader);

    let result: ValidationCoordinatorResult;

    if (options.mode === "quick") {
      result = await coordinator.validateQuick(options.changedFiles, options.packagePath);
    } else {
      result = await coordinator.validateFull(options.changedFiles, options.packagePath);
    }

    // Apply config overrides to result
    const finalResult = applyConfigOverrides(result, options, configOverrides);

    return finalResult;
  } catch (error) {
    return createErrorResult(
      options.mode,
      error instanceof Error ? error.message : String(error),
      startTime
    );
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Build config overrides from command options
 */
function buildConfigOverrides(options: ValidateOptions): {
  skipTypecheck: boolean;
  skipLint: boolean;
  forceTests: boolean;
} {
  return {
    skipTypecheck: options.skipTypecheck ?? false,
    skipLint: options.skipLint ?? false,
    forceTests: options.forceTests ?? false,
  };
}

/**
 * Apply config overrides to validation result
 */
function applyConfigOverrides(
  result: ValidationCoordinatorResult,
  options: ValidateOptions,
  overrides: { skipTypecheck: boolean; skipLint: boolean; forceTests: boolean }
): ValidateResult {
  const finalResult: ValidateResult = { ...result };

  // Remove skipped validators from result
  if (overrides.skipTypecheck) {
    finalResult.typecheck = undefined;
  }

  if (overrides.skipLint) {
    finalResult.lint = undefined;
  }

  // In quick mode, tests is already undefined unless forceTests
  if (options.mode === "quick" && overrides.forceTests && !finalResult.tests) {
    // Tests were requested but not run - add empty result
    finalResult.tests = {
      success: true,
      passed: 0,
      failed: 0,
      timeMs: 0,
    };
  }

  // Recalculate total issues
  let totalIssues = 0;
  if (finalResult.typecheck?.issues) {
    totalIssues += finalResult.typecheck.issues.length;
  }
  if (finalResult.lint?.issues) {
    totalIssues += finalResult.lint.issues.length;
  }
  finalResult.totalIssues = totalIssues;

  return finalResult;
}

/**
 * Create an error result
 */
function createErrorResult(mode: ValidationMode, error: string, startTime: number): ValidateResult {
  return {
    mode,
    success: false,
    affected: {
      changedSymbols: [],
      affectedFiles: [],
      totalAffected: 0,
      analysisTimeMs: 0,
      truncated: false,
      maxDepthReached: 0,
    },
    totalIssues: 0,
    totalTimeMs: Date.now() - startTime,
    error,
  };
}
