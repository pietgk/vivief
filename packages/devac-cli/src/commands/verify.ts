/**
 * Verify Command Implementation
 *
 * Verifies seed file integrity.
 * Based on spec Section 11.1: Package Commands - Maintenance
 */

import { DuckDBPool, SeedReader } from "@devac/core";
import type { VerifyOptions, VerifyResult } from "./types.js";

/**
 * Verify seed integrity for a package
 *
 * Verification checks:
 * - All Parquet files readable
 * - Edge references point to existing nodes
 * - Source files have corresponding seed data
 * - No orphan temp files (.tmp)
 */
export async function verifyCommand(options: VerifyOptions): Promise<VerifyResult> {
  let pool: DuckDBPool | null = null;

  try {
    // Initialize DuckDB pool
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Create reader and validate
    const reader = new SeedReader(pool, options.packagePath);
    const branch = options.branch ?? "base";

    const integrityResult = await reader.validateIntegrity(branch);

    return {
      valid: integrityResult.valid,
      errors: integrityResult.errors,
      warnings: integrityResult.warnings,
      stats: integrityResult.stats,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}
