/**
 * Workspace Module
 *
 * Provides workspace-level operations for DevAC v3:
 * - Workspace discovery
 * - Unified file watching
 * - Hub auto-refresh
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
  findGitRoot,
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
  // Workspace hub discovery
  findWorkspaceDir,
  findWorkspaceHubDir,
  // Hub location validation
  validateHubLocation,
  type HubValidationResult,
} from "./discover.js";

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

// Package manager detection and discovery
export {
  detectPackageManager,
  discoverJSPackages,
  discoverPythonPackages,
  discoverCSharpPackages,
  discoverAllPackages,
  type PackageManagerType,
  type LanguageType,
  type PackageInfo,
  type DiscoveryError,
  type DiscoveryResult,
} from "./package-manager.js";

// Seed state detection
export {
  hasBaseSeed,
  hasDeltaSeed,
  detectPackageSeedState,
  detectRepoSeedStatus,
  getPackagesNeedingAnalysis,
  getAnalyzedPackages,
  type SeedState,
  type PackageSeedState,
  type RepoSeedStatus,
} from "./seed-state.js";

// Workspace status
export {
  getRepoStatus,
  getWorkspaceStatus,
  formatStatusBrief,
  formatStatusFull,
  type StatusOptions,
  type RepoStatus,
  type WorkspaceStatus,
} from "./status.js";
