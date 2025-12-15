/**
 * Test Validator Implementation
 *
 * Runs test suites and parses output.
 * Based on DevAC v2.0 spec Section 10.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Options for test validation
 */
export interface TestOptions {
  /** Specific test files to run (relative paths) */
  files?: string[];
  /** Test runner to use (auto-detected if not specified) */
  runner?: "vitest" | "jest" | "npm-test";
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Update snapshots (default: false) */
  updateSnapshots?: boolean;
}

/**
 * Result from test validation
 */
export interface TestResult {
  /** Whether all tests passed */
  success: boolean;
  /** Number of passed tests */
  passed: number;
  /** Number of failed tests */
  failed: number;
  /** Number of skipped tests */
  skipped: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Test runner used */
  runner: string;
}

/**
 * Parsed test counts from output
 */
interface TestCounts {
  passed: number;
  failed: number;
  skipped: number;
}

const DEFAULT_OPTIONS: Required<TestOptions> = {
  files: [],
  runner: "vitest",
  timeout: 300000, // 5 minutes
  updateSnapshots: false,
};

/**
 * Test validator
 *
 * Runs tests using detected or specified test runner.
 */
export class TestValidator {
  /**
   * Run tests on a package
   */
  async validate(packagePath: string, options: TestOptions = {}): Promise<TestResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Auto-detect runner if not specified
    if (!options.runner) {
      const detected = await this.detectTestRunner(packagePath);
      if (detected) {
        opts.runner = detected;
      }
    }

    try {
      const output = await this.runTests(packagePath, opts);
      const counts = this.parseOutput(output);

      return {
        success: counts.failed === 0,
        passed: counts.passed,
        failed: counts.failed,
        skipped: counts.skipped,
        timeMs: Date.now() - startTime,
        runner: opts.runner,
      };
    } catch (error) {
      // If tests fail, the output is in the error
      if (error instanceof TestError) {
        const counts = this.parseOutput(error.output);

        return {
          success: false,
          passed: counts.passed,
          failed: counts.failed > 0 ? counts.failed : 1,
          skipped: counts.skipped,
          timeMs: Date.now() - startTime,
          runner: opts.runner,
        };
      }

      // Other errors (e.g., runner not found, timeout)
      return {
        success: false,
        passed: 0,
        failed: 1,
        skipped: 0,
        timeMs: Date.now() - startTime,
        runner: opts.runner,
      };
    }
  }

  /**
   * Run tests and return the output
   */
  private async runTests(packagePath: string, options: Required<TestOptions>): Promise<string> {
    return new Promise((resolve, reject) => {
      let command: string;
      let args: string[];

      switch (options.runner) {
        case "vitest":
          command = this.findExecutable(packagePath, "vitest");
          args = ["run"];
          if (options.updateSnapshots) {
            args.push("--update");
          }
          if (options.files.length > 0) {
            args.push(...options.files);
          }
          break;

        case "jest":
          command = this.findExecutable(packagePath, "jest");
          args = [];
          if (options.updateSnapshots) {
            args.push("--updateSnapshot");
          }
          if (options.files.length > 0) {
            args.push(...options.files);
          }
          break;
        default:
          command = "npm";
          args = ["test"];
          if (options.files.length > 0) {
            args.push("--", ...options.files);
          }
          break;
      }

      const testProcess = spawn(command, args, {
        cwd: packagePath,
        timeout: options.timeout,
        shell: process.platform === "win32",
        env: {
          ...process.env,
          // Force color output off for easier parsing
          NO_COLOR: "1",
          FORCE_COLOR: "0",
        },
      });

      let stdout = "";
      let stderr = "";

      testProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      testProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      testProcess.on("close", (code) => {
        if (code === 0) {
          resolve(stdout + stderr);
        } else {
          reject(new TestError(stdout + stderr, code ?? 1));
        }
      });

      testProcess.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse test runner output into counts
   */
  parseOutput(output: string): TestCounts {
    if (!output || output.trim() === "") {
      return { passed: 0, failed: 0, skipped: 0 };
    }

    // Try vitest format first
    // "Tests  3 passed (3)" or "Tests  1 failed | 2 passed (3)"
    const vitestPattern = /Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed/i;
    const vitestMatch = output.match(vitestPattern);
    if (vitestMatch?.[2]) {
      return {
        passed: Number.parseInt(vitestMatch[2], 10),
        failed: vitestMatch[1] ? Number.parseInt(vitestMatch[1], 10) : 0,
        skipped: 0,
      };
    }

    // Try jest format
    // "Tests:       1 failed, 2 passed, 3 total"
    const jestPattern = /Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed/i;
    const jestMatch = output.match(jestPattern);
    if (jestMatch?.[2]) {
      return {
        passed: Number.parseInt(jestMatch[2], 10),
        failed: jestMatch[1] ? Number.parseInt(jestMatch[1], 10) : 0,
        skipped: 0,
      };
    }

    // Try to count individual test results (✓ and ×)
    const passedMatches = output.match(/[✓✔]/g);
    const failedMatches = output.match(/[×✗✘]/g);

    if (passedMatches || failedMatches) {
      return {
        passed: passedMatches?.length ?? 0,
        failed: failedMatches?.length ?? 0,
        skipped: 0,
      };
    }

    return { passed: 0, failed: 0, skipped: 0 };
  }

  /**
   * Detect test runner from package.json
   */
  async detectTestRunner(packagePath: string): Promise<"vitest" | "jest" | "npm-test" | null> {
    try {
      const packageJsonPath = path.join(packagePath, "package.json");
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content);

      // Check devDependencies
      const devDeps = packageJson.devDependencies || {};
      const deps = packageJson.dependencies || {};

      if (devDeps.vitest || deps.vitest) {
        return "vitest";
      }

      if (devDeps.jest || deps.jest) {
        return "jest";
      }

      // Check test script
      const testScript = packageJson.scripts?.test || "";
      if (testScript.includes("vitest")) {
        return "vitest";
      }
      if (testScript.includes("jest")) {
        return "jest";
      }
      if (testScript) {
        return "npm-test";
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find executable in node_modules
   */
  private findExecutable(packagePath: string, name: string): string {
    const localBin = path.join(packagePath, "node_modules", ".bin", name);
    try {
      // Check if exists synchronously (simpler for this use case)
      require("node:fs").accessSync(localBin);
      return localBin;
    } catch {
      // Check parent directories
      let dir = packagePath;
      for (let i = 0; i < 5; i++) {
        const parentDir = path.dirname(dir);
        if (parentDir === dir) break;
        dir = parentDir;
        const parentBin = path.join(dir, "node_modules", ".bin", name);
        try {
          require("node:fs").accessSync(parentBin);
          return parentBin;
        } catch {
          // Continue searching
        }
      }
    }

    // Fall back to global command
    return name;
  }
}

/**
 * Error class for test execution failures
 */
class TestError extends Error {
  constructor(
    public readonly output: string,
    public readonly exitCode: number
  ) {
    super(`Tests exited with code ${exitCode}`);
    this.name = "TestError";
  }
}

/**
 * Create a TestValidator instance
 */
export function createTestValidator(): TestValidator {
  return new TestValidator();
}
