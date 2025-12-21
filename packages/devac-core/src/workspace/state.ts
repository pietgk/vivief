/**
 * Workspace State Management
 *
 * Manages persisted workspace state in .devac/state.json.
 * Tracks repository states, hub sync status, and enables
 * incremental updates on restart.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  RepoHubStatus,
  WorkspaceRepoInfo,
  WorkspaceRepoState,
  WorkspaceState,
} from "./types.js";

/**
 * Default state for new workspaces
 */
function createDefaultState(): WorkspaceState {
  return {
    version: "1.0",
    lastDiscovery: new Date().toISOString(),
    repos: [],
  };
}

/**
 * Get the state file path for a workspace
 */
export function getStateFilePath(workspacePath: string): string {
  return path.join(workspacePath, ".devac", "state.json");
}

/**
 * Load workspace state from disk
 *
 * @param workspacePath Path to the workspace directory
 * @returns Loaded state or default state if not found
 */
export async function loadWorkspaceState(workspacePath: string): Promise<WorkspaceState> {
  const statePath = getStateFilePath(workspacePath);

  try {
    const content = await fs.readFile(statePath, "utf-8");
    const loaded = JSON.parse(content) as WorkspaceState;

    // Validate and migrate if needed
    if (loaded.version !== "1.0") {
      // Future: handle migrations
      return createDefaultState();
    }

    return loaded;
  } catch {
    return createDefaultState();
  }
}

/**
 * Save workspace state to disk
 *
 * @param workspacePath Path to the workspace directory
 * @param state State to save
 */
export async function saveWorkspaceState(
  workspacePath: string,
  state: WorkspaceState
): Promise<void> {
  const statePath = getStateFilePath(workspacePath);
  const stateDir = path.dirname(statePath);

  // Ensure .devac directory exists
  await fs.mkdir(stateDir, { recursive: true });

  // Write state with pretty formatting
  const content = JSON.stringify(state, null, 2);
  await fs.writeFile(statePath, content, "utf-8");
}

/**
 * Update a single repo's state
 *
 * @param workspacePath Path to the workspace directory
 * @param repoState Updated repo state
 */
export async function updateRepoState(
  workspacePath: string,
  repoState: WorkspaceRepoState
): Promise<void> {
  const state = await loadWorkspaceState(workspacePath);

  // Find and update or add the repo
  const existingIndex = state.repos.findIndex((r) => r.path === repoState.path);
  if (existingIndex >= 0) {
    state.repos[existingIndex] = repoState;
  } else {
    state.repos.push(repoState);
  }

  await saveWorkspaceState(workspacePath, state);
}

/**
 * Update hub metadata in state
 *
 * @param workspacePath Path to the workspace directory
 * @param hubMeta Hub metadata to update
 */
export async function updateHubState(
  workspacePath: string,
  hubMeta: NonNullable<WorkspaceState["hub"]>
): Promise<void> {
  const state = await loadWorkspaceState(workspacePath);
  state.hub = hubMeta;
  await saveWorkspaceState(workspacePath, state);
}

/**
 * Remove a repo from state
 *
 * @param workspacePath Path to the workspace directory
 * @param repoPath Path to the repo to remove
 */
export async function removeRepoFromState(workspacePath: string, repoPath: string): Promise<void> {
  const state = await loadWorkspaceState(workspacePath);
  state.repos = state.repos.filter((r) => r.path !== repoPath);
  await saveWorkspaceState(workspacePath, state);
}

/**
 * Check if state is stale (last discovery was too long ago)
 *
 * @param state Current state
 * @param maxAgeMs Maximum age in milliseconds (default: 24 hours)
 * @returns true if state is stale
 */
export function isStateStale(state: WorkspaceState, maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  const lastDiscovery = new Date(state.lastDiscovery).getTime();
  const now = Date.now();
  return now - lastDiscovery > maxAgeMs;
}

/**
 * Convert WorkspaceRepoInfo to WorkspaceRepoState for persistence
 */
export function repoInfoToState(repo: WorkspaceRepoInfo): WorkspaceRepoState {
  return {
    path: repo.path,
    repoId: repo.repoId,
    hubStatus: repo.hubStatus,
    seedsLastModified: repo.seedsLastModified,
    // seedsHash would be computed if needed
  };
}

