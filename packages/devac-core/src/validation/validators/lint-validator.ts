/**
 * Lint Validator Implementation
 *
 * Runs Biome or ESLint (auto-detected) and parses JSON output.
 * Based on DevAC v2.0 spec Section 10.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidationIssue } from "../issue-enricher.js";

/**
 * Supported linter types
 */
export type LinterType = "biome" | "eslint";

/**
 * Options for lint validation
 */
export interface LintOptions {
  /** Specific files to lint (relative paths) */
  files?: string[];
  /** Path to linter config (relative to packagePath) */
  config?: string;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Fix auto-fixable issues (default: false) */
  fix?: boolean;
  /** Force a specific linter (default: auto-detect) */
  linter?: LinterType;
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
  /** Which linter was used */
  linter: LinterType;
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

/**
 * Biome JSON output format
 */
interface BiomeDiagnostic {
  category: string;
  severity: "error" | "warning" | "info";
  description: string;
  message: Array<{ content: string }>;
  location: {
    path: { file: string };
    span: [number, number] | null;
    sourceCode: string | null;
  };
  tags?: string[];
}

interface BiomeOutput {
  summary: {
    errors: number;
    warnings: number;
  };
  diagnostics: BiomeDiagnostic[];
  command: string;
}

const DEFAULT_OPTIONS: Required<Omit<LintOptions, "linter">> & {
  linter?: LinterType;
} = {
  files: [],
  config: "",
  timeout: 60000,
  fix: false,
  linter: undefined,
};

/**
 * Lint validator that supports both Biome and ESLint
 *
 * Auto-detects which linter to use based on project configuration.
 */
export class LintValidator {
  /**
   * Run linting on a package
   */
  async validate(packagePath: string, options: LintOptions = {}): Promise<LintResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Detect which linter to use
    const linter = opts.linter ?? this.detectLinter(packagePath);

    try {
      if (linter === "biome") {
        return await this.runBiome(packagePath, opts, startTime);
      }
      return await this.runEslint(packagePath, opts, startTime);
    } catch (error) {
      // Handle linter execution errors
      return {
        success: false,
        issues: [
          {
            file: packagePath,
            line: 0,
            column: 0,
            message: error instanceof Error ? error.message : String(error),
            severity: "error",
            source: linter,
          },
        ],
        timeMs: Date.now() - startTime,
        filesChecked: 0,
        linter,
      };
    }
  }

  /**
   * Detect which linter the project uses
   */
  detectLinter(packagePath: string): LinterType {
    // Check for Biome first (check config files and binary)
    const biomeConfigs = ["biome.json", "biome.jsonc"];
    for (const config of biomeConfigs) {
      if (fs.existsSync(path.join(packagePath, config))) {
        return "biome";
      }
    }

    // Check parent directories for monorepo setups
    let dir = packagePath;
    for (let i = 0; i < 5; i++) {
      const parentDir = path.dirname(dir);
      if (parentDir === dir) break;
      dir = parentDir;

      for (const config of biomeConfigs) {
        if (fs.existsSync(path.join(dir, config))) {
          // Also verify biome binary exists
          if (findBiomeExecutable(packagePath)) {
            return "biome";
          }
        }
      }
    }

    // Check for ESLint config files
    const eslintConfigs = [
      ".eslintrc",
      ".eslintrc.js",
      ".eslintrc.cjs",
      ".eslintrc.json",
      ".eslintrc.yml",
      ".eslintrc.yaml",
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
    ];

    for (const config of eslintConfigs) {
      if (fs.existsSync(path.join(packagePath, config))) {
        return "eslint";
      }
    }

    // Check parent directories for ESLint
    dir = packagePath;
    for (let i = 0; i < 5; i++) {
      const parentDir = path.dirname(dir);
      if (parentDir === dir) break;
      dir = parentDir;

      for (const config of eslintConfigs) {
        if (fs.existsSync(path.join(dir, config))) {
          return "eslint";
        }
      }
    }

    // Default to ESLint (more common)
    return "eslint";
  }

