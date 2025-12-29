/**
 * Workspace Status
 *
 * Computes comprehensive status for a workspace or repository,
 * including seed states, hub registration status, and summary statistics.
 * Used by both CLI `devac status` and MCP `get_workspace_status` tool.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CentralHub } from "../hub/central-hub.js";
import {
  discoverWorkspace,
  findGitRoot,
  findWorkspaceDir,
  getGitBranch,
  getRepoId,
} from "./discover.js";
import { type RepoSeedStatus, detectRepoSeedStatus } from "./seed-state.js";
import type { RepoHubStatus } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for status computation
 */
export interface StatusOptions {
  /** Path to check (defaults to cwd) */
  path?: string;

  /** Include per-package details */
  full?: boolean;

  /** Whether to check seed states (default: true) */
  checkSeeds?: boolean;
}

/**
 * Status for a single repository
 */
export interface RepoStatus {
  /** Absolute path to the repository */
  path: string;

  /** Repository ID */
  repoId: string;

  /** Directory name */
  name: string;

  /** Whether this is a git worktree */
  isWorktree: boolean;

  /** Hub registration status */
  hubStatus: RepoHubStatus;

  /** Detailed seed status (when full=true) */
  seedStatus: RepoSeedStatus;

  /** Current git branch */
  branch?: string;
}

/**
 * Complete workspace status
 */
export interface WorkspaceStatus {
  /** Absolute path to the workspace directory */
  workspacePath: string;

  /** Whether this is a valid workspace (contains multiple repos) */
  isWorkspace: boolean;

  /** Path to the hub database */
  hubPath?: string;

  /** Whether the hub is initialized */
  hubInitialized: boolean;

  /** Status for each repository */
  repos: RepoStatus[];

  /** Summary statistics */
  summary: {
    /** Total number of repositories */
    totalRepos: number;

    /** Repositories with at least one analyzed package */
    reposWithSeeds: number;

    /** Repositories registered with the hub */
    reposRegistered: number;

    /** Total packages across all repos that are analyzed */
    packagesAnalyzed: number;

    /** Total packages that need analysis */
    packagesNeedAnalysis: number;
  };
}

// ============================================================================
// Status Functions
// ============================================================================

/**
 * Get status for a single repository
 */
export async function getRepoStatus(repoPath: string): Promise<RepoStatus> {
  const absolutePath = path.resolve(repoPath);
  const name = path.basename(absolutePath);
  const repoId = await getRepoId(absolutePath);
  const branch = await getGitBranch(absolutePath);

  // Check if worktree (has .git file instead of .git directory)
  let isWorktree = false;
  try {
    const gitPath = path.join(absolutePath, ".git");
    const stats = await fs.stat(gitPath);
    isWorktree = stats.isFile();
  } catch {
    // No .git, not a git repo
  }

  // Get seed status
  const seedStatus = await detectRepoSeedStatus(absolutePath);

  return {
    path: absolutePath,
    repoId,
    name,
    isWorktree,
    hubStatus: "unregistered", // Will be updated by caller if hub is available
    seedStatus,
    branch: branch ?? undefined,
  };
}

/**
 * Get comprehensive workspace status
 *
 * Handles multiple contexts:
 * - Workspace directory (contains multiple repos)
 * - Single repo directory
 * - Subdirectory within a repo
 */
export async function getWorkspaceStatus(options: StatusOptions = {}): Promise<WorkspaceStatus> {
  const targetPath = path.resolve(options.path || process.cwd());
  const checkSeeds = options.checkSeeds !== false;

  // Try to find workspace directory
  const workspaceDir = await findWorkspaceDir(targetPath);
  const isWorkspace = workspaceDir !== null;

  // Determine the effective path to analyze
  let effectivePath: string;
  if (isWorkspace && workspaceDir) {
    effectivePath = workspaceDir;
  } else {
    // Not in a workspace - check if we're in a repo
    const gitRoot = await findGitRoot(targetPath);
    effectivePath = gitRoot || targetPath;
  }

  // Check hub status
  const hubDir = path.join(isWorkspace && workspaceDir ? workspaceDir : effectivePath, ".devac");
  const hubPath = path.join(hubDir, "central.duckdb");
  const hubInitialized = await fileExists(hubPath);

  // Get registered repos from hub (if available)
  const registeredRepoIds = new Set<string>();
  if (hubInitialized) {
    try {
      const hub = new CentralHub({ hubDir });
      await hub.init();
      const repos = await hub.listRepos();
      for (const repo of repos) {
        registeredRepoIds.add(repo.repoId);
      }
      await hub.close();
    } catch {
      // Hub exists but couldn't connect
    }
  }

  // Discover and analyze repos
  const repos: RepoStatus[] = [];

  if (isWorkspace && workspaceDir) {
    // Workspace mode: analyze all repos
    const workspace = await discoverWorkspace(workspaceDir, { checkSeeds: false });

    for (const repoInfo of workspace.repos) {
      const seedStatus = checkSeeds
        ? await detectRepoSeedStatus(repoInfo.path)
        : createEmptySeedStatus(repoInfo.path, repoInfo.repoId);

      repos.push({
        path: repoInfo.path,
        repoId: repoInfo.repoId,
        name: repoInfo.name,
        isWorktree: repoInfo.isWorktree,
        hubStatus: registeredRepoIds.has(repoInfo.repoId) ? "registered" : "unregistered",
        seedStatus,
        branch: repoInfo.branch,
      });
    }
  } else {
    // Single repo mode
    const gitRoot = await findGitRoot(targetPath);
    if (gitRoot) {
      const repoStatus = await getRepoStatus(gitRoot);
      repoStatus.hubStatus = registeredRepoIds.has(repoStatus.repoId)
        ? "registered"
        : "unregistered";
      repos.push(repoStatus);
    }
  }

  // Compute summary
  const summary = computeSummary(repos);

  return {
    workspacePath: effectivePath,
    isWorkspace,
    hubPath: hubInitialized ? hubPath : undefined,
    hubInitialized,
    repos,
    summary,
  };
}

