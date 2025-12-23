/**
 * Typecheck Command Implementation
 *
 * Runs TypeScript type checking on a package.
 * Based on spec Section 11.1: Package Commands - Validation
 */

import * as path from "node:path";
import {
  type TypecheckOptions as CoreTypecheckOptions,
  type TypecheckResult as CoreTypecheckResult,
  createTypecheckValidator,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { formatOutput, formatValidationIssues } from "./output-formatter.js";

/**
 * Options for typecheck command
 */
export interface TypecheckCommandOptions {
  /** Package path to check */
  packagePath: string;
  /** Specific files to check (optional) */
  files?: string[];
  /** Path to tsconfig.json (optional) */
  tsconfig?: string;
  /** Timeout in milliseconds (optional) */
  timeout?: number;
  /** Output in human-readable format */
  pretty?: boolean;
}

/**
 * Result from typecheck command
 */
export interface TypecheckCommandResult {
  /** Whether typecheck passed */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of errors */
  errorCount: number;
  /** Number of warnings */
  warningCount: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw result from validator */
  result?: CoreTypecheckResult;
  /** Error message if failed */
  error?: string;
}

/**
 * Run typecheck command
 */
export async function typecheckCommand(
  options: TypecheckCommandOptions
): Promise<TypecheckCommandResult> {
  const startTime = Date.now();

  try {
    const validator = createTypecheckValidator();

    const coreOptions: CoreTypecheckOptions = {
      files: options.files,
      tsconfig: options.tsconfig,
      timeout: options.timeout,
    };

    const result = await validator.validate(path.resolve(options.packagePath), coreOptions);

    const errorCount = result.issues.filter((i) => i.severity === "error").length;
    const warningCount = result.issues.filter((i) => i.severity === "warning").length;

    // Format output based on pretty flag
    let output: string;
    if (options.pretty) {
      if (result.success) {
        output = `✓ Type check passed (${result.timeMs}ms)`;
      } else {
        output = formatValidationIssues(result.issues, { pretty: true });
        output += `\n\n✗ Type check failed: ${errorCount} error(s), ${warningCount} warning(s) (${result.timeMs}ms)`;
      }
    } else {
      output = formatOutput(
        {
          success: result.success,
          errorCount,
          warningCount,
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
      timeMs: Date.now() - startTime,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.pretty
      ? `✗ Typecheck failed: ${errorMessage}`
      : formatOutput({ success: false, error: errorMessage }, { pretty: false });

    return {
      success: false,
      output,
      errorCount: 0,
      warningCount: 0,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Register the typecheck command with the CLI program
 */
export function registerTypecheckCommand(program: Command): void {
  program
    .command("typecheck")
    .description("Run TypeScript type checking")
    .option("-p, --package <path>", "Package path to check", process.cwd())
    .option("-f, --files <files...>", "Specific files to check")
    .option("-c, --config <path>", "Path to tsconfig.json")
    .option("-t, --timeout <ms>", "Timeout in milliseconds")
    .option("--pretty", "Human-readable output", true)
    .option("--no-pretty", "JSON output")
    .action(async (options) => {
      const result = await typecheckCommand({
        packagePath: path.resolve(options.package),
        files: options.files,
        tsconfig: options.config,
        timeout: options.timeout ? Number.parseInt(options.timeout, 10) : undefined,
        pretty: options.pretty,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
