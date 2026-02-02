/**
 * DevAC Status Types
 *
 * Core type definitions for the status output system.
 * These types are the single source of truth used by CLI and MCP.
 *
 * @see docs/vision/concepts.md for the Four Pillars model
 */

// ─────────────────────────────────────────────────────────────────────────────
// Output Level Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Output detail level for status display.
 * - summary: Single line compact output
 * - brief: Multi-line sectioned output (default)
 * - full: Detailed output with all information
 */
export type OutputLevel = "summary" | "brief" | "full";

/**
 * Grouping mode for status output.
 * - type: Group by component type (context, health, seeds, etc.)
 * - repo: Group by repository
 * - status: Group by status (passing, failing, pending)
 */
export type GroupBy = "type" | "repo" | "status";

// ─────────────────────────────────────────────────────────────────────────────
// Component Output Contracts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context component output contract.
 * Provides where am I? What issue? information.
 */
export interface ContextOutput {
  /** Summary: "vivief:cli-v4" or "vivief-gh123" */
  summary: string;
  /** Brief: multi-line with context details */
  brief: string[];
  /** Full: all details with workspace path, worktree info */
  full: string[];
}

/**
 * Health component output contract.
 * Shows DevAC infrastructure health (watch, hub, mcp).
 */
export interface HealthOutput {
  /** Summary: "hub:ok" | "hub:!" | "watch:active" */
  summary: string;
  /** Brief: watch status, hub status */
  brief: string[];
  /** Full: watch, hub path, repos, MCP status */
  full: string[];
}

/**
 * Seeds component output contract.
 * Shows code analysis status across repos.
 */
export interface SeedsOutput {
  /** Summary: "22r/145p" (repos/packages) */
  summary: string;
  /** Brief: summary with pending repos listed */
  brief: string[];
  /** Full: per-repo status table */
  full: string[];
}

/**
 * Diagnostics component output contract.
 * Shows code health (errors, warnings).
 */
export interface DiagnosticsOutput {
  /** Summary: "ok" | "5e" | "5e/3w" */
  summary: string;
  /** Brief: counts by source */
  brief: string[];
  /** Full: per-file errors with locations */
  full: string[];
}

/**
 * Workflow component output contract.
 * Shows CI/GitHub status for repos.
 */
export interface WorkflowOutput {
  /** Summary: "5✓1✗1⏳" or "ok" or "1✗" */
  summary: string;
  /** Brief: summary with failing/pending repos */
  brief: string[];
  /** Full: all repos with PR numbers and titles */
  full: string[];
}

/**
 * Next component output contract.
 * Suggests next steps based on current state.
 */
