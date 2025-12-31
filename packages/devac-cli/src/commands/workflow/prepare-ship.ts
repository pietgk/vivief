/**
 * Workflow Prepare Ship Command
 *
 * Full pre-ship validation:
 * - Branch validation (not on main/master)
 * - Remote sync status
 * - Full validation (typecheck, lint, test, build)
 * - Changeset requirement check
 */

import { execSync } from "node:child_process";
import * as path from "node:path";
import {
  getCurrentBranch,
  getDefaultBranch,
  getGitRoot,
  getGitStatus,
  hasUncommittedChanges,
  isGitRepo,
} from "../../utils/git-utils.js";
import { checkChangesetCommand } from "./check-changeset.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PrepareShipOptions {
  /** Path to repository root */
  path?: string;
  /** Skip validation steps */
  skipValidation?: boolean;
  /** Skip test run */
  skipTests?: boolean;
  /** Skip build */
  skipBuild?: boolean;
  /** Output as JSON */
  json?: boolean;
}

export interface ValidationStepResult {
  passed: boolean;
  skipped?: boolean;
  duration?: number;
  output?: string;
}

export interface PrepareShipResult {
  success: boolean;
  error?: string;

  /** Whether ready to ship */
  ready: boolean;
  /** Blocking reasons if not ready */
  blockers: string[];
  /** Non-blocking suggestions */
  suggestions: string[];

  /** Branch information */
  branch: string;
  defaultBranch: string;
  isDefaultBranch: boolean;

  /** Remote tracking status */
  hasRemote: boolean;
  commitsAhead: number;
  commitsBehind: number;

  /** Uncommitted changes */
  hasUncommittedChanges: boolean;
  stagedFiles: number;
  unstagedFiles: number;

  /** Validation results */
  validation: {
    typecheck: ValidationStepResult;
    lint: ValidationStepResult;
    test: ValidationStepResult;
    build: ValidationStepResult;
  };

  /** Changeset status */
  changeset: {
    needed: boolean;
    exists: boolean;
    packagesNeedingChangeset: string[];
  };

