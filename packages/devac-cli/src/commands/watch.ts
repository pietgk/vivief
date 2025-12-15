/**
 * Watch Command Implementation
 *
 * Watches for file changes and performs incremental updates.
 * Based on spec Section 11.1 and Phase 2: Incremental Updates
 */

import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type FileWatcher,
  type Logger,
  type RenameDetector,
  type UpdateManager,
  createFileWatcher,
  createLogger,
  createRenameDetector,
  createUpdateManager,
  setGlobalLogLevel,
} from "@devac/core";
import { analyzeCommand } from "./analyze.js";
import type {
  WatchChangeEvent,
  WatchController,
  WatchOptions,
  WatchResult,
  WatchStatus,
} from "./types.js";

/**
 * Default watch options
 */
const DEFAULT_OPTIONS: Required<Omit<WatchOptions, "packagePath" | "repoName">> = {
  branch: "base",
  debounceMs: 100,
  force: false,
  verbose: false,
  debug: false,
};

/**
 * Watch controller implementation
 */
class WatchControllerImpl implements WatchController {
  private options: Required<WatchOptions>;
  private status: WatchStatus;
  private fileWatcher: FileWatcher | null = null;
  private updateManager: UpdateManager | null = null;
  private renameDetector: RenameDetector | null = null;
  private logger: Logger;
  private emitter: EventEmitter = new EventEmitter();

  constructor(options: WatchOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    } as Required<WatchOptions>;

    this.status = {
      isWatching: false,
      initialAnalysisComplete: false,
      initialAnalysisSkipped: false,
      filesAnalyzed: 0,
      changesProcessed: 0,
      errors: 0,
    };

    this.logger = createLogger({ prefix: "[WatchCommand]" });

