/**
 * CLI Command Types for DevAC v2.0
 *
 * Based on spec Section 11: CLI Interface
 */

/**
 * Options for analyze command
 */
export interface AnalyzeOptions {
  /** Path to the package to analyze (defaults to current directory) */
  packagePath: string;
  /** Repository name for entity ID generation */
  repoName: string;
  /** Git branch name */
  branch: string;
  /** Only analyze if source files have changed (hash check) */
  ifChanged?: boolean;
  /** Force full reanalysis even if nothing changed */
  force?: boolean;
  /** Analyze all packages in repository */
  all?: boolean;
  /** Run semantic resolution after structural analysis */
  resolve?: boolean;
  /** Enable verbose output */
  verbose?: boolean;
}

/**
 * Result from analyze command
 */
export interface AnalyzeResult {
  success: boolean;
  filesAnalyzed: number;
  nodesCreated: number;
  edgesCreated: number;
  refsCreated: number;
  /** Number of refs resolved in semantic pass */
  refsResolved?: number;
  skipped?: boolean;
  error?: string;
  timeMs: number;
}

/**
 * Options for query command
 */
export interface QueryOptions {
  /** SQL query to execute */
  sql: string;
  /** Path to package (for locating seed files) */
  packagePath: string;
  /** Output format */
  format: "json" | "csv" | "table";
}

/**
 * Result from query command
 */
export interface QueryResult {
  success: boolean;
  rows?: Record<string, unknown>[];
  csv?: string;
  table?: string;
  rowCount?: number;
  error?: string;
  timeMs?: number;
}

/**
 * Options for verify command
 */
export interface VerifyOptions {
  /** Path to package to verify */
  packagePath: string;
  /** Git branch to verify */
  branch?: string;
}

/**
 * Result from verify command
 */
export interface VerifyResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats?: {
    nodeCount: number;
    edgeCount: number;
    refCount: number;
    fileCount: number;
    unresolvedRefs: number;
    orphanedEdges: number;
  };
}

/**
 * Options for clean command
 */
export interface CleanOptions {
  /** Path to package to clean */
  packagePath: string;
  /** Also clean the .devac directory itself */
  cleanConfig?: boolean;
}

/**
 * Result from clean command
 */
export interface CleanResult {
  success: boolean;
  filesRemoved: number;
  bytesFreed: number;
  error?: string;
}

/**
 * Options for watch command
 */
export interface WatchOptions {
  /** Path to the package to watch */
  packagePath: string;
  /** Repository name for entity ID generation */
  repoName: string;
  /** Git branch name */
  branch?: string;
  /** Debounce time in ms (default: 100) */
  debounceMs?: number;
  /** Force initial analysis even if seeds exist */
  force?: boolean;
  /** Enable verbose output */
  verbose?: boolean;
  /** Enable debug output */
  debug?: boolean;
  /** Enable cross-repo detection (default: true if in worktree context) */
  detectCrossRepo?: boolean;
  /** Path to write cross-repo notifications (optional) */
  notificationsPath?: string;
}

/**
 * Result from watch command when stopped
 */
export interface WatchResult {
  success: boolean;
  filesWatched: number;
  eventsProcessed: number;
  exitReason: "signal" | "error" | "manual";
  error?: string;
}

/**
 * Watch status information
 */
export interface WatchStatus {
  isWatching: boolean;
  initialAnalysisComplete: boolean;
  initialAnalysisSkipped: boolean;
  filesAnalyzed: number;
  changesProcessed: number;
  errors: number;
  error?: string;
  /** Number of cross-repo needs detected */
  crossRepoNeedsDetected: number;
  /** Whether cross-repo detection is enabled */
  crossRepoDetectionEnabled: boolean;
}

/**
 * File change event from watch
 */
export interface WatchChangeEvent {
  type: "add" | "change" | "unlink";
  filePath: string;
  timestamp: number;
}

/**
 * Cross-repo need event from watch
 *
 * Emitted when an unresolved import pointing to a sibling repo is detected.
 */
export interface WatchCrossRepoNeedEvent {
  /** Source repo where the unresolved import was found */
  sourceRepo: string;
  /** Target repo that needs changes */
  targetRepo: string;
  /** Human-readable reason for the need */
  reason: string;
  /** Unresolved symbol names */
  symbols: string[];
  /** Module specifier that couldn't be resolved */
  moduleSpecifier: string;
  /** Suggested command to fix */
  suggestion: string;
  /** Issue number if in an issue worktree */
  issueNumber?: number;
  /** Source file path where the unresolved import was found */
  sourceFilePath: string;
  /** Timestamp of detection */
  timestamp: number;
}

/**
 * Watch controller interface
 */
export interface WatchController {
  /** Stop watching */
  stop(options?: { flush?: boolean }): Promise<WatchResult>;
  /** Get current status */
  getStatus(): WatchStatus;
  /** Get options */
  getOptions(): Required<WatchOptions>;
  /** Register event handler for file changes */
  on(event: "change", handler: (event: WatchChangeEvent) => void): void;
  /** Register event handler for cross-repo needs */
  on(event: "cross-repo-need", handler: (event: WatchCrossRepoNeedEvent) => void): void;
  /** Remove event handler */
  off(event: "change", handler: (event: WatchChangeEvent) => void): void;
  /** Remove event handler */
  off(event: "cross-repo-need", handler: (event: WatchCrossRepoNeedEvent) => void): void;
}

/**
 * Options for affected command
 */
export interface AffectedOptions {
  /** Path to the package to analyze */
  packagePath: string;
  /** Changed files to analyze */
  changedFiles: string[];
  /** Maximum traversal depth */
  maxDepth?: number;
  /** Output format */
  format?: "json" | "list" | "tree";
}

/**
 * Result from affected command
 */
export interface AffectedResult {
  success: boolean;
  changedSymbols: Array<{
    entityId: string;
    name: string;
    kind: string;
    filePath: string;
  }>;
  affectedFiles: Array<{
    filePath: string;
    impactLevel: "direct" | "transitive";
    depth: number;
  }>;
  totalAffected: number;
  analysisTimeMs: number;
  error?: string;
}
