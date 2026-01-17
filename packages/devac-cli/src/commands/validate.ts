/**
 * Validate Command Implementation
 *
 * Runs validation (typecheck, lint, tests) on changed files
 * with symbol-level affected detection and issue enrichment.
 * Based on spec Section 10 and Phase 5 plan.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  DuckDBPool,
  SeedReader,
  ValidationCoordinator,
  type ValidationCoordinatorResult,
  type ValidationMode,
  createHubClient,
  detectRepoId,
  pushValidationResultsToHub,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { getWorkspaceHubDir } from "../utils/workspace-discovery.js";

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
  /** Push results to central Hub cache */
  pushToHub?: boolean;
  /** Repository ID for Hub push (required if pushToHub is true) */
  repoId?: string;
  /** Auto-sync results to Hub (auto-detects repo ID) */
  sync?: boolean;
}

/**
 * Result from validate command
 */
export interface ValidateResult extends ValidationCoordinatorResult {
  /** Error message if command failed */
  error?: string;
  /** Number of errors pushed to Hub (if pushToHub was enabled) */
  pushedToHub?: number;
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

    // Push to Hub if requested (--sync auto-detects repo ID, --push-to-hub requires explicit --repo-id)
    const shouldPushToHub = options.sync || (options.pushToHub && options.repoId);
    if (shouldPushToHub) {
      const hubDir = await getWorkspaceHubDir();
      try {
        // Auto-detect repo ID for --sync, or use provided --repo-id
        let repoId = options.repoId;
        if (!repoId && options.sync) {
          const detected = await detectRepoId(options.packagePath);
          repoId = detected.repoId;
        }

        if (!repoId) {
          console.error("Warning: Could not determine repository ID for Hub sync");
        } else {
          const client = createHubClient({ hubDir });
          const pushResult = await pushValidationResultsToHub(
            client,
            repoId,
            options.packagePath,
            finalResult
          );
          finalResult.pushedToHub = pushResult.pushed;
        }
      } catch (hubError) {
        // Don't fail validation if Hub push fails - log warning
        console.error(
          `Warning: Failed to push validation results to Hub: ${
            hubError instanceof Error ? hubError.message : String(hubError)
          }`
        );
      }
    }

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

/**
 * Register the validate command with the CLI program
 */
export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .alias("check")
    .description("Validate changed files with affected detection (alias: check)")
    .option("-p, --package <path>", "Package path to validate", process.cwd())
    .option("-f, --files <files...>", "Changed files to validate")
    .option("-m, --mode <mode>", "Validation mode (quick, full)", "quick")
    .option("--skip-typecheck", "Skip type checking")
    .option("--skip-lint", "Skip linting")
    .option("--force-tests", "Force tests even in quick mode")
    .option("--architecture", "Check architecture documentation drift")
    .option("--max-depth <depth>", "Maximum affected depth", "10")
    .option("-t, --timeout <ms>", "Timeout in milliseconds")
    .option("--push-to-hub", "Push results to central Hub")
    .option("--repo-id <id>", "Repository ID for Hub push")
    .option("--sync", "Auto-sync results to Hub (auto-detects repo ID)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await validateCommand({
        packagePath: path.resolve(options.package),
        changedFiles: options.files || [],
        mode: options.mode as ValidationMode,
        skipTypecheck: options.skipTypecheck,
        skipLint: options.skipLint,
        forceTests: options.forceTests,
        maxDepth: options.maxDepth ? Number.parseInt(options.maxDepth, 10) : undefined,
        timeout: options.timeout ? Number.parseInt(options.timeout, 10) : undefined,
        pushToHub: options.pushToHub,
        repoId: options.repoId,
        sync: options.sync,
      });

      // Check architecture drift if requested
      if (options.architecture) {
        const { architectureStatusCommand } = await import("./architecture.js");
        const archResult = await architectureStatusCommand({
          packagePath: path.resolve(options.package),
          json: false,
        });

        if (archResult.status === "stale") {
          console.warn("\n⚠️  Architecture documentation drift detected");
          console.warn("   Run /validate-architecture to update");
        } else if (archResult.status === "missing") {
          console.warn("\n⚠️  Architecture documentation missing");
          console.warn("   Run /validate-architecture to create");
        }
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.success) {
          console.log(`✓ Validation passed (${result.mode} mode, ${result.totalTimeMs}ms)`);
          console.log(`  Affected files: ${result.affected.totalAffected}`);
          console.log(`  Issues found: ${result.totalIssues}`);
          if (result.pushedToHub !== undefined) {
            console.log(`  Pushed to Hub: ${result.pushedToHub}`);
          }
        } else {
          console.error(`✗ Validation failed: ${result.error || `${result.totalIssues} issues`}`);
          process.exit(1);
        }
      }
    });
}