    // Set log level based on options
    if (options.debug) {
      setGlobalLogLevel("debug");
    } else if (options.verbose) {
      setGlobalLogLevel("verbose");
    }
  }

  async initialize(): Promise<void> {
    const { packagePath, repoName, branch, debounceMs, force } = this.options;

    // Validate package path exists
    try {
      await fs.access(packagePath);
    } catch {
      this.status.error = `Path does not exist: ${packagePath}`;
      return;
    }

    try {
      // Check if initial analysis is needed
      const needsAnalysis = await this.checkNeedsInitialAnalysis(force);

      if (needsAnalysis) {
        this.logger.info("Performing initial analysis...");
        const analyzeResult = await analyzeCommand({
          packagePath,
          repoName,
          branch: branch ?? "main",
          force,
        });

        if (analyzeResult.success) {
          this.status.filesAnalyzed = analyzeResult.filesAnalyzed;
          this.logger.info(`Initial analysis complete: ${analyzeResult.filesAnalyzed} files`);
        } else {
          this.logger.warn(`Initial analysis had issues: ${analyzeResult.error}`);
        }
      } else {
        this.status.initialAnalysisSkipped = true;
        this.logger.info("Seeds are current, skipping initial analysis");
      }

      this.status.initialAnalysisComplete = true;

      // Create update manager
      this.updateManager = await createUpdateManager({
        packagePath,
        repoName,
        branch,
      });

      // Create rename detector
      this.renameDetector = createRenameDetector({
        timeoutMs: 1000,
      });

      // Create file watcher
      this.fileWatcher = createFileWatcher(packagePath, {
        debounceMs,
        ignoreInitial: true, // Don't process existing files on start
      });

      // Setup event handlers
      this.setupEventHandlers();

      // Start watching
      await this.fileWatcher.start();

      // Small delay for watcher to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 50));

      this.status.isWatching = true;

      this.logger.info(`Watching for changes in ${packagePath}`);
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to initialize watch", error);
    }
  }

  async stop(options?: { flush?: boolean }): Promise<WatchResult> {
    const flush = options?.flush ?? false;

    try {
      // If flush requested, wait for pending events
      if (flush && this.fileWatcher) {
        // Give a small delay for pending events to be processed
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Stop file watcher
      if (this.fileWatcher) {
        await this.fileWatcher.stop();
        this.fileWatcher = null;
      }

      // Dispose update manager
      if (this.updateManager) {
        await this.updateManager.dispose();
        this.updateManager = null;
      }

      // Clear rename detector
      if (this.renameDetector) {
        this.renameDetector.clearPending();
        this.renameDetector = null;
      }

      this.status.isWatching = false;

      this.logger.info("Watch stopped");

      return {
        success: true,
        filesWatched: this.status.filesAnalyzed,
        eventsProcessed: this.status.changesProcessed,
        exitReason: "manual",
      };
    } catch (error) {
      return {
        success: false,
        filesWatched: 0,
        eventsProcessed: this.status.changesProcessed,
        exitReason: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getStatus(): WatchStatus {
    return { ...this.status };
  }

  getOptions(): Required<WatchOptions> {
    return { ...this.options };
  }

  on(event: "change", handler: (event: WatchChangeEvent) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: "change", handler: (event: WatchChangeEvent) => void): void {
    this.emitter.off(event, handler);
  }

  /**
   * Check if initial analysis is needed
   */
  private async checkNeedsInitialAnalysis(force: boolean): Promise<boolean> {
    if (force) {
      return true;
    }

    // Check if seed files exist
    const seedPath = path.join(this.options.packagePath, ".devac", "seed", "base", "nodes.parquet");

    try {
      await fs.access(seedPath);
      return false; // Seeds exist, no need for initial analysis
    } catch {
      return true; // No seeds, need initial analysis
    }
  }

  /**
   * Setup event handlers for file watcher
   */
  private setupEventHandlers(): void {
    if (!this.fileWatcher) {
      return;
    }

    // Handle batch events
    this.fileWatcher.on("batch", async (events) => {
      if (!this.updateManager || !this.renameDetector) {
        return;
      }

      try {
        // Process through rename detector first
        const processed = await this.renameDetector.processEventBatch(events);

        // Handle renames
        for (const rename of processed.renames) {
          this.logger.debug(`Detected rename: ${rename.oldPath} -> ${rename.newPath}`);
          try {
            const result = await this.updateManager.processRename(rename);

            if (!result.success) {
              this.status.errors++;
              this.logger.warn(`Failed to process rename: ${result.error}`);
            }
          } catch (renameError) {
            this.status.errors++;
            this.logger.warn(`Error processing rename: ${renameError}`);
          }

          this.status.changesProcessed++;

          // Emit event
          this.emitter.emit("change", {
            type: "change" as const,
            filePath: rename.newPath,
            timestamp: Date.now(),
          });
        }

        // Combine remaining events (adds, changes, deletes that weren't renames)
        const remainingEvents = [...processed.adds, ...processed.changes, ...processed.deletes];

        // Handle remaining events
        for (const event of remainingEvents) {
          this.logger.debug(`Processing ${event.type}: ${event.filePath}`);
          try {
            const result = await this.updateManager.processFileChange(event);

            if (!result.success && !result.skipped) {
              this.status.errors++;
              this.logger.warn(`Failed to process ${event.filePath}: ${result.error}`);
            }

            // Always count as processed (even if failed or skipped)
            this.status.changesProcessed++;
          } catch (eventError) {
            this.status.errors++;
            this.status.changesProcessed++;
            this.logger.warn(`Error processing ${event.filePath}: ${eventError}`);
          }

          // Emit event
          this.emitter.emit("change", {
            type: event.type,
            filePath: event.filePath,
            timestamp: event.timestamp,
          });
        }
      } catch (error) {
        this.status.errors++;
        this.logger.error("Failed to process file changes", error);
      }
    });
  }
}

/**
 * Start watching a package for file changes
 *
 * Returns a WatchController that can be used to stop watching
 * and query status.
 */
export async function watchCommand(options: WatchOptions): Promise<WatchController> {
  const controller = new WatchControllerImpl(options);
  await controller.initialize();
  return controller;
}

// Re-export types for convenience
export type { WatchOptions, WatchResult, WatchController };
