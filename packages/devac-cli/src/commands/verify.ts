/**
 * Verify Command Implementation
 *
 * Verifies seed file integrity.
 * Based on spec Section 11.1: Package Commands - Maintenance
 */

import * as path from "node:path";
import { DuckDBPool, SeedReader } from "@pietgk/devac-core";
import type { Command } from "commander";
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

/**
 * Register the verify command with the CLI program
 */
export function registerVerifyCommand(program: Command): void {
  program
    .command("verify")
    .description("Verify seed file integrity")
    .option("-p, --package <path>", "Package path to verify", process.cwd())
    .option("-b, --branch <name>", "Git branch name", "base")
    .action(async (options) => {
      const result = await verifyCommand({
        packagePath: path.resolve(options.package),
        branch: options.branch,
      });

      if (result.valid) {
        console.log("✓ Seeds verified successfully");

        if (result.stats) {
          console.log(`  Nodes: ${result.stats.nodeCount}`);
          console.log(`  Edges: ${result.stats.edgeCount}`);
          console.log(`  External refs: ${result.stats.refCount}`);
          console.log(`  Files: ${result.stats.fileCount}`);

          if (result.stats.unresolvedRefs > 0) {
            console.log(`  Unresolved refs: ${result.stats.unresolvedRefs}`);
          }
          if (result.stats.orphanedEdges > 0) {
            console.log(`  Orphaned edges: ${result.stats.orphanedEdges}`);
          }
        }

        if (result.warnings.length > 0) {
          console.log("\nWarnings:");
          for (const warning of result.warnings) {
            console.log(`  ⚠ ${warning}`);
          }
        }
      } else {
        console.error("✗ Verification failed:");
        for (const error of result.errors) {
          console.error(`  • ${error}`);
        }
        process.exit(1);
      }
    });
}
