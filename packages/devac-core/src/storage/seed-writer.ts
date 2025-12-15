/**
 * Seed Writer Implementation
 *
 * Atomic Parquet writes for seed data using temp + rename + fsync pattern.
 * Based on DevAC v2.0 spec Section 6.4.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Connection } from "duckdb-async";
import type { StructuralParseResult } from "../parsers/parser-interface.js";
import { SCHEMA_VERSION, type SeedPaths, getSeedPaths } from "../types/config.js";
import type { ParsedEdge, ParsedExternalRef, ParsedNode } from "../types/index.js";
import { type DuckDBPool, executeWithRecovery } from "./duckdb-pool.js";
import { withSeedLock } from "./file-lock.js";
import { getCopyToParquet, initializeSchemas } from "./parquet-schemas.js";

/**
 * Write options
 */
export interface WriteOptions {
  /** Target branch (default: "base") */
  branch?: string;
  /** Force write even if no changes detected */
  force?: boolean;
}

/**
 * Write result statistics
 */
export interface WriteResult {
  success: boolean;
  nodesWritten: number;
  edgesWritten: number;
  refsWritten: number;
  filesProcessed: number;
  timeMs: number;
  error?: string;
}

/**
 * Seed Writer
 *
 * Handles atomic writes of parsed data to Parquet files.
 * Uses file locking and temp+rename pattern for safety.
 */
export class SeedWriter {
  constructor(
    private pool: DuckDBPool,
    private packagePath: string
  ) {}

