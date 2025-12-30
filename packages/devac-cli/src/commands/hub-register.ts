/**
 * Hub Register Command Implementation
 *
 * Registers a repository with the central federation hub.
 * Enhanced to optionally analyze packages before registration.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type PackageSeedState,
  createCentralHub,
  detectRepoSeedStatus,
  discoverWorkspace,
  findWorkspaceDir,
  getPackagesNeedingAnalysis,
} from "@pietgk/devac-core";
import { analyzeCommand } from "./analyze.js";

/**
 * Hub register command options
 */
export interface HubRegisterOptions {
  /** Hub directory path */
  hubDir: string;
  /** Path to the repository to register */
  repoPath: string;
  /** Analyze packages without base seeds before registering (default: true) */
  analyze?: boolean;
  /** Register all repos in workspace (when repoPath is a workspace) */
  all?: boolean;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
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
  /** Number of packages that were analyzed */
  packagesAnalyzed?: number;
  /** Results per repo (for --all mode) */
  repos?: Array<{
    repoId: string;
    packages: number;
    crossRepoEdges: number;
    packagesAnalyzed: number;
  }>;
  /** User-facing message */
  message: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Analyze packages that need base seeds
 */
async function analyzePackagesWithoutSeeds(
  repoPath: string,
  packagesNeedingAnalysis: PackageSeedState[],
  onProgress?: (message: string) => void
): Promise<number> {
  let analyzed = 0;

  for (const pkg of packagesNeedingAnalysis) {
    const pkgName = pkg.packageName;
    onProgress?.(`Analyzing ${pkgName}...`);

    try {
      const result = await analyzeCommand({
        packagePath: pkg.packagePath,
        repoName: path.basename(repoPath),
        branch: "base",
        ifChanged: false,
        force: false,
      });

      if (result.success) {
        analyzed++;
        onProgress?.(`  ✓ ${pkgName}: ${result.nodesCreated} nodes, ${result.edgesCreated} edges`);
      } else {
        onProgress?.(`  ✗ ${pkgName}: ${result.error || "Analysis failed"}`);
      }
    } catch (err) {
      onProgress?.(`  ✗ ${pkgName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return analyzed;
}

/**
 * Register a single repository with the hub
 */
async function registerSingleRepo(
  hubDir: string,
  repoPath: string,
  analyze: boolean,
  onProgress?: (message: string) => void
): Promise<HubRegisterResult> {
  // Get seed status for the repo
  const seedStatus = await detectRepoSeedStatus(repoPath);
  const packagesNeedingAnalysis = getPackagesNeedingAnalysis(seedStatus);

  let packagesAnalyzed = 0;

  // Analyze packages without base seeds if requested
  if (analyze && packagesNeedingAnalysis.length > 0) {
    onProgress?.(
      `Found ${packagesNeedingAnalysis.length} package(s) needing analysis in ${seedStatus.repoId}`
    );
    packagesAnalyzed = await analyzePackagesWithoutSeeds(
      repoPath,
      packagesNeedingAnalysis,
      onProgress
    );
  }

  // Register with hub
  const hub = createCentralHub({ hubDir });

  try {
    await hub.init();
    const result = await hub.registerRepo(repoPath);

    return {
      success: true,
      repoId: result.repoId,
      packages: result.packages,
      crossRepoEdges: result.crossRepoEdges,
      packagesAnalyzed,
      message: `Registered ${result.repoId} with ${result.packages} package(s)${
        packagesAnalyzed > 0 ? ` (${packagesAnalyzed} newly analyzed)` : ""
      }`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      message: "Failed to register repository",
      error: errorMessage,
    };
  } finally {
    await hub.close();
  }
}

/**
 * Register all repositories in a workspace
 */
async function registerAllRepos(
  hubDir: string,
  workspacePath: string,
  analyze: boolean,
  onProgress?: (message: string) => void
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
  let totalAnalyzed = 0;
  let successCount = 0;

  for (const repo of workspace.repos) {
    onProgress?.(`\nProcessing ${repo.name}...`);

    const result = await registerSingleRepo(hubDir, repo.path, analyze, onProgress);

    if (result.success) {
      successCount++;
      totalPackages += result.packages ?? 0;
      totalEdges += result.crossRepoEdges ?? 0;
      totalAnalyzed += result.packagesAnalyzed ?? 0;

      results.push({
        repoId: result.repoId ?? repo.repoId,
        packages: result.packages ?? 0,
        crossRepoEdges: result.crossRepoEdges ?? 0,
        packagesAnalyzed: result.packagesAnalyzed ?? 0,
      });

      onProgress?.(`  ✓ ${result.message}`);
    } else {
      onProgress?.(`  ✗ ${repo.name}: ${result.error}`);
    }
  }

  const message =
    successCount === workspace.repos.length
      ? `Registered all ${successCount} repositories (${totalPackages} packages, ${totalAnalyzed} newly analyzed)`
      : `Registered ${successCount}/${workspace.repos.length} repositories`;

  return {
    success: successCount > 0,
    packages: totalPackages,
    crossRepoEdges: totalEdges,
    packagesAnalyzed: totalAnalyzed,
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
  const analyze = options.analyze !== false; // default to true
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

    return registerAllRepos(hubDir, workspaceDir, analyze, onProgress);
  }

  // Single repo registration
  return registerSingleRepo(hubDir, repoPath, analyze, onProgress);
}
