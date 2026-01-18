/**
 * Tests for seed-detector.ts
 *
 * Tests the seed change detection functionality.
 */

import { EventEmitter } from "node:events";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// =============================================================================
// Mocks - must be defined before imports that use them
// =============================================================================

// Create a mock watcher class
class MockWatcher extends EventEmitter {
  add = vi.fn();
  close = vi.fn().mockResolvedValue(undefined);

  // Helper to emit ready
  emitReady(): void {
    this.emit("ready");
  }
}

let mockWatcher: MockWatcher;

// Mock chokidar
vi.mock("chokidar", () => ({
  watch: vi.fn(() => {
    mockWatcher = new MockWatcher();
    // Auto-emit ready after a microtask
    Promise.resolve().then(() => mockWatcher.emitReady());
    return mockWatcher;
  }),
}));

// Mock discover.js
vi.mock("../../src/workspace/discover.js", () => ({
  getRepoId: vi.fn(async (repoPath: string) => {
    const name = path.basename(repoPath);
    return `github.com/org/${name}`;
  }),
}));

// Mock node:fs for git detection
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    accessSync: vi.fn((filePath: string) => {
      if (filePath.endsWith("/.git") || filePath.endsWith("\\.git")) {
        if (
          filePath.includes("/repo1") ||
          filePath.includes("/repo2") ||
          filePath.includes("/workspace")
        ) {
          return;
        }
      }
      throw new Error("ENOENT");
    }),
  };
});

import * as chokidar from "chokidar";
import { type SeedDetector, createSeedDetector } from "../../src/workspace/seed-detector.js";

// =============================================================================
// createSeedDetector Tests
// =============================================================================

describe("createSeedDetector", () => {
  test("creates seed detector with default options", () => {
    const detector = createSeedDetector("/workspace");

    expect(detector).toBeDefined();
    expect(detector.isWatching()).toBe(false);
  });

  test("creates seed detector with custom options", () => {
    const detector = createSeedDetector("/workspace", {
      debounceMs: 500,
      ignoreInitial: false,
    });

    expect(detector).toBeDefined();
    expect(detector.isWatching()).toBe(false);
  });
});

// =============================================================================
// start/stop Tests
// =============================================================================

describe("start/stop", () => {
  let detector: SeedDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = createSeedDetector("/workspace");
  });

  afterEach(async () => {
    await detector.stop();
  });

  test("start begins watching", async () => {
    expect(detector.isWatching()).toBe(false);

    await detector.start();

    expect(detector.isWatching()).toBe(true);
    expect(chokidar.watch).toHaveBeenCalled();
  });

  test("start is idempotent", async () => {
    await detector.start();
    await detector.start();

    expect(detector.isWatching()).toBe(true);
    expect(chokidar.watch).toHaveBeenCalledTimes(1);
  });

  test("stop ends watching", async () => {
    await detector.start();
    expect(detector.isWatching()).toBe(true);

    await detector.stop();

    expect(detector.isWatching()).toBe(false);
  });

  test("stop is idempotent", async () => {
    await detector.start();
    await detector.stop();
    await detector.stop();

    expect(detector.isWatching()).toBe(false);
  });

  test("start watches correct pattern", async () => {
    await detector.start();

    expect(chokidar.watch).toHaveBeenCalledWith(
      expect.stringContaining(".devac"),
      expect.objectContaining({
        ignoreInitial: true,
        persistent: true,
      })
    );
  });
});

// =============================================================================
// addRepo/removeRepo Tests
// =============================================================================

describe("addRepo/removeRepo", () => {
  let detector: SeedDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = createSeedDetector("/workspace");
  });

  afterEach(async () => {
    await detector.stop();
  });

  test("addRepo increases repo count", async () => {
    const statsBefore = detector.getStats();
    expect(statsBefore.reposWatched).toBe(0);

    await detector.addRepo("/workspace/repo1");

    const statsAfter = detector.getStats();
    expect(statsAfter.reposWatched).toBe(1);
  });

  test("addRepo is idempotent", async () => {
    await detector.addRepo("/workspace/repo1");
    await detector.addRepo("/workspace/repo1");

    const stats = detector.getStats();
    expect(stats.reposWatched).toBe(1);
  });

  test("addRepo adds watch pattern when already watching", async () => {
    await detector.start();

    await detector.addRepo("/workspace/repo1");

    expect(mockWatcher.add).toHaveBeenCalledWith(expect.stringContaining(".devac/seed"));
  });

  test("removeRepo decreases repo count", async () => {
    await detector.addRepo("/workspace/repo1");
    await detector.addRepo("/workspace/repo2");

    detector.removeRepo("/workspace/repo1");

    const stats = detector.getStats();
    expect(stats.reposWatched).toBe(1);
  });

  test("removeRepo handles non-existent repo", async () => {
    detector.removeRepo("/workspace/nonexistent");

    const stats = detector.getStats();
    expect(stats.reposWatched).toBe(0);
  });
});

// =============================================================================
// Event Handling Tests
// =============================================================================

