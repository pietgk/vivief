/**
 * Coverage Validator Implementation
 *
 * Runs test coverage and reports files below threshold.
 * Based on DevAC v2.0 spec Section 10.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CoverageError } from "../errors.js";

/**
 * Options for coverage validation
 */
export interface CoverageOptions {
  /** Timeout in milliseconds (default: 120000 = 2 minutes) */
  timeout?: number;
  /** Minimum threshold for line coverage (default: 0 = report all) */
  thresholdLines?: number;
  /** Minimum threshold for branch coverage (default: 0 = report all) */
  thresholdBranches?: number;
  /** Minimum threshold for function coverage (default: 0 = report all) */
  thresholdFunctions?: number;
  /** Coverage tool to use (auto-detected if not specified) */
  tool?: "vitest" | "jest" | "nyc";
}

/**
 * Coverage data for a single file
 */
export interface FileCoverage {
  /** File path (relative to package root) */
  file: string;
  /** Line coverage percentage */
  lines: number;
  /** Branch coverage percentage */
  branches: number;
  /** Function coverage percentage */
  functions: number;
  /** Statement coverage percentage */
  statements: number;
}

/**
 * Coverage issue for files below threshold
 */
export interface CoverageIssue {
  /** File path (relative to package root) */
  file: string;
  /** Line number (always 1 for coverage issues) */
  line: number;
  /** Column number (always 0 for coverage issues) */
  column: number;
  /** Issue message */
  message: string;
  /** Severity level */
  severity: "error" | "warning";
  /** Source of the issue */
  source: "coverage";
  /** Issue code */
  code: string;
}

/**
 * Coverage summary metrics
 */
export interface CoverageSummary {
  /** Line coverage percentage */
  lines: number;
  /** Branch coverage percentage */
  branches: number;
  /** Function coverage percentage */
  functions: number;
  /** Statement coverage percentage */
  statements: number;
}

/**
 * Result from coverage validation
 */
export interface CoverageResult {
  /** Whether all files are above threshold */
  success: boolean;
  /** Files below threshold as issues */
  issues: CoverageIssue[];
  /** Time taken in milliseconds */
  timeMs: number;
  /** Overall coverage summary */
  summary: CoverageSummary;
  /** Per-file coverage data */
  files: FileCoverage[];
  /** Coverage tool used */
  tool: string;
}

/**
 * Istanbul coverage JSON format (used by vitest, jest, nyc)
 */
interface IstanbulCoverageData {
  [filePath: string]: {
    path: string;
    statementMap: Record<string, unknown>;
    fnMap: Record<string, unknown>;
    branchMap: Record<string, unknown>;
    s: Record<string, number>;
    f: Record<string, number>;
    b: Record<string, number[]>;
  };
}

const DEFAULT_OPTIONS: Required<CoverageOptions> = {
  timeout: 120000, // 2 minutes
  thresholdLines: 0,
  thresholdBranches: 0,
  thresholdFunctions: 0,
  tool: "vitest",
};

/**
 * Coverage Validator
 *
 * Runs test coverage and identifies files below threshold.
 */
export class CoverageValidator {
  /**
   * Run coverage validation on a package
   */
  async validate(packagePath: string, options: CoverageOptions = {}): Promise<CoverageResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Auto-detect tool if not specified
    if (!options.tool) {
      const detected = await this.detectCoverageTool(packagePath);
      if (detected) {
        opts.tool = detected;
      }
    }

