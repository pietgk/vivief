/**
 * DevAC Status Module
 *
 * Exports all status-related types for CLI and MCP consumption.
 * This module is the single source of truth for status output types.
 */

// Core types
export type {
  OutputLevel,
  GroupBy,
  StatusColor,
  StatusCommandOptions,
  ContextOutput,
  HealthOutput,
  SeedsOutput,
  DiagnosticsOutput,
  WorkflowOutput,
  NextOutput,
} from "./types.js";

// Git state types
export type { GitRepoState } from "./types.js";

// PR state types
export type {
  MergeBlockerType,
  MergeBlocker,
  PRState,
} from "./types.js";

// Seed staleness types
export type {
  SeedStalenessReason,
  PackageSeedStateEnhanced,
} from "./types.js";

// Cleanup diagnostics types
export type {
  StaleBranchReason,
  StaleBranch,
  StaleRemoteBranch,
  StaleWorktree,
  CleanupActionType,
  CleanupAction,
  CleanupDiagnostics,
} from "./types.js";

// Constants
export { STATUS_ICONS, STATUS_COLORS, STALE_THRESHOLD_DAYS } from "./types.js";

// JSON schema
export type { DevACStatusJSON } from "./json-schema.js";

// Detection utilities
export {
  // Git detection
  detectBaseBranch,
  getTrackingInfo,
  getWorkingDirState,
  getBranchCommits,
  getSpecialState,
  getGitRepoState,
  hasUncommittedChanges,
  hasUnpushedCommits,
  getCurrentCommit,
  commitExists,
  // Seed detection
  readSeedMetadata,
  writeSeedMetadata,
  updateSeedMetadataCommit,
  detectSeedStaleness,
  detectPackageSeedStateEnhanced,
  // PR detection
  isGhAvailable,
  getPRState,
  getPRStateForBranch,
  // Staleness detection
  detectStaleBranches,
  detectStaleRemoteBranches,
  detectStaleWorktrees,
  getWorktrees,
  getCleanupDiagnostics,
} from "./detection/index.js";

export type {
  SeedMetadata,
  StalenessOptions,
  PRDetectionOptions,
} from "./detection/index.js";
