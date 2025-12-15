/**
 * DuckDB Connection Pool
 *
 * Manages DuckDB connections with pooling, memory limits, and error recovery.
 * Based on DevAC v2.0 spec Section 5.6.
 */

import * as os from "node:os";
import { type Connection, Database } from "duckdb-async";

/**
 * Pool statistics for monitoring
 */
export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  totalAcquires: number;
  totalReleases: number;
  failedAcquires: number;
}

/**
 * Pool configuration options
 */
export interface PoolConfig {
  /** Maximum number of connections (default: 4) */
  maxConnections: number;
  /** Memory limit per connection (default: "512MB") */
  memoryLimit: string;
  /** Temp directory for spill-to-disk (default: system temp) */
  tempDirectory: string;
  /** Number of threads DuckDB can use (default: CPU cores / 2) */
  threads: number;
  /** Connection idle timeout in ms (default: 30000) */
  idleTimeoutMs: number;
}

/**
 * DuckDB connection wrapper with metadata
 */
interface PooledConnection {
  connection: Connection;
  createdAt: number;
  lastUsedAt: number;
  inUse: boolean;
}

/**
 * Default pool configuration based on spec Section 5.6
 */
const DEFAULT_CONFIG: PoolConfig = {
  maxConnections: 4,
  memoryLimit: process.env.DEVAC_DUCKDB_MEMORY || "512MB",
  tempDirectory: process.env.DEVAC_DUCKDB_TEMP || os.tmpdir(),
  threads: Math.max(1, Math.floor(os.cpus().length / 2)),
  idleTimeoutMs: 30000,
};

/**
 * DuckDB Connection Pool
 *
 * Provides connection pooling for DuckDB with:
 * - Configurable pool size
 * - Memory management
 * - Error recovery for fatal DuckDB errors
 * - Automatic cleanup of idle connections
 */
export class DuckDBPool {
  private db: Database | null = null;
  private connections: PooledConnection[] = [];
  private waitQueue: Array<{
    resolve: (conn: Connection) => void;
    reject: (err: Error) => void;
  }> = [];
  private config: PoolConfig;
  private stats: PoolStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    totalAcquires: 0,
    totalReleases: 0,
    failedAcquires: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the pool with an in-memory DuckDB database
   */
  async initialize(): Promise<void> {
    if (this.db) {
      return; // Already initialized
    }

    // Create in-memory database with configuration
    this.db = await Database.create(":memory:");

    // Configure DuckDB settings
    const conn = await this.db.connect();
    try {
      await conn.run(`SET memory_limit = '${this.config.memoryLimit}'`);
      await conn.run(`SET temp_directory = '${this.config.tempDirectory}'`);
      await conn.run(`SET threads = ${this.config.threads}`);
      // Enable progress bar for long operations
      await conn.run("SET enable_progress_bar = true");
    } finally {
      await conn.close();
    }

    // Start cleanup interval
    this.cleanupInterval = setInterval(
      () => this.cleanupIdleConnections(),
      this.config.idleTimeoutMs
    );
  }

