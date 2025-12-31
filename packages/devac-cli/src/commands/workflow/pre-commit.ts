/**
 * Workflow Pre-Commit Command
 *
 * Validates commit readiness:
 * - Checks staged files
 * - Detects sensitive files
 * - Runs lint and typecheck validation
 */

import { execSync } from "node:child_process";
import * as path from "node:path";
import {
  filterSensitiveFiles,
  getGitRoot,
  getGitStatus,
  isGitRepo,
} from "../../utils/git-utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PreCommitOptions {
  /** Path to repository root */
  path?: string;
  /** Skip lint check */
  skipLint?: boolean;
  /** Skip typecheck */
  skipTypes?: boolean;
  /** Output as JSON */
  json?: boolean;
}

export interface ValidationResult {
  passed: boolean;
  errors?: number;
  warnings?: number;
  output?: string;
}

export interface PreCommitResult {
  success: boolean;
  error?: string;

  /** Whether ready to commit */
  ready: boolean;
  /** Blocking reasons if not ready */
  blockers: string[];

  /** Staged files */
  staged: string[];
  /** Unstaged modified files */
  unstaged: string[];
  /** Untracked files */
  untracked: string[];

  /** Validation results */
  validation: {
    lint: ValidationResult;
    types: ValidationResult;
  };

  /** Sensitive files detected in staging */
  sensitiveFiles: string[];
  /** Warnings that should be addressed */
  warnings: string[];

  /** Formatted output for CLI */
  formatted?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run lint check
 */
function runLintCheck(cwd: string): ValidationResult {
  try {
    execSync("pnpm lint", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { passed: true };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string };
    const output = err.stdout || err.stderr || "";

    // Count errors and warnings from output
    const errorMatches = output.match(/error/gi) || [];
    const warningMatches = output.match(/warning/gi) || [];

    return {
      passed: false,
      errors: errorMatches.length,
      warnings: warningMatches.length,
      output: output.slice(0, 1000), // Truncate for readability
    };
  }
}

/**
 * Run typecheck
 */
function runTypecheck(cwd: string): ValidationResult {
  try {
    execSync("pnpm typecheck", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { passed: true };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string };
    const output = err.stdout || err.stderr || "";

    // Count errors from TypeScript output
    const errorMatches = output.match(/error TS\d+/g) || [];

    return {
      passed: false,
      errors: errorMatches.length,
      output: output.slice(0, 1000),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check pre-commit readiness
 */
export async function preCommitCommand(options: PreCommitOptions): Promise<PreCommitResult> {
  const cwd = options.path ? path.resolve(options.path) : process.cwd();

  // Verify git repo
  if (!isGitRepo(cwd)) {
    return {
      success: false,
      error: "Not a git repository",
      ready: false,
      blockers: ["Not a git repository"],
      staged: [],
      unstaged: [],
      untracked: [],
      validation: {
        lint: { passed: false },
        types: { passed: false },
      },
      sensitiveFiles: [],
      warnings: [],
    };
  }

  const repoRoot = getGitRoot(cwd) || cwd;
  const status = getGitStatus(repoRoot);
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Check for staged files
  if (status.staged.length === 0) {
    blockers.push("No files staged for commit");
  }

  // Check for sensitive files
  const sensitiveFiles = filterSensitiveFiles(status.staged);
  if (sensitiveFiles.length > 0) {
    blockers.push(`Sensitive files staged: ${sensitiveFiles.join(", ")}`);
  }

  // Run validation (unless skipped)
  const lintResult: ValidationResult = options.skipLint ? { passed: true } : runLintCheck(repoRoot);

  const typesResult: ValidationResult = options.skipTypes
    ? { passed: true }
    : runTypecheck(repoRoot);

  if (!lintResult.passed) {
    blockers.push(`Lint check failed with ${lintResult.errors || "unknown"} errors`);
  }

  if (!typesResult.passed) {
    blockers.push(`Typecheck failed with ${typesResult.errors || "unknown"} errors`);
  }

  // Add warnings
  if (status.unstaged.length > 0) {
    warnings.push(`${status.unstaged.length} modified files not staged`);
  }

  if (status.untracked.length > 0) {
    warnings.push(`${status.untracked.length} untracked files`);
  }

  const ready = blockers.length === 0;

  const result: PreCommitResult = {
    success: true,
    ready,
    blockers,
    staged: status.staged,
    unstaged: status.unstaged,
    untracked: status.untracked,
    validation: {
      lint: lintResult,
      types: typesResult,
    },
    sensitiveFiles,
    warnings,
  };

  // Format output
  if (!options.json) {
    result.formatted = formatPreCommitResult(result);
  }

  return result;
}

/**
 * Format result for CLI output
 */
function formatPreCommitResult(result: PreCommitResult): string {
  const lines: string[] = [];

  lines.push("Pre-Commit Check");
  lines.push("─".repeat(40));

  // Files
  lines.push(`  Staged:    ${result.staged.length} file(s)`);
  if (result.staged.length > 0 && result.staged.length <= 10) {
    for (const file of result.staged) {
      lines.push(`             - ${file}`);
    }
  }

  // Validation
  lines.push("");
  lines.push("  Validation:");
  lines.push(`    Lint:      ${result.validation.lint.passed ? "pass" : "FAIL"}`);
  lines.push(`    Types:     ${result.validation.types.passed ? "pass" : "FAIL"}`);

  // Blockers
  if (result.blockers.length > 0) {
    lines.push("");
    lines.push("  Blockers:");
    for (const blocker of result.blockers) {
      lines.push(`    - ${blocker}`);
    }
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("  Warnings:");
    for (const warning of result.warnings) {
      lines.push(`    - ${warning}`);
    }
  }

  // Sensitive files
  if (result.sensitiveFiles.length > 0) {
    lines.push("");
    lines.push("  Sensitive files detected:");
    for (const file of result.sensitiveFiles) {
      lines.push(`    - ${file}`);
    }
  }

  // Overall status
  lines.push("");
  lines.push(`  Ready: ${result.ready ? "YES" : "NO"}`);

  return lines.join("\n");
}