  /** Formatted output for CLI */
  formatted?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a validation command and return result
 */
function runValidationStep(command: string, cwd: string, skip: boolean): ValidationStepResult {
  if (skip) {
    return { passed: true, skipped: true };
  }

  const start = Date.now();
  try {
    execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string };
    const output = err.stdout || err.stderr || "";
    return {
      passed: false,
      duration: Date.now() - start,
      output: output.slice(0, 1000),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prepare for shipping (pre-PR validation)
 */
export async function prepareShipCommand(options: PrepareShipOptions): Promise<PrepareShipResult> {
  const cwd = options.path ? path.resolve(options.path) : process.cwd();
  const skipValidation = options.skipValidation ?? false;

  // Verify git repo
  if (!isGitRepo(cwd)) {
    return {
      success: false,
      error: "Not a git repository",
      ready: false,
      blockers: ["Not a git repository"],
      suggestions: [],
      branch: "",
      defaultBranch: "",
      isDefaultBranch: false,
      hasRemote: false,
      commitsAhead: 0,
      commitsBehind: 0,
      hasUncommittedChanges: false,
      stagedFiles: 0,
      unstagedFiles: 0,
      validation: {
        typecheck: { passed: false },
        lint: { passed: false },
        test: { passed: false },
        build: { passed: false },
      },
      changeset: {
        needed: false,
        exists: false,
        packagesNeedingChangeset: [],
      },
    };
  }

  const repoRoot = getGitRoot(cwd) || cwd;
  const branch = getCurrentBranch(repoRoot);
  const defaultBranch = getDefaultBranch(repoRoot);
  const gitStatus = getGitStatus(repoRoot);
  const uncommitted = hasUncommittedChanges(repoRoot);

  const blockers: string[] = [];
  const suggestions: string[] = [];

  // Check if on default branch
  const isDefaultBranch = branch === defaultBranch;
  if (isDefaultBranch) {
    blockers.push(`Currently on ${defaultBranch} branch - create a feature branch first`);
  }

  // Check for uncommitted changes
  if (uncommitted) {
    if (gitStatus.staged.length > 0) {
      blockers.push(`${gitStatus.staged.length} staged changes need to be committed`);
    }
    if (gitStatus.unstaged.length > 0) {
      suggestions.push(
        `${gitStatus.unstaged.length} unstaged changes - consider committing or stashing`
      );
    }
  }

  // Check if behind remote
  if (gitStatus.behind > 0) {
    blockers.push(`Branch is ${gitStatus.behind} commits behind remote - pull first`);
  }

  // Run validation steps
  const typecheckResult = runValidationStep("pnpm typecheck", repoRoot, skipValidation);
  const lintResult = runValidationStep("pnpm lint", repoRoot, skipValidation);
  const testResult = runValidationStep(
    "pnpm test",
    repoRoot,
    skipValidation || options.skipTests === true
  );
  const buildResult = runValidationStep(
    "pnpm build",
    repoRoot,
    skipValidation || options.skipBuild === true
  );

  if (!typecheckResult.passed && !typecheckResult.skipped) {
    blockers.push("Typecheck failed");
  }
  if (!lintResult.passed && !lintResult.skipped) {
    blockers.push("Lint check failed");
  }
  if (!testResult.passed && !testResult.skipped) {
    blockers.push("Tests failed");
  }
  if (!buildResult.passed && !buildResult.skipped) {
    blockers.push("Build failed");
  }

  // Check changeset requirement
  const changesetResult = await checkChangesetCommand({
    path: repoRoot,
    base: defaultBranch,
    json: true,
  });

  if (changesetResult.needsChangeset) {
    blockers.push(`Changeset needed for: ${changesetResult.packagesNeedingChangeset.join(", ")}`);
  }

  const ready = blockers.length === 0;

  const result: PrepareShipResult = {
    success: true,
    ready,
    blockers,
    suggestions,
    branch,
    defaultBranch,
    isDefaultBranch,
    hasRemote: gitStatus.hasRemote,
    commitsAhead: gitStatus.ahead,
    commitsBehind: gitStatus.behind,
    hasUncommittedChanges: uncommitted,
    stagedFiles: gitStatus.staged.length,
    unstagedFiles: gitStatus.unstaged.length,
    validation: {
      typecheck: typecheckResult,
      lint: lintResult,
      test: testResult,
      build: buildResult,
    },
    changeset: {
      needed: changesetResult.needsChangeset,
      exists: changesetResult.existingChangesets.length > 0,
      packagesNeedingChangeset: changesetResult.packagesNeedingChangeset,
    },
  };

  // Format output
  if (!options.json) {
    result.formatted = formatPrepareShipResult(result);
  }

  return result;
}

/**
 * Format result for CLI output
 */
function formatPrepareShipResult(result: PrepareShipResult): string {
  const lines: string[] = [];

  lines.push("Prepare Ship Check");
  lines.push("─".repeat(40));

  // Branch info
  lines.push(`  Branch:  ${result.branch}`);
  lines.push(`  Base:    ${result.defaultBranch}`);
  if (result.hasRemote) {
    if (result.commitsAhead > 0 || result.commitsBehind > 0) {
      lines.push(`  Sync:    ${result.commitsAhead} ahead, ${result.commitsBehind} behind`);
    } else {
      lines.push("  Sync:    Up to date");
    }
  } else {
    lines.push("  Sync:    No remote tracking");
  }

  // Uncommitted changes
  if (result.hasUncommittedChanges) {
    lines.push("");
    lines.push("  Uncommitted changes:");
    if (result.stagedFiles > 0) {
      lines.push(`    Staged:   ${result.stagedFiles} file(s)`);
    }
    if (result.unstagedFiles > 0) {
      lines.push(`    Unstaged: ${result.unstagedFiles} file(s)`);
    }
  }

  // Validation
  lines.push("");
  lines.push("  Validation:");
  lines.push(`    Typecheck: ${formatValidationStatus(result.validation.typecheck)}`);
  lines.push(`    Lint:      ${formatValidationStatus(result.validation.lint)}`);
  lines.push(`    Tests:     ${formatValidationStatus(result.validation.test)}`);
  lines.push(`    Build:     ${formatValidationStatus(result.validation.build)}`);

  // Changeset
  lines.push("");
  lines.push("  Changeset:");
  if (result.changeset.needed) {
    lines.push("    Status: NEEDED");
    lines.push(`    Packages: ${result.changeset.packagesNeedingChangeset.join(", ")}`);
  } else if (result.changeset.exists) {
    lines.push("    Status: Exists (covers all changes)");
  } else {
    lines.push("    Status: Not needed");
  }

  // Blockers
  if (result.blockers.length > 0) {
    lines.push("");
    lines.push("  Blockers:");
    for (const blocker of result.blockers) {
      lines.push(`    - ${blocker}`);
    }
  }

  // Suggestions
  if (result.suggestions.length > 0) {
    lines.push("");
    lines.push("  Suggestions:");
    for (const suggestion of result.suggestions) {
      lines.push(`    - ${suggestion}`);
    }
  }

  // Overall status
  lines.push("");
  lines.push(`  Ready to ship: ${result.ready ? "YES" : "NO"}`);

  return lines.join("\n");
}

/**
 * Format validation step status
 */
function formatValidationStatus(step: ValidationStepResult): string {
  if (step.skipped) {
    return "skipped";
  }
  if (step.passed) {
    const duration = step.duration ? ` (${(step.duration / 1000).toFixed(1)}s)` : "";
    return `pass${duration}`;
  }
  return "FAIL";
}
