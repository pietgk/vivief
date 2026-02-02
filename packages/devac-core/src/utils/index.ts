/**
 * Utility Module Exports
 *
 * Helper utilities for DevAC v2.0
 */

// Atomic write utilities
export {
  writeFileAtomic,
  writeJsonAtomic,
  copyFileAtomic,
  moveFileAtomic,
  fsyncDirectory,
  createTempFile,
  cleanupTempFiles,
  ensureDir,
  removeIfExists,
  fileExists,
  getFileMtime,
} from "./atomic-write.js";
export type { AtomicWriteOptions } from "./atomic-write.js";

// Hash utilities
export {
  computeStringHash,
  computeBufferHash,
  computeFileHash,
  computeFileHashes,
  generateScopeHash,
  hasFileChanged,
  findChangedFiles,
  generateRandomHash,
  combineHashes,
} from "./hash.js";

// Cleanup utilities
export {
  cleanupPackageSeeds,
  findOrphanedSeeds,
  removeAllSeeds,
  cleanupOrphanedFiles,
  getSeedStorageStats,
  verifySeedStructure,
} from "./cleanup.js";
export type { CleanupOptions, CleanupResult } from "./cleanup.js";

// Logger utilities
export {
  createLogger,
  setGlobalLogLevel,
  getGlobalLogLevel,
  logger,
} from "./logger.js";
export type { Logger, LogLevel, LoggerOptions } from "./logger.js";

// Git utilities
export {
  execGit,
  execGitSuccess,
  execGhJson,
  detectRepoId,
  detectRepoIdFromGit,
  detectRepoIdFromPackageJson,
  parseGitConfigForOrigin,
  parseGitUrl,
  getRepoIdSync,
} from "./git.js";
export type { RepoIdResult } from "./git.js";
