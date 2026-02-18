/**
 * Validation Test Harness
 *
 * Core utilities for integration and E2E testing of the validation system.
 * Provides workspace setup, validation execution, and assertion helpers.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { ValidationCoordinatorResult, ValidationMode } from "../validation/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { type GitSimulator, createGitSimulator } from "./git-simulator.js";
import {
  type DiagnosticsCounts,
  type HookOutput,
  type StopHookOutput,
  extractReminderContent,
  parseDiagnosticsCounts,
  safeValidateHookOutput,
  safeValidateStopHookOutput,
  validateHookOutput,
} from "./hook-output-schema.js";

/**
 * Workspace context created by the harness.
 */
export interface WorkspaceContext {
  /** Root directory of the temporary workspace */
  rootDir: string;
  /** Map of fixture names to their paths in the workspace */
  packages: Record<string, string>;
  /** Git simulator for the workspace */
  git: GitSimulator;
}

/**
 * Options for creating a temporary workspace.
 */
export interface CreateWorkspaceOptions {
  /** Fixture names to copy into the workspace */
  fixtures: string[];
  /** Base path where fixtures are located */
  fixturesBasePath?: string;
  /** Whether to initialize Git in the workspace */
  initGit?: boolean;
  /** Whether to create an initial commit */
  createInitialCommit?: boolean;
}

/**
 * Options for running validation.
 */
export interface ValidationRunOptions {
  /** Path to the package to validate */
  packagePath: string;
  /** Changed files to validate (relative to package) */
  changedFiles?: string[];
  /** Validation mode */
  mode?: ValidationMode;
  /** Whether to skip typecheck */
  skipTypecheck?: boolean;
  /** Whether to skip lint */
  skipLint?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Result of hook output assertion.
 */
export interface HookAssertionResult {
  valid: boolean;
  output: HookOutput | StopHookOutput | null;
  error?: string;
  counts: DiagnosticsCounts;
}

/**
 * Validation Test Harness for integration and E2E tests.
 */
export class ValidationTestHarness {
  private workspaces: string[] = [];
  private fixturesBasePath: string;

  constructor(fixturesBasePath?: string) {
    // Default to fixtures-validation package location
    this.fixturesBasePath =
      fixturesBasePath || path.resolve(__dirname, "../../../../fixtures-validation");
  }

  /**
   * Create a temporary workspace with specified fixtures.
   */
  async createTempWorkspace(options: CreateWorkspaceOptions): Promise<WorkspaceContext> {
    const { fixtures, initGit = true, createInitialCommit = true } = options;
    const basePath = options.fixturesBasePath || this.fixturesBasePath;

    // Create temp directory
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-validation-test-"));
    this.workspaces.push(rootDir);

    const packages: Record<string, string> = {};
    const git = createGitSimulator(rootDir);

    // Initialize Git first if requested
    if (initGit) {
      await git.init();
    }

    // Copy fixtures into workspace
    for (const fixture of fixtures) {
      const fixtureSrc = path.join(basePath, fixture);
      const fixtureDest = path.join(rootDir, fixture);

      // Check if fixture exists
      try {
        await fs.access(fixtureSrc);
      } catch {
        throw new Error(`Fixture not found: ${fixtureSrc}`);
      }

      await this.copyDirectory(fixtureSrc, fixtureDest);
      packages[fixture] = fixtureDest;
    }

    // Create initial commit if requested (and git was initialized)
    if (initGit && createInitialCommit) {
      await git.stageAll();
      await git.commit("Initial commit with fixtures");
    }

    return { rootDir, packages, git };
  }

  /**
   * Copy a directory recursively.
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and .git
        if (entry.name === "node_modules" || entry.name === ".git") {
          continue;
        }
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Parse and validate hook JSON output.
   * Supports both UserPromptSubmit (hookSpecificOutput) and Stop (stopReason) formats.
   */
  parseHookOutput(stdout: string): HookAssertionResult {
    const trimmed = stdout.trim();

    // Empty output is valid (indicates no issues)
    if (trimmed === "") {
      return {
        valid: true,
        output: null,
        counts: { errors: 0, warnings: 0 },
      };
    }

    // Try to parse as JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      return {
        valid: false,
        output: null,
        error: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
        counts: { errors: 0, warnings: 0 },
      };
    }

    // Try Stop hook schema first (stopReason)
    const stopResult = safeValidateStopHookOutput(parsed);
    if (stopResult.success) {
      const counts = parseDiagnosticsCounts(stopResult.data.stopReason);
      return {
        valid: true,
        output: stopResult.data,
        counts,
      };
    }

