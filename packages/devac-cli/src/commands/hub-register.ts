/**
 * Hub Register Command Implementation
 *
 * Registers a repository with the central federation hub.
 * Note: Use `devac sync` to analyze packages and register in one step.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHubClient, discoverWorkspace, findWorkspaceDir } from "@pietgk/devac-core";

/**
 * Hub register command options
 */
export interface HubRegisterOptions {
  /** Hub directory path */
  hubDir: string;
  /** Path to the repository to register */
  repoPath: string;
  /** Register all repos in workspace (when repoPath is a workspace) */
  all?: boolean;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
  /** Skip hub location validation (for tests only) */
  skipValidation?: boolean;
}

/**
 * Hub register command result
 */
export interface HubRegisterResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Repository ID (for single repo) */
  repoId?: string;
  /** Number of packages registered */
  packages?: number;
  /** Number of cross-repo edges extracted */
  crossRepoEdges?: number;
  /** Results per repo (for --all mode) */
  repos?: Array<{
    repoId: string;
    packages: number;
    crossRepoEdges: number;
  }>;
  /** User-facing message */
  message: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Register a single repository with the hub
 */
async function registerSingleRepo(
  hubDir: string,
  repoPath: string,
  onProgress?: (message: string) => void,
  skipValidation?: boolean
): Promise<HubRegisterResult> {
  // Register with hub (delegates to MCP if running, otherwise direct)
  const client = createHubClient({ hubDir, skipValidation });

  try {
    const result = await client.registerRepo(repoPath);

    onProgress?.(`Registered ${result.repoId} with ${result.packages} package(s)`);

    return {
      success: true,
      repoId: result.repoId,
      packages: result.packages,
      crossRepoEdges: result.crossRepoEdges,
      message: `Registered ${result.repoId} with ${result.packages} package(s)`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      message: "Failed to register repository",
      error: errorMessage,
    };
  }
}

/**
 * Register all repositories in a workspace
 */
async function registerAllRepos(
  hubDir: string,
  workspacePath: string,
  onProgress?: (message: string) => void,
  skipValidation?: boolean
): Promise<HubRegisterResult> {
  // Discover all repos in workspace
  const workspace = await discoverWorkspace(workspacePath, { checkSeeds: false });

  if (!workspace.isWorkspace || workspace.repos.length === 0) {
    return {
      success: false,
      message: "No repositories found in workspace",
      error: `${workspacePath} is not a valid workspace or contains no repositories`,
    };
  }

  onProgress?.(`Found ${workspace.repos.length} repositories in workspace`);

  const results: HubRegisterResult["repos"] = [];
  let totalPackages = 0;
  let totalEdges = 0;
  let successCount = 0;

  for (const repo of workspace.repos) {
    onProgress?.(`\nProcessing ${repo.name}...`);

    const result = await registerSingleRepo(hubDir, repo.path, onProgress, skipValidation);

    if (result.success) {
      successCount++;
      totalPackages += result.packages ?? 0;
      totalEdges += result.crossRepoEdges ?? 0;

      results.push({
        repoId: result.repoId ?? repo.repoId,
        packages: result.packages ?? 0,
        crossRepoEdges: result.crossRepoEdges ?? 0,
      });

      onProgress?.(`  ✓ ${result.message}`);
    } else {
      onProgress?.(`  ✗ ${repo.name}: ${result.error}`);
    }
  }

  const message =
    successCount === workspace.repos.length
      ? `Registered all ${successCount} repositories (${totalPackages} packages)`
      : `Registered ${successCount}/${workspace.repos.length} repositories`;

  return {
    success: successCount > 0,
    packages: totalPackages,
    crossRepoEdges: totalEdges,
    repos: results,
    message,
    error: successCount === 0 ? "No repositories were registered successfully" : undefined,
  };
}

/**
 * Register a repository (or all repositories) with the hub
 */
export async function hubRegister(options: HubRegisterOptions): Promise<HubRegisterResult> {
  const { hubDir, repoPath, onProgress } = options;
  const all = options.all ?? false;

  // Validate repo path exists
  const repoExists = await fs
    .access(repoPath)
    .then(() => true)
    .catch(() => false);

  if (!repoExists) {
    return {
      success: false,
      message: "Repository path does not exist",
      error: `Repository path does not exist: ${repoPath}`,
    };
  }

  // Check if hub is initialized
  const hubPath = path.join(hubDir, "central.duckdb");
  const hubExists = await fs
    .access(hubPath)
    .then(() => true)
    .catch(() => false);

  if (!hubExists) {
    return {
      success: false,
      message: "Hub not initialized",
      error: `Hub not initialized at ${hubDir}. Run 'devac hub init' first.`,
    };
  }

  // If --all flag, find workspace and register all repos
  if (all) {
    const workspaceDir = await findWorkspaceDir(repoPath);
    if (!workspaceDir) {
      return {
        success: false,
        message: "Not in a workspace",
        error: `${repoPath} is not in a workspace. Use without --all to register a single repository.`,
      };
    }

    return registerAllRepos(hubDir, workspaceDir, onProgress, options.skipValidation);
  }

  // Single repo registration
  return registerSingleRepo(hubDir, repoPath, onProgress, options.skipValidation);
}
