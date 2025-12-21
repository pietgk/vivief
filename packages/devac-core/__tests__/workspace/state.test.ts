import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getChangedRepos,
  getStateFilePath,
  isStateStale,
  loadWorkspaceState,
  markReposAsRegistered,
  mergeStateIntoRepos,
  removeRepoFromState,
  repoInfoToState,
  saveWorkspaceState,
  stateFileExists,
  syncStateWithDiscovery,
  updateHubState,
  updateRepoState,
} from "../../src/workspace/state.js";
import type {
  WorkspaceRepoInfo,
  WorkspaceRepoState,
  WorkspaceState,
} from "../../src/workspace/types.js";

describe("getStateFilePath", () => {
  it("should return correct state file path", () => {
    expect(getStateFilePath("/home/user/ws")).toBe("/home/user/ws/.devac/state.json");
    expect(getStateFilePath("/Users/test/projects")).toBe("/Users/test/projects/.devac/state.json");
  });
});

describe("loadWorkspaceState", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return default state when no state file exists", async () => {
    const state = await loadWorkspaceState(tempDir);

    expect(state.version).toBe("1.0");
    expect(state.repos).toEqual([]);
    expect(state.lastDiscovery).toBeDefined();
  });

  it("should load existing state file", async () => {
    const existingState: WorkspaceState = {
      version: "1.0",
      lastDiscovery: "2024-01-01T00:00:00.000Z",
      repos: [
        {
          path: "/path/to/repo",
          repoId: "repo",
          hubStatus: "registered",
        },
      ],
      hub: {
        lastRefresh: "2024-01-01T00:00:00.000Z",
        registeredCount: 1,
      },
    };

    await fs.mkdir(path.join(tempDir, ".devac"), { recursive: true });
    await fs.writeFile(path.join(tempDir, ".devac", "state.json"), JSON.stringify(existingState));

    const state = await loadWorkspaceState(tempDir);

    expect(state.version).toBe("1.0");
    expect(state.repos).toHaveLength(1);
    expect(state.repos[0]?.hubStatus).toBe("registered");
    expect(state.hub?.registeredCount).toBe(1);
  });

  it("should return default state for invalid version", async () => {
    const invalidState = {
      version: "2.0",
      repos: [],
    };

    await fs.mkdir(path.join(tempDir, ".devac"), { recursive: true });
    await fs.writeFile(path.join(tempDir, ".devac", "state.json"), JSON.stringify(invalidState));

    const state = await loadWorkspaceState(tempDir);

    expect(state.version).toBe("1.0");
    expect(state.repos).toEqual([]);
  });
});

describe("saveWorkspaceState", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should save state to file", async () => {
    const state: WorkspaceState = {
      version: "1.0",
      lastDiscovery: "2024-01-01T00:00:00.000Z",
      repos: [
        {
          path: "/path/to/repo",
          repoId: "repo",
          hubStatus: "registered",
        },
      ],
    };

    await saveWorkspaceState(tempDir, state);

    const content = await fs.readFile(path.join(tempDir, ".devac", "state.json"), "utf-8");
    const loaded = JSON.parse(content);

    expect(loaded.version).toBe("1.0");
    expect(loaded.repos).toHaveLength(1);
  });

  it("should create .devac directory if not exists", async () => {
    const state: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [],
    };

    await saveWorkspaceState(tempDir, state);

    const exists = await fs
      .stat(path.join(tempDir, ".devac"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });
});

describe("updateRepoState", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should add new repo to state", async () => {
    const repoState: WorkspaceRepoState = {
      path: "/path/to/repo",
      repoId: "repo",
      hubStatus: "registered",
    };

    await updateRepoState(tempDir, repoState);

    const state = await loadWorkspaceState(tempDir);
    expect(state.repos).toHaveLength(1);
    expect(state.repos[0]?.repoId).toBe("repo");
  });

  it("should update existing repo in state", async () => {
    // Initial state
    const initialState: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [
        {
          path: "/path/to/repo",
          repoId: "repo",
          hubStatus: "unregistered",
        },
      ],
    };
    await saveWorkspaceState(tempDir, initialState);

    // Update
    const updatedRepoState: WorkspaceRepoState = {
      path: "/path/to/repo",
      repoId: "repo",
      hubStatus: "registered",
    };
    await updateRepoState(tempDir, updatedRepoState);

    const state = await loadWorkspaceState(tempDir);
    expect(state.repos).toHaveLength(1);
    expect(state.repos[0]?.hubStatus).toBe("registered");
  });
});

