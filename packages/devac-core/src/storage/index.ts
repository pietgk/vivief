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
export type { WriteOptions, WriteResult } from "./seed-writer.js";

// Seed reader
export {
  SeedReader,
  createSeedReader,
  queryMultiplePackages,
} from "./seed-reader.js";
export type { QueryResult, IntegrityResult } from "./seed-reader.js";
