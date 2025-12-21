/**
 * DevAC Core - Federated Code Analysis Engine
 *
 * DuckDB + Parquet based code analysis system.
 * Replaces Neo4j with file-based storage.
 *
 * @module @pietgk/devac-core
 */

// Types (base types)
export * from "./types/index.js";

// Storage (excludes StructuralParseResult which is re-exported from parsers)
export {
  DuckDBPool,
  isFatalError,
  executeWithRecovery,
  getDefaultPool,
  shutdownDefaultPool,
  getPoolStats,
  assertPoolClean,
  NODES_SCHEMA,
  EDGES_SCHEMA,
  EXTERNAL_REFS_SCHEMA,
  INDEXES,
  PARQUET_OPTIONS,
  initializeSchemas,
  getCopyToParquet,
  getReadFromParquet,
  getUnifiedQuery,
  acquireLock,
  releaseLock,
  isLockStale,
  withLock,
  withSeedLock,
  getLockInfo,
  forceReleaseLock,
  SeedWriter,
  createSeedWriter,
  SeedReader,
  createSeedReader,
  queryMultiplePackages,
} from "./storage/index.js";
export type {
  PoolStats,
  PoolConfig,
  LockInfo,
  LockOptions,
  WriteOptions,
  WriteResult,
  QueryResult,
  IntegrityResult,
} from "./storage/index.js";

// Analyzer (excludes generateScopeHash which conflicts with utils)
export {
  generateEntityId,
  normalizeComponent,
  normalizePathComponent,
  parseEntityId,
  isValidEntityId,
  entityIdsMatch,
  getRepoFromEntityId,
  getPackagePathFromEntityId,
  getKindFromEntityId,
  createEntityIdGenerator,
  generateEntityIdsForFile,
  deriveChildEntityId,
  LanguageRouter,
  createLanguageRouter,
  getDefaultRouter,
  resetDefaultRouter,
  DEFAULT_EXTENSION_MAP,
  createAnalysisOrchestrator,
} from "./analyzer/index.js";
export type {
  EntityIdComponents,
  ParsedEntityId,
  AnalysisOrchestrator,
  FileChangeEvent,
  AnalysisResult,
  PackageResult,
  BatchResult,
  ResolutionResult,
  OrchestratorStatus,
  OrchestratorOptions,
} from "./analyzer/index.js";

// Parsers
export * from "./parsers/index.js";

// Semantic Resolution (compiler-grade - ts-morph, Pyright, Roslyn)
export * from "./semantic/index.js";

// Configuration (Zod schemas and utilities)
export * from "./config/index.js";

// Watcher
export * from "./watcher/index.js";

// Hub (Federation)
export * from "./hub/index.js";

// Context Discovery
export * from "./context/index.js";

// Workspace (DevAC v3 Phase 1)
// Note: Explicit exports to avoid conflicts with context module
export {
  // Core types (workspace-specific, no conflicts)
  type WorkspaceInfo,
  type WorkspaceRepoInfo,
  type WorkspaceConfig,
  type WorkspaceState,
  type WorkspaceRepoState,
  type RepoHubStatus,
  // Event types
  type WorkspaceEvent,
  type WorkspaceEventBase,
  type FileChangeEvent as WorkspaceFileChangeEvent,
  type SeedChangeEvent,
  type HubRefreshEvent,
  type RepoDiscoveryEvent,
  type WatcherStateEvent,
  type WorkspaceEventHandler,
  // Options types
  type WorkspaceDiscoveryOptions,
  type WorkspaceWatcherOptions,
  type WorkspaceManagerOptions,
  type AutoRefreshOptions,
  // Workspace-specific functions
  isWorkspaceDirectory,
  discoverWorkspaceRepos,
  discoverWorkspace,
  loadWorkspaceConfig,
  formatWorkspaceInfo,
  // State management
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
  // Seed detector
  createSeedDetector,
  type SeedDetector,
  type SeedDetectorOptions,
  type SeedChangeHandler,
  type SeedDetectorStats,
  // Workspace watcher
  createWorkspaceWatcher,
  type WorkspaceWatcher,
  type WorkspaceWatcherStats,
  // Auto-refresh
  createAutoRefresher,
  type AutoRefresher,
  type RefreshEventHandler,
  type AutoRefreshStats,
  // Manager
  createWorkspaceManager,
  type WorkspaceManager,
  type WorkspaceManagerStats,
} from "./workspace/index.js";

// Validation (explicit exports to avoid SymbolInfo conflict with parsers)
export {
  SymbolAffectedAnalyzer,
  createSymbolAffectedAnalyzer,
  IssueEnricher,
  createIssueEnricher,
  TypecheckValidator,
  createTypecheckValidator,
  LintValidator,
  createLintValidator,
  TestValidator,
  createTestValidator,
  ValidationCoordinator,
  createValidationCoordinator,
} from "./validation/index.js";
export type {
  ChangedSymbol,
  AffectedFile,
  SymbolAffectedResult,
  SymbolAffectedOptions,
  ValidationIssue,
  EnrichedIssue,
  EnrichmentOptions,
  CallerInfo,
  GetCallersOptions,
  TypecheckOptions,
  TypecheckResult,
  LintOptions,
  LintResult,
  TestOptions,
  TestResult,
  ValidationMode,
  ValidationConfig,
  ValidationCoordinatorResult,
} from "./validation/index.js";
// Note: SymbolInfo from validation is not exported to avoid conflict with parsers/SymbolInfo
// Use: import { SymbolInfo as ValidationSymbolInfo } from "@pietgk/devac-core/validation" if needed

// Utils (excludes generateScopeHash which is also in analyzer)
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
  computeStringHash,
  computeBufferHash,
  computeFileHash,
  computeFileHashes,
  hasFileChanged,
  findChangedFiles,
  generateRandomHash,
  combineHashes,
  cleanupPackageSeeds,
  findOrphanedSeeds,
  removeAllSeeds,
  cleanupOrphanedFiles,
  getSeedStorageStats,
  verifySeedStructure,
  createLogger,
  setGlobalLogLevel,
  getGlobalLogLevel,
  logger,
} from "./utils/index.js";
export type {
  AtomicWriteOptions,
  CleanupOptions,
  CleanupResult,
  Logger,
  LogLevel,
  LoggerOptions,
} from "./utils/index.js";

/**
 * DevAC Core Version
 */
export const VERSION = "0.1.0";
