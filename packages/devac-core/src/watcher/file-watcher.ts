/**
 * File Watcher Module
 *
 * Watches for file changes using chokidar with:
 * - Debouncing for rapid changes
 * - Batching of multiple changes
 * - Filtering by extension
 * - Ignoring common directories (node_modules, .devac, dist)
 *
 * Based on DevAC v2.0 spec Section 8.3
 */

import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as chokidar from "chokidar";

/**
 * File change event types
 */
export type FileEventType = "add" | "change" | "unlink";

/**
 * File change event
 */
export interface FileChangeEvent {
  type: FileEventType;
  filePath: string;
  timestamp: number;
}

/**
 * File watcher options
 */
export interface FileWatcherOptions {
  /** Debounce time in ms (default: 100) */
  debounceMs?: number;
  /** Ignore initial scan (default: false) */
  ignoreInitial?: boolean;
  /** Additional patterns to ignore */
  ignorePatterns?: string[];
  /** Only watch specific extensions (default: .ts, .tsx, .js, .jsx) */
  extensions?: string[];
}

/**
 * Watcher statistics
 */
export interface WatcherStats {
  filesWatched: number;
  eventsProcessed: number;
  lastEventTime: number | null;
  isWatching: boolean;
}

/**
 * Event handler type
 */
export type FileEventHandler = (event: FileChangeEvent) => void;
export type BatchEventHandler = (events: FileChangeEvent[]) => void;

/**
 * File watcher interface
 */
export interface FileWatcher {
  /** Start watching */
  start(): Promise<void>;
  /** Stop watching and cleanup */
  stop(): Promise<void>;
  /** Register event handler for single events */
  on(event: "add" | "change" | "unlink", handler: FileEventHandler): void;
  /** Register handler for batch events */
  on(event: "batch", handler: BatchEventHandler): void;
  /** Remove event handler */
  off(event: string, handler: FileEventHandler | BatchEventHandler): void;
  /** Check if currently watching */
  isWatching(): boolean;
  /** Get watcher options */
  getOptions(): Required<FileWatcherOptions>;
  /** Get statistics */
  getStats(): WatcherStats;
}

/**
 * Default extensions to watch
 */
const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/**
 * Default directories to ignore
 */
const DEFAULT_IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.devac/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/coverage/**",
  "**/*.d.ts",
  "**/*.min.js",
];

/**
 * File watcher implementation
 */
class FileWatcherImpl implements FileWatcher {
  private packagePath: string;
  private options: Required<FileWatcherOptions>;
  private watcher: chokidar.FSWatcher | null = null;
  private emitter: EventEmitter = new EventEmitter();
  private watching = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingEvents: Map<string, FileChangeEvent> = new Map();
  private shouldWatch: (filePath: string) => boolean = () => true;
  private stats: WatcherStats = {
    filesWatched: 0,
    eventsProcessed: 0,
    lastEventTime: null,
    isWatching: false,
  };

  constructor(packagePath: string, options: FileWatcherOptions = {}) {
    this.packagePath = packagePath;
    this.options = {
      debounceMs: options.debounceMs ?? 100,
      ignoreInitial: options.ignoreInitial ?? false,
      ignorePatterns: options.ignorePatterns ?? [],
      extensions: options.extensions ?? DEFAULT_EXTENSIONS,
    };
  }

  async start(): Promise<void> {
    // Verify path exists
    try {
      await fs.access(this.packagePath);
    } catch {
      throw new Error(`Package path does not exist: ${this.packagePath}`);
    }

    // Build ignore patterns - combine defaults with user patterns
    const ignoredPatterns = [...DEFAULT_IGNORE_PATTERNS, ...this.options.ignorePatterns];

    // Build filter function for extensions
    const extensions = this.options.extensions;
    const shouldWatch = (filePath: string): boolean => {
      // Check if it matches any extension
      return extensions.some((ext) => filePath.endsWith(ext));
    };

    // Create watcher - watch all files and filter by extension
    this.watcher = chokidar.watch(".", {
      cwd: this.packagePath,
      ignored: ignoredPatterns,
      ignoreInitial: this.options.ignoreInitial,
      persistent: true,
      usePolling: false,
      // Use atomic writes detection for better reliability
      atomic: true,
    });

    // Store extension filter for use in event handler
    this.shouldWatch = shouldWatch;

    // Setup event handlers
    this.watcher.on("add", (relativePath) => {
      this.handleFileEvent("add", relativePath);
    });

    this.watcher.on("change", (relativePath) => {
      this.handleFileEvent("change", relativePath);
    });

    this.watcher.on("unlink", (relativePath) => {
      this.handleFileEvent("unlink", relativePath);
    });

    // Wait for ready event
    await new Promise<void>((resolve, reject) => {
      this.watcher?.on("ready", () => {
        this.watching = true;
        this.stats.isWatching = true;
        resolve();
      });

      this.watcher?.on("error", (error) => {
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.watching) {
      return;
    }

    // Cancel pending debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Clear pending events
    this.pendingEvents.clear();

    // Close watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.watching = false;
    this.stats.isWatching = false;
  }

  on(
    event: "add" | "change" | "unlink" | "batch",
    handler: FileEventHandler | BatchEventHandler
  ): void {
    this.emitter.on(event, handler);
  }

  off(event: string, handler: FileEventHandler | BatchEventHandler): void {
    this.emitter.off(event, handler);
  }

  isWatching(): boolean {
    return this.watching;
  }

  getOptions(): Required<FileWatcherOptions> {
    return { ...this.options };
  }

  getStats(): WatcherStats {
    return { ...this.stats };
  }

  private handleFileEvent(type: FileEventType, relativePath: string): void {
    // Skip .d.ts files
    if (relativePath.endsWith(".d.ts")) {
      return;
    }

    // Check if file matches extension filter
    if (!this.shouldWatch(relativePath)) {
      return;
    }

    const fullPath = path.join(this.packagePath, relativePath);
    const event: FileChangeEvent = {
      type,
      filePath: fullPath,
      timestamp: Date.now(),
    };

    // Add to pending events (overwrites previous event for same file)
    this.pendingEvents.set(fullPath, event);

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushEvents();
    }, this.options.debounceMs);
  }

  private flushEvents(): void {
    if (this.pendingEvents.size === 0) {
      return;
    }

    const events = Array.from(this.pendingEvents.values());
    this.pendingEvents.clear();
    this.debounceTimer = null;

    // Update stats
    this.stats.eventsProcessed += events.length;
    this.stats.lastEventTime = Date.now();

    // Emit individual events
    for (const event of events) {
      this.emitter.emit(event.type, event);
    }

    // Emit batch event
    this.emitter.emit("batch", events);
  }
}

/**
 * Create a new file watcher
 */
export function createFileWatcher(
  packagePath: string,
  options: FileWatcherOptions = {}
): FileWatcher {
  return new FileWatcherImpl(packagePath, options);
}
