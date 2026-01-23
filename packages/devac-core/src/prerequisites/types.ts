/**
 * Prerequisites Types
 *
 * Type definitions for the prerequisites checking system.
 * These types enable consistent error reporting and readiness checking
 * across CLI commands and MCP tools.
 */

// ─────────────────────────────────────────────────────────────────────────────
// System State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Overall system state for DevAC operations.
 *
 * - first-run: No DevAC artifacts exist yet (normal on first use)
 * - ready: All prerequisites met, operations can proceed
 * - partial: Some prerequisites met, limited operations possible
 * - broken: Prerequisites exist but are invalid or corrupted
 * - locked: Hub is locked by another process (MCP server)
 */
export type SystemState = "first-run" | "ready" | "partial" | "broken" | "locked";

// ─────────────────────────────────────────────────────────────────────────────
// Prerequisite Check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Category of prerequisite check.
 */
export type PrerequisiteCategory = "workspace" | "seeds" | "hub" | "environment";

/**
 * Result of a single prerequisite check.
 */
export interface PrerequisiteCheck {
  /** Unique identifier for the check (e.g., "seeds_exist", "hub_queryable") */
  id: string;

  /** Category of the check */
  category: PrerequisiteCategory;

  /** Whether the check passed */
  passed: boolean;

  /** Whether this check is required (false = warning only) */
  required: boolean;

  /** Human-readable message describing the result */
  message: string;

  /** Additional context or details (optional) */
  detail?: string;

  /**
   * Command to fix the issue (optional).
   * IMPORTANT: Must NOT be circular (never suggest the failing command).
   */
  fixCommand?: string;

  /** Description of what the fix command does */
  fixDescription?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Readiness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commands that can be checked for readiness.
 */
export type ReadinessCommand = "sync" | "query" | "status";

/**
 * Readiness result for a specific command.
 * Aggregates prerequisite checks into an actionable result.
 */
export interface CommandReadiness {
  /** The command being checked */
  command: ReadinessCommand;

  /** Whether the command can proceed */
  ready: boolean;

  /** Overall system state */
  state: SystemState;

  /** Required checks that failed (blockers) */
  blockers: PrerequisiteCheck[];

  /** Optional checks that failed (warnings) */
  warnings: PrerequisiteCheck[];

  /** All checks that were performed */
  allChecks: PrerequisiteCheck[];

  /** One-line summary suitable for LLM consumption */
  summary: string;

  /** Multi-line human-readable message */
  humanMessage: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Readiness Output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Readiness output for status display.
 * Shows whether sync/query operations can proceed.
 */
export interface ReadinessOutput {
  /** Summary line for status output: "sync: ✓ ready" */
  summary: string;

  /** Brief output lines */
  brief: string[];

  /** Full detailed output lines */
  full: string[];

  /** Sync command readiness */
  sync: CommandReadiness;

  /** Query command readiness */
  query: CommandReadiness;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for formatting prerequisite errors.
 */
export interface FormatErrorOptions {
  /** Include ANSI color codes */
  color?: boolean;

  /** Include fix suggestions */
  includeFix?: boolean;

  /** Include all checks or just failures */
  verbose?: boolean;
}
