/**
 * Cleanup Command
 *
 * Interactive cleanup of stale resources:
 * - Stale branches (merged PRs, closed PRs, deleted remote, inactive)
 * - Stale worktrees (closed issues, merged PRs)
 *
 * Usage:
 *   devac cleanup              # Interactive menu (default)
 *   devac cleanup --dry-run    # Show what would be cleaned
 *   devac cleanup --branches   # Clean only branches
 *   devac cleanup --worktrees  # Clean only worktrees
 */

import * as readline from "node:readline";
import {
  type CleanupAction,
  type CleanupDiagnostics,
  getCleanupDiagnostics,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { colors } from "../utils/colors.js";
import { getGitRoot } from "../utils/git-utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for cleanup command.
 */
export interface CleanupOptions {
  /** Path to check (defaults to cwd) */
  path?: string;

  /** Dry run - show what would be cleaned without making changes */
  dryRun?: boolean;

  /** Clean only branches (skip worktrees) */
  branches?: boolean;

  /** Clean only worktrees (skip branches) */
  worktrees?: boolean;

  /** Output as JSON */
  json?: boolean;

  /** Skip interactive prompts (still shows summary + Y/n) */
  yes?: boolean;
}

/**
 * Result from cleanup command.
 */
export interface CleanupResult {
  success: boolean;

  /** Diagnostics that were found */
  diagnostics: CleanupDiagnostics;

  /** Actions that were executed */
  executedActions: CleanupAction[];

  /** Actions that were skipped */
  skippedActions: CleanupAction[];

  /** Errors that occurred during cleanup */
  errors: string[];

  /** Formatted output for display */
  formatted?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Prompts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a readline interface for prompts.
 */
function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a yes/no question.
 */
async function askYesNo(rl: readline.Interface, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} [Y/n]: `, (answer) => {
      const normalized = answer.toLowerCase().trim();
      // Default to yes if empty
      resolve(normalized === "" || normalized === "y" || normalized === "yes");
    });
  });
}

/**
 * Display interactive menu and get selected actions.
 */
async function showInteractiveMenu(
  rl: readline.Interface,
  diagnostics: CleanupDiagnostics
): Promise<CleanupAction[]> {
  const selectedActions: CleanupAction[] = [];

  console.log("");
  console.log(colors.bold("Stale Resources Found"));
  console.log("─".repeat(50));

  // Stale branches
  if (diagnostics.staleBranches.length > 0) {
    console.log("");
    console.log(colors.yellow(`Local Branches (${diagnostics.staleBranches.length}):`));
    for (const branch of diagnostics.staleBranches) {
      const safeStr = branch.safeToDelete ? colors.green("safe") : colors.yellow("review");
      const reasonStr = formatReason(branch.reason);
      console.log(`  ${branch.name} - ${reasonStr} [${safeStr}]`);
      if (branch.hasUncommittedChanges) {
        console.log(`    ${colors.red("⚠ Has uncommitted changes")}`);
      }
    }
  }

  // Stale remote branches
  if (diagnostics.staleRemoteBranches.length > 0) {
    console.log("");
    console.log(colors.yellow(`Remote Branches (${diagnostics.staleRemoteBranches.length}):`));
    for (const branch of diagnostics.staleRemoteBranches) {
      const reasonStr = formatReason(branch.reason);
      console.log(`  ${branch.ref} - ${reasonStr}`);
    }
  }

  // Stale worktrees
  if (diagnostics.staleWorktrees.length > 0) {
    console.log("");
    console.log(colors.yellow(`Worktrees (${diagnostics.staleWorktrees.length}):`));
    for (const wt of diagnostics.staleWorktrees) {
      const safeStr = wt.safeToDelete ? colors.green("safe") : colors.yellow("review");
      const reasonStr = formatReason(wt.reason);
      console.log(`  ${wt.name} - ${reasonStr} [${safeStr}]`);
      if (wt.hasUncommittedChanges) {
        console.log(`    ${colors.red("⚠ Has uncommitted changes")}`);
      }
    }
  }

  console.log("");

  // Ask about each category
  // Safe branches
  const safeBranchActions = diagnostics.actions.filter((a) => a.type === "delete-branch" && a.safe);
  if (safeBranchActions.length > 0) {
    const confirm = await askYesNo(rl, `Delete ${safeBranchActions.length} safe local branch(es)?`);
    if (confirm) {
      selectedActions.push(...safeBranchActions);
    }
  }

  // Unsafe branches
  const unsafeBranchActions = diagnostics.actions.filter(
    (a) => a.type === "delete-branch" && !a.safe
  );
  if (unsafeBranchActions.length > 0) {
    console.log(colors.yellow("\nUnsafe branches require force delete:"));
    for (const action of unsafeBranchActions) {
      console.log(`  ${action.target}`);
    }
    const confirm = await askYesNo(
      rl,
      `Force delete ${unsafeBranchActions.length} branch(es)? (may lose work)`
    );
    if (confirm) {
      selectedActions.push(...unsafeBranchActions);
    }
  }

  // Remote prune
  const pruneActions = diagnostics.actions.filter((a) => a.type === "prune-remote");
  if (pruneActions.length > 0) {
    const confirm = await askYesNo(rl, "Prune stale remote tracking branches?");
    if (confirm) {
      selectedActions.push(...pruneActions);
    }
  }

  // Safe worktrees
  const safeWorktreeActions = diagnostics.actions.filter(
    (a) => a.type === "delete-worktree" && a.safe
  );
  if (safeWorktreeActions.length > 0) {
    const confirm = await askYesNo(rl, `Remove ${safeWorktreeActions.length} safe worktree(s)?`);
    if (confirm) {
      selectedActions.push(...safeWorktreeActions);
    }
  }

  // Unsafe worktrees
  const unsafeWorktreeActions = diagnostics.actions.filter(
    (a) => a.type === "delete-worktree" && !a.safe
  );
  if (unsafeWorktreeActions.length > 0) {
    console.log(colors.yellow("\nUnsafe worktrees require force remove:"));
    for (const action of unsafeWorktreeActions) {
      console.log(`  ${action.target}`);
    }
    const confirm = await askYesNo(
      rl,
      `Force remove ${unsafeWorktreeActions.length} worktree(s)? (may lose work)`
    );
    if (confirm) {
      selectedActions.push(...unsafeWorktreeActions);
    }
  }

  return selectedActions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a staleness reason for display.
 */
function formatReason(reason: string): string {
  switch (reason) {
    case "pr-merged":
      return colors.green("PR merged");
    case "pr-closed":
      return colors.yellow("PR closed");
    case "issue-closed":
      return colors.green("issue closed");
    case "deleted-remote":
      return colors.yellow("deleted on remote");
    case "no-activity":
      return colors.dim("inactive 30+ days");
    default:
      return reason;
  }
}

/**
 * Format dry-run output.
 */
function formatDryRun(diagnostics: CleanupDiagnostics): string {
  const lines: string[] = [];

  lines.push(colors.bold("Cleanup Dry Run"));
  lines.push("─".repeat(50));
  lines.push("");

  if (
    diagnostics.staleBranches.length === 0 &&
    diagnostics.staleRemoteBranches.length === 0 &&
    diagnostics.staleWorktrees.length === 0
  ) {
    lines.push(colors.green("✓ No stale resources found"));
    return lines.join("\n");
  }

  // Summary
  lines.push(colors.bold("Summary:"));
  lines.push(
    `  Local branches:  ${diagnostics.staleBranches.length} stale (${diagnostics.summary.safeToDeleteBranches} safe to delete)`
  );
  lines.push(`  Remote branches: ${diagnostics.staleRemoteBranches.length} stale`);
  lines.push(
    `  Worktrees:       ${diagnostics.staleWorktrees.length} stale (${diagnostics.summary.safeToDeleteWorktrees} safe to delete)`
  );
  lines.push("");

  // Actions
  lines.push(colors.bold("Actions that would be taken:"));
  for (const action of diagnostics.actions) {
    const safeStr = action.safe ? colors.green("[safe]") : colors.yellow("[force]");
    lines.push(`  ${safeStr} ${action.command}`);
  }

  lines.push("");
  lines.push(colors.dim("Run without --dry-run to execute these actions"));

  return lines.join("\n");
}

/**
 * Format JSON output.
 */
function formatJson(result: CleanupResult): string {
  return JSON.stringify(
    {
      success: result.success,
      summary: result.diagnostics.summary,
      staleBranches: result.diagnostics.staleBranches,
      staleRemoteBranches: result.diagnostics.staleRemoteBranches,
      staleWorktrees: result.diagnostics.staleWorktrees,
      actions: result.diagnostics.actions,
      executedActions: result.executedActions,
      skippedActions: result.skippedActions,
      errors: result.errors,
    },
    null,
    2
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a cleanup action.
 */
async function executeAction(
  action: CleanupAction,
  cwd: string
): Promise<{ success: boolean; error?: string }> {
  const { execSync } = await import("node:child_process");
  try {
    execSync(action.command, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute cleanup command.
 */
export async function cleanupCommand(options: CleanupOptions): Promise<CleanupResult> {
  const cwd = options.path ?? process.cwd();

  // Find git root
  const gitRoot = getGitRoot(cwd);
  if (!gitRoot) {
    return {
      success: false,
      diagnostics: {
        path: cwd,
        staleBranches: [],
        staleRemoteBranches: [],
        staleWorktrees: [],
        actions: [],
        summary: {
          totalStaleBranches: 0,
          safeToDeleteBranches: 0,
          totalStaleWorktrees: 0,
          safeToDeleteWorktrees: 0,
        },
      },
      executedActions: [],
      skippedActions: [],
      errors: ["Not in a git repository"],
    };
  }

  // Get diagnostics
  const diagnostics = getCleanupDiagnostics(gitRoot);

  // Filter based on options
  if (options.branches) {
    diagnostics.staleWorktrees = [];
    diagnostics.actions = diagnostics.actions.filter((a) => a.type !== "delete-worktree");
    diagnostics.summary.totalStaleWorktrees = 0;
    diagnostics.summary.safeToDeleteWorktrees = 0;
  }

  if (options.worktrees) {
    diagnostics.staleBranches = [];
    diagnostics.staleRemoteBranches = [];
    diagnostics.actions = diagnostics.actions.filter((a) => a.type === "delete-worktree");
    diagnostics.summary.totalStaleBranches = 0;
    diagnostics.summary.safeToDeleteBranches = 0;
  }

  // Dry run mode
  if (options.dryRun) {
    const formatted = options.json
      ? formatJson({
          success: true,
          diagnostics,
          executedActions: [],
          skippedActions: diagnostics.actions,
          errors: [],
        })
      : formatDryRun(diagnostics);

    return {
      success: true,
      diagnostics,
      executedActions: [],
      skippedActions: diagnostics.actions,
      errors: [],
      formatted,
    };
  }

  // Check if there's anything to clean
  if (diagnostics.actions.length === 0) {
    const formatted = options.json
      ? formatJson({
          success: true,
          diagnostics,
          executedActions: [],
          skippedActions: [],
          errors: [],
        })
      : colors.green("✓ No stale resources found");

    return {
      success: true,
      diagnostics,
      executedActions: [],
      skippedActions: [],
      errors: [],
      formatted,
    };
  }

  // Determine which actions to execute
  let actionsToExecute: CleanupAction[];
  const skippedActions: CleanupAction[] = [];

  if (options.yes) {
    // Non-interactive: execute safe actions only
    actionsToExecute = diagnostics.actions.filter((a) => a.safe);
    skippedActions.push(...diagnostics.actions.filter((a) => !a.safe));
  } else {
    // Interactive mode
    const rl = createPrompt();
    try {
      actionsToExecute = await showInteractiveMenu(rl, diagnostics);
      skippedActions.push(...diagnostics.actions.filter((a) => !actionsToExecute.includes(a)));
    } finally {
      rl.close();
    }
  }

  // Execute actions
  const executedActions: CleanupAction[] = [];
  const errors: string[] = [];

  console.log("");
  for (const action of actionsToExecute) {
    process.stdout.write(`  ${action.description}... `);
    const result = await executeAction(action, gitRoot);
    if (result.success) {
      console.log(colors.green("✓"));
      executedActions.push(action);
    } else {
      console.log(colors.red("✗"));
      errors.push(`${action.target}: ${result.error}`);
    }
  }

  // Format result
  const lines: string[] = [];
  lines.push("");
  lines.push(colors.bold("Cleanup Complete"));
  lines.push("─".repeat(50));
  lines.push(`  Executed: ${executedActions.length} action(s)`);
  lines.push(`  Skipped:  ${skippedActions.length} action(s)`);
  if (errors.length > 0) {
    lines.push(`  Errors:   ${errors.length}`);
    for (const error of errors) {
      lines.push(`    ${colors.red("✗")} ${error}`);
    }
  }

  return {
    success: errors.length === 0,
    diagnostics,
    executedActions,
    skippedActions,
    errors,
    formatted: lines.join("\n"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the cleanup command.
 */
export function registerCleanupCommand(program: Command): void {
  program
    .command("cleanup")
    .description("Clean up stale branches and worktrees")
    .option("-p, --path <path>", "Path to repository", process.cwd())
    .option("--dry-run", "Show what would be cleaned without making changes")
    .option("--branches", "Clean only branches (skip worktrees)")
    .option("--worktrees", "Clean only worktrees (skip branches)")
    .option("--json", "Output as JSON")
    .option("-y, --yes", "Skip interactive prompts (only execute safe actions)")
    .action(async (opts) => {
      const result = await cleanupCommand({
        path: opts.path,
        dryRun: opts.dryRun,
        branches: opts.branches,
        worktrees: opts.worktrees,
        json: opts.json,
        yes: opts.yes,
      });

      if (opts.json) {
        console.log(formatJson(result));
      } else if (result.formatted) {
        console.log(result.formatted);
      }

      if (!result.success) {
        process.exit(1);
      }
    });
}
