/**
 * Tests for auto-refresh.ts
 *
 * Tests the auto-refresh functionality for Hub updates.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CentralHub } from "../../src/hub/central-hub.js";
import { type AutoRefresher, createAutoRefresher } from "../../src/workspace/auto-refresh.js";
import type { SeedDetector } from "../../src/workspace/seed-detector.js";
import type { SeedChangeEvent } from "../../src/workspace/types.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createMockHub(): CentralHub {
  return {
    refreshRepo: vi.fn().mockResolvedValue({
      reposRefreshed: 1,
      packagesUpdated: 5,
      edgesUpdated: 0,
      errors: [],
    }),
    // Add other methods as needed
  } as unknown as CentralHub;
}

function createMockSeedDetector(): SeedDetector & EventEmitter {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    scan: vi.fn(),
    watch: vi.fn(),
    stop: vi.fn(),
    getSeeds: vi.fn().mockReturnValue([]),
  }) as unknown as SeedDetector & EventEmitter;
}

function createSeedChangeEvent(repoId: string, repoPath = `/path/to/${repoId}`): SeedChangeEvent {
  return {
    type: "seed-change",
    repoId,
    repoPath,
    timestamp: new Date().toISOString(),
    seedFiles: ["nodes.parquet", "edges.parquet"],
  };
}

// =============================================================================
// createAutoRefresher Tests
// =============================================================================

describe("createAutoRefresher", () => {
  let mockHub: CentralHub;

  beforeEach(() => {
    mockHub = createMockHub();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("creates auto-refresher with default options", () => {
    const refresher = createAutoRefresher(mockHub);

    expect(refresher).toBeDefined();
    expect(refresher.isActive()).toBe(false);
  });

  test("creates auto-refresher with custom options", () => {
    const refresher = createAutoRefresher(mockHub, {
      debounceMs: 1000,
      batchChanges: false,
      maxBatchWaitMs: 2000,
    });

    expect(refresher).toBeDefined();
    expect(refresher.isActive()).toBe(false);
  });
});

// =============================================================================
// start/stop Tests
// =============================================================================

describe("start/stop", () => {
  let mockHub: CentralHub;
  let mockDetector: SeedDetector & EventEmitter;
  let refresher: AutoRefresher;

  beforeEach(() => {
    mockHub = createMockHub();
    mockDetector = createMockSeedDetector();
    refresher = createAutoRefresher(mockHub);
    vi.useFakeTimers();
  });

  afterEach(() => {
    refresher.stop();
    vi.useRealTimers();
  });

  test("start activates the refresher", () => {
    expect(refresher.isActive()).toBe(false);

    refresher.start(mockDetector);

    expect(refresher.isActive()).toBe(true);
  });

  test("start is idempotent", () => {
    refresher.start(mockDetector);
    refresher.start(mockDetector);

    expect(refresher.isActive()).toBe(true);
  });

  test("stop deactivates the refresher", () => {
    refresher.start(mockDetector);
    expect(refresher.isActive()).toBe(true);

    refresher.stop();

    expect(refresher.isActive()).toBe(false);
  });

  test("stop is idempotent", () => {
    refresher.start(mockDetector);
    refresher.stop();
    refresher.stop();

    expect(refresher.isActive()).toBe(false);
  });

  test("stop clears pending refreshes", () => {
    refresher.start(mockDetector);

    // Emit a change
    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    const statsBefore = refresher.getStats();
    expect(statsBefore.pendingRepos).toBe(1);

    refresher.stop();

    const statsAfter = refresher.getStats();
    expect(statsAfter.pendingRepos).toBe(0);
  });

  test("stop cancels pending timers", () => {
    refresher.start(mockDetector);

    // Emit a change to start timers
    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    refresher.stop();

    // Advance time past all timers
    vi.advanceTimersByTime(5000);

    // Hub should not have been called
    expect(mockHub.refreshRepo).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Seed Change Handling Tests
// =============================================================================

describe("Seed change handling", () => {
  let mockHub: CentralHub;
  let mockDetector: SeedDetector & EventEmitter;
  let refresher: AutoRefresher;

  beforeEach(() => {
    mockHub = createMockHub();
    mockDetector = createMockSeedDetector();
    refresher = createAutoRefresher(mockHub, {
      debounceMs: 100,
      batchChanges: true,
      maxBatchWaitMs: 500,
    });
    refresher.start(mockDetector);
    vi.useFakeTimers();
  });

  afterEach(() => {
    refresher.stop();
    vi.useRealTimers();
  });

  test("triggers refresh after debounce period", async () => {
    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    // Not yet triggered
    expect(mockHub.refreshRepo).not.toHaveBeenCalled();

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(150);

    expect(mockHub.refreshRepo).toHaveBeenCalledWith("repo1");
  });

  test("debounces multiple changes to same repo", async () => {
    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));
    await vi.advanceTimersByTimeAsync(50);
    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));
    await vi.advanceTimersByTimeAsync(50);
    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    // Not yet triggered
    expect(mockHub.refreshRepo).not.toHaveBeenCalled();

    // Advance past debounce from last change
    await vi.advanceTimersByTimeAsync(150);

    // Should only refresh once
    expect(mockHub.refreshRepo).toHaveBeenCalledTimes(1);
  });

  test("batches changes to multiple repos", async () => {
    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));
    await vi.advanceTimersByTimeAsync(50);
    mockDetector.emit("seed-change", createSeedChangeEvent("repo2"));
    await vi.advanceTimersByTimeAsync(50);
    mockDetector.emit("seed-change", createSeedChangeEvent("repo3"));

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(150);

    // All repos should be refreshed
    expect(mockHub.refreshRepo).toHaveBeenCalledTimes(3);
    expect(mockHub.refreshRepo).toHaveBeenCalledWith("repo1");
    expect(mockHub.refreshRepo).toHaveBeenCalledWith("repo2");
    expect(mockHub.refreshRepo).toHaveBeenCalledWith("repo3");
  });

  test("respects maxBatchWaitMs", async () => {
    // Emit changes with delays but before debounce completes
    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    // Keep emitting changes to reset debounce
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(50);
      mockDetector.emit("seed-change", createSeedChangeEvent(`repo${i + 2}`));
    }

    // Max batch wait should have triggered by now (500ms total)
    expect(mockHub.refreshRepo).toHaveBeenCalled();
  });
});

// =============================================================================
// refreshRepos Tests
// =============================================================================

describe("refreshRepos", () => {
  let mockHub: CentralHub;
  let refresher: AutoRefresher;

  beforeEach(() => {
    mockHub = createMockHub();
    refresher = createAutoRefresher(mockHub);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("refreshes specified repos", async () => {
    const event = await refresher.refreshRepos(["repo1", "repo2"]);

    expect(mockHub.refreshRepo).toHaveBeenCalledTimes(2);
    expect(mockHub.refreshRepo).toHaveBeenCalledWith("repo1");
    expect(mockHub.refreshRepo).toHaveBeenCalledWith("repo2");
    expect(event.refreshedRepos).toContain("repo1");
    expect(event.refreshedRepos).toContain("repo2");
  });

  test("returns refresh event with stats", async () => {
    const event = await refresher.refreshRepos(["repo1"]);

    expect(event.type).toBe("hub-refresh");
    expect(event.timestamp).toBeDefined();
    expect(event.refreshedRepos).toEqual(["repo1"]);
    expect(event.packagesUpdated).toBe(5);
    expect(event.errors).toEqual([]);
  });

  test("handles refresh errors", async () => {
    vi.mocked(mockHub.refreshRepo).mockRejectedValueOnce(new Error("Refresh failed"));

    const event = await refresher.refreshRepos(["repo1"]);

    expect(event.errors).toContain("Refresh failed");
    expect(event.refreshedRepos).toEqual([]);
  });

  test("continues on partial failures", async () => {
    vi.mocked(mockHub.refreshRepo)
      .mockRejectedValueOnce(new Error("Failed"))
      .mockResolvedValueOnce({
        reposRefreshed: 1,
        packagesUpdated: 3,
        edgesUpdated: 0,
        errors: [],
      });

    const event = await refresher.refreshRepos(["repo1", "repo2"]);

    expect(event.errors).toContain("Failed");
    expect(event.refreshedRepos).toEqual(["repo2"]);
    expect(event.packagesUpdated).toBe(3);
  });

  test("collects errors from hub", async () => {
    vi.mocked(mockHub.refreshRepo).mockResolvedValueOnce({
      reposRefreshed: 1,
      packagesUpdated: 2,
      edgesUpdated: 0,
      errors: ["Warning: stale data"],
    });

    const event = await refresher.refreshRepos(["repo1"]);

    expect(event.errors).toContain("Warning: stale data");
  });

  test("handles non-Error exceptions", async () => {
    vi.mocked(mockHub.refreshRepo).mockRejectedValueOnce("string error");

    const event = await refresher.refreshRepos(["repo1"]);

    expect(event.errors).toContain("string error");
  });

  test("returns empty event for no repos", async () => {
    const event = await refresher.refreshRepos([]);

    expect(mockHub.refreshRepo).not.toHaveBeenCalled();
    expect(event.refreshedRepos).toEqual([]);
    expect(event.packagesUpdated).toBe(0);
    expect(event.errors).toEqual([]);
  });
});

// =============================================================================
// getStats Tests
// =============================================================================

describe("getStats", () => {
  let mockHub: CentralHub;
  let refresher: AutoRefresher;

  beforeEach(() => {
    mockHub = createMockHub();
    refresher = createAutoRefresher(mockHub);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns initial stats", () => {
    const stats = refresher.getStats();

    expect(stats.refreshCount).toBe(0);
    expect(stats.reposRefreshed).toBe(0);
    expect(stats.lastRefreshTime).toBeNull();
    expect(stats.isActive).toBe(false);
    expect(stats.pendingRepos).toBe(0);
  });

  test("updates stats after refresh", async () => {
    await refresher.refreshRepos(["repo1", "repo2"]);

    const stats = refresher.getStats();

    expect(stats.refreshCount).toBe(1);
    expect(stats.reposRefreshed).toBe(2);
    expect(stats.lastRefreshTime).not.toBeNull();
  });

  test("accumulates stats over multiple refreshes", async () => {
    await refresher.refreshRepos(["repo1"]);
    await refresher.refreshRepos(["repo2", "repo3"]);

    const stats = refresher.getStats();

    expect(stats.refreshCount).toBe(2);
    expect(stats.reposRefreshed).toBe(3);
  });

  test("tracks pending repos", () => {
    const mockDetector = createMockSeedDetector();
    refresher.start(mockDetector);

    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));
    mockDetector.emit("seed-change", createSeedChangeEvent("repo2"));

    const stats = refresher.getStats();

    expect(stats.pendingRepos).toBe(2);
    expect(stats.isActive).toBe(true);

    refresher.stop();
  });

  test("returns isActive status", () => {
    const mockDetector = createMockSeedDetector();

    expect(refresher.getStats().isActive).toBe(false);

    refresher.start(mockDetector);
    expect(refresher.getStats().isActive).toBe(true);

    refresher.stop();
    expect(refresher.getStats().isActive).toBe(false);
  });
});

// =============================================================================
// Event Handling Tests
// =============================================================================

describe("Event handling", () => {
  let mockHub: CentralHub;
  let refresher: AutoRefresher;

  beforeEach(() => {
    mockHub = createMockHub();
    refresher = createAutoRefresher(mockHub);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("emits refresh event", async () => {
    const handler = vi.fn();
    refresher.on("refresh", handler);

    await refresher.refreshRepos(["repo1"]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "hub-refresh",
        refreshedRepos: ["repo1"],
      })
    );
  });

  test("supports multiple handlers", async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    refresher.on("refresh", handler1);
    refresher.on("refresh", handler2);

    await refresher.refreshRepos(["repo1"]);

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  test("off removes handler", async () => {
    const handler = vi.fn();
    refresher.on("refresh", handler);
    refresher.off("refresh", handler);

    await refresher.refreshRepos(["repo1"]);

    expect(handler).not.toHaveBeenCalled();
  });

  test("emits event after automatic refresh", async () => {
    const mockDetector = createMockSeedDetector();
    refresher = createAutoRefresher(mockHub, { debounceMs: 100 });
    refresher.start(mockDetector);

    const handler = vi.fn();
    refresher.on("refresh", handler);

    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    await vi.advanceTimersByTimeAsync(150);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "hub-refresh",
      })
    );

    refresher.stop();
  });
});

// =============================================================================
// Options Tests
// =============================================================================

describe("Options", () => {
  let mockHub: CentralHub;
  let mockDetector: SeedDetector & EventEmitter;

  beforeEach(() => {
    mockHub = createMockHub();
    mockDetector = createMockSeedDetector();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("respects custom debounceMs", async () => {
    const refresher = createAutoRefresher(mockHub, { debounceMs: 300 });
    refresher.start(mockDetector);

    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    // Not triggered after 200ms
    await vi.advanceTimersByTimeAsync(200);
    expect(mockHub.refreshRepo).not.toHaveBeenCalled();

    // Triggered after 300ms
    await vi.advanceTimersByTimeAsync(150);
    expect(mockHub.refreshRepo).toHaveBeenCalled();

    refresher.stop();
  });

  test("respects batchChanges=false", async () => {
    const refresher = createAutoRefresher(mockHub, {
      debounceMs: 100,
      batchChanges: false,
    });
    refresher.start(mockDetector);

    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    // Without batching, should trigger after debounce
    await vi.advanceTimersByTimeAsync(150);
    expect(mockHub.refreshRepo).toHaveBeenCalled();

    refresher.stop();
  });

  test("uses default options when not specified", async () => {
    const refresher = createAutoRefresher(mockHub);
    refresher.start(mockDetector);

    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    // Default debounce is 500ms
    await vi.advanceTimersByTimeAsync(400);
    expect(mockHub.refreshRepo).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);
    expect(mockHub.refreshRepo).toHaveBeenCalled();

    refresher.stop();
  });
});

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe("Edge cases", () => {
  let mockHub: CentralHub;
  let mockDetector: SeedDetector & EventEmitter;

  beforeEach(() => {
    mockHub = createMockHub();
    mockDetector = createMockSeedDetector();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("handles rapid successive changes", async () => {
    const refresher = createAutoRefresher(mockHub, { debounceMs: 100 });
    refresher.start(mockDetector);

    // Emit many changes rapidly
    for (let i = 0; i < 100; i++) {
      mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));
    }

    await vi.advanceTimersByTimeAsync(150);

    // Should only refresh once
    expect(mockHub.refreshRepo).toHaveBeenCalledTimes(1);

    refresher.stop();
  });

  test("handles repo refresh with zero packages", async () => {
    vi.mocked(mockHub.refreshRepo).mockResolvedValueOnce({
      reposRefreshed: 0,
      packagesUpdated: 0,
      edgesUpdated: 0,
      errors: [],
    });

    const refresher = createAutoRefresher(mockHub);
    const event = await refresher.refreshRepos(["repo1"]);

    // Repo not included in refreshedRepos since nothing changed
    expect(event.refreshedRepos).toEqual([]);
    expect(event.packagesUpdated).toBe(0);
  });

  test("does not process changes when stopped", async () => {
    const refresher = createAutoRefresher(mockHub, { debounceMs: 100 });
    refresher.start(mockDetector);
    refresher.stop();

    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    await vi.advanceTimersByTimeAsync(150);

    expect(mockHub.refreshRepo).not.toHaveBeenCalled();
  });

  test("can restart after stop", async () => {
    const refresher = createAutoRefresher(mockHub, { debounceMs: 100 });

    refresher.start(mockDetector);
    refresher.stop();
    refresher.start(mockDetector);

    mockDetector.emit("seed-change", createSeedChangeEvent("repo1"));

    await vi.advanceTimersByTimeAsync(150);

    expect(mockHub.refreshRepo).toHaveBeenCalledTimes(1);

    refresher.stop();
  });
});