    // Try UserPromptSubmit hook schema (hookSpecificOutput)
    const result = safeValidateHookOutput(parsed);
    if (result.success) {
      const content = extractReminderContent(result.data.hookSpecificOutput.additionalContext);
      const counts = parseDiagnosticsCounts(content);
      return {
        valid: true,
        output: result.data,
        counts,
      };
    }

    return {
      valid: false,
      output: null,
      error: `Schema validation failed: ${result.error.message}`,
      counts: { errors: 0, warnings: 0 },
    };
  }

  /**
   * Assert hook output is valid and matches expected format.
   * Throws if validation fails.
   */
  assertHookOutputValid(stdout: string): HookOutput {
    const trimmed = stdout.trim();

    if (trimmed === "") {
      throw new Error("Hook output is empty - expected JSON output");
    }

    const parsed = JSON.parse(trimmed);
    return validateHookOutput(parsed);
  }

  /**
   * Assert hook output is empty (indicates no issues found).
   * Throws if output is not empty.
   */
  assertHookOutputEmpty(stdout: string): void {
    const trimmed = stdout.trim();
    if (trimmed !== "") {
      throw new Error(`Expected empty hook output, got: ${trimmed}`);
    }
  }

  /**
   * Assert diagnostics counts match expected values.
   */
  assertDiagnosticsCounts(actual: DiagnosticsCounts, expected: Partial<DiagnosticsCounts>): void {
    if (expected.errors !== undefined && actual.errors !== expected.errors) {
      throw new Error(`Expected ${expected.errors} errors, got ${actual.errors}`);
    }
    if (expected.warnings !== undefined && actual.warnings !== expected.warnings) {
      throw new Error(`Expected ${expected.warnings} warnings, got ${actual.warnings}`);
    }
  }

  /**
   * Assert validation result has expected issues.
   */
  assertValidationResult(
    result: ValidationCoordinatorResult,
    expected: {
      success?: boolean;
      mode?: ValidationMode;
      typecheckErrors?: number;
      lintErrors?: number;
      testFailures?: number;
      totalIssues?: number;
    }
  ): void {
    if (expected.success !== undefined && result.success !== expected.success) {
      throw new Error(`Expected success=${expected.success}, got ${result.success}`);
    }

    if (expected.mode !== undefined && result.mode !== expected.mode) {
      throw new Error(`Expected mode=${expected.mode}, got ${result.mode}`);
    }

    if (expected.typecheckErrors !== undefined) {
      const actual = result.typecheck?.issues.filter((i) => i.severity === "error").length ?? 0;
      if (actual !== expected.typecheckErrors) {
        throw new Error(`Expected ${expected.typecheckErrors} typecheck errors, got ${actual}`);
      }
    }

    if (expected.lintErrors !== undefined) {
      const actual = result.lint?.issues.filter((i) => i.severity === "error").length ?? 0;
      if (actual !== expected.lintErrors) {
        throw new Error(`Expected ${expected.lintErrors} lint errors, got ${actual}`);
      }
    }

    if (expected.testFailures !== undefined) {
      const actual = result.tests?.failed ?? 0;
      if (actual !== expected.testFailures) {
        throw new Error(`Expected ${expected.testFailures} test failures, got ${actual}`);
      }
    }

    if (expected.totalIssues !== undefined && result.totalIssues !== expected.totalIssues) {
      throw new Error(`Expected ${expected.totalIssues} total issues, got ${result.totalIssues}`);
    }
  }

  /**
   * Write a file in the workspace (for modifying fixtures during tests).
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  /**
   * Read a file from the workspace.
   */
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf-8");
  }

  /**
   * Check if a file exists.
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up all temporary workspaces created by this harness.
   */
  async cleanup(): Promise<void> {
    for (const workspace of this.workspaces) {
      try {
        await fs.rm(workspace, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    this.workspaces = [];
  }

  /**
   * Clean up a specific workspace.
   */
  async cleanupWorkspace(rootDir: string): Promise<void> {
    try {
      await fs.rm(rootDir, { recursive: true, force: true });
      this.workspaces = this.workspaces.filter((w) => w !== rootDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create a ValidationTestHarness instance.
 */
export function createValidationTestHarness(fixturesBasePath?: string): ValidationTestHarness {
  return new ValidationTestHarness(fixturesBasePath);
}

/**
 * Get the default fixtures base path.
 * This resolves to the fixtures-validation package in the monorepo.
 */
export function getDefaultFixturesBasePath(): string {
  // Resolve from devac-core package location
  return path.resolve(__dirname, "../../../../fixtures-validation");
}
