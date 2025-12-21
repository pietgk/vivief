/**
 * Workspace Module
 *
 * Provides workspace-level operations for DevAC v3:
 * - Workspace discovery
 * - Unified file watching
 * - Hub auto-refresh
 * - State management
 *
 * @example
 * ```ts
 * import { createWorkspaceManager } from "@pietgk/devac-core/workspace";
 *
 * const manager = createWorkspaceManager({ workspacePath: "~/ws" });
 * await manager.initialize();
 * await manager.startWatch();
 *
 * // Events
 * manager.on((event) => {
 *   console.log(event.type, event);
 * });
 *
 * // Cleanup
 * await manager.dispose();
 * ```
 */

// Types
export type {
  // Core types
  WorkspaceInfo,
  WorkspaceRepoInfo,
  WorkspaceConfig,
  WorkspaceState,
  WorkspaceRepoState,
  RepoHubStatus,
  // Event types
  WorkspaceEvent,
  WorkspaceEventBase,
  FileChangeEvent,
  SeedChangeEvent,
  HubRefreshEvent,
  RepoDiscoveryEvent,
  WatcherStateEvent,
  WorkspaceEventHandler,
  // Parsing types
  ParsedWorktreeNameV2,
  ParsedIssueId,
  // Options types
  WorkspaceDiscoveryOptions,
  WorkspaceWatcherOptions,
  WorkspaceManagerOptions,
  AutoRefreshOptions,
} from "./types.js";

// Discovery
export {
  // Parsing functions
  parseIssueId,
  extractIssueNumberFromId,
  parseWorktreeNameV2,
  isWorktreeName,
  // Git utilities
  isGitRepo,
  isGitWorktree,
  getGitBranch,
  // Seed utilities
  hasDevacSeeds,
  getSeedsLastModified,
  getRepoId,
  // Workspace discovery
  isWorkspaceDirectory,
  discoverWorkspaceRepos,
  discoverWorkspace,
  loadWorkspaceConfig,
  formatWorkspaceInfo,
} from "./discover.js";

// State management
export {
  getStateFilePath,
  loadWorkspaceState,
  saveWorkspaceState,
  updateRepoState,
  updateHubState,
  removeRepoFromState,
  isStateStale,
  repoInfoToState,
  syncStateWithDiscovery,
  mergeStateIntoRepos,
  getChangedRepos,
  markReposAsRegistered,
  stateFileExists,
} from "./state.js";

// Seed detector
export {
  createSeedDetector,
  type SeedDetector,
  type SeedDetectorOptions,
  type SeedChangeHandler,
  type SeedDetectorStats,
} from "./seed-detector.js";

// Workspace watcher
export {
  createWorkspaceWatcher,
  type WorkspaceWatcher,
  type WorkspaceWatcherStats,
} from "./watcher.js";

// Auto-refresh
export {
  createAutoRefresher,
  type AutoRefresher,
  type RefreshEventHandler,
  type AutoRefreshStats,
} from "./auto-refresh.js";

// Manager (main entry point)
export {
  createWorkspaceManager,
  type WorkspaceManager,
  type WorkspaceManagerStats,
} from "./manager.js";
