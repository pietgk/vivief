/**
 * Lint Command Implementation
 *
 * Runs ESLint on a package.
 * Based on spec Section 11.1: Package Commands - Validation
 */

import * as path from "node:path";
import {
  type LintOptions as CoreLintOptions,
  type LintResult as CoreLintResult,
  createLintValidator,
} from "@pietgk/devac-core";
import { formatOutput, formatValidationIssues } from "./output-formatter.js";

/**
 * Options for lint command
 */
export interface LintCommandOptions {
  /** Package path to lint */
  packagePath: string;
  /** Specific files to lint (optional) */
  files?: string[];
  /** Path to ESLint config (optional) */
  config?: string;
  /** Timeout in milliseconds (optional) */
  timeout?: number;
  /** Fix auto-fixable issues */
  fix?: boolean;
  /** Output in human-readable format */
  pretty?: boolean;
}

/**
 * Result from lint command
 */
export interface LintCommandResult {
  /** Whether lint passed */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of errors */
  errorCount: number;
  /** Number of warnings */
  warningCount: number;
  /** Number of files checked */
  filesChecked: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw result from validator */
  result?: CoreLintResult;
  /** Error message if failed */
  error?: string;
}

/**
 * Run lint command
 */
export async function lintCommand(options: LintCommandOptions): Promise<LintCommandResult> {
  const startTime = Date.now();

  try {
    const validator = createLintValidator();

    const coreOptions: CoreLintOptions = {
      files: options.files,
      config: options.config,
      timeout: options.timeout,
      fix: options.fix,
    };

    const result = await validator.validate(path.resolve(options.packagePath), coreOptions);

    const errorCount = result.issues.filter((i) => i.severity === "error").length;
    const warningCount = result.issues.filter((i) => i.severity === "warning").length;

    // Format output based on pretty flag
    let output: string;
    if (options.pretty) {
      if (result.success) {
        output = `✓ Lint passed: ${result.filesChecked} files checked (${result.timeMs}ms)`;
      } else {
        output = formatValidationIssues(result.issues, { pretty: true });
        output += `\n\n✗ Lint failed: ${errorCount} error(s), ${warningCount} warning(s) in ${result.filesChecked} files (${result.timeMs}ms)`;
      }
    } else {
      output = formatOutput(
        {
          success: result.success,
          errorCount,
          warningCount,
          filesChecked: result.filesChecked,
          timeMs: result.timeMs,
          issues: result.issues,
        },
        { pretty: false }
      );
    }

    return {
      success: result.success,
      output,
      errorCount,
      warningCount,
      filesChecked: result.filesChecked,
      timeMs: Date.now() - startTime,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.pretty
      ? `✗ Lint failed: ${errorMessage}`
      : formatOutput({ success: false, error: errorMessage }, { pretty: false });

    return {
      success: false,
      output,
      errorCount: 0,
      warningCount: 0,
      filesChecked: 0,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}