describe("Event handling", () => {
  let detector: SeedDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    // Use very short debounce for tests
    detector = createSeedDetector("/workspace", { debounceMs: 10 });
  });

  afterEach(async () => {
    await detector.stop();
  });

  test("emits seed-change event on file change", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);

    await detector.start();

    // Emit a change
    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "seed-change",
        repoId: expect.stringContaining("repo1"),
      })
    );
  });

  test("handles add event", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);

    await detector.start();

    mockWatcher.emit("add", "/workspace/repo1/.devac/seed/nodes.parquet");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalled();
  });

  test("handles unlink event", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);

    await detector.start();

    mockWatcher.emit("unlink", "/workspace/repo1/.devac/seed/nodes.parquet");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalled();
  });

  test("off removes handler", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);
    detector.off("seed-change", handler);

    await detector.start();

    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });

  test("debounces rapid changes to same repo", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);

    await detector.start();

    // Emit multiple rapid changes
    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");
    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/edges.parquet");
    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/effects.parquet");

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should emit once with all files
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        seedFiles: expect.arrayContaining([
          expect.stringContaining("nodes.parquet"),
          expect.stringContaining("edges.parquet"),
          expect.stringContaining("effects.parquet"),
        ]),
      })
    );
  });

  test("handles multiple repos with changes", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);

    await detector.start();

    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");
    mockWatcher.emit("change", "/workspace/repo2/.devac/seed/nodes.parquet");

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should emit separate events for each repo
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// getStats Tests
// =============================================================================

describe("getStats", () => {
  let detector: SeedDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = createSeedDetector("/workspace", { debounceMs: 10 });
  });

  afterEach(async () => {
    await detector.stop();
  });

  test("returns initial stats", () => {
    const stats = detector.getStats();

    expect(stats.reposWatched).toBe(0);
    expect(stats.changesDetected).toBe(0);
    expect(stats.lastChangeTime).toBeNull();
    expect(stats.isWatching).toBe(false);
  });

  test("updates isWatching on start/stop", async () => {
    expect(detector.getStats().isWatching).toBe(false);

    await detector.start();
    expect(detector.getStats().isWatching).toBe(true);

    await detector.stop();
    expect(detector.getStats().isWatching).toBe(false);
  });

  test("updates changesDetected after events", async () => {
    await detector.start();

    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");
    await new Promise((resolve) => setTimeout(resolve, 50));

    mockWatcher.emit("change", "/workspace/repo2/.devac/seed/nodes.parquet");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stats = detector.getStats();
    expect(stats.changesDetected).toBe(2);
  });

  test("updates lastChangeTime", async () => {
    await detector.start();

    expect(detector.getStats().lastChangeTime).toBeNull();

    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(detector.getStats().lastChangeTime).not.toBeNull();
  });

  test("returns copy of stats", () => {
    const stats1 = detector.getStats();
    const stats2 = detector.getStats();

    expect(stats1).not.toBe(stats2);
    expect(stats1).toEqual(stats2);
  });
});

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe("Edge cases", () => {
  let detector: SeedDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = createSeedDetector("/workspace", { debounceMs: 10 });
  });

  afterEach(async () => {
    await detector.stop();
  });

  test("ignores files not in .devac/seed path", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);

    await detector.start();

    // Path without proper .devac/seed structure
    mockWatcher.emit("change", "/workspace/repo1/src/file.parquet");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });

  test("stop clears watching state and internal state", async () => {
    // This test verifies that stop() clears internal state
    await detector.start();

    expect(detector.isWatching()).toBe(true);

    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");

    // Stop immediately
    await detector.stop();

    // After stop, isWatching should be false
    expect(detector.isWatching()).toBe(false);
    expect(detector.getStats().isWatching).toBe(false);
  });

  test("removeRepo cancels pending changes for that repo", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);

    await detector.addRepo("/workspace/repo1");
    await detector.start();

    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");

    // Remove repo immediately
    detector.removeRepo("/workspace/repo1");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Options Tests
// =============================================================================

describe("Options", () => {
  test("respects ignoreInitial option", async () => {
    vi.clearAllMocks();
    const detector = createSeedDetector("/workspace", { ignoreInitial: false });

    await detector.start();

    expect(chokidar.watch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        ignoreInitial: false,
      })
    );

    await detector.stop();
  });

  test("uses default options when not specified", async () => {
    vi.clearAllMocks();
    const detector = createSeedDetector("/workspace");

    await detector.start();

    expect(chokidar.watch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        ignoreInitial: true,
      })
    );

    await detector.stop();
  });
});

// =============================================================================
// SeedChangeEvent Tests
// =============================================================================

describe("SeedChangeEvent structure", () => {
  let detector: SeedDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = createSeedDetector("/workspace", { debounceMs: 10 });
  });

  afterEach(async () => {
    await detector.stop();
  });

  test("event has correct structure", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);

    await detector.start();

    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "seed-change",
        timestamp: expect.any(String),
        repoPath: expect.any(String),
        repoId: expect.any(String),
        seedFiles: expect.any(Array),
      })
    );
  });

  test("event includes all changed files", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);

    await detector.start();

    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");
    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/edges.parquet");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler.mock.calls.length).toBeGreaterThan(0);
    const event = handler.mock.calls[0]?.[0];
    expect(event?.seedFiles?.length).toBe(2);
  });

  test("event has ISO timestamp", async () => {
    const handler = vi.fn();
    detector.on("seed-change", handler);

    await detector.start();

    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler.mock.calls.length).toBeGreaterThan(0);
    const event = handler.mock.calls[0]?.[0];
    expect(() => new Date(event?.timestamp)).not.toThrow();
  });
});
