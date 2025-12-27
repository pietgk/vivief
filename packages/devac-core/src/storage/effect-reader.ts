/**
 * Effect Reader Implementation
 *
 * Query interface for reading effects from Parquet files.
 * Based on DevAC v3.0 Foundation - Effect Store.
 */

import * as fs from "node:fs/promises";
import { getSeedPaths } from "../types/config.js";
import type { CodeEffect, EffectType } from "../types/index.js";
import { type DuckDBPool, executeWithRecovery } from "./duckdb-pool.js";

/**
 * Filter options for reading effects
 */
export interface EffectFilter {
  /** Filter by effect type */
  effectType?: EffectType | EffectType[];
  /** Filter by source entity ID */
  sourceEntityId?: string;
  /** Filter by target entity ID */
  targetEntityId?: string;
  /** Filter by source file path */
  sourceFilePath?: string;
  /** Filter by whether it's an external call */
  isExternal?: boolean;
  /** Filter by callee name pattern */
  calleeNamePattern?: string;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Effect read result
 */
export interface EffectReadResult {
  effects: CodeEffect[];
  totalCount: number;
  hasMore: boolean;
}

/**
 * Effect Reader
 *
 * Provides query access to effects stored in Parquet files.
 */
export class EffectReader {
  constructor(
    private pool: DuckDBPool,
    private packagePath: string
  ) {}

