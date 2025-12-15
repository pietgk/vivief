/**
 * Watcher Module Exports
 *
 * File watching and incremental update functionality for DevAC v2.0
 */

// File watcher - factory function
export { createFileWatcher } from "./file-watcher.js";

// File watcher - types
export type {
  FileWatcher,
  FileWatcherOptions,
  FileChangeEvent,
  FileEventType,
  WatcherStats,
  FileEventHandler,
  BatchEventHandler,
} from "./file-watcher.js";

// Rename detector - factory function
export { createRenameDetector } from "./rename-detector.js";

// Rename detector - types
export type {
  RenameDetector,
  RenameDetectorOptions,
  RenameInfo,
  ProcessedEvents,
} from "./rename-detector.js";

// Update manager - factory function
export { createUpdateManager } from "./update-manager.js";

// Update manager - types
export type {
  UpdateManager,
  UpdateManagerConfig,
  UpdateManagerStatus,
  UpdateResult,
  BatchUpdateResult,
} from "./update-manager.js";
