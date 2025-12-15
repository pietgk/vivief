/**
 * Rename Detector Module
 *
 * Detects file renames by matching content hashes between
 * delete and add events within a time window.
 *
 * Based on DevAC v2.0 spec Section 8.4
 */

import { computeFileHash, computeStringHash } from "../utils/hash.js";
import type { FileChangeEvent } from "./file-watcher.js";

/**
 * Rename detection result
 */
export interface RenameInfo {
  oldPath: string;
  newPath: string;
  contentHash: string;
  confidence: "high" | "medium";
}

/**
 * Processed events after rename detection
 */
export interface ProcessedEvents {
  renames: RenameInfo[];
  adds: FileChangeEvent[];
  changes: FileChangeEvent[];
  deletes: FileChangeEvent[];
}

/**
 * Rename detector options
 */
export interface RenameDetectorOptions {
  /** Timeout in ms for pending deletes (default: 1000) */
  timeoutMs?: number;
}

/**
 * Pending delete info stored for matching
 */
interface PendingDelete {
  path: string;
  contentHash: string;
  timestamp: number;
}

/**
 * Rename detector interface
 */
export interface RenameDetector {
  /**
   * Detect if two paths represent a rename (same content hash)
   */
  detectRename(oldPath: string, newPath: string): Promise<RenameInfo | null>;

  /**
   * Process a batch of file events, detecting renames
   */
  processEventBatch(events: FileChangeEvent[]): Promise<ProcessedEvents>;

  /**
   * Register a pending delete with its content hash
   * Call this before the file is actually deleted to capture the hash
   */
  registerPendingDelete(path: string, content: string): Promise<void>;

  /**
   * Clear all pending deletes
   */
  clearPending(): void;

  /**
   * Get the number of pending deletes
   */
  getPendingDeleteCount(): number;

  /**
   * Get current options
   */
  getOptions(): Required<RenameDetectorOptions>;
}

/**
 * Rename detector implementation
 */
class RenameDetectorImpl implements RenameDetector {
  private options: Required<RenameDetectorOptions>;
  private pendingDeletes: Map<string, PendingDelete> = new Map();

  constructor(options: RenameDetectorOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 1000,
    };
  }

  async detectRename(oldPath: string, newPath: string): Promise<RenameInfo | null> {
    try {
      // Compute hashes for both files
      const [oldHash, newHash] = await Promise.all([
        computeFileHash(oldPath).catch(() => null),
        computeFileHash(newPath).catch(() => null),
      ]);

      // If either file can't be read, can't detect rename
      if (!oldHash || !newHash) {
        return null;
      }

      // If hashes match, it's a rename
      if (oldHash === newHash) {
        return {
          oldPath,
          newPath,
          contentHash: newHash,
          confidence: "high",
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  async registerPendingDelete(path: string, content: string): Promise<void> {
    const contentHash = computeStringHash(content);
    this.pendingDeletes.set(path, {
      path,
      contentHash,
      timestamp: Date.now(),
    });
  }

  async processEventBatch(events: FileChangeEvent[]): Promise<ProcessedEvents> {
    const now = Date.now();
    const result: ProcessedEvents = {
      renames: [],
      adds: [],
      changes: [],
      deletes: [],
    };

    // First, remove expired pending deletes
    this.cleanupExpiredDeletes(now);

    // Separate events by type
    const addEvents: FileChangeEvent[] = [];
    const unlinkEvents: FileChangeEvent[] = [];
    const changeEvents: FileChangeEvent[] = [];

    for (const event of events) {
      switch (event.type) {
        case "add":
          addEvents.push(event);
          break;
        case "unlink":
          unlinkEvents.push(event);
          break;
        case "change":
          changeEvents.push(event);
          break;
      }
    }

    // All change events pass through as-is
    result.changes = changeEvents;

    // Track which events are consumed by rename detection
    const consumedAdds = new Set<string>();
    const consumedDeletes = new Set<string>();

    // Try to match adds with pending deletes
    for (const addEvent of addEvents) {
      const match = await this.findMatchingPendingDelete(addEvent.filePath);

      if (match) {
        result.renames.push({
          oldPath: match.path,
          newPath: addEvent.filePath,
          contentHash: match.contentHash,
          confidence: "high",
        });
        consumedAdds.add(addEvent.filePath);

        // Remove the matched pending delete
        this.pendingDeletes.delete(match.path);

        // Also mark the corresponding unlink event as consumed
        consumedDeletes.add(match.path);
      }
    }

    // Adds that weren't matched to renames
    for (const addEvent of addEvents) {
      if (!consumedAdds.has(addEvent.filePath)) {
        result.adds.push(addEvent);
      }
    }

    // Unlinks that weren't matched to renames
    for (const unlinkEvent of unlinkEvents) {
      if (!consumedDeletes.has(unlinkEvent.filePath)) {
        result.deletes.push(unlinkEvent);
      }
    }

    return result;
  }

  clearPending(): void {
    this.pendingDeletes.clear();
  }

  getPendingDeleteCount(): number {
    return this.pendingDeletes.size;
  }

  getOptions(): Required<RenameDetectorOptions> {
    return { ...this.options };
  }

  /**
   * Find a pending delete that matches the content hash of the added file
   */
  private async findMatchingPendingDelete(addedPath: string): Promise<PendingDelete | null> {
    try {
      const addedHash = await computeFileHash(addedPath);

      for (const pending of this.pendingDeletes.values()) {
        if (pending.contentHash === addedHash) {
          return pending;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Remove pending deletes that have expired
   */
  private cleanupExpiredDeletes(now: number): void {
    const expiredPaths: string[] = [];

    for (const [path, pending] of this.pendingDeletes) {
      if (now - pending.timestamp > this.options.timeoutMs) {
        expiredPaths.push(path);
      }
    }

    for (const path of expiredPaths) {
      this.pendingDeletes.delete(path);
    }
  }
}

/**
 * Create a new rename detector
 */
export function createRenameDetector(options: RenameDetectorOptions = {}): RenameDetector {
  return new RenameDetectorImpl(options);
}
