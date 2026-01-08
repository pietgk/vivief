/**
 * Workspace Types
 *
 * Types for workspace-level discovery, watching, and hub management.
 * Based on DevAC v3 Phase 1 architecture.
 *
 * Key concepts:
 * - Workspace: A parent directory containing multiple git repos
 * - issueId: `{source}{originRepo}-{number}` format (e.g., "ghapi-123")
 * - Worktree: `{worktreeRepo}-{issueId}-{slug}` naming convention
 */

/**
 * Hub registration status for a repository
 * Named RepoHubStatus to avoid conflict with HubStatus interface from hub module
 */
export type RepoHubStatus = "registered" | "pending" | "unregistered";

/**
 * Information about a repository within a workspace
 */
export interface WorkspaceRepoInfo {
  /** Absolute path to the repository */
  path: string;

  /** Unique repository identifier (from manifest or derived from name) */
  repoId: string;

  /** Directory name (e.g., "vivief" or "api-ghapi-123-auth") */
  name: string;

  /** Whether the repo has DevAC seeds (.devac/seed/) */
  hasSeeds: boolean;

  /** Whether this is a git worktree (vs main repo) */
  isWorktree: boolean;

  /**
   * Issue ID in {source}{originRepo}-{number} format
   * Extracted from worktree name pattern: {worktreeRepo}-{issueId}-{slug}
   * Example: "ghapi-123" from "api-ghapi-123-auth"
   */
  issueId?: string;

  /** Slug part of worktree name (e.g., "auth" from "api-ghapi-123-auth") */
  slug?: string;

  /** Path to the main repository (for worktrees only) */
  mainRepoPath?: string;

  /** Name of the main repository (for worktrees only) */
  mainRepoName?: string;

  /** Git branch name */
  branch?: string;

  /** Hub registration status */
  hubStatus: RepoHubStatus;

  /** Last time seeds were modified (ISO string) */
  seedsLastModified?: string;
}

/**
 * Workspace configuration stored in .devac/workspace.json
 */
export interface WorkspaceConfig {
  /** Config version for migrations */
  version: "1.0";

  /** Directories to exclude from discovery */
  exclude?: string[];

  /** Hub configuration */
  hub?: {
    /** Whether to auto-refresh hub when seeds change (default: true) */
    autoRefresh?: boolean;

    /** Debounce time in ms for hub refresh (default: 500) */
    refreshDebounceMs?: number;
  };

  /** Watcher configuration */
  watcher?: {
    /** Whether to auto-start watching on workspace init */
    autoStart?: boolean;

    /** File patterns to ignore (in addition to defaults) */
    ignorePatterns?: string[];
  };
}

/**
 * Persisted workspace state stored in .devac/state.json
 */
export interface WorkspaceState {
  /** State version for migrations */
  version: "1.0";

  /** Last discovery timestamp (ISO string) */
  lastDiscovery: string;

  /** Known repositories and their states */
  repos: WorkspaceRepoState[];

  /** Hub metadata */
  hub?: {
    /** Last refresh timestamp (ISO string) */
    lastRefresh?: string;

    /** Number of registered repos at last refresh */
    registeredCount?: number;
  };
}

/**
 * Per-repo state tracked in workspace state
 */
export interface WorkspaceRepoState {
  /** Repository path */
  path: string;

  /** Repository ID */
  repoId: string;

  /** Hub status at last check */
  hubStatus: RepoHubStatus;

  /** Content hash of seeds at last check */
  seedsHash?: string;

  /** Last modified timestamp of seeds */
  seedsLastModified?: string;
}

/**
 * Complete workspace information
 */
export interface WorkspaceInfo {
  /** Absolute path to the workspace directory */
  workspacePath: string;

  /** Whether this is a valid workspace (contains repos) */
  isWorkspace: boolean;

  /** All repositories discovered in the workspace */
  repos: WorkspaceRepoInfo[];

  /** Main repositories (not worktrees) */
  mainRepos: WorkspaceRepoInfo[];

  /**
   * Worktrees grouped by issueId
   * Key: issueId (e.g., "ghapi-123")
   * Value: Array of worktrees for that issue
   */
  worktreesByIssue: Map<string, WorkspaceRepoInfo[]>;

  /** Path to the workspace hub database */
  hubPath: string;

  /** Workspace configuration */
  config: WorkspaceConfig;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Base workspace event
 */
export interface WorkspaceEventBase {
  /** Event type discriminator */
  type: string;

  /** Timestamp of the event (ISO string) */
  timestamp: string;
}

/**
 * File change detected in a repository
 */
export interface FileChangeEvent extends WorkspaceEventBase {
  type: "file-change";

  /** Repository path where change occurred */
  repoPath: string;

