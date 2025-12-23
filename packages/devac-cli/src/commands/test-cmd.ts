/**
 * Test Command Implementation
 *
 * Runs test suite on a package.
 * Based on spec Section 11.1: Package Commands - Validation
 *
 * Note: Named test-cmd.ts to avoid conflict with TypeScript's test directory
 */

import * as path from "node:path";
import {
  type TestOptions as CoreTestOptions,
  type TestResult as CoreTestResult,
  createTestValidator,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { formatOutput } from "./output-formatter.js";

/**
 * Options for test command
 */
export interface TestCommandOptions {
  /** Package path to test */
  packagePath: string;
  /** Specific test files to run (optional) */
  files?: string[];
  /** Test runner to use (optional, auto-detected) */
  runner?: "vitest" | "jest" | "npm-test";
  /** Timeout in milliseconds (optional) */
  timeout?: number;
  /** Update snapshots */
  updateSnapshots?: boolean;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from test command
 */
export interface TestCommandResult {
  /** Whether all tests passed */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of passed tests */
  passed: number;
  /** Number of failed tests */
  failed: number;
  /** Number of skipped tests */
  skipped: number;
  /** Test runner used */
  runner: string;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw result from validator */
  result?: CoreTestResult;
  /** Error message if failed */
  error?: string;
}

/**
 * Run test command
 */
export async function testCommand(options: TestCommandOptions): Promise<TestCommandResult> {
  const startTime = Date.now();

  try {
    const validator = createTestValidator();

    const coreOptions: CoreTestOptions = {
      files: options.files,
      runner: options.runner,
      timeout: options.timeout,
      updateSnapshots: options.updateSnapshots,
    };

    const result = await validator.validate(path.resolve(options.packagePath), coreOptions);

    // Format output based on json flag
    let output: string;
    if (options.json) {
      output = formatOutput(
        {
          success: result.success,
          passed: result.passed,
          failed: result.failed,
          skipped: result.skipped,
          runner: result.runner,
          timeMs: result.timeMs,
        },
        { json: true }
      );
    } else {
      // Pretty output (default)
      if (result.success) {
        output = `✓ Tests passed: ${result.passed} passed`;
        if (result.skipped > 0) {
          output += `, ${result.skipped} skipped`;
        }
        output += ` (${result.runner}, ${result.timeMs}ms)`;
      } else {
        output = `✗ Tests failed: ${result.passed} passed, ${result.failed} failed`;
        if (result.skipped > 0) {
          output += `, ${result.skipped} skipped`;
        }
        output += ` (${result.runner}, ${result.timeMs}ms)`;
      }
    }

    return {
      success: result.success,
      output,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      runner: result.runner,
      timeMs: Date.now() - startTime,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `✗ Tests failed: ${errorMessage}`;

    return {
      success: false,
      output,
      passed: 0,
      failed: 0,
      skipped: 0,
      runner: "unknown",
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Register the test command with the CLI program
 */
export function registerTestCommand(program: Command): void {
  program
    .command("test")
    .description("Run test suite on a package")
    .option("-p, --package <path>", "Package path to test", process.cwd())
    .option("-f, --files <files...>", "Specific test files to run")
    .option("-r, --runner <runner>", "Test runner (vitest, jest, npm-test)")
    .option("-t, --timeout <ms>", "Timeout in milliseconds")
    .option("-u, --update-snapshots", "Update snapshots")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await testCommand({
        packagePath: path.resolve(options.package),
        files: options.files,
        runner: options.runner,
        timeout: options.timeout ? Number.parseInt(options.timeout, 10) : undefined,
        updateSnapshots: options.updateSnapshots,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