describe("updateHubState", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should update hub metadata", async () => {
    await updateHubState(tempDir, {
      lastRefresh: "2024-01-01T00:00:00.000Z",
      registeredCount: 5,
    });

    const state = await loadWorkspaceState(tempDir);
    expect(state.hub?.lastRefresh).toBe("2024-01-01T00:00:00.000Z");
    expect(state.hub?.registeredCount).toBe(5);
  });
});

describe("removeRepoFromState", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should remove repo by path", async () => {
    const initialState: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [
        { path: "/path/to/repo1", repoId: "repo1", hubStatus: "registered" },
        { path: "/path/to/repo2", repoId: "repo2", hubStatus: "registered" },
      ],
    };
    await saveWorkspaceState(tempDir, initialState);

    await removeRepoFromState(tempDir, "/path/to/repo1");

    const state = await loadWorkspaceState(tempDir);
    expect(state.repos).toHaveLength(1);
    expect(state.repos[0]?.repoId).toBe("repo2");
  });
});

describe("isStateStale", () => {
  it("should return true for old state", () => {
    const oldState: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
      repos: [],
    };

    expect(isStateStale(oldState)).toBe(true);
  });

  it("should return false for recent state", () => {
    const recentState: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [],
    };

    expect(isStateStale(recentState)).toBe(false);
  });

  it("should support custom max age", () => {
    const state: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
      repos: [],
    };

    // With 1 minute max age, should be stale
    expect(isStateStale(state, 60 * 1000)).toBe(true);

    // With 10 minute max age, should not be stale
    expect(isStateStale(state, 10 * 60 * 1000)).toBe(false);
  });
});

describe("repoInfoToState", () => {
  it("should convert WorkspaceRepoInfo to WorkspaceRepoState", () => {
    const repoInfo: WorkspaceRepoInfo = {
      path: "/path/to/repo",
      repoId: "repo",
      name: "repo",
      hasSeeds: true,
      isWorktree: false,
      hubStatus: "registered",
      seedsLastModified: "2024-01-01T00:00:00.000Z",
    };

    const state = repoInfoToState(repoInfo);

    expect(state.path).toBe("/path/to/repo");
    expect(state.repoId).toBe("repo");
    expect(state.hubStatus).toBe("registered");
    expect(state.seedsLastModified).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("syncStateWithDiscovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should add new repos and remove old ones", async () => {
    // Existing state has repo1
    const initialState: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [{ path: "/path/to/repo1", repoId: "repo1", hubStatus: "registered" }],
    };
    await saveWorkspaceState(tempDir, initialState);

    // Discovery finds repo2 (new) but not repo1 (removed)
    const discoveredRepos: WorkspaceRepoInfo[] = [
      {
        path: "/path/to/repo2",
        repoId: "repo2",
        name: "repo2",
        hasSeeds: true,
        isWorktree: false,
        hubStatus: "unregistered",
      },
    ];

    const state = await syncStateWithDiscovery(tempDir, discoveredRepos);

    expect(state.repos).toHaveLength(1);
    expect(state.repos[0]?.repoId).toBe("repo2");
  });

  it("should preserve hub status for existing repos", async () => {
    const initialState: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [{ path: "/path/to/repo", repoId: "repo", hubStatus: "registered" }],
    };
    await saveWorkspaceState(tempDir, initialState);

    // Discovery finds same repo
    const discoveredRepos: WorkspaceRepoInfo[] = [
      {
        path: "/path/to/repo",
        repoId: "repo",
        name: "repo",
        hasSeeds: true,
        isWorktree: false,
        hubStatus: "unregistered", // Discovery doesn't know hub status
      },
    ];

    const state = await syncStateWithDiscovery(tempDir, discoveredRepos);

    expect(state.repos[0]?.hubStatus).toBe("registered"); // Preserved from state
  });
});

