/**
 * Tests for watcher.ts
 *
 * Tests the workspace watcher functionality.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { WorkspaceRepoInfo } from "../../src/workspace/types.js";

// =============================================================================
// Mocks - must be defined before imports
// =============================================================================

class MockWatcher extends EventEmitter {
  add = vi.fn();
  close = vi.fn().mockResolvedValue(undefined);

  emitReady(): void {
    this.emit("ready");
  }
}

let mockWatcher: MockWatcher;

vi.mock("chokidar", () => ({
  watch: vi.fn(() => {
    mockWatcher = new MockWatcher();
    Promise.resolve().then(() => mockWatcher.emitReady());
    return mockWatcher;
  }),
}));

const mockRepos: WorkspaceRepoInfo[] = [
  {
    path: "/workspace/repo1",
    repoId: "github.com/org/repo1",
    name: "repo1",
    hasSeeds: true,
    isWorktree: false,
    hubStatus: "registered",
  },
  {
    path: "/workspace/repo2",
    repoId: "github.com/org/repo2",
    name: "repo2",
    hasSeeds: true,
    isWorktree: false,
    hubStatus: "registered",
  },
];

vi.mock("../../src/workspace/discover.js", () => ({
  discoverWorkspaceRepos: vi.fn(async () => mockRepos),
  isGitRepo: vi.fn(async () => true),
}));

import * as chokidar from "chokidar";
import { type WorkspaceWatcher, createWorkspaceWatcher } from "../../src/workspace/watcher.js";

// =============================================================================
// createWorkspaceWatcher Tests
// =============================================================================

describe("createWorkspaceWatcher", () => {
  test("creates watcher with required options", () => {
    const watcher = createWorkspaceWatcher({ workspacePath: "/workspace" });

    expect(watcher).toBeDefined();
    expect(watcher.isWatching()).toBe(false);
  });

  test("creates watcher with custom options", () => {
    const watcher = createWorkspaceWatcher({
      workspacePath: "/workspace",
      debounceMs: 200,
      watchSeeds: false,
      ignorePatterns: ["**/custom/**"],
    });

    expect(watcher).toBeDefined();
    expect(watcher.isWatching()).toBe(false);
  });
});

// =============================================================================
// start/stop Tests
// =============================================================================

describe("start/stop", () => {
  let watcher: WorkspaceWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    watcher = createWorkspaceWatcher({ workspacePath: "/workspace" });
  });

  afterEach(async () => {
    await watcher.stop();
  });

  test("start begins watching", async () => {
    expect(watcher.isWatching()).toBe(false);

    await watcher.start();

    expect(watcher.isWatching()).toBe(true);
    expect(chokidar.watch).toHaveBeenCalled();
  });

  test("start is idempotent", async () => {
    await watcher.start();
    await watcher.start();

    expect(watcher.isWatching()).toBe(true);
    expect(chokidar.watch).toHaveBeenCalledTimes(1);
  });

  test("stop ends watching", async () => {
    await watcher.start();
    expect(watcher.isWatching()).toBe(true);

    await watcher.stop();

    expect(watcher.isWatching()).toBe(false);
  });

  test("stop is idempotent", async () => {
    await watcher.start();
    await watcher.stop();
    await watcher.stop();

    expect(watcher.isWatching()).toBe(false);
  });

  test("start configures chokidar with options", async () => {
    await watcher.start();

    expect(chokidar.watch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        ignoreInitial: true,
        persistent: true,
      })
    );
  });
});

// =============================================================================
// getWatchedRepos Tests
// =============================================================================

describe("getWatchedRepos", () => {
  let watcher: WorkspaceWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    watcher = createWorkspaceWatcher({ workspacePath: "/workspace" });
  });

  afterEach(async () => {
    await watcher.stop();
  });

  test("returns empty array before start", () => {
    const repos = watcher.getWatchedRepos();

    expect(repos).toEqual([]);
  });

  test("returns discovered repos after start", async () => {
    await watcher.start();

    const repos = watcher.getWatchedRepos();

    expect(repos).toContain("/workspace/repo1");
    expect(repos).toContain("/workspace/repo2");
    expect(repos).toHaveLength(2);
  });
});

// =============================================================================
// getStats Tests
// =============================================================================

describe("getStats", () => {
  let watcher: WorkspaceWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    watcher = createWorkspaceWatcher({ workspacePath: "/workspace" });
  });

  afterEach(async () => {
    await watcher.stop();
  });

  test("returns initial stats", () => {
    const stats = watcher.getStats();

    expect(stats.eventsProcessed).toBe(0);
    expect(stats.reposWatched).toBe(0);
    expect(stats.lastEventTime).toBeNull();
    expect(stats.isWatching).toBe(false);
    expect(stats.startedAt).toBeNull();
  });

  test("updates stats after start", async () => {
    await watcher.start();

    const stats = watcher.getStats();

    expect(stats.isWatching).toBe(true);
    expect(stats.startedAt).not.toBeNull();
    expect(stats.reposWatched).toBe(2);
  });

  test("resets isWatching after stop", async () => {
    await watcher.start();
    await watcher.stop();

    const stats = watcher.getStats();

    expect(stats.isWatching).toBe(false);
  });

  test("returns copy of stats", () => {
    const stats1 = watcher.getStats();
    const stats2 = watcher.getStats();

    expect(stats1).not.toBe(stats2);
    expect(stats1).toEqual(stats2);
  });
});

// =============================================================================
// Event Handling Tests
// =============================================================================

describe("Event handling", () => {
  let watcher: WorkspaceWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    watcher = createWorkspaceWatcher({
      workspacePath: "/workspace",
      debounceMs: 10,
    });
  });

  afterEach(async () => {
    await watcher.stop();
  });

  test("emits watcher-state started event on start", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "watcher-state",
        state: "started",
      })
    );
  });

  test("emits watcher-state stopped event on stop", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    await watcher.stop();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "watcher-state",
        state: "stopped",
      })
    );
  });

  test("emits file-change event on code file change", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    mockWatcher.emit("change", "/workspace/repo1/src/index.ts");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "file-change",
        repoPath: "/workspace/repo1",
        changeType: "change",
      })
    );
  });

  test("emits file-change event on file add", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    mockWatcher.emit("add", "/workspace/repo1/src/new-file.ts");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "file-change",
        changeType: "add",
      })
    );
  });

  test("emits file-change event on file unlink", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    mockWatcher.emit("unlink", "/workspace/repo1/src/removed.ts");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "file-change",
        changeType: "unlink",
      })
    );
  });

  test("ignores non-code file changes", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    mockWatcher.emit("change", "/workspace/repo1/README.md");

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not emit file-change for .md files
    expect(handler).not.toHaveBeenCalledWith(expect.objectContaining({ type: "file-change" }));
  });

  test("emits event for seed file changes", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    mockWatcher.emit("change", "/workspace/repo1/.devac/seed/nodes.parquet");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "file-change",
        filePath: expect.stringContaining(".devac/seed/"),
      })
    );
  });

  test("on returns unsubscribe function", async () => {
    const handler = vi.fn();
    const unsubscribe = watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    unsubscribe();

    mockWatcher.emit("change", "/workspace/repo1/src/index.ts");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });

  test("debounces rapid changes to same file", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    // Rapid changes to same file
    mockWatcher.emit("change", "/workspace/repo1/src/index.ts");
    mockWatcher.emit("change", "/workspace/repo1/src/index.ts");
    mockWatcher.emit("change", "/workspace/repo1/src/index.ts");

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should only emit once
    const fileChangeEvents = handler.mock.calls.filter((call) => call[0].type === "file-change");
    expect(fileChangeEvents).toHaveLength(1);
  });

  test("updates stats after file event", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();

    const statsBefore = watcher.getStats();
    expect(statsBefore.eventsProcessed).toBe(0);
    expect(statsBefore.lastEventTime).toBeNull();

    mockWatcher.emit("change", "/workspace/repo1/src/index.ts");

    await new Promise((resolve) => setTimeout(resolve, 50));

    const statsAfter = watcher.getStats();
    expect(statsAfter.eventsProcessed).toBe(1);
    expect(statsAfter.lastEventTime).not.toBeNull();
  });
});

// =============================================================================
// Directory Events Tests
// =============================================================================

describe("Directory events", () => {
  let watcher: WorkspaceWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    watcher = createWorkspaceWatcher({
      workspacePath: "/workspace",
      debounceMs: 10,
    });
  });

  afterEach(async () => {
    await watcher.stop();
  });

  test("ignores addDir for repos already being watched", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    // repo1 is already watched, addDir shouldn't emit again
    mockWatcher.emit("addDir", "/workspace/repo1");

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not emit repo-discovery for already watched repo
    expect(handler).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "repo-discovery",
        action: "added",
      })
    );
  });

  test("emits repo-discovery removed event for removed repo", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    // Simulate removing a watched directory
    mockWatcher.emit("unlinkDir", "/workspace/repo1");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "repo-discovery",
        action: "removed",
      })
    );
  });

  test("ignores nested directory changes", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    // Nested directory - not a direct child of workspace
    mockWatcher.emit("addDir", "/workspace/repo1/src");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalledWith(expect.objectContaining({ type: "repo-discovery" }));
  });
});

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe("Edge cases", () => {
  let watcher: WorkspaceWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    watcher = createWorkspaceWatcher({
      workspacePath: "/workspace",
      debounceMs: 10,
    });
  });

  afterEach(async () => {
    await watcher.stop();
  });

  test("ignores files outside watched repos", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    // File in a path that's not in watched repos
    mockWatcher.emit("change", "/other/path/file.ts");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalledWith(expect.objectContaining({ type: "file-change" }));
  });

  test("stop clears pending events", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    mockWatcher.emit("change", "/workspace/repo1/src/index.ts");

    // Stop before debounce completes
    await watcher.stop();

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not emit file-change after stop
    expect(handler).not.toHaveBeenCalledWith(expect.objectContaining({ type: "file-change" }));
  });

  test("ignores unlinkDir for non-watched repos", async () => {
    const handler = vi.fn();
    watcher.on(handler);

    await watcher.start();
    handler.mockClear();

    // Directory that was never watched
    mockWatcher.emit("unlinkDir", "/workspace/unknown-repo");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalledWith(expect.objectContaining({ type: "repo-discovery" }));
  });
});
