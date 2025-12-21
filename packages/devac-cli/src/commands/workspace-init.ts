/**
 * Workspace Init Command
 *
 * Initializes workspace configuration and optionally
 * registers all repos with the hub.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type WorkspaceConfig,
  createCentralHub,
  discoverWorkspace,
  saveWorkspaceState,
} from "@pietgk/devac-core";

/**
 * Workspace init command options
 */
export interface WorkspaceInitOptions {
  /** Workspace path (defaults to current directory) */
  workspacePath: string;

  /** Whether to auto-refresh hub on seed changes */
  autoRefresh?: boolean;

  /** Whether to register all repos with hub */
  registerRepos?: boolean;

  /** Force overwrite existing config */
  force?: boolean;
}

/**
 * Workspace init command result
 */
export interface WorkspaceInitResult {
  /** Whether the command succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Whether config was created */
  configCreated: boolean;

  /** Whether hub was initialized */
  hubInitialized: boolean;

  /** Number of repos registered */
  reposRegistered: number;

  /** Paths created */
  paths: {
    config: string;
    state: string;
    hub: string;
  };
}

/**
 * Execute workspace init command
 */
export async function workspaceInit(options: WorkspaceInitOptions): Promise<WorkspaceInitResult> {
  const workspacePath = path.resolve(options.workspacePath);
  const devacDir = path.join(workspacePath, ".devac");
  const configPath = path.join(devacDir, "workspace.json");
  const statePath = path.join(devacDir, "state.json");
  const hubPath = path.join(devacDir, "hub.duckdb");

  const result: WorkspaceInitResult = {
    success: false,
    configCreated: false,
    hubInitialized: false,
    reposRegistered: 0,
    paths: {
      config: configPath,
      state: statePath,
      hub: hubPath,
    },
  };

  try {
    // Check if workspace directory exists
    const info = await discoverWorkspace(workspacePath);
    if (!info.isWorkspace) {
      result.error =
        "Not a workspace directory. A workspace must contain at least one git repository.";
      return result;
    }

    // Check for existing config
    let configExists = false;
    try {
      await fs.access(configPath);
      configExists = true;
    } catch {
      // Config doesn't exist
    }

    if (configExists && !options.force) {
      result.error = "Workspace already initialized. Use --force to overwrite.";
      return result;
    }

    // Create .devac directory
    await fs.mkdir(devacDir, { recursive: true });

    // Create config file
    const config: WorkspaceConfig = {
      version: "1.0",
      hub: {
        autoRefresh: options.autoRefresh ?? true,
        refreshDebounceMs: 500,
      },
      watcher: {
        autoStart: false,
      },
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    result.configCreated = true;

    // Initialize state
    await saveWorkspaceState(workspacePath, {
      version: "1.0",
      lastDiscovery: new Date().toISOString(),
      repos: info.repos.map((r) => ({
        path: r.path,
        repoId: r.repoId,
        hubStatus: "unregistered" as const,
        seedsLastModified: r.seedsLastModified,
      })),
    });

    // Initialize hub
    const hub = createCentralHub({ hubDir: devacDir });
    await hub.init({ force: options.force });
    result.hubInitialized = true;

    // Register repos if requested
    if (options.registerRepos) {
      for (const repo of info.repos) {
        if (repo.hasSeeds) {
          try {
            await hub.registerRepo(repo.path);
            result.reposRegistered++;
          } catch {
            // Skip repos that fail to register
          }
        }
      }
    }

    await hub.close();

    result.success = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}
