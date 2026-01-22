/**
 * DevAC Status Types
 *
 * Type definitions for the status command output system.
 * Supports three output levels: summary (1-liner), brief (sectioned), full (detailed).
 *
 * @see docs/vision/concepts.md for the Four Pillars model
 */

// ─────────────────────────────────────────────────────────────────────────────
// Output Level Types
// ─────────────────────────────────────────────────────────────────────────────

export type OutputLevel = "summary" | "brief" | "full";
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
// JSON Output Schema (LLM-optimized)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete JSON output structure for --json flag.
 * Always includes all available information (no level truncation).
 * Optimized for LLM/automation consumption.
 */
export interface DevACStatusJSON {
  /** Schema version for forwards compatibility */
  version: "1.0";

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Context information */
  context: {
    /** Current working directory */
    path: string;
    /** Workspace root path */
    workspace: string;
    /** Repository name */
    repo: string;
    /** Current git branch */
    branch: string;
    /** Issue ID if in worktree (e.g., "gh123") */
    issueId?: string;
    /** Issue title if available */
    issueTitle?: string;
    /** Whether current directory is a worktree */
    isWorktree: boolean;
  };

  /** DevAC infrastructure health */
  health: {
    /** Watch status */
    watch: {
      active: boolean;
      path?: string;
    };
    /** Hub connection status */
    hub: {
      connected: boolean;
      reposRegistered: number;
      path?: string;
    };
    /** MCP server status */
    mcp: {
      running: boolean;
      socketPath?: string;
    };
  };

  /** Seeds (code analysis) status */
  seeds: {
    /** Aggregate counts */
    summary: {
      totalRepos: number;
      reposWithSeeds: number;
      packagesAnalyzed: number;
      packagesPending: number;
    };
    /** Per-repo details */
    repos: Array<{
      name: string;
      path: string;
      packagesAnalyzed: number;
      packagesTotal: number;
      hasBaseSeeds: boolean;
      hasDeltaSeeds: boolean;
    }>;
  };

  /** Code diagnostics */
  diagnostics: {
    /** Aggregate counts */
    summary: {
      errors: number;
      warnings: number;
      suggestions: number;
    };
    /** Breakdown by source */
    bySource: {
      tsc?: { errors: number; warnings: number };
      eslint?: { errors: number; warnings: number };
      test?: { failures: number; passed: number };
      coverage?: { belowThreshold: number };
    };
    /** Individual diagnostic items (optional, included in full output) */
    items?: Array<{
      file: string;
      line: number;
      source: string;
      severity: "error" | "warning" | "suggestion";
      message: string;
    }>;
  };

  /** Workflow (CI/GitHub) status */
  workflow: {
    /** Aggregate counts */
    summary: {
      passing: number;
      failing: number;
      pending: number;
      noPR: number;
    };
    /** Per-repo status */
    repos: Array<{
      name: string;
      status: "passing" | "failing" | "pending" | "none";
      prNumber?: number;
      prTitle?: string;
      prUrl?: string;
      ciUrl?: string;
    }>;
  };

  /** Suggested next steps */
  next: {
    /** Most important next action (kebab-case identifier) */
    primary: string;
    /** All next steps with details */
    steps: Array<{
      priority: number;
      action: string;
      reason: string;
      /** Suggested CLI command (optional) */
      command?: string;
    }>;
  };
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
 * Maps to actual ANSI codes in colors.ts.
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
