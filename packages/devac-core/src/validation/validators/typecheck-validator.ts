/**
 * Typecheck Validator Implementation
 *
 * Runs TypeScript type checking and parses output.
 * Based on DevAC v2.0 spec Section 10.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { TscError } from "../errors.js";
import type { ValidationIssue } from "../issue-enricher.js";

/**
 * Options for typecheck validation
 */
export interface TypecheckOptions {
  /** Specific files to check (relative paths) */
  files?: string[];
  /** Path to tsconfig.json (relative to packagePath) */
  tsconfig?: string;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
}

/**
 * Result from typecheck validation
 */
export interface TypecheckResult {
  /** Whether validation passed (no errors) */
  success: boolean;
  /** List of validation issues */
  issues: ValidationIssue[];
  /** Time taken in milliseconds */
  timeMs: number;
}

const DEFAULT_OPTIONS: Required<TypecheckOptions> = {
  files: [],
  tsconfig: "tsconfig.json",
  timeout: 60000,
};

/**
 * TypeScript typecheck validator
 *
 * Runs tsc --noEmit and parses the output for errors.
 */
export class TypecheckValidator {
  /**
   * Run TypeScript type checking on a package
   */
  async validate(packagePath: string, options: TypecheckOptions = {}): Promise<TypecheckResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      const output = await this.runTsc(packagePath, opts);
      const issues = this.parseOutput(output);

      return {
        success: issues.length === 0,
        issues,
        timeMs: Date.now() - startTime,
      };
    } catch (error) {
      // If tsc fails with errors, the output is in the error
      if (error instanceof TscError) {
        const issues = this.parseOutput(error.output);
        return {
          success: issues.length === 0,
          issues,
          timeMs: Date.now() - startTime,
        };
      }

      // Other errors (e.g., tsc not found, timeout)
      return {
        success: false,
        issues: [
          {
            file: packagePath,
            line: 0,
            column: 0,
            message: error instanceof Error ? error.message : String(error),
            severity: "error",
            source: "tsc",
          },
        ],
        timeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Run tsc and return the output
   */
  private async runTsc(packagePath: string, options: Required<TypecheckOptions>): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ["--noEmit", "--pretty", "false"];

      // Add tsconfig path
      const tsconfigPath = path.join(packagePath, options.tsconfig);
      args.push("--project", tsconfigPath);

      // If specific files are provided, add them
      if (options.files.length > 0) {
        // When checking specific files, we need a different approach
        // Use --noEmit with file paths
        args.length = 0; // Clear args
        args.push("--noEmit", "--pretty", "false");
        args.push("--project", tsconfigPath);
        // Note: tsc with --project ignores file arguments
        // For file-specific checking, we'd need a different approach
        // For now, we just check the whole project
      }

      // Try to find tsc - first in node_modules, then global
      const tscPath = findTscExecutable(packagePath);

      const tsc = spawn(tscPath, args, {
        cwd: packagePath,
        timeout: options.timeout,
        shell: process.platform === "win32",
      });

      let stdout = "";
      let stderr = "";

      tsc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      tsc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      tsc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          // tsc exits with non-zero when there are errors
          // The errors are in stdout
          reject(new TscError(stdout || stderr, code ?? 1));
        }
      });

      tsc.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse tsc output into ValidationIssue array
   */
  parseOutput(output: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!output || output.trim() === "") {
      return issues;
    }

    // Match tsc error format: file(line,column): error TSxxxx: message
    // Example: src/utils.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
    const errorPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/gm;

    let match: RegExpExecArray | null = errorPattern.exec(output);
    while (match !== null) {
      const file = match[1];
      const line = match[2];
      const column = match[3];
      const severity = match[4];
      const code = match[5];
      const message = match[6];

      if (!file || !line || !column || !message) {
        continue;
      }

      issues.push({
        file: file.trim(),
        line: Number.parseInt(line, 10),
        column: Number.parseInt(column, 10),
        message: message.trim(),
        severity: severity === "warning" ? "warning" : "error",
        source: "tsc",
        code,
      });
      match = errorPattern.exec(output);
    }

    return issues;
  }
}

/**
 * Find tsc executable - checks local node_modules first, then falls back to npx
 */
function findTscExecutable(packagePath: string): string {
  // Check local node_modules
  const localTsc = path.join(packagePath, "node_modules", ".bin", "tsc");
  if (fs.existsSync(localTsc)) {
    return localTsc;
  }

  // Check parent directories for monorepo setups
  let dir = packagePath;
  for (let i = 0; i < 5; i++) {
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
    const parentTsc = path.join(dir, "node_modules", ".bin", "tsc");
    if (fs.existsSync(parentTsc)) {
      return parentTsc;
    }
  }

  // Fall back to global tsc (assumes it's in PATH)
  return "tsc";
}

/**
 * Create a TypecheckValidator instance
 */
export function createTypecheckValidator(): TypecheckValidator {
  return new TypecheckValidator();
}
