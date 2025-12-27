/**
 * Effect Writer Implementation
 *
 * Atomic Parquet writes for effect data using temp + rename + fsync pattern.
 * Based on DevAC v3.0 Foundation - Effect Store.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Connection } from "duckdb-async";
import { type SeedPaths, getSeedPaths } from "../types/config.js";
import type { CodeEffect } from "../types/index.js";
import { type DuckDBPool, executeWithRecovery } from "./duckdb-pool.js";
import { withSeedLock } from "./file-lock.js";
import { EFFECTS_SCHEMA, getCopyToParquet } from "./parquet-schemas.js";

/**
 * Write options for effects
 */
export interface EffectWriteOptions {
  /** Target branch (default: "base") */
  branch?: string;
  /** Force write even if no effects */
  force?: boolean;
}

/**
 * Write result statistics
 */
export interface EffectWriteResult {
  success: boolean;
  effectsWritten: number;
  timeMs: number;
  error?: string;
}

/**
 * Effect Writer
 *
 * Handles atomic writes of code effects to Parquet files.
 * Uses file locking and temp+rename pattern for safety.
 */
export class EffectWriter {
  constructor(
    private pool: DuckDBPool,
    private packagePath: string
  ) {}

  /**
   * Write effects to Parquet file
   *
   * This is an atomic operation that:
   * 1. Acquires a file lock on the seed directory
   * 2. Creates tables in in-memory DuckDB
   * 3. Inserts all data
   * 4. Writes to temp files
   * 5. Atomically renames to final locations
   * 6. Releases the lock
   */
  async writeEffects(
    effects: CodeEffect[],
    sourceFileHash: string,
    filePath: string,
    options: EffectWriteOptions = {}
  ): Promise<EffectWriteResult> {
    const startTime = Date.now();
    const branch = options.branch ?? "base";
    const paths = getSeedPaths(this.packagePath, branch);

    if (effects.length === 0 && !options.force) {
      return {
        success: true,
        effectsWritten: 0,
        timeMs: Date.now() - startTime,
      };
    }

    try {
      // Ensure directories exist
      await this.ensureDirectories(paths, branch);

      // Perform atomic write under lock
      const writeResult = await withSeedLock(paths.seedRoot, async () => {
        return await executeWithRecovery(this.pool, async (conn) => {
          return await this.performAtomicWrite(
            conn,
            effects,
            sourceFileHash,
            filePath,
            paths,
            branch
          );
        });
      });

      return {
        ...writeResult,
        success: true,
        timeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        effectsWritten: 0,
        timeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Delete effects for specific source files
   */
  async deleteEffectsForFile(
    sourceFilePaths: string[],
    options: EffectWriteOptions = {}
  ): Promise<EffectWriteResult> {
    const startTime = Date.now();
    const branch = options.branch ?? "base";
    const paths = getSeedPaths(this.packagePath, branch);

    try {
      // For base branch, rewrite excluding deleted files
      if (branch === "base") {
        return await this.rewriteExcluding(sourceFilePaths, paths, startTime);
      }

      // For feature branches, mark as deleted
      const result = await withSeedLock(paths.seedRoot, async () => {
        return await executeWithRecovery(this.pool, async (conn) => {
          return await this.markFilesDeleted(conn, sourceFilePaths, paths, branch);
        });
      });

      return {
        ...result,
        success: true,
        timeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        effectsWritten: 0,
        timeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Ensure seed directories exist
   */
  private async ensureDirectories(paths: SeedPaths, branch: string): Promise<void> {
    const targetPath = branch === "base" ? paths.basePath : paths.branchPath;
    await fs.mkdir(targetPath, { recursive: true });
  }

  /**
   * Perform atomic write of effects
   */
  private async performAtomicWrite(
    conn: Connection,
    effects: CodeEffect[],
    sourceFileHash: string,
    filePath: string,
    paths: SeedPaths,
    branch: string
  ): Promise<{ effectsWritten: number }> {
    // Initialize schema
    await conn.run(EFFECTS_SCHEMA);

    // Clear existing data for this file
    await conn.run("DELETE FROM effects WHERE source_file_path = ?", filePath);

    // Insert new effects
    if (effects.length > 0) {
      const insertStmt = await conn.prepare(this.getInsertStatement());

      for (const effect of effects) {
        const values = this.effectToRow(effect, sourceFileHash, branch);
        await insertStmt.run(...values);
      }

      await insertStmt.finalize();
    }

    // Write to temp file
    const tempPath = `${paths.effectsParquet}.tmp`;
    await conn.run(getCopyToParquet("effects", tempPath));

    // Atomic rename
    await fs.rename(tempPath, paths.effectsParquet);

    // Fsync directory for durability
    const dir = path.dirname(paths.effectsParquet);
    const handle = await fs.open(dir, "r");
    await handle.sync();
    await handle.close();

    return { effectsWritten: effects.length };
  }

  /**
   * Rewrite effects excluding specified files
   */
  private async rewriteExcluding(
    sourceFilePaths: string[],
    paths: SeedPaths,
    startTime: number
  ): Promise<EffectWriteResult> {
    try {
      // Check if effects file exists
      try {
        await fs.access(paths.effectsParquet);
      } catch {
        // No effects file, nothing to delete
        return {
          success: true,
          effectsWritten: 0,
          timeMs: Date.now() - startTime,
        };
      }

      const result = await withSeedLock(paths.seedRoot, async () => {
        return await executeWithRecovery(this.pool, async (conn) => {
          // Read existing effects
          await conn.run(EFFECTS_SCHEMA);
          await conn.run(
            `INSERT INTO effects SELECT * FROM read_parquet('${paths.effectsParquet}')`
          );

          // Delete effects for specified files
          for (const fp of sourceFilePaths) {
            await conn.run("DELETE FROM effects WHERE source_file_path = ?", fp);
          }

          // Get remaining count
          const countResult = await conn.all("SELECT COUNT(*) as count FROM effects");
          const count = Number(countResult[0]?.count ?? 0);

          if (count > 0) {
            // Write back
            const tempPath = `${paths.effectsParquet}.tmp`;
            await conn.run(getCopyToParquet("effects", tempPath));
            await fs.rename(tempPath, paths.effectsParquet);
          } else {
            // Remove empty file
            await fs.unlink(paths.effectsParquet);
          }

          return { effectsWritten: 0 };
        });
      });

      return {
        ...result,
        success: true,
        timeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        effectsWritten: 0,
        timeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Mark effects as deleted in branch partition
   */
  private async markFilesDeleted(
    conn: Connection,
    sourceFilePaths: string[],
    paths: SeedPaths,
    _branch: string
  ): Promise<{ effectsWritten: number }> {
    await conn.run(EFFECTS_SCHEMA);

    // Load existing branch effects if any
    try {
      await conn.run(`INSERT INTO effects SELECT * FROM read_parquet('${paths.effectsParquet}')`);
    } catch {
      // No existing branch effects
    }

    // Mark as deleted
    for (const fp of sourceFilePaths) {
      await conn.run("UPDATE effects SET is_deleted = true WHERE source_file_path = ?", fp);
    }

    // Write back
    const tempPath = `${paths.effectsParquet}.tmp`;
    await conn.run(getCopyToParquet("effects", tempPath));
    await fs.rename(tempPath, paths.effectsParquet);

    return { effectsWritten: 0 };
  }

  /**
   * Get INSERT statement for effects
   */
  private getInsertStatement(): string {
    return `
      INSERT INTO effects (
        effect_id, effect_type, timestamp, source_entity_id,
        source_file_path, source_line, source_column, branch, properties,
        target_entity_id, callee_name, callee_qualified_name,
        is_method_call, is_async, is_constructor, argument_count,
        is_external, external_module, store_type, retrieve_type,
        send_type, operation, target_resource, provider,
        request_type, response_type, method, route_pattern, framework,
        target, is_third_party, service_name, status_code, content_type,
        condition_type, branch_count, has_default, loop_type,
        group_type, group_name, description, technology, parent_group_id,
        source_file_hash, is_deleted, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
  }

  /**
   * Convert effect to row values for INSERT
   */
  private effectToRow(effect: CodeEffect, sourceFileHash: string, branch: string): unknown[] {
    const base = [
      effect.effect_id,
      effect.effect_type,
      effect.timestamp,
      effect.source_entity_id,
      effect.source_file_path,
      effect.source_line,
      effect.source_column,
      branch,
      JSON.stringify(effect.properties),
    ];

    // Type-specific fields with defaults
    const typeFields = this.getTypeSpecificFields(effect);

    return [
      ...base,
      ...typeFields,
      sourceFileHash,
      false, // is_deleted
      new Date().toISOString(), // updated_at
    ];
  }

  /**
   * Get type-specific fields for an effect
   */
  private getTypeSpecificFields(effect: CodeEffect): (string | number | boolean | null)[] {
    // Initialize all type-specific fields to null
    const fields: Record<string, string | number | boolean | null> = {
      target_entity_id: null,
      callee_name: null,
      callee_qualified_name: null,
      is_method_call: null,
      is_async: null,
      is_constructor: null,
      argument_count: null,
      is_external: null,
      external_module: null,
      store_type: null,
      retrieve_type: null,
      send_type: null,
      operation: null,
      target_resource: null,
      provider: null,
      request_type: null,
      response_type: null,
      method: null,
      route_pattern: null,
      framework: null,
      target: null,
      is_third_party: null,
      service_name: null,
      status_code: null,
      content_type: null,
      condition_type: null,
      branch_count: null,
      has_default: null,
      loop_type: null,
      group_type: null,
      group_name: null,
      description: null,
      technology: null,
      parent_group_id: null,
    };

    // Set type-specific fields based on effect type
    switch (effect.effect_type) {
      case "FunctionCall":
        fields.target_entity_id = effect.target_entity_id;
        fields.callee_name = effect.callee_name;
        fields.callee_qualified_name = effect.callee_qualified_name;
        fields.is_method_call = effect.is_method_call;
        fields.is_async = effect.is_async;
        fields.is_constructor = effect.is_constructor;
        fields.argument_count = effect.argument_count;
        fields.is_external = effect.is_external;
        fields.external_module = effect.external_module;
        break;

      case "Store":
        fields.store_type = effect.store_type;
        fields.operation = effect.operation;
        fields.target_resource = effect.target_resource;
        fields.provider = effect.provider;
        break;

      case "Retrieve":
        fields.retrieve_type = effect.retrieve_type;
        fields.operation = effect.operation;
        fields.target_resource = effect.target_resource;
        fields.provider = effect.provider;
        break;

      case "Send":
        fields.send_type = effect.send_type;
        fields.method = effect.method;
        fields.target = effect.target;
        fields.is_third_party = effect.is_third_party;
        fields.service_name = effect.service_name;
        break;

      case "Request":
        fields.request_type = effect.request_type;
        fields.method = effect.method;
        fields.route_pattern = effect.route_pattern;
        fields.framework = effect.framework;
        break;

      case "Response":
        fields.response_type = effect.response_type;
        fields.status_code = effect.status_code;
        fields.content_type = effect.content_type;
        break;

      case "Condition":
        fields.condition_type = effect.condition_type;
        fields.branch_count = effect.branch_count;
        fields.has_default = effect.has_default;
        break;

      case "Loop":
        fields.loop_type = effect.loop_type;
        fields.is_async = effect.is_async;
        break;

      case "Group":
        fields.group_type = effect.group_type;
        fields.group_name = effect.group_name;
        fields.description = effect.description;
        fields.technology = effect.technology;
        fields.parent_group_id = effect.parent_group_id;
        break;
    }

    // Return values in the correct order
    return [
      fields.target_entity_id ?? null,
      fields.callee_name ?? null,
      fields.callee_qualified_name ?? null,
      fields.is_method_call ?? null,
      fields.is_async ?? null,
      fields.is_constructor ?? null,
      fields.argument_count ?? null,
      fields.is_external ?? null,
      fields.external_module ?? null,
      fields.store_type ?? null,
      fields.retrieve_type ?? null,
      fields.send_type ?? null,
      fields.operation ?? null,
      fields.target_resource ?? null,
      fields.provider ?? null,
      fields.request_type ?? null,
      fields.response_type ?? null,
      fields.method ?? null,
      fields.route_pattern ?? null,
      fields.framework ?? null,
      fields.target ?? null,
      fields.is_third_party ?? null,
      fields.service_name ?? null,
      fields.status_code ?? null,
      fields.content_type ?? null,
      fields.condition_type ?? null,
      fields.branch_count ?? null,
      fields.has_default ?? null,
      fields.loop_type ?? null,
      fields.group_type ?? null,
      fields.group_name ?? null,
      fields.description ?? null,
      fields.technology ?? null,
      fields.parent_group_id ?? null,
    ];
  }
}

/**
 * Create an effect writer for a package
 */
export function createEffectWriter(pool: DuckDBPool, packagePath: string): EffectWriter {
  return new EffectWriter(pool, packagePath);
}