    try {
      // Run coverage command
      await this.runCoverageCommand(packagePath, opts);

      // Parse coverage JSON
      const coverageJsonPath = path.join(packagePath, "coverage", "coverage-final.json");
      const files = await this.parseCoverageJson(coverageJsonPath, packagePath);

      // Calculate summary
      const summary = this.calculateSummary(files);

      // Find files below threshold
      const issues = this.findIssues(files, opts);

      return {
        success: issues.length === 0,
        issues,
        timeMs: Date.now() - startTime,
        summary,
        files,
        tool: opts.tool,
      };
    } catch (error) {
      // Coverage command failed, but may have generated report
      try {
        const coverageJsonPath = path.join(packagePath, "coverage", "coverage-final.json");
        const files = await this.parseCoverageJson(coverageJsonPath, packagePath);
        const summary = this.calculateSummary(files);
        const issues = this.findIssues(files, opts);

        return {
          success: issues.length === 0,
          issues,
          timeMs: Date.now() - startTime,
          summary,
          files,
          tool: opts.tool,
        };
      } catch {
        // No coverage data available
        return {
          success: false,
          issues: [
            {
              file: "package.json",
              line: 1,
              column: 0,
              message: `Coverage command failed: ${error instanceof Error ? error.message : "Unknown error"}`,
              severity: "error",
              source: "coverage",
              code: "COVERAGE_FAILED",
            },
          ],
          timeMs: Date.now() - startTime,
          summary: { lines: 0, branches: 0, functions: 0, statements: 0 },
          files: [],
          tool: opts.tool,
        };
      }
    }
  }

  /**
   * Run coverage command
   */
  private async runCoverageCommand(
    packagePath: string,
    options: Required<CoverageOptions>
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let command: string;
      let args: string[];

      switch (options.tool) {
        case "vitest":
          command = this.findExecutable(packagePath, "vitest");
          args = ["run", "--coverage"];
          break;

        case "jest":
          command = this.findExecutable(packagePath, "jest");
          args = ["--coverage", "--coverageReporters=json"];
          break;

        case "nyc":
          command = this.findExecutable(packagePath, "nyc");
          args = ["--reporter=json", "npm", "test"];
          break;

        default:
          command = this.findExecutable(packagePath, "vitest");
          args = ["run", "--coverage"];
      }

      const coverageProcess = spawn(command, args, {
        cwd: packagePath,
        timeout: options.timeout,
        shell: process.platform === "win32",
        env: {
          ...process.env,
          NO_COLOR: "1",
          FORCE_COLOR: "0",
        },
      });

      let stdout = "";
      let stderr = "";

      coverageProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      coverageProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      coverageProcess.on("close", (code) => {
        // Even if tests fail, coverage report may be generated
        if (code === 0) {
          resolve(stdout + stderr);
        } else {
          reject(new CoverageError(stdout + stderr, code ?? 1));
        }
      });

      coverageProcess.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse Istanbul coverage JSON format
   */
  async parseCoverageJson(jsonPath: string, packagePath: string): Promise<FileCoverage[]> {
    const content = await fs.readFile(jsonPath, "utf-8");
    const data: IstanbulCoverageData = JSON.parse(content);
    const files: FileCoverage[] = [];

    for (const [absolutePath, coverage] of Object.entries(data)) {
      // Convert absolute path to relative
      const relativePath = path.relative(packagePath, absolutePath);

      // Calculate coverage percentages
      const stmtCoverage = this.calculateCoveragePercent(coverage.s);
      const fnCoverage = this.calculateCoveragePercent(coverage.f);
      const branchCoverage = this.calculateBranchCoverage(coverage.b);
      const lineCoverage = stmtCoverage; // Line coverage approximated by statements

      files.push({
        file: relativePath,
        lines: lineCoverage,
        branches: branchCoverage,
        functions: fnCoverage,
        statements: stmtCoverage,
      });
    }

    return files;
  }

  /**
   * Calculate coverage percentage from hit counts
   */
  private calculateCoveragePercent(hits: Record<string, number>): number {
    const entries = Object.values(hits);
    if (entries.length === 0) return 100;

    const covered = entries.filter((count) => count > 0).length;
    return Math.round((covered / entries.length) * 1000) / 10;
  }

  /**
   * Calculate branch coverage from branch hit arrays
   */
  private calculateBranchCoverage(branches: Record<string, number[]>): number {
    const allBranches: number[] = [];
    for (const branchHits of Object.values(branches)) {
      allBranches.push(...branchHits);
    }

    if (allBranches.length === 0) return 100;

    const covered = allBranches.filter((count) => count > 0).length;
    return Math.round((covered / allBranches.length) * 1000) / 10;
  }

  /**
   * Calculate overall coverage summary
   */
  private calculateSummary(files: FileCoverage[]): CoverageSummary {
    if (files.length === 0) {
      return { lines: 0, branches: 0, functions: 0, statements: 0 };
    }

    const sum = files.reduce(
      (acc, file) => ({
        lines: acc.lines + file.lines,
        branches: acc.branches + file.branches,
        functions: acc.functions + file.functions,
        statements: acc.statements + file.statements,
      }),
      { lines: 0, branches: 0, functions: 0, statements: 0 }
    );

    return {
      lines: Math.round((sum.lines / files.length) * 10) / 10,
      branches: Math.round((sum.branches / files.length) * 10) / 10,
      functions: Math.round((sum.functions / files.length) * 10) / 10,
      statements: Math.round((sum.statements / files.length) * 10) / 10,
    };
  }

  /**
   * Find files below threshold and create issues
   */
  private findIssues(files: FileCoverage[], options: Required<CoverageOptions>): CoverageIssue[] {
    const issues: CoverageIssue[] = [];

    for (const file of files) {
      const belowThreshold: string[] = [];

      if (options.thresholdLines > 0 && file.lines < options.thresholdLines) {
        belowThreshold.push(`${file.lines}% lines`);
      }
      if (options.thresholdBranches > 0 && file.branches < options.thresholdBranches) {
        belowThreshold.push(`${file.branches}% branches`);
      }
      if (options.thresholdFunctions > 0 && file.functions < options.thresholdFunctions) {
        belowThreshold.push(`${file.functions}% functions`);
      }

      if (belowThreshold.length > 0) {
        const thresholdStr = [
          options.thresholdLines > 0 ? `lines: ${options.thresholdLines}%` : null,
          options.thresholdBranches > 0 ? `branches: ${options.thresholdBranches}%` : null,
          options.thresholdFunctions > 0 ? `functions: ${options.thresholdFunctions}%` : null,
        ]
          .filter(Boolean)
          .join(", ");

        issues.push({
          file: file.file,
          line: 1,
          column: 0,
          message: `Coverage: ${belowThreshold.join(", ")} (threshold: ${thresholdStr})`,
          severity: "warning",
          source: "coverage",
          code: "COVERAGE_BELOW_THRESHOLD",
        });
      }
    }

    return issues;
  }

  /**
   * Detect coverage tool from package.json
   */
  async detectCoverageTool(packagePath: string): Promise<"vitest" | "jest" | "nyc" | null> {
    try {
      const packageJsonPath = path.join(packagePath, "package.json");
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content);

      const devDeps = packageJson.devDependencies || {};
      const deps = packageJson.dependencies || {};

      if (devDeps.vitest || deps.vitest) {
        return "vitest";
      }

      if (devDeps.jest || deps.jest) {
        return "jest";
      }

      if (devDeps.nyc || deps.nyc) {
        return "nyc";
      }

      // Check test:coverage script
      const coverageScript = packageJson.scripts?.["test:coverage"] || "";
      if (coverageScript.includes("vitest")) {
        return "vitest";
      }
      if (coverageScript.includes("jest")) {
        return "jest";
      }
      if (coverageScript.includes("nyc")) {
        return "nyc";
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
 * Create a CoverageValidator instance
 */
export function createCoverageValidator(): CoverageValidator {
  return new CoverageValidator();
}