  /** Relative path of the changed file */
  filePath: string;

  /** Type of change */
  changeType: "add" | "change" | "unlink";
}

/**
 * Seed files were updated
 */
export interface SeedChangeEvent extends WorkspaceEventBase {
  type: "seed-change";

  /** Repository path where seeds changed */
  repoPath: string;

  /** Repository ID */
  repoId: string;

  /** Which seed files changed */
  seedFiles: string[];
}

/**
 * Hub was refreshed
 */
export interface HubRefreshEvent extends WorkspaceEventBase {
  type: "hub-refresh";

  /** Repos that were refreshed */
  refreshedRepos: string[];

  /** Number of packages updated */
  packagesUpdated: number;

  /** Any errors during refresh */
  errors: string[];
}

/**
 * Repository discovered or removed
 */
export interface RepoDiscoveryEvent extends WorkspaceEventBase {
  type: "repo-discovery";

  /** Action that occurred */
  action: "added" | "removed";

  /** Repository information */
  repo: WorkspaceRepoInfo;
}

/**
 * Workspace watcher state changed
 */
export interface WatcherStateEvent extends WorkspaceEventBase {
  type: "watcher-state";

  /** New state */
  state: "started" | "stopped" | "error";

  /** Error message if state is "error" */
  error?: string;
}

/**
 * Union of all workspace events
 */
export type WorkspaceEvent =
  | FileChangeEvent
  | SeedChangeEvent
  | HubRefreshEvent
  | RepoDiscoveryEvent
  | WatcherStateEvent;

/**
 * Event handler function type
 */
export type WorkspaceEventHandler = (event: WorkspaceEvent) => void;

// =============================================================================
// Parsing Types
// =============================================================================

/**
 * Result of parsing a worktree directory name
 *
 * Pattern: {worktreeRepo}-{issueId}-{slug}
 * Example: "api-ghapi-123-auth"
 *   - worktreeRepo: "api"
 *   - issueId: "ghapi-123"
 *   - slug: "auth"
 */
export interface ParsedWorktreeNameV2 {
  /** The repo name part (usually same as main repo) */
  worktreeRepo: string;

  /** Full issueId in {source}{originRepo}-{number} format */
  issueId: string;

  /** Issue number extracted from issueId */
  issueNumber: number;

  /** Slug/description part */
  slug: string;
}

/**
 * Result of parsing an issueId
 *
 * Pattern: {source}{originRepo}-{number}
 * Example: "ghapi-123"
 *   - source: "gh" (from GitHub)
 *   - originRepo: "api"
 *   - number: 123
 *
 * Note: Parse by splitting on LAST "-" to extract number
 * This handles repos with dashes like "monorepo-3.0"
 */
export interface ParsedIssueId {
  /** The full issueId string */
  full: string;

  /** Source prefix (e.g., "gh" for GitHub) */
  source: string;

  /** Origin repo name */
  originRepo: string;

  /** Issue number */
  number: number;
}

// =============================================================================
// Options Types
// =============================================================================

/**
 * Options for workspace discovery
 */
export interface WorkspaceDiscoveryOptions {
  /** Whether to check for seeds (default: true) */
  checkSeeds?: boolean;

  /** Whether to check hub registration status (default: true) */
  checkHubStatus?: boolean;

  /** Whether to read git branch info (default: true) */
  readBranches?: boolean;

  /** Custom exclusion patterns */
  exclude?: string[];
}

/**
 * Options for workspace watcher
 */
export interface WorkspaceWatcherOptions {
  /** Workspace path to watch */
  workspacePath: string;

  /** Debounce time in ms for file changes (default: 100) */
  debounceMs?: number;

  /** Whether to watch for seed changes (default: true) */
  watchSeeds?: boolean;

  /** File patterns to ignore */
  ignorePatterns?: string[];
}

/**
 * Options for workspace manager
 */
export interface WorkspaceManagerOptions {
  /** Workspace path */
  workspacePath: string;

  /** Hub directory (defaults to workspace/.devac/) */
  hubDir?: string;

  /** Whether to auto-register repos with hub (default: true) */
  autoRegister?: boolean;

  /** Whether to auto-refresh hub on seed changes (default: true) */
  autoRefresh?: boolean;

  /** Debounce time in ms for hub refresh (default: 500) */
  refreshDebounceMs?: number;

  /** Skip hub location validation (for tests only) */
  skipValidation?: boolean;
}

/**
 * Options for auto-refresh
 */
export interface AutoRefreshOptions {
  /** Debounce time in ms (default: 500) */
  debounceMs?: number;

  /** Whether to batch multiple repo changes (default: true) */
  batchChanges?: boolean;

  /** Maximum batch wait time in ms (default: 1000) */
  maxBatchWaitMs?: number;
}
