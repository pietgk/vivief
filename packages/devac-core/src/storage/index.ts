/**
 * Storage Module Exports
 *
 * DuckDB + Parquet storage layer for DevAC v2.0
 */

// Connection pool
export {
  DuckDBPool,
  isFatalError,
  executeWithRecovery,
  getDefaultPool,
  shutdownDefaultPool,
  getPoolStats,
  assertPoolClean,
} from "./duckdb-pool.js";
export type { PoolStats, PoolConfig } from "./duckdb-pool.js";

// Parquet schemas
export {
  NODES_SCHEMA,
  EDGES_SCHEMA,
  EXTERNAL_REFS_SCHEMA,
  EFFECTS_SCHEMA,
  INDEXES,
  PARQUET_OPTIONS,
  initializeSchemas,
  getCopyToParquet,
  getReadFromParquet,
  getUnifiedQuery,
} from "./parquet-schemas.js";

// File locking
export {
  acquireLock,
  releaseLock,
  isLockStale,
  withLock,
  withSeedLock,
  getLockInfo,
  forceReleaseLock,
} from "./file-lock.js";
export type { LockInfo, LockOptions } from "./file-lock.js";

// Seed writer
export { SeedWriter, createSeedWriter } from "./seed-writer.js";
export type {
  WriteOptions,
  WriteResult,
  ResolvedRefUpdate,
  ResolvedCallEdgeUpdate,
  UpdateResolvedCallEdgesResult,
} from "./seed-writer.js";

// Seed reader
export {
  SeedReader,
  createSeedReader,
  queryMultiplePackages,
} from "./seed-reader.js";
export type { QueryResult, IntegrityResult } from "./seed-reader.js";

// Unified query (v3.0 - recommended for new code)
export { query } from "./unified-query.js";
export type {
  QueryConfig,
  QueryResult as UnifiedQueryResult,
} from "./unified-query.js";

// Query context (legacy - use query() for new code)
export {
  setupQueryContext,
  preprocessSql,
  discoverPackagesInRepo,
  buildPackageMap,
  queryWithContext,
} from "./query-context.js";
export type {
  QueryContextConfig,
  QueryContextResult,
  DiscoveredPackage,
  ContextQueryResult,
} from "./query-context.js";

// Effect writer (v3.0 foundation)
export { EffectWriter, createEffectWriter } from "./effect-writer.js";
export type { EffectWriteOptions, EffectWriteResult } from "./effect-writer.js";

// Effect reader (v3.0 foundation)
export { EffectReader, createEffectReader } from "./effect-reader.js";
export type {
  EffectFilter,
  EffectReadResult,
  EffectStatistics,
} from "./effect-reader.js";
