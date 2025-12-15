/**
 * Update Manager Module
 *
 * Orchestrates incremental updates for file changes.
 * Coordinates between file watcher, parser, and seed writer.
 *
 * Based on DevAC v2.0 spec Section 8.2
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { LanguageParser, ParserConfig } from "../parsers/parser-interface.js";
import { createTypeScriptParser } from "../parsers/typescript-parser.js";
import { DuckDBPool } from "../storage/duckdb-pool.js";
import { type SeedWriter, createSeedWriter } from "../storage/seed-writer.js";
import { computeFileHash } from "../utils/hash.js";
import { type Logger, createLogger } from "../utils/logger.js";
import type { FileChangeEvent } from "./file-watcher.js";
import type { RenameInfo } from "./rename-detector.js";

/**
 * Update result for a single file
 */
export interface UpdateResult {
  filePath: string;
  success: boolean;
  skipped: boolean;
  nodesUpdated: number;
  edgesUpdated: number;
  refsUpdated: number;
  timeMs: number;
  error?: string;
}

/**
 * Batch update result
 */
export interface BatchUpdateResult {
  results: UpdateResult[];
  successCount: number;
  errorCount: number;
  skippedCount: number;
  totalTimeMs: number;
}

/**
 * Update manager status
 */
export interface UpdateManagerStatus {
  isProcessing: boolean;
  filesProcessed: number;
  totalTimeMs: number;
  lastUpdateTime: number | null;
  errors: number;
}

/**
 * Update manager configuration
 */
export interface UpdateManagerConfig {
  packagePath: string;
  repoName: string;
  branch?: string;
}

/**
 * Update manager interface
 */
export interface UpdateManager {
  /**
   * Process a single file change event
   */
  processFileChange(event: FileChangeEvent): Promise<UpdateResult>;

  /**
   * Process a file rename
   */
  processRename(renameInfo: RenameInfo): Promise<UpdateResult>;

  /**
   * Process a batch of file changes
   */
  processBatch(events: FileChangeEvent[]): Promise<BatchUpdateResult>;

  /**
   * Get current status
   */
  getStatus(): UpdateManagerStatus;

  /**
   * Get configuration
   */
  getConfig(): Required<UpdateManagerConfig>;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}

/**
 * Update manager implementation
 */
class UpdateManagerImpl implements UpdateManager {
  private config: Required<UpdateManagerConfig>;
  private pool: DuckDBPool;
  private writer: SeedWriter;
  private parser: LanguageParser;
  private logger: Logger;
  private fileHashes: Map<string, string> = new Map();
  private status: UpdateManagerStatus = {
    isProcessing: false,
    filesProcessed: 0,
    totalTimeMs: 0,
    lastUpdateTime: null,
    errors: 0,
  };

  constructor(
    config: UpdateManagerConfig,
    pool: DuckDBPool,
    writer: SeedWriter,
    parser: LanguageParser
  ) {
    this.config = {
      packagePath: config.packagePath,
      repoName: config.repoName,
      branch: config.branch ?? "base",
    };
    this.pool = pool;
    this.writer = writer;
    this.parser = parser;
    this.logger = createLogger({ prefix: "[UpdateManager]" });
  }

  async processFileChange(event: FileChangeEvent): Promise<UpdateResult> {
    const startTime = Date.now();
    this.status.isProcessing = true;

    try {
      let result: UpdateResult;

      switch (event.type) {
        case "add":
        case "change":
          result = await this.handleAddOrChange(event);
          break;
        case "unlink":
          result = await this.handleUnlink(event);
          break;
        default:
          result = {
            filePath: event.filePath,
            success: false,
            skipped: false,
            nodesUpdated: 0,
            edgesUpdated: 0,
            refsUpdated: 0,
            timeMs: Date.now() - startTime,
            error: `Unknown event type: ${event.type}`,
          };
      }

      this.updateStats(result, startTime);
      return result;
    } finally {
      this.status.isProcessing = false;
    }
  }

  async processRename(renameInfo: RenameInfo): Promise<UpdateResult> {
    const startTime = Date.now();
    this.status.isProcessing = true;

    try {
      // For a rename, we need to:
      // 1. Delete the old file's seeds
      // 2. Add the new file's seeds
      // The content is the same, but the file path changes entity IDs

      // First, mark old file as deleted
      await this.handleUnlink({
        type: "unlink",
        filePath: renameInfo.oldPath,
        timestamp: Date.now(),
      });

      // Update hash tracking
      const oldHash = this.fileHashes.get(renameInfo.oldPath);
      if (oldHash) {
        this.fileHashes.delete(renameInfo.oldPath);
      }

      // Then add the new file
      const result = await this.handleAddOrChange({
        type: "add",
        filePath: renameInfo.newPath,
        timestamp: Date.now(),
      });

      this.updateStats(result, startTime);
      return result;
    } finally {
      this.status.isProcessing = false;
    }
  }