export interface NextOutput {
  /** Summary: "fix-ci" | "sync" | "ok" */
  summary: string;
  /** Brief: first suggested action */
  brief: string[];
  /** Full: all next steps numbered */
  full: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Icons and Colors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Icon map for status indicators.
 * Used consistently across all output formats.
 */
export const STATUS_ICONS = {
  passing: "✓",
  failing: "✗",
  pending: "⏳",
  noPr: "○",
  unknown: "?",
  ok: "✓",
  error: "!",
  warning: "⚠",
} as const;

/**
 * Color names for status indicators.
 * Maps to actual ANSI codes in CLI implementations.
 */
export type StatusColor = "green" | "red" | "yellow" | "dim" | "reset";

export const STATUS_COLORS: Record<string, StatusColor> = {
  passing: "green",
  failing: "red",
  pending: "yellow",
  noPr: "dim",
  unknown: "dim",
  ok: "green",
  error: "red",
  warning: "yellow",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Status Options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for status command/tool.
 * Unified interface used by both CLI and MCP.
 */
export interface StatusCommandOptions {
  /** Path to check (defaults to cwd) */
  path?: string;
  /** Output detail level */
  level?: OutputLevel;
  /** Grouping mode */
  groupBy?: GroupBy;
  /** Return JSON format (DevACStatusJSON) */
  json?: boolean;
  /** Include diagnostics section */
  diagnostics?: boolean;
  /** Include health checks (doctor) */
  doctor?: boolean;
  /** Auto-fix issues found by doctor */
  fix?: boolean;
  /** Show hub-specific status */
  hub?: boolean;
  /** Show cleanup diagnostics (stale branches, worktrees) */
  cleanup?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Git Repository State Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comprehensive git repository state with remote tracking.
 */
export interface GitRepoState {
  /** Current branch name */
  branch: string;

  /** Detected base branch (main, master, develop, etc.) */
  baseBranch: string;

  /** Remote tracking information */
  tracking: {
    /** Whether the branch tracks a remote */
    hasRemote: boolean;
    /** Commits ahead of remote */
    ahead: number;
    /** Commits behind remote */
    behind: number;
    /** Whether local and remote are in sync */
    inSync: boolean;
    /** Remote name (e.g., "origin") */
    remoteName?: string;
    /** Remote branch name */
    remoteBranch?: string;
  };

  /** Working directory state */
  workingDir: {
    /** Files staged for commit */
    staged: string[];
    /** Modified files not staged */
    unstaged: string[];
    /** Untracked files */
    untracked: string[];
    /** Whether working directory is clean */
    isClean: boolean;
  };

  /** Branch commits information */
  branchCommits: {
    /** Total commits on this branch since base */
    count: number;
    /** Whether all commits have been pushed */
    allPushed: boolean;
    /** Number of unpushed commits */
    unpushedCount: number;
  };

  /** Special git states */
  specialState?: {
    /** Whether in merge state */
    isMerging: boolean;
    /** Whether in rebase state */
    isRebasing: boolean;
    /** Whether in cherry-pick state */
    isCherryPicking: boolean;
    /** Whether there are unresolved conflicts */
    hasConflicts: boolean;
    /** List of conflicted files */
    conflictedFiles: string[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PR State Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge blocker reason.
 */
export type MergeBlockerType =
  | "ci-failing"
  | "review-required"
  | "changes-requested"
  | "merge-conflicts"
  | "draft"
  | "base-behind"
  | "missing-approvals";

/**
 * A single merge blocker with details.
 */
export interface MergeBlocker {
  /** Type of blocker */
  type: MergeBlockerType;
  /** Human-readable description */
  message: string;
  /** Actionable suggestion to resolve */
  suggestion?: string;
}

/**
 * Pull request state with merge readiness.
 */
export interface PRState {
  /** PR number */
  number: number;

  /** PR title */
  title: string;

  /** PR URL */
  url: string;

  /** PR state */
  state: "open" | "closed" | "merged" | "draft";

  /** Merge readiness assessment */
  mergeReadiness: {
    /** Whether PR is ready to merge */
    ready: boolean;
    /** List of blockers preventing merge */
    blockers: MergeBlocker[];
  };

  /** Review status */
  reviews: {
    /** Number of approvals */
    approved: number;
    /** Number of changes requested */
    changesRequested: number;
    /** Number of pending reviews */
    pending: number;
    /** Required approvals (if known) */
    requiredApprovals?: number;
  };

  /** CI checks status */
  checks: {
    /** Overall status */
    status: "passing" | "failing" | "pending" | "unknown";
    /** List of failed check names */
    failedChecks: string[];
    /** List of pending check names */
    pendingChecks: string[];
  };

  /** Merge conflicts */
  conflicts: {
    /** Whether there are merge conflicts */
    hasConflicts: boolean;
    /** List of conflicted files */
    conflictedFiles: string[];
  };

  /** Base branch info */
  base: {
    /** Base branch name */
    branch: string;
    /** Whether base is behind remote */
    needsUpdate: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed Staleness Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reason why seeds are considered stale.
 */
export type SeedStalenessReason =
  | "source-changed" // Source files changed since last analysis
  | "config-changed" // DevAC config changed
  | "deps-changed" // Dependencies changed
  | "outdated" // Last analysis too old
  | "missing-commit"; // lastAnalyzedCommit not in history

/**
 * Enhanced package seed state with staleness detection.
 */
export interface PackageSeedStateEnhanced {
  /** Absolute path to the package */
  packagePath: string;

  /** Package name */
  packageName: string;

  /** Basic seed state */
  seeds: {
    /** Whether base seeds exist */
    hasBase: boolean;
    /** Whether delta seeds exist */
    hasDelta: boolean;
    /** Combined state */
    state: "none" | "base" | "delta" | "both";
  };

  /** Staleness detection */
  needsUpdate: {
    /** Whether seeds are stale and need update */
    stale: boolean;
    /** Reason for staleness */
    reason?: SeedStalenessReason;
    /** Files that changed since last analysis */
    changedFiles: string[];
    /** Commit hash when last analyzed */
    lastAnalyzedCommit?: string;
    /** Current HEAD commit hash */
    currentCommit?: string;
  };

  /** Last modified times */
  timestamps: {
    /** Last modified time of base seeds (ISO string) */
    baseLastModified?: string;
    /** Last modified time of delta seeds (ISO string) */
    deltaLastModified?: string;
    /** Last analysis time (from metadata) */
    lastAnalyzedAt?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup Diagnostics Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Staleness threshold configuration (in days).
 */
export const STALE_THRESHOLD_DAYS = 30;

/**
 * Reason why a branch is considered stale.
 */
export type StaleBranchReason =
  | "pr-merged" // PR was merged
  | "pr-closed" // PR was closed without merge
  | "no-activity" // No commits in 30+ days
  | "deleted-remote"; // Deleted on remote

/**
 * A stale local branch.
 */
export interface StaleBranch {
  /** Branch name */
  name: string;
  /** Reason for staleness */
  reason: StaleBranchReason;
  /** Associated PR number (if any) */
  prNumber?: number;
  /** Last commit date */
  lastCommitDate?: string;
  /** Whether branch has uncommitted changes */
  hasUncommittedChanges: boolean;
  /** Whether safe to delete */
  safeToDelete: boolean;
}

/**
 * A stale remote branch (e.g., origin/feature-x that's merged).
 */
export interface StaleRemoteBranch {
  /** Full ref name (e.g., "origin/feature-x") */
  ref: string;
  /** Remote name */
  remote: string;
  /** Branch name */
  branch: string;
  /** Reason for staleness */
  reason: StaleBranchReason;
  /** Associated PR number (if any) */
  prNumber?: number;
}

/**
 * A stale git worktree.
 */
export interface StaleWorktree {
  /** Worktree path */
  path: string;
  /** Worktree name (directory name) */
  name: string;
  /** Associated issue ID */
  issueId?: string;
  /** Associated issue number */
  issueNumber?: number;
  /** Issue state (if known) */
  issueState?: "open" | "closed";
  /** Associated PR state (if any) */
  prState?: "open" | "merged" | "closed";
  /** Reason for staleness */
  reason: "issue-closed" | "pr-merged" | "pr-closed" | "no-activity";
  /** Whether worktree has uncommitted changes */
  hasUncommittedChanges: boolean;
  /** Whether safe to delete */
  safeToDelete: boolean;
}

/**
 * Cleanup action type.
 */
export type CleanupActionType =
  | "delete-branch"
  | "delete-remote-branch"
  | "delete-worktree"
  | "prune-remote";

/**
 * A suggested cleanup action.
 */
export interface CleanupAction {
  /** Action type */
  type: CleanupActionType;
  /** Human-readable description */
  description: string;
  /** Git command to execute */
  command: string;
  /** Whether this is a safe operation */
  safe: boolean;
  /** Related branch or worktree name */
  target: string;
}

/**
 * Complete cleanup diagnostics for a repository or workspace.
 */
export interface CleanupDiagnostics {
  /** Repository or workspace path */
  path: string;

  /** Stale local branches */
  staleBranches: StaleBranch[];

  /** Stale remote branches */
  staleRemoteBranches: StaleRemoteBranch[];

  /** Stale worktrees */
  staleWorktrees: StaleWorktree[];

  /** Suggested cleanup actions */
  actions: CleanupAction[];

  /** Summary counts */
  summary: {
    /** Total stale branches (local + remote) */
    totalStaleBranches: number;
    /** Branches safe to delete */
    safeToDeleteBranches: number;
    /** Total stale worktrees */
    totalStaleWorktrees: number;
    /** Worktrees safe to delete */
    safeToDeleteWorktrees: number;
  };
}
