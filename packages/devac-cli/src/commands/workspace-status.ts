/**
 * Workspace Status Command
 *
 * Shows workspace information including discovered repos,
 * worktrees, and hub status.
 */

import {
  type WorkspaceInfo,
  type WorkspaceManagerStats,
  createWorkspaceManager,
} from "@pietgk/devac-core";

/**
 * Workspace status command options
 */
export interface WorkspaceStatusOptions {
  /** Workspace path (defaults to current directory) */
  workspacePath: string;

  /** Output as JSON */
  json?: boolean;

  /** Include hub details */
  hubDetails?: boolean;
}

/**
 * Workspace status command result
 */
export interface WorkspaceStatusResult {
  /** Whether the command succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Workspace info */
  info?: WorkspaceInfo;

  /** Manager stats */
  stats?: WorkspaceManagerStats;

  /** Formatted output */
  formatted?: string;
}

/**
 * Format workspace info for display
 */
function formatInfo(info: WorkspaceInfo, stats: WorkspaceManagerStats): string {
  const lines: string[] = [];

  if (!info.isWorkspace) {
    lines.push("Not a workspace directory");
    lines.push(`Path: ${info.workspacePath}`);
    lines.push("");
    lines.push("A workspace is a parent directory containing multiple git repositories.");
    return lines.join("\n");
  }

  lines.push("Workspace");
  lines.push(`📁 ${info.workspacePath}`);
  lines.push("");

  // Stats summary
  lines.push("Overview:");
  lines.push(`  Repositories: ${stats.reposDiscovered}`);
  lines.push(`  With seeds: ${stats.reposWithSeeds}`);
  lines.push(`  Registered: ${stats.reposRegistered}`);
  lines.push("");

  // Main repos
  if (info.mainRepos.length > 0) {
    lines.push("Repositories:");
    for (const repo of info.mainRepos) {
      const seedIcon = repo.hasSeeds ? "📦" : "  ";
      const hubIcon =
        repo.hubStatus === "registered" ? "🔗" : repo.hubStatus === "pending" ? "⏳" : "";
      lines.push(`  ${seedIcon} ${repo.name} ${hubIcon}`);
      if (repo.branch) {
        lines.push(`     └ branch: ${repo.branch}`);
      }
    }
    lines.push("");
  }

  // Worktrees by issue
  if (info.worktreesByIssue.size > 0) {
    lines.push("Issue Worktrees:");
    for (const [issueId, worktrees] of info.worktreesByIssue) {
      lines.push(`  Issue ${issueId}:`);
      for (const wt of worktrees) {
        const seedIcon = wt.hasSeeds ? "📦" : "  ";
        lines.push(`    ${seedIcon} ${wt.name}`);
      }
    }
    lines.push("");
  }

  // Hub info
  lines.push(`Hub: ${info.hubPath}`);

  return lines.join("\n");
}

/**
 * Execute workspace status command
 */
export async function workspaceStatus(
  options: WorkspaceStatusOptions
): Promise<WorkspaceStatusResult> {
  const manager = createWorkspaceManager({
    workspacePath: options.workspacePath,
  });

  try {
    const info = await manager.initialize();
    const stats = manager.getStats();

    await manager.dispose();

    if (options.json) {
      return {
        success: true,
        info,
        stats,
      };
    }

    return {
      success: true,
      info,
      stats,
      formatted: formatInfo(info, stats),
    };
  } catch (error) {
    await manager.dispose().catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