/**
 * Sync state with current workspace info
 *
 * Updates the persisted state to match current discovered repos.
 *
 * @param workspacePath Path to the workspace directory
 * @param repos Current repos from discovery
 * @returns Updated state
 */
export async function syncStateWithDiscovery(
  workspacePath: string,
  repos: WorkspaceRepoInfo[]
): Promise<WorkspaceState> {
  const state = await loadWorkspaceState(workspacePath);

  // Build a map of current repos
  const currentRepos = new Map<string, WorkspaceRepoInfo>();
  for (const repo of repos) {
    currentRepos.set(repo.path, repo);
  }

  // Update existing repos and remove ones that no longer exist
  const updatedRepos: WorkspaceRepoState[] = [];
  for (const repoState of state.repos) {
    const current = currentRepos.get(repoState.path);
    if (current) {
      // Update with current info, preserve hub status unless changed
      updatedRepos.push({
        ...repoState,
        repoId: current.repoId,
        seedsLastModified: current.seedsLastModified,
        // Keep hubStatus from state unless explicitly changed
      });
      currentRepos.delete(repoState.path);
    }
    // Else: repo no longer exists, don't add to updated list
  }

  // Add new repos
  for (const repo of currentRepos.values()) {
    updatedRepos.push(repoInfoToState(repo));
  }

  // Update state
  state.repos = updatedRepos;
  state.lastDiscovery = new Date().toISOString();

  await saveWorkspaceState(workspacePath, state);
  return state;
}

/**
 * Merge persisted state into discovered repos
 *
 * Updates WorkspaceRepoInfo with persisted hub status.
 *
 * @param repos Discovered repos
 * @param state Persisted state
 * @returns Repos with merged state
 */
export function mergeStateIntoRepos(
  repos: WorkspaceRepoInfo[],
  state: WorkspaceState
): WorkspaceRepoInfo[] {
  const stateByPath = new Map<string, WorkspaceRepoState>();
  for (const repoState of state.repos) {
    stateByPath.set(repoState.path, repoState);
  }

  return repos.map((repo) => {
    const persisted = stateByPath.get(repo.path);
    if (persisted) {
      return {
        ...repo,
        hubStatus: persisted.hubStatus as RepoHubStatus,
      };
    }
    return repo;
  });
}

/**
 * Get repos that have changed since last state save
 *
 * Compares seedsLastModified to detect changes.
 *
 * @param repos Current repos
 * @param state Persisted state
 * @returns Array of repos that have changed
 */
export function getChangedRepos(
  repos: WorkspaceRepoInfo[],
  state: WorkspaceState
): WorkspaceRepoInfo[] {
  const stateByPath = new Map<string, WorkspaceRepoState>();
  for (const repoState of state.repos) {
    stateByPath.set(repoState.path, repoState);
  }

  return repos.filter((repo) => {
    const persisted = stateByPath.get(repo.path);
    if (!persisted) {
      // New repo, consider it changed
      return true;
    }
    if (!repo.hasSeeds) {
      // No seeds, not relevant for hub
      return false;
    }
    // Compare modification times
    return repo.seedsLastModified !== persisted.seedsLastModified;
  });
}

/**
 * Mark repos as registered in hub
 *
 * @param workspacePath Path to the workspace directory
 * @param repoPaths Paths to repos that were registered
 */
export async function markReposAsRegistered(
  workspacePath: string,
  repoPaths: string[]
): Promise<void> {
  const state = await loadWorkspaceState(workspacePath);
  const pathSet = new Set(repoPaths);

  state.repos = state.repos.map((repo) => {
    if (pathSet.has(repo.path)) {
      return { ...repo, hubStatus: "registered" as RepoHubStatus };
    }
    return repo;
  });

  // Update hub metadata
  const registeredCount = state.repos.filter((r) => r.hubStatus === "registered").length;
  state.hub = {
    ...state.hub,
    lastRefresh: new Date().toISOString(),
    registeredCount,
  };

  await saveWorkspaceState(workspacePath, state);
}

/**
 * Check if workspace state file exists
 */
export async function stateFileExists(workspacePath: string): Promise<boolean> {
  try {
    const statePath = getStateFilePath(workspacePath);
    await fs.access(statePath);
    return true;
  } catch {
    return false;
  }
}
