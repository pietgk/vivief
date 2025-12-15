/**
 * DevAC Core - Federated Code Analysis Engine
 *
 * DuckDB + Parquet based code analysis system.
 * Replaces Neo4j with file-based storage.
 *
 * @module @devac/core
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

// Resolver
export * from "./resolver/index.js";

// Watcher
export * from "./watcher/index.js";

// Hub (Federation)
export * from "./hub/index.js";

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
// Use: import { SymbolInfo as ValidationSymbolInfo } from "@devac/core/validation" if needed

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