  async processBatch(events: FileChangeEvent[]): Promise<BatchUpdateResult> {
    const startTime = Date.now();
    const results: UpdateResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const event of events) {
      const result = await this.processFileChange(event);
      results.push(result);

      if (result.success) {
        if (result.skipped) {
          skippedCount++;
        } else {
          successCount++;
        }
      } else {
        errorCount++;
      }
    }

    return {
      results,
      successCount,
      errorCount,
      skippedCount,
      totalTimeMs: Date.now() - startTime,
    };
  }

  getStatus(): UpdateManagerStatus {
    return { ...this.status };
  }

  getConfig(): Required<UpdateManagerConfig> {
    return { ...this.config };
  }

  async dispose(): Promise<void> {
    await this.pool.shutdown();
    this.fileHashes.clear();
  }

  /**
   * Handle add or change event
   */
  private async handleAddOrChange(event: FileChangeEvent): Promise<UpdateResult> {
    const startTime = Date.now();
    const { filePath } = event;

    try {
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return {
          filePath,
          success: false,
          skipped: false,
          nodesUpdated: 0,
          edgesUpdated: 0,
          refsUpdated: 0,
          timeMs: Date.now() - startTime,
          error: `File does not exist: ${filePath}`,
        };
      }

      // Compute content hash for change detection
      const currentHash = await computeFileHash(filePath);
      const previousHash = this.fileHashes.get(filePath);

      // Skip if content hasn't changed (for change events)
      if (event.type === "change" && previousHash === currentHash) {
        return {
          filePath,
          success: true,
          skipped: true,
          nodesUpdated: 0,
          edgesUpdated: 0,
          refsUpdated: 0,
          timeMs: Date.now() - startTime,
        };
      }

      // Parse the file
      const relativePath = path.relative(this.config.packagePath, filePath);
      const parserConfig: ParserConfig = {
        repoName: this.config.repoName,
        packagePath: this.config.packagePath,
        branch: this.config.branch,
        includeDocumentation: true,
        includeTypes: true,
        maxScopeDepth: 10,
      };

      const parseResult = await this.parser.parse(filePath, parserConfig);

      // Write seeds
      const writeResult = await this.writer.updateFile([relativePath], parseResult, {
        branch: this.config.branch,
      });

      // Update hash tracking
      this.fileHashes.set(filePath, currentHash);

      return {
        filePath,
        success: writeResult.success,
        skipped: false,
        nodesUpdated: writeResult.nodesWritten,
        edgesUpdated: writeResult.edgesWritten,
        refsUpdated: writeResult.refsWritten,
        timeMs: Date.now() - startTime,
        error: writeResult.error,
      };
    } catch (error) {
      this.logger.error(`Failed to process ${filePath}`, error);
      return {
        filePath,
        success: false,
        skipped: false,
        nodesUpdated: 0,
        edgesUpdated: 0,
        refsUpdated: 0,
        timeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle unlink (delete) event
   */
  private async handleUnlink(event: FileChangeEvent): Promise<UpdateResult> {
    const startTime = Date.now();
    const { filePath } = event;

    try {
      const relativePath = path.relative(this.config.packagePath, filePath);

      // Delete from seeds
      const writeResult = await this.writer.deleteFile([relativePath], {
        branch: this.config.branch,
      });

      // Remove from hash tracking
      this.fileHashes.delete(filePath);

      return {
        filePath,
        success: writeResult.success,
        skipped: false,
        nodesUpdated: writeResult.nodesWritten,
        edgesUpdated: writeResult.edgesWritten,
        refsUpdated: writeResult.refsWritten,
        timeMs: Date.now() - startTime,
        error: writeResult.error,
      };
    } catch (error) {
      this.logger.error(`Failed to process delete for ${filePath}`, error);
      return {
        filePath,
        success: false,
        skipped: false,
        nodesUpdated: 0,
        edgesUpdated: 0,
        refsUpdated: 0,
        timeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update status after processing
   */
  private updateStats(result: UpdateResult, startTime: number): void {
    this.status.filesProcessed++;
    this.status.totalTimeMs += Date.now() - startTime;
    this.status.lastUpdateTime = Date.now();

    if (!result.success) {
      this.status.errors++;
    }
  }
}

/**
 * Create a new update manager
 */
export async function createUpdateManager(config: UpdateManagerConfig): Promise<UpdateManager> {
  // Create DuckDB pool
  const pool = new DuckDBPool({
    memoryLimit: "256MB",
    maxConnections: 2,
  });
  await pool.initialize();

  // Create seed writer
  const writer = createSeedWriter(pool, config.packagePath);

  // Create parser
  const parser = createTypeScriptParser();

  return new UpdateManagerImpl(config, pool, writer, parser);
}