  /**
   * Read all effects
   */
  async readEffects(filter?: EffectFilter): Promise<EffectReadResult> {
    const paths = getSeedPaths(this.packagePath);

    // Check if effects file exists
    try {
      await fs.access(paths.effectsParquet);
    } catch {
      return { effects: [], totalCount: 0, hasMore: false };
    }

    return await executeWithRecovery(this.pool, async (conn) => {
      // Build WHERE clause
      const { whereClause, params } = this.buildWhereClause(filter);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as count
        FROM read_parquet('${paths.effectsParquet}')
        WHERE is_deleted = false ${whereClause}
      `;
      const countResult = await conn.all(countQuery, ...params);
      const totalCount = Number(countResult[0]?.count ?? 0);

      // Build main query
      let query = `
        SELECT *
        FROM read_parquet('${paths.effectsParquet}')
        WHERE is_deleted = false ${whereClause}
        ORDER BY timestamp DESC
      `;

      if (filter?.limit) {
        query += ` LIMIT ${filter.limit}`;
      }
      if (filter?.offset) {
        query += ` OFFSET ${filter.offset}`;
      }

      const rows = await conn.all(query, ...params);
      const effects = rows.map((row) => this.rowToEffect(row));

      const offset = filter?.offset ?? 0;
      const hasMore = offset + effects.length < totalCount;

      return { effects, totalCount, hasMore };
    });
  }

  /**
   * Read effects by type
   */
  async readByType(effectType: EffectType | EffectType[]): Promise<CodeEffect[]> {
    const result = await this.readEffects({ effectType });
    return result.effects;
  }

  /**
   * Read effects for a specific source entity
   */
  async readBySourceEntity(entityId: string): Promise<CodeEffect[]> {
    const result = await this.readEffects({ sourceEntityId: entityId });
    return result.effects;
  }

  /**
   * Read effects targeting a specific entity
   */
  async readByTargetEntity(entityId: string): Promise<CodeEffect[]> {
    const result = await this.readEffects({ targetEntityId: entityId });
    return result.effects;
  }

  /**
   * Read function call effects
   */
  async readFunctionCalls(filter?: Partial<EffectFilter>): Promise<CodeEffect[]> {
    const result = await this.readEffects({ ...filter, effectType: "FunctionCall" });
    return result.effects;
  }

  /**
   * Read external function calls (calls to node_modules, etc.)
   */
  async readExternalCalls(): Promise<CodeEffect[]> {
    const result = await this.readEffects({
      effectType: "FunctionCall",
      isExternal: true,
    });
    return result.effects;
  }

  /**
   * Get effect statistics
   */
  async getStatistics(): Promise<EffectStatistics> {
    const paths = getSeedPaths(this.packagePath);

    // Check if effects file exists
    try {
      await fs.access(paths.effectsParquet);
    } catch {
      return {
        totalEffects: 0,
        byType: {},
        externalCallCount: 0,
        uniqueSourceEntities: 0,
        uniqueTargetEntities: 0,
      };
    }

    return await executeWithRecovery(this.pool, async (conn) => {
      // Total count
      const totalResult = await conn.all(`
        SELECT COUNT(*) as count
        FROM read_parquet('${paths.effectsParquet}')
        WHERE is_deleted = false
      `);

      // Count by type
      const byTypeResult = await conn.all(`
        SELECT effect_type, COUNT(*) as count
        FROM read_parquet('${paths.effectsParquet}')
        WHERE is_deleted = false
        GROUP BY effect_type
      `);

      // External calls
      const externalResult = await conn.all(`
        SELECT COUNT(*) as count
        FROM read_parquet('${paths.effectsParquet}')
        WHERE is_deleted = false AND is_external = true
      `);

      // Unique source entities
      const uniqueSourceResult = await conn.all(`
        SELECT COUNT(DISTINCT source_entity_id) as count
        FROM read_parquet('${paths.effectsParquet}')
        WHERE is_deleted = false
      `);

      // Unique target entities
      const uniqueTargetResult = await conn.all(`
        SELECT COUNT(DISTINCT target_entity_id) as count
        FROM read_parquet('${paths.effectsParquet}')
        WHERE is_deleted = false AND target_entity_id IS NOT NULL
      `);

      const byType: Record<string, number> = {};
      for (const row of byTypeResult) {
        byType[row.effect_type as string] = Number(row.count);
      }

      return {
        totalEffects: Number(totalResult[0]?.count ?? 0),
        byType,
        externalCallCount: Number(externalResult[0]?.count ?? 0),
        uniqueSourceEntities: Number(uniqueSourceResult[0]?.count ?? 0),
        uniqueTargetEntities: Number(uniqueTargetResult[0]?.count ?? 0),
      };
    });
  }

  /**
   * Execute custom SQL query on effects
   */
  async query(sql: string): Promise<unknown[]> {
    const paths = getSeedPaths(this.packagePath);

    // Check if effects file exists
    try {
      await fs.access(paths.effectsParquet);
    } catch {
      return [];
    }

    return await executeWithRecovery(this.pool, async (conn) => {
      // Create view for easier querying
      await conn.run(`
        CREATE OR REPLACE VIEW effects AS
        SELECT * FROM read_parquet('${paths.effectsParquet}')
        WHERE is_deleted = false
      `);

      const results = await conn.all(sql);
      return results;
    });
  }

  /**
   * Build WHERE clause from filter
   */
  private buildWhereClause(filter?: EffectFilter): { whereClause: string; params: unknown[] } {
    if (!filter) {
      return { whereClause: "", params: [] };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.effectType) {
      if (Array.isArray(filter.effectType)) {
        const placeholders = filter.effectType.map(() => "?").join(", ");
        conditions.push(`effect_type IN (${placeholders})`);
        params.push(...filter.effectType);
      } else {
        conditions.push("effect_type = ?");
        params.push(filter.effectType);
      }
    }

    if (filter.sourceEntityId) {
      conditions.push("source_entity_id = ?");
      params.push(filter.sourceEntityId);
    }

    if (filter.targetEntityId) {
      conditions.push("target_entity_id = ?");
      params.push(filter.targetEntityId);
    }

    if (filter.sourceFilePath) {
      conditions.push("source_file_path = ?");
      params.push(filter.sourceFilePath);
    }

    if (filter.isExternal !== undefined) {
      conditions.push("is_external = ?");
      params.push(filter.isExternal);
    }

    if (filter.calleeNamePattern) {
      conditions.push("callee_name LIKE ?");
      params.push(`%${filter.calleeNamePattern}%`);
    }

    const whereClause = conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "";
    return { whereClause, params };
  }

  /**
   * Convert database row to CodeEffect
   */
  private rowToEffect(row: Record<string, unknown>): CodeEffect {
    const base = {
      effect_id: row.effect_id as string,
      timestamp: row.timestamp as string,
      source_entity_id: row.source_entity_id as string,
      source_file_path: row.source_file_path as string,
      source_line: Number(row.source_line),
      source_column: Number(row.source_column),
      branch: row.branch as string,
      properties: typeof row.properties === "string" ? JSON.parse(row.properties) : row.properties,
    };

    const effectType = row.effect_type as string;

    switch (effectType) {
      case "FunctionCall":
        return {
          ...base,
          effect_type: "FunctionCall",
          target_entity_id: row.target_entity_id as string | null,
          callee_name: row.callee_name as string,
          callee_qualified_name: row.callee_qualified_name as string | null,
          is_method_call: Boolean(row.is_method_call),
          is_async: Boolean(row.is_async),
          is_constructor: Boolean(row.is_constructor),
          argument_count: Number(row.argument_count ?? 0),
          is_external: Boolean(row.is_external),
          external_module: row.external_module as string | null,
        };

      case "Store":
        return {
          ...base,
          effect_type: "Store",
          store_type: row.store_type as "database" | "cache" | "file" | "queue" | "external",
          operation: row.operation as
            | "insert"
            | "update"
            | "upsert"
            | "delete"
            | "write"
            | "publish",
          target_resource: row.target_resource as string,
          provider: row.provider as string | null,
        };

      case "Retrieve":
        return {
          ...base,
          effect_type: "Retrieve",
          retrieve_type: row.retrieve_type as "database" | "cache" | "file" | "queue" | "external",
          operation: row.operation as
            | "select"
            | "get"
            | "read"
            | "fetch"
            | "receive"
            | "scan"
            | "query",
          target_resource: row.target_resource as string,
          provider: row.provider as string | null,
        };

      case "Send":
        return {
          ...base,
          effect_type: "Send",
          send_type: row.send_type as "http" | "email" | "sms" | "push" | "webhook" | "event",
          method: row.method as string | null,
          target: row.target as string,
          is_third_party: Boolean(row.is_third_party),
          service_name: row.service_name as string | null,
        };

      case "Request":
        return {
          ...base,
          effect_type: "Request",
          request_type: row.request_type as "http" | "graphql" | "grpc" | "websocket" | "queue",
          method: row.method as string | null,
          route_pattern: row.route_pattern as string,
          framework: row.framework as string | null,
        };

      case "Response":
        return {
          ...base,
          effect_type: "Response",
          response_type: row.response_type as "http" | "graphql" | "grpc" | "websocket",
          status_code: row.status_code ? Number(row.status_code) : null,
          content_type: row.content_type as string | null,
        };

      case "Condition":
        return {
          ...base,
          effect_type: "Condition",
          condition_type: row.condition_type as "if" | "switch" | "ternary" | "guard",
          branch_count: Number(row.branch_count ?? 1),
          has_default: Boolean(row.has_default),
        };

      case "Loop":
        return {
          ...base,
          effect_type: "Loop",
          loop_type: row.loop_type as
            | "for"
            | "for_of"
            | "for_in"
            | "while"
            | "do_while"
            | "map"
            | "filter"
            | "reduce"
            | "foreach",
          is_async: Boolean(row.is_async),
        };

      case "Group":
        return {
          ...base,
          effect_type: "Group",
          group_type: row.group_type as "System" | "Container" | "Component" | "File" | "Class",
          group_name: row.group_name as string,
          description: row.description as string | null,
          technology: row.technology as string | null,
          parent_group_id: row.parent_group_id as string | null,
        };

      default:
        // Return as generic CodeEffect - should not happen if schema is correct
        throw new Error(`Unknown effect type: ${effectType}`);
    }
  }
}

/**
 * Effect statistics
 */
export interface EffectStatistics {
  totalEffects: number;
  byType: Record<string, number>;
  externalCallCount: number;
  uniqueSourceEntities: number;
  uniqueTargetEntities: number;
}

/**
 * Create an effect reader for a package
 */
export function createEffectReader(pool: DuckDBPool, packagePath: string): EffectReader {
  return new EffectReader(pool, packagePath);
}