/**
 * Format workspace status for CLI output (brief format)
 */
export function formatStatusBrief(status: WorkspaceStatus): string {
  const lines: string[] = [];

  if (status.isWorkspace) {
    lines.push(`Workspace: ${status.workspacePath}`);
  } else {
    lines.push(`Repository: ${status.workspacePath}`);
  }

  lines.push("");
  lines.push("Seed Status:");

  for (const repo of status.repos) {
    const { summary } = repo.seedStatus;
    const analyzed = summary.base + summary.both;
    const total = summary.total;

    let statusStr: string;
    if (total === 0) {
      statusStr = "no packages";
    } else if (analyzed === total) {
      statusStr = `${analyzed} package${analyzed !== 1 ? "s" : ""} analyzed`;
    } else if (analyzed === 0) {
      statusStr = "not analyzed";
    } else {
      statusStr = `${analyzed}/${total} analyzed`;
    }

    const hubStr = repo.hubStatus === "registered" ? " (registered)" : "";
    lines.push(`  ${repo.name}${hubStr}: ${statusStr}`);
  }

  if (status.hubInitialized) {
    lines.push("");
    lines.push(`Hub: ${status.summary.reposRegistered} repos registered`);
  } else {
    lines.push("");
    lines.push("Hub: not initialized");
  }

  return lines.join("\n");
}

/**
 * Format workspace status for CLI output (full format)
 */
export function formatStatusFull(status: WorkspaceStatus): string {
  const lines: string[] = [];

  lines.push("SEED STATUS");
  lines.push("─".repeat(50));

  for (const repo of status.repos) {
    const hubStr =
      repo.hubStatus === "registered"
        ? "(registered)"
        : repo.hubStatus === "pending"
          ? "(pending)"
          : "(unregistered)";

    lines.push(`${repo.name} ${hubStr}`);

    if (repo.seedStatus.packages.length === 0) {
      lines.push("  No packages detected");
    } else {
      for (const pkg of repo.seedStatus.packages) {
        const stateStr = formatSeedState(pkg.state);
        const dateStr = pkg.baseLastModified ? pkg.baseLastModified.split("T")[0] : "";

        let details = "";
        if (pkg.state === "none") {
          details = `run: devac analyze -p ${path.relative(status.workspacePath, pkg.packagePath)}`;
        } else if (pkg.state === "both" && pkg.deltaLastModified) {
          const branchDate = pkg.deltaLastModified.split("T")[0];
          details = `base: ${dateStr}, delta: ${branchDate}`;
        } else if (dateStr) {
          details = dateStr;
        }

        const pkgName = pkg.packageName.padEnd(20);
        lines.push(`  ${pkgName} [${stateStr}]  ${details}`);
      }
    }

    lines.push("");
  }

  // Summary
  lines.push("SUMMARY");
  lines.push("─".repeat(50));
  lines.push(`  Repositories:       ${status.summary.totalRepos}`);
  lines.push(`  With seeds:         ${status.summary.reposWithSeeds}`);
  lines.push(`  Registered in hub:  ${status.summary.reposRegistered}`);
  lines.push(`  Packages analyzed:  ${status.summary.packagesAnalyzed}`);
  lines.push(`  Packages pending:   ${status.summary.packagesNeedAnalysis}`);

  return lines.join("\n");
}

// ============================================================================
// Helper Functions
// ============================================================================

function computeSummary(repos: RepoStatus[]): WorkspaceStatus["summary"] {
  let reposWithSeeds = 0;
  let reposRegistered = 0;
  let packagesAnalyzed = 0;
  let packagesNeedAnalysis = 0;

  for (const repo of repos) {
    const { summary } = repo.seedStatus;
    const analyzed = summary.base + summary.both;

    if (analyzed > 0) {
      reposWithSeeds++;
    }

    if (repo.hubStatus === "registered") {
      reposRegistered++;
    }

    packagesAnalyzed += analyzed;
    packagesNeedAnalysis += summary.none + summary.delta;
  }

  return {
    totalRepos: repos.length,
    reposWithSeeds,
    reposRegistered,
    packagesAnalyzed,
    packagesNeedAnalysis,
  };
}

function createEmptySeedStatus(repoPath: string, repoId: string): RepoSeedStatus {
  return {
    repoPath,
    repoId,
    packages: [],
    summary: { total: 0, none: 0, base: 0, delta: 0, both: 0 },
  };
}

function formatSeedState(state: string): string {
  switch (state) {
    case "none":
      return "none ";
    case "base":
      return "base ";
    case "delta":
      return "delta";
    case "both":
      return "both ";
    default:
      return state.padEnd(5);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
