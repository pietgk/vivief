/**
 * Status Detection Module
 *
 * Exports all detection utilities for git, seeds, PRs, and staleness.
 */

// Git detection
export {
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
} from "./git-detection.js";

// Seed detection
export type { SeedMetadata, StalenessOptions } from "./seed-detection.js";
export {
  readSeedMetadata,
  writeSeedMetadata,
  updateSeedMetadataCommit,
  detectSeedStaleness,
  detectPackageSeedStateEnhanced,
} from "./seed-detection.js";

// PR detection
export type { PRDetectionOptions } from "./pr-detection.js";
export {
  isGhAvailable,
  getPRState,
  getPRStateForBranch,
} from "./pr-detection.js";

// Staleness detection
export {
  detectStaleBranches,
  detectStaleRemoteBranches,
  detectStaleWorktrees,
  getWorktrees,
  getCleanupDiagnostics,
} from "./staleness-detection.js";
