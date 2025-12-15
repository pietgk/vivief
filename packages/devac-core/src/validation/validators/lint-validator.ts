/**
 * Lint Validator Implementation
 *
 * Runs ESLint and parses JSON output.
 * Based on DevAC v2.0 spec Section 10.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidationIssue } from "../issue-enricher.js";

/**
 * Options for lint validation
 */
export interface LintOptions {
  /** Specific files to lint (relative paths) */
  files?: string[];
  /** Path to ESLint config (relative to packagePath) */
  config?: string;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Fix auto-fixable issues (default: false) */
  fix?: boolean;
}

/**
 * Result from lint validation
 */
export interface LintResult {
  /** Whether validation passed (no errors) */
  success: boolean;
  /** List of validation issues */
  issues: ValidationIssue[];
  /** Time taken in milliseconds */
  timeMs: number;
  /** Number of files checked */
  filesChecked: number;
}

/**
 * ESLint JSON output message format
 */
interface ESLintMessage {
  ruleId: string | null;
  severity: 1 | 2; // 1 = warning, 2 = error
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * ESLint JSON output file result format
 */
interface ESLintFileResult {
  filePath: string;
  messages: ESLintMessage[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount?: number;
  fixableWarningCount?: number;
}

const DEFAULT_OPTIONS: Required<LintOptions> = {
  files: [],
  config: "",
  timeout: 60000,
  fix: false,
};

/**
 * ESLint validator
 *
 * Runs eslint with JSON output and parses the results.
 */
export class LintValidator {
  /**
   * Run ESLint on a package
   */
  async validate(packagePath: string, options: LintOptions = {}): Promise<LintResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      const output = await this.runEslint(packagePath, opts);
      const issues = this.parseOutput(output, packagePath);

      // Count errors (not warnings)
      const errorCount = issues.filter((i) => i.severity === "error").length;

      return {
        success: errorCount === 0,
        issues,
        timeMs: Date.now() - startTime,
        filesChecked: opts.files.length || 0,
      };
    } catch (error) {
      // If eslint fails, try to parse the output from the error
      if (error instanceof EslintError) {
        const issues = this.parseOutput(error.output, packagePath);
        const errorCount = issues.filter((i) => i.severity === "error").length;

        return {
          success: errorCount === 0,
          issues,
          timeMs: Date.now() - startTime,
          filesChecked: opts.files.length || 0,
        };
      }

      // Other errors (e.g., eslint not found, timeout)
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
          },
        ],
        timeMs: Date.now() - startTime,
        filesChecked: 0,
      };
    }
  }

  /**
   * Run eslint and return the JSON output
   */
  private async runEslint(packagePath: string, options: Required<LintOptions>): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ["--format", "json"];

      // Add config if specified
      if (options.config) {
        args.push("--config", options.config);
      }

      // Add fix if requested
      if (options.fix) {
        args.push("--fix");
      }

      // Add files to lint
      if (options.files.length > 0) {
        args.push(...options.files);
      } else {
        // Default to current directory
        args.push(".");
      }

      // Try to find eslint executable
      const eslintPath = findEslintExecutable(packagePath);

      const eslint = spawn(eslintPath, args, {
        cwd: packagePath,
        timeout: options.timeout,
        shell: process.platform === "win32",
      });

      let stdout = "";
      let stderr = "";

      eslint.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      eslint.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      eslint.on("close", (code) => {
        // ESLint exits with 1 when there are linting errors
        // The JSON output is still valid
        if (code === 0 || code === 1) {
          resolve(stdout);
        } else {
          reject(new EslintError(stdout || stderr, code ?? 1));
        }
      });

      eslint.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse ESLint JSON output into ValidationIssue array
   */
  parseOutput(output: string, packagePath: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!output || output.trim() === "") {
      return issues;
    }

    try {
      const results: ESLintFileResult[] = JSON.parse(output);

      for (const fileResult of results) {
        // Convert absolute path to relative
        let relativePath = fileResult.filePath;
        if (path.isAbsolute(relativePath)) {
          relativePath = path.relative(packagePath, relativePath);
        }

        for (const message of fileResult.messages) {
          issues.push({
            file: relativePath,
            line: message.line,
            column: message.column,
            message: message.message,
            severity: message.severity === 2 ? "error" : "warning",
            source: "eslint",
            code: message.ruleId || undefined,
          });
        }
      }
    } catch {
      // Invalid JSON - return empty issues
      return issues;
    }

    return issues;
  }
}

/**
 * Error class for eslint execution failures
 */
class EslintError extends Error {
  constructor(
    public readonly output: string,
    public readonly exitCode: number
  ) {
    super(`eslint exited with code ${exitCode}`);
    this.name = "EslintError";
  }
}

/**
 * Find eslint executable - checks local node_modules first
 */
function findEslintExecutable(packagePath: string): string {
  // Check local node_modules
  const localEslint = path.join(packagePath, "node_modules", ".bin", "eslint");
  if (fs.existsSync(localEslint)) {
    return localEslint;
  }

  // Check parent directories for monorepo setups
  let dir = packagePath;
  for (let i = 0; i < 5; i++) {
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
    const parentEslint = path.join(dir, "node_modules", ".bin", "eslint");
    if (fs.existsSync(parentEslint)) {
      return parentEslint;
    }
  }

  // Fall back to global eslint (assumes it's in PATH)
  return "eslint";
}

/**
 * Create a LintValidator instance
 */
export function createLintValidator(): LintValidator {
  return new LintValidator();
}