describe("mergeStateIntoRepos", () => {
  it("should merge persisted hub status into repos", () => {
    const repos: WorkspaceRepoInfo[] = [
      {
        path: "/path/to/repo",
        repoId: "repo",
        name: "repo",
        hasSeeds: true,
        isWorktree: false,
        hubStatus: "unregistered",
      },
    ];

    const state: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [{ path: "/path/to/repo", repoId: "repo", hubStatus: "registered" }],
    };

    const merged = mergeStateIntoRepos(repos, state);

    expect(merged[0]?.hubStatus).toBe("registered");
  });

  it("should keep unregistered if no state exists", () => {
    const repos: WorkspaceRepoInfo[] = [
      {
        path: "/path/to/repo",
        repoId: "repo",
        name: "repo",
        hasSeeds: true,
        isWorktree: false,
        hubStatus: "unregistered",
      },
    ];

    const state: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [],
    };

    const merged = mergeStateIntoRepos(repos, state);

    expect(merged[0]?.hubStatus).toBe("unregistered");
  });
});

describe("getChangedRepos", () => {
  it("should detect new repos as changed", () => {
    const repos: WorkspaceRepoInfo[] = [
      {
        path: "/path/to/new-repo",
        repoId: "new-repo",
        name: "new-repo",
        hasSeeds: true,
        isWorktree: false,
        hubStatus: "unregistered",
      },
    ];

    const state: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [],
    };

    const changed = getChangedRepos(repos, state);

    expect(changed).toHaveLength(1);
    expect(changed[0]?.repoId).toBe("new-repo");
  });

  it("should detect repos with changed seeds", () => {
    const repos: WorkspaceRepoInfo[] = [
      {
        path: "/path/to/repo",
        repoId: "repo",
        name: "repo",
        hasSeeds: true,
        isWorktree: false,
        hubStatus: "registered",
        seedsLastModified: "2024-01-02T00:00:00.000Z",
      },
    ];

    const state: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [
        {
          path: "/path/to/repo",
          repoId: "repo",
          hubStatus: "registered",
          seedsLastModified: "2024-01-01T00:00:00.000Z",
        },
      ],
    };

    const changed = getChangedRepos(repos, state);

    expect(changed).toHaveLength(1);
  });

  it("should not include repos without seeds", () => {
    const repos: WorkspaceRepoInfo[] = [
      {
        path: "/path/to/repo",
        repoId: "repo",
        name: "repo",
        hasSeeds: false,
        isWorktree: false,
        hubStatus: "unregistered",
      },
    ];

    const state: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [{ path: "/path/to/repo", repoId: "repo", hubStatus: "unregistered" }],
    };

    const changed = getChangedRepos(repos, state);

    expect(changed).toHaveLength(0);
  });
});

describe("markReposAsRegistered", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should mark specified repos as registered", async () => {
    const initialState: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [
        { path: "/path/to/repo1", repoId: "repo1", hubStatus: "unregistered" },
        { path: "/path/to/repo2", repoId: "repo2", hubStatus: "unregistered" },
      ],
    };
    await saveWorkspaceState(tempDir, initialState);

    await markReposAsRegistered(tempDir, ["/path/to/repo1"]);

    const state = await loadWorkspaceState(tempDir);
    expect(state.repos.find((r) => r.path === "/path/to/repo1")?.hubStatus).toBe("registered");
    expect(state.repos.find((r) => r.path === "/path/to/repo2")?.hubStatus).toBe("unregistered");
  });

  it("should update hub metadata", async () => {
    const initialState: WorkspaceState = {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: [{ path: "/path/to/repo", repoId: "repo", hubStatus: "unregistered" }],
    };
    await saveWorkspaceState(tempDir, initialState);

    await markReposAsRegistered(tempDir, ["/path/to/repo"]);

    const state = await loadWorkspaceState(tempDir);
    expect(state.hub?.registeredCount).toBe(1);
    expect(state.hub?.lastRefresh).toBeDefined();
  });
});

describe("stateFileExists", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return true when state file exists", async () => {
    await fs.mkdir(path.join(tempDir, ".devac"), { recursive: true });
    await fs.writeFile(path.join(tempDir, ".devac", "state.json"), "{}");

    expect(await stateFileExists(tempDir)).toBe(true);
  });

  it("should return false when state file does not exist", async () => {
    expect(await stateFileExists(tempDir)).toBe(false);
  });
});