  /**
   * Acquire a connection from the pool
   *
   * If no connections are available and pool is not at max capacity,
   * creates a new connection. Otherwise waits for one to become available.
   */
  async acquire(): Promise<Connection> {
    if (this.isShuttingDown) {
      this.stats.failedAcquires++;
      throw new Error("Pool is shutting down");
    }

    if (!this.db) {
      await this.initialize();
    }

    this.stats.totalAcquires++;

    // Try to find an idle connection
    const idleConn = this.connections.find((c) => !c.inUse);
    if (idleConn) {
      idleConn.inUse = true;
      idleConn.lastUsedAt = Date.now();
      this.updateStats();
      return idleConn.connection;
    }

    // Create new connection if under limit
    if (this.connections.length < this.config.maxConnections) {
      if (!this.db) {
        throw new Error("Database not initialized");
      }
      const connection = await this.db.connect();
      const pooledConn: PooledConnection = {
        connection,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        inUse: true,
      };
      this.connections.push(pooledConn);
      this.updateStats();
      return connection;
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this.waitQueue.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) {
          this.waitQueue.splice(idx, 1);
        }
        this.stats.failedAcquires++;
        reject(new Error("Connection acquire timeout"));
      }, 30000); // 30 second timeout

      this.waitQueue.push({
        resolve: (conn) => {
          clearTimeout(timeout);
          resolve(conn);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
    });
  }

  /**
   * Release a connection back to the pool
   */
  release(conn: Connection): void {
    const pooledConn = this.connections.find((c) => c.connection === conn);
    if (!pooledConn) {
      // Connection not from this pool, ignore
      return;
    }

    this.stats.totalReleases++;
    pooledConn.inUse = false;
    pooledConn.lastUsedAt = Date.now();

    // If there are waiters, give them the connection
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      if (!waiter) return;
      pooledConn.inUse = true;
      pooledConn.lastUsedAt = Date.now();
      waiter.resolve(conn);
    }

    this.updateStats();
  }

  /**
   * Mark a connection as failed (e.g., after DuckDB fatal error)
   * This removes the connection from the pool without returning it
   */
  async markFailed(conn: Connection): Promise<void> {
    const idx = this.connections.findIndex((c) => c.connection === conn);
    if (idx !== -1) {
      this.connections.splice(idx, 1);
      try {
        await conn.close();
      } catch {
        // Ignore close errors on failed connection
      }
    }
    this.updateStats();
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return { ...this.stats };
  }

  /**
   * Shutdown the pool and close all connections
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Reject all waiters
    for (const waiter of this.waitQueue) {
      waiter.reject(new Error("Pool is shutting down"));
    }
    this.waitQueue = [];

    // Close all connections
    for (const pooledConn of this.connections) {
      try {
        await pooledConn.connection.close();
      } catch {
        // Ignore close errors during shutdown
      }
    }
    this.connections = [];

    // Close database
    if (this.db) {
      await this.db.close();
      this.db = null;
    }

    this.updateStats();
  }

  /**
   * Clean up idle connections that have exceeded the timeout
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    const toRemove: PooledConnection[] = [];

    for (const pooledConn of this.connections) {
      if (
        !pooledConn.inUse &&
        now - pooledConn.lastUsedAt > this.config.idleTimeoutMs &&
        this.connections.length > 1 // Keep at least one connection
      ) {
        toRemove.push(pooledConn);
      }
    }

    for (const pooledConn of toRemove) {
      const idx = this.connections.indexOf(pooledConn);
      if (idx !== -1) {
        this.connections.splice(idx, 1);
        pooledConn.connection.close().catch(() => {
          // Ignore close errors
        });
      }
    }

    this.updateStats();
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.totalConnections = this.connections.length;
    this.stats.activeConnections = this.connections.filter((c) => c.inUse).length;
    this.stats.idleConnections = this.connections.filter((c) => !c.inUse).length;
  }
}

/**
 * Check if an error is a DuckDB fatal error
 * Fatal errors require connection replacement
 */
export function isFatalError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("fatal") ||
      message.includes("out of memory") ||
      message.includes("database is locked") ||
      message.includes("connection closed")
    );
  }
  return false;
}

/**
 * Execute an operation with automatic error recovery
 *
 * If the operation fails with a fatal error, marks the connection as failed
 * and retries with a fresh connection.
 */
export async function executeWithRecovery<T>(
  pool: DuckDBPool,
  operation: (conn: Connection) => Promise<T>
): Promise<T> {
  const conn = await pool.acquire();
  try {
    return await operation(conn);
  } catch (error) {
    if (isFatalError(error)) {
      // Connection is unusable - don't return to pool
      await pool.markFailed(conn);

      // Retry with fresh connection
      const freshConn = await pool.acquire();
      try {
        return await operation(freshConn);
      } finally {
        pool.release(freshConn);
      }
    }
    throw error;
  } finally {
    // Only release if we still have the original connection
    // (not already marked as failed)
    pool.release(conn);
  }
}

// Singleton pool instance
let defaultPool: DuckDBPool | null = null;

/**
 * Get the default pool instance
 */
export function getDefaultPool(): DuckDBPool {
  if (!defaultPool) {
    defaultPool = new DuckDBPool();
  }
  return defaultPool;
}

/**
 * Shutdown the default pool
 */
export async function shutdownDefaultPool(): Promise<void> {
  if (defaultPool) {
    await defaultPool.shutdown();
    defaultPool = null;
  }
}
