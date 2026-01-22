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
}