  /**
   * Run Biome and return parsed results
   */
  private async runBiome(
    packagePath: string,
    options: Required<Omit<LintOptions, "linter">> & { linter?: LinterType },
    startTime: number
  ): Promise<LintResult> {
    const output = await this.executeBiome(packagePath, options);
    const issues = this.parseBiomeOutput(output, packagePath);
    const errorCount = issues.filter((i) => i.severity === "error").length;

    return {
      success: errorCount === 0,
      issues,
      timeMs: Date.now() - startTime,
      filesChecked: options.files?.length || 0,
      linter: "biome",
    };
  }

  /**
   * Execute Biome and return raw output
   */
  private async executeBiome(
    packagePath: string,
    options: Required<Omit<LintOptions, "linter">> & { linter?: LinterType }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ["check", "--reporter=json"];

      // Add fix if requested
      if (options.fix) {
        args.push("--write");
      }

      // Add files to lint (make paths relative to packagePath)
      if (options.files && options.files.length > 0) {
        const relativeFiles = options.files.map((file) => {
          // If file is absolute or starts with packagePath, make it relative
          if (path.isAbsolute(file)) {
            return path.relative(packagePath, file);
          }
          // If file path includes packagePath prefix, strip it
          const packageBase = path.basename(packagePath);
          const packagePrefix = packagePath.endsWith("/") ? packagePath : `${packagePath}/`;
          if (file.startsWith(packagePrefix)) {
            return file.slice(packagePrefix.length);
          }
          // Check if file starts with the package directory name pattern
          const match = file.match(new RegExp(`^(?:.*?/)?${packageBase}/(.+)$`));
          if (match?.[1]) {
            return match[1];
          }
          return file;
        });
        args.push(...relativeFiles);
      } else {
        args.push(".");
      }

      const biomePath = findBiomeExecutable(packagePath);
      if (!biomePath) {
        reject(new Error("Biome executable not found"));
        return;
      }

      const biome = spawn(biomePath, args, {
        cwd: packagePath,
        timeout: options.timeout,
        shell: process.platform === "win32",
      });

      let stdout = "";

      biome.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      // stderr is intentionally not captured - Biome outputs warnings there
      biome.stderr.on("data", () => {
        // Ignore stderr (contains unstable warning)
      });

      biome.on("close", () => {
        // Biome exits with 1 when there are errors, but JSON is still valid
        // Extract JSON from output (skip the unstable warning on stderr)
        const jsonMatch = stdout.match(/^\{[\s\S]*\}$/m);
        if (jsonMatch) {
          resolve(jsonMatch[0]);
        } else if (stdout.includes("{")) {
          // Try to extract JSON from mixed output
          const jsonStart = stdout.indexOf("{");
          const jsonEnd = stdout.lastIndexOf("}");
          if (jsonStart !== -1 && jsonEnd !== -1) {
            resolve(stdout.slice(jsonStart, jsonEnd + 1));
          } else {
            resolve(stdout);
          }
        } else {
          resolve(stdout);
        }
      });

      biome.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse Biome JSON output into ValidationIssue array
   */
  parseBiomeOutput(output: string, packagePath: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!output || output.trim() === "") {
      return issues;
    }

    try {
      const result: BiomeOutput = JSON.parse(output);

      if (!result.diagnostics || !Array.isArray(result.diagnostics)) {
        return issues;
      }

      for (const diagnostic of result.diagnostics) {
        // Skip format diagnostics (we only want lint issues)
        if (diagnostic.category === "format") {
          continue;
        }

        // Get file path
        let filePath = diagnostic.location?.path?.file ?? packagePath;
        if (path.isAbsolute(filePath)) {
          filePath = path.relative(packagePath, filePath);
        }

        // Calculate line/column from span if available
        let line = 1;
        let column = 1;
        if (diagnostic.location?.span && diagnostic.location?.sourceCode) {
          const sourceCode = diagnostic.location.sourceCode;
          const spanStart = diagnostic.location.span[0];
          // Count newlines before span to get line number
          const beforeSpan = sourceCode.slice(0, spanStart);
          line = (beforeSpan.match(/\n/g) || []).length + 1;
          // Column is position after last newline
          const lastNewline = beforeSpan.lastIndexOf("\n");
          column = lastNewline === -1 ? spanStart + 1 : spanStart - lastNewline;
        }

        // Get message content
        const message =
          diagnostic.message?.[0]?.content || diagnostic.description || "Unknown lint error";

        issues.push({
          file: filePath,
          line,
          column,
          message,
          severity: diagnostic.severity === "warning" ? "warning" : "error",
          source: "biome",
          code: diagnostic.category || undefined,
        });
      }
    } catch {
      // Invalid JSON - return empty issues
      return issues;
    }

    return issues;
  }

