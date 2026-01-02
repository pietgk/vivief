/**
 * Doctor Command Types
 *
 * Type definitions for the devac doctor health check system.
 */

/**
 * Status of a single health check
 */
export type CheckStatus = "pass" | "fail" | "warn" | "skip";

/**
 * Categories for grouping checks
 */
export type CheckCategory =
  | "cli-installation"
  | "hub-health"
  | "mcp-status"
  | "workspace-builds"
  | "plugin-config";

/**
 * A single health check result
 */
export interface CheckResult {
  /** Unique identifier for the check */
  id: string;
  /** Human-readable name */
  name: string;
  /** Check status */
  status: CheckStatus;
  /** Description of current state */
  message: string;
  /** Optional additional details */
  details?: string;
  /** If failed, can this be auto-fixed? */
  fixable?: boolean;
  /** Command to fix the issue */
  fixCommand?: string;
  /** Category for grouping in output */
  category: CheckCategory;
}

/**
 * Context passed to each check
 */
export interface CheckContext {
  /** Hub directory path (~/.devac) */
  hubDir: string;
  /** Current working directory */
  cwd: string;
  /** Detected workspace root (if in workspace) */
  workspaceRoot?: string;
  /** Whether we're inside the devac workspace */
  isDevacWorkspace: boolean;
  /** Verbose output mode */
  verbose: boolean;
}

/**
 * A health check definition
 */
export interface HealthCheck {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category for grouping */
  category: CheckCategory;
  /** Whether this check requires being in a workspace */
  requiresWorkspace: boolean;
  /** Execute the check */
  run(context: CheckContext): Promise<CheckResult>;
}

/**
 * Result of executing a fix
 */
export interface FixResult {
  /** Whether the fix succeeded */
  success: boolean;
  /** Description of what was fixed or error */
  message: string;
  /** Error details if failed */
  error?: string;
}

/**
 * Options for doctor command
 */
export interface DoctorOptions {
  /** Hub directory path */
  hubDir?: string;
  /** Working directory */
  cwd?: string;
  /** Execute fixes instead of dry-run */
  fix?: boolean;
  /** Output as JSON */
  json?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Result from doctor command
 */
export interface DoctorResult {
  /** Whether all checks passed (no failures) */
  success: boolean;
  /** All check results */
  checks: CheckResult[];
  /** Summary counts */
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
    fixable: number;
  };
  /** Detected context info */
  context: {
    isWorkspace: boolean;
    workspaceRoot?: string;
    hubDir: string;
  };
  /** Fixes that were executed (if --fix) */
  fixesApplied?: FixResult[];
  /** Formatted output for CLI */
  formatted?: string;
}
