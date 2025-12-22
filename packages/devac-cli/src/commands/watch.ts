/**
 * Watch Command Implementation
 *
 * Watches for file changes and performs incremental updates.
 * Based on spec Section 11.1 and Phase 2: Incremental Updates
 */

import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  type CrossRepoDetector,
  DuckDBPool,
  type FileWatcher,
  type Logger,
  type RenameDetector,
  type RepoContext,
  type UpdateManager,
  createCrossRepoDetector,
  createFileWatcher,
  createLogger,
  createRenameDetector,
  createSeedReader,
  createUpdateManager,
  discoverContext,
  extractIssueNumber,
  formatCrossRepoNeed,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { analyzeCommand } from "./analyze.js";
import type {
  WatchChangeEvent,
  WatchController,
  WatchCrossRepoNeedEvent,
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
  detectCrossRepo: true,
  notificationsPath: "",
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

  // Cross-repo detection
  private context: RepoContext | null = null;
  private crossRepoDetector: CrossRepoDetector | null = null;
  private readerPool: DuckDBPool | null = null;
  private issueNumber: number | undefined;

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
      crossRepoNeedsDetected: 0,
      crossRepoDetectionEnabled: false,
    };

    // Global log level is set by CLI preAction hook
    this.logger = createLogger({ prefix: "[WatchCommand]" });
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

      // Setup cross-repo detection if enabled
      if (this.options.detectCrossRepo) {
        await this.initializeCrossRepoDetection();
      }

      // Setup event handlers
      this.setupEventHandlers();

      // Start watching
      await this.fileWatcher.start();

      // Small delay for watcher to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 50));

      this.status.isWatching = true;

      this.logger.info(`Watching for changes in ${packagePath}`);
      if (this.status.crossRepoDetectionEnabled) {
        this.logger.info(
          `Cross-repo detection enabled${this.issueNumber ? ` for issue #${this.issueNumber}` : ""}`
        );
      }
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

      // Clean up cross-repo detection resources
      if (this.readerPool) {
        await this.readerPool.shutdown();
        this.readerPool = null;
      }
      this.crossRepoDetector = null;
      this.context = null;

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

  on(event: "change", handler: (event: WatchChangeEvent) => void): void;
  on(event: "cross-repo-need", handler: (event: WatchCrossRepoNeedEvent) => void): void;
  on(
    event: "change" | "cross-repo-need",
    handler: ((event: WatchChangeEvent) => void) | ((event: WatchCrossRepoNeedEvent) => void)
  ): void {
    this.emitter.on(event, handler);
  }

  off(event: "change", handler: (event: WatchChangeEvent) => void): void;
  off(event: "cross-repo-need", handler: (event: WatchCrossRepoNeedEvent) => void): void;
  off(
    event: "change" | "cross-repo-need",
    handler: ((event: WatchChangeEvent) => void) | ((event: WatchCrossRepoNeedEvent) => void)
  ): void {
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

          // Check for cross-repo needs after add/change (not unlink)
          if (this.crossRepoDetector && event.type !== "unlink") {
            await this.checkForCrossRepoNeeds(event.filePath);
          }
        }
      } catch (error) {
        this.status.errors++;
        this.logger.error("Failed to process file changes", error);
      }
    });
  }

  /**
   * Initialize cross-repo detection
   */
  private async initializeCrossRepoDetection(): Promise<void> {
    try {
      // Discover context from package path
      this.context = await discoverContext(this.options.packagePath, {
        checkSeeds: true,
      });

      // Check if we're in an issue worktree
      const dirName = path.basename(this.options.packagePath);
      this.issueNumber = extractIssueNumber(dirName) ?? undefined;

      // Only enable cross-repo detection if we have sibling repos
      const siblingRepos = this.context.repos.filter((r) => !r.isWorktree);
      if (siblingRepos.length <= 1) {
        this.logger.debug("No sibling repos found, skipping cross-repo detection");
        return;
      }

      // Create a separate DuckDB pool for reading seeds
      this.readerPool = new DuckDBPool({
        memoryLimit: "128MB",
        maxConnections: 1,
      });
      await this.readerPool.initialize();

      // Create the cross-repo detector
      this.crossRepoDetector = createCrossRepoDetector(
        this.context,
        this.options.repoName,
        this.issueNumber
      );

      this.status.crossRepoDetectionEnabled = true;
      this.logger.debug(
        `Cross-repo detection initialized with ${siblingRepos.length} sibling repos`
      );
    } catch (error) {
      this.logger.warn(
        `Failed to initialize cross-repo detection: ${error instanceof Error ? error.message : String(error)}`
      );
      // Non-fatal - continue without cross-repo detection
    }
  }

  /**
   * Check for cross-repo needs after a file change
   */
  private async checkForCrossRepoNeeds(filePath: string): Promise<void> {
    if (!this.crossRepoDetector || !this.readerPool || !this.context) {
      return;
    }

    try {
      // Get external refs for the changed file
      const reader = createSeedReader(this.readerPool, this.options.packagePath);
      const relativePath = path.relative(this.options.packagePath, filePath);
      const refs = await reader.getExternalRefsByFile(relativePath, this.options.branch);

      if (refs.length === 0) {
        return;
      }

      // Analyze refs for cross-repo needs
      const result = this.crossRepoDetector.analyzeExternalRefs(refs, filePath);

      // Emit events for each detected need
      for (const need of result.needs) {
        this.status.crossRepoNeedsDetected++;

        // Log to console
        this.logger.info(formatCrossRepoNeed(need));

        // Emit event
        this.emitter.emit("cross-repo-need", need as WatchCrossRepoNeedEvent);

        // Write to notifications file if configured
        if (this.options.notificationsPath) {
          await this.writeNotification(need);
        }
      }
    } catch (error) {
      this.logger.debug(
        `Error checking cross-repo needs for ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
      // Non-fatal - don't affect file processing
    }
  }

  /**
   * Write a cross-repo need notification to file
   */
  private async writeNotification(need: WatchCrossRepoNeedEvent): Promise<void> {
    const notificationsPath =
      this.options.notificationsPath || path.join(os.homedir(), ".devac", "notifications.log");

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(notificationsPath), { recursive: true });

      // Append notification as JSON line
      const entry = {
        ...need,
        type: "cross-repo-need",
        timestampISO: new Date(need.timestamp).toISOString(),
      };

      await fs.appendFile(notificationsPath, `${JSON.stringify(entry)}\n`);
    } catch (error) {
      this.logger.debug(
        `Failed to write notification: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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

/**
 * Register the watch command with the CLI program
 */
export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Watch for file changes and update incrementally")
    .option("-p, --package <path>", "Package path to watch", process.cwd())
    .option("-r, --repo <name>", "Repository name", "repo")
    .option("-b, --branch <name>", "Git branch name", "main")
    .option("--debounce <ms>", "Debounce time in milliseconds", "100")
    .option("--force", "Force initial analysis")
    .option("--no-cross-repo", "Disable cross-repo detection")
    .option("--notifications <path>", "Path for cross-repo notifications")
    .action(async (options) => {
      const controller = await watchCommand({
        packagePath: path.resolve(options.package),
        repoName: options.repo,
        branch: options.branch,
        debounceMs: options.debounce ? Number.parseInt(options.debounce, 10) : undefined,
        force: options.force,
        detectCrossRepo: options.crossRepo,
        notificationsPath: options.notifications,
      });

      const status = controller.getStatus();

      if (status.error) {
        console.error(`✗ Watch failed: ${status.error}`);
        process.exit(1);
      }

      console.log(`Watching ${options.package}...`);
      console.log(
        `  Initial analysis: ${status.initialAnalysisSkipped ? "skipped (seeds current)" : `${status.filesAnalyzed} files`}`
      );
      if (status.crossRepoDetectionEnabled) {
        console.log("  Cross-repo detection: enabled");
      }
      console.log("\nPress Ctrl+C to stop.\n");

      controller.on("change", (event) => {
        console.log(`[${new Date().toISOString()}] ${event.type}: ${event.filePath}`);
      });

      controller.on("cross-repo-need", (event) => {
        console.log(`\n⚠️  Cross-repo need detected: ${event.targetRepo}`);
        console.log(`   Symbols: ${event.symbols.join(", ")}`);
        if (event.issueNumber) {
          console.log(`   Issue: #${event.issueNumber}`);
        }
      });

      // Keep process running
      process.on("SIGINT", async () => {
        console.log("\nStopping watch...");
        const result = await controller.stop({ flush: true });
        console.log(`Processed ${result.eventsProcessed} events`);
        process.exit(0);
      });
    });
}