  /**
   * Run ESLint and return parsed results
   */
  private async runEslint(
    packagePath: string,
    options: Required<Omit<LintOptions, "linter">> & { linter?: LinterType },
    startTime: number
  ): Promise<LintResult> {
    try {
      const output = await this.executeEslint(packagePath, options);
      const issues = this.parseEslintOutput(output, packagePath);
      const errorCount = issues.filter((i) => i.severity === "error").length;

      return {
        success: errorCount === 0,
        issues,
        timeMs: Date.now() - startTime,
        filesChecked: options.files?.length || 0,
        linter: "eslint",
      };
    } catch (error) {
      // If eslint fails, try to parse the output from the error
      if (error instanceof LinterError) {
        const issues = this.parseEslintOutput(error.output, packagePath);
        const errorCount = issues.filter((i) => i.severity === "error").length;

        return {
          success: errorCount === 0,
          issues,
          timeMs: Date.now() - startTime,
          filesChecked: options.files?.length || 0,
          linter: "eslint",
        };
      }
      throw error;
    }
  }

  /**
   * Execute ESLint and return raw output
   */
  private async executeEslint(
    packagePath: string,
    options: Required<Omit<LintOptions, "linter">> & { linter?: LinterType }
  ): Promise<string> {
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

      // Add files to lint (make paths relative to packagePath)
      if (options.files && options.files.length > 0) {
        const relativeFiles = options.files.map((file) => {
          // If file is absolute or starts with packagePath, make it relative
          if (path.isAbsolute(file)) {
            return path.relative(packagePath, file);
          }
          // If file path includes packagePath prefix, strip it
          const packageBase = path.basename(packagePath);
          const packagePrefix = packagePath.endsWith("/") ? packagePath : `${packagePath}/`;
          if (file.startsWith(packagePrefix)) {
            return file.slice(packagePrefix.length);
          }
          // Check if file starts with the package directory name pattern
          const match = file.match(new RegExp(`^(?:.*?/)?${packageBase}/(.+)$`));
          if (match?.[1]) {
            return match[1];
          }
          return file;
        });
        args.push(...relativeFiles);
      } else {
        args.push(".");
      }

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
          reject(new LinterError(stdout || stderr, code ?? 1));
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
  parseEslintOutput(output: string, packagePath: string): ValidationIssue[] {
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
 * Error class for linter execution failures
 */
class LinterError extends Error {
  constructor(
    public readonly output: string,
    public readonly exitCode: number
  ) {
    super(`Linter exited with code ${exitCode}`);
    this.name = "LinterError";
  }
}

/**
 * Find Biome executable - checks local node_modules first
 */
function findBiomeExecutable(packagePath: string): string | null {
  // Check local node_modules
  const localBiome = path.join(packagePath, "node_modules", ".bin", "biome");
  if (fs.existsSync(localBiome)) {
    return localBiome;
  }

  // Check parent directories for monorepo setups
  let dir = packagePath;
  for (let i = 0; i < 5; i++) {
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
    const parentBiome = path.join(dir, "node_modules", ".bin", "biome");
    if (fs.existsSync(parentBiome)) {
      return parentBiome;
    }
  }

  return null;
}

/**
 * Find ESLint executable - checks local node_modules first
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