  /**
   * Write structural parse results to Parquet files
   *
   * This is an atomic operation that:
   * 1. Acquires a file lock on the seed directory
   * 2. Creates tables in in-memory DuckDB
   * 3. Inserts all data
   * 4. Writes to temp files
   * 5. Atomically renames to final locations
   * 6. Releases the lock
   */
  async writeFile(result: StructuralParseResult, options: WriteOptions = {}): Promise<WriteResult> {
    const startTime = Date.now();
    const branch = options.branch ?? "base";
    const paths = getSeedPaths(this.packagePath, branch);

    try {
      // Ensure directories exist
      await this.ensureDirectories(paths);

      // Perform atomic write under lock
      const writeResult = await withSeedLock(paths.seedRoot, async () => {
        return await executeWithRecovery(this.pool, async (conn) => {
          return await this.performAtomicWrite(conn, result, paths, branch);
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
        nodesWritten: 0,
        edgesWritten: 0,
        refsWritten: 0,
        filesProcessed: 0,
        timeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Delete seeds for specific source files
   *
   * Used when files are deleted from the source.
   * Marks records as deleted in the branch partition.
   */
  async deleteFile(sourceFilePaths: string[], options: WriteOptions = {}): Promise<WriteResult> {
    const startTime = Date.now();
    const branch = options.branch ?? "base";
    const paths = getSeedPaths(this.packagePath, branch);

    if (branch === "base") {
      // For base branch, we need to remove records entirely
      // This requires a full rewrite excluding the deleted files
      return this.rewriteExcluding(sourceFilePaths, paths, startTime);
    }

    // For feature branches, mark as deleted in branch partition
    try {
      const deleteResult = await withSeedLock(paths.seedRoot, async () => {
        return await executeWithRecovery(this.pool, async (conn) => {
          return await this.markFilesDeleted(conn, sourceFilePaths, paths, branch);
        });
      });

      return {
        ...deleteResult,
        success: true,
        timeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        nodesWritten: 0,
        edgesWritten: 0,
        refsWritten: 0,
        filesProcessed: 0,
        timeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update seeds for changed files (delete old + write new atomically)
   */
  async updateFile(
    changedFiles: string[],
    result: StructuralParseResult,
    options: WriteOptions = {}
  ): Promise<WriteResult> {
    const startTime = Date.now();
    const branch = options.branch ?? "base";
    const paths = getSeedPaths(this.packagePath, branch);

    try {
      const updateResult = await withSeedLock(paths.seedRoot, async () => {
        return await executeWithRecovery(this.pool, async (conn) => {
          // For base branch: merge existing with new (replacing changed files)
          // For feature branch: write delta directly
          if (branch === "base") {
            return await this.mergeAndWrite(conn, changedFiles, result, paths, branch);
          }
          // Branch partition just stores the delta
          return await this.performAtomicWrite(conn, result, paths, branch);
        });
      });

      return {
        ...updateResult,
        success: true,
        timeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        nodesWritten: 0,
        edgesWritten: 0,
        refsWritten: 0,
        filesProcessed: 0,
        timeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Ensure all required directories exist
   */
  private async ensureDirectories(paths: SeedPaths): Promise<void> {
    await fs.mkdir(paths.basePath, { recursive: true });
    await fs.mkdir(paths.branchPath, { recursive: true });
  }

  /**
   * Perform the atomic write operation
   */
  private async performAtomicWrite(
    conn: Connection,
    result: StructuralParseResult,
    paths: SeedPaths,
    branch: string
  ): Promise<Omit<WriteResult, "success" | "timeMs" | "error">> {
    // Initialize schemas
    await initializeSchemas(conn);

    // Insert nodes
    for (const node of result.nodes) {
      await this.insertNode(conn, node);
    }

    // Insert edges
    for (const edge of result.edges) {
      await this.insertEdge(conn, edge);
    }

    // Insert external refs
    for (const ref of result.externalRefs) {
      await this.insertExternalRef(conn, ref);
    }

    // Determine output paths based on branch
    const outputPath = branch === "base" ? paths.basePath : paths.branchPath;
    const tempDir = path.join(paths.seedRoot, ".tmp");
    await fs.mkdir(tempDir, { recursive: true });

    // Generate unique temp file names
    const tempSuffix = crypto.randomBytes(8).toString("hex");
    const tempNodes = path.join(tempDir, `nodes_${tempSuffix}.parquet`);
    const tempEdges = path.join(tempDir, `edges_${tempSuffix}.parquet`);
    const tempRefs = path.join(tempDir, `external_refs_${tempSuffix}.parquet`);

    // Write to temp files
    if (result.nodes.length > 0) {
      await conn.run(getCopyToParquet("nodes", tempNodes));
    }
    if (result.edges.length > 0) {
      await conn.run(getCopyToParquet("edges", tempEdges));
    }
    if (result.externalRefs.length > 0) {
      await conn.run(getCopyToParquet("external_refs", tempRefs));
    }

    // Atomic rename to final locations
    const finalNodes = path.join(outputPath, "nodes.parquet");
    const finalEdges = path.join(outputPath, "edges.parquet");
    const finalRefs = path.join(outputPath, "external_refs.parquet");

    if (result.nodes.length > 0) {
      await this.atomicRename(tempNodes, finalNodes);
    }
    if (result.edges.length > 0) {
      await this.atomicRename(tempEdges, finalEdges);
    }
    if (result.externalRefs.length > 0) {
      await this.atomicRename(tempRefs, finalRefs);
    }

    // Write meta.json
    await this.writeMeta(paths.metaJson);

    // Cleanup temp directory
    await this.cleanupTempDir(tempDir);

    return {
      nodesWritten: result.nodes.length,
      edgesWritten: result.edges.length,
      refsWritten: result.externalRefs.length,
      filesProcessed: 1, // Single file per parse result
    };
  }

  /**
   * Insert a node into the DuckDB table
   */
  private async insertNode(conn: Connection, node: ParsedNode): Promise<void> {
    const sql = `
      INSERT INTO nodes (
        entity_id, name, qualified_name, kind, file_path,
        start_line, end_line, start_column, end_column,
        is_exported, is_default_export, visibility,
        is_async, is_generator, is_static, is_abstract,
        type_signature, documentation, decorators, type_parameters,
        properties, source_file_hash, branch, is_deleted, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await conn.run(
      sql,
      node.entity_id,
      node.name,
      node.qualified_name,
      node.kind,
      node.file_path,
      node.start_line,
      node.end_line,
      node.start_column,
      node.end_column,
      node.is_exported,
      node.is_default_export,
      node.visibility,
      node.is_async,
      node.is_generator,
      node.is_static,
      node.is_abstract,
      node.type_signature,
      node.documentation,
      JSON.stringify(node.decorators),
      JSON.stringify(node.type_parameters),
      JSON.stringify(node.properties),
      node.source_file_hash,
      node.branch,
      node.is_deleted,
      node.updated_at
    );
  }

  /**
   * Insert an edge into the DuckDB table
   */
  private async insertEdge(conn: Connection, edge: ParsedEdge): Promise<void> {
    const sql = `
      INSERT INTO edges (
        source_entity_id, target_entity_id, edge_type,
        source_file_path, source_line, source_column,
        properties, source_file_hash, branch, is_deleted, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await conn.run(
      sql,
      edge.source_entity_id,
      edge.target_entity_id,
      edge.edge_type,
      edge.source_file_path,
      edge.source_line,
      edge.source_column,
      JSON.stringify(edge.properties),
      edge.source_file_hash,
      edge.branch,
      edge.is_deleted,
      edge.updated_at
    );
  }

  /**
   * Insert an external reference into the DuckDB table
   */
  private async insertExternalRef(conn: Connection, ref: ParsedExternalRef): Promise<void> {
    const sql = `
      INSERT INTO external_refs (
        source_entity_id, module_specifier, imported_symbol,
        local_alias, import_style, is_type_only,
        source_file_path, source_line, source_column,
        target_entity_id, is_resolved, is_reexport, export_alias,
        source_file_hash, branch, is_deleted, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await conn.run(
      sql,
      ref.source_entity_id,
      ref.module_specifier,
      ref.imported_symbol,
      ref.local_alias,
      ref.import_style,
      ref.is_type_only,
      ref.source_file_path,
      ref.source_line,
      ref.source_column,
      ref.target_entity_id,
      ref.is_resolved,
      ref.is_reexport,
      ref.export_alias,
      ref.source_file_hash,
      ref.branch,
      ref.is_deleted,
      ref.updated_at
    );
  }

  /**
   * Atomic rename with fsync
   */
  private async atomicRename(tempPath: string, finalPath: string): Promise<void> {
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(finalPath), { recursive: true });

    // Rename (atomic on POSIX systems)
    await fs.rename(tempPath, finalPath);

    // fsync the directory to ensure metadata is persisted
    const dirHandle = await fs.open(path.dirname(finalPath), "r");
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  }

  /**
   * Write meta.json file
   */
  private async writeMeta(metaPath: string): Promise<void> {
    const meta = { schemaVersion: SCHEMA_VERSION };
    const tempPath = `${metaPath}.tmp`;

    await fs.writeFile(tempPath, JSON.stringify(meta, null, 2));
    await fs.rename(tempPath, metaPath);
  }

  /**
   * Clean up temporary directory
   */
  private async cleanupTempDir(tempDir: string): Promise<void> {
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(path.join(tempDir, file)).catch(() => {});
      }
      await fs.rmdir(tempDir).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Rewrite Parquet files excluding specific source files
   */
  private async rewriteExcluding(
    excludeFiles: string[],
    paths: SeedPaths,
    _startTime: number
  ): Promise<WriteResult> {
    try {
      const result = await withSeedLock(paths.seedRoot, async () => {
        return await executeWithRecovery(this.pool, async (conn) => {
          await initializeSchemas(conn);

          const nodesPath = path.join(paths.basePath, "nodes.parquet");
          const edgesPath = path.join(paths.basePath, "edges.parquet");
          const refsPath = path.join(paths.basePath, "external_refs.parquet");

          const excludeSet = new Set(excludeFiles);
          let nodesWritten = 0;
          let edgesWritten = 0;
          let refsWritten = 0;

          // Read existing and filter
          if (await this.fileExists(nodesPath)) {
            const rows = await conn.all(
              `SELECT * FROM read_parquet('${nodesPath}') WHERE file_path NOT IN (${this.toSqlList(excludeFiles)})`
            );
            nodesWritten = rows.length;
            for (const row of rows) {
              await this.insertNodeFromRow(conn, row);
            }
          }

          if (await this.fileExists(edgesPath)) {
            const rows = await conn.all(
              `SELECT * FROM read_parquet('${edgesPath}') WHERE source_file_path NOT IN (${this.toSqlList(excludeFiles)})`
            );
            edgesWritten = rows.length;
            for (const row of rows) {
              await this.insertEdgeFromRow(conn, row);
            }
          }

          if (await this.fileExists(refsPath)) {
            const rows = await conn.all(
              `SELECT * FROM read_parquet('${refsPath}') WHERE source_file_path NOT IN (${this.toSqlList(excludeFiles)})`
            );
            refsWritten = rows.length;
            for (const row of rows) {
              await this.insertExternalRefFromRow(conn, row);
            }
          }

          // Write back
          const tempDir = path.join(paths.seedRoot, ".tmp");
          await fs.mkdir(tempDir, { recursive: true });

          const tempSuffix = crypto.randomBytes(8).toString("hex");

          if (nodesWritten > 0) {
            const tempNodes = path.join(tempDir, `nodes_${tempSuffix}.parquet`);
            await conn.run(getCopyToParquet("nodes", tempNodes));
            await this.atomicRename(tempNodes, nodesPath);
          }

          if (edgesWritten > 0) {
            const tempEdges = path.join(tempDir, `edges_${tempSuffix}.parquet`);
            await conn.run(getCopyToParquet("edges", tempEdges));
            await this.atomicRename(tempEdges, edgesPath);
          }

          if (refsWritten > 0) {
            const tempRefs = path.join(tempDir, `refs_${tempSuffix}.parquet`);
            await conn.run(getCopyToParquet("external_refs", tempRefs));
            await this.atomicRename(tempRefs, refsPath);
          }

          await this.cleanupTempDir(tempDir);

          return {
            nodesWritten,
            edgesWritten,
            refsWritten,
            filesProcessed: excludeSet.size,
          };
        });
      });

      return {
        ...result,
        success: true,
        timeMs: Date.now() - _startTime,
      };
    } catch (error) {
      return {
        success: false,
        nodesWritten: 0,
        edgesWritten: 0,
        refsWritten: 0,
        filesProcessed: 0,
        timeMs: Date.now() - _startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Mark files as deleted in branch partition
   */
  private async markFilesDeleted(
    conn: Connection,
    filePaths: string[],
    paths: SeedPaths,
    branch: string
  ): Promise<Omit<WriteResult, "success" | "timeMs" | "error">> {
    await initializeSchemas(conn);

    const timestamp = new Date().toISOString();
    let nodesWritten = 0;
    let edgesWritten = 0;
    let refsWritten = 0;

    // Read existing base data for these files and mark as deleted
    const basePath = paths.basePath;
    const nodesPath = path.join(basePath, "nodes.parquet");
    const edgesPath = path.join(basePath, "edges.parquet");
    const refsPath = path.join(basePath, "external_refs.parquet");

    if (await this.fileExists(nodesPath)) {
      const nodes = await conn.all(
        `SELECT * FROM read_parquet('${nodesPath}') WHERE file_path IN (${this.toSqlList(filePaths)})`
      );
      for (const node of nodes) {
        await conn.run(
          `
          INSERT INTO nodes (
            entity_id, name, qualified_name, kind, file_path,
            start_line, end_line, start_column, end_column,
            is_exported, is_default_export, visibility,
            is_async, is_generator, is_static, is_abstract,
            type_signature, documentation, decorators, type_parameters,
            properties, source_file_hash, branch, is_deleted, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          node.entity_id,
          node.name,
          node.qualified_name,
          node.kind,
          node.file_path,
          node.start_line,
          node.end_line,
          node.start_column,
          node.end_column,
          node.is_exported,
          node.is_default_export,
          node.visibility,
          node.is_async,
          node.is_generator,
          node.is_static,
          node.is_abstract,
          node.type_signature,
          node.documentation,
          node.decorators,
          node.type_parameters,
          node.properties,
          node.source_file_hash,
          branch,
          true,
          timestamp
        );
        nodesWritten++;
      }
    }

    if (await this.fileExists(edgesPath)) {
      const edges = await conn.all(
        `SELECT * FROM read_parquet('${edgesPath}') WHERE source_file_path IN (${this.toSqlList(filePaths)})`
      );
      for (const edge of edges) {
        await conn.run(
          `
          INSERT INTO edges (
            source_entity_id, target_entity_id, edge_type,
            source_file_path, source_line, source_column,
            properties, source_file_hash, branch, is_deleted, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          edge.source_entity_id,
          edge.target_entity_id,
          edge.edge_type,
          edge.source_file_path,
          edge.source_line,
          edge.source_column,
          edge.properties,
          edge.source_file_hash,
          branch,
          true,
          timestamp
        );
        edgesWritten++;
      }
    }

    if (await this.fileExists(refsPath)) {
      const refs = await conn.all(
        `SELECT * FROM read_parquet('${refsPath}') WHERE source_file_path IN (${this.toSqlList(filePaths)})`
      );
      for (const ref of refs) {
        await conn.run(
          `
          INSERT INTO external_refs (
            source_entity_id, module_specifier, imported_symbol,
            local_alias, import_style, is_type_only,
            source_file_path, source_line, source_column,
            target_entity_id, is_resolved, is_reexport, export_alias,
            source_file_hash, branch, is_deleted, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          ref.source_entity_id,
          ref.module_specifier,
          ref.imported_symbol,
          ref.local_alias,
          ref.import_style,
          ref.is_type_only,
          ref.source_file_path,
          ref.source_line,
          ref.source_column,
          ref.target_entity_id,
          ref.is_resolved,
          ref.is_reexport,
          ref.export_alias,
          ref.source_file_hash,
          branch,
          true,
          timestamp
        );
        refsWritten++;
      }
    }

    // Write to branch partition
    if (nodesWritten > 0 || edgesWritten > 0 || refsWritten > 0) {
      const tempDir = path.join(paths.seedRoot, ".tmp");
      await fs.mkdir(tempDir, { recursive: true });
      const tempSuffix = crypto.randomBytes(8).toString("hex");

      if (nodesWritten > 0) {
        const tempNodes = path.join(tempDir, `nodes_${tempSuffix}.parquet`);
        await conn.run(getCopyToParquet("nodes", tempNodes));
        await this.atomicRename(tempNodes, path.join(paths.branchPath, "nodes.parquet"));
      }

      if (edgesWritten > 0) {
        const tempEdges = path.join(tempDir, `edges_${tempSuffix}.parquet`);
        await conn.run(getCopyToParquet("edges", tempEdges));
        await this.atomicRename(tempEdges, path.join(paths.branchPath, "edges.parquet"));
      }

      if (refsWritten > 0) {
        const tempRefs = path.join(tempDir, `refs_${tempSuffix}.parquet`);
        await conn.run(getCopyToParquet("external_refs", tempRefs));
        await this.atomicRename(tempRefs, path.join(paths.branchPath, "external_refs.parquet"));
      }

      await this.cleanupTempDir(tempDir);
    }

    return {
      nodesWritten,
      edgesWritten,
      refsWritten,
      filesProcessed: filePaths.length,
    };
  }

  /**
   * Merge existing data with new results for changed files
   */
  private async mergeAndWrite(
    conn: Connection,
    changedFiles: string[],
    result: StructuralParseResult,
    paths: SeedPaths,
    _branch: string
  ): Promise<Omit<WriteResult, "success" | "timeMs" | "error">> {
    await initializeSchemas(conn);

    const nodesPath = path.join(paths.basePath, "nodes.parquet");
    const edgesPath = path.join(paths.basePath, "edges.parquet");
    const refsPath = path.join(paths.basePath, "external_refs.parquet");

    // Read existing data excluding changed files
    if (await this.fileExists(nodesPath)) {
      const existingNodes = await conn.all(
        `SELECT * FROM read_parquet('${nodesPath}') WHERE file_path NOT IN (${this.toSqlList(changedFiles)})`
      );
      for (const row of existingNodes) {
        await this.insertNodeFromRow(conn, row);
      }
    }

    if (await this.fileExists(edgesPath)) {
      const existingEdges = await conn.all(
        `SELECT * FROM read_parquet('${edgesPath}') WHERE source_file_path NOT IN (${this.toSqlList(changedFiles)})`
      );
      for (const row of existingEdges) {
        await this.insertEdgeFromRow(conn, row);
      }
    }

    if (await this.fileExists(refsPath)) {
      const existingRefs = await conn.all(
        `SELECT * FROM read_parquet('${refsPath}') WHERE source_file_path NOT IN (${this.toSqlList(changedFiles)})`
      );
      for (const row of existingRefs) {
        await this.insertExternalRefFromRow(conn, row);
      }
    }

    // Add new results
    for (const node of result.nodes) {
      await this.insertNode(conn, node);
    }
    for (const edge of result.edges) {
      await this.insertEdge(conn, edge);
    }
    for (const ref of result.externalRefs) {
      await this.insertExternalRef(conn, ref);
    }

    // Write to temp and rename
    const tempDir = path.join(paths.seedRoot, ".tmp");
    await fs.mkdir(tempDir, { recursive: true });
    const tempSuffix = crypto.randomBytes(8).toString("hex");

    const nodeCount = await conn.all("SELECT COUNT(*) as count FROM nodes");
    const edgeCount = await conn.all("SELECT COUNT(*) as count FROM edges");
    const refCount = await conn.all("SELECT COUNT(*) as count FROM external_refs");

    const nodeRow = nodeCount[0] as Record<string, unknown> | undefined;
    const edgeRow = edgeCount[0] as Record<string, unknown> | undefined;
    const refRow = refCount[0] as Record<string, unknown> | undefined;

    const nodesWritten = Number(nodeRow?.count ?? 0);
    const edgesWritten = Number(edgeRow?.count ?? 0);
    const refsWritten = Number(refRow?.count ?? 0);

    if (nodesWritten > 0) {
      const tempNodes = path.join(tempDir, `nodes_${tempSuffix}.parquet`);
      await conn.run(getCopyToParquet("nodes", tempNodes));
      await this.atomicRename(tempNodes, nodesPath);
    }

    if (edgesWritten > 0) {
      const tempEdges = path.join(tempDir, `edges_${tempSuffix}.parquet`);
      await conn.run(getCopyToParquet("edges", tempEdges));
      await this.atomicRename(tempEdges, edgesPath);
    }

    if (refsWritten > 0) {
      const tempRefs = path.join(tempDir, `refs_${tempSuffix}.parquet`);
      await conn.run(getCopyToParquet("external_refs", tempRefs));
      await this.atomicRename(tempRefs, refsPath);
    }

    await this.writeMeta(paths.metaJson);
    await this.cleanupTempDir(tempDir);

    return {
      nodesWritten,
      edgesWritten,
      refsWritten,
      filesProcessed: 1, // Single file per parse result
    };
  }

  /**
   * Insert node from raw DuckDB row
   */
  private async insertNodeFromRow(conn: Connection, row: Record<string, unknown>): Promise<void> {
    const sql = `
      INSERT INTO nodes (
        entity_id, name, qualified_name, kind, file_path,
        start_line, end_line, start_column, end_column,
        is_exported, is_default_export, visibility,
        is_async, is_generator, is_static, is_abstract,
        type_signature, documentation, decorators, type_parameters,
        properties, source_file_hash, branch, is_deleted, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await conn.run(
      sql,
      row.entity_id,
      row.name,
      row.qualified_name,
      row.kind,
      row.file_path,
      row.start_line,
      row.end_line,
      row.start_column,
      row.end_column,
      row.is_exported,
      row.is_default_export,
      row.visibility,
      row.is_async,
      row.is_generator,
      row.is_static,
      row.is_abstract,
      row.type_signature,
      row.documentation,
      row.decorators,
      row.type_parameters,
      row.properties,
      row.source_file_hash,
      row.branch,
      row.is_deleted,
      row.updated_at
    );
  }

  /**
   * Insert edge from raw DuckDB row
   */
  private async insertEdgeFromRow(conn: Connection, row: Record<string, unknown>): Promise<void> {
    const sql = `
      INSERT INTO edges (
        source_entity_id, target_entity_id, edge_type,
        source_file_path, source_line, source_column,
        properties, source_file_hash, branch, is_deleted, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await conn.run(
      sql,
      row.source_entity_id,
      row.target_entity_id,
      row.edge_type,
      row.source_file_path,
      row.source_line,
      row.source_column,
      row.properties,
      row.source_file_hash,
      row.branch,
      row.is_deleted,
      row.updated_at
    );
  }

  /**
   * Insert external ref from raw DuckDB row
   */
  private async insertExternalRefFromRow(
    conn: Connection,
    row: Record<string, unknown>
  ): Promise<void> {
    const sql = `
      INSERT INTO external_refs (
        source_entity_id, module_specifier, imported_symbol,
        local_alias, import_style, is_type_only,
        source_file_path, source_line, source_column,
        target_entity_id, is_resolved, is_reexport, export_alias,
        source_file_hash, branch, is_deleted, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await conn.run(
      sql,
      row.source_entity_id,
      row.module_specifier,
      row.imported_symbol,
      row.local_alias,
      row.import_style,
      row.is_type_only,
      row.source_file_path,
      row.source_line,
      row.source_column,
      row.target_entity_id,
      row.is_resolved,
      row.is_reexport,
      row.export_alias,
      row.source_file_hash,
      row.branch,
      row.is_deleted,
      row.updated_at
    );
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert array to SQL list string
   */
  private toSqlList(items: string[]): string {
    return items.map((item) => `'${item.replace(/'/g, "''")}'`).join(", ");
  }
}

/**
 * Create a SeedWriter instance
 */
export function createSeedWriter(pool: DuckDBPool, packagePath: string): SeedWriter {
  return new SeedWriter(pool, packagePath);
}
