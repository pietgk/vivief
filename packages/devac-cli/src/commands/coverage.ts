/**
 * Coverage Command Implementation
 *
 * Runs test coverage analysis on a package.
 * Based on spec Section 11.1: Package Commands - Validation
 */

import * as path from "node:path";
import {
  type CoverageOptions as CoreCoverageOptions,
  type CoverageResult as CoreCoverageResult,
  type CoverageSummary,
  type FileCoverage,
  createCoverageValidator,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { formatOutput } from "./output-formatter.js";

/**
 * Options for coverage command
 */
export interface CoverageCommandOptions {
  /** Package path to check */
  packagePath: string;
  /** Minimum threshold for line coverage */
  threshold?: number;
  /** Minimum threshold for line coverage */
  thresholdLines?: number;
  /** Minimum threshold for branch coverage */
  thresholdBranches?: number;
  /** Minimum threshold for function coverage */
  thresholdFunctions?: number;
  /** Coverage tool to use */
  tool?: "vitest" | "jest" | "nyc";
  /** Timeout in milliseconds */
  timeout?: number;
  /** Output in human-readable format */
  pretty?: boolean;
}

/**
 * Result from coverage command
 */
export interface CoverageCommandResult {
  /** Whether all files are above threshold */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of files below threshold */
  issueCount: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Coverage summary */
  summary?: CoverageSummary;
  /** Per-file coverage data */
  files?: FileCoverage[];
  /** Raw result from validator */
  result?: CoreCoverageResult;
  /** Error message if failed */
  error?: string;
}

/**
 * Format coverage summary for pretty output
 */
function formatCoverageSummary(summary: CoverageSummary, threshold: number): string {
  const lines: string[] = [];
  lines.push("Summary:");

  const formatMetric = (name: string, value: number): string => {
    const status = threshold > 0 && value < threshold ? "⚠️" : "✓";
    return `  ${name.padEnd(12)} ${value.toFixed(1).padStart(5)}%  ${status}`;
  };

  lines.push(formatMetric("Lines:", summary.lines));
  lines.push(formatMetric("Branches:", summary.branches));
  lines.push(formatMetric("Functions:", summary.functions));
  lines.push(formatMetric("Statements:", summary.statements));

  return lines.join("\n");
}

/**
 * Format files below threshold for pretty output
 */
function formatFilesBelowThreshold(files: FileCoverage[], threshold: number): string {
  const belowThreshold = files.filter(
    (f) => f.lines < threshold || f.branches < threshold || f.functions < threshold
  );

  if (belowThreshold.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`\nFiles Below Threshold (${belowThreshold.length}):\n`);

  // Sort by lowest coverage first
  belowThreshold.sort((a, b) => a.lines - b.lines);

  for (const file of belowThreshold.slice(0, 20)) {
    lines.push(`  ❌ ${file.lines.toFixed(1).padStart(5)}%  ${file.file}`);
  }

  if (belowThreshold.length > 20) {
    lines.push(`  ... (${belowThreshold.length - 20} more)`);
  }

  return lines.join("\n");
}

/**
 * Run coverage command
 */
export async function coverageCommand(
  options: CoverageCommandOptions
): Promise<CoverageCommandResult> {
  const startTime = Date.now();

  try {
    const validator = createCoverageValidator();

    // Use general threshold or specific thresholds
    const thresholdLines = options.thresholdLines ?? options.threshold ?? 0;
    const thresholdBranches = options.thresholdBranches ?? options.threshold ?? 0;
    const thresholdFunctions = options.thresholdFunctions ?? options.threshold ?? 0;

    const coreOptions: CoreCoverageOptions = {
      thresholdLines,
      thresholdBranches,
      thresholdFunctions,
      tool: options.tool,
      timeout: options.timeout,
    };

    const result = await validator.validate(path.resolve(options.packagePath), coreOptions);

    // Format output based on pretty flag
    let output: string;
    if (options.pretty) {
      const thresholdStr = options.threshold ? `(threshold: ${options.threshold}%)` : "";
      output = `📊 Coverage Report for ${path.basename(options.packagePath)} ${thresholdStr}\n\n`;
      output += formatCoverageSummary(result.summary, options.threshold ?? 0);

      if (options.threshold && options.threshold > 0) {
        output += formatFilesBelowThreshold(result.files, options.threshold);
      }

      output += `\n\nTotal: ${result.issues.length} files below threshold`;
      output += `\nTime: ${(result.timeMs / 1000).toFixed(1)}s`;

      if (result.success) {
        output = `✓ ${output}`;
      } else {
        output = `⚠️ ${output}`;
      }
    } else {
      output = formatOutput(
        {
          success: result.success,
          issueCount: result.issues.length,
          timeMs: result.timeMs,
          summary: result.summary,
          issues: result.issues,
          files: result.files,
        },
        { pretty: false }
      );
    }

    return {
      success: result.success,
      output,
      issueCount: result.issues.length,
      timeMs: Date.now() - startTime,
      summary: result.summary,
      files: result.files,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.pretty
      ? `✗ Coverage failed: ${errorMessage}`
      : formatOutput({ success: false, error: errorMessage }, { pretty: false });

    return {
      success: false,
      output,
      issueCount: 0,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Register the coverage command with the CLI program
 */
export function registerCoverageCommand(program: Command): void {
  program
    .command("coverage")
    .description("Run test coverage analysis")
    .option("-p, --package <path>", "Package path to check", process.cwd())
    .option("--threshold <percent>", "Minimum coverage threshold for all metrics")
    .option("--threshold-lines <percent>", "Minimum line coverage threshold")
    .option("--threshold-branches <percent>", "Minimum branch coverage threshold")
    .option("--threshold-functions <percent>", "Minimum function coverage threshold")
    .option("--tool <tool>", "Coverage tool (vitest, jest, nyc)")
    .option("-t, --timeout <ms>", "Timeout in milliseconds")
    .option("--pretty", "Human-readable output", true)
    .option("--no-pretty", "JSON output")
    .action(async (options) => {
      const result = await coverageCommand({
        packagePath: path.resolve(options.package),
        threshold: options.threshold ? Number.parseFloat(options.threshold) : undefined,
        thresholdLines: options.thresholdLines
          ? Number.parseFloat(options.thresholdLines)
          : undefined,
        thresholdBranches: options.thresholdBranches
          ? Number.parseFloat(options.thresholdBranches)
          : undefined,
        thresholdFunctions: options.thresholdFunctions
          ? Number.parseFloat(options.thresholdFunctions)
          : undefined,
        tool: options.tool as "vitest" | "jest" | "nyc" | undefined,
        timeout: options.timeout ? Number.parseInt(options.timeout, 10) : undefined,
        pretty: options.pretty,
      });

      console.log(result.output);
      // Coverage issues are warnings, don't exit with error
      // Exit with error only if command itself failed
      if (result.error) {
        process.exit(1);
      }
    });
}
