/**
 * DevAC Status JSON Schema
 *
 * Complete JSON output structure for --json flag.
 * Optimized for LLM/automation consumption.
 */

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
